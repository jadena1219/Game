// The Black Knight — hand-drawn pixel sprite for the hero (black plate / crimson).
// Every pixel is placed by hand in the grids below; no parametric humanoid.
//
//   frames:  idle | walk A | walk B | attack     (16x24 each, facing right)
//   stride:  walk A = LEFT (back-column) leg planted+lit, right arm forward
//            walk B = the exact mirror (legs + arm shades swap)  — per ART_SPEC
//   weapon:  NONE. The Living Blade is drawn in code over his hand
//            (game.js _drawHeldBlade), so the sprite must be empty-handed.
//
// Run:  node tools/gen-knight.js          (writes assets/sprites/knight.png
//                                          + /tmp/knight-preview.png at 10x)
const fs = require('fs');
const path = require('path');
const { encodePNG } = require('./png');

const FW = 16, FH = 24;
const OUTLINE = [0x1a, 0x12, 0x18, 0xff];

// palette — black plate, crimson cloth, hot visor glow
const PAL = {
  K: '#2b2731',   // blackened plate
  D: '#1c1923',   // plate shadow
  H: '#4e4a5e',   // plate edge light
  L: '#757088',   // bright steel rim
  R: '#c2242e',   // crimson (cape / crest / emblem / knees)
  r: '#7c141d',   // crimson shadow
  G: '#ff4040',   // visor glow
  W: '#ff9a7a',   // visor hot core
};

// 16 columns x 24 rows per frame; '.' = transparent
const FRAMES = {
  idle: [
    '................',
    '....rRR.........',
    '.....LKKKKK.....',
    '.....HKKKKK.....',
    '.....HDGGWK.....',
    '.....HKKKKD.....',
    '.....HKKKKD.....',
    '......DKKD......',
    '...LHHKKKKKHH...',
    '.rRKKHKKKKDKK...',
    '.rRKKHKRRKDKK...',
    '.rRKKHKRRKDKK...',
    '.rRKKHKKKKDKK...',
    '..rKKDDRRDDKK...',
    '..rDDKKKKKKHH...',
    '..rR.DDDDDD.....',
    '..rR.DD..KK.....',
    '..rR.DD..KK.....',
    '..rR.rr..RR.....',
    '..Rr.DD..KK.....',
    '..r..DD..KK.....',
    '.....DD..KK.....',
    '....DDD..DDD....',
    '....DDD..DDD....',
  ],
  walkA: [   // LEFT (back-column) leg planted + lit; RIGHT arm swung forward
    '................',
    '................',
    '....rRR.........',
    '.....LKKKKK.....',
    '.....HKKKKK.....',
    '.....HDGGWK.....',
    '.....HKKKKD.....',
    '.....HKKKKD.....',
    '......DKKD......',
    '...LHHKKKKKHH...',
    '.RKK.HKKKKD.KK..',
    '.RKK.HKRRKD.KK..',
    '.RKK.HKRRKD.KK..',
    '.rDD.HKKKKD.HH..',
    '.r...DDRRDD.....',
    '.r...DDDDDD.....',
    '.r...KK..DD.....',
    '.....KK..DD.....',
    '.....RR..rr.....',
    '.....KK..DD.....',
    '.....KK...DD....',
    '.....KK...DDD...',
    '....DDD...DDD...',
    '....DDD.........',
  ],
  walkB: [   // RIGHT (front-column) leg planted + lit; LEFT arm swung forward
    '................',
    '................',
    '....rRR.........',
    '.....LKKKKK.....',
    '.....HKKKKK.....',
    '.....HDGGWK.....',
    '.....HKKKKD.....',
    '.....HKKKKD.....',
    '......DKKD......',
    '...LHHKKKKKHH...',
    '.rRKKHKKKKDKK...',
    '.rRKKHKRRKDKK...',
    '.rRKKHKRRKDKK...',
    '.rRHHHKKKKDDD...',
    '.r...DDRRDD.....',
    '.r...DDDDDD.....',
    '.r...DD..KK.....',
    '.....DD..KK.....',
    '.....rr..RR.....',
    '.....DD..KK.....',
    '....DD...KK.....',
    '...DDD...KK.....',
    '...DDD...DDD....',
    '.........DDD....',
  ],
  attack: [  // lunge: torso shifts forward, right arm thrust out, stance braced
    '................',
    '.....rRR........',
    '......LKKKKK....',
    '......HKKKKK....',
    '......HDGWWKG...',
    '......HKKKKD....',
    '......HKKKKD....',
    '.......DKKD.....',
    '....LHHKKKKKHH..',
    '.rR.KKHKKKKDHHHH',
    '.rR.KKHKRRKD..HH',
    '.rR.KKHKRRKD....',
    '.rR.KKHKKKKD....',
    '..r.DDDDRRDD....',
    '..r...KKKKKK....',
    '......DDDDDD....',
    '....DD....KK....',
    '....DD....KK....',
    '....rr....RR....',
    '...DD.....KK....',
    '...DD.....KK....',
    '...DD.....KK....',
    '..DDD.....DDD...',
    '..DDD.....DDD...',
  ],
};

