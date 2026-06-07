// Biome definitions for the heroic high-fantasy journey. Each act of the run
// gets its own lush, distinct setting: ground palette, framing props, lighting,
// and weather. Painters draw scattered ground detail onto the baked background.

function rngFrom(seed) {
  return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
}

// ---- ground-detail painters (drawn once into the background canvas) ----
function grassDetail(g, W, H) {
  const R = rngFrom(101);
  // grass tufts
  for (let i = 0; i < 520; i++) {
    const x = R() * W, y = R() * H;
    const c = R() < 0.5 ? 'rgba(90,160,70,0.5)' : 'rgba(60,120,50,0.5)';
    g.strokeStyle = c; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 4, y - 3 - R() * 3); g.stroke();
  }
  // flowers
  const petals = ['#ff6f7a', '#ffd24a', '#ffffff', '#c58bff'];
  for (let i = 0; i < 70; i++) {
    const x = 30 + R() * (W - 60), y = 30 + R() * (H - 60);
    const col = petals[(R() * petals.length) | 0];
    g.fillStyle = '#3c7a38'; g.fillRect(x, y, 1, 3);
    g.fillStyle = col;
    g.fillRect(x - 1, y - 2, 1, 1); g.fillRect(x + 1, y - 2, 1, 1);
    g.fillRect(x, y - 3, 1, 1); g.fillRect(x, y - 1, 1, 1);
    g.fillStyle = '#ffe9a0'; g.fillRect(x, y - 2, 1, 1);
  }
}

function forestDetail(g, W, H) {
  const R = rngFrom(202);
  // mossy patches
  for (let i = 0; i < 60; i++) {
    const x = R() * W, y = R() * H, r = 14 + R() * 30;
    g.fillStyle = `rgba(40,90,45,${0.1 + R() * 0.12})`;
    g.beginPath(); g.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2); g.fill();
  }
  // roots / fallen leaves
  for (let i = 0; i < 260; i++) {
    const x = R() * W, y = R() * H;
    g.fillStyle = R() < 0.5 ? 'rgba(150,90,40,0.5)' : 'rgba(190,140,50,0.45)';
    g.fillRect(x, y, 2, 1);
  }
  // glowing mushrooms
  for (let i = 0; i < 24; i++) {
    const x = 30 + R() * (W - 60), y = 40 + R() * (H - 80);
    g.fillStyle = '#6b4a2a'; g.fillRect(x, y, 1, 3);
    g.fillStyle = '#7fe8ff'; g.fillRect(x - 1, y - 1, 3, 1); g.fillRect(x, y - 2, 1, 1);
  }
}

function stoneDetail(g, W, H) {
  const R = rngFrom(303);
  // flagstone seams
  g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 2;
  const tile = 58;
  for (let x = tile; x < W; x += tile) { g.beginPath(); g.moveTo(x + (R() - 0.5) * 6, 0); g.lineTo(x + (R() - 0.5) * 6, H); g.stroke(); }
  for (let y = tile; y < H; y += tile) { g.beginPath(); g.moveTo(0, y + (R() - 0.5) * 6); g.lineTo(W, y + (R() - 0.5) * 6); g.stroke(); }
  // golden inlay highlights + cracks
  for (let i = 0; i < 200; i++) { const x = R() * W, y = R() * H; g.fillStyle = 'rgba(233,200,74,0.08)'; g.fillRect(x, y, 2, 2); }
  for (let i = 0; i < 90; i++) { const x = R() * W, y = R() * H; g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x, y, 1 + R() * 3, 1); }
}

function throneDetail(g, W, H) {
  const R = rngFrom(404);
  // obsidian speckle
  for (let i = 0; i < 400; i++) { const x = R() * W, y = R() * H; g.fillStyle = 'rgba(255,255,255,0.03)'; g.fillRect(x, y, 2, 2); }
  // glowing lava cracks (branching)
  g.lineCap = 'round';
  for (let i = 0; i < 16; i++) {
    let x = R() * W, y = R() * H; const len = 4 + (R() * 6 | 0);
    g.strokeStyle = 'rgba(255,120,30,0.55)'; g.shadowColor = '#ff7a1e'; g.shadowBlur = 8; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < len; s++) { x += (R() - 0.5) * 40; y += (R() - 0.5) * 40; g.lineTo(x, y); }
    g.stroke();
  }
  g.shadowBlur = 0;
}

