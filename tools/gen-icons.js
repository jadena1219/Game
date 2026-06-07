// Pixel-art icons for the ability/upgrade cards (16x16 PNGs).
// Generated with the same dependency-free PNG encoder as the sprites.
const fs = require('fs');
const path = require('path');
const { encodePNG } = require('./png');

const S = 16;
const OUT = [0x12, 0x0d, 0x16, 0xff];

function hex(h) {
  h = h.replace('#', ''); if (h.length === 6) h += 'ff';
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16), parseInt(h.slice(6, 8), 16)];
}

class G {
  constructor() { this.d = new Uint8Array(S * S * 4); }
  px(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 4; this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = c[3];
  }
  rect(x0, y0, x1, y1, c) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.px(x, y, c); }
  disc(cx, cy, r, c) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++)
      if (x * x + y * y <= r * r + 0.5) this.px(cx + x, cy + y, c);
  }
  line(x0, y0, x1, y1, c, t = 0) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx - dy;
    for (;;) {
      if (t) this.disc(x0, y0, t, c); else this.px(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err; if (e2 > -dy) { err -= dy; x0 += sx; } if (e2 < dx) { err += dx; y0 += sy; }
    }
  }
  outline() {
    const o = this.d.slice();
    const op = (x, y) => (x >= 0 && y >= 0 && x < S && y < S) && o[(y * S + x) * 4 + 3] > 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (op(x, y)) continue;
      if (op(x - 1, y) || op(x + 1, y) || op(x, y - 1) || op(x, y + 1)) this.px(x, y, OUT);
    }
  }
}

