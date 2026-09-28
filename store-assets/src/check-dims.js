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
