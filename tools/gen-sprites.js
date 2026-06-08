// Parametric pixel-art humanoid sprite generator.
// Produces real PNG sprite sheets (no shapes-as-placeholders): every character
// is a clearly humanoid figure built from head/torso/arms/legs plus features
// (helmet, hood, horns, wings) and a weapon. Each sheet has 4 frames:
//   0 = idle, 1 = walk A, 2 = walk B, 3 = attack/special
// A 1px dark silhouette outline is generated automatically for readability.
const fs = require('fs');
const path = require('path');
const { encodePNG } = require('./png');

const FW = 16; // frame width
const FH = 24; // frame height
const OUTLINE = [0x1a, 0x12, 0x18, 0xff];

function hex(h) {
  h = h.replace('#', '');
  if (h.length === 6) h += 'ff';
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
    parseInt(h.slice(6, 8), 16),
  ];
}

class Grid {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Uint8Array(w * h * 4);
  }
  px(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = c[3];
  }
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return [0, 0, 0, 0];
    const i = (y * this.w + x) * 4;
    return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]];
  }
  rect(x0, y0, x1, y1, c) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.px(x, y, c);
  }
  // auto 1px outline around the silhouette (fills transparent neighbours of opaque pixels)
  outline() {
    const copy = this.d.slice();
    const op = (x, y) => copy[(y * this.w + x) * 4 + 3] > 0;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (op(x, y)) continue;
        if (op(x - 1, y) || op(x + 1, y) || op(x, y - 1) || op(x, y + 1) ||
            op(x - 1, y - 1) || op(x + 1, y - 1) || op(x - 1, y + 1) || op(x + 1, y + 1)) {
          this.px(x, y, OUTLINE);
        }
      }
    }
  }
  blit(dest, dx, dy) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = (y * this.w + x) * 4;
        if (this.d[i + 3] > 0) {
          dest.px(dx + x, dy + y, [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]]);
        }
      }
    }
  }
}

// shade a colour darker/lighter
function shade(c, f) {
  return [
    Math.max(0, Math.min(255, Math.round(c[0] * f))),
    Math.max(0, Math.min(255, Math.round(c[1] * f))),
    Math.max(0, Math.min(255, Math.round(c[2] * f))),
    c[3],
  ];
}