const ORDER = ['idle', 'walkA', 'walkB', 'attack'];

function hex(h) {
  h = h.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 255];
}

function validate() {
  for (const [name, rows] of Object.entries(FRAMES)) {
    if (rows.length !== FH) throw new Error(`${name}: ${rows.length} rows (want ${FH})`);
    rows.forEach((row, y) => {
      if (row.length !== FW) throw new Error(`${name} row ${y}: ${row.length} cols (want ${FW})`);
      for (const ch of row) if (ch !== '.' && !PAL[ch]) throw new Error(`${name} row ${y}: unknown '${ch}'`);
    });
  }
}

// Build the 64x24 RGBA sheet, with the same auto 1px outline the cast uses.
function buildKnightSheetRGBA() {
  validate();
  const W = FW * ORDER.length, H = FH;
  const d = new Uint8Array(W * H * 4);
  const put = (x, y, c) => { const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3]; };
  ORDER.forEach((name, f) => {
    const rows = FRAMES[name];
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      const ch = rows[y][x];
      if (ch !== '.') put(f * FW + x, y, hex(PAL[ch]));
    }
    // outline within this frame's cell only (frames must not bleed into neighbours)
    const op = (x, y) => x >= 0 && y >= 0 && x < FW && y < FH && rows[y][x] !== '.';
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      if (op(x, y)) continue;
      if (op(x - 1, y) || op(x + 1, y) || op(x, y - 1) || op(x, y + 1) ||
          op(x - 1, y - 1) || op(x + 1, y - 1) || op(x - 1, y + 1) || op(x + 1, y + 1)) {
        put(f * FW + x, y, OUTLINE);
      }
    }
  });
  return { w: W, h: H, d };
}

// A big nearest-neighbour preview on a dungeon-dark background, for eyeballing.
function buildPreview(sheet, scale = 10, gap = 12) {
  const bg = [0x18, 0x10, 0x1e, 255];
  const W = (FW * scale + gap) * ORDER.length + gap;
  const H = FH * scale + gap * 2;
  const d = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) { d[i * 4] = bg[0]; d[i * 4 + 1] = bg[1]; d[i * 4 + 2] = bg[2]; d[i * 4 + 3] = 255; }
  for (let f = 0; f < ORDER.length; f++) {
    const ox = gap + f * (FW * scale + gap), oy = gap;
    for (let y = 0; y < FH * scale; y++) for (let x = 0; x < FW * scale; x++) {
      const sx = f * FW + (x / scale | 0), sy = y / scale | 0;
      const si = (sy * sheet.w + sx) * 4;
      if (sheet.d[si + 3] === 0) continue;
      const di = ((oy + y) * W + ox + x) * 4;
      d[di] = sheet.d[si]; d[di + 1] = sheet.d[si + 1]; d[di + 2] = sheet.d[si + 2]; d[di + 3] = 255;
    }
  }
  return { w: W, h: H, d };
}

function main() {
  const sheet = buildKnightSheetRGBA();
  const out = path.join(__dirname, '..', 'assets', 'sprites', 'knight.png');
  fs.writeFileSync(out, encodePNG(sheet.w, sheet.h, sheet.d));
  console.log(`  ✓ knight.png (${sheet.w}x${sheet.h})`);
  const pv = buildPreview(sheet);
  fs.writeFileSync('/tmp/knight-preview.png', encodePNG(pv.w, pv.h, pv.d));
  console.log('  ✓ /tmp/knight-preview.png');
}

module.exports = { buildKnightSheetRGBA };
if (require.main === module) main();
