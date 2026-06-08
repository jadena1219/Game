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

// ---- icon painters (ids match forge + relic ids) ----
const ICONS = {
  // --- forge ---
  power(g) { // Sharpen Blade
    const steel = hex('#cdd6e2'), edge = hex('#ffffff'), gold = hex('#e9c84a'), grip = hex('#6b4a2a');
    g.line(4, 13, 12, 3, steel); g.line(5, 13, 13, 3, steel);
    g.line(12, 3, 13, 3, edge); g.line(12, 4, 13, 5, edge);
    g.rect(3, 12, 5, 14, gold); g.line(2, 15, 4, 13, grip);
  },
  armor(g) { // Reinforce Armor: shield
    const st = hex('#9fb4cf'), dk = hex('#5d6e8a'), lt = hex('#d4e0f2'), gold = hex('#e9c84a');
    for (let y = 2; y <= 9; y++) { const w = 6; g.rect(8 - w, y, 8 + w, y, st); }
    for (let y = 10; y <= 14; y++) { const w = 6 - (y - 9) * 1.2; g.rect(Math.round(8 - w), y, Math.round(8 + w), y, st); }
    g.line(2, 3, 8, 14, dk); g.rect(8, 2, 9, 6, lt);
    g.line(8, 4, 8, 11, gold); g.line(5, 7, 11, 7, gold); // emblem cross
  },
  whet(g) { // Whetstone: stone + blade + spark
    const stone = hex('#6f6a7e'), sd = hex('#4a4658'), steel = hex('#cdd6e2'), w = hex('#ffffff');
    g.rect(3, 10, 13, 13, stone); g.rect(3, 13, 13, 13, sd);
    g.line(4, 9, 12, 4, steel); g.line(5, 9, 13, 4, steel);
    g.px(13, 3, w); g.px(12, 3, w); g.px(13, 4, w); g.px(13, 2, w); g.px(14, 3, w); // spark
  },
  boots(g) { // Swift Boots: winged boot
    const br = hex('#7a5230'), brd = hex('#5a3d22'), w = hex('#f4f7ff'), wb = hex('#bcd0ff');
    g.rect(7, 4, 9, 12, br); g.rect(7, 11, 13, 13, br);
    g.rect(7, 4, 7, 12, brd); g.rect(7, 13, 13, 13, brd);
    g.line(2, 6, 6, 7, w); g.line(2, 8, 6, 9, w); g.line(3, 10, 6, 10, wb);
  },
  reach(g) { // Long Reach: spear + arc
    const steel = hex('#d6dde8'), edge = hex('#ffffff'), c = hex('#9fe0ff'), brown = hex('#6b4a2a');
    g.line(2, 14, 13, 3, brown); g.line(3, 14, 14, 3, steel);
    g.px(14, 3, edge); g.px(13, 3, edge);
    for (let a = -0.7; a < 0.7; a += 0.12) g.px(11 + Math.cos(a) * 4, 11 + Math.sin(a) * 4, c);
  },
  wrath(g) { // Wrath: burst star
    const r = hex('#e23a12'), o = hex('#ff8a1e'), y = hex('#ffd23a');
    const spikes = [[8, 0], [8, 15], [0, 8], [15, 8], [3, 3], [13, 3], [3, 13], [13, 13]];
    for (const [x, y2] of spikes) g.line(8, 8, x, y2, r);
    g.disc(8, 8, 4, o); g.disc(8, 8, 2, y);
  },
  // --- relics ---
  vampire(g) { // Vampiric Fang
    const w = hex('#f4f2ea'), sh = hex('#c9c4b4'), red = hex('#c01828'), rl = hex('#ff4a5a');
    g.rect(5, 2, 10, 4, w); g.line(6, 4, 4, 11, w); g.line(9, 4, 11, 11, w);
    g.px(5, 5, sh); g.px(10, 5, sh);
    g.disc(8, 13, 1, red); g.px(8, 11, rl); g.px(8, 13, rl); // blood drop
  },
  ember(g) { // Ember Crown
    const gold = hex('#e9c84a'), gd = hex('#a8841f'), red = hex('#d8330f'), o = hex('#ff7a1e');
    g.rect(3, 9, 13, 13, gold); g.rect(3, 13, 13, 13, gd);
    g.line(3, 9, 3, 4, gold); g.line(8, 9, 8, 2, gold); g.line(13, 9, 13, 4, gold);
    g.px(3, 4, o); g.px(8, 2, o); g.px(13, 4, o);
    g.disc(8, 11, 1, red); g.px(5, 11, red); g.px(11, 11, red);
  },
  thunder(g) { // Thunderbrand: blade + bolt
    const steel = hex('#cdd6e2'), y = hex('#ffe23a'), e = hex('#f0a000');
    g.line(4, 14, 11, 5, steel); g.line(5, 14, 12, 5, steel);
    g.line(11, 1, 8, 7, y); g.line(8, 7, 11, 7, y); g.line(11, 7, 8, 13, y);
    g.line(11, 1, 9, 6, e);
  },
  frost(g) { // Frostbite Edge: snowflake
    const c = hex('#bdf0ff'), b = hex('#6fd0ff'), w = hex('#ffffff');
    g.line(8, 1, 8, 14, c); g.line(2, 4, 14, 12, c); g.line(14, 4, 2, 12, c);
    const tip = (x, y, dx, dy) => { g.px(x + dx, y + dy, b); g.px(x - dx, y + dy, b); };
    tip(8, 3, 2, 1); tip(8, 12, 2, -1); g.px(8, 8, w);
  },
  stone(g) { // Stoneheart: boulder
    const st = hex('#7a7488'), lt = hex('#a59abd'), dk = hex('#4f4a5e');
    g.disc(8, 9, 5, st); g.rect(3, 9, 13, 13, st); g.rect(3, 13, 13, 13, dk);
    g.disc(6, 7, 1, lt); g.px(10, 8, dk); g.px(7, 11, dk);
  },
  berserk(g) { // Berserker's Heart
    const r = hex('#d01828'), dk = hex('#8a0e1c'), lt = hex('#ff5a6a');
    g.disc(5, 6, 2, r); g.disc(11, 6, 2, r);
    for (let y = 0; y <= 6; y++) { const w = 6 - y; g.rect(8 - w, 7 + y, 8 + w, 7 + y, r); }
    g.px(4, 5, lt); g.px(10, 5, lt); g.line(8, 7, 7, 12, dk);
  },
  idol(g) { // Golden Idol: coin
    const gold = hex('#e9c84a'), gd = hex('#a8841f'), lt = hex('#fff0a8');
    g.disc(8, 8, 6, gold); g.disc(8, 8, 6, gold);
    g.line(8, 4, 8, 12, gd); g.line(5, 8, 11, 8, gd); // rune
    g.px(5, 5, lt); g.px(6, 4, lt);
  },
  wind(g) { // Windrunner Boots: gust
    const c = hex('#cfe9ff'), b = hex('#7fc8ff'), w = hex('#ffffff');
    g.line(2, 4, 11, 4, c); for (let x = 11; x <= 13; x++) g.px(x, 4 - (x - 11), b);
    g.line(3, 8, 13, 8, w); for (let x = 13; x >= 11; x--) g.px(x, 8 + (13 - x), b);
    g.line(2, 12, 10, 12, c); for (let x = 10; x <= 12; x++) g.px(x, 12 - (x - 10), b);
  },
  exec(g) { // Executioner's Seal: axe
    const steel = hex('#cdd6e2'), dk = hex('#7a8294'), brown = hex('#6b4a2a'), edge = hex('#ffffff');
    g.line(7, 2, 7, 14, brown); g.line(8, 2, 8, 14, brown); // haft
    g.rect(8, 2, 14, 7, steel); g.line(14, 2, 14, 7, dk);
    for (let y = 2; y <= 7; y++) g.px(8, y, edge);
    g.rect(9, 3, 13, 3, edge);
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
