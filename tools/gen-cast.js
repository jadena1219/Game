// The dungeon cast, hand-drawn — skeleton / imp / ogre / mage / bomber at the
// same standard as the knight (tools/gen-knight.js): every pixel placed by
// hand in the grids below, ramped palettes (shadow / base / highlight), light
// from the LEFT, a glowing focal per creature, and real per-frame animation.
//
//   frames: idle | walkA | walkB | attack   (16x24 each, facing right)
//   walk frames may be expressed as ROW PATCHES over idle (legs/wings/hem
//   swap) so the silhouette stays hand-controlled without re-drawing bulk.
//
// Run:  node tools/gen-cast.js   (writes assets/sprites/<name>2.png
//                                 + /tmp/cast-preview.png at 8x)
const fs = require('fs');
const path = require('path');
const { encodePNG } = require('./png');

const FW = 16, FH = 24;
const OUTLINE = [0x1a, 0x12, 0x18, 0xff];

function hex(h) {
  h = h.replace('#', '');
  if (h.length === 6) h += 'ff';
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16), parseInt(h.slice(6, 8), 16)];
}

// ============================== SKELETON ====================================
// A dead soldier still on duty: cracked skull, ember sockets, ribs over a
// hollow dark, a rusted strap that survived the flesh. Attack = lunging claw,
// jaw dropped open.
const SKELETON = {
  pal: {
    W: '#f2ecd8',  // bone highlight
    B: '#cfc6ae',  // bone
    b: '#978e74',  // bone shadow
    K: '#241c20',  // hollow dark (sockets, between ribs)
    G: '#ff5040',  // socket ember
    g: '#ffc0a8',  // ember hot core
    r: '#6e3f2f',  // rusted strap
    R: '#8a5a3f',  // strap highlight
  },
  frames: {
    idle: [
      '................',
      '.....WWBBB......',
      '....WWBBBBB.....',
      '....WBBBBBB.....',
      '....KGgKGgB.....',
      '....BKBBKBB.....',
      '.....BbKbB......',
      '.....WKWKW......',
      '......BbB.......',
      '....WBBBBBW.....',
      '...Wb.BbB.bW....',
      '...B.WBBBW.B....',
      '...b..BbB..b....',
      '...B.WBBBW.B....',
      '...b..BbB..W....',
      '....rRrBrRr.....',
      '.....BbBbB......',
      '.....Bb.bB......',
      '.....Wb.bW......',
      '.....Bb.bB......',
      '.....B...B......',
      '.....Wb.bW......',
      '.....Bb..Bb.....',
      '....BBb..BBb....',
    ],
    walkA: { base: 'idle', rows: {
      16: '.....Bb..bB.....',
      17: '....Wb....bW....',
      18: '....Bb.....B....',
      19: '....B......bW...',
      20: '...Wb......BB...',
      21: '...Bb...........',
      22: '..BBb...........',
    } },
    walkB: { base: 'idle', rows: {
      16: '.....Bb..bB.....',
      17: '......Wb..bW....',
      18: '......Bb...B....',
      19: '.......B...b....',
      20: '.......bW..B....',
      21: '.......BB..bW...',
      22: '...........BBb..',
    } },
    attack: [
      '................',
      '......WWBBB.....',
      '.....WWBBBBB....',
      '.....WBBBBBB....',
      '.....KGGKGGB....',
      '.....BgKBgBB....',
      '......BbKbB.....',
      '.....WK.W.KW....',
      '......WKbKW.....',
      '.....WBBBBBW....',
      '...Wb.BbB..bWW..',
      '..WB.WBBBW..WbW.',
      '..b...BbB....W..',
      '......BBBW......',
      '...W..BbB.......',
      '...bW.rRrBr.....',
      '....BbBbBb......',
      '.....Bb.bB......',
      '....Wb...bW.....',
      '....B.....B.....',
      '...Wb.....bW....',
      '...Bb......B....',
      '...B.......bB...',
      '..BBb......BBb..',
    ],
  },
};

