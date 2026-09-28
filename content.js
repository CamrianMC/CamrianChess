// Content Script - Chess.com Position Analyzer

(function () {
    'use strict';

    const ARROW_COLORS = ['#32CD32', '#FFA500', '#FFD700'];

    const PIECE_MAP = {
        'wp': 'P', 'wn': 'N', 'wb': 'B', 'wr': 'R', 'wq': 'Q', 'wk': 'K',
        'bp': 'p', 'bn': 'n', 'bb': 'b', 'br': 'r', 'bq': 'q', 'bk': 'k'
    };

    // Settings
    let settings = { enabled: true, depth: 15, showArrows: true, multipv: 3, engine: 'stockfish' };

    // State
    let lastFen = '';
    let drawnFen = '';            // placement we have actually drawn arrows for (self-heal tracking)
    let cachedOrientation = null;
    let arrowsSvg = null;
    let latestAnalysis = null;

    // Load settings
    function loadSettings() {
        chrome.storage.local.get(['enabled', 'depth', 'showArrows', 'multipv', 'engine'], (result) => {
            settings.enabled = result.enabled !== false;
            settings.depth = result.depth || 15;
            settings.showArrows = result.showArrows !== false;
            settings.multipv = result.multipv || 3;
            settings.engine = result.engine === 'maia3' ? 'maia3' : 'stockfish';
        });
    }

    // Get board context
    function getBoardContext() {
        const board = document.querySelector('wc-chess-board');
        if (!board) return null;

        if (board.shadowRoot) {
            const pieces = board.shadowRoot.querySelectorAll('.piece');
            if (pieces.length > 0) return { root: board.shadowRoot, board, type: 'shadow' };
        }

        const pieces = board.querySelectorAll('.piece');
        if (pieces.length > 0) return { root: board, board, type: 'light' };

        const docPieces = document.querySelectorAll('.piece');
        if (docPieces.length > 0) return { root: document, board, type: 'document' };

        return null;
    }

    // Create SVG container for arrows
    function createArrowsContainer() {
        if (arrowsSvg && arrowsSvg.isConnected) return;

        const context = getBoardContext();
        if (!context) return;

        let boardElement = context.board;
        if (context.type === 'shadow') {
            boardElement = context.root.querySelector('.board') || context.board;
        }

        arrowsSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        arrowsSvg.id = 'stockfish-arrows';
        arrowsSvg.setAttribute('viewBox', '0 0 100 100');
        arrowsSvg.style.cssText = `
            position: absolute; top: 0; left: 0;
            width: 100%; height: 100%;
            pointer-events: none; z-index: 100;
        `;

        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        ARROW_COLORS.forEach((color, i) => {
            const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
            marker.setAttribute('id', `arrow-head-${i}`);
            marker.setAttribute('markerWidth', '4');
            marker.setAttribute('markerHeight', '4');
            marker.setAttribute('refX', '0');
            marker.setAttribute('refY', '2');
            marker.setAttribute('orient', 'auto');

            const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            polygon.setAttribute('points', '0,0 4,2 0,4');
            polygon.setAttribute('fill', color);
            polygon.setAttribute('fill-opacity', String(0.7 - i * 0.1));

            marker.appendChild(polygon);
            defs.appendChild(marker);
        });
        arrowsSvg.appendChild(defs);

        boardElement.style.position = 'relative';
        boardElement.appendChild(arrowsSvg);
    }

    // Extract FEN
    function extractFEN() {
        const context = getBoardContext();
        if (!context) return null;

        const pieces = context.root.querySelectorAll('.piece');
        if (pieces.length === 0) return null;

        const boardArray = Array(8).fill(null).map(() => Array(8).fill(''));

        pieces.forEach(piece => {
            const match = piece.className.match(/square-(\d)(\d)/);
            if (!match) return;

            const file = parseInt(match[1]) - 1;
            const rank = parseInt(match[2]) - 1;

            for (const cls of piece.classList) {
                if (PIECE_MAP[cls]) {
                    boardArray[7 - rank][file] = PIECE_MAP[cls];
                    break;
                }
            }
        });

        let fen = '';
        for (let rank = 0; rank < 8; rank++) {
            let empty = 0;
            for (let file = 0; file < 8; file++) {
                const p = boardArray[rank][file];
                if (p === '') { empty++; }
                else {
                    if (empty > 0) { fen += empty; empty = 0; }
                    fen += p;
                }
            }
            if (empty > 0) fen += empty;
            if (rank < 7) fen += '/';
        }

        return `${fen} ${detectTurn()} KQkq - 0 1`;
    }

    // Detect turn
    function detectTurn() {
        const clocks = document.querySelectorAll('.clock-component');
        for (const clock of clocks) {
            if (clock.classList.contains('clock-player-turn') || clock.classList.contains('clock-running')) {
                const rect = clock.getBoundingClientRect();
                const boardRect = document.querySelector('wc-chess-board')?.getBoundingClientRect();
                if (boardRect) {
                    const isBottom = rect.top > boardRect.top + boardRect.height / 2;
                    const isFlipped = document.querySelector('wc-chess-board')?.classList.contains('flipped');
                    return isBottom ? (isFlipped ? 'b' : 'w') : (isFlipped ? 'w' : 'b');
                }
            }
        }
        const moves = document.querySelectorAll('.move-text-component, [data-ply]');
        return moves.length % 2 === 0 ? 'w' : 'b';
    }

    // Get orientation (cached)
    function getBoardOrientation() {
        const board = document.querySelector('wc-chess-board');
        if (!board) return 'white';
        const isFlipped = board.classList.contains('flipped') || board.getAttribute('flipped') === 'true';
        cachedOrientation = isFlipped ? 'black' : 'white';
        return cachedOrientation;
    }

    // Square to coords
    function squareToCoords(square) {
        const file = square.charCodeAt(0) - 97;
        const rank = parseInt(square[1]) - 1;
        const orientation = cachedOrientation || getBoardOrientation();
        return orientation === 'white' ? { x: file, y: 7 - rank } : { x: 7 - file, y: rank };
    }

    // Draw arrow
    function drawArrow(from, to, colorIndex, scoreText) {
        if (!settings.showArrows) return;
        if (!arrowsSvg || !arrowsSvg.isConnected) {
            createArrowsContainer();
            if (!arrowsSvg) return;
        }

        const fromCoords = squareToCoords(from);
        const toCoords = squareToCoords(to);
        const squareSize = 12.5;

        const x1 = (fromCoords.x + 0.5) * squareSize;
        const y1 = (fromCoords.y + 0.5) * squareSize;
        const targetX = (toCoords.x + 0.5) * squareSize;
        const targetY = (toCoords.y + 0.5) * squareSize;

        const dx = targetX - x1, dy = targetY - y1;
        const length = Math.sqrt(dx * dx + dy * dy);
        const x2 = targetX - (dx / length) * 5;
        const y2 = targetY - (dy / length) * 5;

        const color = ARROW_COLORS[colorIndex];
        const opacity = 0.7 - colorIndex * 0.1;

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        line.setAttribute('stroke', color);
        line.setAttribute('stroke-width', '2.5');
        line.setAttribute('stroke-opacity', opacity);
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('marker-end', `url(#arrow-head-${colorIndex})`);
        arrowsSvg.appendChild(line);

        if (scoreText) {
            const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', midX);
            text.setAttribute('y', midY);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'central');
            text.setAttribute('fill', color);
            text.setAttribute('font-size', '4');
            text.setAttribute('font-weight', 'bold');
            text.setAttribute('font-family', 'Arial, sans-serif');
            text.setAttribute('stroke', '#000');
            text.setAttribute('stroke-width', '0.4');
            text.textContent = scoreText;
            arrowsSvg.appendChild(text);
        }
    }

    // Clear arrows
    function clearArrows() {
        if (arrowsSvg) {
            const defs = arrowsSvg.querySelector('defs');
            arrowsSvg.innerHTML = '';
            if (defs) arrowsSvg.appendChild(defs);
        }
    }

    // Parse UCI move
    function parseUCIMove(move) {
        if (!move || move.length < 4) return null;
        return { from: move.substring(0, 2), to: move.substring(2, 4) };
    }

    // Display analysis (arrows only)
    function displayAnalysis(data) {
        if (!settings.enabled || !data?.moves) return;

        if (data.fen) {
            const analysisFenPosition = data.fen.split(' ')[0];
            if (analysisFenPosition !== lastFen) return;
        }

        latestAnalysis = data;

        if (data.moves.length > 0) {
            clearArrows();
            getBoardOrientation();
        }

        data.moves.forEach((move, index) => {
            if (!move) return;
            const scoreText = move.isMate
                ? `M${move.score > 0 ? '+' : ''}${move.score}`
                : `${move.score > 0 ? '+' : ''}${(move.score / 100).toFixed(1)}`;
            const parsed = parseUCIMove(move.move);
            if (parsed) drawArrow(parsed.from, parsed.to, index, scoreText);
        });

        // The result for the current position arrived and was rendered: record it and cancel the
        // self-heal watchdog so it won't re-request. (Also set when arrows are hidden via the
        // showArrows preference — the analysis still arrived, so no re-request is needed.)
        drawnFen = lastFen;
        if (analysisWatchdog) { clearTimeout(analysisWatchdog); analysisWatchdog = null; }
    }

    // Analyze current position
    // The observer watches 'class' only (not animation 'style' frames), so this
    // fires roughly once per move rather than once per animation frame. We still
    // extract the FEN and bail out cheaply when the piece layout is unchanged,
    // then debounce so a burst of mutations for one move yields a single analysis.
    const DEBOUNCE_DELAY = 100;
    // Self-heal: if no arrows are drawn for the position we just requested (a dropped, late, or
    // engine-suppressed result would otherwise leave the board blank until the user toggles the
    // extension off/on — the only path that resets lastFen), re-request it. Bounded so a genuinely
    // dead engine can't spin. Paired with displayAnalysis, which records drawnFen on success.
    const ANALYSIS_WATCHDOG_DELAY = 1500;
    const ANALYSIS_WATCHDOG_MAX_RETRIES = 3;

    let debounceTimer = null;
    let pendingFen = null;
    let analysisWatchdog = null;

    function sendAnalyze(fen) {
        chrome.runtime.sendMessage({
            type: 'analyze',
            fen: fen,
            depth: settings.depth,
            multipv: settings.multipv,
            engine: settings.engine
        }).catch(() => { });
    }

    // Re-issue the analyze for `fen` if `placement` still has no arrows after the delay. Bypasses
    // the fenPosition===lastFen bail in analyzeCurrentPosition (which never re-fires on a static
    // board), so a one-off missed result recovers on its own instead of needing a manual toggle.
    function armAnalysisWatchdog(fen, placement) {
        if (analysisWatchdog) clearTimeout(analysisWatchdog);
        let retries = 0;
        const tick = () => {
            // A newer flush clears this timer, so reaching here means placement === lastFen.
            if (!settings.enabled || drawnFen === placement || retries++ >= ANALYSIS_WATCHDOG_MAX_RETRIES) {
                analysisWatchdog = null;
                return;
            }
            sendAnalyze(fen);
            analysisWatchdog = setTimeout(tick, ANALYSIS_WATCHDOG_DELAY);
        };
        analysisWatchdog = setTimeout(tick, ANALYSIS_WATCHDOG_DELAY);
    }

    function flushAnalysis() {
        const fen = pendingFen;
        pendingFen = null;
        if (!fen || !settings.enabled) return;

        lastFen = fen.split(' ')[0];
        clearArrows();
        drawnFen = '';                // nothing rendered yet for this request
        sendAnalyze(fen);
        armAnalysisWatchdog(fen, lastFen);
    }

    function cancelPendingAnalysis() {
        if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
        if (analysisWatchdog) { clearTimeout(analysisWatchdog); analysisWatchdog = null; }
        pendingFen = null;
    }

    function analyzeCurrentPosition() {
        if (!settings.enabled) return;

        const fen = extractFEN();
        if (!fen) return;

        const fenPosition = fen.split(' ')[0];
        // Ignore mutations that don't change the piece layout.
        if (fenPosition === lastFen) return;

        pendingFen = fen;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            debounceTimer = null;
            flushAnalysis();
        }, DEBOUNCE_DELAY);
    }

    // Message listener
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'analysis') {
            displayAnalysis(message.data);
        }
        if (message.type === 'settingsUpdate') {
            settings.enabled = message.settings.enabled;
            settings.depth = message.settings.depth;
            settings.showArrows = message.settings.showArrows;
            settings.multipv = message.settings.multipv || 3;
            settings.engine = message.settings.engine === 'maia3' ? 'maia3' : 'stockfish';

            if (!settings.enabled) {
                cancelPendingAnalysis();
                clearArrows();
            } else {
                lastFen = '';
                analyzeCurrentPosition();
            }
            sendResponse({ status: 'updated' });
        }
        if (message.type === 'getAnalysis') {
            sendResponse({ analysis: latestAnalysis });
        }
        return true;
    });

    // Setup observer
    let boardObserver = null;
    let observedBoard = null;

    // (Re)attach the move observer to the CURRENT board. chess.com swaps the
    // <wc-chess-board> element (new game, SPA navigation), which would otherwise
    // leave us observing a detached node — moves would go undetected until a
    // page reload. Returns false if no board with pieces is available yet.
    function attachBoardObserver() {
        const context = getBoardContext();
        if (!context) return false;

        if (boardObserver) boardObserver.disconnect();
        observedBoard = context.board;

        boardObserver = new MutationObserver(() => {
            cachedOrientation = null;
            analyzeCurrentPosition();
        });
        boardObserver.observe(context.root === document ? context.board : context.root, {
            childList: true, subtree: true, attributes: true,
            attributeFilter: ['class']
        });
        return true;
    }

    function setupObserver() {
        if (!attachBoardObserver()) {
            setTimeout(setupObserver, 1000);
            return;
        }

        createArrowsContainer();
        loadSettings();

        // Detect the board being added/replaced (e.g. a new game) and re-attach
        // the move observer to it, then analyse the fresh position.
        const docObserver = new MutationObserver(() => {
            const board = document.querySelector('wc-chess-board');
            if (!board) {
                arrowsSvg = null;
                observedBoard = null;
                return;
            }
            if (board !== observedBoard) {
                if (!arrowsSvg || !arrowsSvg.isConnected) createArrowsContainer();
                if (attachBoardObserver()) analyzeCurrentPosition();
            }
        });
        docObserver.observe(document.body, { childList: true, subtree: true });

        setTimeout(analyzeCurrentPosition, 1000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupObserver);
    } else {
        setupObserver();
    }

})();
