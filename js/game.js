// Core game: state machine, wave spawning, collisions, rendering, HUD.
import { CONFIG, LEVELS } from './config.js';
import { Player, Enemy, inSwingArc } from './entities.js';
import { drawSprite, pickFrame } from './sprite.js';
import { Input } from './input.js';

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
    this.effects = [];
    this.level = 1;
    this.spawnQueue = [];
    this.spawnTimer = 0;

    this.bg = null;
    this._resize();
    window.addEventListener('resize', () => this._resize());

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
    this._buildBackground();
  }

  _buildBackground() {
    // Pre-render a dark fantasy stone arena to an offscreen canvas.
    const c = document.createElement('canvas');
    c.width = this.vw; c.height = this.vh;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, this.vh);
    grd.addColorStop(0, '#241a30');
    grd.addColorStop(1, '#140e1d');
    g.fillStyle = grd; g.fillRect(0, 0, this.vw, this.vh);

    // deterministic stone speckles + flagstone seams
    let seed = 1337;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    g.fillStyle = 'rgba(255,255,255,0.025)';
    for (let i = 0; i < 900; i++) g.fillRect(rnd() * this.vw, rnd() * this.vh, 2, 2);
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 2;
    const tile = 64;
    for (let x = tile; x < this.vw; x += tile) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, this.vh); g.stroke(); }
    for (let y = tile; y < this.vh; y += tile) { g.beginPath(); g.moveTo(0, y); g.lineTo(this.vw, y); g.stroke(); }

    // vignette
    const v = g.createRadialGradient(this.vw / 2, this.vh / 2, this.vh * 0.3,
      this.vw / 2, this.vh / 2, this.vh * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = v; g.fillRect(0, 0, this.vw, this.vh);
    this.bg = c;
  }

  // ---------- flow ----------
  start() { this.level = 1; this._startLevel(1, true); }

  _startLevel(level, fullHeal) {
    this.level = level;
    if (!this.player) this.player = new Player(this.vw / 2, this.vh / 2);
    this.player.x = this.vw / 2; this.player.y = this.vh / 2;
    if (fullHeal) { this.player.hp = this.player.maxHP; }
    this.player.dead = false; this.player.invuln = 0.6;

    this.enemies = []; this.projectiles = []; this.effects = [];
    this.spawnTimer = 0;
    this._buildQueue(level);
    this.state = 'playing';
    this.ui.showScreen(null);
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
        e.takeHit(CONFIG.player.swordDamage, kx * kb, ky * kb);
        p.hitThisSwing.add(e);
        this._spark(e.x, e.y);
        this.shake = Math.max(this.shake, e.boss ? 5 : 3.5);
      }
    }
    // deflect projectiles caught in the arc
    for (const pr of this.projectiles) {
      const dx = pr.x - p.x, dy = pr.y - p.y;
      if (Math.hypot(dx, dy) <= CONFIG.player.swordReach) {
        const a = Math.atan2(dy, dx);
        let d = (a - p.facingAngle) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
        if (Math.abs(d) <= (CONFIG.player.swordArcDeg * Math.PI / 180) / 2) {
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
    if (this.state !== 'playing') return;

    this.input.poll();
    const p = this.player;
    p.update(dt, this.input, this);
    this._applySwingDamage();
    this._spawn(dt);

    for (const e of this.enemies) e.update(dt, this);
    for (const pr of this.projectiles) pr.update(dt, this);

    // separation so enemies don't fully stack
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

    // effects
    for (const fx of this.effects) {
      fx.t += dt;
      if (fx.kind === 'spark') { fx.x += fx.vx * dt; fx.y += fx.vy * dt; fx.vx *= 0.9; fx.vy *= 0.9; }
    }
    this.effects = this.effects.filter((f) => f.t < f.dur);
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.projectiles = this.projectiles.filter((pr) => !pr.dead);

    // outcomes
    if (p.dead) return this._lose();
    if (this.spawnQueue.length === 0 && this.enemies.length === 0) this._win();
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
    this.state = 'gameover';
    this.ui.gameOver(this.level);
  }

  _win() {
    if (this.level >= LEVELS.length) {
      this.state = 'victory';
      this.ui.victory();
    } else {
      // restore a chunk of the FIXED max HP
      this.player.hp = Math.min(this.player.maxHP, this.player.hp + CONFIG.hpRestorePerLevel);
      this.state = 'levelcomplete';
      this.ui.levelComplete(this.level, CONFIG.hpRestorePerLevel);
    }
  }

  nextLevel() { this._startLevel(this.level + 1, false); }

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

    if (this.state === 'title') { ctx.restore(); this.input.draw(ctx); return; }

    // swing arcs (under sprites)
    for (const fx of this.effects) if (fx.kind === 'swing') this._drawSwing(ctx, fx);

    // draw entities back-to-front by feet y
    const drawList = [...this.enemies, this.player].sort((a, b) => a.y - b.y);
    for (const ent of drawList) {
      if (ent === this.player) this._drawPlayer(ctx);
      else this._drawEnemy(ctx, ent);
    }

    // projectiles + sparks (above)
    for (const pr of this.projectiles) this._drawProjectile(ctx, pr);
    for (const fx of this.effects) if (fx.kind === 'spark') this._drawSpark(ctx, fx);

    ctx.restore();

    this._drawHUD(ctx);
    if (this.state === 'playing') this.input.draw(ctx);
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
    const reach = CONFIG.player.swordReach;
    const arc = CONFIG.player.swordArcDeg * Math.PI / 180;
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
    if (this.state === 'title') return;
    const p = this.player;
    if (!p) return;
    // health bar (fixed max)
    const bw = Math.min(260, this.vw * 0.44), bh = 20, bx = 18, by = 20;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(bx - 3, by - 3, bw + 6, bh + 6);
    const hpf = Math.max(0, p.hp / p.maxHP);
    const col = hpf > 0.5 ? '#5ec860' : hpf > 0.25 ? '#e9c84a' : '#d8413a';
    ctx.fillStyle = '#2a1d28'; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = col; ctx.fillRect(bx, by, bw * hpf, bh);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Trebuchet MS, sans-serif';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText(`${Math.ceil(p.hp)} / ${p.maxHP}`, bx + 8, by + bh / 2 + 1);

    // level label
    ctx.textAlign = 'center';
    ctx.font = 'bold 18px Trebuchet MS, sans-serif';
    ctx.fillStyle = '#e9c84a';
    const bossType = (LEVELS[this.level - 1].boss && 'boss') ||
      (LEVELS[this.level - 1].miniboss && 'miniboss');
    const label = bossType ? `LEVEL ${this.level} — ${BOSS_NAMES[bossType]}` : `LEVEL ${this.level} / 10`;
    ctx.fillText(label, this.vw / 2, 30);

    // foes remaining
    const remaining = this.enemies.length + this.spawnQueue.length;
    ctx.textAlign = 'right';
    ctx.font = 'bold 15px Trebuchet MS, sans-serif';
    ctx.fillStyle = '#ece6f5';
    ctx.fillText(`Foes: ${remaining}`, this.vw - 18, 30);
  }
}