// ================================= IMP ======================================
// A grinning little arson demon: swept horns, bat-wing nubs that FLAP as it
// scurries, a whip tail, fangs, lamp-yellow eyes. Attack = pouncing, claws
// out, wings spread wide. (Drawn low in the frame — it is small and hunched.)
const IMP = {
  pal: {
    M: '#c24f38',  // red hide
    m: '#7e2c20',  // hide shadow
    F: '#ef8458',  // hide highlight
    K: '#1c1014',  // mouth / dark
    Y: '#ffd23a',  // eye glow
    y: '#fff3c0',  // eye core
    W: '#e8dcc8',  // horn / fang / claw bone
    H: '#3c2a35',  // wing membrane
    h: '#271a23',  // wing shadow
  },
  frames: {
    idle: [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '..WW......WW....',
      '...WW....WW.....',
      '....FMMMMM......',
      '...FMMMMMMM.....',
      '...FMYyMYyM.....',
      '....MMMMMMm.....',
      '....mKWKWKm.....',
      '.....mKKKm......',
      '..Hh.FMMMm......',
      '.HHh.MMMMm.m....',
      '.Hh.FMMMMm..m...',
      '..h.FMMMm...m...',
      '.....MMMm..m....',
      '.....mMm.mm.....',
      '....Fm.mM.......',
      '....M...m.......',
      '...Wm...mW......',
      '...W.....W......',
    ],
    walkA: { base: 'idle', rows: {
      14: '.HHh.FMMMm......',
      15: 'HHHh.MMMMm.m....',
      16: '.Hh.FMMMMm..m...',
      20: '...Fm..mM.......',
      21: '...M......m.....',
      22: '..Wm......mW....',
      23: '..W.........W...',
    } },
    walkB: { base: 'idle', rows: {
      14: '..Hh.FMMMm......',
      15: '..Hh.MMMMm.m....',
      16: '...h.FMMMMm.m...',
      20: '.....Fm.mM......',
      21: '.......M..m.....',
      22: '......Wm...mW...',
      23: '......W.....W...',
    } },
    attack: [
      '................',
      '................',
      '................',
      '................',
      '.WW........WW...',
      '..WW......WW....',
      '...FMMMMMM......',
      '..FMMMMMMMM.....',
      '..FMYYMYYMM.....',
      '..FMyYMyYMm.....',
      '...MMMMMMMm.....',
      '...mKWKWKWKm....',
      '....mKKKKKm.....',
      'HHh..FMMMm......',
      'HHHh.MMMMmFW....',
      'HHh.FMMMMMm.W...',
      '.h..FMMMMm..W...',
      '....FMMMm.FW....',
      '.....MMm...W....',
      '....FmMm........',
      '...Fm..mM.......',
      '...M....mM......',
      '..Wm.....mW.....',
      '..W.......W.....',
    ],
  },
};

