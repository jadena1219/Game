// Procedurally-generated sprites — brand-new creatures + keystone icons drawn in
// code (no art files). Each named-elite sheet is 4 frames (idle / walkA / walkB /
// attack) of a unique 16×24 silhouette, registered into Assets like any sprite.
import { Assets } from './assets.js';

// Build a 64×24 four-frame sheet from a per-frame draw fn, register it.
function sheet(name, scale, draw) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 24;
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  for (let f = 0; f < 4; f++) draw(ctx, f * 16, f);
  Assets.images[name] = c;
  Assets.manifest.sprites[name] = { scale, generated: true };
}

// frame helpers: a gentle walk cycle + an attack lunge
const phase = (f) => ({ walk: f === 1 ? -1 : f === 2 ? 1 : 0, bob: (f === 1 || f === 2) ? -1 : 0, atk: f === 3 });

// ---------------------------------------------------------------------------
// GRAVEWARDEN — a hulking armoured keeper lugging a tombstone slab. Steel + cyan.
function gravewarden(ctx, ox, f) {
  const { walk, bob, atk } = phase(f);
  const p = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(ox + x, y, w, h); };
  const dark = '#2f3543', steel = '#7e8aa0', lite = '#a6b1c6', glow = '#bfe9ff';
  // tombstone slab carried on the left (rounded headstone + cross)
  p(1, 6, 4, 15, '#5c6577'); p(1, 6, 4, 2, lite); p(2, 7, 2, 1, '#8a93a6');
  p(2, 10, 1, 6, dark); p(1, 12, 3, 1, dark);
  // legs
  p(7, 20, 2, 3 + (walk < 0 ? 1 : 0), dark); p(11, 20, 2, 3 + (walk > 0 ? 1 : 0), dark);
  // broad torso + pauldrons
  p(6, 9 + bob, 8, 11, steel); p(6, 9 + bob, 8, 2, lite);
  p(5, 9 + bob, 2, 4, dark); p(13, 9 + bob, 2, 4, dark);
  p(7, 14 + bob, 6, 1, dark);
  // helmet + visor slit
  p(7, 3 + bob, 6, 6, steel); p(7, 3 + bob, 6, 1, lite);
  p(8, 6 + bob, 4, 1, '#10131b'); p(9, 6 + bob, 2, 1, glow);
  // a heavy gauntlet thrusts out on attack
  if (atk) p(14, 12, 2, 3, lite);
}

// QUICKFANG — a low, darting fanged beast. Teal hide, cyan eyes, white fangs.
function quickfang(ctx, ox, f) {
  const { walk, bob, atk } = phase(f);
  const p = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(ox + x, y, w, h); };
  const hide = '#1f5a5e', dk = '#103438', cy = '#7fe0ff';
  const lean = atk ? 2 : 0;
  // four skittering legs
  p(3, 20, 2, 3 - (walk < 0 ? 1 : 0), dk); p(6, 20, 2, 3 + (walk < 0 ? 1 : 0), dk);
  p(9, 20, 2, 3 + (walk > 0 ? 1 : 0), dk); p(12, 20, 2, 3 - (walk > 0 ? 1 : 0), dk);
  // low slung body
  p(3, 14 + bob, 10, 6, hide); p(3, 14 + bob, 10, 1, '#2c7a80');
  // forward head with a gaping maw
  p(11 + lean, 12 + bob, 4, 6, hide);
  p(13 + lean, 16 + bob, 2, 1, '#0a1d1f'); p(13 + lean, 17 + bob, 2, 1, '#fff');   // fang
  p(13 + lean, 13 + bob, 1, 1, cy);                                                  // eye
  // back spines
  p(4, 13 + bob, 1, 1, cy); p(7, 12 + bob, 1, 1, cy); p(10, 13 + bob, 1, 1, cy);
}