// Draw one humanoid frame given a spec and a pose name.
function drawFrame(spec, pose) {
  const g = new Grid(FW, FH);
  const skin = hex(spec.skin || '#e8b894');
  const body = hex(spec.body || '#6c7a8a');
  const bodyHi = shade(body, 1.25);
  const detail = hex(spec.detail || '#444');
  const eye = hex(spec.eye || '#201018');

  // ---- pose params ----
  let bob = 0, lFoot = 0, rFoot = 0, armSwing = 0;
  if (pose === 'walkA') { bob = 1; lFoot = 1; rFoot = -1; armSwing = 1; }
  else if (pose === 'walkB') { bob = 1; lFoot = -1; rFoot = 1; armSwing = -1; }
  const attack = pose === 'attack';

  const oy = bob; // vertical body offset for walk bob

  // ---- LEGS ----
  const legCol = spec.legs ? hex(spec.legs) : shade(body, 0.8);
  g.rect(5, 15 + oy, 6, 21 + lFoot, legCol);      // left leg
  g.rect(9, 15 + oy, 10, 21 + rFoot, legCol);     // right leg
  g.rect(4, 22 + lFoot, 6, 23 + lFoot, detail);   // left foot
  g.rect(9, 22 + rFoot, 11, 23 + rFoot, detail);  // right foot

  // ---- TORSO ----
  g.rect(5, 8 + oy, 10, 14 + oy, body);
  g.rect(5, 8 + oy, 5, 14 + oy, bodyHi);          // left highlight column
  if (spec.belt) g.rect(5, 13 + oy, 10, 13 + oy, hex(spec.belt));

  // optional chest emblem / ribs / robe trim
  if (spec.ribs) {
    for (let ry = 9; ry <= 13; ry += 2) g.rect(6, ry + oy, 9, ry + oy, shade(body, 0.7));
    g.rect(7, 8 + oy, 8, 14 + oy, body); // spine fill
  }
  if (spec.emblem) {
    g.px(7, 10 + oy, hex(spec.emblem));
    g.px(8, 10 + oy, hex(spec.emblem));
    g.px(7, 11 + oy, hex(spec.emblem));
    g.px(8, 11 + oy, hex(spec.emblem));
  }

  // ---- ARMS ----
  const armCol = spec.arms ? hex(spec.arms) : body;
  const lArmY = 9 + oy + (attack ? 0 : armSwing);
  const rArmY = 9 + oy - (attack ? 0 : armSwing);
  g.rect(3, lArmY, 4, lArmY + 5, armCol);         // left arm
  g.px(3, lArmY + 6, skin); g.px(4, lArmY + 6, skin); // left hand
  if (attack && (spec.weapon === 'greatsword' || spec.weapon === 'club')) {
    // right arm raised across the body for the swing
    g.rect(11, 7 + oy, 12, 10 + oy, armCol);
    g.px(12, 6 + oy, skin); g.px(13, 6 + oy, skin); // raised hand
  } else {
    g.rect(11, rArmY, 12, rArmY + 5, armCol);     // right arm
    g.px(11, rArmY + 6, skin); g.px(12, rArmY + 6, skin); // right hand
  }

  // ---- HEAD ----
  const headY = oy;
  drawHead(g, spec, skin, body, detail, eye, headY);

  // ---- WINGS (behind, drawn last over bg but fine for our flat look) ----
  if (spec.wings) drawWings(g, hex(spec.wings), oy, pose);

  // ---- WEAPON ----
  if (spec.weapon) drawWeapon(g, spec, skin, oy, attack);

  g.outline();
  return g;
}