// ================================ OGRE ======================================
// A wall of meat with a stone-headed club: tiny sunken skull, underbite tusks,
// a lit belly, leather strap + loincloth, old scars. The club rests on his
// shoulder — until the attack frame brings it DOWN.
const OGRE = {
  pal: {
    G: '#73814f',  // hide
    d: '#4c5634',  // hide shadow
    P: '#9aa86b',  // hide highlight (belly / lit edge)
    K: '#1e1812',  // dark
    T: '#e2d6b8',  // tusk / nail
    R: '#ff4040',  // eye ember
    L: '#6b4a32',  // leather
    l: '#473122',  // leather shadow
    S: '#8d8576',  // stone club head
    s: '#5f594d',  // stone shadow
    w: '#7a5a3a',  // wood haft
    W: '#52391f',  // wood shadow
    c: '#a05545',  // old scar
  },
  frames: {
    idle: [
      '.SSs............',
      'SSSSs...........',
      'sTSSs.PGGGGd....',
      '.ss..PGGGGGGd...',
      '..ww.PGKRKRd....',
      '...wwPGGGGGd....',
      '....wPGTGGTd....',
      '.....wdGGGd.....',
      '..PGGwwGGGGd....',
      '.PGGGGGGGGGGd...',
      '.PGGGGwwGGGGd...',
      '.PGGcGGGGGGGd...',
      '.PGPPPPGGGGGd...',
      '.PGPPPPGGcGGd...',
      '.PGGPPGGGGGd....',
      '..PGGGGGGGGd....',
      '..PGLLlLLlGd....',
      '...GLlllllGd....',
      '...PGLllLGGd....',
      '...PGGd.GGGd....',
      '...PGGd.GGGd....',
      '...PGGd.GGGd....',
      '..PGGGd.GGGGd...',
      '..TTGGd.GTTGd...',
    ],
    walkA: { base: 'idle', rows: {
      19: '..PGGd...GGGd...',
      20: '..PGGd...GGGd...',
      21: '..PGGd....GGGd..',
      22: '.PGGGd....GGGGd.',
      23: '.TTGGd....GTTGd.',
    } },
    walkB: { base: 'idle', rows: {
      19: '....PGGd.GGd....',
      20: '....PGGd.GGd....',
      21: '...PGGd...GGd...',
      22: '...PGGGd..GGGd..',
      23: '...TTGGd..GTTd..',
    } },
    attack: [
      '...........SSs..',
      '..........SSSSs.',
      '..........sTSSs.',
      '...........ss...',
      '.....PGGGd.ww...',
      '....PGGGGGdw....',
      '....PGKRKRdw....',
      '....PGGGGGww....',
      '....PGTGGTw.....',
      '.....dGGGww.....',
      '..PGGGGGwwGd....',
      '.PGGGGGGGGGGd...',
      '.PGGcGGGGGGGd...',
      '.PGPPPPGGcGGd...',
      '.PGPPPPGGGGGd...',
      '..PGGGGGGGGd....',
      '..PGLLlLLlGd....',
      '...GLlllllGd....',
      '...PGLllLGGd....',
      '...PGGd.GGGd....',
      '...PGGd.GGGd....',
      '..PGGd...GGGd...',
      '..PGGGd..GGGGd..',
      '..TTGGd..GTTGd..',
    ],
  },
};

// ================================ MAGE ======================================
// A hooded nothing in a violet robe: the hood holds a void with two burning
// eyes, gold trim catches the bladelight, and the staff's orb is the floor's
// most honest warning. Walk = the hem sways; attack = the orb FLARES.
const MAGE = {
  pal: {
    V: '#5e4391',  // robe
    v: '#3c2a63',  // robe shadow
    U: '#8d6fc5',  // robe highlight
    K: '#0c0813',  // hood void
    P: '#b06bff',  // eye / orb glow
    p: '#e6d6ff',  // glow core
    Y: '#c9a23a',  // gold trim
    S: '#6b563d',  // staff wood
    s: '#46362a',  // staff shadow
  },
  frames: {
    idle: [
      '.......U........',
      '......UV.....P..',
      '......UVv...PpP.',
      '.....UVVv...sPs.',
      '.....UVKKv...S..',
      '....UVKKKKv..S..',
      '....UVKPKPv..S..',
      '....UVKKKKv..S..',
      '.....VYKYv...S..',
      '....UVVVVVv..S..',
      '...UVVVVVVVvvS..',
      '...UVVvVVVVvUS..',
      '..UVVvVVvVVVSs..',
      '..UVVvVVvVVVvS..',
      '..UVvVVVvVVvvS..',
      '..UVvVVVvVVvv...',
      '.UVVvVVVvVVVv...',
      '.UVVvVVvvVVVv...',
      '.UVvvVVvvVVvv...',
      '.UVvVVVVvVVVv...',
      '.UYvYVYvYVYvY...',
      '..vvVvvVvvVvv...',
      '................',
      '................',
    ],
    walkA: { base: 'idle', rows: {
      16: '.UVVvVVVvVVVv...',
      17: '.UVVvVVvvVVv....',
      18: '..UVvVVvvVVv....',
      19: '..UVvVVVvVVv....',
      20: '..UYvYVYvYvY....',
      21: '...vvVvvVvv.....',
    } },
    walkB: { base: 'idle', rows: {
      16: '..UVVvVVVvVVv...',
      17: '...UVvVVvvVVv...',
      18: '...UVvVVvvVVvv..',
      19: '...UVvVVVvVVVv..',
      20: '...UYvYVYvYVYv..',
      21: '....vvVvvVvvVv..',
    } },
    attack: [
      '............pp..',
      '.......U..pPPp..',
      '......UV.PpppPP.',
      '......UVv.pPPp..',
      '.....UVVv..pSp..',
      '.....UVKKv..S...',
      '....UVKKKKv.S...',
      '....UVKPKPv.S...',
      '....UVKpKpvUS...',
      '.....VYKYvUVS...',
      '....UVVVVVvVS...',
      '...UVVVVVVVvS...',
      '...UVVvVVVVvSs..',
      '..UVVvVVvVVVvS..',
      '..UVvVVVvVVvv...',
      '..UVvVVVvVVvv...',
      '.UVVvVVVvVVVv...',
      '.UVVvVVvvVVVv...',
      '.UVvvVVvvVVvv...',
      '.UVvVVVVvVVVv...',
      '.UYvYVYvYVYvY...',
      '..vvVvvVvvVvv...',
      '................',
      '................',
    ],
  },
};