// THE PALE WIDOW — a spider-sorceress: bulbous abdomen, spindly legs, hooded head.
function palewidow(ctx, ox, f) {
  const { walk, atk } = phase(f);
  const p = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(ox + x, y, w, h); };
  const dk = '#243a52', ice = '#bdf0ff', body = '#3f5f7e';
  const sway = walk;
  // eight splayed legs (lines)
  ctx.strokeStyle = dk; ctx.lineWidth = 1;
  const legs = [[-1, 18], [-2, 21], [17, 18], [18, 21], [1, 22], [15, 22]];
  ctx.beginPath();
  for (const [lx, ly] of legs) { ctx.moveTo(ox + 8, 16); ctx.lineTo(ox + lx + sway, ly); }
  ctx.stroke();
  // round abdomen
  p(5, 13, 6, 7, body); p(6, 13, 4, 1, ice); p(7, 16, 2, 2, dk);
  // hooded upper + pale face
  p(6, 6, 4, 7, dk); p(7, 8, 2, 2, ice);
  p(6, 5, 4, 2, '#34506e');
  // ice motes when casting
  if (atk) { p(11, 9, 1, 1, ice); p(13, 11, 1, 1, ice); p(12, 13, 1, 1, '#eaffff'); }
}

// HOLLOW LORD — a tall gaunt wraith-king: jagged crown, hollow red eyes, ragged robe.
function hollowlord(ctx, ox, f) {
  const { walk, bob, atk } = phase(f);
  const p = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(ox + x, y, w, h); };
  const robe = '#2a1018', robe2 = '#3d1822', bone = '#cabba2', red = '#ff3b3b', gold = '#7a5a1e';
  // ragged hem (splits as it walks)
  p(4 + (walk < 0 ? -1 : 0), 21, 3, 3, robe); p(9 + (walk > 0 ? 1 : 0), 21, 3, 3, robe);
  // tall tattered robe
  p(4, 9 + bob, 8, 13, robe); p(5, 9 + bob, 6, 1, robe2);
  p(4, 18 + bob, 8, 1, robe2); p(6, 15 + bob, 1, 4, robe2); p(9, 15 + bob, 1, 4, robe2);
  // skeletal hands
  p(3, 13 + bob, 1, 3, bone); p(12, 13 + bob, 1, 3, bone);
  // gaunt skull face
  p(6, 4 + bob, 4, 6, bone); p(7, 7 + bob, 2, 3, '#1a0d10');
  p(6, 6 + bob, 1, 1, red); p(9, 6 + bob, 1, 1, red);
  // jagged crown
  p(5, 2 + bob, 6, 2, gold); p(5, 1 + bob, 1, 1, gold); p(8, 0 + bob, 1, 2, gold); p(10, 1 + bob, 1, 1, gold);
  // a reaching claw on attack
  if (atk) { p(13, 11, 1, 4, bone); p(12, 11, 1, 1, red); }
}

// EMBERFIEND — a molten rock golem, glowing lava cracks across dark stone.
function emberfiend(ctx, ox, f) {
  const { walk, bob, atk } = phase(f);
  const p = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(ox + x, y, w, h); };
  const rock = '#3a322f', rock2 = '#26201e', lava = '#ff7a2a', hot = '#ffd36b';
  // stubby molten legs
  p(5, 20, 3, 3 + (walk < 0 ? 1 : 0), rock); p(9, 20, 3, 3 + (walk > 0 ? 1 : 0), rock);
  p(6, 22, 1, 1, lava); p(10, 22, 1, 1, lava);
  // boulder torso + heavy arms
  p(3, 9 + bob, 10, 11, rock); p(3, 9 + bob, 10, 1, '#4a413c');
  p(2, 11 + bob, 2, 6, rock2); p(12, 11 + bob, 2, 6, rock2);
  // glowing lava cracks + core
  p(6, 11 + bob, 1, 5, lava); p(5, 13 + bob, 4, 1, lava); p(9, 12 + bob, 1, 3, lava);
  p(7, 14 + bob, 2, 2, hot);
  // small craggy head
  p(6, 5 + bob, 4, 4, rock); p(7, 6 + bob, 1, 1, hot); p(8, 6 + bob, 1, 1, hot);
  // erupting on attack
  if (atk) { p(4, 8 + bob, 1, 1, hot); p(11, 8 + bob, 1, 1, lava); p(8, 4 + bob, 1, 1, hot); }
}

