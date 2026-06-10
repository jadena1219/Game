// Event vignettes — each camp event opens on a small painted scene instead of
// a bare icon: a 96x56 pixel illustration, upscaled with crisp pixels by CSS.
// One painter per event id; they share a dark little stage and a floor.

function stage(g, glow, gx = 48, gy = 30) {
  g.clearRect(0, 0, 96, 56);
  const bg = g.createLinearGradient(0, 0, 0, 56);
  bg.addColorStop(0, '#0b0813'); bg.addColorStop(1, '#171022');
  g.fillStyle = bg; g.fillRect(0, 0, 96, 56);
  // back wall + floor line
  g.fillStyle = 'rgba(255,255,255,0.04)';
  for (let x = 0; x < 96; x += 16) g.fillRect(x, 8 + (x / 16) % 2, 14, 1);
  g.fillStyle = '#070510'; g.fillRect(0, 44, 96, 12);
  g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, 44, 96, 1);
  if (glow) {
    const r = g.createRadialGradient(gx, gy, 2, gx, gy, 34);
    r.addColorStop(0, glow); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, 96, 56);
  }
}
const P = (g, c) => (x, y, w = 2, h = 2) => { g.fillStyle = c; g.fillRect(x, y, w, h); };

const SCENES = {
  altar(g) {
    stage(g, 'rgba(160,20,20,0.22)');
    const k = P(g, '#1c1622'), d = P(g, '#0e0a14'), r = P(g, '#c2242e'), rr = P(g, '#7c141d');
    k(34, 26, 28, 6); k(38, 32, 20, 12);            // slab + plinth
    d(34, 30, 28, 2); P(g, '#39304a')(34, 26, 28, 2);
    r(40, 30, 2, 8); rr(41, 38, 2, 6); r(52, 30, 2, 5); rr(53, 35, 2, 9);   // the slow red
    rr(36, 44, 24, 2);                               // pooled at the foot
  },
  pact(g) {
    stage(g, 'rgba(180,30,30,0.16)', 64, 22);
    // the horned shadow unfolding from the wall
    g.fillStyle = 'rgba(8,4,10,0.92)';
    g.beginPath();
    g.moveTo(56, 46); g.quadraticCurveTo(54, 18, 66, 12);
    g.quadraticCurveTo(80, 8, 84, 20); g.quadraticCurveTo(88, 36, 82, 46);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(8,4,10,0.92)'; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(62, 14); g.quadraticCurveTo(58, 6, 52, 4); g.stroke();   // horns
    g.beginPath(); g.moveTo(76, 12); g.quadraticCurveTo(82, 5, 88, 4); g.stroke();
    P(g, '#ff3a2a')(64, 20, 3, 2); P(g, '#ff3a2a')(73, 20, 3, 2);                    // eyes
    P(g, '#ff8a6a')(65, 20, 1, 1); P(g, '#ff8a6a')(74, 20, 1, 1);
    // the little knight, considering
    const K = P(g, '#241f2e');
    K(18, 30, 8, 12); K(20, 26, 6, 5); P(g, '#ff4040')(22, 28, 3, 1);
  },
  chalices(g) {
    stage(g, 'rgba(120,60,160,0.14)');
    P(g, '#2a2235')(26, 34, 44, 8); P(g, '#19131f')(26, 40, 44, 2);    // the bier
    const cup = (x, liq) => {
      P(g, '#4e4a5e')(x, 24, 10, 2); P(g, '#39304a')(x + 1, 26, 8, 5);
      P(g, liq)(x + 2, 25, 6, 2);
      P(g, '#4e4a5e')(x + 4, 31, 2, 3); P(g, '#4e4a5e')(x + 2, 33, 6, 1);
    };
    cup(32, '#d8232e'); cup(54, '#0a060e');
    P(g, 'rgba(255,255,255,0.5)')(34, 25, 1, 1); P(g, 'rgba(140,120,200,0.5)')(56, 25, 1, 1);
  },
  cage(g) {
    stage(g, 'rgba(150,110,230,0.12)');
    g.fillStyle = '#0a0712'; g.fillRect(30, 14, 36, 30);
    const bar = P(g, '#3c3550');
    for (let x = 30; x <= 66; x += 6) bar(x, 14, 2, 30);
    bar(28, 12, 42, 2); bar(28, 44, 42, 2);
    P(g, '#e8d36a')(46, 36, 2, 2); P(g, 'rgba(255,240,170,0.6)')(45, 35, 1, 1);   // the glitter
    P(g, '#c9b6ff')(40, 24, 2, 2); P(g, '#c9b6ff')(50, 24, 2, 2);                 // pleading eyes
  },
  gambler(g) {
    stage(g, 'rgba(80,150,255,0.16)', 48, 24);
    // cold blue flame
    g.fillStyle = 'rgba(90,160,255,0.35)';
    g.beginPath(); g.moveTo(40, 38); g.quadraticCurveTo(38, 18, 48, 10);
    g.quadraticCurveTo(58, 18, 56, 38); g.closePath(); g.fill();
    const b = P(g, '#ded6c8'), d = P(g, '#0d0a14');
    b(42, 18, 12, 9); b(44, 27, 8, 4);              // dome + jaw
    d(44, 21, 3, 3); d(50, 21, 3, 3); d(47, 25, 2, 2);
    P(g, '#7fb0ff')(45, 22, 1, 1); P(g, '#7fb0ff')(51, 22, 1, 1);
    P(g, '#e8d36a')(40, 42, 3, 2); P(g, '#e8d36a')(52, 43, 3, 2); P(g, '#bb9b3a')(46, 44, 3, 2);
  },
  fountain(g) {
    stage(g, 'rgba(190,40,40,0.2)');
    const s = P(g, '#39304a'), dk = P(g, '#241f2e'), R = P(g, '#b51e28');
    s(28, 38, 40, 6); dk(30, 36, 36, 2);            // basin
    R(32, 37, 32, 3);                                // the red, brimming
    s(42, 22, 12, 14); R(44, 24, 8, 2);              // column bowl
    R(46, 26, 2, 10); R(50, 28, 2, 9);               // falling threads
    P(g, 'rgba(255,120,110,0.5)')(34, 37, 2, 1); P(g, 'rgba(255,120,110,0.5)')(58, 38, 2, 1);
  },
  champion(g) {
    stage(g, 'rgba(150,170,210,0.12)', 38, 32);
    const a = P(g, '#3f4252'), d = P(g, '#23242e');
    // slumped against the wall, legs out
    a(30, 24, 10, 9); P(g, '#262833')(31, 33, 9, 8);
    d(36, 41, 12, 3); a(46, 41, 6, 3);
    a(28, 30, 4, 8);                                 // trailing arm
    P(g, '#8fe0c0')(33, 27, 4, 1);                   // the ghost-light in the visor
    P(g, '#23242e')(50, 30, 3, 12);                  // his planted sword
    P(g, '#3f4252')(49, 30, 5, 2);
  },
  idol(g) {
    stage(g, 'rgba(150,90,230,0.2)');
    const j = P(g, '#171225'), hi = P(g, '#352a52');
    j(38, 22, 20, 22); j(34, 30, 28, 14);            // squat black jade
    hi(38, 22, 20, 2); hi(34, 30, 2, 14);
    P(g, '#b06bff')(43, 28, 3, 2); P(g, '#b06bff')(51, 28, 3, 2);
    // the murmur: rings leaving its mouth
    g.strokeStyle = 'rgba(176,107,255,0.45)'; g.lineWidth = 1;
    g.beginPath(); g.arc(48, 38, 5, -0.6, 0.6); g.stroke();
    g.beginPath(); g.arc(48, 38, 9, -0.45, 0.45); g.stroke();
  },
  coffer(g) {
    stage(g, 'rgba(233,200,74,0.13)');
    const i = P(g, '#2c2733'), d = P(g, '#191521'), gd = P(g, '#8a6a28');
    i(32, 26, 32, 16); d(32, 40, 32, 2);
    i(30, 22, 36, 6);                                // domed lid
    gd(32, 30, 32, 2); gd(46, 26, 4, 14);            // iron straps gone gold
    P(g, '#e9c84a')(45, 32, 6, 5);                   // the flaking sigil
    P(g, '#7c141d')(47, 33, 2, 3);
  },
  souleater(g) {
    stage(g, 'rgba(122,79,208,0.2)', 48, 26);
    // a maw of shadow split through the wall
    g.fillStyle = '#06030c';
    g.beginPath(); g.moveTo(30, 12); g.quadraticCurveTo(48, 22, 66, 12);
    g.quadraticCurveTo(70, 28, 66, 42); g.quadraticCurveTo(48, 34, 30, 42);
    g.quadraticCurveTo(26, 28, 30, 12); g.closePath(); g.fill();
    const t = P(g, '#cfc6e0');
    t(36, 16, 2, 5); t(44, 18, 2, 6); t(52, 18, 2, 6); t(60, 16, 2, 5);   // upper fangs
    t(40, 34, 2, 5); t(48, 33, 2, 6); t(56, 34, 2, 5);
    P(g, 'rgba(122,79,208,0.6)')(46, 26, 5, 3);      // the hunger, glowing inside
  },
};

export function drawEventScene(g, id) {
  const fn = SCENES[id];
  if (!fn) { stage(g, null); return false; }
  fn(g);
  // a thin gilded base line — every scene sits on the same little stage
  g.fillStyle = 'rgba(233,200,74,0.22)'; g.fillRect(6, 53, 84, 1);
  return true;
}