// =============================== BOMBER =====================================
// A manic powder-goblin hugging an iron bomb bigger than itself: rivets, a
// painted warning band, and a lit fuse whose spark JUMPS between frames. The
// attack frame is the one you should already be running from.
const BOMBER = {
  pal: {
    N: '#8da33f',  // goblin skin
    n: '#5d6e28',  // skin shadow
    F: '#b9cc66',  // skin highlight
    K: '#15110d',  // dark / mouth
    Y: '#ffd23a',  // fuse spark / eye
    y: '#fff7d0',  // spark core
    W: '#e8dcc8',  // teeth
    I: '#454c5c',  // bomb iron
    i: '#2c3140',  // iron shadow
    J: '#6a7488',  // iron highlight
    R: '#c2242e',  // warning band
    r: '#7c141d',  // band shadow
  },
  frames: {
    idle: [
      '................',
      '................',
      '................',
      '................',
      '................',
      '...FNNn....yY...',
      '..FNNNNn...Yy...',
      '..FNYNYn..J.....',
      '..NNNNNn..J.....',
      '..nKWKWn..J.....',
      '...nKKn..J......',
      '....FNJJIIi.....',
      '...FNJIIIIIi....',
      '..FNJIIIIIIIi...',
      '..FNRRrRRrRRi...',
      '..FNJIIIIIIIi...',
      '..NnJIIIIIIIi...',
      '...n.JIIIIIi....',
      '....n.JIIii.....',
      '....Fn.iii......',
      '....N...n.......',
      '...Fn...nN......',
      '...Nn....nN.....',
      '..NNn....nNN....',
    ],
    walkA: { base: 'idle', rows: {
      5: '...FNNn...Yy....',
      6: '..FNNNNn..yY....',
      19: '....Fn.iii......',
      20: '...FN....n......',
      21: '...N......nN....',
      22: '..Nn.......nN...',
      23: '.NNn.......nNN..',
    } },
    walkB: { base: 'idle', rows: {
      5: '...FNNn....y....',
      6: '..FNNNNn..YY....',
      19: '....Fn.iii......',
      20: '.....N...n......',
      21: '.....Fn..nN.....',
      22: '......Nn..nN....',
      23: '.....NNn..nNN...',
    } },
    attack: [
      '..........y.....',
      '.........yYy....',
      '........yYYYy...',
      '.........YyY....',
      '..........J.....',
      '...FNNn...J.....',
      '..FNNNNn..J.....',
      '..FNYYNn.J......',
      '..FNyYNn.J......',
      '..NNNNNn.J......',
      '..nKWWWKn.......',
      '...nKKKn........',
      '...FNJJIIi......',
      '..FNJIIIIIi.....',
      '.FNJIIIIIIIi....',
      '.FNRRrRRrRRi....',
      '.FNJIIIIIIIi....',
      '.NnJIIIIIIIi....',
      '..n.JIIIIIi.....',
      '...n.JIIii......',
      '...Fn.iii.......',
      '...N....n.......',
      '..Nn....nN......',
      '.NNn....nNN.....',
    ],
  },
};

