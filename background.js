// Background Service Worker
// Communicates between content script, popup, and Stockfish

const ENGINE = {
    STOCKFISH: 'stockfish',
    MAIA3: 'maia3'
};

const MAIA3_BRIDGE_URL = 'http://127.0.0.1:8765/analyze';

let offscreenReady = false;
let currentAnalysis = null;
let currentTabId = null;
let lastDepthSent = 0;
let currentFen = null;
let latestAnalysisData = null; // Store latest analysis for popup
let activeEngine = ENGINE.STOCKFISH;
let currentRequestEngine = ENGINE.STOCKFISH;
let searchActive = false;   // a 'go' was issued whose 'bestmove' has not been seen yet
let staleBestmoves = 0;     // bestmoves still expected from aborted (stopped) searches — to ignore
let lastEngineOutputAt = 0; // timestamp of the most recent Stockfish output line
let lastGoAt = 0;           // timestamp of the most recent 'go' command issued

// A running search streams 'info' lines continuously, so this much silence while we still think a
// search is active means its 'bestmove' was lost (e.g. dropped during a service-worker sleep). Used
// to un-wedge searchActive/staleBestmoves so a later search's output can't be gated out forever.
const ENGINE_IDLE_RESET_MS = 1500;

// Pre-compiled regex patterns
const REGEX = {
    depth: /depth (\d+)/,
    multipv: /multipv (\d+)/,
    score: /score (cp|mate) (-?\d+)/,
    pv: / pv (.+)/
};

function normalizeEngine(engineValue) {
    return engineValue === ENGINE.MAIA3 ? ENGINE.MAIA3 : ENGINE.STOCKFISH;
}

function loadEngineSetting() {
    chrome.storage.local.get(['engine'], (result) => {
        activeEngine = normalizeEngine(result.engine);
    });
}

// Create offscreen document if needed
async function setupOffscreenDocument() {
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (existingContexts.length > 0) {
        offscreenReady = true;
        return;
    }

    await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['WORKERS'],
        justification: 'Run Stockfish chess engine in a Web Worker'
    });

    offscreenReady = true;
}

// Send command to Stockfish
async function sendStockfishCommand(command) {
    if (!offscreenReady) await setupOffscreenDocument();
    chrome.runtime.sendMessage({ type: 'stockfishCommand', command });
}

// Parse analysis line from Stockfish
function parseAnalysisLine(line) {
    if (!currentAnalysis) {
        currentAnalysis = { moves: [], depth: 0 };
    }

    const depthMatch = line.match(REGEX.depth);
    const pvMatch = line.match(REGEX.pv);

    if (depthMatch && pvMatch) {
        const depth = parseInt(depthMatch[1]);
        const multipvMatch = line.match(REGEX.multipv);
        const multipv = multipvMatch ? parseInt(multipvMatch[1]) : 1;
        const pv = pvMatch[1].split(' ');
        const bestMove = pv[0];

        let score = 0;
        let isMate = false;
        const scoreMatch = line.match(REGEX.score);
        if (scoreMatch) {
            isMate = scoreMatch[1] === 'mate';
            score = parseInt(scoreMatch[2]);
        }

        currentAnalysis.depth = depth;
        currentAnalysis.moves[multipv - 1] = {
            move: bestMove,
            score,
            isMate,
            pv: pv.slice(0, 5).join(' ')
        };

        // Send results progressively at each new depth
        if (depth > lastDepthSent && currentAnalysis.moves[0]) {
            lastDepthSent = depth;
            broadcastAnalysis(false);
        }
    }
}

function resetStockfishSearchState() {
    searchActive = false;
    staleBestmoves = 0;
    lastDepthSent = 0;
}

