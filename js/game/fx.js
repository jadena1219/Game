// Effect/particle bookkeeping: spawning gibs/puffs/decals, banner queue, ambient timers.
// NOTE: _updateAmbient also ticks transition/intro/sweep timers (kitchen-sink updater, kept verbatim).
// Split from game.js — method bodies are verbatim; attached to Game.prototype in core.js.
import { Sound } from '../audio.js';
import { ELITE_AFFIXES } from '../config.js';
import { pickFrame } from '../sprite.js';
import { DEMON_LINES } from './data.js';

export const fxMethods = {

  // Banners (FRENZY! / THUNDERSTORM / FURY READY …) go through a QUEUE: one at
  // a time, deduped, held while the LEVEL CLEARED sweep owns the centre — the
  // review footage caught three of them piled into the same pixels.
  addEffect(fx) {
    if (fx.kind === 'banner') {
      const q = this.bannerQ || (this.bannerQ = []);
      if ((this.activeBanner && this.activeBanner.text === fx.text) ||
          q.some((b) => b.text === fx.text)) return;
      q.push(fx);
      return;
    }
    this.effects.push(fx);
  },


  _updateBanners(dt) {
    const q = this.bannerQ || (this.bannerQ = []);
    if (this.state !== 'playing' && this.state !== 'clearing' && q.length) q.length = 0;
    if (this.activeBanner) {
      this.activeBanner.t += dt;
      if (this.activeBanner.t >= this.activeBanner.dur) this.activeBanner = null;
    }
    if (!this.activeBanner && q.length && !this.sweep) this.activeBanner = q.shift();
  },


  spawnDamageNumber(x, y, amount, source) {
    const big = source === 'ultimate';   // crits & the ultimate land BIG and gold
    const color = source === 'sword' ? '#ffffff' : source === 'ultimate' ? '#ffd36b' : '#bfe3ff';
    this.effects.push({ kind: 'dmg', x: x + (Math.random() - 0.5) * 10, y, text: '' + amount,
      vy: big ? -56 : -42, color, big, t: 0, dur: big ? 0.8 : 0.6 });
  },


  // flying debris chunks (bone, ash, stone, wisp) — gravity + spin, then fade
  _gib(x, y, color, n, power, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * power;
      this.effects.push({ kind: 'gib', x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - (30 + Math.random() * 70),
        g: opts.g ?? 540, size: opts.size ?? (2 + Math.random() * 3),
        rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 16,
        color, shape: opts.shape || 'rect', t: 0, dur: opts.dur ?? (0.4 + Math.random() * 0.4) });
    }
  },


  // soft expanding smoke/ash puffs
  _puff(x, y, color, n, spread, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * spread;
      this.effects.push({ kind: 'puff', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d,
        vx: Math.cos(a) * (10 + Math.random() * 26), vy: -(10 + Math.random() * 38),
        r0: opts.r0 ?? (3 + Math.random() * 5), r1: opts.r1 ?? (14 + Math.random() * 14),
        color, t: 0, dur: opts.dur ?? (0.4 + Math.random() * 0.3) });
    }
  },


  _spark(x, y) {
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 120;
      this.effects.push({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        t: 0, dur: 0.3 });
    }
  },


  // A directional shower of hot streak-sparks fired out along `ang` — the spray
  // that sells a clean sword hit. `power` scales count + speed (crits hit harder).
  _hitBurst(x, y, ang, power = 1) {
    const n = Math.round(7 * power);
    for (let i = 0; i < n; i++) {
      const a = ang + (Math.random() - 0.5) * 1.2;
      const s = (150 + Math.random() * 240) * power;
      this.effects.push({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        t: 0, dur: 0.2 + Math.random() * 0.14, streak: true,
        col: Math.random() < 0.5 ? '#ffffff' : '#cfeaff' });
    }
    // a stubby cluster of slow embers at the point of impact
    for (let i = 0; i < 3; i++) {
      const a = ang + (Math.random() - 0.5) * 2.4, s = 30 + Math.random() * 50;
      this.effects.push({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        t: 0, dur: 0.16 + Math.random() * 0.1, col: '#9fd0ff' });
    }
  },


  // A single drifting glow-mote (used for elite auras, ember rain, frost mist...).
  _mote(x, y, color, opts = {}) {
    this.effects.push({ kind: 'mote', x, y,
      vx: opts.vx ?? 0, vy: opts.vy ?? 0, g: opts.g ?? 0, drag: opts.drag ?? 1,
      r: opts.r ?? 2, color, glow: opts.glow !== false, twinkle: opts.twinkle || 0,
      t: 0, dur: opts.dur ?? (0.5 + Math.random() * 0.5) });
  },


  // Per-archetype death: each foe dies in its own characterful way.
  // ---- battle decals: the floor REMEMBERS the fight ----
  // Each kill stamps a long-lived mark (bones, scorch, rubble, a fading sigil)
  // that slowly sinks back into the stone. Pieces are pre-rolled at stamp time
  // so drawing is dumb-cheap; the list is capped so massacres stay light.
  _stampDecal(x, y, kind, color) {
    const d = this.decals || (this.decals = []);
    const R = Math.random;
    const pieces = [];
    if (kind === 'bones') {
      for (let i = 0; i < 4 + (R() * 3 | 0); i++) {
        const a = R() * Math.PI * 2, dd = 3 + R() * 11;
        pieces.push({ x: Math.cos(a) * dd, y: Math.sin(a) * dd * 0.55, w: 3 + R() * 4, h: 1.5, rot: R() * Math.PI, col: R() < 0.7 ? '#b9b29c' : '#8f8a78' });
      }
      pieces.push({ x: 0, y: 0, skull: true, col: '#b9b29c' });
    } else if (kind === 'scorch') {
      pieces.push({ x: 0, y: 0, ring: 9 + R() * 5, col: 'rgba(0,0,0,0.5)' });
      for (let i = 0; i < 4; i++) { const a = R() * Math.PI * 2, dd = 5 + R() * 8;
        pieces.push({ x: Math.cos(a) * dd, y: Math.sin(a) * dd * 0.5, w: 2, h: 1.5, rot: 0, col: '#100a08' }); }
    } else if (kind === 'rubble') {
      pieces.push({ x: 0, y: 1, ring: 13 + R() * 5, col: 'rgba(0,0,0,0.32)' });
      for (let i = 0; i < 6; i++) { const a = R() * Math.PI * 2, dd = 4 + R() * 13;
        pieces.push({ x: Math.cos(a) * dd, y: Math.sin(a) * dd * 0.5, w: 2.5 + R() * 3.5, h: 2 + R() * 2, rot: R() * Math.PI, col: R() < 0.5 ? '#544a42' : '#3c342e' }); }
    } else if (kind === 'sigil') {
      pieces.push({ x: 0, y: 0, sigil: 8 + R() * 3, col: color || '#7fb8e0' });
    } else { // 'stain' — dark spatter
      for (let i = 0; i < 3 + (R() * 3 | 0); i++) { const a = R() * Math.PI * 2, dd = R() * 9;
        pieces.push({ x: Math.cos(a) * dd, y: Math.sin(a) * dd * 0.5, blot: 2 + R() * 3.5, col: color || '#1c0d12' }); }
    }
    d.push({ x, y, born: this.time, dur: 22 + Math.random() * 6, pieces });
    if (d.length > 48) d.shift();
  },


  _spawnDeathFx(e) {
    const x = e.x, y = e.y, r = e.r, type = e.type;
    let style = 'collapse', dur = 0.4, tintCol = null;

    if (e.boss) {                              // bosses: a violent, ringing death
      style = 'collapse'; dur = 0.95;
      const hot = type === 'boss';
      this.addEffect({ kind: 'boom', x, y, r: r * 2.0, t: 0, dur: 0.6 });
      this.addEffect({ kind: 'ring', x, y, r: r * 2.6, color: '#ffffff', t: 0, dur: 0.5 });
      this.addEffect({ kind: 'ring', x, y, r: r * 3.6, color: hot ? '#ff7a3a' : '#cbd6ff', t: 0, dur: 0.75 });
      this._gib(x, y, hot ? '#7a2230' : '#4a4a5e', 28, 340, { dur: 1.0, size: 3 + Math.random() * 4 });
      this._puff(x, y, hot ? '#2a0e10' : '#14101e', 16, r, { r1: r * 1.5, dur: 0.9 });
      this.shake = Math.max(this.shake, 12);
    } else if (type === 'chaser') {            // skeleton: clatters apart into bones
      this._gib(x, y, '#ddd6c2', 9, 190, { dur: 0.6, size: 2 + Math.random() * 3, shape: 'bone' });
      this._puff(x, y - 2, '#b6b09c', 3, r * 0.5, { r1: r * 0.8, dur: 0.35 });
    } else if (type === 'swarmer') {           // imp: ruptures into crimson cinders + dark blood-smoke
      style = 'poof'; dur = 0.26; tintCol = '#ff8a5a';
      this._puff(x, y - 2, '#3a0c10', 5, r * 0.5, { r0: 3, r1: r * 1.3, dur: 0.4 });
      this.addEffect({ kind: 'ring', x, y: y - r * 0.3, r: r * 1.5, color: '#ff5a30', t: 0, dur: 0.26 });
      for (let i = 0; i < 8; i++) this._mote(x + (Math.random() - 0.5) * r, y - r * 0.3 + (Math.random() - 0.5) * r,
        Math.random() < 0.5 ? '#ff8a3a' : '#ff3a28',
        { vx: (Math.random() - 0.5) * 150, vy: -(20 + Math.random() * 120), g: 240, r: 1.5 + Math.random() * 1.6, dur: 0.35 + Math.random() * 0.3 });
    } else if (type === 'tank') {              // ogre: topples with a heavy dust-burst
      style = 'topple'; dur = 0.62;
      this._puff(x, y + r * 0.4, '#5a5048', 9, r * 0.9, { r0: 6, r1: r * 1.7, dur: 0.6 });
      this._gib(x, y, '#7a6a58', 13, 210, { dur: 0.7, size: 3 + Math.random() * 4 });
      this.addEffect({ kind: 'ring', x, y: y + r * 0.5, r: r * 1.9, color: 'rgba(150,135,110,0.6)', t: 0, dur: 0.4 });
      this.shake = Math.max(this.shake, 6);
    } else if (type === 'caster') {            // mage: arcane implosion + scattering wisps
      style = 'implode'; dur = 0.46;
      this.addEffect({ kind: 'ring', x, y, r: r * 2.2, color: '#9fd0ff', t: 0, dur: 0.4 });
      this._gib(x, y, '#7fd0ff', 10, 230, { dur: 0.55, size: 2 + Math.random() * 2, shape: 'wisp' });
      this._puff(x, y, '#5a8adf', 4, r * 0.3, { r1: r * 0.9, dur: 0.5 });
    } else if (type === 'bomber') {            // bomber: the blast does the talking; hurl blazing fire-bits
      style = 'poof'; dur = 0.24; tintCol = '#ffb060';
      this._gib(x, y, '#ff9a3a', 9, 260, { dur: 0.5, size: 2 + Math.random() * 3 });
      for (let i = 0; i < 6; i++) this._mote(x, y - r * 0.3, Math.random() < 0.5 ? '#ffd36b' : '#ff6a2a',
        { vx: (Math.random() - 0.5) * 160, vy: -(30 + Math.random() * 120), g: 220, r: 1.5 + Math.random() * 2, dur: 0.4 });
    } else {
      this._gib(x, y, '#cfd0da', 7, 180, { dur: 0.5 });
    }

    // elites die LOUD — an affix-coloured shockwave, a flash ring, a fan of
    // glowing motes + debris. You feel the threat extinguish.
    if (e.elite) {
      const col = (ELITE_AFFIXES[e.elite] && ELITE_AFFIXES[e.elite].color) || '#fff';
      this.addEffect({ kind: 'ring', x, y, r: r * 2.0, color: '#ffffff', t: 0, dur: 0.3 });
      this.addEffect({ kind: 'ring', x, y, r: r * 3.2, color: col, t: 0, dur: 0.55 });
      this._gib(x, y, col, 12, 300, { dur: 0.7, size: 2 + Math.random() * 3 });
      for (let i = 0; i < 14; i++) { const a = Math.random() * 6.28, s = 60 + Math.random() * 200;
        this._mote(x, y - r * 0.4, col, { vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, g: 160, drag: 0.97, r: 1.6 + Math.random() * 2, dur: 0.5 + Math.random() * 0.4 }); }
      this.shake = Math.max(this.shake, 6);
    }

    // the dissolving / animating corpse sprite
    this.effects.push({ kind: 'death', sprite: e.sprite, x, y, r, style, tintCol,
      faceLeft: e.faceLeft, boss: e.boss, t: 0, dur });

    // rising soul embers / wisps
    const n = e.boss ? 24 : 4;
    for (let i = 0; i < n; i++) {
      this.embers.push({ x: x + (Math.random() - 0.5) * r * 1.5,
        y: y - r * 0.5 + (Math.random() - 0.5) * r,
        vx: (Math.random() - 0.5) * 40, vy: -(40 + Math.random() * 70),
        r: 1 + Math.random() * 2, life: 0, dur: 0.5 + Math.random() * 0.7,
        hue: e.boss ? '#ff5a3a' : '#cfe0ff' });
    }

    // …and the floor keeps the mark. Deaths in standing water ripple instead.
    const pd = this._puddleAt ? this._puddleAt(x, y) : null;
    if (pd) {
      const rip = this.ripples || (this.ripples = []);
      for (let i = 0; i < 3 && rip.length < 26; i++) {
        rip.push({ x: x + (Math.random() - 0.5) * 8, y: y + 3 + (Math.random() - 0.5) * 5,
          t: -i * 0.08, dur: 0.9, max: 13 + i * 5, pd });
      }
    } else if (e.boss) this._stampDecal(x, y, 'rubble');
    else if (type === 'chaser') this._stampDecal(x, y, 'bones');
    else if (type === 'swarmer') this._stampDecal(x, y, 'stain', '#220a10');
    else if (type === 'tank') this._stampDecal(x, y, 'rubble');
    else if (type === 'caster') this._stampDecal(x, y, 'sigil', '#7fb8e0');
    else if (type === 'bomber') this._stampDecal(x, y, 'scorch');
    else this._stampDecal(x, y, 'stain');
  },


  _spawnEmberBurst() {
    for (let i = 0; i < 80; i++) {
      this.embers.push({ x: this.cam.x + Math.random() * this.vw,
        y: this.cam.y + this.vh * (0.5 + Math.random() * 0.6),
        vx: (Math.random() - 0.5) * 30, vy: -(30 + Math.random() * 70),
        r: 1 + Math.random() * 2.5, life: 0, dur: 2 + Math.random() * 3,
        hue: Math.random() < 0.5 ? '#ff8a3a' : '#e9c84a' });
    }
  },


  // Cinderstep: damage everything standing in the burning dash-trail.
  // (Hostile trails — laid by an Emberbrand husk — burn YOU instead.)
  _burnTrails(sdt) {
    for (const fx of this.effects) {
      if (fx.kind !== 'firetrail') continue;
      fx.dmgT = (fx.dmgT || 0) - sdt;
      if (fx.dmgT <= 0) {
        fx.dmgT = 0.22;
        if (fx.hostile) {
          const p = this.player;
          if (p && !p.dead && Math.hypot(p.x - fx.x, p.y - fx.y) < fx.r + p.r * 0.6) {
            if (p.takeHit(fx.hdmg, 'the cinders of what you were')) this.shake = Math.max(this.shake, 4);
          }
          continue;
        }
        const dmg = 9 * (1 + 0.5 * (this.level - 1) / 19) * this.player.mods.abilityDmgMult;
        for (const o of this.enemiesInRadius(fx.x, fx.y, fx.r)) this.hitEnemy(o, dmg, 0, 0, 'ability');
      }
    }
  },


  // Lay burning footprints along the dash as the knight travels (Cinderstep).
  _emitDashFire(p) {
    if (!p.dashing) { this._lastFireX = p.x; this._lastFireY = p.y; return; }
    const lx = this._lastFireX ?? p.x, ly = this._lastFireY ?? p.y;
    this._fireDist = (this._fireDist || 0) + Math.hypot(p.x - lx, p.y - ly);
    this._lastFireX = p.x; this._lastFireY = p.y;
    if (this._fireDist >= 8) {
      this._fireDist = 0;
      this.effects.push({ kind: 'firetrail', x: p.x, y: p.y + 2, r: 24, t: 0, dur: 1.15, dmgT: 0.05,
        seed: Math.random() * 6.28 });
    }
  },


  // glowing after-image trail while dashing (used in play AND the camp room)
  _dashTrail(p, sdt) {
    if (!p.dashing) return;
    this._dashGhostT = (this._dashGhostT || 0) - sdt;
    if (this._dashGhostT <= 0) {
      this._dashGhostT = 0.026;
      this.effects.push({ kind: 'ghost', sprite: p.sprite, frame: pickFrame(p, this.time),
        x: p.x, y: p.y, faceLeft: p.faceLeft, t: 0, dur: 0.3 });
    }
  },


  // Ambient particle breath for every elite on screen — each affix exhales its
  // own threat: fire-rain, frost-mist, blood-drip, sparks. Throttled by sdt so
  // it scales with framerate, not enemy count.
  _emitAuras(sdt) {
    const rate = (per) => Math.random() < per * sdt * 60;   // ~per particles/frame@60
    const p = this.player;
    // the blessed knight sheds slow rising motes of holy light
    if (p && this.furyReady && this.countdown <= 0 && rate(0.6)) {
      this._mote(p.x + (Math.random() - 0.5) * p.r * 1.6, p.y - 6 - Math.random() * 10,
        Math.random() < 0.5 ? '#ffe9a8' : '#ffd36b',
        { vx: (Math.random() - 0.5) * 10, vy: -(18 + Math.random() * 24), g: -10, r: 1.4 + Math.random() * 1.4, twinkle: 1, dur: 0.6 + Math.random() * 0.4 });
    }
    // footstep dust kicked up underfoot as the hero runs
    if (p && p.moving && (p.dashTimer || 0) <= 0 && this.countdown <= 0 && rate(0.4)) {
      this._puff(p.x + (Math.random() - 0.5) * 8, p.y, '#4a4350', 1, 0, { r0: 2, r1: 8, dur: 0.34 });
    }
    for (const e of this.enemies) {
      if (e.dead) continue;
      // heavy foes throw up dust with every stride
      if ((e.type === 'tank' || e.boss) && e.moving && rate(e.boss ? 0.5 : 0.3)) {
        this._puff(e.x + (Math.random() - 0.5) * e.r, e.y, '#4a4248', 1, 0, { r0: 3, r1: e.boss ? 16 : 10, dur: 0.45 });
      }
      if (e.boss) continue;
      const x = e.x, y = e.y - e.r * 0.4, r = e.r;
      if (e.type === 'bomber') {                 // a hissing, smoking fuse
        if (rate(0.5)) this._mote(x + (Math.random() - 0.5) * r, y - r * 0.8,
          Math.random() < 0.5 ? '#ffd36b' : '#ff7a2a', { vy: -(20 + Math.random() * 30), g: -40, r: 1.5 + Math.random(), dur: 0.4 });
        continue;
      }
      if (!e.elite) continue;
      switch (e.elite) {
        case 'explosive': {                      // smouldering — rains embers, glows hot
          if (rate(0.9)) this._mote(x + (Math.random() - 0.5) * r * 1.4, y + (Math.random() - 0.5) * r,
            Math.random() < 0.4 ? '#ffe08a' : (Math.random() < 0.6 ? '#ff7a2a' : '#e0401a'),
            { vx: (Math.random() - 0.5) * 20, vy: -(25 + Math.random() * 45), g: -30, r: 1.5 + Math.random() * 1.8, dur: 0.5 + Math.random() * 0.4 });
          break;
        }
        case 'icy': {                            // a slow, cold frost-mist + ice motes
          if (rate(0.7)) this._mote(x + (Math.random() - 0.5) * r * 1.8, y + (Math.random() - 0.5) * r * 1.2,
            Math.random() < 0.5 ? '#dffaff' : '#9fe0ff',
            { vx: (Math.random() - 0.5) * 12, vy: (Math.random() - 0.3) * 14, drag: 0.95, r: 1.2 + Math.random() * 1.6, twinkle: 1, dur: 0.8 + Math.random() * 0.6 });
          break;
        }
        case 'vampiric': {                       // weeps blood, pulses a dark heart
          if (rate(0.5)) this.effects.push({ kind: 'gib', x: x + (Math.random() - 0.5) * r * 1.2, y: y + Math.random() * r * 0.5,
            vx: (Math.random() - 0.5) * 16, vy: 10 + Math.random() * 30, g: 380, size: 1.5 + Math.random() * 1.5,
            rot: 0, vr: 0, color: Math.random() < 0.5 ? '#8a1518' : '#5a0c10', shape: 'rect', t: 0, dur: 0.5 + Math.random() * 0.3 });
          if (rate(0.5)) this._mote(x + (Math.random() - 0.5) * r * 2.4, y + (Math.random() - 0.5) * r * 2,
            '#d8413a', { vx: 0, vy: 0, r: 1.4 + Math.random(), dur: 0.4, twinkle: 1 });
          break;
        }
        case 'swift': {                          // crackling, electric — darting sparks
          if (rate(0.8)) { const a = Math.random() * 6.28, s = 40 + Math.random() * 90;
            this.effects.push({ kind: 'spark', x: x + (Math.random() - 0.5) * r, y: y + (Math.random() - 0.5) * r,
              vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, dur: 0.18 + Math.random() * 0.12, streak: true, col: '#bfffff' }); }
          break;
        }
        case 'husk': {                           // the unmade — cold ash rising off a hollow body
          if (rate(0.7)) this._mote(x + (Math.random() - 0.5) * r * 1.6, y + (Math.random() - 0.5) * r,
            Math.random() < 0.6 ? '#3a3346' : e.affix.color,
            { vx: (Math.random() - 0.5) * 10, vy: -(16 + Math.random() * 26), g: -14,
              r: 1.3 + Math.random() * 1.5, twinkle: 1, dur: 0.6 + Math.random() * 0.5 });
          break;
        }
        case 'armored': {                        // heavy — occasional grinding spark + dust
          if (rate(0.35)) { const a = Math.random() * 6.28, s = 30 + Math.random() * 60;
            this.effects.push({ kind: 'spark', x: x + Math.cos(a) * r, y: y + Math.sin(a) * r,
              vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, t: 0, dur: 0.25, col: '#fff0d0' }); }
          break;
        }
      }
    }
  },


  // Ambient/UI animation that runs regardless of pause/menus.
  _updateAmbient(dt) {
    this.titleT += dt;
    // the title corridor scrolls on its own — a slow, careful stroll into the dark
    if (this.state === 'title') this.tunnelScroll += dt * 34;
    if (this.introCut) {
      this.introCut.t += dt;
      // swap to Level 1 at the instant the iris is fully closed (under black)
      if (!this.introCut.fired && this.introCut.t >= this.introCut.dur * 0.42) {
        this.introCut.fired = true;
        this.start(this.heroId, false);   // no slash-wipe — the blink covers the cut
      }
      if (this.introCut.t >= this.introCut.dur) this.introCut = null;
    }
    if (this.interludeFade) {
      this.interludeFade.t += dt;
      if (this.interludeFade.t >= this.interludeFade.dur) this.interludeFade = null;
    }
    if (this.campToast) {
      this.campToast.t += dt;
      if (this.campToast.t >= this.campToast.dur) this.campToast = null;
    }
    if (this.namedToast) {
      this.namedToast.t += dt;
      if (this.namedToast.t >= this.namedToast.dur) this.namedToast = null;
    }
    // smoothed health bar (+ detect damage for the HP-bar punch)
    if (this.player) {
      const hp = Math.max(0, this.player.hp);
      if (this._hpWas != null && hp < this._hpWas - 0.01) {
        this.hpHitT = 0.32; Sound.play('hurt'); this._buzz(60);
        // pain breaks the rhythm: taking a hit ends the kill-streak
        if (this.state === 'playing' && this.combo > 0) { this.combo = 0; this.comboT = 0; this._comboTier = 0; }
      }
      this._hpWas = hp;
      this.hpDisplay += (hp - this.hpDisplay) * Math.min(1, dt * 14);
      if (this.hpGhost < this.hpDisplay) this.hpGhost = this.hpDisplay;
      else this.hpGhost += (this.hpDisplay - this.hpGhost) * Math.min(1, dt * 4);
    }
    // HUD juice timers
    if (this.hpHitT > 0) this.hpHitT -= dt;
    if (this.goldPop > 0) this.goldPop -= dt * 4;
    if (this.comboPop > 0) this.comboPop -= dt * 4;
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) { this.combo = 0; this._comboTier = 0; } }
    if (this.zoom > 0) this.zoom = Math.max(0, this.zoom - dt * 3.2);   // zoom-punch eases back out
    // floating embers (used for death fx, title & victory celebration) — spawned
    // in world space around the current view
    const want = (this.state === 'victory') ? 60 : 0;   // title now uses the corridor scene
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
    // plunge-into-darkness descent
    if (this.plunge) {
      const pl = this.plunge; pl.t += dt;
      if (pl.t < pl.half) {                       // falling: the world TEARS away upward
        const f = pl.t / pl.half;
        this.camDrop = 1500 * (f * f * 0.8 + f * 0.2);     // initial velocity so frame 1 already moves
        this.shake = Math.max(this.shake, 2.5 + 6 * f);    // it rattles the whole way down
      } else { this.camDrop = 0; }
      if (!pl.fired && pl.t >= pl.half) { pl.fired = true; if (pl.mid) pl.mid(); }
      if (pl.t >= pl.dur) { this.plunge = null; this.camDrop = 0; }
    }
    // intro card timer
    if (this.intro) {
      this.intro.t += dt;
      // a low, building rumble through the boss reveal
      if (this.intro.kind === 'boss' && this.intro.t < this.intro.dur * 0.82) {
        this.shake = Math.max(this.shake, 2.5 + 2.5 * (this.intro.t / this.intro.dur));
      }
      if (this.intro.t >= this.intro.dur) this.intro = null;
    }
    // "level cleared" sweep -> then the camp shop
    if (this.sweep) {
      this.sweep.t += dt;
      if (this.sweep.t >= this.sweep.dur) {
        this.sweep = null;
        this.pendingReward = null;
        // the Demon Lord speaks on odd floors, always after you cut down a
        // husk — and PERSONALLY when a camp choice provoked him (he remembers)
        const taunt = this._huskTauntDue
          ? 'YOU CUT DOWN WHAT YOU WERE.\nI CAN RAISE AS MANY OF YOU AS YOU LEAVE ME.'
          : (this._lordQueue && this._lordQueue.length ? this._lordQueue.shift()
          : DEMON_LINES[this.level]);
        this._huskTauntDue = false;
        if (taunt) this._beginInterlude(taunt);
        else this._slashWipe(() => this.openCamp());   // wipe into the camp room
      }
    }
  },


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
  },
};
