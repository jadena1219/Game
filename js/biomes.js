// Dark dungeon biomes — the descent. Cohesive stone-and-shadow vibe throughout,
// lit by torches against the dark. Each act shifts the tint & hazards, but the
// mood stays grim and torch-lit. Painters draw flagstone floors + grime.

function rngFrom(seed) {
  return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
}

// Shared flagstone floor: tiled stone with seams, shading, cracks, then extras.
function flagstones(g, W, H, seed, seam, extra) {
  const R = rngFrom(seed);
  const tile = 62;
  // per-stone subtle shading so the floor isn't flat
  for (let y = 0; y < H; y += tile) {
    for (let x = 0; x < W; x += tile) {
      const sh = (R() - 0.5) * 0.12;
      g.fillStyle = sh > 0 ? `rgba(255,255,255,${sh})` : `rgba(0,0,0,${-sh})`;
      g.fillRect(x, y, tile, tile);
    }
  }
  // recessed seams
  g.strokeStyle = seam; g.lineWidth = 3;
  for (let x = tile; x < W; x += tile) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = tile; y < H; y += tile) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.strokeStyle = 'rgba(255,255,255,0.04)'; g.lineWidth = 1;
  for (let x = tile; x < W; x += tile) { g.beginPath(); g.moveTo(x + 1, 0); g.lineTo(x + 1, H); g.stroke(); }
  // cracks + grime speckle
  for (let i = 0; i < (W * H) / 5000; i++) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(R() * W, R() * H, 1 + R() * 3, 1); }
  for (let i = 0; i < (W * H) / 7000; i++) { g.fillStyle = 'rgba(255,255,255,0.03)'; g.fillRect(R() * W, R() * H, 2, 2); }
  if (extra) extra(g, W, H, R);
}

const detailCatacomb = (g, W, H) => flagstones(g, W, H, 101, 'rgba(0,0,0,0.4)', (G, W, H, R) => {
  // scattered bones & skulls embedded in the floor
  for (let i = 0; i < (W * H) / 60000; i++) {
    const x = 30 + R() * (W - 60), y = 30 + R() * (H - 60);
    G.fillStyle = 'rgba(200,194,176,0.5)';
    if (R() < 0.5) { G.fillRect(x, y, 8, 2); G.fillRect(x - 1, y - 1, 2, 4); G.fillRect(x + 7, y - 1, 2, 4); }
    else { G.beginPath(); G.arc(x, y, 3, 0, Math.PI * 2); G.fill(); G.fillRect(x - 3, y, 6, 2); }
  }
});

const detailCrypt = (g, W, H) => flagstones(g, W, H, 202, 'rgba(0,0,0,0.45)', (G, W, H, R) => {
  // moss patches + water sheen
  for (let i = 0; i < (W * H) / 26000; i++) {
    const x = R() * W, y = R() * H, r = 10 + R() * 26;
    G.fillStyle = `rgba(40,90,60,${0.08 + R() * 0.12})`;
    G.beginPath(); G.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2); G.fill();
  }
  for (let i = 0; i < (W * H) / 50000; i++) {
    G.fillStyle = 'rgba(90,150,150,0.12)';
    G.beginPath(); G.ellipse(R() * W, R() * H, 18, 7, 0, 0, Math.PI * 2); G.fill();
  }
});

const detailKeep = (g, W, H) => flagstones(g, W, H, 303, 'rgba(0,0,0,0.5)', (G, W, H, R) => {
  // iron rivets + old bloodstains
  for (let i = 0; i < (W * H) / 30000; i++) {
    G.fillStyle = 'rgba(120,110,120,0.5)';
    G.beginPath(); G.arc(R() * W, R() * H, 2, 0, Math.PI * 2); G.fill();
  }
  for (let i = 0; i < (W * H) / 70000; i++) {
    G.fillStyle = 'rgba(80,16,16,0.3)';
    G.beginPath(); G.ellipse(R() * W, R() * H, 14, 9, R() * 3, 0, Math.PI * 2); G.fill();
  }
});

