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

// Popup crop: the 400×620 capture has a dead dark lower third below the
// content. Show only the top `PC` px, scaled to `w` px wide (cap at native
// 400 to stay sharp), wrapped so the wrapper supplies the rounded bottom.
const POPUP_W = 400, POPUP_CONTENT = 416;
const popupCrop = (w) => {
  const s = w / POPUP_W;
  return `<div style="width:${w}px;height:${Math.round(POPUP_CONTENT*s)}px;overflow:hidden;
    border-radius:12px;box-shadow:0 24px 60px rgba(0,0,0,.55);flex:none">
    <img src="${popup}" style="width:${w}px;display:block"></div>`;
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
    crop(boardRuy, 470) + popupCrop(400)),
  's3.html': shot(`Tune engine <span class="accent">depth</span> and number of <span class="accent">lines</span>`,
    popupCrop(400),
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
