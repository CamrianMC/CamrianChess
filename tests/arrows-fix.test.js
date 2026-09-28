// Regression test for the FIX of "arrows vanish after opponent move until toggle".
// Models the fixed content.js self-heal (drawnFen + bounded watchdog) and the fixed background.js
// idle-reset, on a deterministic virtual clock so the 1500ms timers fire predictably.
//
// Two distinct "miss" types (kept separate — the earlier bug of conflating them hid a boundary):
//   TYPE A  engine/counter healthy, but the {analysis} broadcast never reaches content
//           (dropped message OR lost the lastFen guard race). This is the USER'S bug: it heals via
//           the popup toggle, and the popup toggle only resets CONTENT state -> background was fine.
//   TYPE B  background counter wedged: searchActive stuck true after a lost bestmove, so later
//           output is gated. Rarer; the popup toggle would NOT heal it. Recovered by the bg idle-reset.

// ---------- virtual clock ----------
let vnow = 1000, timers = [], timerId = 1;
const setT = (fn, d) => { const id = timerId++; timers.push({ id, at: vnow + d, fn }); return id; };
const clearT = id => { timers = timers.filter(t => t.id !== id); };
function advance(ms) {
    const target = vnow + ms;
    timers.sort((a, b) => a.at - b.at);
    while (timers.length && timers[0].at <= target) { const t = timers.shift(); vnow = t.at; t.fn(); }
    vnow = target;
}
const now = () => vnow;

// ---------- fixed background.js model ----------
const ENGINE_IDLE_RESET_MS = 1500;
const bg = {
    searchActive: false, staleBestmoves: 0, lastEngineOutputAt: 0, lastGoAt: 0,
    deliverToContent: true,   // TYPE A miss = false (broadcast lost on the way to content)
    engineHangs: false,       // TYPE B seed = true (bestmove lost -> searchActive stuck true)
    analyze(fen, onAnalysis) {
        const t = now();
        if (this.searchActive && (t - this.lastEngineOutputAt) > ENGINE_IDLE_RESET_MS
                              && (t - this.lastGoAt) > ENGINE_IDLE_RESET_MS) {
            this.searchActive = false; this.staleBestmoves = 0;      // <-- anti-poison reconcile
        }
        if (this.searchActive) this.staleBestmoves++;
        this.lastGoAt = now(); this.searchActive = true;
        this.lastEngineOutputAt = now();                            // an 'info' line
        const willBroadcast = (this.staleBestmoves === 0);
        if (!this.engineHangs) {                                    // the 'bestmove' (unless lost)
            if (this.staleBestmoves > 0) this.staleBestmoves--; else this.searchActive = false;
        }
        if (willBroadcast && this.deliverToContent) onAnalysis({ moves: [{ move: 'e2e4' }], fen });
    },
};

// ---------- fixed content.js model ----------
const ANALYSIS_WATCHDOG_DELAY = 1500, ANALYSIS_WATCHDOG_MAX_RETRIES = 3;
let lastFen = '', drawnFen = '', pendingFen = null, analysisWatchdog = null;
let boardPlacement = 'start', arrows = [], sendCount = 0;
const settings = { enabled: true };
const extractFEN = () => boardPlacement ? boardPlacement + ' w - - 0 1' : null;
const sendAnalyze = fen => { sendCount++; bg.analyze(fen, displayAnalysis); };

function armAnalysisWatchdog(fen, placement) {
    if (analysisWatchdog) clearT(analysisWatchdog);
    let retries = 0;
    const tick = () => {
        if (!settings.enabled || drawnFen === placement || retries++ >= ANALYSIS_WATCHDOG_MAX_RETRIES) {
            analysisWatchdog = null; return;
        }
        sendAnalyze(fen);
        analysisWatchdog = setT(tick, ANALYSIS_WATCHDOG_DELAY);
    };
    analysisWatchdog = setT(tick, ANALYSIS_WATCHDOG_DELAY);
}
function flushAnalysis() {
    const fen = pendingFen; pendingFen = null;
    if (!fen || !settings.enabled) return;
    lastFen = fen.split(' ')[0];
    arrows = [];
    drawnFen = '';                // nothing rendered yet for this request
    sendAnalyze(fen);
    armAnalysisWatchdog(fen, lastFen);
}
function displayAnalysis(data) {
    if (!settings.enabled || !data || !data.moves) return;
    if (data.fen && data.fen.split(' ')[0] !== lastFen) return;
    if (data.moves.length > 0) arrows = [];
    data.moves.forEach(m => { if (m) arrows.push(m.move); });
    drawnFen = lastFen;
    if (analysisWatchdog) { clearT(analysisWatchdog); analysisWatchdog = null; }
}
function analyzeCurrentPosition() {
    if (!settings.enabled) return;
    const fen = extractFEN(); if (!fen) return;
    if (fen.split(' ')[0] === lastFen) return;
    pendingFen = fen; flushAnalysis();
}
const boardMovesTo = p => { boardPlacement = p; analyzeCurrentPosition(); };