function drawHead(g, spec, skin, body, detail, eye, oy) {
  const hx0 = 5, hx1 = 10, hy0 = 2 + oy, hy1 = 7 + oy;
  switch (spec.head) {
    case 'skull':
      g.rect(hx0, hy0, hx1, hy1, skin); // skin == bone colour for skeletons
      g.rect(6, hy0 + 2, 6, hy0 + 3, eye); // left socket
      g.rect(9, hy0 + 2, 9, hy0 + 3, eye); // right socket
      g.rect(6, hy1, 9, hy1, eye);         // teeth line
      g.px(7, hy1, skin); g.px(9, hy1, skin);
      break;
    case 'helmet': {
      const steel = body;
      g.rect(hx0, hy0, hx1, hy1, steel);
      g.rect(hx0, hy0, hx0, hy1, shade(steel, 1.3));   // left highlight
      if (spec.helmHorns) {                            // dread-knight helm: brow, glowing visor, horns
        g.rect(hx1, hy0, hx1, hy1, shade(steel, 0.7));            // right shadow
        g.rect(hx0, hy0 + 2, hx1, hy0 + 2, shade(steel, 0.55));   // heavy brow ridge
        g.rect(hx0 + 1, hy0 + 3, hx1 - 1, hy0 + 3, eye);         // glowing visor slit
        const hn = hex(spec.horn || '#16161b');                   // jagged horns off the temples
        g.px(hx0, hy0 - 1, hn); g.px(hx0 - 1, hy0 - 2, hn); g.px(hx0 - 1, hy0 - 3, hn); g.px(hx0 - 2, hy0 - 4, hn);
        g.px(hx1, hy0 - 1, hn); g.px(hx1 + 1, hy0 - 2, hn); g.px(hx1 + 1, hy0 - 3, hn); g.px(hx1 + 2, hy0 - 4, hn);
      } else {
        g.rect(hx0, hy0 + 3, hx1, hy0 + 3, eye); // visor slit
      }
      const crest = hex(spec.crest || '#c83737');
      if (spec.plume) {                         // tall feathered plume (paladin)
        g.rect(7, hy0 - 5, 8, hy0 - 1, crest);
        g.px(6, hy0 - 4, crest); g.px(9, hy0 - 3, crest); g.px(8, hy0 - 6, crest);
      } else if (!spec.helmHorns) {
        g.rect(7, hy0 - 1, 8, hy0 - 1, crest); // small crest
      }
      break;
    }
    case 'hood': {
      const robe = hex(spec.head_col || spec.body || '#4a2580');
      g.rect(hx0 - 1, hy0 - 1, hx1 + 1, hy1, robe);   // hood shell
      g.rect(6, hy0 + 1, 9, hy1 - 1, skin);           // face opening
      g.rect(6, hy0 + 2, 6, hy0 + 2, eye);            // eyes (shadowed)
      g.rect(9, hy0 + 2, 9, hy0 + 2, eye);
      g.rect(7, hy0 - 2, 8, hy0 - 1, robe);           // pointy hat tip
      if (spec.beard) {                               // flowing beard (sorcerer)
        const bd = hex(spec.beard);
        g.rect(6, hy1, 9, hy1, bd);
        g.rect(6, hy1 + 1, 9, hy1 + 1, bd);
        g.px(7, hy1 + 2, bd); g.px(8, hy1 + 2, bd);
      }
      break;
    }
    case 'horns':
      g.rect(hx0, hy0, hx1, hy1, skin);
      g.rect(6, hy0 + 2, 6, hy0 + 2, eye);
      g.rect(9, hy0 + 2, 9, hy0 + 2, eye);
      // tusks / horns
      g.rect(4, hy0 - 1, 4, hy0 + 1, hex(spec.horn || '#efe7d0'));
      g.rect(11, hy0 - 1, 11, hy0 + 1, hex(spec.horn || '#efe7d0'));
      g.rect(6, hy1, 6, hy1, hex(spec.horn || '#efe7d0')); // lower tusks
      g.rect(9, hy1, 9, hy1, hex(spec.horn || '#efe7d0'));
      break;
    default: // bare face with hair
      g.rect(hx0, hy0, hx1, hy1, skin);
      g.rect(hx0, hy0, hx1, hy0, hex(spec.hair || '#5a3a22')); // hair top
      g.rect(hx0, hy0, hx0, hy0 + 1, hex(spec.hair || '#5a3a22'));
      g.rect(hx1, hy0, hx1, hy0 + 1, hex(spec.hair || '#5a3a22'));
      g.rect(6, hy0 + 3, 6, hy0 + 3, eye);
      g.rect(9, hy0 + 3, 9, hy0 + 3, eye);
  }
}

function drawWings(g, col, oy, pose) {
  const hi = shade(col, 1.3);
  const spread = pose === 'idle' ? 0 : 1; // flap a bit while moving
  // left wing
  g.rect(1, 8 + oy - spread, 3, 9 + oy, col);
  g.rect(1, 8 + oy - spread, 1, 12 + oy, col);
  g.px(0, 9 + oy - spread, hi);
  // right wing
  g.rect(12, 8 + oy - spread, 14, 9 + oy, col);
  g.rect(14, 8 + oy - spread, 14, 12 + oy, col);
  g.px(15, 9 + oy - spread, hi);
}

