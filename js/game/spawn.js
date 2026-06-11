// Wave spawning: the floor queue, emerge telegraphs, elites, named foes, the Revenant.
// Split from game.js — method bodies are verbatim; attached to Game.prototype in core.js.
import { Sound } from '../audio.js';
import { bladeById } from '../blades.js';
import { CONFIG, ELITE_AFFIXES, LEVELS } from '../config.js';
import { Enemy } from '../monsters.js';
import { ordinal } from './data.js';

export const spawnMethods = {

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
  },


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
  },


  _spawn(dt) {
    if (!this.spawnQueue.length) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = CONFIG.spawn.interval;
    const n = Math.min(CONFIG.spawn.batch, this.spawnQueue.length);
    for (let i = 0; i < n; i++) {
      const type = this.spawnQueue.shift();
      const pos = this._spawnPos();   // bosses also stride in from off-screen
      const e = new Enemy(type, pos[0], pos[1], this.level);
      // queue-spawned revenants (the Bleeding court) are SHADES: dark-tinted so
      // a knight-sprite duelist can never be mistaken for the player
      if (type === 'revenant') e.shade = true;
      // empowered "elite" foe — forced by an event ambush, else rare & depth-scaled
      if (!e.boss) {
        if (this.forceElite > 0) { this.forceElite--; this._eliteify(e); }
        else if (this.level >= 3 && Math.random() < Math.min(0.16, 0.015 + this.level * 0.008)) this._eliteify(e);
      }
      this.enemies.push(e);
      // arrival telegraph: the mark burns FIRST and the foe rises out of it —
      // present and hittable, but unable to move or strike until it's fully
      // here. Spawns read as an incoming wave, not a materialization ambush.
      e.emergeDur = e.boss ? 0.9 : 0.55;
      e.emergeT = e.emergeDur;
      this.addEffect({ kind: 'spawnmark', x: e.x, y: e.y, r: e.r + 10, t: 0, dur: e.emergeDur + 0.1,
        color: e.elite ? (e.affix && e.affix.color) || '#ff7a2a' : (this.biome && this.biome.torch) || '#b06bff' });
      if (type === 'boss' || type === 'miniboss') break; // a boss is its own batch
    }
  },


  _eliteify(e) {
    const keys = Object.keys(ELITE_AFFIXES);
    const key = keys[(Math.random() * keys.length) | 0];
    e.applyElite(key, ELITE_AFFIXES[key]);
  },


  // The floor's named elite — a titled, relic-bearing herald that strides in
  // partway through the fight (or right before the floor would clear).
  _maybeSpawnNamed(sdt) {
    if (!this._namedDef) return;
    this._namedTimer -= sdt;
    if (this._namedTimer > 0) return;
    const def = this._namedDef; this._namedDef = null;
    const pos = this._spawnPos();
    const e = new Enemy(def.base, pos[0], pos[1], this.level);
    e.applyElite(def.affix, ELITE_AFFIXES[def.affix]);
    if (def.sprite) e.sprite = def.sprite;                   // its own brand-new creature sprite
    e.named = { name: def.name, color: def.color };
    e.maxHP = Math.round(e.maxHP * 1.7); e.hp = e.maxHP;     // a true mini-threat
    e.dropsRelic = true;
    this.enemies.push(e);
    // the STINGER: it rises slowly out of its mark while time dips and the
    // camera leans in — a named thing arriving is a sentence, not a footnote
    e.emergeDur = 0.85; e.emergeT = 0.85;
    this.zoom = Math.max(this.zoom, 0.8);
    this.slowmo = Math.max(this.slowmo || 0, 0.35);
    this.addEffect({ kind: 'spawnmark', x: e.x, y: e.y, r: e.r + 18, t: 0, dur: 0.95, color: def.color });
    this.shake = Math.max(this.shake, 7);
    Sound.play('bossroar', { vol: 0.55 });
    this.namedToast = { name: def.name.toUpperCase(), sub: 'bears a relic', color: def.color, t: 0, dur: 2.6 };
  },


  // The Revenant strides in: your previous run, wearing your hero's body and the
  // Living Blade it died with. Slay it and it yields a relic — what you were,
  // returned to you.
  _maybeSpawnHusk(sdt) {
    if (!this._huskDef) return;
    this._huskTimer -= sdt;
    if (this._huskTimer > 0) return;
    const def = this._huskDef; this._huskDef = null;
    const pos = this._spawnPos();
    const e = new Enemy('revenant', pos[0], pos[1], this.level);
    const hero = CONFIG.heroes[def.hero] || CONFIG.heroes.knight;
    e.sprite = hero.sprite;
    const bd = def.blade ? bladeById(def.blade) : null;
    const col = bd ? bd.color : '#9aa6c0';
    e.named = { name: `The ${ordinal(def.n)} Sacrifice`, color: col };
    e.husk = def.blade || 'none';
    e.elite = 'husk'; e.affix = { name: 'Husk', color: col };  // elite dressing: ground ring + orbit motes
    e.auraT = Math.random() * 6.28;
    e.dropsRelic = true;
    // a Stormedge husk keeps its arc — a slow bolt loosed on the move
    if (def.blade === 'storm') {
      e.spec = { ...e.spec, ranged: { range: 300, keep: 0, cooldown: 3.6, projSpeed: 215, projDmg: 11 } };
      e.fireCD = 2.4;
    }
    this.enemies.push(e);
    this.addEffect({ kind: 'spawnmark', x: e.x, y: e.y, r: e.r + 18, t: 0, dur: 0.9, color: col });
    this.shake = Math.max(this.shake, 8);
    Sound.play('bossroar', { vol: 0.5 });
    Sound.play('whisper', { vol: 1.4 });
    this.namedToast = { name: e.named.name.toUpperCase(), sub: 'what you were, raised against you', color: col, t: 0, dur: 3.2 };
  },
};