// ---------- assertions ----------
let failures = 0;
const assert = (l, c) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };

console.log('=== Test 1 (the user\'s bug, TYPE A): dropped broadcast self-heals WITHOUT a toggle ===');
bg.deliverToContent = true; boardMovesTo('P1'); assert('T1.0 P1 arrows drawn', arrows.length > 0);
bg.deliverToContent = false; boardMovesTo('P2');            // opponent move; broadcast lost in transit
assert('T1.1 arrows blank right after the miss', arrows.length === 0);
assert('T1.1b background stayed healthy (searchActive false)', bg.searchActive === false);
bg.deliverToContent = true;                                 // delivery works again
advance(1600);                                              // watchdog fires — NO user action
assert('T1.2 arrows RESTORED by watchdog, no toggle needed', arrows.length > 0);
assert('T1.3 recovered for the current position P2', drawnFen === 'P2');

console.log('\n=== Test 2 (TYPE B): wedged searchActive is reconciled on the next idle request ===');
bg.searchActive = true; bg.staleBestmoves = 0; bg.engineHangs = false; bg.deliverToContent = true;
bg.lastEngineOutputAt = now() - 5000; bg.lastGoAt = now() - 5000;   // engine long idle & silent
lastFen = ''; drawnFen = ''; arrows = [];
boardMovesTo('P3');
assert('T2.1 idle-reset cleared the wedge (staleBestmoves 0)', bg.staleBestmoves === 0);
assert('T2.2 arrows drawn despite prior stuck searchActive', arrows.length > 0);

console.log('\n=== Test 2b: WITHOUT the idle-reset the same request stays blank (shows the seed) ===');
(function oldBehavior() {
    let sa = true, stale = 0, drew = false;                 // old bg: no reconcile
    if (sa) stale++;                                        // go bumps stale to 1
    if (stale === 0) drew = true;                           // info gated out
    assert('T2b old code gates the info -> no arrows', drew === false);
})();

console.log('\n=== Test 3: healthy path is not double-analyzed ===');
bg.searchActive = false; bg.staleBestmoves = 0; bg.deliverToContent = true; bg.engineHangs = false;
lastFen = ''; drawnFen = ''; arrows = []; sendCount = 0;
boardMovesTo('P4');
const sendsAfterDraw = sendCount;
advance(2000);
assert('T3.1 P4 drawn on first try', arrows.length > 0);
assert('T3.2 watchdog did NOT re-send in the healthy path', sendCount === sendsAfterDraw);

console.log('\n=== Test 4: watchdog is bounded (no infinite spin when nothing ever reaches content) ===');
bg.searchActive = false; bg.staleBestmoves = 0; bg.deliverToContent = false; bg.engineHangs = false;
lastFen = ''; drawnFen = ''; arrows = []; sendCount = 0;
boardMovesTo('P5');                                          // initial send (1)
advance(1600 * (ANALYSIS_WATCHDOG_MAX_RETRIES + 2));
assert('T4.1 stays blank while delivery keeps failing', arrows.length === 0);
assert(`T4.2 exactly 1 initial + ${ANALYSIS_WATCHDOG_MAX_RETRIES} retries then stops`,
    sendCount === 1 + ANALYSIS_WATCHDOG_MAX_RETRIES);
assert('T4.3 no timer left armed', analysisWatchdog === null);

console.log('\n=== Test 5: toggle/re-request over an ALREADY-drawn, unchanged board whose result drops ===');
// The reset of drawnFen on flush is what saves this: without it the watchdog would see
// drawnFen===placement (stale from before the re-flush) and never re-request.
const enableToggle = () => { settings.enabled = true; lastFen = ''; analyzeCurrentPosition(); };
bg.searchActive = false; bg.staleBestmoves = 0; bg.engineHangs = false; bg.deliverToContent = true;
lastFen = ''; drawnFen = ''; arrows = [];
boardMovesTo('Q'); assert('T5.0 Q drawn (drawnFen=Q)', drawnFen === 'Q' && arrows.length > 0);
bg.deliverToContent = false; enableToggle();               // toggle re-requests SAME board Q; result drops
assert('T5.1 blank after dropped re-draw of unchanged Q', arrows.length === 0 && drawnFen === '');
bg.deliverToContent = true; advance(1600);
assert('T5.2 watchdog re-draws Q (drawnFen reset let it re-fire)', arrows.length > 0 && drawnFen === 'Q');

console.log(`\n${failures === 0 ? 'ALL PASS — fix recovers deterministically without a toggle' : failures + ' FAIL'}`);
process.exit(failures === 0 ? 0 : 1);