// DREADCALLER — a hooded cultist channelling a floating skull-orb. Violet glow.
function dreadcaller(ctx, ox, f) {
  const { walk, bob, atk } = phase(f);
  const p = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(ox + x, y, w, h); };
  const robe = '#3a2356', robe2 = '#523178', vio = '#c89aff', bone = '#e7dcc4';
  // robe hem
  p(4 + (walk < 0 ? -1 : 0), 20, 3, 4, robe); p(9 + (walk > 0 ? 1 : 0), 20, 3, 4, robe);
  // robe body
  p(4, 8 + bob, 8, 13, robe); p(5, 8 + bob, 6, 1, robe2); p(7, 12 + bob, 2, 8, robe2);
  // deep hood, shadowed face with violet eyes
  p(5, 3 + bob, 6, 7, robe2); p(6, 5 + bob, 4, 4, '#160c22');
  p(7, 6 + bob, 1, 1, vio); p(9, 6 + bob, 1, 1, vio);
  // outstretched glowing hands
  p(2, 13 + bob, 2, 2, bone); p(12, 13 + bob, 2, 2, bone);
  p(2, 12 + bob, 1, 1, vio); p(13, 12 + bob, 1, 1, vio);
  // a floating skull-orb conjured in front (bigger / brighter on attack)
  const oy = bob - (atk ? 1 : 0);
  p(7, 0 + oy, 3, 3, bone); p(7, 3 + oy, 3, 1, bone);
  p(7, 1 + oy, 1, 1, '#2a1d10'); p(9, 1 + oy, 1, 1, '#2a1d10');
  if (atk) { p(6, 1 + oy, 1, 1, vio); p(10, 1 + oy, 1, 1, vio); }
}

// The hero — a sleek black-armoured knight: obsidian plate with silver edges,
// a glowing visor, horned helm, and a long crimson-lined cape. Empty-handed
// (he carries the chosen Living Blade, drawn separately and BIG). A real,
// readable stride across the four frames.
function knightUnarmed(ctx, ox, f) {
  const p = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(ox + x, y, w, h); };
  const K = '#14141d', K2 = '#262632', EDGE = '#4a4a5e', SIL = '#828299', GLOW = '#74e0ff';
  const GOLD = '#caa54a', CAPE = '#181820', CAPEL = '#7c1623', GREV = '#0b0b11';
  const bob = (f === 1 || f === 2) ? -1 : 0, lean = f === 3 ? 1 : 0;
  // cape, trailing and fluttering
  const cx = f === 1 ? 1 : f === 3 ? 3 : 2;
  p(cx, 6 + bob, 5, 14, CAPE); p(cx, 6 + bob, 1, 14, CAPEL); p(cx + 1, 18 + bob, 5, 3, CAPE);
  // legs — a clear alternating stride
  const leg = (x, y, h) => { p(x, y, 2, h, K); p(x, y, 1, h, K2); p(x, y + 2, 2, 1, SIL); p(x, y + h - 1, 2, 1, GREV); };
  if (f === 0) { leg(6, 17, 6); leg(9, 17, 6); }
  else if (f === 1) { leg(5, 18, 5); leg(10, 16, 6); }
  else if (f === 2) { leg(6, 16, 6); leg(9, 18, 5); }
  else { leg(4, 18, 5); leg(11, 18, 5); }
  // back arm + small angular shield
  p(4 + lean, 11 + bob, 2, 5, K); p(3 + lean, 12 + bob, 2, 4, K2); p(3 + lean, 12 + bob, 1, 4, EDGE);
  // cuirass — slim, tapered, sharp
  p(6 + lean, 9 + bob, 5, 8, K); p(6 + lean, 9 + bob, 5, 1, EDGE); p(6 + lean, 9 + bob, 1, 8, K2);
  p(7 + lean, 10 + bob, 3, 4, K2); p(8 + lean, 11 + bob, 1, 1, GLOW);   // chest gem
  p(7 + lean, 16 + bob, 4, 1, GOLD);                                   // belt
  p(6 + lean, 9 + bob, 5, 1, SIL);                                     // gorget
  // pointed pauldrons
  p(5 + lean, 9 + bob, 2, 2, K2); p(5 + lean, 8 + bob, 1, 1, SIL);
  p(10 + lean, 9 + bob, 2, 2, K2); p(11 + lean, 8 + bob, 1, 1, SIL);
  // sword-hand gauntlet reaching forward (the blade attaches here)
  p(11 + lean, 11 + bob, 2, 4, K); p(12 + lean, 13 + bob, 2, 3, EDGE); p(12 + lean, 13 + bob, 2, 1, SIL);
  // helm — sleek, horned, glowing visor
  p(6 + lean, 3 + bob, 6, 6, K); p(6 + lean, 3 + bob, 6, 1, EDGE); p(6 + lean, 4 + bob, 1, 5, K2);
  p(7 + lean, 6 + bob, 4, 2, '#07070c'); p(8 + lean, 6 + bob, 3, 1, GLOW);   // visor + glow
  p(5 + lean, 1 + bob, 1, 3, SIL); p(11 + lean, 1 + bob, 1, 3, SIL);         // horns
  p(5 + lean, 1 + bob, 1, 1, '#a8a8c0'); p(11 + lean, 1 + bob, 1, 1, '#a8a8c0');
}