const detailThrone = (g, W, H) => flagstones(g, W, H, 404, 'rgba(0,0,0,0.6)', (G, W, H, R) => {
  // molten cracks bleeding through the obsidian floor
  G.lineCap = 'round';
  for (let i = 0; i < (W * H) / 90000; i++) {
    let x = R() * W, y = R() * H; const len = 4 + (R() * 6 | 0);
    G.strokeStyle = 'rgba(255,90,20,0.5)'; G.shadowColor = '#ff6a1e'; G.shadowBlur = 8; G.lineWidth = 2;
    G.beginPath(); G.moveTo(x, y);
    for (let s = 0; s < len; s++) { x += (R() - 0.5) * 44; y += (R() - 0.5) * 44; G.lineTo(x, y); }
    G.stroke();
  }
  G.shadowBlur = 0;
});

export const BIOMES = [
  {
    id: 'catacomb', name: 'The Catacombs', act: 'I', levels: [1, 2, 3],
    ground: ['#2a2433', '#15101d'], wall: '#211b2c', cap: '#332a44',
    grade: 'rgba(40,40,90,0.10)', dark: 0.6, torch: '#9fc6ff', lava: false,
    particle: 'pollen', pcol: ['#7a7a96', '#56566e'],   // cold dust motes
    detail: detailCatacomb,
  },
  {
    id: 'crypt', name: 'The Flooded Crypt', act: 'II', levels: [4, 5, 6],
    ground: ['#1d2a28', '#0e1816'], wall: '#172422', cap: '#243a34',
    grade: 'rgba(40,90,80,0.10)', dark: 0.66, torch: '#7fe8c0', lava: false,
    particle: 'pollen', pcol: ['#5f8a78', '#3c5a4e'],   // damp green dust
    detail: detailCrypt,
  },
  {
    // The Iron Keep stretches to L10 — the Dark Knight holds its inner shrine.
    id: 'keep', name: 'The Iron Keep', act: 'III', levels: [7, 8, 9, 10],
    ground: ['#28202a', '#140d14'], wall: '#1f1820', cap: '#352b33',
    grade: 'rgba(120,60,40,0.10)', dark: 0.62, torch: '#ffb24a', lava: false,
    particle: 'embers', pcol: ['#ff8a3a', '#c0502a', '#ffce6a'],
    detail: detailKeep,
  },
  // ---- the deeper descent (back half): darker, colder, hungrier variants ----
  {
    id: 'catacomb', name: 'The Sunless Vault', act: 'IV', levels: [11, 12, 13],
    ground: ['#231d31', '#0d0916'], wall: '#1a1526', cap: '#2a2240',
    grade: 'rgba(50,40,110,0.12)', dark: 0.66, torch: '#8ab0ff', lava: false,
    particle: 'pollen', pcol: ['#6a6a8e', '#44445c'],
    detail: detailCatacomb,
  },
  {
    id: 'crypt', name: 'The Drowned Halls', act: 'V', levels: [14, 15, 16],
    ground: ['#16231e', '#08120e'], wall: '#10201a', cap: '#1c332b',
    grade: 'rgba(40,110,90,0.12)', dark: 0.72, torch: '#6fe0b0', lava: false,
    particle: 'pollen', pcol: ['#4e7a68', '#2e4a3e'],
    detail: detailCrypt,
  },
  {
    id: 'keep', name: 'The Bleeding Keep', act: 'VI', levels: [17, 18, 19],
    ground: ['#2a1b1d', '#140a0b'], wall: '#1f1315', cap: '#33222a',
    grade: 'rgba(170,40,30,0.13)', dark: 0.6, torch: '#ff7a4a', lava: false,
    particle: 'embers', pcol: ['#ff7a3a', '#c0402a', '#ffb24a'],
    detail: detailKeep,
  },
  {
    id: 'throne', name: 'Throne of the Demon Lord', act: 'VII', levels: [20],
    ground: ['#241320', '#10070d'], wall: '#180a12', cap: '#2c1420',
    grade: 'rgba(255,70,30,0.12)', dark: 0.55, torch: '#ff7a2a', lava: true,
    particle: 'embers', pcol: ['#ff5a2a', '#ff9a3a', '#ffce6a'],
    detail: detailThrone,
  },
];

export function biomeForLevel(level) {
  return BIOMES.find((b) => b.levels.includes(level)) || BIOMES[BIOMES.length - 1];
}