// ---- icon painters ----
const ICONS = {
  fireball(g) {
    const r = hex('#d8330f'), o = hex('#ff7a1e'), y = hex('#ffd23a'), w = hex('#fff6c8');
    // flame tip
    g.line(8, 1, 8, 4, r); g.px(9, 3, o);
    g.disc(8, 9, 6, r);             // outer
    g.disc(8, 10, 5, o);            // mid
    g.disc(8, 11, 3, y);            // inner
    g.disc(8, 11, 2, w);            // hot core
    g.px(8, 4, o); g.px(7, 6, o); g.px(10, 6, r);
    g.px(4, 8, o); g.px(12, 8, o);
  },
  lightning(g) {
    const y = hex('#ffe23a'), e = hex('#f0a000');
    const pts = [[10, 1], [6, 8], [9, 8], [5, 15]];
    g.line(pts[0][0], pts[0][1], pts[1][0], pts[1][1], y);
    g.line(pts[1][0], pts[1][1], pts[2][0], pts[2][1], y);
    g.line(pts[2][0], pts[2][1], pts[3][0], pts[3][1], y);
    // thicken
    g.line(11, 1, 7, 8, e); g.line(8, 8, 6, 15, e);
    g.line(10, 1, 6, 8, y); g.line(9, 8, 5, 15, y);
  },
  frost(g) {
    const c = hex('#bdf0ff'), b = hex('#6fd0ff');
    g.line(8, 1, 8, 14, c); g.line(2, 4, 14, 12, c); g.line(14, 4, 2, 12, c);
    // tips
    const tip = (x, y, dx, dy) => { g.px(x + dx, y + dy, b); g.px(x - dx, y + dy, b); };
    tip(8, 3, 2, 1); tip(8, 12, 2, -1);
    g.px(8, 8, hex('#ffffff'));
  },
  whirlwind(g) {
    const c = hex('#cfe9ff'), b = hex('#8fc8ff');
    for (let a = 0; a < 11; a += 0.35) {
      const rr = a * 0.62;
      g.px(8 + Math.cos(a) * rr, 8 + Math.sin(a) * rr, a > 6 ? c : b);
    }
    g.disc(8, 8, 1, hex('#ffffff'));
  },
  power(g) { // sharpened blade
    const steel = hex('#cdd6e2'), edge = hex('#ffffff'), gold = hex('#e9c84a'), grip = hex('#6b4a2a');
    g.line(4, 13, 12, 3, steel); g.line(5, 13, 13, 3, steel);
    g.line(12, 3, 13, 3, edge); g.line(12, 4, 13, 5, edge);
    g.rect(3, 12, 5, 14, gold);   // guard
    g.line(2, 15, 4, 13, grip);   // pommel
  },
  haste(g) { // swift strikes: blade + motion streaks
    const steel = hex('#d6dde8'), c = hex('#7fe0ff'), gold = hex('#e9c84a');
    g.line(6, 13, 13, 4, steel); g.line(7, 13, 14, 4, steel);
    g.rect(5, 12, 7, 14, gold);
    g.line(2, 5, 6, 5, c); g.line(2, 8, 7, 8, c); g.line(3, 11, 6, 11, c); // speed lines
  },
  reach(g) { // long reach: long spear + range arc
    const steel = hex('#d6dde8'), edge = hex('#ffffff'), c = hex('#9fe0ff'), brown = hex('#6b4a2a');
    g.line(2, 14, 13, 3, brown);
    g.line(3, 14, 14, 3, steel);
    g.px(14, 3, edge); g.px(13, 3, edge); g.px(14, 4, edge);
    // range arc
    for (let a = -0.7; a < 0.7; a += 0.12) g.px(11 + Math.cos(a) * 4, 11 + Math.sin(a) * 4, c);
  },
  swift(g) { // winged boots
    const br = hex('#7a5230'), brd = hex('#5a3d22'), w = hex('#f4f7ff'), wb = hex('#bcd0ff');
    // boot (L shape)
    g.rect(7, 4, 9, 12, br); g.rect(7, 11, 13, 13, br);
    g.rect(7, 4, 7, 12, brd); g.rect(13, 12, 13, 13, brd);
    g.rect(7, 13, 13, 13, brd);
    // wing
    g.line(2, 6, 6, 7, w); g.line(2, 8, 6, 9, w); g.line(3, 10, 6, 10, wb);
    g.px(2, 6, wb); g.px(2, 8, wb);
  },
  lifesteal(g) { // green plus
    const gr = hex('#4cd964'), gd = hex('#2f9d46'), lt = hex('#b8ffc6');
    g.rect(6, 3, 9, 12, gr); g.rect(3, 6, 12, 9, gr);
    g.rect(7, 3, 8, 12, lt); g.rect(3, 7, 12, 8, lt);
    // shading
    g.rect(6, 11, 9, 12, gd); g.rect(10, 6, 12, 9, gd);
  },
  fury(g) { // wrath: spiky burst star
    const r = hex('#e23a12'), o = hex('#ff8a1e'), y = hex('#ffd23a');
    // 8-point star
    const spikes = [[8, 0], [8, 15], [0, 8], [15, 8], [3, 3], [13, 3], [3, 13], [13, 13]];
    for (const [x, y2] of spikes) g.line(8, 8, x, y2, r);
    g.disc(8, 8, 4, o); g.disc(8, 8, 2, y);
  },
  arcane(g) { // purple gem + sparkle
    const p = hex('#9a59e0'), pd = hex('#6b34b0'), lt = hex('#d9b8ff'), w = hex('#ffffff');
    // diamond gem
    for (let y = 0; y <= 5; y++) g.rect(8 - y, 6 + y, 8 + y, 6 + y, p);
    for (let y = 0; y <= 4; y++) g.rect(8 - (4 - y), 12 - y, 8 + (4 - y), 12 - y, p);
    g.rect(6, 6, 10, 6, lt); g.line(8, 2, 8, 6, lt); // top facet/stem
    g.rect(8, 7, 8, 11, pd);
    // sparkle
    g.px(13, 3, w); g.px(13, 2, w); g.px(13, 4, w); g.px(12, 3, w); g.px(14, 3, w);
  },
  dashmaster(g) { // fleetfoot: double chevron (fast-forward)
    const c = hex('#7fe0ff'), b = hex('#3aa0d8');
    const chev = (ox) => { g.line(ox, 3, ox + 4, 8, c); g.line(ox + 4, 8, ox, 13, c);
      g.line(ox + 1, 3, ox + 5, 8, b); g.line(ox + 5, 8, ox + 1, 13, b); };
    chev(3); chev(8);
  },
};

function main() {
  const dir = path.join(__dirname, '..', 'assets', 'icons');
  fs.mkdirSync(dir, { recursive: true });
  const manifest = { size: S, icons: {} };
  for (const [id, paint] of Object.entries(ICONS)) {
    const g = new G();
    paint(g);
    g.outline();
    fs.writeFileSync(path.join(dir, `${id}.png`), encodePNG(S, S, g.d));
    manifest.icons[id] = `${id}.png`;
    console.log(`  ✓ ${id}.png`);
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`  ✓ manifest.json (${Object.keys(ICONS).length} icons)`);
}
main();