// The named-elite roster (names match NAMED_FOES[].sprite in game.js).
export const CREATURES = [
  { name: 'knight', scale: 1, draw: knightUnarmed },
  { name: 'gravewarden', scale: 1.6,  draw: gravewarden },
  { name: 'quickfang',   scale: 0.95, draw: quickfang },
  { name: 'palewidow',   scale: 1.2,  draw: palewidow },
  { name: 'hollowlord',  scale: 1.35, draw: hollowlord },
  { name: 'emberfiend',  scale: 1.6,  draw: emberfiend },
  { name: 'dreadcaller', scale: 1.2,  draw: dreadcaller },
];

export function registerGeneratedSprites() {
  if (!Assets.manifest || !Assets.manifest.sprites) return;
  for (const c of CREATURES) sheet(c.name, c.scale, c.draw);
  Assets.bladeSwords = buildBladeSwords();   // full-res sword canvases for the shrine
}

// ---------------------------------------------------------------------------
// Keystone relic icons — drawn on a 24×24 grid, exported as data-URLs the shop
// uses in place of a missing PNG.
export const ICON_DRAWERS = {
  // Cinderstep — a flaming boot
  cinderstep: (p) => {
    p(6, 14, 7, 6, '#5a3a22'); p(6, 18, 11, 3, '#3a2414'); p(13, 16, 4, 3, '#5a3a22');
    p(6, 14, 7, 1, '#7a5230'); p(6, 19, 11, 1, '#241509');
    p(7, 10, 3, 4, '#ff7a2a'); p(11, 8, 3, 6, '#ff7a2a'); p(9, 6, 3, 8, '#ffb02a');
    p(10, 4, 2, 5, '#ffd86b'); p(8, 9, 1, 3, '#fff0b0'); p(12, 7, 1, 3, '#ffe27a');
  },
  // Mirror Aegis — a shield with an arrow ricocheting off it
  aegis: (p) => {
    p(8, 4, 8, 12, '#5a6b86'); p(8, 14, 8, 4, '#3f4d63'); p(10, 16, 4, 3, '#5a6b86');
    p(8, 4, 8, 2, '#9fb0cc'); p(10, 7, 4, 6, '#bfe9ff'); p(11, 5, 1, 9, '#eaf6ff');
    p(2, 9, 5, 2, '#cdd6e6'); p(6, 8, 2, 4, '#cdd6e6'); p(1, 10, 1, 1, '#9fb0cc');
    p(16, 6, 2, 2, '#fff0b0'); p(18, 9, 2, 2, '#ffd86b'); p(17, 13, 2, 2, '#fff');
  },
  // Heart of Fury — a burning heart
  bloodfury: (p) => {
    p(7, 7, 4, 4, '#d8231a'); p(13, 7, 4, 4, '#d8231a'); p(6, 9, 12, 4, '#d8231a');
    p(8, 13, 8, 3, '#b3160f'); p(10, 16, 4, 2, '#b3160f'); p(11, 18, 2, 1, '#b3160f');
    p(8, 8, 2, 2, '#ff6a5a');
    p(8, 3, 2, 4, '#ff7a2a'); p(12, 2, 2, 5, '#ffb02a'); p(15, 4, 2, 3, '#ff7a2a');
    p(11, 0, 2, 4, '#ffd86b'); p(9, 1, 1, 2, '#ffe27a');
  },
};

function iconCanvas(draw) {
  const c = document.createElement('canvas'); c.width = 24; c.height = 24;
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  draw((x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); });
  return c.toDataURL();
}

export function buildKeystoneIcons() {
  const out = {};
  for (const [id, draw] of Object.entries(ICON_DRAWERS)) out[id] = iconCanvas(draw);
  return out;
}