// ============================================================================
const CAST = { skeleton: SKELETON, imp: IMP, ogre: OGRE, mage: MAGE, bomber: BOMBER };
const ORDER = ['idle', 'walkA', 'walkB', 'attack'];

function resolveFrame(spec, name) {
  const f = spec.frames[name];
  if (Array.isArray(f)) return f;
  const base = resolveFrame(spec, f.base).slice();
  for (const [row, text] of Object.entries(f.rows)) base[+row] = text;
  return base;
}

function validate(name, spec) {
  for (const fname of ORDER) {
    const rows = resolveFrame(spec, fname);
    if (rows.length !== FH) throw new Error(`${name}.${fname}: ${rows.length} rows (want ${FH})`);
    rows.forEach((row, y) => {
      if (row.length !== FW) throw new Error(`${name}.${fname} row ${y}: ${row.length} cols (want ${FW})`);
      for (const ch of row) if (ch !== '.' && !spec.pal[ch]) throw new Error(`${name}.${fname} row ${y}: unknown '${ch}'`);
    });
  }
}

function buildSheet(name, spec) {
  validate(name, spec);
  const W = FW * ORDER.length, H = FH;
  const d = new Uint8Array(W * H * 4);
  const put = (x, y, c) => { const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3]; };
  ORDER.forEach((fname, f) => {
    const rows = resolveFrame(spec, fname);
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      const ch = rows[y][x];
      if (ch !== '.') put(f * FW + x, y, hex(spec.pal[ch]));
    }
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

// one tall preview: every cast member's 4 frames at 8x on dungeon dark
function buildPreview(sheets, scale = 8, gap = 10) {
  const bg = [0x18, 0x10, 0x1e, 255];
  const W = (FW * scale + gap) * ORDER.length + gap;
  const H = (FH * scale + gap) * sheets.length + gap;
  const d = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) { d[i * 4] = bg[0]; d[i * 4 + 1] = bg[1]; d[i * 4 + 2] = bg[2]; d[i * 4 + 3] = 255; }
  sheets.forEach((sheet, row) => {
    const oy = gap + row * (FH * scale + gap);
    for (let f = 0; f < ORDER.length; f++) {
      const ox = gap + f * (FW * scale + gap);
      for (let y = 0; y < FH * scale; y++) for (let x = 0; x < FW * scale; x++) {
        const sx = f * FW + (x / scale | 0), sy = y / scale | 0;
        const si = (sy * sheet.w + sx) * 4;
        if (sheet.d[si + 3] === 0) continue;
        const di = ((oy + y) * W + ox + x) * 4;
        d[di] = sheet.d[si]; d[di + 1] = sheet.d[si + 1]; d[di + 2] = sheet.d[si + 2]; d[di + 3] = 255;
      }
    }
  });
  return { w: W, h: H, d };
}

function main() {
  const sheets = [];
  for (const [name, spec] of Object.entries(CAST)) {
    const sheet = buildSheet(name, spec);
    sheets.push(sheet);
    // versioned FILENAMES (CDNs key on path, not query): <name>2.png
    const out = path.join(__dirname, '..', 'assets', 'sprites', name + '2.png');
    fs.writeFileSync(out, encodePNG(sheet.w, sheet.h, sheet.d));
    console.log(`  ✓ ${name}2.png (${sheet.w}x${sheet.h})`);
  }
  const pv = buildPreview(sheets);
  fs.writeFileSync('/tmp/cast-preview.png', encodePNG(pv.w, pv.h, pv.d));
  console.log('  ✓ /tmp/cast-preview.png');
}

module.exports = { buildSheet, CAST };
if (require.main === module) main();
