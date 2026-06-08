// Core game: state machine, wave spawning, collisions, rendering, HUD.
import { CONFIG, LEVELS } from './config.js';
import { Player, Enemy, inSwingArc } from './entities.js';
import { drawSprite, pickFrame } from './sprite.js';
import { Input } from './input.js';
import { recompute, rollStock, RELICS } from './abilities.js';
import { Assets } from './assets.js';
import { biomeForLevel } from './biomes.js';

const BOSS_NAMES = { miniboss: 'The Dark Knight', boss: 'The Demon Lord' };

export class Game {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ui = ui;
    this.input = new Input(canvas);
    this.state = 'title';
    this.time = 0;
    this.shake = 0;

    this.player = null;
    this.enemies = [];
    this.projectiles = [];
    this.allyProjectiles = [];
    this.effects = [];
    this.level = 1;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.flashScreen = 0;
    this.kills = 0;

    // --- Phase 2 polish state ---
    this.embers = [];          // ambient floating ember particles
    this.transition = null;    // slash-wipe between scenes
    this.countdown = 0;        // 3..2..1..FIGHT pre-level timer
    this.intro = null;         // level/boss intro card
    this.sweep = null;         // "LEVEL CLEARED" banner sweep
    this.pendingReward = null; // rewards shown after the sweep
    this.hitStop = 0;          // brief world freeze on heavy hits
    this.timeScale = 1;        // for slow-mo on death
    this.dying = 0;            // dramatic death sequence timer
    this.hpDisplay = 100;      // smoothed health-bar value
    this.hpGhost = 100;        // lagging "damage taken" chunk
    this.titleT = 0;           // title-scene animation clock
    this.wipeEl = document.getElementById('wipe');

    // --- Phase 3b: open world ---
    this.cam = { x: 0, y: 0 };  // top-left of the view in world space (locked to player)
    this.world = { w: 2600, h: 2600 };
    this.pickups = [];          // walk-over gold / health
    this.gold = 0;
    this.totalGold = 0;

    this.bg = null;
    this._resize();
    window.addEventListener('resize', () => this._resize());
    // Orientation flip (portrait <-> landscape): some mobile browsers report the
    // new window size a frame or two late, so re-layout again shortly after.
    window.addEventListener('orientationchange', () => {
      this._resize();
      setTimeout(() => this._resize(), 200);
      setTimeout(() => this._resize(), 500);
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => this._resize());
    }