// ---------------------------------------------------------------------------
// The three Living Blades — long, curved, ornate fairytale swords. Drawn at a
// native 30×104 resolution (tip up) so they stay crisp scaled to icons or huge
// in the shrine.
const BLADE_PAL = {
  ember: { steel: '#ff9a4a', steelDk: '#c2531a', edge: '#ffe6b0', glow: '#ff4e10', gem: '#ff2a0e', rune: '#fff0c0' },
  frost: { steel: '#bfe9ff', steelDk: '#56a0d4', edge: '#ffffff', glow: '#7fd0ff', gem: '#2f9bff', rune: '#eaffff' },
  storm: { steel: '#cdbfff', steelDk: '#6f4fd6', edge: '#f3eeff', glow: '#9a78ff', gem: '#7a36ff', rune: '#f0eaff' },
};
const GOLD = '#e9c84a', GOLD_L = '#fff3b0', GOLD_D = '#9a7a1e', GRIP = '#4a2e16', GRIP_D = '#2a190c';
const SW_W = 30, SW_H = 104;

function ornateBlade(ctx, pal) {
  const P = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); };
  const CX = 15, tip = 5, guard = 64, L = guard - tip;
  // --- the long, curved blade ---
  for (let y = tip; y < guard; y++) {
    const t = (y - tip) / L;                       // 0 tip .. 1 guard
    const cx = CX + 6 * Math.sin((1 - t) * 1.5);   // a scimitar sweep toward the tip
    const hw = Math.max(1, Math.round(1 + 4.6 * Math.pow(t, 0.82)));
    P(cx - hw, y, hw * 2, 1, pal.steelDk);
    P(cx - hw + 1, y, hw * 2 - 2, 1, pal.steel);
    P(cx - 1, y, 1, 1, pal.edge);                  // fuller / spine highlight
    P(cx + hw - 1, y, 1, 1, pal.glow);             // glowing cutting edge
    if (y % 9 === 0 && t > 0.2) P(cx, y, 1, 1, pal.rune);   // etched runes
  }
  P(CX + 6 * Math.sin(1.5) - 0, tip, 1, 2, '#ffffff');     // bright point
  // --- ornate swept crossguard with a central gem ---
  P(CX - 10, guard, 20, 3, GOLD); P(CX - 10, guard, 20, 1, GOLD_L); P(CX - 10, guard + 2, 20, 1, GOLD_D);
  P(CX - 11, guard - 3, 2, 5, GOLD); P(CX + 9, guard - 3, 2, 5, GOLD);     // upswept quillon tips
  P(CX - 12, guard - 4, 2, 2, GOLD_L); P(CX + 10, guard - 4, 2, 2, GOLD_L);
  P(CX - 2, guard - 1, 4, 5, pal.gem); P(CX - 1, guard, 2, 2, '#ffffff');  // socketed gem
  // --- wrapped grip ---
  for (let y = guard + 4; y < guard + 24; y += 3) { P(CX - 2, y, 4, 2, GRIP); P(CX - 2, y + 2, 4, 1, GRIP_D); }
  // --- jewelled pommel ---
  const py = guard + 24;
  P(CX - 3, py, 6, 5, GOLD); P(CX - 3, py, 6, 1, GOLD_L); P(CX - 4, py + 1, 1, 3, GOLD_D); P(CX + 3, py + 1, 1, 3, GOLD_D);
  P(CX - 2, py + 1, 4, 3, pal.gem); P(CX - 1, py + 1, 1, 1, '#ffffff');
}

function swordCanvas(id) {
  const c = document.createElement('canvas'); c.width = SW_W; c.height = SW_H;
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ornateBlade(ctx, BLADE_PAL[id]);
  return c;
}

// square icon (transparent letterbox) so the tall sword isn't squished in the UI
export function buildBladeIcons() {
  const out = {};
  for (const id of Object.keys(BLADE_PAL)) {
    const sc = swordCanvas(id);
    const ic = document.createElement('canvas'); ic.width = ic.height = 52;
    const x = ic.getContext('2d'); x.imageSmoothingEnabled = false;
    const h = 50, w = SW_W * (h / SW_H);
    x.drawImage(sc, (52 - w) / 2, (52 - h) / 2, w, h);
    out[id] = ic.toDataURL();
  }
  return out;
}

// full-resolution sword canvases for the shrine cutscene
export function buildBladeSwords() {
  const out = {};
  for (const id of Object.keys(BLADE_PAL)) out[id] = swordCanvas(id);
  return out;
}
