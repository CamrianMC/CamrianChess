# Chrome Web Store Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce 7 pixel-exact PNG assets (5 screenshots 1280×800, promo tile 440×280, marquee 1400×560) for the Chess.com Analyzer CWS listing, from real captures of the extension framed in branded HTML pages.

**Architecture:** agent-browser drives Chrome for Testing with the extension loaded to take *raw* captures on chess.com; a Node build script embeds those captures as data URIs into per-asset HTML framing pages; agent-browser re-renders each page at the exact target viewport and screenshots it. A byte-level PNG dimension checker gates delivery.

**Tech Stack:** agent-browser CLI (installed globally), Chrome for Testing at `C:/Users/Zero/cft/chrome-win64/chrome.exe`, Node 22 (no npm deps), Git Bash.

## Global Constraints

- Exact output sizes: S1–S5 = 1280×800, T1 = 440×280, T2 = 1400×560 (CWS rejects other sizes).
- All copy in **English**, exact headlines from the spec (`docs/superpowers/specs/2026-07-03-cws-store-assets-design.md`).
- No fake UI: screenshot regions must be genuine captures of the extension running on chess.com.
- Repo root: `C:/Users/Zero/Desktop/chess.com-analyzer`. Finals in `store-assets/`, sources in `store-assets/src/`, generated pages gitignored.
- Launch Chrome with `--force-device-scale-factor=1` so screenshots are 1:1 pixels (a DPR≠1 machine would otherwise produce 2× PNGs).
- Visual system: dark anthracite→green gradient background, bold sans headline, captures inset with 12px rounded corners + drop shadow. Arrow green accent `#32CD32`.

---

### Task 1: Raw captures on chess.com (board ×2, popup ×1)

**Files:**
- Create: `store-assets/src/captures/raw-board-start.png` (1280×800 full page, opening position + 3 arrows)
- Create: `store-assets/src/captures/raw-board-ruylopez.png` (1280×800 full page, mid-game + arrows)
- Create: `store-assets/src/captures/raw-popup.png` (popup page with eval bars + settings visible)
- Create: `store-assets/src/captures/board-box.json` (x/y/width/height of `wc-chess-board` in the 1280×800 captures)

**Interfaces:**
- Produces: the three PNGs above + `board-box.json` (`{"x":N,"y":N,"width":N,"height":N}`) consumed by Task 2's build script for CSS cropping.

- [ ] **Step 1: Launch CfT with the extension, DPR forced to 1, viewport 1280×800**

```bash
agent-browser close --all
rm -rf "C:/Users/Zero/AppData/Local/Temp/ab-shoot-profile"
agent-browser --executable-path "C:/Users/Zero/cft/chrome-win64/chrome.exe" \
  --profile "C:/Users/Zero/AppData/Local/Temp/ab-shoot-profile" \
  --extension "C:/Users/Zero/Desktop/chess.com-analyzer/dist" \
  --args "--force-device-scale-factor=1" \
  open "https://www.chess.com/analysis" --headed
agent-browser set viewport 1280 800
agent-browser wait --load networkidle
```
Expected: `✓ Chess Analysis Board and PGN Editor - Chess.com`.

- [ ] **Step 2: Dismiss the cookie-consent banner (it covers the bottom of every capture otherwise)**

```bash
agent-browser find text "Reject All" click || agent-browser find text "I Accept" click
agent-browser wait 1000
# Belt-and-braces: remove any leftover consent overlay from the DOM
cat <<'EOF' | agent-browser eval --stdin
(() => { document.querySelectorAll('[id*="onetrust"],[class*="consent"],[class*="cookie"]').forEach(e=>e.remove()); return 'cleaned'; })()
EOF
```
Expected: banner gone. Verify with `agent-browser screenshot check.png` + Read → no privacy strip at the bottom.

- [ ] **Step 3: Wait for the extension arrows on the start position, save capture 1 + board box**

```bash
agent-browser wait --fn "(() => { const b=document.querySelector('wc-chess-board'); const s=b&&(b.querySelector('#stockfish-arrows')||(b.shadowRoot&&b.shadowRoot.querySelector('#stockfish-arrows'))); return !!(s&&s.querySelectorAll('line').length>=3); })()"
mkdir -p "C:/Users/Zero/Desktop/chess.com-analyzer/store-assets/src/captures"
agent-browser screenshot "C:/Users/Zero/Desktop/chess.com-analyzer/store-assets/src/captures/raw-board-start.png"
agent-browser get box "wc-chess-board" --json > "C:/Users/Zero/Desktop/chess.com-analyzer/store-assets/src/captures/board-box.json"
```
Expected: PNG saved; `board-box.json` contains numeric x/y/width/height.