    this._last = performance.now();
    requestAnimationFrame((t) => this._frame(t));
  }

  _resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
    this.canvas.width = Math.floor(this.vw * dpr);
    this.canvas.height = Math.floor(this.vh * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.input.layout(this.vw, this.vh);

    // a contained arena ~1.5x the screen — room to roam, walls in view
    this.world = { w: Math.round(this.vw * 1.5), h: Math.round(this.vh * 1.5) };
    const m = 56;
    this.worldBounds = { minX: m, minY: m, maxX: this.world.w - m, maxY: this.world.h - m };
    this.bounds = this.worldBounds;
    this._applyBiome(this.level || 1);
  }

  // Switch to the biome for `level`: bake the whole arena (ground + scattered
  // NATURE + intentionally-framed structures + walls) to one canvas we blit.
  _applyBiome(level) {
    const biome = biomeForLevel(level);
    this.biome = biome;
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
    this._bakeBiomeDecor(g, biome, W, H);
    this._bakeWalls(g, biome, W, H);

    // vignette (heavier — this is a dungeon)
    const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.22, W / 2, H / 2, Math.max(W, H) * 0.6);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    this.bg = c;
    this.voidColor = '#050308';
  }

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
      this._bakeBanner(g, W * 0.5, 36, '#5a1414');
    }
  }

  // A wall band hugging the arena rim, dark dungeon stone.
  _bakeWalls(g, biome, W, H) {
    const t = 28;
    const wall = biome.wall || '#211b2c', cap = biome.cap || '#332a44';
    g.fillStyle = wall;
    g.fillRect(0, 0, W, t); g.fillRect(0, H - t, W, t); g.fillRect(0, 0, t, H); g.fillRect(W - t, 0, t, H);
    // block courses on the wall
    g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 2;
    for (let x = 0; x < W; x += 46) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, t); g.moveTo(x + 23, H - t); g.lineTo(x + 23, H); g.stroke(); }
    g.fillStyle = cap;
    g.fillRect(0, t - 5, W, 5); g.fillRect(0, H - t, W, 5); g.fillRect(t - 5, 0, 5, H); g.fillRect(W - t, 0, 5, H);
    // inner shadow so the floor reads as sunken below the walls
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(t, t, W - 2 * t, 8); g.fillRect(t, t, 8, H - 2 * t);
    g.fillRect(t, H - t - 8, W - 2 * t, 8); g.fillRect(W - t - 8, t, 8, H - 2 * t);
    if (biome.lava) { // molten trim
      g.fillStyle = 'rgba(255,90,20,0.55)';
      g.fillRect(t, t, W - 2 * t, 2); g.fillRect(t, H - t - 2, W - 2 * t, 2);
    }
  }

  _bakeBrazierPost(g, x, y) {
    g.fillStyle = '#3a3340'; g.fillRect(x - 4, y, 8, 26);          // stand
    g.fillStyle = '#2a2530'; g.fillRect(x - 4, y, 2, 26);
    g.fillStyle = '#6b5a3a'; g.fillRect(x - 9, y - 6, 18, 8);      // bowl
    g.fillStyle = '#4a3d28'; g.fillRect(x - 9, y, 18, 2);
  }
  _bakeBanner(g, x, y, col) {
    g.fillStyle = '#5a4a2a'; g.fillRect(x - 16, y - 6, 32, 3);     // pole top
    g.fillStyle = col; g.fillRect(x - 13, y - 4, 26, 46);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x - 13, y - 4, 5, 46);
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 8, y - 4, 5, 46);
    g.fillStyle = '#e9c84a'; g.fillRect(x - 3, y + 12, 6, 6);      // emblem
    g.beginPath(); g.moveTo(x - 13, y + 42); g.lineTo(x, y + 50); g.lineTo(x + 13, y + 42); g.closePath();
    g.fillStyle = col; g.fill();
  }
  _bakePillar(g, x, y) {
    g.fillStyle = '#b9b2c0'; g.fillRect(x - 11, y - 34, 22, 40);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x - 11, y - 34, 5, 40);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 6, y - 34, 5, 40);
    g.fillStyle = '#cfc8d6'; g.fillRect(x - 14, y - 38, 28, 6); g.fillRect(x - 14, y + 4, 28, 7);
  }
  _bakeTree(g, x, y) {
    g.fillStyle = '#4a3320'; g.fillRect(x - 5, y - 6, 10, 34);     // trunk
    g.fillStyle = '#3a2818'; g.fillRect(x - 5, y - 6, 3, 34);
    for (const [dx, dy, r, c] of [[0, -40, 34, '#2f6b34'], [-18, -26, 24, '#367a3c'], [18, -28, 22, '#2a5e30'], [0, -54, 24, '#3e8a44']]) {
      g.fillStyle = c; g.beginPath(); g.arc(x + dx, y + dy, r, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.arc(x - 8, y - 48, 12, 0, Math.PI * 2); g.fill();
  }
  _bakeStatue(g, x, y) {
    g.fillStyle = '#9a93a6'; g.fillRect(x - 14, y + 30, 28, 8);    // base
    g.fillStyle = '#b4adc0'; g.fillRect(x - 8, y - 6, 16, 38);     // body
    g.fillStyle = '#c7c0d2'; g.beginPath(); g.arc(x, y - 12, 8, 0, Math.PI * 2); g.fill(); // head
    g.fillStyle = '#cfc8d6'; g.fillRect(x - 12, y + 4, 24, 5);     // arms
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x + 4, y - 6, 4, 38);
  }

  _drawPickup(ctx, pk) {
    const x = pk.x, y = pk.y + Math.sin((this.titleT + pk.x * 0.05) * 4) * 2;
    ctx.save();
    if (pk.type === 'gold') {
      const g = ctx.createRadialGradient(x, y, 0, x, y, 11);
      g.addColorStop(0, 'rgba(255,220,90,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#caa52a'; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff7d0'; ctx.fillRect(x - 2, y - 2, 1, 2);
    } else { // health
      const g = ctx.createRadialGradient(x, y, 0, x, y, 13);
      g.addColorStop(0, 'rgba(90,200,96,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5ec860'; ctx.fillRect(x - 2, y - 6, 4, 12); ctx.fillRect(x - 6, y - 2, 12, 4);
      ctx.fillStyle = '#b8ffc6'; ctx.fillRect(x - 2, y - 6, 1.5, 12);
    }
    ctx.restore();
  }

  // ---- camp room props ----
  _drawCampFloor(ctx) {
    const t = this.camp.t;
    // glowing descent door at the bottom wall
    const d = this.camp.door, pulse = 0.7 + 0.3 * Math.sin(t * 3);
    ctx.save();
    const g = ctx.createRadialGradient(d.x, d.y, 4, d.x, d.y, 60);
    g.addColorStop(0, `rgba(210,240,255,${0.9 * pulse})`);
    g.addColorStop(0.5, `rgba(150,210,255,${0.45 * pulse})`);
    g.addColorStop(1, 'rgba(120,180,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(d.x, d.y, 46, 54, 0, 0, Math.PI * 2); ctx.fill();
    // archway frame
    ctx.strokeStyle = `rgba(220,245,255,${pulse})`; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(d.x - 22, d.y + 24); ctx.lineTo(d.x - 22, d.y - 10);
    ctx.arc(d.x, d.y - 10, 22, Math.PI, 0); ctx.lineTo(d.x + 22, d.y + 24); ctx.stroke();
    // bright core
    ctx.fillStyle = `rgba(255,255,255,${0.5 * pulse})`;
    ctx.beginPath(); ctx.ellipse(d.x, d.y + 4, 14, 24, 0, 0, Math.PI * 2); ctx.fill();
    // rising sparks
    for (let i = 0; i < 4; i++) {
      const yy = d.y + 20 - ((t * 30 + i * 18) % 50);
      ctx.fillStyle = `rgba(210,240,255,${0.6 * pulse})`;
      ctx.fillRect(d.x - 16 + ((i * 9 + t * 14) % 32), yy, 2, 2);
    }
    ctx.restore();

    // the sorcerer's table
    const s = this.camp.sorcerer, tx = s.x, ty = s.y + 20;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(tx, ty + 8, 30, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a3320'; ctx.fillRect(tx - 26, ty - 4, 52, 12);       // top
    ctx.fillStyle = '#33230f'; ctx.fillRect(tx - 26, ty + 4, 52, 4);
    ctx.fillStyle = '#3a2818'; ctx.fillRect(tx - 22, ty + 8, 4, 12); ctx.fillRect(tx + 18, ty + 8, 4, 12); // legs
    // wares on the table: candle + potions
    ctx.fillStyle = '#caa54a'; ctx.fillRect(tx - 20, ty - 9, 3, 5);
    const fl = 0.6 + 0.4 * Math.sin(t * 9);
    ctx.fillStyle = `rgba(255,180,80,${fl})`; ctx.fillRect(tx - 19, ty - 12, 1, 3);
    ctx.fillStyle = '#7fe0a0'; ctx.fillRect(tx - 4, ty - 9, 4, 5);          // green potion
    ctx.fillStyle = '#e06a9a'; ctx.fillRect(tx + 10, ty - 8, 4, 4);        // pink potion
    ctx.restore();
  }

  _drawSorcerer(ctx, s) {
    const t = this.camp.t;
    // arcane aura
    ctx.save();
    const aur = ctx.createRadialGradient(s.x, s.y - 14, 2, s.x, s.y - 14, 40);
    aur.addColorStop(0, `rgba(150,110,230,${0.3 + 0.1 * Math.sin(t * 2)})`);
    aur.addColorStop(1, 'rgba(120,80,200,0)');
    ctx.fillStyle = aur; ctx.beginPath(); ctx.arc(s.x, s.y - 14, 40, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    const frame = (t % 1.4) < 0.7 ? 'idle' : 'walkA';
    drawSprite(ctx, 'sorcerer', frame, s.x, s.y - Math.sin(t * 2) * 1.5, true, 1.5);
    // floating orb above his hand
    const ox = s.x - 12, oy = s.y - 22 + Math.sin(t * 3) * 2;
    ctx.save();
    const og = ctx.createRadialGradient(ox, oy, 0, ox, oy, 7);
    og.addColorStop(0, '#e9d8ff'); og.addColorStop(0.6, '#9a6ce0'); og.addColorStop(1, 'rgba(120,80,200,0)');
    ctx.fillStyle = og; ctx.beginPath(); ctx.arc(ox, oy, 7, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  _drawCampLabels(ctx) {
    const t = this.camp.t, c = this.camp;
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const label = (text, x, y, col, glow) => {
      ctx.font = 'bold 13px "Silkscreen", sans-serif';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(text, x, y); ctx.fillStyle = col; ctx.fillText(text, x, y);
    };
    const bob = Math.sin(t * 2.5) * 2;
    label('The Sorcerer', c.sorcerer.x, c.sorcerer.y - 94 + bob, '#9af0ff');
    label('Descend ▾', c.door.x, c.door.y - 42 + bob, '#bfe9ff');
    ctx.restore();
  }

  // ---------- flow ----------
  // A fresh run resets all progression (death sends you back to Level 1).
  start() {
    this._slashWipe(() => {
      this.player = new Player(this.world.w / 2, this.world.h / 2);
      this.kills = 0; this.level = 1; this.gold = 0; this.totalGold = 0;
      this.hpDisplay = this.hpGhost = this.player.maxHP;
      this.timeScale = 1; this.dying = 0;
      this._startLevel(1, true);
    });
  }

  nextLevel() { this._slashWipe(() => this._startLevel(this.level + 1, false)); }

  _startLevel(level, fullHeal) {
    this.level = level;
    if (!this.player) this.player = new Player(this.world.w / 2, this.world.h / 2);
    this.player.x = this.world.w / 2; this.player.y = this.world.h / 2;
    if (fullHeal) { this.player.hp = this.player.maxHP; }
    this.player.dead = false; this.player.invuln = 0.6;
    // stagger ability cooldowns so they don't all fire at once on level start
    this.player.abilities.forEach((a, i) => { a.cd = 0.4 + i * 0.14; });

    this.enemies = []; this.projectiles = []; this.allyProjectiles = []; this.effects = [];
    this.pickups = [];
    this.bounds = this.worldBounds;                  // restore arena bounds (camp shrinks them)
    this.cam.x = this.player.x - this.vw / 2; this.cam.y = this.player.y - this.vh / 2;
    this.spawnTimer = 0;
    this._buildQueue(level);
    // swap to this level's biome (only rebuilds art when the biome changes)
    if (!this.biome || !this.biome.levels.includes(level)) this._applyBiome(level);
    this.state = 'playing';
    this.ui.showScreen(null);

    // pre-level countdown + intro card (boss intro on 5 & 10)
    this.countdown = 3.6;
    const bossType = (LEVELS[level - 1].boss && 'boss') || (LEVELS[level - 1].miniboss && 'miniboss');
    if (bossType) {
      this.intro = { kind: 'boss', text: BOSS_NAMES[bossType], sub: this.biome.name, t: 0, dur: 2.4 };
      this.countdown = 4.2;
      this.shake = Math.max(this.shake, 8);
    } else {
      this.intro = { kind: 'level', text: `LEVEL ${level}`, sub: this.biome.name, t: 0, dur: 2.0 };
    }
  }

  // Slash-wipe transition: cover the screen, run `mid` at the midpoint, then reveal.
  _slashWipe(mid) {
    this.transition = { t: 0, dur: 0.74, half: 0.37, mid, fired: false };
  }

  // ---------- combat helpers (used by abilities) ----------
  nearestEnemy(x, y, maxDist, exclude) {
    let best = null, bd = maxDist != null ? maxDist * maxDist : Infinity;
    for (const e of this.enemies) {
      if (e.dead || (exclude && exclude.has(e))) continue;
      const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  enemiesInRadius(x, y, r) {
    const out = [];
    const rr = r * r;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
      if (d <= rr + e.r * e.r) out.push(e);
    }
    return out;
  }

  addEffect(fx) { this.effects.push(fx); }

  hitEnemy(e, dmg, kx = 0, ky = 0, source = 'ability') {
    const wasAlive = !e.dead;
    e.takeHit(dmg, kx, ky);
    this.spawnDamageNumber(e.x, e.y - e.r - 6, Math.round(dmg), source);
    if (source === 'sword') { this._spark(e.x, e.y); this._relicOnHit(e, dmg); }
    if (e.boss && wasAlive) this.hitStop = Math.max(this.hitStop, 0.05); // weight on boss hits
    if (wasAlive && e.dead) this.onEnemyKilled(e, source);
  }

  // Relic procs that hang off the blade (only on direct sword hits).
  _relicOnHit(e, dmg) {
    const p = this.player;
    if (p.relics.has('frost')) e.applySlow(1.4);
    if (p.relics.has('thunder')) {
      const t = this.nearestEnemy(e.x, e.y, 150, new Set([e]));
      if (t) {
        this.addEffect({ kind: 'bolt', pts: [{ x: e.x, y: e.y }, { x: t.x, y: t.y }], t: 0, dur: 0.16 });
        this.hitEnemy(t, dmg * 0.5, 0, 0, 'ability');   // 'ability' source won't re-proc
      }
    }
  }

  onEnemyKilled(e, source) {
    const p = this.player;
    // Fury charges slowly — the ultimate should be a rare payoff (~every few levels)
    p.fury = Math.min(p.furyMax, p.fury + (e.boss ? 16 : 1.4) * p.mods.furyMult);
    if (source === 'sword' && p.mods.lifestealHeal > 0) {
      p.hp = Math.min(p.maxHP, p.hp + p.mods.lifestealHeal);
    }
    this.kills++;
    // hit-pause on meaningful kills (skip trash so swarms stay fluid)
    if (e.boss) this.hitStop = Math.max(this.hitStop, 0.14);
    else if (e.type === 'tank') this.hitStop = Math.max(this.hitStop, 0.06);
    this._spawnDeathFx(e);
    this._dropLoot(e);
    // Ember Crown: the slain erupt, scorching nearby foes (no chain-recursion)
    if (p.relics.has('ember') && !this._inEmber) {
      this._inEmber = true;
      const R = 64, dmg = 16 * p.mods.abilityDmgMult;
      for (const o of this.enemiesInRadius(e.x, e.y, R)) {
        if (o === e) continue;
        const a = Math.atan2(o.y - e.y, o.x - e.x);
        this.hitEnemy(o, dmg, Math.cos(a) * 80, Math.sin(a) * 80, 'ability');
      }
      this.addEffect({ kind: 'boom', x: e.x, y: e.y, r: R, t: 0, dur: 0.3 });
      this._inEmber = false;
    }
  }

  _dropLoot(e) {
    const drop = (type, value) => this.pickups.push({ type, value, x: e.x + (Math.random() - 0.5) * 14,
      y: e.y + (Math.random() - 0.5) * 14, vx: (Math.random() - 0.5) * 80, vy: -(40 + Math.random() * 60),
      t: 0, dead: false });
    // gold: most enemies drop a little; bosses/tanks drop a lot
    const coins = e.boss ? 12 : (e.type === 'tank' ? 4 : (Math.random() < 0.8 ? 1 : 0));
    for (let i = 0; i < coins; i++) drop('gold', e.boss ? 6 : (1 + (Math.random() < 0.3 ? 1 : 0)));
    // health: rare from trash, guaranteed-ish from elites/bosses
    if (e.boss || (e.type === 'tank' && Math.random() < 0.5) || Math.random() < 0.05) {
      drop('health', e.boss ? 30 : 12);
    }
  }

  _updatePickups(sdt) {
    const p = this.player;
    const magnet = 95, grab = p.r + 12;
    for (const pk of this.pickups) {
      if (pk.dead) continue;
      pk.t += sdt;
      // little pop on spawn, then settle
      pk.x += pk.vx * sdt; pk.y += pk.vy * sdt;
      pk.vx *= 0.88; pk.vy *= 0.88;
      const dx = p.x - pk.x, dy = p.y - pk.y, d = Math.hypot(dx, dy);
      if (d < magnet) { const s = (1 - d / magnet) * 420; pk.x += (dx / (d || 1)) * s * sdt; pk.y += (dy / (d || 1)) * s * sdt; }
      if (d < grab) { this._collect(pk); pk.dead = true; }
    }
    this.pickups = this.pickups.filter((pk) => !pk.dead);
  }

  _collect(pk) {
    if (pk.type === 'gold') { const g = Math.ceil(pk.value * this.player.mods.goldMult); this.gold += g; this.totalGold += g; }
    else if (pk.type === 'health') {
      this.player.hp = Math.min(this.player.maxHP, this.player.hp + pk.value);
      this.effects.push({ kind: 'dmg', x: this.player.x, y: this.player.y - 30, text: '+' + pk.value,
        vy: -42, color: '#5ec860', t: 0, dur: 0.7 });
    }
  }

  _spawnDeathFx(e) {
    // dissolving sprite + rising embers / soul-wisp
    this.effects.push({ kind: 'death', sprite: e.sprite, x: e.x, y: e.y,
      faceLeft: e.faceLeft, boss: e.boss, t: 0, dur: e.boss ? 0.7 : 0.4 });
    const n = e.boss ? 22 : 6;
    for (let i = 0; i < n; i++) {
      this.embers.push({ x: e.x + (Math.random() - 0.5) * e.r * 1.5,
        y: e.y - e.r * 0.5 + (Math.random() - 0.5) * e.r,
        vx: (Math.random() - 0.5) * 40, vy: -(40 + Math.random() * 70),
        r: 1 + Math.random() * 2, life: 0, dur: 0.5 + Math.random() * 0.7,
        hue: e.boss ? '#ff5a3a' : '#cfe0ff' });
    }
  }

  _spawnEmberBurst() {
    for (let i = 0; i < 80; i++) {
      this.embers.push({ x: this.cam.x + Math.random() * this.vw,
        y: this.cam.y + this.vh * (0.5 + Math.random() * 0.6),
        vx: (Math.random() - 0.5) * 30, vy: -(30 + Math.random() * 70),
        r: 1 + Math.random() * 2.5, life: 0, dur: 2 + Math.random() * 3,
        hue: Math.random() < 0.5 ? '#ff8a3a' : '#e9c84a' });
    }
  }

  spawnDamageNumber(x, y, amount, source) {
    const color = source === 'sword' ? '#ffffff' : source === 'ultimate' ? '#ffd36b' : '#bfe3ff';
    this.effects.push({ kind: 'dmg', x: x + (Math.random() - 0.5) * 10, y, text: '' + amount,
      vy: -42, color, t: 0, dur: 0.7 });
  }

  spawnFireball(x, y, ang, lvl) {
    this.allyProjectiles.push({ x, y, vx: Math.cos(ang) * 360, vy: Math.sin(ang) * 360,
      r: 9, life: 1.6, lvl, dead: false });
  }

  _explodeFireball(fb) {
    const p = this.player;
    const R = 38 + 4 * fb.lvl;                       // much tighter blast
    const dmg = (18 + 7 * fb.lvl) * p.mods.abilityDmgMult;
    for (const e of this.enemiesInRadius(fb.x, fb.y, R)) {
      const a = Math.atan2(e.y - fb.y, e.x - fb.x);
      this.hitEnemy(e, dmg, Math.cos(a) * 90, Math.sin(a) * 90, 'ability');
    }
    this.addEffect({ kind: 'boom', x: fb.x, y: fb.y, r: R, t: 0, dur: 0.32 });
    this.shake = Math.max(this.shake, 3);
  }

  _ultimate() {
    const p = this.player;
    const dmg = 120 * p.mods.abilityDmgMult;
    for (const e of this.enemies) {
      const a = Math.atan2(e.y - p.y, e.x - p.x);
      const wasAlive = !e.dead;
      e.takeHit(dmg, Math.cos(a) * 420, Math.sin(a) * 420);
      e.applySlow(1.5);
      this.spawnDamageNumber(e.x, e.y - e.r - 6, Math.round(dmg), 'ultimate');
      if (wasAlive && e.dead) this.onEnemyKilled(e, 'ultimate');
    }
    this.addEffect({ kind: 'ult', x: p.x, y: p.y, t: 0, dur: 0.55, maxR: Math.hypot(this.vw, this.vh) });
    this.addEffect({ kind: 'banner', text: 'FURY UNLEASHED!', t: 0, dur: 1.1 });
    this.flashScreen = 0.22;
    this.shake = Math.max(this.shake, 11);
    this.hitStop = Math.max(this.hitStop, 0.12);
  }

  _buildQueue(level) {
    const comp = LEVELS[level - 1];
    const q = [];
    for (const [type, count] of Object.entries(comp)) {
      for (let i = 0; i < count; i++) q.push(type);
    }
    // bosses first so they appear immediately
    q.sort((a, b) => (b.includes('boss') ? 1 : 0) - (a.includes('boss') ? 1 : 0));
    this.spawnQueue = q;
    this.totalForLevel = q.length;
  }

  // Spawn just off-camera, biased toward where the player is moving, so foes
  // walk into frame "as if they were already there".
  _spawnPos() {
    const p = this.player, b = this.bounds;
    const moving = p.moving && Math.hypot(p.fx, p.fy) > 0.01;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    let best = null;
    for (let tries = 0; tries < 12; tries++) {
      let x, y;
      if (moving && Math.random() < 0.72) {
        const ang = Math.atan2(p.fy, p.fx) + (Math.random() - 0.5) * 1.2;
        const dist = Math.max(this.vw, this.vh) * 0.42 + 40 + Math.random() * 110;
        x = clamp(p.x + Math.cos(ang) * dist, b.minX, b.maxX);
        y = clamp(p.y + Math.sin(ang) * dist, b.minY, b.maxY);
      } else {
        x = b.minX + Math.random() * (b.maxX - b.minX);
        y = b.minY + Math.random() * (b.maxY - b.minY);
      }
      best = [x, y];
      // prefer points that are currently off-screen (so they march in)
      const sx = x - this.cam.x, sy = y - this.cam.y;
      if (sx < -8 || sx > this.vw + 8 || sy < -8 || sy > this.vh + 8) break;
    }
    return best;
  }

  _spawn(dt) {
    if (!this.spawnQueue.length) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = CONFIG.spawn.interval;
    const n = Math.min(CONFIG.spawn.batch, this.spawnQueue.length);
    for (let i = 0; i < n; i++) {
      const type = this.spawnQueue.shift();
      const pos = this._spawnPos();   // bosses also stride in from off-screen
      this.enemies.push(new Enemy(type, pos[0], pos[1], this.level));
      if (type === 'boss' || type === 'miniboss') break; // a boss is its own batch
    }
  }

  // ---------- dash ----------
  onDash(player) {
    this.shake = Math.max(this.shake, 3);
    this._dashGhostT = 0;
  }

  // ---------- swing ----------
  onSwing(player) {
    this.shake = Math.max(this.shake, 3);
    this.effects.push({ kind: 'swing', t: 0, dur: CONFIG.player.swingActive,
      x: player.x, y: player.y, angle: player.facingAngle });
  }

  _applySwingDamage() {
    const p = this.player;
    if (p.swingTimer <= 0) return;
    const kbStrength = CONFIG.player.knockback;
    const missing = 1 - p.hp / p.maxHP;
    const berserk = p.relics.has('berserk') ? 1 + 0.45 * missing : 1;
    for (const e of this.enemies) {
      if (p.hitThisSwing.has(e)) continue;
      if (inSwingArc(p, e)) {
        const [kx, ky] = [Math.cos(p.facingAngle), Math.sin(p.facingAngle)];
        const kb = e.boss ? kbStrength * 0.25 : kbStrength;
        let dmg = p.swordDamage * berserk;
        if (p.relics.has('exec') && e.hp < e.maxHP * 0.35) dmg *= 1.7;
        this.hitEnemy(e, dmg, kx * kb, ky * kb, 'sword');
        p.hitThisSwing.add(e);
        this.shake = Math.max(this.shake, e.boss ? 5 : 3.5);
      }
    }
    // deflect projectiles caught in the arc
    for (const pr of this.projectiles) {
      const dx = pr.x - p.x, dy = pr.y - p.y;
      if (Math.hypot(dx, dy) <= p.reach) {
        const a = Math.atan2(dy, dx);
        let d = (a - p.facingAngle) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
        if (Math.abs(d) <= (p.arcDeg * Math.PI / 180) / 2) {
          pr.dead = true; this._spark(pr.x, pr.y);
        }
      }
    }
  }

  _spark(x, y) {
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 120;
      this.effects.push({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        t: 0, dur: 0.3 });
    }
  }

  // Fury button: a fixed control centred at the bottom, between move + swing.
  _updateFuryButton() {
    const ib = this.input.furyBtn || (this.input.furyBtn = { x: 0, y: 0, r: 0, visible: false });
    if (this.furyReady && this.state === 'playing' && this.countdown <= 0) {
      ib.x = this.vw / 2;
      ib.y = this.vh - (this.input.btn.r || 60) - 30;
      ib.r = 30; ib.visible = true;
    } else { ib.visible = false; }
  }

  // Gentle camera that follows the hero but stays clamped inside the walls.
  _updateCamera(dt) {
    if (this.state === 'camp') return;            // the camp camera is fixed (set in openCamp)
    let tx, ty;
    if (this.state === 'title' || !this.player) {
      tx = this.world.w / 2 - this.vw / 2; ty = this.world.h / 2 - this.vh / 2;
    } else {
      tx = this.player.x - this.vw / 2; ty = this.player.y - this.vh / 2;
    }
    tx = Math.max(0, Math.min(this.world.w - this.vw, tx));
    ty = Math.max(0, Math.min(this.world.h - this.vh, ty));
    const k = Math.min(1, (dt || 0.016) * 9);   // light smoothing
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
  }

  // ---------- update ----------
  _update(dt) {
    this.time += dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 24);
    if (this.flashScreen > 0) this.flashScreen -= dt;

    this._updateCamera(dt);
    this._updateAmbient(dt);     // embers, transition, intro, sweep, hp bar — run in every state

    // hold the world while the slash-wipe covers the screen
    if (this.transition && this.transition.t < this.transition.half) return;

    if (this.state === 'dying') return this._updateDying(dt);
    if (this.state === 'won') return this._updateWon(dt);
    if (this.state === 'camp') return this._updateCamp(dt);
    if (this.state !== 'playing') return;

    // brief hit-pause freezes the simulation for weight
    if (this.hitStop > 0) { this.hitStop -= dt; return; }

    const sdt = dt * this.timeScale;
    this.input.poll();
    const p = this.player;
    p.update(sdt, this.input, this);
    this._applySwingDamage();

    // pre-level countdown: you can move, but nothing spawns until "FIGHT!"
    if (this.countdown > 0) {
      this.countdown -= dt;
      this._updateProjAndFx(sdt);
      return;
    }

    this._updateAbilities(sdt);
    // Fury no longer auto-fires — it arms a button the player taps to unleash.
    this.furyReady = p.fury >= p.furyMax;
    this._updateFuryButton();
    if (this.furyReady && this.input.furyTapped) {
      this.input.furyTapped = false; p.fury = 0; this.furyReady = false; this._ultimate();
    } else if (this.input.furyTapped) { this.input.furyTapped = false; }
    if (p.dashing) {
      this._dashGhostT = (this._dashGhostT || 0) - sdt;
      if (this._dashGhostT <= 0) {
        this._dashGhostT = 0.03;
        this.effects.push({ kind: 'ghost', x: p.x, y: p.y, faceLeft: p.faceLeft, t: 0, dur: 0.22 });
      }
    }
    this._spawn(sdt);

    for (const e of this.enemies) e.update(sdt, this);
    this._updateProjAndFx(sdt);
    this._updatePickups(sdt);
    this._separate();

    // collisions: enemy contact
    for (const e of this.enemies) {
      const dx = p.x - e.x, dy = p.y - e.y;
      if (Math.hypot(dx, dy) < p.r + e.r) {
        if (p.takeHit(e.cdmg || e.damage)) { this.shake = Math.max(this.shake, 6); }
      }
    }
    // collisions: projectiles vs player
    for (const pr of this.projectiles) {
      if (pr.dead) continue;
      const dx = p.x - pr.x, dy = p.y - pr.y;
      if (Math.hypot(dx, dy) < p.r + pr.r) { if (p.takeHit(pr.dmg)) this.shake = 5; pr.dead = true; }
    }

    this.enemies = this.enemies.filter((e) => !e.dead);
    this.projectiles = this.projectiles.filter((pr) => !pr.dead);

    // outcomes
    if (p.dead) return this._lose();
    if (this.spawnQueue.length === 0 && this.enemies.length === 0) this._win();
  }

  _updateProjAndFx(sdt) {
    for (const pr of this.projectiles) pr.update(sdt, this);
    this._updateAllyProjectiles(sdt);
    for (const fx of this.effects) {
      fx.t += sdt;
      if (fx.kind === 'spark') { fx.x += fx.vx * sdt; fx.y += fx.vy * sdt; fx.vx *= 0.9; fx.vy *= 0.9; }
      else if (fx.kind === 'dmg') { fx.y += fx.vy * sdt; fx.vy *= 0.9; }
      else if (fx.kind === 'death') { fx.vy += 260 * sdt; }
    }
    this.effects = this.effects.filter((f) => f.t < f.dur);
  }

  // Ambient/UI animation that runs regardless of pause/menus.
  _updateAmbient(dt) {
    this.titleT += dt;
    // smoothed health bar
    if (this.player) {
      const hp = Math.max(0, this.player.hp);
      this.hpDisplay += (hp - this.hpDisplay) * Math.min(1, dt * 14);
      if (this.hpGhost < this.hpDisplay) this.hpGhost = this.hpDisplay;
      else this.hpGhost += (this.hpDisplay - this.hpGhost) * Math.min(1, dt * 4);
    }
    // floating embers (used for death fx, title & victory celebration) — spawned
    // in world space around the current view
    const want = (this.state === 'title' || this.state === 'victory') ? 60 : 0;
    if (this.embers.length < want && Math.random() < 0.6) {
      this.embers.push({ x: this.cam.x + Math.random() * this.vw, y: this.cam.y + this.vh + 8,
        vx: (Math.random() - 0.5) * 14, vy: -(18 + Math.random() * 34),
        r: 1 + Math.random() * 2.2, life: 0, dur: 3 + Math.random() * 4,
        hue: Math.random() < 0.5 ? '#ff8a3a' : '#e9c84a' });
    }
    for (const e of this.embers) {
      e.life += dt; e.x += e.vx * dt; e.y += e.vy * dt;
      e.vy += 4 * dt; e.flick = 0.5 + 0.5 * Math.sin(this.titleT * 8 + e.x);
    }
    this.embers = this.embers.filter((e) => e.life < e.dur && e.y > -20);

    this._updateAtmos(dt);

    // slash-wipe transition
    if (this.transition) {
      const tr = this.transition;
      tr.t += dt;
      if (!tr.fired && tr.t >= tr.half) { tr.fired = true; if (tr.mid) tr.mid(); }
      if (tr.t >= tr.dur) this.transition = null;
    }
    // intro card timer
    if (this.intro) { this.intro.t += dt; if (this.intro.t >= this.intro.dur) this.intro = null; }
    // "level cleared" sweep -> then the camp shop
    if (this.sweep) {
      this.sweep.t += dt;
      if (this.sweep.t >= this.sweep.dur) {
        this.sweep = null;
        this.pendingReward = null;
        this._slashWipe(() => this.openCamp());   // wipe into the camp room
      }
    }
  }

  // Biome weather particles (pollen / leaves / embers / snow).
  _updateAtmos(dt) {
    const b = this.biome;
    if (!b || this.state === 'title' || this.state === 'victory') {
      // let any leftover atmos drift out on menus
      for (const a of this.atmos) { a.life += dt; a.x += a.vx * dt; a.y += a.vy * dt; }
      this.atmos = this.atmos.filter((a) => a.life < a.dur);
      return;
    }
    const cap = this.biome.particle === 'pollen' ? 18 : 14;   // sparse & gentle (no confetti)
    if (this.atmos.length < cap && Math.random() < 0.22) {
      const type = b.particle, col = b.pcol[(Math.random() * b.pcol.length) | 0];
      if (type === 'leaves' || type === 'snow') {
        this.atmos.push({ type, x: Math.random() * this.vw, y: -10, col,
          vx: (Math.random() - 0.5) * 24, vy: (type === 'snow' ? 24 : 40) + Math.random() * 30,
          r: type === 'snow' ? 1.5 + Math.random() * 1.5 : 2 + Math.random() * 2,
          spin: Math.random() * 6, life: 0, dur: 6 });
      } else if (type === 'embers') {
        this.atmos.push({ type, x: Math.random() * this.vw, y: this.vh + 8, col,
          vx: (Math.random() - 0.5) * 16, vy: -(20 + Math.random() * 36),
          r: 1 + Math.random() * 2, life: 0, dur: 4 + Math.random() * 3 });
      } else { // pollen / motes
        this.atmos.push({ type: 'pollen', x: Math.random() * this.vw, y: Math.random() * this.vh, col,
          vx: (Math.random() - 0.5) * 10, vy: -(4 + Math.random() * 10),
          r: 1 + Math.random() * 1.6, life: 0, dur: 5 + Math.random() * 4 });
      }
    }
    for (const a of this.atmos) {
      a.life += dt;
      a.x += (a.vx + Math.sin((this.titleT + a.y) * 1.5) * 8) * dt;
      a.y += a.vy * dt;
      a.flick = a.type === 'pollen' || a.type === 'embers' ? 0.5 + 0.5 * Math.sin(this.titleT * 6 + a.x) : 1;
    }
    this.atmos = this.atmos.filter((a) => a.life < a.dur && a.y < this.vh + 20 && a.y > -20);
  }

  _updateDying(dt) {
    // ease into slow-mo, keep the world drifting, then show game over
    this.timeScale += (0.18 - this.timeScale) * Math.min(1, dt * 6);
    const sdt = dt * this.timeScale;
    for (const e of this.enemies) e.update(sdt, this);
    this._updateProjAndFx(sdt);
    this._separate();
    this.dying -= dt;
    if (this.dying <= 0) {
      this.timeScale = 1;
      this.state = 'gameover';
      this.ui.gameOver(this.level);
    }
  }

  _updateWon(dt) {
    this.wonT += dt;
    this._updateProjAndFx(dt);
    // a steady rain of golden confetti for the celebration
    if (Math.random() < 0.7) {
      this.embers.push({ x: this.cam.x + Math.random() * this.vw, y: this.cam.y - 8,
        vx: (Math.random() - 0.5) * 30, vy: 40 + Math.random() * 70,
        r: 1.5 + Math.random() * 2.5, life: 0, dur: 3 + Math.random() * 2,
        hue: Math.random() < 0.5 ? '#ffd86a' : (Math.random() < 0.5 ? '#fff3c0' : '#ff9a3a') });
    }
    if (this.wonT >= 3.6) {
      this.state = 'victory';
      this.ui.victory({ kills: this.kills, gold: this.totalGold, relics: this.player.relics.size });
    }
  }

  _updateAbilities(dt) {
    for (const ab of this.player.abilities) {
      ab.cd -= dt;
      if (ab.cd <= 0) {
        ab.def.cast(this, ab.level);
        ab.cd = ab.def.cooldown;
      }
    }
  }

  _updateAllyProjectiles(dt) {
    for (const fb of this.allyProjectiles) {
      if (fb.dead) continue;
      fb.x += fb.vx * dt; fb.y += fb.vy * dt; fb.life -= dt;
      // explode on contact with an enemy, or when it expires
      let hit = false;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dx = e.x - fb.x, dy = e.y - fb.y;
        if (dx * dx + dy * dy < (e.r + fb.r) * (e.r + fb.r)) { hit = true; break; }
      }
      const b = this.bounds;
      const out = fb.x < b.minX - 30 || fb.x > b.maxX + 30 || fb.y < b.minY - 30 || fb.y > b.maxY + 30;
      if (hit || fb.life <= 0 || out) { if (hit || !out) this._explodeFireball(fb); fb.dead = true; }
    }
    this.allyProjectiles = this.allyProjectiles.filter((f) => !f.dead);
  }

  _separate() {
    const a = this.enemies;
    for (let i = 0; i < a.length; i++) {
      for (let j = i + 1; j < a.length; j++) {
        const e1 = a[i], e2 = a[j];
        let dx = e2.x - e1.x, dy = e2.y - e1.y;
        let d = Math.hypot(dx, dy);
        const min = e1.r + e2.r;
        if (d > 0 && d < min) {
          const push = (min - d) / 2;
          dx /= d; dy /= d;
          const w1 = e1.boss ? 0.1 : 1, w2 = e2.boss ? 0.1 : 1;
          e1.x -= dx * push * w1; e1.y -= dy * push * w1;
          e2.x += dx * push * w2; e2.y += dy * push * w2;
        }
      }
    }
  }

  _lose() {
    // dramatic death: slow-mo + desaturate, then the game-over screen
    this.state = 'dying';
    this.dying = 1.5;
    this.shake = Math.max(this.shake, 9);
  }

  _win() {
    if (this.level >= LEVELS.length) {
      // epic celebration sequence, then the victory screen
      this.state = 'won';
      this.wonT = 0;
      this.shake = Math.max(this.shake, 10);
      this.flashScreen = 0.3;
      this._spawnEmberBurst();
    } else {
      // "LEVEL CLEARED" sweep, then the camp shop
      this.player.hp = Math.min(this.player.maxHP, this.player.hp + CONFIG.hpRestorePerLevel);
      { const b = 10 + this.level * 4; this.gold += b; this.totalGold += b; }   // steady clear bonus
      this.state = 'clearing';
      this.sweep = { t: 0, dur: 1.5 };
      this.pendingReward = { heal: CONFIG.hpRestorePerLevel };
    }
  }

  // ---- the camp: an in-world safe room with a sorcerer to trade with and a
  // glowing door to descend through ----
  openCamp() {
    this.shopStock = rollStock(this.player, 4);
    this.rerollCost = 12;
    this.shopOpen = false;
    this.enemies = []; this.projectiles = []; this.allyProjectiles = []; this.pickups = [];
    this.effects = [];                      // clear leftover swing arcs / damage numbers / death fx
    this.hitStop = 0; this.timeScale = 1;
    this._buildCampRoom();
    // a small, contained room centred in the world; the camera stays put
    const ox = Math.round(this.world.w / 2 - this.vw / 2);
    const oy = Math.round(this.world.h / 2 - this.vh / 2);
    this.cam.x = ox; this.cam.y = oy;
    this.player.x = ox + this.vw * 0.5; this.player.y = oy + this.vh * 0.42;
    this.player.dashTimer = 0; this.player.swingTimer = 0; this.player.invuln = 0;
    const b = this.biome;
    this.camp = {
      sorcerer: { x: ox + this.vw * 0.74, y: oy + this.vh * 0.40 },
      door: { x: ox + this.vw * 0.5, y: oy + this.vh * 0.80 },
      torches: this._campTorchScreen.map(([x, y]) => ({ x: ox + x, y: oy + y, lava: !!b.lava, torch: b.torch })),
      prompt: null, t: 0,
    };
    // keep the player inside the little room
    this.bounds = { minX: ox + 46, minY: oy + 50, maxX: ox + this.vw - 46, maxY: oy + this.vh - 86 };
    this.state = 'camp';
    this.ui.showScreen(null);
    this.ui.setCampPrompt(null);
  }

  // torches active right now (camp room vs arena)
  get _torches() { return (this.state === 'camp' && this.camp) ? this.camp.torches : (this.braziers || []); }

  // Bake a small, screen-sized stone room for the camp (walls + torches + a rug).
  _buildCampRoom() {
    const W = this.vw, H = this.vh, b = this.biome;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, b.ground[0]); grd.addColorStop(1, b.ground[1]);
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    if (b.detail) b.detail(g, W, H);
    // a circular trade rug in the middle-right (toward the sorcerer)
    g.save();
    const rg = g.createRadialGradient(W * 0.5, H * 0.5, 10, W * 0.5, H * 0.5, H * 0.34);
    rg.addColorStop(0, 'rgba(120,90,40,0.18)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, W, H); g.restore();
    // torch posts at the four inner corners
    this._campTorchScreen = [[52, 78], [W - 52, 78], [52, H - 96], [W - 52, H - 96]];
    for (const [tx, ty] of this._campTorchScreen) this._bakeBrazierPost(g, tx, ty);
    this._bakeWalls(g, b, W, H);
    const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    this.campBg = c;
  }

  _updateCamp(dt) {
    if (this.transition && this.transition.t < this.transition.half) return;
    this.camp.t += dt;
    if (this.shopOpen) return;                 // frozen while the shop panel is open
    this.input.poll();
    const p = this.player;
    p.update(dt, this.input, this);
    this._updateProjAndFx(dt);                 // animate & clear any practice-swing arcs
    const c = this.camp;
    const sd = Math.hypot(p.x - c.sorcerer.x, p.y - c.sorcerer.y);
    const dd = Math.hypot(p.x - c.door.x, p.y - c.door.y);
    let prompt = null;
    if (sd < 70) prompt = 'sorcerer';
    else if (dd < 60) prompt = 'door';
    if (prompt !== c.prompt) { c.prompt = prompt; this.ui.setCampPrompt(prompt); }
  }

  // called by the floating prompt button / shop panel
  campTrade() { if (this.state === 'camp') { this.shopOpen = true; this.ui.setCampPrompt(null); this.ui.showShop(this); } }
  campDescend() { if (this.state === 'camp') { this.ui.setCampPrompt(null); this.ui.hideShop(); this.descend(); } }
  closeShop() { this.shopOpen = false; this.ui.hideShop(); }

  buyWare(ware) {
    if (!ware || ware.sold || this.gold < ware.cost) return false;
    const p = this.player;
    this.gold -= ware.cost;
    if (ware.kind === 'forge') {
      const before = p.maxHP;
      p.forge[ware.id] = (p.forge[ware.id] || 0) + 1;
      recompute(p);
      if (ware.id === 'armor') p.hp += p.maxHP - before;   // new armor heals the gained HP
    } else {
      p.relics.add(ware.id);
      recompute(p);
    }
    ware.sold = true;
    return true;
  }

  rerollShop() {
    if (this.gold < this.rerollCost) return false;
    this.gold -= this.rerollCost;
    this.rerollCost += 8;
    this.shopStock = rollStock(this.player, 4);
    return true;
  }

  // Cursed shrine: gamble gold for a chance at a random relic.
  gambleShrine() {
    const cost = 30;
    if (this.gold < cost) return { ok: false };
    this.gold -= cost;
    const p = this.player;
    const unowned = RELICS.filter((r) => !p.relics.has(r.id));
    const r = Math.random();
    if (r < 0.6 && unowned.length) {
      const relic = unowned[(Math.random() * unowned.length) | 0];
      p.relics.add(relic.id); recompute(p);
      return { ok: true, kind: 'relic', name: relic.name, icon: relic.icon };
    }
    if (r < 0.85) { this.gold += 12; this.totalGold += 12; return { ok: true, kind: 'gold', amount: 12 }; }
    return { ok: true, kind: 'nothing' };
  }

  descend() { this.nextLevel(); }

  // ---------- render ----------
  _frame(t) {
    const dt = Math.min(0.05, (t - this._last) / 1000);
    this._last = t;
    this._update(dt);
    this._render();
    requestAnimationFrame((t2) => this._frame(t2));
  }

  _render() {
    const ctx = this.ctx;
    const title = this.state === 'title';
    const camx = this.cam.x, camy = this.cam.y;

    ctx.clearRect(0, 0, this.vw, this.vh);
    ctx.save();
    if (this.shake > 0) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }
    // void beyond the arena (only visible if shake nudges past the wall)
    ctx.fillStyle = this.voidColor || '#070510';
    ctx.fillRect(-30, -30, this.vw + 60, this.vh + 60);

    // ===== world space =====
    ctx.save();
    ctx.translate(-camx, -camy);

    // baked arena, or the small camp room — one blit
    if (this.state === 'camp' && this.campBg) ctx.drawImage(this.campBg, this.cam.x, this.cam.y);
    else if (this.bg) ctx.drawImage(this.bg, 0, 0);
    this._drawBrazierFlames(ctx);
    for (const pk of this.pickups) this._drawPickup(ctx, pk);

    for (const fx of this.effects) if (fx.kind === 'ghost') this._drawGhost(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'swing') this._drawSwing(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'death') this._drawDeathFx(ctx, fx);

    if (title) this._drawTitleScene(ctx);
    if (this.state === 'camp') this._drawCampFloor(ctx);   // door + table (on the floor)

    // depth-sort enemies + hero (+ sorcerer) by feet-y
    const drawList = [...this.enemies];
    if (!title && this.player) drawList.push(this.player);
    if (this.state === 'camp') drawList.push({ sorcerer: true, x: this.camp.sorcerer.x, y: this.camp.sorcerer.y });
    drawList.sort((a, b) => a.y - b.y);
    for (const ent of drawList) {
      if (ent === this.player) this._drawPlayer(ctx);
      else if (ent.sorcerer) this._drawSorcerer(ctx, ent);
      else this._drawEnemy(ctx, ent);
    }
    if (this.state === 'camp') this._drawCampLabels(ctx);

    for (const pr of this.projectiles) this._drawProjectile(ctx, pr);
    for (const fb of this.allyProjectiles) this._drawFireball(ctx, fb);
    for (const fx of this.effects) this._drawAbilityFx(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'spark') this._drawSpark(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'dmg') this._drawDamage(ctx, fx);

    this._drawEmbers(ctx);          // death/title/victory embers (world space)
    ctx.restore();                  // ===== end world space =====
    ctx.restore();                  // end shake

    this._drawDarkness(ctx);        // dungeon shadow with torch-lit pools
    ctx.save(); ctx.translate(-this.cam.x, -this.cam.y);
    this._drawLights(ctx);          // additive light cores, on top of the dark
    ctx.restore();

    this._drawAtmos(ctx);           // biome weather (screen overlay)
    this._drawGrade(ctx);           // biome colour grade (screen overlay)
    if (title) { this._drawTransition(ctx); return; }
    this._drawDeathOverlay(ctx);    // desaturate + "YOU FELL" during dying/gameover lead-in
    this._drawVictory(ctx);         // golden celebration during the 'won' sequence

    // full-screen flash (ultimate)
    if (this.flashScreen > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.6, this.flashScreen * 2);
      ctx.fillStyle = '#fff7d6';
      ctx.fillRect(0, 0, this.vw, this.vh);
      ctx.restore();
    }

    // ultimate banner (screen-space)
    for (const fx of this.effects) {
      if (fx.kind !== 'banner') continue;
      const prog = fx.t / fx.dur;
      const a = prog < 0.15 ? prog / 0.15 : 1 - (prog - 0.15) / 0.85;
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const size = 30 + prog * 14;
      ctx.font = `bold ${size}px "Silkscreen", sans-serif`;
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.strokeText(fx.text, this.vw / 2, this.vh * 0.32);
      ctx.fillStyle = '#ffdd6a';
      ctx.fillText(fx.text, this.vw / 2, this.vh * 0.32);
      ctx.restore();
    }

    this._drawSweep(ctx);          // "LEVEL CLEARED" banner sweep
    this._drawCountdownIntro(ctx); // level/boss intro + 3..2..1..FIGHT
    this._drawHUD(ctx);
    if (this.state === 'playing' || (this.state === 'camp' && !this.shopOpen)) this.input.draw(ctx);
    this._drawFuryButton(ctx);     // floating "unleash fury" button above the hero
    this._drawTransition(ctx);     // slash-wipe on the very top
  }

  _drawFuryButton(ctx) {
    if (this.state !== 'playing') return;
    const b = this.input.furyBtn;
    if (!b.visible) return;
    const t = this.time;
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    const cx = b.x, cy = b.y + Math.sin(t * 3) * 1.5;
    const PXS = 5, N = 9, half = N * PXS / 2;          // a 9x9 chunky-pixel rune tile
    const x0 = Math.round(cx - half), y0 = Math.round(cy - half);
    ctx.save();
    // soft arcane glow behind the stone
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, half + 14 + pulse * 6);
    g.addColorStop(0, `rgba(180,120,255,${0.5 + 0.3 * pulse})`);
    g.addColorStop(1, 'rgba(120,60,200,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, half + 16 + pulse * 6, 0, Math.PI * 2); ctx.fill();
    // pixel helper
    const px = (gx, gy, col) => { ctx.fillStyle = col; ctx.fillRect(x0 + gx * PXS, y0 + gy * PXS, PXS, PXS); };
    const dark = '#140a1e', rim = '#7a3fd0', rimHi = '#a368ff', face = '#2a1745', faceHi = '#36205a';
    for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
      const edge = gx === 0 || gy === 0 || gx === N - 1 || gy === N - 1;
      const ring = gx <= 1 || gy <= 1 || gx >= N - 2 || gy >= N - 2;
      if (edge) px(gx, gy, dark);
      else if (ring) px(gx, gy, (gx + gy) % 2 ? rim : rimHi);
      else px(gx, gy, (gx + gy) % 2 ? face : faceHi);
    }
    // lightning rune (flickers bright on the pulse)
    const bolt = '#fff7c0', boltDim = '#ffd23a';
    const col = pulse > 0.45 ? bolt : boltDim;
    for (const [gx, gy] of [[5, 1], [4, 2], [5, 2], [4, 3], [3, 4], [4, 4], [5, 4], [4, 5], [3, 6], [4, 6], [3, 7]]) px(gx, gy, col);
    // a few orbiting pixel sparks
    for (let i = 0; i < 3; i++) {
      const a = t * 2 + i * 2.1, rr = half + 7;
      ctx.fillStyle = `rgba(220,190,255,${0.5 + 0.5 * pulse})`;
      ctx.fillRect(Math.round(cx + Math.cos(a) * rr) - 1, Math.round(cy + Math.sin(a) * rr) - 1, 3, 3);
    }
    // FURY label above (pixel font, gold glow)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '8px "Silkscreen", sans-serif';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,10,30,0.85)';
    ctx.strokeText('FURY', cx, y0 - 9);
    ctx.fillStyle = `rgba(216,184,255,${0.7 + 0.3 * pulse})`;
    ctx.fillText('FURY', cx, y0 - 9);
    ctx.restore();
  }

  // ---- Phase 3: atmosphere draw helpers ----
  _inView(x, y, pad = 140) {
    return x > this.cam.x - pad && x < this.cam.x + this.vw + pad &&
           y > this.cam.y - pad && y < this.cam.y + this.vh + pad;
  }

  _drawBrazierFlames(ctx) {
    for (const bz of this._torches) {
      if (!this._inView(bz.x, bz.y)) continue;
      const f = this.titleT * 12 + bz.x;
      const h = 12 + Math.sin(f) * 3 + Math.sin(f * 2.3) * 2;
      // flame body
      ctx.save();
      const cy = bz.y - 4;
      const g1 = ctx.createRadialGradient(bz.x, cy - h * 0.3, 1, bz.x, cy, h);
      if (bz.lava) { g1.addColorStop(0, '#fff2b0'); g1.addColorStop(0.5, '#ff5a1e'); g1.addColorStop(1, 'rgba(150,20,0,0)'); }
      else { g1.addColorStop(0, '#fff2c0'); g1.addColorStop(0.55, '#ff9a2a'); g1.addColorStop(1, 'rgba(200,80,0,0)'); }
      ctx.fillStyle = g1;
      ctx.beginPath();
      ctx.moveTo(bz.x - 6, cy + 2);
      ctx.quadraticCurveTo(bz.x - 5, cy - h * 0.6, bz.x, cy - h);
      ctx.quadraticCurveTo(bz.x + 5, cy - h * 0.6, bz.x + 6, cy + 2);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  _drawLights(ctx) {
    // additive warm glow — braziers, the hero's blade, and live projectiles
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = (x, y, r, col, a) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = a; ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    };
    for (const bz of this._torches) {
      if (!this._inView(bz.x, bz.y)) continue;
      const fl = 0.8 + 0.2 * Math.sin(this.titleT * 11 + bz.x);
      glow(bz.x, bz.y - 6, 130, bz.lava ? '#ff7a2a' : (bz.torch || '#ffb24a'), 0.6 * fl);
    }
    if (this.player) glow(this.player.x, this.player.y - 14, 64, '#cfe6ff', 0.16);
    for (const pr of this.projectiles) glow(pr.x, pr.y, 38, pr.boss ? '#ff7a2a' : '#b06bff', 0.55);
    for (const fb of this.allyProjectiles) glow(fb.x, fb.y, 42, '#ff8a3a', 0.65);
    ctx.restore();
  }

  // Dungeon darkness: overlay shadow over everything, then cut light "pools" out
  // of it at the torches, the hero and any spell flashes. This is the vibe.
  _drawDarkness(ctx) {
    const b = this.biome; if (!b || !b.dark) return;
    if (this.state === 'won') return;      // the victory is bathed in golden light
    if (this.flashScreen > 0.02) return;   // the ultimate floods the room with light
    const darkLevel = this.state === 'camp' ? Math.min(b.dark, 0.34) : b.dark; // safe room is brighter
    const S = 0.5;                          // half-res shadow buffer (soft, cheap)
    const sw = Math.max(1, Math.round(this.vw * S)), sh = Math.max(1, Math.round(this.vh * S));
    let sc = this.shadowCanvas, g = this.shadowCtx;
    if (!sc || sc.width !== sw || sc.height !== sh) {
      sc = this.shadowCanvas = document.createElement('canvas');
      sc.width = sw; sc.height = sh;
      g = this.shadowCtx = sc.getContext('2d');
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, sw, sh);
    g.fillStyle = `rgba(4,3,9,${darkLevel})`;
    g.fillRect(0, 0, sw, sh);
    g.globalCompositeOperation = 'destination-out';
    const hole = (wx, wy, r, soft) => {
      const sx = (wx - this.cam.x) * S, sy = (wy - this.cam.y) * S, rr = r * S;
      if (sx < -rr || sx > sw + rr || sy < -rr || sy > sh + rr) return;
      const grd = g.createRadialGradient(sx, sy, rr * soft, sx, sy, rr);
      grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(sx, sy, rr, 0, Math.PI * 2); g.fill();
    };
    for (const bz of this._torches) {
      const fl = 0.85 + 0.15 * Math.sin(this.titleT * 11 + bz.x);
      hole(bz.x, bz.y - 6, 170 * fl, 0.18);
    }
    const hx = this.player ? this.player.x : this.world.w / 2;
    const hy = this.player ? this.player.y - 8 : this.world.h / 2 + this.vh * 0.16;
    hole(hx, hy, 175, 0.25);     // the hero carries the light
    for (const fb of this.allyProjectiles) hole(fb.x, fb.y, 90, 0.15);
    for (const pr of this.projectiles) hole(pr.x, pr.y, 52, 0.15);
    for (const pk of this.pickups) hole(pk.x, pk.y, 30, 0.1);   // loot glints in the dark
    if (this.state === 'camp' && this.camp) {                   // door + sorcerer light the room
      hole(this.camp.door.x, this.camp.door.y - 6, 120, 0.12);
      hole(this.camp.sorcerer.x, this.camp.sorcerer.y - 12, 110, 0.2);
    }
    for (const fx of this.effects) { if (fx.kind === 'boom' || fx.kind === 'ult') hole(fx.x, fx.y, (fx.r || 80) * 1.1, 0.1); }
    g.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.imageSmoothingEnabled = true;
    ctx.drawImage(sc, 0, 0, this.vw, this.vh);
    ctx.restore();
  }

  _drawAtmos(ctx) {
    if (!this.atmos || !this.atmos.length) return;
    ctx.save();
    for (const a of this.atmos) {
      const fade = a.life < 0.4 ? a.life / 0.4 : (a.life > a.dur - 0.6 ? (a.dur - a.life) / 0.6 : 1);
      ctx.globalAlpha = Math.max(0, Math.min(1, fade)) * (a.flick ?? 1) * 0.9;
      ctx.fillStyle = a.col;
      if (a.type === 'leaves') {
        ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.spin + this.titleT * 2);
        ctx.fillRect(-a.r, -a.r * 0.5, a.r * 2, a.r); ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  _drawGrade(ctx) {
    if (!this.biome) return;
    ctx.save();
    ctx.fillStyle = this.biome.grade;
    ctx.fillRect(0, 0, this.vw, this.vh);
    ctx.restore();
  }

  // ---- Phase 2 draw helpers ----
  _drawEmbers(ctx) {
    if (!this.embers.length) return;
    ctx.save();
    for (const e of this.embers) {
      const a = Math.min(1, e.life < 0.3 ? e.life / 0.3 : 1 - e.life / e.dur) * (e.flick ?? 1);
      ctx.globalAlpha = Math.max(0, a) * 0.9;
      ctx.fillStyle = e.hue;
      ctx.fillRect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2);
    }
    ctx.restore();
  }

  _drawTitleScene(ctx) {
    // a knight standing his ground, a couple of foes lurking — all idling.
    // drawn in WORLD space at the world centre (the title frames this spot).
    const cx = this.world.w / 2, gy = this.world.h / 2 + this.vh * 0.18;
    const bob = Math.sin(this.titleT * 2) * 2;
    // lurking enemies flanking
    drawSprite(ctx, 'skeleton', this.titleT % 1 < 0.5 ? 'walkA' : 'walkB',
      cx - this.vw * 0.26, gy + 18 + bob, false, 1.4);
    drawSprite(ctx, 'imp', this.titleT % 0.6 < 0.3 ? 'walkA' : 'walkB',
      cx + this.vw * 0.27, gy - 6 - bob, true, 1.2);
    drawSprite(ctx, 'ogre', this.titleT % 1.2 < 0.6 ? 'idle' : 'walkA',
      cx + this.vw * 0.17, gy + 40 + bob, true, 1.5);
    // hero, larger, sword drawn, gentle breathing
    drawSprite(ctx, 'knight', this.titleT % 1.4 < 0.7 ? 'idle' : 'walkA',
      cx - this.vw * 0.02, gy + bob, false, 2.4);
    // ground glow under hero
    ctx.save();
    const g = ctx.createRadialGradient(cx, gy + 6, 4, cx, gy + 6, 90);
    g.addColorStop(0, 'rgba(120,180,255,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(cx - 90, gy - 84, 180, 120);
    ctx.restore();
  }

  _drawDeathFx(ctx, fx) {
    const prog = fx.t / fx.dur;
    ctx.save();
    ctx.globalAlpha = (1 - prog) * 0.9;
    // squash as it dissolves, tinted bright
    const sx = 1 + prog * 0.4, sy = 1 - prog * 0.5;
    ctx.translate(fx.x, fx.y); ctx.scale(sx, sy); ctx.translate(-fx.x, -fx.y);
    drawSprite(ctx, fx.sprite, 'idle', fx.x, fx.y, fx.faceLeft, 1,
      { color: fx.boss ? '#ff8a5a' : '#dff0ff', a: 0.5 + prog * 0.5 });
    ctx.restore();
  }

  // The wipe is a DOM layer (above the menus); drive it from the transition clock.
  _drawTransition() {
    if (!this.wipeEl) return;
    if (!this.transition) {
      if (this.wipeEl.style.opacity !== '0') this.wipeEl.style.opacity = '0';
      return;
    }
    const prog = Math.min(1, this.transition.t / this.transition.dur);
    const tx = -140 + 280 * prog;   // slides across, covering the screen at the midpoint
    this.wipeEl.style.opacity = '1';
    this.wipeEl.style.transform = `translateX(${tx}%) skewX(-12deg)`;
  }

  _drawSweep(ctx) {
    if (!this.sweep) return;
    const prog = this.sweep.t / this.sweep.dur;
    // a band sweeps left->right with the text, then fades
    const a = prog < 0.7 ? 1 : 1 - (prog - 0.7) / 0.3;
    const cx = this.vw / 2;
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = 'rgba(10,8,18,0.7)';
    const bandH = 92;
    ctx.fillRect(0, this.vh / 2 - bandH / 2, this.vw, bandH);
    ctx.fillStyle = '#e9c84a';
    ctx.fillRect(0, this.vh / 2 - bandH / 2, this.vw, 3);
    ctx.fillRect(0, this.vh / 2 + bandH / 2 - 3, this.vw, 3);
    const slideIn = Math.min(1, prog / 0.25);
    const x = cx - (1 - slideIn) * 60;
    ctx.globalAlpha *= slideIn;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 40px "Silkscreen", sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText('LEVEL CLEARED', x, this.vh / 2);
    ctx.restore();
  }

  _drawCountdownIntro(ctx) {
    // boss letterbox
    if (this.intro && this.intro.kind === 'boss') {
      const p = this.intro.t / this.intro.dur;
      const barH = (p < 0.85 ? 1 : 1 - (p - 0.85) / 0.15) * 64;
      ctx.save();
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, this.vw, barH);
      ctx.fillRect(0, this.vh - barH, this.vw, barH);
      ctx.restore();
    }
    if (this.intro) {
      const it = this.intro, p = it.t / it.dur;
      const slide = p < 0.2 ? p / 0.2 : 1;
      const a = p > 0.8 ? 1 - (p - 0.8) / 0.2 : 1;
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const y = this.vh * 0.38;
      if (it.kind === 'boss') {
        ctx.font = 'bold 16px "Silkscreen", sans-serif'; ctx.fillStyle = '#d8413a';
        ctx.fillText(it.sub, this.vw / 2, y - 34);
        let size = 30 + slide * 6;
        ctx.font = `bold ${size}px "Silkscreen", sans-serif`;
        const maxW = this.vw * 0.88;                    // scale down so it never overflows
        const tw = ctx.measureText(it.text).width;
        if (tw > maxW) { size = Math.floor(size * maxW / tw); ctx.font = `bold ${size}px "Silkscreen", sans-serif`; }
        ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.strokeText(it.text, this.vw / 2, y);
        ctx.fillStyle = '#ffce4a'; ctx.fillText(it.text, this.vw / 2, y);
      } else {
        const x = this.vw / 2 + (1 - slide) * 80;
        ctx.font = '26px "Silkscreen", sans-serif';   // clear digits
        ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.strokeText(it.text, x, y);
        ctx.fillStyle = '#e9c84a';
        ctx.fillText(it.text, x, y);
        if (it.sub) { ctx.font = 'italic 15px "Silkscreen", sans-serif'; ctx.fillStyle = '#cfc6e6';
          ctx.fillText(it.sub, x, y + 30); }
      }
      ctx.restore();
    }
    // 3..2..1..FIGHT countdown
    if (this.state === 'playing' && this.countdown > 0) {
      const c = this.countdown;
      const fight = c <= 0.9;
      const label = fight ? 'FIGHT!' : '' + Math.ceil(c - 0.9);
      // pulse: each number/word pops then settles within its ~0.9s window
      const phase = (c % 0.9) / 0.9;            // 1 at appear -> 0 at end
      const scale = 1 + 0.22 * phase;
      const a = fight ? Math.min(1, c / 0.5) : Math.min(1, phase * 4);
      ctx.save();
      ctx.globalAlpha = Math.max(0.25, a);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const sz = (fight ? 46 : 72) * scale;
      ctx.font = fight ? `bold ${sz}px "Silkscreen", sans-serif` : `${sz}px "Silkscreen", sans-serif`;
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(label, this.vw / 2, this.vh * 0.5);
      ctx.fillStyle = fight ? '#d8413a' : '#fff';
      ctx.fillText(label, this.vw / 2, this.vh * 0.5);
      ctx.restore();
    }
  }

  _drawDeathOverlay(ctx) {
    if (this.state !== 'dying') return;
    const p = 1 - this.dying / 1.5;
    ctx.save();
    ctx.globalAlpha = Math.min(0.55, p);
    ctx.fillStyle = '#1a0c10';
    ctx.fillRect(0, 0, this.vw, this.vh);
    if (p > 0.35) {
      const sp = Math.min(1, (p - 0.35) / 0.25);
      ctx.globalAlpha = sp;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `bold ${64 + (1 - sp) * 40}px "Silkscreen", sans-serif`;
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText('YOU FELL', this.vw / 2, this.vh * 0.45);
      ctx.fillStyle = '#d8413a';
      ctx.fillText('YOU FELL', this.vw / 2, this.vh * 0.45);
    }
    ctx.restore();
  }

  _drawVictory(ctx) {
    if (this.state !== 'won') return;
    const t = this.wonT, cx = this.vw / 2;
    ctx.save();
    // golden wash
    ctx.fillStyle = `rgba(70,46,8,${Math.min(0.4, t * 0.28)})`;
    ctx.fillRect(0, 0, this.vw, this.vh);
    // heavenly light beam + glow on the hero
    if (this.player) {
      const sx = this.player.x - this.cam.x, sy = this.player.y - this.cam.y;
      const beam = ctx.createLinearGradient(sx, 0, sx, sy + 10);
      beam.addColorStop(0, 'rgba(255,236,170,0)'); beam.addColorStop(1, 'rgba(255,236,170,0.28)');
      ctx.fillStyle = beam;
      ctx.beginPath(); ctx.moveTo(sx - 14, 0); ctx.lineTo(sx + 14, 0);
      ctx.lineTo(sx + 60, sy + 16); ctx.lineTo(sx - 60, sy + 16); ctx.closePath(); ctx.fill();
      const rg = ctx.createRadialGradient(sx, sy - 16, 2, sx, sy - 16, 90);
      rg.addColorStop(0, `rgba(255,240,180,${0.4 + 0.1 * Math.sin(t * 5)})`); rg.addColorStop(1, 'rgba(255,220,120,0)');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(sx, sy - 16, 90, 0, Math.PI * 2); ctx.fill();
    }
    // VICTORY slam-in
    if (t > 0.35) {
      const p = Math.min(1, (t - 0.35) / 0.45);
      ctx.globalAlpha = Math.min(1, p * 1.5);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const sz = 26 + (1 - p) * 16;
      ctx.font = `${sz}px "Silkscreen", sans-serif`;
      ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(40,20,0,0.7)';
      ctx.strokeText('VICTORY', cx, this.vh * 0.32);
      const grd = ctx.createLinearGradient(0, this.vh * 0.30, 0, this.vh * 0.35);
      grd.addColorStop(0, '#fff3c0'); grd.addColorStop(1, '#f0b835');
      ctx.fillStyle = grd; ctx.fillText('VICTORY', cx, this.vh * 0.32);
    }
    if (t > 1.0) {
      ctx.globalAlpha = Math.min(1, (t - 1.0) / 0.5);
      ctx.font = 'bold 17px "Silkscreen", sans-serif'; ctx.fillStyle = '#ffe9b0';
      ctx.fillText('The Demon Lord Falls', cx, this.vh * 0.32 + 40);
    }
    ctx.restore();
  }

  _drawAbilityFx(ctx, fx) {
    const k = fx.kind;
    if (k === 'bolt') {
      const a = 1 - fx.t / fx.dur;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = '#bfe9ff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.shadowColor = '#7fd0ff'; ctx.shadowBlur = 10;
      ctx.beginPath();
      for (let i = 0; i < fx.pts.length - 1; i++) {
        const a0 = fx.pts[i], b0 = fx.pts[i + 1];
        ctx.moveTo(a0.x, a0.y);
        const mx = (a0.x + b0.x) / 2 + (Math.random() - 0.5) * 14;
        const my = (a0.y + b0.y) / 2 + (Math.random() - 0.5) * 14;
        ctx.lineTo(mx, my); ctx.lineTo(b0.x, b0.y);
      }
      ctx.stroke();
      ctx.restore();
    } else if (k === 'ring') {
      const prog = fx.t / fx.dur;
      ctx.save();
      ctx.globalAlpha = (1 - prog) * 0.9;
      ctx.strokeStyle = fx.color; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.r * (0.5 + 0.5 * prog), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    } else if (k === 'boom') {
      const prog = fx.t / fx.dur;
      ctx.save();
      const r = fx.r * (0.4 + 0.6 * prog);
      const g = ctx.createRadialGradient(fx.x, fx.y, 0, fx.x, fx.y, r);
      g.addColorStop(0, `rgba(255,230,150,${(1 - prog) * 0.95})`);
      g.addColorStop(0.6, `rgba(255,120,40,${(1 - prog) * 0.7})`);
      g.addColorStop(1, 'rgba(120,20,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else if (k === 'whirl') {
      const prog = fx.t / fx.dur;
      ctx.save();
      ctx.globalAlpha = (1 - prog) * 0.8;
      ctx.strokeStyle = '#dff0ff'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      const a0 = prog * Math.PI * 3;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.r * 0.9, a0, a0 + Math.PI * 1.4); ctx.stroke();
      ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.r * 0.9, a0 + Math.PI, a0 + Math.PI * 2.4); ctx.stroke();
      ctx.restore();
    } else if (k === 'ult') {
      const prog = fx.t / fx.dur;
      ctx.save();
      ctx.globalAlpha = (1 - prog) * 0.9;
      ctx.strokeStyle = '#ffe39a'; ctx.lineWidth = 14;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.maxR * prog, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.maxR * prog * 0.82, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  _drawFireball(ctx, fb) {
    ctx.save();
    const g = ctx.createRadialGradient(fb.x, fb.y, 0, fb.x, fb.y, fb.r * 2.2);
    g.addColorStop(0, '#fff2b0'); g.addColorStop(0.5, '#ff8a2a'); g.addColorStop(1, 'rgba(180,40,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(fb.x, fb.y, fb.r * 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  _drawDamage(ctx, fx) {
    const a = 1 - fx.t / fx.dur;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = '11px "Silkscreen", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(fx.text, fx.x, fx.y);
    ctx.fillStyle = fx.color;
    ctx.fillText(fx.text, fx.x, fx.y);
    ctx.restore();
  }

  _drawPlayer(ctx) {
    const p = this.player;
    const frame = pickFrame(p, this.time);
    // Fury charged: a cool animated purple aura + outline around the knight
    if (this.furyReady && this.state === 'playing') {
      const t = this.time, pulse = 0.5 + 0.5 * Math.sin(t * 6);
      ctx.save();
      const g = ctx.createRadialGradient(p.x, p.y - 18, 4, p.x, p.y - 18, 46);
      g.addColorStop(0, `rgba(170,110,255,${0.28 + 0.18 * pulse})`);
      g.addColorStop(1, 'rgba(140,80,230,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y - 18, 46, 0, Math.PI * 2); ctx.fill();
      // purple silhouette offset around the sprite = glowing outline
      const off = 1.5 + pulse;
      const aura = { color: '#c89aff', a: 0.55 + 0.35 * pulse };
      for (const [dx, dy] of [[off, 0], [-off, 0], [0, off], [0, -off]]) {
        drawSprite(ctx, 'knight', frame, p.x + dx, p.y + dy, p.faceLeft, 1, aura);
      }
      ctx.restore();
    }
    if (p.invuln > 0 && Math.floor(this.time * 20) % 2 === 0 && p.flash <= 0) {
      ctx.globalAlpha = 0.6;   // blink during i-frames
    }
    const tint = p.flash > 0 ? { color: '#ff5a5a', a: 0.6 } : null;
    drawSprite(ctx, 'knight', frame, p.x, p.y, p.faceLeft, 1, tint);
    ctx.globalAlpha = 1;
  }

  _drawEnemy(ctx, e) {
    const tint = e.flash > 0 ? { color: '#ffffff', a: 0.7 }
      : (e.state === 'windup' ? { color: '#ff4040', a: 0.5 } : null);
    drawSprite(ctx, e.sprite, pickFrame(e, this.time + e.x * 0.01), e.x, e.y, e.faceLeft, 1, tint);
    // small HP bar for tanks & bosses
    if (e.boss || e.type === 'tank') {
      const w = e.boss ? 60 : 34;
      const hpf = e.hp / e.maxHP;
      const hy = e.y - (e.boss ? 86 : 56);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(e.x - w / 2 - 1, hy - 1, w + 2, 6);
      ctx.fillStyle = e.boss ? '#d8413a' : '#c9a23a';
      ctx.fillRect(e.x - w / 2, hy, w * hpf, 4);
    }
  }

  _drawProjectile(ctx, pr) {
    ctx.save();
    const col = pr.boss ? '#ff7a2a' : '#b06bff';
    const glow = ctx.createRadialGradient(pr.x, pr.y, 0, pr.x, pr.y, pr.r * 2.4);
    glow.addColorStop(0, col);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r * 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  _drawGhost(ctx, fx) {
    const a = (1 - fx.t / fx.dur) * 0.4;
    ctx.save();
    ctx.globalAlpha = a;
    drawSprite(ctx, 'knight', 'idle', fx.x, fx.y, fx.faceLeft, 1, { color: '#9fd8ff', a: 0.8 });
    ctx.restore();
  }

  _drawSpark(ctx, fx) {
    const a = 1 - fx.t / fx.dur;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = '#fff3c0';
    ctx.fillRect(fx.x - 1.5, fx.y - 1.5, 3, 3);
    ctx.restore();
  }

  _drawSwing(ctx, fx) {
    const p = this.player;
    const reach = p.reach;
    const arc = p.arcDeg * Math.PI / 180;
    const prog = Math.min(1, fx.t / fx.dur);
    const a0 = fx.angle - arc / 2;
    const cur = a0 + prog * arc;
    ctx.save();
    ctx.translate(p.x, p.y);
    // faint full cone
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, reach, a0, fx.angle + arc / 2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(150,220,255,0.08)'; ctx.fill();
    // bright sweep trail
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(190,233,255,0.55)'; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.arc(0, 0, reach * 0.88, a0, cur); ctx.stroke();
    // leading edge
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(cur) * reach, Math.sin(cur) * reach); ctx.stroke();
    ctx.restore();
  }

  _drawHUD(ctx) {
    if (this.state === 'title' || this.state === 'gameover' || this.state === 'victory' || this.state === 'won') return;
    const p = this.player;
    if (!p) return;
    // health bar (fixed max) — smoothed with a "damage ghost" chunk
    const bw = Math.min(180, this.vw * 0.36), bh = 20, bx = 18, by = 20;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(bx - 3, by - 3, bw + 6, bh + 6);
    const hpf = Math.max(0, this.hpDisplay / p.maxHP);
    const ghostf = Math.max(hpf, this.hpGhost / p.maxHP);
    const col = hpf > 0.5 ? '#5ec860' : hpf > 0.25 ? '#e9c84a' : '#d8413a';
    ctx.fillStyle = '#2a1d28'; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = 'rgba(232,120,120,0.65)'; ctx.fillRect(bx, by, bw * ghostf, bh); // ghost
    ctx.fillStyle = col; ctx.fillRect(bx, by, bw * hpf, bh);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = '#fff'; ctx.font = '9px "Silkscreen", sans-serif';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText(`${Math.max(0, Math.ceil(p.hp))}/${p.maxHP}`, bx + 7, by + bh / 2 + 1);

    // fury bar (under health)
    const fy = by + bh + 5, fh = 9;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bx - 3, fy - 3, bw + 6, fh + 6);
    ctx.fillStyle = '#241830'; ctx.fillRect(bx, fy, bw, fh);
    const ff = p.fury / p.furyMax;
    const pulse = 0.7 + 0.3 * Math.sin(this.time * 10);
    ctx.fillStyle = ff >= 1 ? `rgba(255,220,90,${pulse})` : '#9a59e0';
    ctx.fillRect(bx, fy, bw * ff, fh);
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = 'bold 9px "Silkscreen", sans-serif';
    ctx.textAlign = 'left'; ctx.fillText(ff >= 1 ? 'ULTIMATE!' : 'FURY', bx + 4, fy + fh / 2 + 1);

    // level medallion (centred, below the bars) + foes/gold on the right.
    // numbers use Press Start 2P (unambiguous digits); icons are drawn as shapes.
    this._drawLevelBadge(ctx);
    const remaining = this.enemies.length + this.spawnQueue.length;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    ctx.font = '12px "Silkscreen", sans-serif'; ctx.fillStyle = '#f0cf5a';
    ctx.fillText('' + this.gold, this.vw - 16, 26);
    this._diamond(ctx, this.vw - 24 - ctx.measureText('' + this.gold).width, 26, 5, '#f0cf5a');
    if (this.state !== 'camp') {
      ctx.textAlign = 'right'; ctx.fillStyle = '#d6c8ea';
      ctx.font = '12px "Silkscreen", sans-serif';
      ctx.fillText('' + remaining, this.vw - 16, 48);
      this._skull(ctx, this.vw - 26 - ctx.measureText('' + remaining).width, 47, '#d6c8ea');
    }
  }

  // A "cool" diamond level medallion (no longer collides with the bars).
  _drawLevelBadge(ctx) {
    const cx = this.vw / 2, cy = 40;
    const bossType = (LEVELS[this.level - 1].boss && 'boss') ||
      (LEVELS[this.level - 1].miniboss && 'miniboss');
    const accent = bossType ? '#e5524a' : '#f0cf5a';
    const deep = bossType ? '#3a0e0c' : '#3a2c08';
    const R = 26;
    ctx.save();
    // glow
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, R + 14);
    g.addColorStop(0, bossType ? 'rgba(229,82,74,0.5)' : 'rgba(240,207,90,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(cx - R - 16, cy - R - 16, (R + 16) * 2, (R + 16) * 2);
    // diamond plate
    const dia = (r) => { ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); };
    dia(R); ctx.fillStyle = deep; ctx.fill();
    const lg = ctx.createLinearGradient(cx, cy - R, cx, cy + R);
    lg.addColorStop(0, 'rgba(255,255,255,0.18)'); lg.addColorStop(0.5, 'rgba(0,0,0,0)');
    ctx.fillStyle = lg; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = accent; ctx.stroke();
    dia(R - 5); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.stroke();
    // text — "LEVEL" header + big number (no fraction; fits inside the diamond)
    ctx.textAlign = 'center';
    ctx.fillStyle = accent; ctx.font = '600 9px "Silkscreen", sans-serif'; ctx.textBaseline = 'middle';
    ctx.fillText(bossType ? 'BOSS' : 'LEVEL', cx, cy - 9);
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
    ctx.font = (this.level >= 10 ? '15px' : '20px') + ' "Silkscreen", sans-serif';
    ctx.fillText('' + this.level, cx, cy + 9);
    ctx.restore();
  }

  // small HUD icon shapes (so numbers can use a clean monospace pixel font)
  _diamond(ctx, x, y, r, col) {
    ctx.save(); ctx.fillStyle = col; ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  _skull(ctx, x, y, col) {
    ctx.save(); ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y - 1, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(x - 4, y + 2, 8, 3);
    ctx.fillStyle = '#1a1020';
    ctx.fillRect(x - 3, y - 2, 2, 2); ctx.fillRect(x + 1, y - 2, 2, 2);
    ctx.restore();
  }
}
