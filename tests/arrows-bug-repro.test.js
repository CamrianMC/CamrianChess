// Deterministic repro of the "arrows vanish after opponent move until toggle" bug.
//
// It faithfully ports the RELEVANT content.js state machine (the persistence half of
// the root cause) so we can prove, mechanically, WITHOUT a live chess.com page:
//   - arrows go BLANK (cleared before the round-trip)                      content.js:286
//   - a single MISSED analysis result becomes PERMANENT because there is
//     no retry and analyzeCurrentPosition bails on fenPosition===lastFen   content.js:307-309
//   - the ONLY thing that un-sticks it is lastFen='' (the enable-toggle)   content.js:334-335
//
// The "seed" (why the opponent-position result is occasionally missed) is modeled as a
// pluggable `deliverResult` flag on the fake background, because the seed is what the
// adversarial panel found is intermittent/harder to pin; the PERSISTENCE proven here
// holds for ANY cause of a missed result.

// ---- faithful port of content.js state (only the parts that matter) ----
let lastFen = '';
let pendingFen = null;
let arrows = [];              // stand-in for the SVG arrow lines
let settings = { enabled: true };

function clearArrows() { arrows = []; }                       // content.js:230-236
function drawArrow(mv) { arrows.push(mv); }                   // content.js:175 (simplified)

// stand-in for the live DOM: the board's current piece placement
let boardPlacement = 'startpos';
function extractFEN() { return boardPlacement ? boardPlacement + ' w - - 0 1' : null; } // content.js:97

// the fake background: sends back a result for `fen` unless we simulate a miss
let deliverNext = true;      // toggle this to simulate the background dropping a result
function backgroundAnalyze(fen) {
    if (!deliverNext) return;                                 // <-- the "seed": result missed
    // background stamps the result with the analyzed fen (background.js:96-98)
    displayAnalysis({ moves: [{ move: fen.substring(0, 4) || 'e2e4' }], fen });
}

// content.js:280-294
function flushAnalysis() {
    const fen = pendingFen; pendingFen = null;
    if (!fen || !settings.enabled) return;
    lastFen = fen.split(' ')[0];
    clearArrows();                                            // arrows blanked BEFORE round-trip
    backgroundAnalyze(fen);                                   // async in real life
}

// content.js:301-317 (debounce made synchronous for a deterministic trace)
function analyzeCurrentPosition() {
    if (!settings.enabled) return;
    const fen = extractFEN();
    if (!fen) return;
    const fenPosition = fen.split(' ')[0];
    if (fenPosition === lastFen) return;                     // <-- the fatal bail on a stable board
    pendingFen = fen;
    flushAnalysis();
}

// content.js:245-268
function displayAnalysis(data) {
    if (!settings.enabled || !data || !data.moves) return;
    if (data.fen) {
        const analysisFenPosition = data.fen.split(' ')[0];
        if (analysisFenPosition !== lastFen) return;         // stale guard: drop mismatched result
    }
    if (data.moves.length > 0) { clearArrows(); }
    data.moves.forEach(m => { if (m) drawArrow(m.move); });
}

// content.js:324-336 — the enable-toggle path (settingsUpdate, enabled:true)
function enableToggle() {
    settings.enabled = true;
    lastFen = '';                                            // <-- the ONLY force-reset in the codebase
    analyzeCurrentPosition();
}

// a board mutation (opponent/user move) that the observer would pick up
function boardMovesTo(placement) {
    boardPlacement = placement;
    analyzeCurrentPosition();                                // observer -> analyzeCurrentPosition
}

// ---- assertions ----
let failures = 0;
function assert(label, cond) {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
    if (!cond) failures++;
}

console.log('=== Scenario A: healthy move, result delivered ===');
deliverNext = true;
boardMovesTo('rnbqkbnr_after_user_move');
assert('A1 arrows shown for the analyzed position', arrows.length > 0);

console.log('\n=== Scenario B: opponent move whose result is MISSED (the bug) ===');
deliverNext = false;                                          // background drops this one
boardMovesTo('position_after_opponent_move');
assert('B1 arrows are BLANK (cleared, never redrawn)', arrows.length === 0);
assert('B2 lastFen is pinned to the missed position', lastFen === 'position_after_opponent_move');

console.log('\n--- board is stable (user to move); observer keeps firing ---');
deliverNext = true;                                          // background is fine now...
const reqBefore = arrows.length;
boardMovesTo('position_after_opponent_move');                // same placement -> re-analyze attempt
boardMovesTo('position_after_opponent_move');
assert('B3 NO re-request happens (fenPosition===lastFen bail) -> still blank', arrows.length === 0);

console.log('\n--- user plays the NEXT move, but it is chased by another missed reply ---');
deliverNext = false;
boardMovesTo('position_after_my_next_move');                 // gets analyzed...
boardMovesTo('position_after_opponents_next_reply');         // ...and the reply is missed again
assert('B4 still blank after making moves ("moves don\'t bring them back")', arrows.length === 0);

console.log('\n=== Scenario C: user toggles the extension off/on ===');
deliverNext = true;
enableToggle();                                              // lastFen='' -> forces a fresh analyze
assert('C1 arrows RETURN after the toggle', arrows.length > 0);

console.log('\n=== Control: prove ONLY lastFen="" unsticks it (not re-enabling alone) ===');
// re-blank via a missed result
deliverNext = false; boardMovesTo('another_stuck_position');
assert('D1 blank again', arrows.length === 0);
// calling analyzeCurrentPosition without resetting lastFen does nothing
deliverNext = true; analyzeCurrentPosition();
assert('D2 re-analyze WITHOUT lastFen reset stays blank (root cause confirmed)', arrows.length === 0);
// now the toggle's lastFen='' reset
enableToggle();
assert('D3 lastFen="" reset restores arrows', arrows.length > 0);

console.log(`\n${failures === 0 ? 'ALL PASS — bug mechanism reproduced deterministically' : failures + ' FAIL'}`);
process.exit(failures === 0 ? 0 : 1);
