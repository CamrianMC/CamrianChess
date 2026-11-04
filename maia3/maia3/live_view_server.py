"""Live Maia3 viewer server for phones and other LAN clients.

Serves a small Chessboard.js webpage and streams Maia3 recommendations to
connected browsers over WebSockets.

Run from the maia3 project root:
    python -m maia3.live_view_server --host 0.0.0.0 --port 8780
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from aiohttp import web


VIEWER_ASSET_DIR = Path(__file__).resolve().parent / "viewer_static"
MAX_MOVES = 3


@dataclass
class ViewerState:
    latest: dict[str, Any] | None = None
    clients: set[web.WebSocketResponse] = field(default_factory=set)

    async def broadcast(self, payload: dict[str, Any]) -> None:
        stale_clients: list[web.WebSocketResponse] = []
        for client in tuple(self.clients):
            if client.closed:
                stale_clients.append(client)
                continue
            try:
                await client.send_json({"type": "analysis", "data": payload})
            except Exception:  # pylint: disable=broad-except
                stale_clients.append(client)

        for client in stale_clients:
            self.clients.discard(client)


def _parse_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _normalize_moves(raw_moves: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_moves, list):
        return []

    normalized: list[dict[str, Any]] = []
    for raw_entry in raw_moves[:MAX_MOVES]:
        if not isinstance(raw_entry, dict):
            continue
        move = raw_entry.get("move")
        if not isinstance(move, str) or len(move) < 4:
            continue

        normalized.append(
            {
                "move": move,
                "score": _parse_int(raw_entry.get("score"), 0),
                "isMate": bool(raw_entry.get("isMate")),
                "pv": raw_entry.get("pv") if isinstance(raw_entry.get("pv"), str) else move,
            }
        )
    return normalized


def normalize_update(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object.")

    fen = payload.get("fen")
    if not isinstance(fen, str) or not fen.strip():
        raise ValueError("Missing or invalid 'fen'.")

    moves = _normalize_moves(payload.get("moves"))
    top_move = moves[0]["move"] if moves else None

    return {
        "fen": fen,
        "moves": moves,
        "depth": max(1, _parse_int(payload.get("depth"), 1)),
        "engine": payload.get("engine") if isinstance(payload.get("engine"), str) else "maia3",
        "recommendedMove": top_move,
    }


def build_app() -> web.Application:
    app = web.Application()
    app["viewer_state"] = ViewerState()

    async def index_handler(_request: web.Request) -> web.Response:
        return web.FileResponse(VIEWER_ASSET_DIR / "index.html")

    async def board_js_handler(_request: web.Request) -> web.Response:
        return web.FileResponse(VIEWER_ASSET_DIR / "board.js")

    async def arrows_js_handler(_request: web.Request) -> web.Response:
        return web.FileResponse(VIEWER_ASSET_DIR / "arrows.js")

    async def health_handler(request: web.Request) -> web.Response:
        state: ViewerState = request.app["viewer_state"]
        return web.json_response(
            {
                "ok": True,
                "clients": len(state.clients),
                "hasState": state.latest is not None,
            }
        )

    async def state_handler(request: web.Request) -> web.Response:
        state: ViewerState = request.app["viewer_state"]
        return web.json_response(state.latest or {})

    async def publish_handler(request: web.Request) -> web.Response:
        state: ViewerState = request.app["viewer_state"]
        try:
            payload = await request.json()
            update = normalize_update(payload)
        except ValueError as exc:
            return web.json_response({"error": str(exc)}, status=400)
        except Exception as exc:  # pylint: disable=broad-except
            return web.json_response({"error": f"Invalid JSON: {exc}"}, status=400)

        state.latest = update
        await state.broadcast(update)
        return web.json_response({"ok": True, "clients": len(state.clients)})

    async def ws_handler(request: web.Request) -> web.StreamResponse:
        state: ViewerState = request.app["viewer_state"]
        ws = web.WebSocketResponse(heartbeat=30)
        await ws.prepare(request)

        state.clients.add(ws)
        if state.latest is not None:
            await ws.send_json({"type": "analysis", "data": state.latest})

        try:
            async for message in ws:
                if message.type == web.WSMsgType.TEXT and message.data == "ping":
                    await ws.send_str("pong")
                elif message.type in (web.WSMsgType.CLOSE, web.WSMsgType.CLOSED):
                    break
                elif message.type == web.WSMsgType.ERROR:
                    break
        finally:
            state.clients.discard(ws)

        return ws

    app.router.add_get("/", index_handler)
    app.router.add_get("/board.js", board_js_handler)
    app.router.add_get("/arrows.js", arrows_js_handler)
    app.router.add_get("/health", health_handler)
    app.router.add_get("/api/state", state_handler)
    app.router.add_post("/publish", publish_handler)
    app.router.add_get("/ws", ws_handler)
    return app


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Maia3 live viewer WebSocket server")
    parser.add_argument(
        "--host",
        default="0.0.0.0",
        help="Host to bind (use 0.0.0.0 for LAN devices)",
    )
    parser.add_argument("--port", type=int, default=8780, help="Port to bind")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    app = build_app()
    print(
        f"Maia3 live viewer listening on http://{args.host}:{args.port} "
        "(publish endpoint: /publish, websocket: /ws)",
        flush=True,
    )
    web.run_app(app, host=args.host, port=args.port, print=None)


if __name__ == "__main__":
    main()
