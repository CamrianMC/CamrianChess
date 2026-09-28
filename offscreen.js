// Offscreen document script - runs Stockfish Worker

let stockfish = null;
let uciokReceived = false;
let readyWatchdog = null;

// Tell the background script the engine failed/hung so it can reset its state
// instead of waiting forever for a 'bestmove' that will never arrive.
function reportError(reason) {
    chrome.runtime.sendMessage({ type: 'stockfishError', reason }).catch(() => { });
}

// Initialize Stockfish worker
function initStockfish() {
    if (stockfish) return;

    const stockfishUrl = chrome.runtime.getURL('stockfish.js');

    try {
        stockfish = new Worker(stockfishUrl);
    } catch (err) {
        console.error('[Offscreen] Failed to create worker:', err);
        reportError('worker-create-failed');
        return;
    }

    stockfish.addEventListener('message', (e) => {
        const line = e.data;

        // Engine ready - configure options
        if (line.includes('uciok')) {
            uciokReceived = true;
            if (readyWatchdog) { clearTimeout(readyWatchdog); readyWatchdog = null; }
            stockfish.postMessage('setoption name Hash value 128');
            stockfish.postMessage('isready');
        }

        // Forward all output to background script
        chrome.runtime.sendMessage({
            type: 'stockfishOutput',
            line: line
        }).catch(() => { });
    });

    stockfish.onerror = (e) => {
        console.error('[Stockfish] Worker error:', e.message || e);
        reportError('worker-error');
    };

    // The WASM engine loads asynchronously; if it never reaches 'uciok'
    // (e.g. the wasm binary failed to load) surface an error instead of
    // hanging silently forever.
    readyWatchdog = setTimeout(() => {
        if (!uciokReceived) reportError('engine-timeout');
    }, 10000);

    // Start UCI protocol
    stockfish.postMessage('uci');
}

// Listen for commands from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'stockfishCommand') {
        if (!stockfish) initStockfish();
        if (!stockfish) {
            // Worker creation failed (see initStockfish). Avoid a TypeError that
            // would crash this listener and silently drop all later commands.
            sendResponse({ status: 'error' });
            return true;
        }
        stockfish.postMessage(message.command);
        sendResponse({ status: 'sent' });
    }

    if (message.type === 'initStockfish') {
        initStockfish();
        sendResponse({ status: 'initializing' });
    }

    return true;
});

// Auto-init on load
initStockfish();