function drawWeapon(g, spec, skin, oy, attack) {
  if (spec.weapon === 'greatsword') {
    const blade = hex(spec.blade || '#bfe9ff');
    const bladeHi = shade(blade, 1.2);
    const guard = hex(spec.guard || '#caa54a');
    if (attack) {
      // diagonal slash in front, blade sweeping up-forward
      const pts = [[12, 6], [13, 5], [14, 4], [15, 3], [13, 7], [14, 6]];
      for (const [x, y] of pts) g.px(x, y + oy, blade);
      g.px(15, 3 + oy, bladeHi); g.px(14, 4 + oy, bladeHi);
      g.px(12, 7 + oy, guard); g.px(11, 8 + oy, guard); // guard
    } else {
      // resting vertical greatsword along the right side
      g.rect(13, 3 + oy, 13, 12 + oy, blade);
      g.px(13, 3 + oy, bladeHi);
      g.rect(12, 13 + oy, 14, 13 + oy, guard); // crossguard
      g.rect(13, 14 + oy, 13, 16 + oy, hex('#6b4a2a')); // grip
    }
  } else if (spec.weapon === 'staff') {
    const wood = hex('#7a5230');
    const orb = hex(attack ? '#fff3b0' : (spec.orb || '#ffd36b'));
    g.rect(13, 6 + oy, 13, 17 + oy, wood);
    g.rect(12, 4 + oy, 14, 5 + oy, orb);
    g.px(13, 3 + oy, orb);
    if (attack) { g.px(12, 3 + oy, orb); g.px(14, 3 + oy, orb); g.px(15, 4 + oy, orb); }
  } else if (spec.weapon === 'club') {
    const wood = hex(spec.club || '#6b4a2a');
    const woodHi = shade(wood, 1.25);
    if (attack) {
      g.rect(12, 4 + oy, 15, 7 + oy, wood); // raised club head
      g.rect(11, 8 + oy, 12, 11 + oy, wood); // handle
      g.px(15, 4 + oy, woodHi);
    } else {
      g.rect(12, 10 + oy, 14, 16 + oy, wood); // club head low
      g.rect(13, 16 + oy, 13, 18 + oy, wood);
      g.px(12, 10 + oy, woodHi);
    }
  } else if (spec.weapon === 'daggers') {
    const blade = hex(spec.blade || '#cdd6e2'), edge = hex('#ffffff'), guard = hex(spec.guard || '#8a6a3a');
    if (attack) {
      // quick forward stab
      g.rect(12, 8 + oy, 15, 9 + oy, blade); g.px(15, 8 + oy, edge);
      g.rect(11, 9 + oy, 12, 10 + oy, guard);
    } else {
      // short blade held at the side
      g.rect(13, 9 + oy, 13, 13 + oy, blade); g.px(13, 9 + oy, edge);
      g.rect(12, 13 + oy, 14, 13 + oy, guard);
    }
  } else if (spec.weapon === 'hammer') {
    const wood = hex('#6b4a2a'), head = hex(spec.hammerHead || '#9aa6b8'), headHi = shade(hex(spec.hammerHead || '#9aa6b8'), 1.25);
    if (attack) {
      g.rect(10, 1 + oy, 15, 5 + oy, head); g.px(15, 1 + oy, headHi); // head raised overhead
      g.rect(12, 5 + oy, 13, 9 + oy, wood);                           // handle
    } else {
      // shouldered warhammer: chunky head up by the shoulder, short handle (no thin dangling line)
      g.rect(12, 7 + oy, 13, 11 + oy, wood);
      g.rect(11, 3 + oy, 15, 7 + oy, head); g.px(15, 3 + oy, headHi); g.px(11, 3 + oy, headHi);
    }
  }
}