export const BIOMES = [
  {
    id: 'gardens', name: 'The Kingdom Gardens', act: 'I', levels: [1, 2, 3],
    ground: ['#5aa24a', '#3f7c39'], border: 'rgba(20,50,18,0.55)',
    grade: 'rgba(255,238,170,0.07)', lightAmbient: 0.12,
    particle: 'pollen', pcol: ['#fff6c0', '#ffe9a0', '#ffffff'],
    detail: grassDetail,
    props: [
      { t: 'brazier', x: 0.1, y: 0.26 }, { t: 'brazier', x: 0.9, y: 0.26 },
      { t: 'banner', x: 0.28, y: 0.12, c: '#c0392b' }, { t: 'banner', x: 0.72, y: 0.12, c: '#2c6fb0' },
      { t: 'pillar', x: 0.07, y: 0.84 }, { t: 'pillar', x: 0.93, y: 0.84 },
    ],
  },
  {
    id: 'forest', name: 'The Enchanted Forest', act: 'II', levels: [4, 5, 6],
    ground: ['#3e6f3a', '#274d2a'], border: 'rgba(8,28,12,0.7)',
    grade: 'rgba(120,200,140,0.08)', lightAmbient: 0.3,
    particle: 'leaves', pcol: ['#e0a23a', '#d8d24a', '#6fae54'],
    detail: forestDetail,
    props: [
      { t: 'tree', x: 0.08, y: 0.22 }, { t: 'tree', x: 0.92, y: 0.2 },
      { t: 'tree', x: 0.14, y: 0.9 }, { t: 'tree', x: 0.88, y: 0.92 },
      { t: 'brazier', x: 0.5, y: 0.14 },
    ],
  },
  {
    id: 'citadel', name: 'The Citadel Ramparts', act: 'III', levels: [7, 8, 9],
    ground: ['#8a8597', '#5a5468'], border: 'rgba(20,16,30,0.72)',
    grade: 'rgba(255,200,120,0.09)', lightAmbient: 0.34,
    particle: 'embers', pcol: ['#ff8a3a', '#e9c84a', '#ffd36b'],
    detail: stoneDetail,
    props: [
      { t: 'brazier', x: 0.12, y: 0.2 }, { t: 'brazier', x: 0.88, y: 0.2 },
      { t: 'brazier', x: 0.12, y: 0.86 }, { t: 'brazier', x: 0.88, y: 0.86 },
      { t: 'banner', x: 0.3, y: 0.1, c: '#caa54a' }, { t: 'banner', x: 0.7, y: 0.1, c: '#caa54a' },
      { t: 'statue', x: 0.5, y: 0.12 },
    ],
  },
  {
    id: 'throne', name: 'Throne of the Demon Lord', act: 'IV', levels: [10],
    ground: ['#2a1622', '#160a12'], border: 'rgba(0,0,0,0.85)',
    grade: 'rgba(255,90,40,0.1)', lightAmbient: 0.55,
    particle: 'embers', pcol: ['#ff5a2a', '#ff9a3a', '#ffce6a'],
    detail: throneDetail,
    props: [
      { t: 'brazier', x: 0.16, y: 0.22, lava: true }, { t: 'brazier', x: 0.84, y: 0.22, lava: true },
      { t: 'brazier', x: 0.16, y: 0.85, lava: true }, { t: 'brazier', x: 0.84, y: 0.85, lava: true },
      { t: 'statue', x: 0.5, y: 0.1 },
    ],
  },
];

export function biomeForLevel(level) {
  return BIOMES.find((b) => b.levels.includes(level)) || BIOMES[BIOMES.length - 1];
}
