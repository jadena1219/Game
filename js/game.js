// Core game: state machine, wave spawning, collisions, rendering, HUD.
import { CONFIG, LEVELS } from './config.js';
import { Player, Enemy, inSwingArc } from './entities.js';
import { drawSprite, pickFrame } from './sprite.js';
import { Input } from './input.js';
import { rollChoices, applyCard } from './abilities.js';
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

    const margin = 26;
    this.bounds = { minX: margin, minY: 86, maxX: this.vw - margin, maxY: this.vh - margin };
    this._applyBiome(this.level || 1);
  }

  // Switch to the biome for `level`: bake its background + static props, and
  // record the live (animated) brazier light positions.
  _applyBiome(level) {
    const biome = biomeForLevel(level);
    this.biome = biome;
    this.braziers = [];
    this.atmos = this.atmos || [];

    const c = document.createElement('canvas');
    c.width = this.vw; c.height = this.vh;
    const g = c.getContext('2d');
    // ground gradient
    const grd = g.createLinearGradient(0, 0, 0, this.vh);
    grd.addColorStop(0, biome.ground[0]); grd.addColorStop(1, biome.ground[1]);
    g.fillStyle = grd; g.fillRect(0, 0, this.vw, this.vh);
    // scattered detail
    if (biome.detail) biome.detail(g, this.vw, this.vh);

    // bake static props; collect brazier positions for live flames/light
    for (const p of biome.props) {
      const px = p.x * this.vw, py = p.y * this.vh;
      if (p.t === 'brazier') { this._bakeBrazierPost(g, px, py); this.braziers.push({ x: px, y: py, lava: !!p.lava }); }
      else if (p.t === 'banner') this._bakeBanner(g, px, py, p.c || '#c0392b');
      else if (p.t === 'pillar') this._bakePillar(g, px, py);
      else if (p.t === 'tree') this._bakeTree(g, px, py);
      else if (p.t === 'statue') this._bakeStatue(g, px, py);
    }

    // framing border + vignette
    const bw = 70;
    const bgrd = g.createLinearGradient(0, 0, 0, bw);
    bgrd.addColorStop(0, biome.border); bgrd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = bgrd; g.fillRect(0, 0, this.vw, bw);
    const bgrd2 = g.createLinearGradient(0, this.vh, 0, this.vh - bw);
    bgrd2.addColorStop(0, biome.border); bgrd2.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = bgrd2; g.fillRect(0, this.vh - bw, this.vw, bw);
    const lgrd = g.createLinearGradient(0, 0, bw, 0);
    lgrd.addColorStop(0, biome.border); lgrd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = lgrd; g.fillRect(0, 0, bw, this.vh);
    const rgrd = g.createLinearGradient(this.vw, 0, this.vw - bw, 0);
    rgrd.addColorStop(0, biome.border); rgrd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rgrd; g.fillRect(this.vw - bw, 0, bw, this.vh);
    const v = g.createRadialGradient(this.vw / 2, this.vh / 2, this.vh * 0.32,
      this.vw / 2, this.vh / 2, this.vh * 0.78);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = v; g.fillRect(0, 0, this.vw, this.vh);
    this.bg = c;
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

  // ---------- flow ----------
  // A fresh run resets all progression (death sends you back to Level 1).
  start() {
    this._slashWipe(() => {
      this.player = new Player(this.vw / 2, this.vh / 2);
      this.kills = 0; this.level = 1;
      this.hpDisplay = this.hpGhost = this.player.maxHP;
      this.timeScale = 1; this.dying = 0;
      this._startLevel(1, true);
    });
  }

  nextLevel() { this._slashWipe(() => this._startLevel(this.level + 1, false)); }

  _startLevel(level, fullHeal) {
    this.level = level;
    if (!this.player) this.player = new Player(this.vw / 2, this.vh / 2);
    this.player.x = this.vw / 2; this.player.y = this.vh / 2;
    if (fullHeal) { this.player.hp = this.player.maxHP; }
    this.player.dead = false; this.player.invuln = 0.6;
    this.player.fury = this.player.fury; // (persists across levels)
    // stagger ability cooldowns so they don't all fire at once on level start
    this.player.abilities.forEach((a, i) => { a.cd = 0.4 + i * 0.14; });

    this.enemies = []; this.projectiles = []; this.allyProjectiles = []; this.effects = [];
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
      this.intro = { kind: 'boss', text: BOSS_NAMES[bossType], sub: `LEVEL ${level} · ${this.biome.name}`, t: 0, dur: 2.4 };
      this.countdown = 4.2;
      this.shake = Math.max(this.shake, 8);
    } else {
      this.intro = { kind: 'level', text: `LEVEL ${level}`,
        sub: `Act ${this.biome.act} · ${this.biome.name}`, t: 0, dur: 2.0 };
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
    if (source === 'sword') this._spark(e.x, e.y);
    if (e.boss && wasAlive) this.hitStop = Math.max(this.hitStop, 0.05); // weight on boss hits
    if (wasAlive && e.dead) this.onEnemyKilled(e, source);
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
      this.embers.push({ x: Math.random() * this.vw, y: this.vh * (0.5 + Math.random() * 0.6),
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

  _spawnPos() {
    // spawn just outside one of the four edges
    const b = this.bounds;
    const side = Math.floor(Math.random() * 4);
    if (side === 0) return [b.minX + Math.random() * (b.maxX - b.minX), b.minY - 20];
    if (side === 1) return [b.maxX + 20, b.minY + Math.random() * (b.maxY - b.minY)];
    if (side === 2) return [b.minX + Math.random() * (b.maxX - b.minX), b.maxY + 20];
    return [b.minX - 20, b.minY + Math.random() * (b.maxY - b.minY)];
  }

  _spawn(dt) {
    if (!this.spawnQueue.length) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = CONFIG.spawn.interval;
    const n = Math.min(CONFIG.spawn.batch, this.spawnQueue.length);
    for (let i = 0; i < n; i++) {
      const type = this.spawnQueue.shift();
      let pos;
      if (type === 'boss' || type === 'miniboss') {
        pos = [this.vw / 2, this.bounds.minY + 10];
      } else pos = this._spawnPos();
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
    for (const e of this.enemies) {
      if (p.hitThisSwing.has(e)) continue;
      if (inSwingArc(p, e)) {
        const [kx, ky] = [Math.cos(p.facingAngle), Math.sin(p.facingAngle)];
        const kb = e.boss ? kbStrength * 0.25 : kbStrength;
        this.hitEnemy(e, p.swordDamage, kx * kb, ky * kb, 'sword');
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

  // ---------- update ----------
  _update(dt) {
    this.time += dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 24);
    if (this.flashScreen > 0) this.flashScreen -= dt;

    this._updateAmbient(dt);     // embers, transition, intro, sweep, hp bar — run in every state

    // hold the world while the slash-wipe covers the screen
    if (this.transition && this.transition.t < this.transition.half) return;

    if (this.state === 'dying') return this._updateDying(dt);
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
    if (p.fury >= p.furyMax) { p.fury = 0; this._ultimate(); }
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
    // floating embers (used for death fx, title & victory celebration)
    const want = (this.state === 'title' || this.state === 'victory') ? 60 : 0;
    if (this.embers.length < want && Math.random() < 0.6) {
      this.embers.push({ x: Math.random() * this.vw, y: this.vh + 8,
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
    // "level cleared" sweep -> then show reward cards
    if (this.sweep) {
      this.sweep.t += dt;
      if (this.sweep.t >= this.sweep.dur) {
        this.sweep = null;
        const r = this.pendingReward; this.pendingReward = null;
        this.state = 'reward';
        this.ui.showRewards(this.level, r.choices, this.player, r.heal);
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
    const cap = 70;
    if (this.atmos.length < cap && Math.random() < 0.8) {
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
      this.state = 'victory';
      this.ui.victory();
      this._spawnEmberBurst();
    } else {
      // "LEVEL CLEARED" sweep, then the reward cards
      this.player.hp = Math.min(this.player.maxHP, this.player.hp + CONFIG.hpRestorePerLevel);
      this.state = 'clearing';
      this.sweep = { t: 0, dur: 1.5 };
      this.pendingReward = { choices: rollChoices(this.player, 3), heal: CONFIG.hpRestorePerLevel };
    }
  }

  // called by the reward UI when the player taps a card
  chooseReward(card) {
    applyCard(this.player, card);
    this.nextLevel();
  }

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
    ctx.clearRect(0, 0, this.vw, this.vh);
    ctx.save();
    if (this.shake > 0) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }
    if (this.bg) ctx.drawImage(this.bg, 0, 0);
    this._drawBrazierFlames(ctx);   // animated flames on the baked posts

    if (this.state === 'title') {
      this._drawTitleScene(ctx);
      ctx.restore();
      this._drawLights(ctx);
      this._drawAtmos(ctx);
      this._drawGrade(ctx);
      this._drawEmbers(ctx);
      this._drawTransition(ctx);
      return;
    }

    // dash after-images + swing arcs (under sprites)
    for (const fx of this.effects) if (fx.kind === 'ghost') this._drawGhost(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'swing') this._drawSwing(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'death') this._drawDeathFx(ctx, fx);

    // draw entities back-to-front by feet y
    const drawList = [...this.enemies, this.player].sort((a, b) => a.y - b.y);
    for (const ent of drawList) {
      if (ent === this.player) this._drawPlayer(ctx);
      else this._drawEnemy(ctx, ent);
    }

    // projectiles + ability VFX + sparks (above sprites)
    for (const pr of this.projectiles) this._drawProjectile(ctx, pr);
    for (const fb of this.allyProjectiles) this._drawFireball(ctx, fb);
    for (const fx of this.effects) this._drawAbilityFx(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'spark') this._drawSpark(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'dmg') this._drawDamage(ctx, fx);

    ctx.restore();

    this._drawLights(ctx);         // additive warm glow from braziers, spells, the hero
    this._drawAtmos(ctx);          // biome weather particles
    this._drawGrade(ctx);          // biome colour grade
    this._drawEmbers(ctx);
    this._drawDeathOverlay(ctx);   // desaturate + "YOU FELL" during dying/gameover lead-in

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
      ctx.font = `bold ${size}px Trebuchet MS, sans-serif`;
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.strokeText(fx.text, this.vw / 2, this.vh * 0.32);
      ctx.fillStyle = '#ffdd6a';
      ctx.fillText(fx.text, this.vw / 2, this.vh * 0.32);
      ctx.restore();
    }

    this._drawSweep(ctx);          // "LEVEL CLEARED" banner sweep
    this._drawCountdownIntro(ctx); // level/boss intro + 3..2..1..FIGHT
    this._drawHUD(ctx);
    if (this.state === 'playing') this.input.draw(ctx);
    this._drawTransition(ctx);     // slash-wipe on the very top
  }

  // ---- Phase 3: atmosphere draw helpers ----
  _drawBrazierFlames(ctx) {
    if (!this.braziers) return;
    for (const bz of this.braziers) {
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
    if (this.braziers) {
      for (const bz of this.braziers) {
        const fl = 0.8 + 0.2 * Math.sin(this.titleT * 11 + bz.x);
        glow(bz.x, bz.y - 6, 120, bz.lava ? '#ff7a2a' : '#ffb24a', 0.5 * fl);
      }
    }
    if (this.state !== 'title' && this.player) glow(this.player.x, this.player.y - 14, 70, '#bfe9ff', 0.18);
    for (const pr of this.projectiles) glow(pr.x, pr.y, 36, pr.boss ? '#ff7a2a' : '#b06bff', 0.5);
    for (const fb of this.allyProjectiles) glow(fb.x, fb.y, 40, '#ff8a3a', 0.6);
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
    // a knight standing his ground, a couple of foes lurking — all idling
    const cx = this.vw / 2, gy = this.vh * 0.74;
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
    ctx.font = 'bold 40px Trebuchet MS, sans-serif';
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
        ctx.font = 'bold 16px Trebuchet MS, sans-serif'; ctx.fillStyle = '#d8413a';
        ctx.fillText(it.sub, this.vw / 2, y - 34);
        const size = 34 + slide * 8;
        ctx.font = `bold ${size}px Trebuchet MS, sans-serif`;
        ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.strokeText(it.text, this.vw / 2, y);
        ctx.fillStyle = '#ffce4a'; ctx.fillText(it.text, this.vw / 2, y);
      } else {
        const x = this.vw / 2 + (1 - slide) * 80;
        ctx.font = 'bold 38px Trebuchet MS, sans-serif';
        ctx.fillStyle = '#e9c84a';
        ctx.fillText(it.text, x, y);
        if (it.sub) { ctx.font = 'italic 15px Trebuchet MS, sans-serif'; ctx.fillStyle = '#cfc6e6';
          ctx.fillText(it.sub, x, y + 28); }
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
      const sz = (fight ? 60 : 84) * scale;
      ctx.font = `bold ${sz}px Trebuchet MS, sans-serif`;
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
      ctx.font = `bold ${64 + (1 - sp) * 40}px Trebuchet MS, sans-serif`;
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText('YOU FELL', this.vw / 2, this.vh * 0.45);
      ctx.fillStyle = '#d8413a';
      ctx.fillText('YOU FELL', this.vw / 2, this.vh * 0.45);
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
    ctx.font = 'bold 15px Trebuchet MS, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(fx.text, fx.x, fx.y);
    ctx.fillStyle = fx.color;
    ctx.fillText(fx.text, fx.x, fx.y);
    ctx.restore();
  }

  _drawPlayer(ctx) {
    const p = this.player;
    if (p.invuln > 0 && Math.floor(this.time * 20) % 2 === 0 && p.flash <= 0) {
      // blink slightly during i-frames
      ctx.globalAlpha = 0.6;
    }
    const tint = p.flash > 0 ? { color: '#ff5a5a', a: 0.6 } : null;
    drawSprite(ctx, 'knight', pickFrame(p, this.time), p.x, p.y, p.faceLeft, 1, tint);
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
    if (this.state === 'title' || this.state === 'gameover' || this.state === 'victory') return;
    const p = this.player;
    if (!p) return;
    // health bar (fixed max) — smoothed with a "damage ghost" chunk
    const bw = Math.min(260, this.vw * 0.44), bh = 20, bx = 18, by = 20;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(bx - 3, by - 3, bw + 6, bh + 6);
    const hpf = Math.max(0, this.hpDisplay / p.maxHP);
    const ghostf = Math.max(hpf, this.hpGhost / p.maxHP);
    const col = hpf > 0.5 ? '#5ec860' : hpf > 0.25 ? '#e9c84a' : '#d8413a';
    ctx.fillStyle = '#2a1d28'; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = 'rgba(232,120,120,0.65)'; ctx.fillRect(bx, by, bw * ghostf, bh); // ghost
    ctx.fillStyle = col; ctx.fillRect(bx, by, bw * hpf, bh);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Trebuchet MS, sans-serif';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText(`${Math.max(0, Math.ceil(p.hp))} / ${p.maxHP}`, bx + 8, by + bh / 2 + 1);

    // fury bar (under health)
    const fy = by + bh + 5, fh = 9;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bx - 3, fy - 3, bw + 6, fh + 6);
    ctx.fillStyle = '#241830'; ctx.fillRect(bx, fy, bw, fh);
    const ff = p.fury / p.furyMax;
    const pulse = 0.7 + 0.3 * Math.sin(this.time * 10);
    ctx.fillStyle = ff >= 1 ? `rgba(255,220,90,${pulse})` : '#9a59e0';
    ctx.fillRect(bx, fy, bw * ff, fh);
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = 'bold 9px Trebuchet MS, sans-serif';
    ctx.textAlign = 'left'; ctx.fillText(ff >= 1 ? 'ULTIMATE!' : 'FURY', bx + 4, fy + fh / 2 + 1);

    // owned ability icons + levels
    let ix = bx; const iy = fy + fh + 6; const isz = 22;
    ctx.imageSmoothingEnabled = false;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    for (const ab of p.abilities) {
      const img = Assets.icons[ab.id];
      if (img) ctx.drawImage(img, ix, iy, isz, isz);
      ctx.fillStyle = '#e9c84a'; ctx.font = 'bold 10px Trebuchet MS, sans-serif';
      ctx.fillText('' + ab.level, ix + isz - 5, iy + isz);
      ix += isz + 8;
    }
    ctx.imageSmoothingEnabled = true;

    // level label
    ctx.textAlign = 'center';
    ctx.font = 'bold 18px Trebuchet MS, sans-serif';
    ctx.fillStyle = '#e9c84a';
    ctx.textBaseline = 'middle';
    const bossType = (LEVELS[this.level - 1].boss && 'boss') ||
      (LEVELS[this.level - 1].miniboss && 'miniboss');
    const label = bossType ? `LEVEL ${this.level} — ${BOSS_NAMES[bossType]}`
      : `LEVEL ${this.level} / ${LEVELS.length}`;
    ctx.fillText(label, this.vw / 2, 30);

    // foes remaining
    const remaining = this.enemies.length + this.spawnQueue.length;
    ctx.textAlign = 'right';
    ctx.font = 'bold 15px Trebuchet MS, sans-serif';
    ctx.fillStyle = '#ece6f5';
    ctx.fillText(`Foes: ${remaining}`, this.vw - 18, 30);
  }
}