- [ ] **Step 4: Play the Ruy Lopez sequence, wait for fresh arrows, save capture 2**

```bash
cat <<'EOF' | agent-browser eval --stdin
(() => { const g=document.querySelector('wc-chess-board').game;
  ['e4','e5','Nf3','Nc6','Bb5','a6','Ba4','Nf6','O-O'].forEach(s=>{try{g.move(s)}catch(e){}});
  return 'played'; })()
EOF
agent-browser wait 4000
agent-browser wait --fn "(() => { const b=document.querySelector('wc-chess-board'); const s=b&&(b.querySelector('#stockfish-arrows')||(b.shadowRoot&&b.shadowRoot.querySelector('#stockfish-arrows'))); return !!(s&&s.querySelectorAll('line').length>=3); })()"
agent-browser screenshot "C:/Users/Zero/Desktop/chess.com-analyzer/store-assets/src/captures/raw-board-ruylopez.png"
```
Expected: PNG saved, arrows visible on the mid-game position.

- [ ] **Step 5: Capture the popup with real analysis data**

The popup (`popup.html`) renders analysis when it receives an `analysisUpdate` broadcast (popup.js:148 has no active-tab check). Open it in a second tab, then trigger a new analysis from the chess.com tab so the broadcast paints the popup.

```bash
# Get the unpacked extension ID from chrome://extensions (machine-specific)
agent-browser tab new
agent-browser open "chrome://extensions"
cat <<'EOF' | agent-browser eval --stdin
(() => { const m=document.querySelector('extensions-manager');
  const l=m.shadowRoot.querySelector('extensions-item-list');
  const it=l.shadowRoot.querySelector('extensions-item');
  return it ? it.id : 'NOT_FOUND'; })()
EOF
# → save the printed ID, then:
agent-browser open "chrome-extension://<ID>/popup.html"
agent-browser set viewport 400 620
# Switch to the chess.com tab and play one more move to trigger a broadcast
agent-browser tab list           # note tab indexes
agent-browser tab 1              # the chess.com tab
cat <<'EOF' | agent-browser eval --stdin
(() => { document.querySelector('wc-chess-board').game.move('Nxe4'); return 'moved'; })()
EOF
agent-browser wait 3000
agent-browser tab 2              # back to the popup tab
agent-browser screenshot "C:/Users/Zero/Desktop/chess.com-analyzer/store-assets/src/captures/raw-popup.png"
agent-browser set viewport 1280 800
```
Expected: popup PNG shows the Best Moves list with score bars AND the Depth/Lines sliders. If `movesList` is still the empty state, repeat: switch to tab 1, play another move (`d3`), wait 3s, re-screenshot tab 2.

- [ ] **Step 6: Verify all three captures visually and close the browser**

Read each PNG with the Read tool. Checklist: no cookie banner, 3 arrows + eval labels visible on both board captures, popup shows move bars + sliders. Then:

```bash
agent-browser close --all
```

- [ ] **Step 7: Commit raw captures**

