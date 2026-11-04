/* global Chessboard, LiveArrows */

(() => {
  'use strict';

  const RECONNECT_DELAY_MS = 2000;

  let board = null;
  let reconnectTimer = null;
  let latestState = null;

  function setConnectionStatus(text, isOnline) {
    const el = document.getElementById('connection-status');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('online', isOnline);
    el.classList.toggle('offline', !isOnline);
  }

  function parseScore(entry) {
    if (!entry || typeof entry !== 'object') return '';
    const score = Number(entry.score || 0);
    if (entry.isMate) {
      const signed = score > 0 ? `+${score}` : String(score);
      return `M${signed}`;
    }
    const cp = (score / 100).toFixed(2);
    return score > 0 ? `+${cp}` : cp;
  }

  function renderMoveLines(moves) {
    const linesEl = document.getElementById('move-lines');
    if (!linesEl) return;
    linesEl.textContent = '';

    moves.forEach((entry, index) => {
      if (!entry || typeof entry.move !== 'string') return;
      const item = document.createElement('li');
      item.textContent = `#${index + 1} ${entry.move} (${parseScore(entry)})`;
      linesEl.appendChild(item);
    });
  }

  function applyAnalysis(payload) {
    if (!payload || typeof payload.fen !== 'string' || !board) return;

    latestState = payload;
    board.position(payload.fen, false);

    const moves = Array.isArray(payload.moves) ? payload.moves.slice(0, 3) : [];
    renderMoveLines(moves);

    const topMove = document.getElementById('top-move');
    if (topMove) {
      topMove.textContent = payload.recommendedMove || (moves[0] && moves[0].move) || '—';
    }

    const engineDepth = document.getElementById('engine-depth');
    if (engineDepth) {
      const engine = typeof payload.engine === 'string' ? payload.engine : 'maia3';
      const depth = Number(payload.depth || 1);
      engineDepth.textContent = `${engine} depth: ${depth}`;
    }

    const lastUpdate = document.getElementById('last-update');
    if (lastUpdate) {
      lastUpdate.textContent = `Last update: ${new Date().toLocaleTimeString()}`;
    }

    const orientation = typeof board.orientation === 'function' ? board.orientation() : 'white';
    window.requestAnimationFrame(() => {
      LiveArrows.drawArrows(moves, orientation);
    });
  }

  async function loadCurrentState() {
    try {
      const response = await fetch('/api/state', { cache: 'no-store' });
      if (!response.ok) return;
      const payload = await response.json();
      if (payload && payload.fen) {
        applyAnalysis(payload);
      }
    } catch (_err) {
      // best-effort preload only
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connectSocket();
    }, RECONNECT_DELAY_MS);
  }

  function connectSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);

    socket.addEventListener('open', () => {
      setConnectionStatus('Live feed connected', true);
    });

    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);
        const payload = message && message.type === 'analysis' ? message.data : message;
        applyAnalysis(payload);
      } catch (_err) {
        // ignore malformed payloads
      }
    });

    socket.addEventListener('error', () => {
      socket.close();
    });

    socket.addEventListener('close', () => {
      setConnectionStatus('Disconnected, retrying…', false);
      scheduleReconnect();
    });
  }

  function drawLatestArrows() {
    if (!latestState) return;
    const orientation = typeof board.orientation === 'function' ? board.orientation() : 'white';
    const moves = Array.isArray(latestState.moves) ? latestState.moves.slice(0, 3) : [];
    LiveArrows.drawArrows(moves, orientation);
  }

  function initialize() {
    board = Chessboard('board', {
      draggable: false,
      showNotation: true,
      position: 'start',
      pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
    });

    const boardShell = document.getElementById('board-shell');
    LiveArrows.initArrowLayer(boardShell);
    setConnectionStatus('Connecting to live feed…', false);

    window.addEventListener('resize', () => {
      window.requestAnimationFrame(drawLatestArrows);
    });

    loadCurrentState();
    connectSocket();
  }

  window.addEventListener('DOMContentLoaded', initialize);
})();
