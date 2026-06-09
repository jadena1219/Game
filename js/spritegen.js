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

// The named-elite roster (names match NAMED_FOES[].sprite in game.js).
export const CREATURES = [
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
// The three Living Blades — glowing elemental swords for the choosing.
function bladeBase(p, blade, edge, glow) {
  // upright sword: blade, crossguard, grip, pommel
  p(11, 3, 2, 12, blade); p(10, 5, 1, 9, edge); p(13, 5, 1, 9, glow);   // blade + edges
  p(11, 3, 2, 2, '#fff');                                                // bright tip
  p(8, 15, 8, 2, '#9a8350'); p(8, 15, 8, 1, '#c8b072');                  // crossguard
  p(11, 17, 2, 4, '#5a3a22');                                            // grip
  p(10, 21, 4, 2, '#c8b072');                                           // pommel
}
export const BLADE_ICON_DRAWERS = {
  ember: (p) => { bladeBase(p, '#ff8a3a', '#ffd36b', '#e2470f', '#3a1a08');
    p(7, 6, 2, 3, '#ff7a2a'); p(15, 5, 2, 4, '#ffb02a'); p(8, 10, 1, 3, '#ffd86b'); p(15, 10, 1, 3, '#ff7a2a'); p(11, 1, 2, 2, '#ffd86b'); },
  frost: (p) => { bladeBase(p, '#bfe9ff', '#eaffff', '#5aa6d8', '#0e2030');
    p(8, 6, 1, 1, '#eaffff'); p(15, 8, 1, 1, '#eaffff'); p(7, 11, 2, 1, '#bfe9ff'); p(15, 4, 1, 2, '#bfe9ff'); p(9, 3, 1, 1, '#fff'); p(14, 13, 1, 1, '#bfe9ff'); },
  storm: (p) => { bladeBase(p, '#cdbfff', '#f0eaff', '#7a5ad8', '#1a1030');
    p(8, 5, 2, 1, '#e0d6ff'); p(9, 6, 1, 2, '#b9a6ff'); p(15, 7, 2, 1, '#e0d6ff'); p(14, 8, 1, 2, '#b9a6ff'); p(7, 12, 2, 1, '#f0eaff'); },
};
export function buildBladeIcons() {
  const out = {};
  for (const [id, draw] of Object.entries(BLADE_ICON_DRAWERS)) out[id] = iconCanvas(draw);
  return out;
}