```bash
cd "C:/Users/Zero/Desktop/chess.com-analyzer"
git add store-assets/src/captures
git commit -m "chore(store): raw captures for CWS assets

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Build script + framing pages (S1–S5, T1, T2)

**Files:**
- Create: `store-assets/src/build.js` (Node, zero deps)
- Create: `store-assets/src/pages/` (generated, gitignored)
- Modify: `.gitignore` (add `store-assets/src/pages/`)

**Interfaces:**
- Consumes: `store-assets/src/captures/*.png`, `board-box.json` from Task 1.
- Produces: `store-assets/src/pages/{s1,s2,s3,s4,s5,t1,t2}.html`, each a self-contained page sized exactly to its target (via `html,body{width:<W>px;height:<H>px}`), consumed by Task 3.

- [ ] **Step 1: Add the gitignore entry**

```bash
cd "C:/Users/Zero/Desktop/chess.com-analyzer"
printf '\n# Generated store-asset pages\nstore-assets/src/pages/\n' >> .gitignore
```

- [ ] **Step 2: Write `store-assets/src/build.js`**

```js
// build.js — generates self-contained HTML framing pages for CWS assets.
// Zero deps: reads captures, embeds as data URIs, writes pages/.
const fs = require('fs'), path = require('path');
const SRC = __dirname;
const CAP = p => `data:image/png;base64,${fs.readFileSync(path.join(SRC,'captures',p)).toString('base64')}`;
const box = JSON.parse(fs.readFileSync(path.join(SRC,'captures','board-box.json'),'utf8'));

const boardStart = CAP('raw-board-start.png');
const boardRuy   = CAP('raw-board-ruylopez.png');
const popup      = CAP('raw-popup.png');
const icon = `data:image/png;base64,${fs.readFileSync(path.join(SRC,'..','..','images','icon128.png')).toString('base64')}`;

// Crop helper: shows only the wc-chess-board region of a 1280×800 capture,
// scaled so the crop is `w` px wide.
const crop = (uri, w) => {
  const s = w / box.width;
  return `<div style="width:${w}px;height:${Math.round(box.height*s)}px;overflow:hidden;
    border-radius:12px;box-shadow:0 24px 60px rgba(0,0,0,.55);flex:none">
    <img src="${uri}" style="width:${Math.round(1280*s)}px;
      margin-left:${-Math.round(box.x*s)}px;margin-top:${-Math.round(box.y*s)}px;display:block"></div>`;
};

const page = (w,h,inner) => `<!doctype html><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${w}px;height:${h}px;overflow:hidden}
  body{background:linear-gradient(135deg,#1b1b19 0%,#233524 60%,#2e4a2f 100%);
    font-family:"Segoe UI",Arial,sans-serif;color:#fff;display:flex;
    flex-direction:column;align-items:center}
  h1{font-weight:800;letter-spacing:-.5px;text-align:center}
  .sub{color:#b9ccb9;font-weight:400}
  .accent{color:#32CD32}
</style><body>${inner}</body>`;

const shot = (title, mediaHtml, sub='') => page(1280,800,`
  <div style="padding:44px 60px 20px;text-align:center">
    <h1 style="font-size:40px">${title}</h1>
    ${sub?`<div class="sub" style="font-size:19px;margin-top:8px">${sub}</div>`:''}
  </div>
  <div style="flex:1;display:flex;align-items:center;justify-content:center;gap:44px;padding-bottom:40px">
    ${mediaHtml}</div>`);

const out = {
  's1.html': shot(`See the <span class="accent">top 3 moves</span> — live on your board`,
                  crop(boardStart, 560), 'Best, second and third line, ranked by color'),
  's2.html': shot(`Instant Stockfish evaluation <span class="accent">at a glance</span>`,
    crop(boardRuy, 470) +
    `<img src="${popup}" style="height:560px;border-radius:12px;box-shadow:0 24px 60px rgba(0,0,0,.55)">`),
  's3.html': shot(`Tune engine <span class="accent">depth</span> and number of <span class="accent">lines</span>`,
    `<img src="${popup}" style="height:580px;border-radius:12px;box-shadow:0 24px 60px rgba(0,0,0,.55)">`,
    'Depth 10–25 · 1–3 lines · arrows on/off'),
  's4.html': shot(`Works on <span class="accent">live games</span> and analysis`,
                  crop(boardRuy, 560), 'Arrows follow every move automatically'),
  's5.html': page(1280,800,`
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px">
      <img src="${icon}" style="width:120px;height:120px">
      <h1 style="font-size:42px">Runs <span class="accent">100% locally</span></h1>
      <div class="sub" style="font-size:24px;line-height:1.9;text-align:center">
        No account. No sign-up.<br>Stockfish runs in your browser (WebAssembly).<br>
        <b style="color:#fff">No data ever leaves your machine.</b></div></div>`),
  't1.html': page(440,280,`
    <div style="flex:1;display:flex;align-items:center;justify-content:center;gap:22px;padding:0 24px">
      <img src="${icon}" style="width:84px;height:84px;flex:none">
      <div><div style="font-size:25px;font-weight:800;line-height:1.15">Chess.com<br>Analyzer</div>
        <div class="sub" style="font-size:14px;margin-top:6px">Top 3 moves, <span class="accent">live</span></div>
      </div>${crop(boardStart,120)}</div>`),
  't2.html': page(1400,560,`
    <div style="flex:1;display:flex;align-items:center;width:100%;padding-left:80px;gap:60px">
      <div style="flex:1">
        <img src="${icon}" style="width:88px;height:88px">
        <h1 style="font-size:52px;text-align:left;margin-top:18px">Chess.com Analyzer</h1>
        <div class="sub" style="font-size:26px;margin-top:12px">
          <span class="accent">Stockfish analysis</span>, right on Chess.com</div>
      </div>
      <div style="flex:none;margin-right:-40px">${crop(boardStart,520)}</div></div>`),
};

fs.mkdirSync(path.join(SRC,'pages'),{recursive:true});
for (const [f,html] of Object.entries(out)) fs.writeFileSync(path.join(SRC,'pages',f), html);
console.log('wrote', Object.keys(out).length, 'pages');
```

- [ ] **Step 3: Run it and verify the 7 pages exist**

```bash
cd "C:/Users/Zero/Desktop/chess.com-analyzer" && node store-assets/src/build.js && ls store-assets/src/pages/
```
Expected: `wrote 7 pages` and 7 `.html` files listed.

- [ ] **Step 4: Commit the build script + gitignore**

```bash
git add store-assets/src/build.js .gitignore
git commit -m "chore(store): HTML framing generator for CWS assets

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Render finals at exact sizes + dimension gate

**Files:**
- Create: `store-assets/{screenshot-1..5,tile-small,tile-marquee}.png`
- Create: `store-assets/src/check-dims.js`

**Interfaces:**
- Consumes: pages from Task 2.
- Produces: the 7 final PNGs (upload-ready) + a checker that exits 1 on any size mismatch.

- [ ] **Step 1: Write the dimension checker `store-assets/src/check-dims.js` FIRST (it is the failing test)**

```js
// check-dims.js — reads PNG IHDR bytes; exits 1 unless every asset is exact.
const fs = require('fs'), path = require('path');
const A = path.join(__dirname,'..');
const EXPECT = {
  'screenshot-1.png':[1280,800],'screenshot-2.png':[1280,800],'screenshot-3.png':[1280,800],
  'screenshot-4.png':[1280,800],'screenshot-5.png':[1280,800],
  'tile-small.png':[440,280],'tile-marquee.png':[1400,560],
};
let fail = 0;
for (const [f,[w,h]] of Object.entries(EXPECT)) {
  const p = path.join(A,f);
  if (!fs.existsSync(p)) { console.log(`MISSING ${f}`); fail++; continue; }
  const b = fs.readFileSync(p);
  const W = b.readUInt32BE(16), H = b.readUInt32BE(20);
  const ok = W===w && H===h;
  console.log(`${ok?'OK  ':'BAD '} ${f} ${W}x${H} (want ${w}x${h})`);
  if (!ok) fail++;
}
process.exit(fail?1:0);
```

- [ ] **Step 2: Run it — must fail with 7 MISSING**

```bash
node store-assets/src/check-dims.js; echo "exit=$?"
```
Expected: 7 × `MISSING`, `exit=1`.

- [ ] **Step 3: Render each page at its exact viewport**

```bash
cd "C:/Users/Zero/Desktop/chess.com-analyzer"
agent-browser close --all
agent-browser --executable-path "C:/Users/Zero/cft/chrome-win64/chrome.exe" \
  --profile "C:/Users/Zero/AppData/Local/Temp/ab-shoot-profile" \
  --args "--force-device-scale-factor=1" open
for spec in "s1 1280 800 screenshot-1" "s2 1280 800 screenshot-2" "s3 1280 800 screenshot-3" \
            "s4 1280 800 screenshot-4" "s5 1280 800 screenshot-5" \
            "t1 440 280 tile-small" "t2 1400 560 tile-marquee"; do
  set -- $spec
  agent-browser set viewport $2 $3
  agent-browser open "file:///C:/Users/Zero/Desktop/chess.com-analyzer/store-assets/src/pages/$1.html"
  agent-browser wait 500
  agent-browser screenshot "C:/Users/Zero/Desktop/chess.com-analyzer/store-assets/$4.png"
done
agent-browser close --all
```
Expected: 7 `✓ Screenshot saved` lines.

- [ ] **Step 4: Run the checker — must pass**

```bash
node store-assets/src/check-dims.js; echo "exit=$?"
```
Expected: 7 × `OK`, `exit=0`. If any PNG is 2× its size, the DPR flag didn't apply — relaunch with `--args "--force-device-scale-factor=1,--high-dpi-support=1"` and re-render.

- [ ] **Step 5: Commit**

```bash
git add store-assets/*.png store-assets/src/check-dims.js
git commit -m "feat(store): CWS listing assets (5 screenshots + 2 promo tiles)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Visual QA pass

**Files:**
- Possibly modify: `store-assets/src/build.js` (layout fixes) then re-run Task 3 steps 3–4.

**Interfaces:**
- Consumes: the 7 final PNGs.
- Produces: the approved final set (re-committed if changed).

- [ ] **Step 1: Read all 7 PNGs with the Read tool. Per-asset checklist:**
  - No cookie/consent banner or dev artifact anywhere.
  - Headline fully visible, not clipped; spelling matches the spec exactly.
  - Board crops show the full board with arrows + eval labels legible.
  - Popup image sharp (not upscaled blurry), bars visible on S2, sliders visible on S3.
  - T1/T2: icon not distorted, text vertically centered, board crop not cut mid-square.

- [ ] **Step 2: Fix → rebuild → re-render → re-check for any failing item**

```bash
node store-assets/src/build.js && bash -c '<Task 3 Step 3 loop>' && node store-assets/src/check-dims.js
```
Iterate until the checklist passes, then amend nothing — make a new commit:

```bash
git add -A store-assets && git commit -m "fix(store): visual QA adjustments

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 3: Report** — list the 7 final paths + one-line status each for the operator to review before pushing.