async function analyzeWithMaiaBridge(fen, multipv, depth) {
    const clampedMultipv = Math.min(3, Math.max(1, parseInt(multipv) || 3));
    const payload = {
        fen,
        multipv: clampedMultipv,
        depth: Math.min(25, Math.max(1, parseInt(depth) || 1))
    };

    const response = await fetch(MAIA3_BRIDGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`Maia3 bridge HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.moves)) {
        throw new Error('Maia3 bridge returned invalid payload');
    }

    currentAnalysis = {
        depth: parseInt(data.depth) || 1,
        moves: data.moves.slice(0, clampedMultipv).map((move) => ({
            move: move.move,
            score: parseInt(move.score) || 0,
            isMate: !!move.isMate,
            pv: move.pv || move.move
        }))
    };

    broadcastAnalysis(true);
}

// Broadcast analysis to content script AND popup
function broadcastAnalysis(isFinal) {
    if (!currentAnalysis) return;

    const validMoves = currentAnalysis.moves.filter(m => m);
    if (validMoves.length === 0) return;

    const analysisData = {
        depth: currentAnalysis.depth,
        moves: validMoves,
        fen: currentFen,
        engine: currentRequestEngine
    };

    // Store for popup requests
    latestAnalysisData = analysisData;

    // Send to content script
    if (currentTabId) {
        chrome.tabs.sendMessage(currentTabId, {
            type: 'analysis',
            data: analysisData,
            isFinal
        }).catch(() => { });
    }

    // Send to popup (if open)
    chrome.runtime.sendMessage({
        type: 'analysisUpdate',
        data: analysisData
    }).catch(() => { }); // Popup might not be open

    if (isFinal) {
        currentAnalysis = null;
        lastDepthSent = 0;
    }
}

// Start analysis of a position
async function analyzePosition(fen, depth, multipv) {
    const clampedMultipv = Math.min(3, Math.max(1, parseInt(multipv) || 3));
    const clampedDepth = Math.min(25, Math.max(10, parseInt(depth) || 15));

    currentAnalysis = { moves: [], depth: 0 };
    lastDepthSent = 0;
    currentFen = fen;

    if (currentRequestEngine === ENGINE.MAIA3) {
        resetStockfishSearchState();
        await analyzeWithMaiaBridge(fen, clampedMultipv, clampedDepth);
        return;
    }

    await setupOffscreenDocument();

    // If we still think a search is running but the engine has been silent (no 'info' and no fresh
    // 'go') for a while, its 'bestmove' was lost. Left alone, searchActive stays stuck true and
    // every subsequent 'go' bumps staleBestmoves, which gates out the current position's info lines
    // indefinitely — the board never gets fresh arrows. Reconcile before counting.
    const now = Date.now();
    if (searchActive && (now - lastEngineOutputAt) > ENGINE_IDLE_RESET_MS
                     && (now - lastGoAt) > ENGINE_IDLE_RESET_MS) {
        searchActive = false;
        staleBestmoves = 0;
    }

    // Aborting the running search (via 'stop' below) makes it emit one last,
    // now-stale 'bestmove'. Mark it so its trailing output is discarded.
    if (searchActive) staleBestmoves++;

    sendStockfishCommand('stop');
    sendStockfishCommand(`setoption name MultiPV value ${clampedMultipv}`);
    sendStockfishCommand(`position fen ${fen}`);
    sendStockfishCommand(`go depth ${clampedDepth}`);
    lastGoAt = Date.now();
    searchActive = true;
}

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'analyze') {
        currentTabId = sender.tab?.id;
        currentRequestEngine = normalizeEngine(message.engine || activeEngine);
        analyzePosition(message.fen, message.depth, message.multipv)
            .then(() => sendResponse({ status: 'analyzing', engine: currentRequestEngine }))
            .catch((err) => {
                console.error('[Background] Analysis failed:', err);
                resetStockfishSearchState();
                currentAnalysis = null;
                sendResponse({ status: 'error', error: String(err?.message || err) });
            });
        return true;
    }

    if (message.type === 'stop') {
        if (currentRequestEngine === ENGINE.STOCKFISH) {
            sendStockfishCommand('stop');
        }
        sendResponse({ status: 'stopped' });
        return true;
    }

    if (message.type === 'ping') {
        sendResponse({ status: 'ok', ready: offscreenReady, engine: activeEngine });
        return true;
    }

    // Popup requesting latest analysis
    if (message.type === 'getLatestAnalysis') {
        sendResponse({ analysis: latestAnalysisData });
        return true;
    }

    // Engine failed to load, errored, or hung: reset finalize state so a missing
    // 'bestmove' can't permanently wedge future analyses; the next analyze retries.
    if (message.type === 'stockfishError') {
        resetStockfishSearchState();
        currentAnalysis = null;
        return true;
    }

    // Messages from offscreen document (Stockfish output)
    if (message.type === 'stockfishOutput') {
        if (currentRequestEngine !== ENGINE.STOCKFISH) {
            return true;
        }

        const line = message.line;
        lastEngineOutputAt = Date.now();

        if (line.includes('info depth') && line.includes(' pv ')) {
            // Ignore info lines still draining from a previous (stopped) search;
            // otherwise they'd be parsed into the new position's analysis.
            if (staleBestmoves === 0) parseAnalysisLine(line);
        }

        if (line.startsWith('bestmove')) {
            if (staleBestmoves > 0) {
                staleBestmoves--; // stale bestmove from an aborted search — discard
            } else {
                searchActive = false;
                broadcastAnalysis(true);
            }
        }

        return true;
    }

    return true;
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.engine) {
        activeEngine = normalizeEngine(changes.engine.newValue);
    }
});

// Initialize on startup
setupOffscreenDocument();
loadEngineSetting();
