// Arena construction: biome bakes (ground, props, walls, boss rooms) + the crypt water simulation.
// Split from game.js — method bodies are verbatim; attached to Game.prototype in core.js.
import { biomeForLevel } from '../biomes.js';
import { LEVELS } from '../config.js';

export const worldMethods = {

  // Switch to the biome for `level`: bake the whole arena (ground + scattered
  // NATURE + intentionally-framed structures + walls) to one canvas we blit.
  _applyBiome(level) {
    const biome = biomeForLevel(level);
    this.biome = biome;
    this.puddles = []; this.ripples = [];   // only _bakeWater refills these
    const bossKind = (LEVELS[level - 1].boss && 'boss') || (LEVELS[level - 1].miniboss && 'miniboss');
    this.bossKind = bossKind;
    this.atmos = this.atmos || [];
    const W = this.world.w, H = this.world.h;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');

    // ground gradient
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, biome.ground[0]); grd.addColorStop(1, biome.ground[1]);
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    // scattered NATURE (flowers, grass, leaves, cracks) — looks good scattered
    if (biome.detail) biome.detail(g, W, H);

    // intentional structures, framed along the arena — never random clutter
    this.braziers = [];
    const lava = !!biome.lava, torch = biome.torch || '#ffb24a';
    // a brazier in each corner for light + framing
    const ci = 64;
    for (const [bx, by] of [[ci, ci], [W - ci, ci], [ci, H - ci], [W - ci, H - ci]]) {
      this._bakeBrazierPost(g, bx, by); this.braziers.push({ x: bx, y: by, lava, torch });
    }
    if (bossKind) this._bakeBossRoom(g, biome, W, H, bossKind, lava, torch);
    else {
      // COLONNADE light: stone fire-columns on a flagstone-aligned grid, like
      // pillars down a great hall — even, architectural pools of light. (The
      // earlier jittered ring read as random glowing clutter and patchy light.)
      const step = 620, off = (level % 2) ? step / 2 : 0;   // alternate floors shift the hall
      for (let gy = 350; gy < H - 120; gy += step) {
        for (let gx = 350; gx < W - 120; gx += step) {
          const bx = gx + off;
          if (bx > W - 120) continue;
          if (Math.hypot(bx - W / 2, gy - H / 2) < 230) continue;   // the spawn stays clear
          this._bakeTorchColumn(g, bx, gy);
          this.braziers.push({ x: bx, y: gy - 6, lava, torch });
        }
      }
      this._bakeBiomeDecor(g, biome, W, H); this._bakeScatter(g, biome, W, H, level);
      this._bakeWater(g, biome, W, H, level);   // the Crypt floods for real
      // each floor wears its biome a little differently — a faint colour cast
      const casts = ['rgba(120,80,200,0.045)', 'rgba(60,120,200,0.05)', 'rgba(200,90,60,0.04)',
        'rgba(70,170,140,0.045)', 'rgba(200,60,110,0.04)'];
      g.fillStyle = casts[level % casts.length]; g.fillRect(0, 0, W, H);
    }
    this._bakeWalls(g, biome, W, H);

    // vignette (heavier — this is a dungeon; bloodier and tighter in a boss room)
    const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * (bossKind ? 0.16 : 0.22), W / 2, H / 2, Math.max(W, H) * 0.6);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, bossKind === 'boss' ? 'rgba(26,0,2,0.72)' : (bossKind ? 'rgba(10,2,18,0.7)' : 'rgba(0,0,0,0.55)'));
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    this.bg = c;
    this.voidColor = bossKind === 'boss' ? '#0a0103' : (bossKind ? '#070210' : '#050308');
  },


  // THE FLOOD IS REAL: crypt acts get standing water — dark glassy pools baked
  // into the floor here, then LIVED-IN at render time (_drawWater: moving sheen,
  // drip rings, wakes kicked up by anything that wades through).
  _bakeWater(g, biome, W, H, level) {
    this.puddles = [];
    if (biome.id !== 'crypt') return;
    let seed = 7700 + level * 131;
    const R = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const n = 11 + (level % 3) * 2;
    for (let i = 0; i < n && this.puddles.length < 14; i++) {
      const rx = 60 + R() * 110, ry = rx * (0.42 + R() * 0.16);
      const x = rx + 80 + R() * (W - rx * 2 - 160);
      const y = ry + 90 + R() * (H - ry * 2 - 180);
      if (Math.hypot(x - W / 2, y - H / 2) < 250) continue;          // spawn stays dry
      if (this.braziers.some((b) => Math.hypot(x - b.x, y - b.y) < rx + 70)) continue;
      this.puddles.push({ x, y, rx, ry, ph: R() * Math.PI * 2 });
      // the baked basin: sunken dark glass with a pale stone lip
      g.save();
      g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      g.fillStyle = 'rgba(6,16,14,0.88)'; g.fill();
      g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.5)'; g.stroke();
      g.beginPath(); g.ellipse(x, y - 2, rx - 3, ry - 3, 0, 0, Math.PI * 2);
      g.fillStyle = 'rgba(20,46,40,0.55)'; g.fill();
      g.beginPath(); g.ellipse(x, y + 1.5, rx, ry, 0, Math.PI * 0.15, Math.PI * 0.85);
      g.lineWidth = 2; g.strokeStyle = 'rgba(150,220,200,0.18)'; g.stroke();   // far lip catches light
      g.restore();
    }
    this.ripples = [];
  },


  _updateWater(dt) {
    if (!this.puddles || !this.puddles.length) return;
    const rip = this.ripples || (this.ripples = []);
    // drips from the unseen ceiling — the room never stops being wet
    this._dripT = (this._dripT || 0) - dt;
    if (this._dripT <= 0 && rip.length < 26) {
      this._dripT = 0.35 + Math.random() * 0.5;
      const pd = this.puddles[(Math.random() * this.puddles.length) | 0];
      if (this._inView(pd.x, pd.y, 80)) {
        rip.push({ x: pd.x + (Math.random() - 0.5) * pd.rx * 1.2, y: pd.y + (Math.random() - 0.5) * pd.ry * 1.2,
          t: 0, dur: 1.1, max: 9 + Math.random() * 8, pd });
      }
    }
    // wakes: anything wading through the pools disturbs them
    const wade = (wx, wy, big) => {
      const pd = this._puddleAt(wx, wy);
      if (pd && rip.length < 26) rip.push({ x: wx, y: wy + 4, t: 0, dur: 0.7, max: big ? 16 : 11, pd });
    };
    this._wakeT = (this._wakeT || 0) - dt;
    if (this._wakeT <= 0) {
      this._wakeT = 0.17;
      const p = this.player;
      if (p && p.moving && this.state === 'playing') wade(p.x, p.y, true);
      for (let i = 0; i < Math.min(8, this.enemies.length); i++) {
        const e = this.enemies[i];
        if (e.moving && !e.dead && Math.random() < 0.5) wade(e.x, e.y, e.boss);
      }
    }
    for (const r2 of rip) r2.t += dt;
    this.ripples = rip.filter((r2) => r2.t < r2.dur);
  },


  _puddleAt(x, y) {
    if (!this.puddles) return null;
    for (const pd of this.puddles) {
      const nx = (x - pd.x) / pd.rx, ny = (y - pd.y) / pd.ry;
      if (nx * nx + ny * ny < 0.92) return pd;
    }
    return null;
  },


  _drawWater(ctx) {
    if (!this.puddles || !this.puddles.length || this.state === 'camp') return;
    const t = this.time;
    ctx.save();
    // the living surface: two slow sheen bands slide across each pool
    ctx.globalCompositeOperation = 'lighter';
    for (const pd of this.puddles) {
      if (!this._inView(pd.x, pd.y, pd.rx + 40)) continue;
      ctx.save();
      ctx.beginPath(); ctx.ellipse(pd.x, pd.y, pd.rx - 2, pd.ry - 2, 0, 0, Math.PI * 2); ctx.clip();
      const s1 = Math.sin(t * 0.6 + pd.ph), s2 = Math.sin(t * 0.43 + pd.ph * 2.7 + 2);
      ctx.globalAlpha = 0.05 + 0.025 * Math.sin(t * 1.7 + pd.ph);
      ctx.fillStyle = '#9fe8d0';
      ctx.fillRect(pd.x - pd.rx, pd.y - pd.ry * 0.55 + s1 * pd.ry * 0.5, pd.rx * 2, 3);
      ctx.fillRect(pd.x - pd.rx, pd.y + pd.ry * 0.25 + s2 * pd.ry * 0.45, pd.rx * 2, 2);
      // torch-light caught on the surface, breathing
      ctx.globalAlpha = 0.045 + 0.02 * Math.sin(t * 2.3 + pd.ph * 3);
      const gw = pd.rx * 0.9;
      ctx.fillStyle = this.biome && this.biome.torch ? this.biome.torch : '#7fe8c0';
      ctx.beginPath(); ctx.ellipse(pd.x + Math.sin(t * 0.3 + pd.ph) * pd.rx * 0.2, pd.y, gw, pd.ry * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // ripple rings expanding where the water was touched
    if (this.ripples) {
      for (const r2 of this.ripples) {
        if (r2.t < 0) continue;               // staggered ripple not born yet
        const k = r2.t / r2.dur, rr = 2 + r2.max * k;
        ctx.globalAlpha = (1 - k) * 0.5;
        ctx.strokeStyle = '#bdf0e0'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(r2.x, r2.y, rr, rr * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
        if (k < 0.4) {       // the first instant carries a bright fleck
          ctx.globalAlpha = (1 - k / 0.4) * 0.5;
          ctx.fillStyle = '#e8fff6'; ctx.fillRect(r2.x - 1, r2.y - 1, 2, 2);
        }
      }
    }
    ctx.restore(); ctx.globalAlpha = 1;
  },


  // A dedicated boss chamber: a great scorched ritual circle, a ring of braziers,
  // and a centrepiece at the head of the room (a throne for the Demon Lord, a
  // shrine of broken weapons for his Dark Knight). Threatening, ceremonial, lit.
  _bakeBossRoom(g, biome, W, H, kind, lava, torch) {
    const cx = W / 2, cy = H / 2;
    const boss = kind === 'boss';
    // a wash pooling toward the centre — cold moonlight for the Demon Lord's hall,
    // the old violet murk for the Dark Knight's shrine.
    const wash = g.createRadialGradient(cx, cy, 40, cx, cy, Math.max(W, H) * 0.6);
    wash.addColorStop(0, boss ? 'rgba(30,42,78,0.42)' : 'rgba(26,10,40,0.45)');
    wash.addColorStop(1, 'rgba(0,0,0,0.12)');
    g.fillStyle = wash; g.fillRect(0, 0, W, H);
    // a shaft of cold moonlight spilling from behind the throne, pooling on the circle
    if (boss) {
      g.save(); g.globalCompositeOperation = 'lighter';
      const moon = g.createRadialGradient(cx, 30, 4, cx, 30, 150);
      moon.addColorStop(0, 'rgba(206,222,255,0.5)'); moon.addColorStop(0.4, 'rgba(150,178,235,0.18)'); moon.addColorStop(1, 'rgba(150,178,235,0)');
      g.fillStyle = moon; g.fillRect(cx - 160, -80, 320, 230);
      const beam = g.createLinearGradient(0, 0, 0, cy + 40);
      beam.addColorStop(0, 'rgba(166,196,255,0.16)'); beam.addColorStop(1, 'rgba(166,196,255,0)');
      g.fillStyle = beam; g.beginPath(); g.moveTo(cx - 64, 0); g.lineTo(cx + 64, 0); g.lineTo(cx + W * 0.22, cy + 30); g.lineTo(cx - W * 0.22, cy + 30); g.closePath(); g.fill();
      g.restore();
    }
    // the great ritual circle worked into the floor (centred on the spawn)
    const r = Math.min(W, H) * 0.29;
    this._bakeRitualCircle(g, cx, cy, r, boss ? '#9fb6e8' : '#6a2ea0');
    // braziers set on the ring like ritual candles — cold soulfire for the throne
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * 2 * i / 6 + Math.PI / 6;
      const bx = Math.round(cx + Math.cos(a) * r), by = Math.round(cy + Math.sin(a) * r);
      this._bakeBrazierPost(g, bx, by);
      this.braziers.push({ x: bx, y: by, lava: boss ? false : lava, torch: boss ? '#aac8ff' : torch });
    }
    // the head of the room
    if (boss) this._bakeThrone(g, cx, 78);
    else this._bakeWeaponShrine(g, cx, 78);
  },


  // A scorched summoning circle: concentric rings, radial spokes & runes, and a
  // faint hexagram — glowing dim red/violet.
  _bakeRitualCircle(g, cx, cy, r, col) {
    g.save();
    g.translate(cx, cy);
    // a dark scorch under the whole sigil
    const sc = g.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.05);
    sc.addColorStop(0, 'rgba(0,0,0,0)'); sc.addColorStop(0.8, 'rgba(0,0,0,0.28)'); sc.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sc; g.beginPath(); g.arc(0, 0, r * 1.05, 0, Math.PI * 2); g.fill();
    g.shadowColor = col; g.shadowBlur = 10; g.strokeStyle = col; g.globalAlpha = 0.6;
    g.lineWidth = 3; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(0, 0, r * 0.74, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 2; g.beginPath(); g.arc(0, 0, r * 0.4, 0, Math.PI * 2); g.stroke();
    // radial spokes + rune ticks between the two outer rings
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * 2 * i / n;
      g.beginPath(); g.moveTo(Math.cos(a) * r * 0.74, Math.sin(a) * r * 0.74); g.lineTo(Math.cos(a) * r, Math.sin(a) * r); g.stroke();
      g.globalAlpha = 0.5; g.fillStyle = col;
      g.fillRect(Math.cos(a) * r * 0.87 - 2, Math.sin(a) * r * 0.87 - 2, 4, 4);
      g.globalAlpha = 0.6;
    }
    // a faint hexagram inside the inner ring
    g.lineWidth = 2; g.globalAlpha = 0.4;
    for (let t = 0; t < 2; t++) {
      g.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = Math.PI * 2 * i / 3 + t * Math.PI / 3 - Math.PI / 2;
        const x = Math.cos(a) * r * 0.4, y = Math.sin(a) * r * 0.4;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath(); g.stroke();
    }
    g.restore();
  },


  // The Demon Lord's throne: jagged black stone, a smouldering cushion, a skull
  // set at its crown. Drawn at the head of the room (x centred, y near the wall).
  _bakeThrone(g, x, y) {
    g.save();
    g.translate(x, y);
    const stone = '#161520', stoneHi = '#2a2840', stoneDk = '#09080e';
    // backrest with jagged spires
    g.fillStyle = stone; g.fillRect(-30, 0, 60, 84);
    g.fillStyle = stoneHi; g.fillRect(-30, 0, 4, 84);
    g.fillStyle = stoneDk; g.fillRect(26, 0, 4, 84);
    g.fillStyle = stone;
    for (const sx of [-30, -14, 14, 22]) { g.beginPath(); g.moveTo(sx, 0); g.lineTo(sx + 8, -18); g.lineTo(sx + 16, 0); g.closePath(); g.fill(); }
    // cold cushion, kissed by pale moonlight rather than embers
    g.shadowColor = '#9fb8ff'; g.shadowBlur = 14; g.fillStyle = '#101524'; g.fillRect(-22, 30, 44, 30); g.shadowBlur = 0;
    g.fillStyle = '#26304c'; g.fillRect(-22, 30, 44, 4);
    // arms & seat
    g.fillStyle = stone; g.fillRect(-38, 44, 12, 40); g.fillRect(26, 44, 12, 40);
    g.fillStyle = stoneDk; g.fillRect(-38, 80, 76, 6);
    // a skull set at the crown, bone gone cold
    g.fillStyle = '#cfd6e2'; g.beginPath(); g.arc(0, -6, 8, 0, Math.PI * 2); g.fill();
    g.fillRect(-6, -2, 12, 7);
    g.fillStyle = '#161520'; g.fillRect(-4, -8, 3, 4); g.fillRect(2, -8, 3, 4); g.fillRect(-1, -2, 2, 4);
    g.restore();
  },


  // The Dark Knight's shrine: a banner and a fan of broken blades driven into a
  // mound — the trophies of those who came before.
  _bakeWeaponShrine(g, x, y) {
    g.save();
    g.translate(x, y);
    // tattered banner
    g.fillStyle = '#2a0c2c'; g.fillRect(-22, 0, 44, 64);
    g.fillStyle = '#3c1240'; g.fillRect(-22, 0, 44, 5);
    g.fillStyle = '#160616'; for (let i = -18; i < 22; i += 10) g.fillRect(i, 58, 5, 8);
    // a fan of broken blades stabbed into the ground
    const blade = (ang, len) => {
      g.save(); g.rotate(ang);
      g.fillStyle = '#5a5e6a'; g.fillRect(-2, -len, 4, len);                 // blade
      g.fillStyle = '#7e828e'; g.fillRect(-2, -len, 1, len);
      g.fillStyle = '#2a2a30'; g.fillRect(-5, -6, 10, 3);                    // guard
      g.fillStyle = '#3a2a18'; g.fillRect(-1.5, -3, 3, 9);                   // grip
      g.restore();
    };
    g.translate(0, 70);
    blade(-0.5, 40); blade(-0.2, 52); blade(0.15, 46); blade(0.5, 38); blade(0.0, 30);
    g.fillStyle = '#100a0e'; g.beginPath(); g.ellipse(0, 2, 30, 8, 0, 0, Math.PI * 2); g.fill();   // mound
    g.restore();
  },


  // Biome-specific framed decoration (placed deliberately, not scattered).
  _bakeBiomeDecor(g, biome, W, H) {
    if (biome.id === 'catacomb') {
      this._bakeStatue(g, W * 0.5, 44);
      this._bakePillar(g, 40, H * 0.32); this._bakePillar(g, 40, H * 0.68);
      this._bakePillar(g, W - 40, H * 0.32); this._bakePillar(g, W - 40, H * 0.68);
    } else if (biome.id === 'crypt') {
      this._bakePillar(g, 40, H * 0.3); this._bakePillar(g, 40, H * 0.7);
      this._bakePillar(g, W - 40, H * 0.3); this._bakePillar(g, W - 40, H * 0.7);
      this._bakeBanner(g, W * 0.5, 38, '#2f5a4a');
    } else if (biome.id === 'keep') {
      this._bakeStatue(g, W * 0.5, 44);
      this._bakeBanner(g, W * 0.27, 38, '#7a2222'); this._bakeBanner(g, W * 0.73, 38, '#7a2222');
      this._bakePillar(g, 42, H * 0.32); this._bakePillar(g, 42, H * 0.68);
      this._bakePillar(g, W - 42, H * 0.32); this._bakePillar(g, W - 42, H * 0.68);
    } else if (biome.id === 'throne') {
      this._bakeStatue(g, W * 0.3, 44); this._bakeStatue(g, W * 0.7, 44);
      this._bakeBanner(g, W * 0.5, 36, '#1e2742');
    }
  },


  // Floor debris seeded per floor — flat (no collision), each piece carrying a
  // lit edge and a shadowed edge so it POPS when the blade-light sweeps across
  // it. Under Bladelight, an empty lit pool feels like nothing happened; this
  // gives the light something to discover.
  _bakeScatter(g, biome, W, H, level) {
    let s = (level * 2654435761) >>> 0;
    const R = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    const cx = W / 2, cy = H / 2;
    const n = 26 + (R() * 9 | 0);    // dense enough that the floor has TEXTURE everywhere
    for (let i = 0; i < n; i++) {
      const x = 100 + R() * (W - 200), y = 100 + R() * (H - 200);
      if (Math.hypot(x - cx, y - cy) < 140) continue;            // keep the spawn clear
      const kind = R();
      g.save(); g.translate(x | 0, y | 0);
      if (kind < 0.4) {
        // rubble cluster: tumbled stones, lit from above-left
        for (let k = 0, m = 2 + (R() * 3 | 0); k < m; k++) {
          const ox = (R() - 0.5) * 22, oy = (R() - 0.5) * 14, r = 3 + R() * 4;
          g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(ox + 1.5, oy + 2, r * 1.1, r * 0.5, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#3c3546'; g.beginPath(); g.arc(ox, oy, r, 0, Math.PI * 2); g.fill();
          g.fillStyle = 'rgba(230,238,255,0.16)'; g.beginPath(); g.arc(ox - r * 0.3, oy - r * 0.35, r * 0.55, 0, Math.PI * 2); g.fill();
        }
      } else if (kind < 0.7) {
        // a fallen grave-slab, cracked — lit top edge, sunken shadow
        const w = 18 + R() * 16, h = 10 + R() * 8, rot = (R() - 0.5) * 0.9;
        g.rotate(rot);
        g.fillStyle = 'rgba(0,0,0,0.32)'; g.fillRect(-w / 2 + 2, -h / 2 + 3, w, h);
        g.fillStyle = '#332c40'; g.fillRect(-w / 2, -h / 2, w, h);
        g.fillStyle = 'rgba(235,242,255,0.14)'; g.fillRect(-w / 2, -h / 2, w, 2);
        g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(-w * 0.2, -h / 2); g.lineTo(w * 0.1, h * 0.1); g.lineTo(-w * 0.05, h / 2); g.stroke();
      } else {
        // the fallen: a ribcage / scattered bones, pale enough to glint in the dark
        g.rotate((R() - 0.5) * 1.4);
        g.fillStyle = 'rgba(0,0,0,0.26)'; g.beginPath(); g.ellipse(1, 2, 13, 5, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#b9b2a0'; g.lineWidth = 2;
        for (let k = -2; k <= 2; k++) { g.beginPath(); g.arc(k * 4, 0, 5, Math.PI * 0.15, Math.PI * 0.85, false); g.stroke(); }
        g.fillStyle = '#c8c2b0'; g.fillRect(-12, -2, 4, 3); g.fillRect(9, -1, 5, 3);
      }
      g.restore();
    }
  },


  // A wall band hugging the arena rim, dark dungeon stone.
  _bakeWalls(g, biome, W, H) {
    const t = 28;
    const wall = biome.wall || '#211b2c', cap = biome.cap || '#332a44';
    g.fillStyle = wall;
    g.fillRect(0, 0, W, t); g.fillRect(0, H - t, W, t); g.fillRect(0, 0, t, H); g.fillRect(W - t, 0, t, H);
    // block courses on the wall
    g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 2;
    for (let x = 0; x < W; x += 46) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, t); g.moveTo(x + 23, H - t); g.lineTo(x + 23, H); g.stroke(); }
    // per-stone tonal variation + the dungeon weeping through its masonry
    // (crypt walls sweat green, the keep bleeds rust, catacombs leach pale lime)
    {
      let seed = 9090 + W;
      const R = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
      for (let x = 0; x < W; x += 46) {
        const shade = (R() - 0.5) * 0.14;
        g.fillStyle = shade > 0 ? `rgba(255,255,255,${shade})` : `rgba(0,0,0,${-shade})`;
        g.fillRect(x + 1, 0, 44, t - 5);
        const sh2 = (R() - 0.5) * 0.14;
        g.fillStyle = sh2 > 0 ? `rgba(255,255,255,${sh2})` : `rgba(0,0,0,${-sh2})`;
        g.fillRect(x + 24, H - t + 5, 44, t - 5);
      }
      const weep = biome.id === 'crypt' ? 'rgba(70,130,100,0.4)'
        : biome.id === 'keep' ? 'rgba(120,50,30,0.4)' : 'rgba(170,165,150,0.28)';
      g.fillStyle = weep;
      for (let i = 0; i < W / 300; i++) {
        const x = 40 + R() * (W - 80), len = 6 + R() * 14;
        g.fillRect(x, t - 5 - len, 2, len);                       // streaking down the top wall
        g.fillRect(40 + R() * (W - 80), H - t + 5, 2, 5 + R() * 12);
      }
    }
    g.fillStyle = cap;
    g.fillRect(0, t - 5, W, 5); g.fillRect(0, H - t, W, 5); g.fillRect(t - 5, 0, 5, H); g.fillRect(W - t, 0, 5, H);
    // the cap catches the hall's light along its floor-facing edge
    g.fillStyle = 'rgba(255,240,210,0.10)';
    g.fillRect(0, t - 1, W, 1); g.fillRect(t - 1, 0, 1, H);
    g.fillRect(0, H - t + 4, W, 1); g.fillRect(W - t + 4, 0, 1, H);
    // layered ambient occlusion so the floor reads as sunken below the walls —
    // a tight dark seam, then a wide soft falloff (sells depth under Bladelight)
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(t, t, W - 2 * t, 8); g.fillRect(t, t, 8, H - 2 * t);
    g.fillRect(t, H - t - 8, W - 2 * t, 8); g.fillRect(W - t - 8, t, 8, H - 2 * t);
    g.fillStyle = 'rgba(0,0,0,0.16)';
    g.fillRect(t, t, W - 2 * t, 22); g.fillRect(t, t, 22, H - 2 * t);
    g.fillRect(t, H - t - 22, W - 2 * t, 22); g.fillRect(W - t - 22, t, 22, H - 2 * t);
    if (biome.lava) { // molten trim
      g.fillStyle = 'rgba(255,90,20,0.55)';
      g.fillRect(t, t, W - 2 * t, 2); g.fillRect(t, H - t - 2, W - 2 * t, 2);
    }
  },


  _bakeBrazierPost(g, x, y) {
    g.fillStyle = '#3a3340'; g.fillRect(x - 4, y, 8, 26);          // stand
    g.fillStyle = '#2a2530'; g.fillRect(x - 4, y, 2, 26);
    g.fillStyle = '#6b5a3a'; g.fillRect(x - 9, y - 6, 18, 8);      // bowl
    g.fillStyle = '#4a3d28'; g.fillRect(x - 9, y, 18, 2);
  },

  // A squat stone column bearing an iron fire-bowl — hall architecture, so the
  // light source reads as part of the building, not furniture dropped mid-floor.
  _bakeTorchColumn(g, x, y) {
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(x, y + 30, 16, 6, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2e2938'; g.fillRect(x - 7, y - 2, 14, 30);     // shaft
    g.fillStyle = '#403a4e'; g.fillRect(x - 7, y - 2, 3, 30);      // lit edge
    g.fillStyle = '#1f1b28'; g.fillRect(x + 4, y - 2, 3, 30);      // shadow edge
    g.fillStyle = '#4a4258'; g.fillRect(x - 9, y - 6, 18, 5);      // cap
    g.fillStyle = '#5c5066'; g.fillRect(x - 9, y - 6, 18, 1);
    g.fillStyle = '#241f30'; g.fillRect(x - 9, y + 26, 18, 4);     // base
    g.fillStyle = '#3a3340'; g.fillRect(x - 6, y - 11, 12, 6);     // iron bowl
    g.fillStyle = '#15121c'; g.fillRect(x - 6, y - 6, 12, 1);
  },

  _bakeBanner(g, x, y, col) {
    g.fillStyle = '#5a4a2a'; g.fillRect(x - 16, y - 6, 32, 3);     // pole top
    g.fillStyle = col; g.fillRect(x - 13, y - 4, 26, 46);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x - 13, y - 4, 5, 46);
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 8, y - 4, 5, 46);
    g.fillStyle = '#e9c84a'; g.fillRect(x - 3, y + 12, 6, 6);      // emblem
    g.beginPath(); g.moveTo(x - 13, y + 42); g.lineTo(x, y + 50); g.lineTo(x + 13, y + 42); g.closePath();
    g.fillStyle = col; g.fill();
  },

  _bakePillar(g, x, y) {
    g.fillStyle = '#b9b2c0'; g.fillRect(x - 11, y - 34, 22, 40);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x - 11, y - 34, 5, 40);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 6, y - 34, 5, 40);
    g.fillStyle = '#cfc8d6'; g.fillRect(x - 14, y - 38, 28, 6); g.fillRect(x - 14, y + 4, 28, 7);
  },

  _bakeTree(g, x, y) {
    g.fillStyle = '#4a3320'; g.fillRect(x - 5, y - 6, 10, 34);     // trunk
    g.fillStyle = '#3a2818'; g.fillRect(x - 5, y - 6, 3, 34);
    for (const [dx, dy, r, c] of [[0, -40, 34, '#2f6b34'], [-18, -26, 24, '#367a3c'], [18, -28, 22, '#2a5e30'], [0, -54, 24, '#3e8a44']]) {
      g.fillStyle = c; g.beginPath(); g.arc(x + dx, y + dy, r, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.arc(x - 8, y - 48, 12, 0, Math.PI * 2); g.fill();
  },

  _bakeStatue(g, x, y) {
    g.fillStyle = '#9a93a6'; g.fillRect(x - 14, y + 30, 28, 8);    // base
    g.fillStyle = '#b4adc0'; g.fillRect(x - 8, y - 6, 16, 38);     // body
    g.fillStyle = '#c7c0d2'; g.beginPath(); g.arc(x, y - 12, 8, 0, Math.PI * 2); g.fill(); // head
    g.fillStyle = '#cfc8d6'; g.fillRect(x - 12, y + 4, 24, 5);     // arms
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x + 4, y - 6, 4, 38);
  },
};
