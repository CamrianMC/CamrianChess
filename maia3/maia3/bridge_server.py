"""Local HTTP bridge that exposes Maia3 UCI analysis to the browser extension.

Run from the maia3 project root:
    python -m maia3.bridge_server --model maia3-5m

The extension posts FEN positions to /analyze and receives top moves in a
Stockfish-like shape expected by the existing UI.
"""

from __future__ import annotations

import argparse
import atexit
import json
import shutil
import sys
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import chess
import chess.engine


class MaiaBridge:
    """Thread-safe wrapper around a long-lived Maia3 UCI process."""

    def __init__(self, model: str) -> None:
        self.model = model
        self._lock = threading.Lock()
        launcher = shutil.which("maia3-uci")
        command = (
            [launcher, "--model", model, "--use-uci-history", "--temperature", "0"]
            if launcher
            else [
                sys.executable,
                "-m",
                "maia3.uci",
                "--model",
                model,
                "--use-uci-history",
                "--temperature",
                "0",
            ]
        )
        self._engine = chess.engine.SimpleEngine.popen_uci(
            command
        )

    def close(self) -> None:
        with self._lock:
            if self._engine is not None:
                self._engine.quit()
                self._engine = None

    def analyze(self, fen: str, multipv: int, depth: int) -> dict[str, Any]:
        board = chess.Board(fen)
        lines = max(1, min(3, int(multipv)))

        with self._lock:
            if self._engine is None:
                raise RuntimeError("Engine is not running")

            # Maia3 itself does not iterate search depth like Stockfish, but we
            # keep a depth-compatible UI field for the extension.
            infos = self._engine.analyse(
                board,
                chess.engine.Limit(nodes=1),
                multipv=lines,
                info=chess.engine.INFO_SCORE | chess.engine.INFO_PV,
            )

        if isinstance(infos, dict):
            infos = [infos]

        moves: list[dict[str, Any]] = []
        for info in infos:
            pv = info.get("pv") or []
            if not pv:
                continue

            score_cp = 0
            is_mate = False
            raw_score = info.get("score")
            if raw_score is not None:
                pov_score = raw_score.pov(board.turn)
                mate_distance = pov_score.mate()
                if mate_distance is not None:
                    score_cp = int(mate_distance)
                    is_mate = True
                else:
                    score_cp = int(pov_score.score(mate_score=100000) or 0)

            moves.append(
                {
                    "move": pv[0].uci(),
                    "score": score_cp,
                    "isMate": is_mate,
                    "pv": " ".join(move.uci() for move in pv[:5]),
                }
            )

        top_move = moves[0]["move"] if moves else "(no-move)"
        print(
            f"[maia3-bridge] fen={fen} recommended={top_move} multipv={lines}",
            flush=True,
        )

        return {
            "engine": "maia3",
            "depth": max(1, int(depth) if depth else 1),
            "moves": moves,
        }


def make_handler(bridge: MaiaBridge):
    class MaiaBridgeHandler(BaseHTTPRequestHandler):
        def _send_json(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
            self.end_headers()
            self.wfile.write(body)

        def do_OPTIONS(self) -> None:  # noqa: N802
            self._send_json(HTTPStatus.OK, {"ok": True})

        def do_GET(self) -> None:  # noqa: N802
            if self.path != "/health":
                self._send_json(HTTPStatus.NOT_FOUND, {"error": "not-found"})
                return
            self._send_json(HTTPStatus.OK, {"ok": True, "engine": "maia3"})

        def do_POST(self) -> None:  # noqa: N802
            if self.path != "/analyze":
                self._send_json(HTTPStatus.NOT_FOUND, {"error": "not-found"})
                return

            try:
                content_length = int(self.headers.get("Content-Length", "0"))
                raw_body = self.rfile.read(content_length)
                request_data = json.loads(raw_body.decode("utf-8"))

                fen = request_data.get("fen")
                if not isinstance(fen, str) or not fen.strip():
                    raise ValueError("Missing or invalid 'fen'")

                multipv = request_data.get("multipv", 3)
                depth = request_data.get("depth", 1)
                result = bridge.analyze(fen, multipv=multipv, depth=depth)
                self._send_json(HTTPStatus.OK, result)
            except Exception as exc:  # pylint: disable=broad-except
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})

        def log_message(self, *_args: Any) -> None:
            # Keep bridge output clean unless explicit debugging is needed.
            return

    return MaiaBridgeHandler


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Maia3 localhost bridge server")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind")
    parser.add_argument("--port", type=int, default=8765, help="Port to bind")
    parser.add_argument("--model", default="maia3-5m", help="Model alias or repo")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    bridge = MaiaBridge(model=args.model)
    atexit.register(bridge.close)

    server = ThreadingHTTPServer((args.host, args.port), make_handler(bridge))
    print(
        f"Maia3 bridge listening on http://{args.host}:{args.port} using model {args.model}",
        flush=True,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        bridge.close()


if __name__ == "__main__":
    main()