// ---- character roster ----
const CHARACTERS = {
  knight: {
    skin: '#e8b894', body: '#5d6b7d', detail: '#3a4350', legs: '#4a5563',
    arms: '#5d6b7d', belt: '#7a5230', head: 'helmet', crest: '#c83737',
    emblem: '#d8c24a', weapon: 'greatsword', blade: '#bfe9ff', guard: '#d8c24a',
    scale: 1.0,
  },
  rogue: { // nimble dagger hero — dark leather + hood, no beard
    skin: '#e0b48c', body: '#3a2e22', detail: '#241c14', legs: '#2a2018',
    arms: '#3a2e22', head: 'hood', head_col: '#241c14', belt: '#6b4a2a',
    weapon: 'daggers', blade: '#dfe6f0', eye: '#9affc0', scale: 1.0,
  },
  paladin: { // heavy hammer hero — holy GOLD plate + tall white plume (distinct from the blue knight)
    skin: '#e8b894', body: '#e0c24a', detail: '#a8841f', legs: '#b89a2e',
    arms: '#e0c24a', head: 'helmet', crest: '#f4f7ff', emblem: '#fff6c8', plume: true,
    belt: '#7a5a16', weapon: 'hammer', hammerHead: '#cfd6e0', eye: '#fff0a0', scale: 1.12,
  },
  bomber: { // squat dark goblin clutching a bomb — glows before it blows
    skin: '#33291f', body: '#2a2228', detail: '#15110f', legs: '#1f1a16',
    head: 'horns', horn: '#15110f', eye: '#ff9a2a', belt: '#c0392b', scale: 0.92,
  },
  skeleton: {
    skin: '#e7e6da', body: '#cfcdbe', detail: '#9a9788', legs: '#cfcdbe',
    head: 'skull', ribs: true, eye: '#161018', scale: 1.0,
  },
  imp: {
    skin: '#c0392b', body: '#a83224', detail: '#6f1f16', legs: '#8e2a1e',
    head: 'horns', horn: '#3a1410', wings: '#5a1a1a', eye: '#ffd84a', scale: 0.72,
  },
  mage: {
    skin: '#d9b08c', body: '#5e35a8', detail: '#3c2070', legs: '#4a2a86',
    head: 'hood', head_col: '#4a2580', belt: '#caa54a', weapon: 'staff',
    orb: '#ffd36b', eye: '#7df0ff', scale: 1.0,
  },
  sorcerer: { // friendly camp NPC — teal robe, white beard (NOT the enemy mage)
    skin: '#e8c49a', body: '#1f6e7a', detail: '#11434c', legs: '#185560',
    arms: '#1f6e7a', head: 'hood', head_col: '#1f6e7a', belt: '#e9c84a',
    emblem: '#ffe27a', weapon: 'staff', orb: '#9af0ff', eye: '#eaffff',
    beard: '#eceadf', scale: 1.0,
  },
  ogre: {
    skin: '#6a8f3c', body: '#7a5230', detail: '#4a3320', legs: '#5a6a8a',
    head: 'horns', horn: '#efe7d0', belt: '#3a2a18', weapon: 'club',
    club: '#5a3d22', eye: '#2a1810', scale: 1.5,
  },
  miniboss: { // Dark Knight (level 5) — a towering, horned dread-knight
    skin: '#9a98a4', body: '#1b1b23', detail: '#0b0b10', legs: '#131318',
    head: 'helmet', helmHorns: true, horn: '#0d0d12', crest: '#c01818', emblem: '#c01818',
    weapon: 'greatsword', blade: '#ff5050', guard: '#5a0e0e', eye: '#ff3030', scale: 3.4,
  },
  boss: { // Demon Lord (level 10)
    skin: '#8e1f1f', body: '#5a1414', detail: '#2c0a0a', legs: '#3a0e0e',
    head: 'horns', horn: '#220607', wings: '#33060a', belt: '#caa54a',
    weapon: 'greatsword', blade: '#ff8a3a', guard: '#caa54a', eye: '#ffd84a',
    scale: 3.0,
  },
};

const POSES = ['idle', 'walkA', 'walkB', 'attack'];

function buildSheet(spec) {
  const sheet = new Grid(FW * POSES.length, FH);
  POSES.forEach((pose, i) => {
    const frame = drawFrame(spec, pose);
    frame.blit(sheet, i * FW, 0);
  });
  return sheet;
}

function main() {
  const outDir = path.join(__dirname, '..', 'assets', 'sprites');
  fs.mkdirSync(outDir, { recursive: true });

  const manifest = {
    frameW: FW,
    frameH: FH,
    frames: { idle: 0, walkA: 1, walkB: 2, attack: 3 },
    sprites: {},
  };

  for (const [name, spec] of Object.entries(CHARACTERS)) {
    const sheet = buildSheet(spec);
    const png = encodePNG(sheet.w, sheet.h, sheet.d);
    const file = `${name}.png`;
    fs.writeFileSync(path.join(outDir, file), png);
    manifest.sprites[name] = { file, scale: spec.scale || 1.0 };
    console.log(`  ✓ ${file} (${sheet.w}x${sheet.h})`);
  }

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`  ✓ manifest.json (${Object.keys(CHARACTERS).length} sprites)`);
}

main();
