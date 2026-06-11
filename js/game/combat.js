// Combat: swings, hits, blade procs, ultimates, statuses, loot and pickups.
// Split from game.js — method bodies are verbatim; attached to Game.prototype in core.js.
import { RELICS, recompute, relicById } from '../abilities.js';
import { Sound } from '../audio.js';
import { CONFIG } from '../config.js';
import { inSwingArc } from '../monsters.js';
import { COMBO_TIERS } from './data.js';

export const combatMethods = {

  hitEnemy(e, dmg, kx = 0, ky = 0, source = 'ability') {
    const wasAlive = !e.dead;
    if (this.godMode) dmg = 999999;          // GOD MODE: one-shot everything
    else if (this.player && this.player.bladeUp.has('frost_vuln') && e.slowT > 0) dmg *= 1.25;   // Frostbite
    e.takeHit(dmg, kx, ky);
    this.spawnDamageNumber(e.x, e.y - e.r - 6, Math.round(dmg), source);
    if (source === 'sword') { this._relicOnHit(e, dmg); this._bladeOnHit(e, dmg); }   // sparks/feedback in _applySwingDamage
    if (e.boss && wasAlive) this.hitStop = Math.max(this.hitStop, 0.05); // weight on boss hits
    if (wasAlive && e.dead) this.onEnemyKilled(e, source);
  },


  // Relic procs that hang off the blade (only on direct sword hits).
  _relicOnHit(e, dmg) {
    const p = this.player;
    if (p.relics.has('frost')) e.applySlow(1.4);
    if (p.relics.has('thunder')) {
      const t = this.nearestEnemy(e.x, e.y, 150, new Set([e]));
      if (t) {
        this.addEffect({ kind: 'bolt', pts: [{ x: e.x, y: e.y }, { x: t.x, y: t.y }], t: 0, dur: 0.16 });
        this.hitEnemy(t, dmg * 0.5, 0, 0, 'storm');   // non-'sword' source won't re-proc
      }
    }
  },


  // ---------- The Living Blade ----------
  // Elemental particles flung along the swing arc — fire embers, ice shards, sparks.
  _bladeSwingFx(p) {
    const a = p.facingAngle, arc = p.arcDeg * Math.PI / 180, reach = p.reach, oy = p.y - 16;
    for (let i = 0; i < 11; i++) {
      const u = Math.random(), ang = a - arc / 2 + u * arc, r = reach * (0.45 + Math.random() * 0.55);
      const x = p.x + Math.cos(ang) * r, y = oy + Math.sin(ang) * r;
      const tang = ang + Math.PI / 2;          // fling tangent to the arc
      if (p.blade === 'ember') {
        this._mote(x, y, Math.random() < 0.5 ? '#ff7a2a' : '#ffd36b',
          { vx: Math.cos(ang) * 30, vy: Math.sin(ang) * 30 - 26, g: -36, r: 1.4 + Math.random() * 1.6, twinkle: 1, dur: 0.4 + Math.random() * 0.3 });
      } else if (p.blade === 'frost') {
        this.effects.push({ kind: 'spark', x, y, vx: Math.cos(tang) * (90 + Math.random() * 90) * (Math.random() < 0.5 ? 1 : -1),
          vy: Math.sin(tang) * (90 + Math.random() * 90), t: 0, dur: 0.34, col: Math.random() < 0.5 ? '#eaffff' : '#bfe9ff' });
      } else {
        this.effects.push({ kind: 'spark', x, y, vx: Math.cos(tang) * 170 * (Math.random() < 0.5 ? 1 : -1),
          vy: Math.sin(tang) * 170, t: 0, dur: 0.2, col: Math.random() < 0.5 ? '#cdbfff' : '#f0eaff', streak: true });
      }
    }
  },


  _bladeOnHit(e, dmg) {
    const p = this.player; if (!p || !p.blade) return;
    const up = p.bladeUp;
    if (p.blade === 'ember') {                          // EMBERBRAND — set ablaze
      if (e.dead) return;
      const mult = up.has('ember_hotter') ? 1.7 : 1;
      e.burnDmg = Math.max(e.burnDmg, dmg * 0.22 * mult);
      e.burnT = Math.max(e.burnT, 2.6);
      if (e.burnTickT <= 0) e.burnTickT = 0.5;
    } else if (p.blade === 'frost') {                   // FROSTFANG — chill / freeze / shatter
      if (e.boss) { e.applySlow(1.0); return; }          // bosses chill, never freeze
      if (e.frozenT > 0) return this._shatter(e, dmg);
      e.applySlow(1.4);
      const need = up.has('frost_quick') ? 2 : 3;
      e.frost = (e.frost || 0) + 1;
      if (e.frost >= need) { e.frost = 0; e.frozenT = 1.3;
        this.addEffect({ kind: 'ring', x: e.x, y: e.y, r: e.r + 6, color: '#bfe9ff', t: 0, dur: 0.3 }); }
    } else if (p.blade === 'storm') {                   // STORMEDGE — arc lightning
      const chains = up.has('storm_tempest') ? 4 : up.has('storm_fork') ? 2 : 1;
      let from = e; const hit = new Set([e]);
      for (let i = 0; i < chains; i++) {
        const t = this.nearestEnemy(from.x, from.y, 165, hit); if (!t) break; hit.add(t);
        this.addEffect({ kind: 'bolt', pts: [{ x: from.x, y: from.y }, { x: t.x, y: t.y }], t: 0, dur: 0.16 });
        let cd = dmg * 0.5; if (up.has('storm_crit') && Math.random() < 0.22) cd *= 3;
        if (up.has('storm_stun') && !t.boss) t.frozenT = Math.max(t.frozenT, 0.5);
        this.hitEnemy(t, cd, 0, 0, 'storm'); from = t;
      }
      if (up.has('storm_build')) { p.bladeCharge++; if (p.bladeCharge >= 12) { p.bladeCharge = 0; this._stormNova(); } }
    }
  },


  _shatter(e, dmg) {
    const p = this.player; e.frozenT = 0;
    const bonus = (p.bladeUp.has('frost_brittle') ? 2.4 : 1.3) * dmg + 24;
    this.addEffect({ kind: 'boom', x: e.x, y: e.y, r: e.r + 18, color: '#bfe9ff', t: 0, dur: 0.3 });
    this._gib(e.x, e.y - e.r * 0.5, '#cdeeff', 6, 120, { size: 2 });
    Sound.play('crit', { vol: 0.5 });
    this.hitEnemy(e, bonus, 0, 0, 'frost');
    if (p.bladeUp.has('frost_spread')) for (const o of this.enemiesInRadius(e.x, e.y, 72)) { if (o !== e && !o.boss) o.applySlow(1.4); }
    if (p.bladeUp.has('frost_chain')) for (const o of this.enemiesInRadius(e.x, e.y, 90)) {
      if (o !== e && o.frozenT > 0) { o.frozenT = 0; this.addEffect({ kind: 'boom', x: o.x, y: o.y, r: o.r + 12, color: '#bfe9ff', t: 0, dur: 0.25 }); this.hitEnemy(o, bonus * 0.7, 0, 0, 'frost'); }
    }
  },


  _stormNova() {
    const p = this.player, R = 120, dmg = 40 * p.mods.abilityDmgMult;
    this.addEffect({ kind: 'boom', x: p.x, y: p.y, r: R, color: '#b9a6ff', t: 0, dur: 0.34 });
    Sound.play('crit', { vol: 0.6 }); this.shake = Math.max(this.shake, 5);
    for (const o of this.enemiesInRadius(p.x, p.y, R)) { const a = Math.atan2(o.y - p.y, o.x - p.x); this.hitEnemy(o, dmg, Math.cos(a) * 120, Math.sin(a) * 120, 'storm'); }
  },


  // Burn damage-over-time + Permafrost aura, ticked each combat frame.
  _updateStatuses(sdt) {
    const p = this.player; if (!p) return;
    if (p.bladeUp.has('frost_aura')) for (const e of this.enemies) { if (!e.boss && Math.hypot(e.x - p.x, e.y - p.y) < 120) e.applySlow(0.4); }
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead || e.burnT <= 0) continue;
      e.burnT -= sdt; e.burnTickT -= sdt;
      if (e.burnTickT <= 0) {
        e.burnTickT = 0.5;
        let tick = e.burnDmg;
        if (p.bladeUp.has('ember_exec') && !e.boss && e.hp < e.maxHP * 0.4) tick = e.hp + 1;   // Immolation
        if (p.bladeUp.has('ember_soul')) p.fury = Math.min(p.furyMax, p.fury + 1.0);   // Kindled Fury
        this.hitEnemy(e, tick, 0, 0, 'burn');
      }
    }
  },


  onEnemyKilled(e, source) {
    const p = this.player;
    Sound.play(e.boss ? 'die_tank' : ('die_' + e.type) , { vol: e.elite ? 1.2 : 1 });
    // Fury charges slowly — the ultimate should be a rare payoff (~every few
    // levels). A hot streak feeds it faster (up to +50%).
    p.fury = Math.min(p.furyMax, p.fury + (e.boss ? 16 : 1.4) * p.mods.furyMult
      * (1 + Math.min(0.5, this.combo * 0.02)));
    if (source === 'sword' && p.mods.lifestealHeal > 0 && !p.mods.noHeal) {
      p.hp = Math.min(p.maxHP, p.hp + p.mods.lifestealHeal);
    }
    this.kills++;
    this.combo++; this.comboT = 2.6; this.comboPop = 1;     // feed the kill streak
    if (this.combo > (this.bestCombo || 0)) this.bestCombo = this.combo;
    // streak milestones: a stinger + banner as the slaughter escalates
    for (let i = COMBO_TIERS.length - 1; i >= 0; i--) {
      if (this.combo >= COMBO_TIERS[i].at && this._comboTier < i + 1) {
        this._comboTier = i + 1;
        this._lightSurgeT = 0.9;                        // the tier DETONATES light
        // teach the bargain exactly once, the first time it pays out
        if (i === 0 && !this._lightTaught) {
          this._lightTaught = true;
          let seen = false;
          try { seen = localStorage.getItem('kls_taught_light') === '1'; localStorage.setItem('kls_taught_light', '1'); } catch (e) { /* ignore */ }
          if (!seen) this.addEffect({ kind: 'banner', text: 'THE STREAK FEEDS THE LIGHT', t: 0, dur: 1.7 });
        }
        this.addEffect({ kind: 'banner', text: COMBO_TIERS[i].name + '!', t: 0, dur: 1.1 });
        Sound.play('combo', { tier: i + 1 });
        this.zoom = Math.max(this.zoom, 0.7);
        this.shake = Math.max(this.shake, 5);
        this._buzz(40);
        break;
      }
    }
    // a slain Revenant earns the Lord's next taunt (delivered after the floor)
    if (e.husk) this._huskTauntDue = true;
    // hit-pause on meaningful kills (skip trash so swarms stay fluid)
    if (e.boss) { this.hitStop = Math.max(this.hitStop, 0.14); this.zoom = Math.max(this.zoom, 1); this._buzz(90); }
    else if (e.type === 'tank' || e.elite) { this.hitStop = Math.max(this.hitStop, 0.06); this.zoom = Math.max(this.zoom, 0.55); this._buzz(25); }
    this._spawnDeathFx(e);
    this._dropLoot(e);
    // bombers + Explosive elites detonate when slain
    if (e.type === 'bomber' || e.elite === 'explosive') this._explodeEnemy(e);
    // Ember Crown: the slain erupt, scorching nearby foes (no chain-recursion)
    if (p.relics.has('ember') && !this._inEmber) {
      this._inEmber = true;
      const R = 64, dmg = 16 * p.mods.abilityDmgMult;
      for (const o of this.enemiesInRadius(e.x, e.y, R)) {
        if (o === e) continue;
        const a = Math.atan2(o.y - e.y, o.x - e.x);
        this.hitEnemy(o, dmg, Math.cos(a) * 80, Math.sin(a) * 80, 'burn');
      }
      this.addEffect({ kind: 'boom', x: e.x, y: e.y, r: R, t: 0, dur: 0.3 });
      this._inEmber = false;
    }
    // Emberbrand: foes slain while burning erupt / spread their fire
    if (e.burnT > 0 && p.blade === 'ember') {
      if (p.bladeUp.has('ember_pyre') && !this._inPyre) {
        this._inPyre = true;
        const R = 70, dmg = 22 * p.mods.abilityDmgMult;
        for (const o of this.enemiesInRadius(e.x, e.y, R)) { if (o === e) continue; const a = Math.atan2(o.y - e.y, o.x - e.x); this.hitEnemy(o, dmg, Math.cos(a) * 90, Math.sin(a) * 90, 'burn'); }
        this.addEffect({ kind: 'boom', x: e.x, y: e.y, r: R, t: 0, dur: 0.32 }); Sound.play('explode', { vol: 0.5 });
        this._inPyre = false;
      }
      if (p.bladeUp.has('ember_spread')) for (const o of this.enemiesInRadius(e.x, e.y, 64)) { if (o !== e && o.burnT <= 0) { o.burnT = 2.5; o.burnDmg = e.burnDmg * 0.7; o.burnTickT = 0.4; } }
    }
  },


  _dropLoot(e) {
    const drop = (type, value) => this.pickups.push({ type, value, x: e.x + (Math.random() - 0.5) * 14,
      y: e.y + (Math.random() - 0.5) * 14, vx: (Math.random() - 0.5) * 80, vy: -(40 + Math.random() * 60),
      t: 0, dead: false });
    // gold: most enemies drop a little; bosses/tanks/elites drop more. Odds are
    // deliberately low — there are a LOT of mobs, and you shouldn't afford the
    // whole catalogue in one run. Spend choices should hurt a little.
    const coins = e.boss ? 12 : (e.elite ? 4 : (e.type === 'tank' ? 3 : (Math.random() < 0.45 ? 1 : 0)));
    for (let i = 0; i < coins; i++) drop('gold', e.boss ? 5 : 1);
    // health: bosses always; otherwise scarce, so big waves don't flood you with heals
    if (e.boss || (e.elite && Math.random() < 0.4) || (e.type === 'tank' && Math.random() < 0.22) || Math.random() < 0.012) {
      drop('health', e.boss ? 30 : 14);
    }
    // named elites always yield a relic (or a pile of gold if you own them all)
    if (e.dropsRelic) {
      const id = this._pickDropRelic();
      if (id) this.pickups.push({ type: 'relic', relicId: id, x: e.x, y: e.y, vx: 0, vy: -34, t: 0, dead: false });
      else for (let i = 0; i < 12; i++) drop('gold', 4);
    }
  },


  _pickDropRelic() {
    const p = this.player, locked = p.lockedRelics || new Set();
    const pool = RELICS.filter((r) => !p.relics.has(r.id) && !locked.has(r.id));
    return pool.length ? pool[(Math.random() * pool.length) | 0].id : null;
  },


  // The Dark Knight's slam cracks the floor: jagged molten fissures radiate out
  // from the impact, glow hot for a few seconds, and burn anyone standing on
  // them. Paths are baked once at creation (no per-frame randomness).
  // `friendly` flips the allegiance: CATACLYSM's fissures burn the foes instead.
  spawnFissures(x, y, n, baseDmg, friendly = false) {
    const b = this.bounds;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.7;
      const len = 95 + Math.random() * 70;
      const joints = 4 + (Math.random() * 2 | 0);
      const pts = [{ x: x + Math.cos(a) * 18, y: y + Math.sin(a) * 18 }];
      for (let j = 1; j <= joints; j++) {
        const d = 18 + (len - 18) * (j / joints);
        const wob = (Math.random() - 0.5) * 26;
        const px = x + Math.cos(a) * d - Math.sin(a) * wob;
        const py = y + Math.sin(a) * d + Math.cos(a) * wob;
        pts.push({ x: Math.max(b.minX, Math.min(b.maxX, px)), y: Math.max(b.minY, Math.min(b.maxY, py)) });
      }
      this.addEffect({ kind: 'fissure', pts, w: 12, t: 0, dur: 6.5, warn: friendly ? 0.1 : 0.55, tick: 0,
        dmg: baseDmg * 0.55, friendly, seed: Math.random() * 6.28 });
    }
    Sound.play('explode', { vol: 0.55 });
  },


  // distance from a point to a polyline, within `r`?
  _nearPolyline(px, py, pts, r) {
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i].x, ay = pts[i].y, bx = pts[i + 1].x, by = pts[i + 1].y;
      const dx = bx - ax, dy = by - ay;
      const L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
      const cx = ax + dx * t, cy = ay + dy * t;
      if ((px - cx) * (px - cx) + (py - cy) * (py - cy) < r * r) return true;
    }
    return false;
  },


  // bomber / explosive-elite detonation
  _explodeEnemy(e) {
    const cfg = (e.spec && e.spec.explode) || (e.affix && e.affix.explode) || { r: 74, dmg: 24 };
    const lvlDmg = cfg.dmg * (1 + CONFIG.scaling.dmgPerLevel * (this.level - 1));
    this.addEffect({ kind: 'boom', x: e.x, y: e.y, r: cfg.r, t: 0, dur: 0.34 });
    Sound.play('explode');
    this.shake = Math.max(this.shake, 7);
    const p = this.player;
    if (Math.hypot(p.x - e.x, p.y - e.y) < cfg.r + p.r) { if (p.takeHit(lvlDmg, (this._foeName(e) || 'a bomber') + "'s blast")) this.shake = 9; }
    // also harms other enemies caught in the blast
    for (const o of this.enemiesInRadius(e.x, e.y, cfg.r)) {
      if (o === e) continue;
      const a = Math.atan2(o.y - e.y, o.x - e.x);
      this.hitEnemy(o, lvlDmg * 0.6, Math.cos(a) * 120, Math.sin(a) * 120, 'ability');
    }
  },


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
  },


  _collect(pk) {
    if (pk.type === 'gold') {
      const g = Math.ceil(pk.value * this.player.mods.goldMult * (1 + this.metaB.gold)); this.gold += g; this.totalGold += g;
      this.goldPop = 1;                              // the HUD coin tally pops
      this._mote(pk.x, pk.y, '#ffe08a', { vy: -30, r: 1.6, twinkle: 1, dur: 0.35 });
      Sound.play('gold');
    }
    else if (pk.type === 'health') {
      if (this.player.mods.noHeal) return;                 // Famine Crown: no healing
      this.player.hp = Math.min(this.player.maxHP, this.player.hp + pk.value);
      this.effects.push({ kind: 'dmg', x: this.player.x, y: this.player.y - 30, text: '+' + pk.value,
        vy: -42, color: '#5ec860', t: 0, dur: 0.7 });
    }
    else if (pk.type === 'relic') {
      const p = this.player;
      p.relics.add(pk.relicId); recompute(p);
      p.hp = Math.min(p.hp, p.maxHP);                      // a cursed relic may have shrunk max HP
      const r = relicById(pk.relicId);
      this.namedToast = { name: 'CLAIMED', sub: r ? r.name : 'a relic', color: '#ffd36b', t: 0, dur: 3.0 };
      Sound.play('relic');
      for (let i = 0; i < 14; i++) this._mote(pk.x, pk.y, Math.random() < 0.5 ? '#ffd36b' : '#fff3c0',
        { vx: (Math.random() - 0.5) * 90, vy: -(40 + Math.random() * 90), g: 60, r: 1.6 + Math.random() * 1.6, twinkle: 1, dur: 0.7 });
    }
  },


  // ---------- perfect dodge ----------
  // Dash THROUGH an attack and the world holds its breath: slow-mo, a cold shock
  // ring, a burst of Fury, and your dash comes back almost at once so the dance
  // can continue. One per dash (the window is consumed on trigger).
  _perfectDodge(x, y) {
    const p = this.player;
    p.parryT = 0;
    p.dashCD = Math.min(p.dashCD, p.dashCooldown0 * 0.25);
    p.fury = Math.min(p.furyMax, p.fury + 8 * p.mods.furyMult);
    this.slowmo = 0.4;
    this.hitStop = Math.max(this.hitStop, 0.045);
    this.shake = Math.max(this.shake, 5);
    this.zoom = Math.max(this.zoom, 0.9);
    this.addEffect({ kind: 'ring', x, y, r: 64, color: '#bfe9ff', t: 0, dur: 0.34 });
    this.addEffect({ kind: 'hitring', x, y, r: 34, t: 0, dur: 0.2 });
    this.effects.push({ kind: 'dmg', x: p.x, y: p.y - 44, text: 'PERFECT', vy: -36,
      color: '#9fe8ff', big: true, t: 0, dur: 0.7 });
    this._hitBurst(x, y, Math.atan2(y - (p.y - 16), x - p.x), 1.2);
    Sound.play('parry');
    this._buzz(45);
  },


  // ---------- dash ----------
  onDash(player) {
    this.shake = Math.max(this.shake, 2.5);
    Sound.play('dash');
    this._dashGhostT = 0;
    const a = Math.atan2(player.fy, player.fx);
    // a bright launch streak + a spray of sparks kicked out behind the heel
    this.effects.push({ kind: 'dashstreak', x: player.x, y: player.y - 16, a, t: 0, dur: 0.26 });
    for (let i = 0; i < 7; i++) {
      const sa = a + Math.PI + (Math.random() - 0.5) * 1.1, s = 70 + Math.random() * 120;
      this.effects.push({ kind: 'spark', x: player.x - Math.cos(a) * 8, y: player.y - 14 - Math.sin(a) * 8,
        vx: Math.cos(sa) * s, vy: Math.sin(sa) * s, t: 0, dur: 0.3, col: '#bfe9ff' });
    }
    // Cinderstep (keystone): drop the first ember where he launches; the rest is
    // laid down frame-by-frame in _emitDashFire so it trails off his boots.
    if (player.mods.dashFireTrail) { this._fireDist = 99; this._lastFireX = player.x; this._lastFireY = player.y; }
    // Ride the Lightning (Stormedge): the dash itself looses an arc
    if (player.blade === 'storm' && player.bladeUp.has('storm_dash')) {
      const t = this.nearestEnemy(player.x, player.y, 210);
      if (t) {
        this.addEffect({ kind: 'bolt', pts: [{ x: player.x, y: player.y - 14 }, { x: t.x, y: t.y }], t: 0, dur: 0.16 });
        this.hitEnemy(t, player.swordDamage * 0.9, 0, 0, 'ability');
        Sound.play('crit', { vol: 0.4 });
      }
    }
  },


  // ---------- swing ----------
  onSwing(player) {
    this.shake = Math.max(this.shake, 3.5);
    // the cut CARRIES him: a ~24px lunge along the swing so every strike
    // commits the body instead of planting the feet (decays in player.update)
    if (player.dashTimer <= 0) {
      player.lungeT = 0.12;
      player.lungeVx = Math.cos(player.facingAngle) * 230;
      player.lungeVy = Math.sin(player.facingAngle) * 230;
    }
    // each blade sounds like its element (fire roars, ice shings, storm rips)
    Sound.play(player.blade ? 'swing_' + player.blade : 'swing');
    const style = (player.hero && player.hero.swingStyle) || 'sweep';
    // visual lives LONGER than the hit window so the slash actually reads on
    // screen — and each element keeps its own time: storm SNAPS, fire rolls,
    // frost stands frozen a beat
    const dur = style === 'stab' ? 0.2
      : player.blade === 'storm' ? 0.22
      : player.blade === 'ember' ? 0.5
      : player.blade === 'frost' ? 0.55 : 0.32;
    // anchor at the torso, not the feet (sprites are feet-anchored) so the slash
    // radiates from the knight's body evenly in every facing direction
    this.effects.push({ kind: 'swing', t: 0, dur, style, blade: player.blade,
      x: player.x, y: player.y - 16, angle: player.facingAngle, seed: Math.random() * 6.28 });
    // each Living Blade throws its own elemental flourish off the cut
    if (player.blade) this._bladeSwingFx(player);
    // Trail of Cinders (Emberbrand evolution): the swing scorches the ground
    if (player.bladeUp && player.bladeUp.has('ember_trail')) {
      const a = player.facingAngle;
      for (let i = 0; i < 3; i++) {
        const d = 14 + i * 13;
        this.effects.push({ kind: 'firetrail', x: player.x + Math.cos(a) * d, y: player.y + Math.sin(a) * d + 2,
          r: 22, t: 0, dur: 1.0, dmgT: 0.05, seed: Math.random() * 6.28 });
      }
    }
  },


  // knockback resistance: bosses are immovable, tanks heavy, trash light
  _kbResist(e) { return e.boss ? 0.07 : (e.type === 'tank' ? 0.4 : 1); },


  _applySwingDamage() {
    const p = this.player;
    const struckBefore = p.hitThisSwing.size;
    if (p.swingTimer <= 0) return;
    const kbStrength = p.hero.knockback;
    const missing = 1 - p.hp / p.maxHP;
    const berserk = p.relics.has('berserk') ? 1 + 0.45 * missing : 1;
    for (const e of this.enemies) {
      if (p.hitThisSwing.has(e)) continue;
      if (inSwingArc(p, e)) {
        const [kx, ky] = [Math.cos(p.facingAngle), Math.sin(p.facingAngle)];
        // bosses are heavy — barely shoved (stops perma-knockback cheese)
        const kb = kbStrength * this._kbResist(e);
        let dmg = p.swordDamage * berserk;
        // a running kill-streak sharpens the blade (+1%/kill, capped at +30%)
        dmg *= 1 + Math.min(0.30, this.combo * 0.01);
        if (p.relics.has('exec') && e.hp < e.maxHP * 0.35) dmg *= 1.7;
        // Rogue: chance to crit
        let crit = false;
        if (p.hero.crit && Math.random() < p.hero.crit) { dmg *= p.hero.critMult; crit = true; }
        this.hitEnemy(e, dmg, kx * kb, ky * kb, crit ? 'ultimate' : 'sword');
        p.hitThisSwing.add(e);
        Sound.play(e.boss ? 'bosshit' : crit ? 'crit' : 'hit');
        // --- the "fuck yeah" impact: directional sparks, a flash ring, a slash
        // mark across the foe, crunchy hitstop + shake scaled to the blow ---
        const ix = e.x, iy = e.y - e.r * 0.35, power = crit ? 1.7 : 1;
        if (crit) this.zoom = Math.max(this.zoom, 0.45);   // crits punch the camera in
        this._hitBurst(ix, iy, p.facingAngle, power);
        this.addEffect({ kind: 'hitring', x: ix, y: iy, r: (e.boss ? 40 : 24) * power, t: 0, dur: 0.18 });
        this.addEffect({ kind: 'slash', x: ix, y: iy, angle: p.facingAngle + Math.PI / 2, len: e.r * 2.0 + 14, t: 0, dur: 0.14 });
        // the element answers every connect — fire pops, ice cracks, storm jolts
        if (p.blade === 'ember') {
          for (let i = 0; i < 4; i++) this._mote(ix + (Math.random() - 0.5) * 10, iy + (Math.random() - 0.5) * 8,
            Math.random() < 0.5 ? '#ffd36b' : '#ff7a2a',
            { vx: (Math.random() - 0.5) * 40, vy: -(30 + Math.random() * 50), g: -40, r: 1.4 + Math.random() * 1.6, twinkle: 1, dur: 0.4 + Math.random() * 0.3 });
          this.addEffect({ kind: 'ring', x: ix, y: iy, r: 18, color: '#ff7a2a', t: 0, dur: 0.22 });
          Sound.play('hit_ember', { vol: 0.7 });
        } else if (p.blade === 'frost') {
          this._gib(ix, iy, '#cdeeff', 4, 100, { size: 2 });
          for (let i = 0; i < 3; i++) {
            const aa = p.facingAngle + (Math.random() - 0.5) * 1.6, s = 120 + Math.random() * 120;
            this.effects.push({ kind: 'spark', x: ix, y: iy, vx: Math.cos(aa) * s, vy: Math.sin(aa) * s, t: 0, dur: 0.26, streak: true, col: '#dffaff' });
          }
          Sound.play('hit_frost', { vol: 0.6 });
        } else if (p.blade === 'storm') {
          const ja = Math.random() * 6.28;
          this.addEffect({ kind: 'bolt', pts: [{ x: ix, y: iy },
            { x: ix + Math.cos(ja) * 14, y: iy + Math.sin(ja) * 14 },
            { x: ix + Math.cos(ja + 0.5) * 24, y: iy + Math.sin(ja + 0.5) * 24 }], t: 0, dur: 0.12 });
          Sound.play('hit_storm', { vol: 0.55 });
        }
        this.hitStop = Math.max(this.hitStop, e.boss ? 0.08 : (e.type === 'tank' || e.elite) ? 0.06 : (crit ? 0.06 : 0.035));
        this.shake = Math.max(this.shake, e.boss ? 7 : (crit ? 7 : 4.5));
        // Paladin: crushing blows ripple out a shockwave
        if (p.hero.shockwave) {
          this.addEffect({ kind: 'ring', x: e.x, y: e.y, r: 48, color: '#e9c84a', t: 0, dur: 0.3 });
          for (const o of this.enemiesInRadius(e.x, e.y, 48)) {
            if (o === e || p.hitThisSwing.has(o)) continue;
            const a = Math.atan2(o.y - e.y, o.x - e.x);
            const sk = 200 * this._kbResist(o);
            this.hitEnemy(o, dmg * 0.32, Math.cos(a) * sk, Math.sin(a) * sk, 'ability');
            p.hitThisSwing.add(o);
          }
          this.hitStop = Math.max(this.hitStop, 0.04);
        }
      }
    }
    // a swing that bites THREE or more bodies lands as a CLEAVE — one heavy thud
    if (struckBefore < 3 && p.hitThisSwing.size >= 3) Sound.play('cleave', { vol: 0.9 });
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
  },


  _ultimate() {
    const p = this.player;
    Sound.play('ultimate');
    this.shake = Math.max(this.shake, 13);
    this.hitStop = Math.max(this.hitStop, 0.12);
    this.zoom = Math.max(this.zoom, 1);
    this._buzz(120);
    if (p.blade === 'ember') this._ultEruption();
    else if (p.blade === 'frost') this._ultAbsoluteZero();
    else if (p.blade === 'storm') this._ultThunderstorm();
    else this._ultNova();
  },


  _ultHit(e, dmg, kx = 0, ky = 0, slow = 0) {
    const wasAlive = !e.dead;
    e.takeHit(dmg, kx, ky);
    if (slow) e.applySlow(slow);
    this.spawnDamageNumber(e.x, e.y - e.r - 6, Math.round(dmg), 'ultimate');
    if (wasAlive && e.dead) this.onEnemyKilled(e, 'ultimate');
  },


  _ultNova() {                                            // fallback (no blade)
    const p = this.player, dmg = 120 * p.mods.abilityDmgMult;
    for (const e of this.enemies) { const a = Math.atan2(e.y - p.y, e.x - p.x); this._ultHit(e, dmg, Math.cos(a) * 420, Math.sin(a) * 420, 1.5); }
    this.addEffect({ kind: 'ult', x: p.x, y: p.y, t: 0, dur: 0.55, maxR: Math.hypot(this.vw, this.vh) });
    this.addEffect({ kind: 'banner', text: 'FURY UNLEASHED!', t: 0, dur: 1.1 });
    this.flashScreen = 0.22;
  },


  // 🔥 CATACLYSM — the fire ultimate in three acts:
  //   I.   A WALL OF FLAME rolls out from the knight across the entire arena,
  //        striking each foe as it reaches them — hurled, ignited, staggered
  //        hits that read as one travelling catastrophe.
  //   II.  The floor SPLITS: molten fissures radiate out — ours this time —
  //        burning anything that stands on them for seconds.
  //   III. The sky answers: pillars of flame rain on the survivors.
  //   ...and a lake of fire is left where he stood.
  _ultEruption() {
    const p = this.player, lvl = 1 + CONFIG.scaling.dmgPerLevel * (this.level - 1);
    const dmg = 130 * p.mods.abilityDmgMult * lvl;
    this.addEffect({ kind: 'banner', text: 'CATACLYSM', t: 0, dur: 1.3 });
    this.flashScreen = 0.32; this.flashCol = '#ffd9a0';
    Sound.play('explode'); Sound.play('bossroar', { vol: 0.35 });   // the deep rumble under it
    this.shake = Math.max(this.shake, 15);
    this.zoom = Math.max(this.zoom, 1.2);
    // ACT I — the travelling wave
    this.addEffect({ kind: 'firewave', x: p.x, y: p.y, t: 0, dur: 1.15, speed: 640, dmg, hit: new Set() });
    // ACT II — the floor splits (friendly fissures)
    this.spawnFissures(p.x, p.y, 6, dmg * 0.5, true);
    // ACT III — fire rains on whoever is left
    this.addEffect({ kind: 'firestorm', t: 0, dur: 2.3, strikeT: 0.35, dmg: dmg * 0.55 });
    // the lake of fire
    this.addEffect({ kind: 'erupt', x: p.x, y: p.y, t: 0, dur: 0.75, r: 170 });
    this.addEffect({ kind: 'lavafield', x: p.x, y: p.y, r: 150, t: 0, dur: 5.0, dmgT: 0.1, dmg: dmg * 0.2 });
    this._gib(p.x, p.y - 8, '#ff7a2a', 16, 240, { size: 3, g: 700 });
    this._gib(p.x, p.y - 8, '#3a1408', 8, 180, { size: 3, g: 800 });
  },


  // ❄️ ABSOLUTE ZERO — a freezing detonation that locks every foe on the floor
  // in solid ice (your strikes shatter them) and savages bosses.
  _ultAbsoluteZero() {
    const p = this.player, lvl = 1 + CONFIG.scaling.dmgPerLevel * (this.level - 1);
    const dmg = 95 * p.mods.abilityDmgMult * lvl;
    this.addEffect({ kind: 'banner', text: 'ABSOLUTE ZERO', t: 0, dur: 1.2 });
    this.flashScreen = 0.34; this.flashCol = '#dff2ff';
    Sound.play('crit', { vol: 0.7 });
    for (const e of this.enemies) {
      this._ultHit(e, dmg, 0, 0);
      if (e.dead) continue;
      if (e.boss) e.applySlow(3.5);
      else { e.frozenT = Math.max(e.frozenT, 4.2); e.frost = 0; }
      this.addEffect({ kind: 'ring', x: e.x, y: e.y, r: e.r + 8, color: '#bfe9ff', t: 0, dur: 0.45 });
      this._gib(e.x, e.y - e.r * 0.4, '#cdeeff', 4, 80, { size: 2 });
    }
    this.addEffect({ kind: 'frostnova', x: p.x, y: p.y, t: 0, dur: 0.95 });
  },


  // ⚡ THUNDERSTORM — the heavens open and bolts rain across the arena, chaining
  // between foes for a few seconds of relentless electrocution.
  _ultThunderstorm() {
    const p = this.player, lvl = 1 + CONFIG.scaling.dmgPerLevel * (this.level - 1);
    this.addEffect({ kind: 'banner', text: 'THUNDERSTORM', t: 0, dur: 1.2 });
    this.flashScreen = 0.28; this.flashCol = '#d9c8ff';
    Sound.play('crit', { vol: 0.7 });
    this.addEffect({ kind: 'thunderstorm', t: 0, dur: 2.7, strikeT: 0.05, dmg: 55 * p.mods.abilityDmgMult * lvl });
  },


  // lava-field damage ticks + thunderstorm strikes, run each combat frame
  _updateUltFx(sdt) {
    for (const fx of [...this.effects]) {
      if (fx.kind === 'lavafield') {
        fx.dmgT -= sdt;
        if (fx.dmgT <= 0) { fx.dmgT = 0.35; for (const e of this.enemiesInRadius(fx.x, fx.y, fx.r)) { this._ultHit(e, fx.dmg, 0, 0); if (!e.dead) { e.burnDmg = Math.max(e.burnDmg, fx.dmg * 0.5); e.burnT = Math.max(e.burnT, 1.4); } } }
      } else if (fx.kind === 'firewave') {
        // the travelling wall of flame: each foe is struck AS THE WAVE ARRIVES
        const r = fx.t * fx.speed;
        for (const e of this.enemies) {
          if (e.dead || fx.hit.has(e)) continue;
          const d = Math.hypot(e.x - fx.x, e.y - fx.y);
          if (d < r + 26 && d > r - 64) {
            fx.hit.add(e);
            const a = Math.atan2(e.y - fx.y, e.x - fx.x);
            this._ultHit(e, fx.dmg, Math.cos(a) * 480, Math.sin(a) * 480);
            if (!e.dead) { e.burnDmg = Math.max(e.burnDmg, fx.dmg * 0.12); e.burnT = Math.max(e.burnT, 4); e.burnTickT = Math.min(e.burnTickT || 9, 0.3); }
            this.addEffect({ kind: 'boom', x: e.x, y: e.y, r: e.r + 16, t: 0, dur: 0.3 });
            this.shake = Math.max(this.shake, 5);
          }
        }
      } else if (fx.kind === 'firestorm') {
        // fire rains on the survivors for a few seconds
        fx.strikeT -= sdt;
        if (fx.strikeT <= 0 && this.enemies.length) {
          fx.strikeT = 0.22;
          const e = this.enemies[(Math.random() * this.enemies.length) | 0];
          if (e && !e.dead) this.addEffect({ kind: 'firepillar', x: e.x + (Math.random() - 0.5) * 20,
            y: e.y + (Math.random() - 0.5) * 14, t: 0, dur: 0.62, warn: 0.26, dmg: fx.dmg, fired: false });
        }
      } else if (fx.kind === 'firepillar') {
        if (!fx.fired && fx.t >= fx.warn) {
          fx.fired = true;
          Sound.play('explode', { vol: 0.45 });
          this.shake = Math.max(this.shake, 6);
          for (const o of this.enemiesInRadius(fx.x, fx.y, 64)) {
            this._ultHit(o, fx.dmg, 0, 0);
            if (!o.dead) { o.burnDmg = Math.max(o.burnDmg, fx.dmg * 0.15); o.burnT = Math.max(o.burnT, 3); }
          }
        }
      } else if (fx.kind === 'thunderstorm') {
        fx.strikeT -= sdt;
        if (fx.strikeT <= 0 && this.enemies.length) {
          fx.strikeT = 0.1;
          const e = this.enemies[(Math.random() * this.enemies.length) | 0];
          if (e && !e.dead) {
            this.addEffect({ kind: 'megabolt', x: e.x, y: e.y, t: 0, dur: 0.22, seed: Math.random() * 99 });
            this._ultHit(e, fx.dmg, 0, 0); if (!e.boss) e.frozenT = Math.max(e.frozenT, 0.25);
            for (const o of this.enemiesInRadius(e.x, e.y, 95)) { if (o !== e && Math.random() < 0.6) { this.addEffect({ kind: 'bolt', pts: [{ x: e.x, y: e.y }, { x: o.x, y: o.y }], t: 0, dur: 0.14 }); this._ultHit(o, fx.dmg * 0.6, 0, 0); } }
            this.shake = Math.max(this.shake, 3.5);
            if (Math.random() < 0.3) { this.flashScreen = Math.max(this.flashScreen, 0.12); this.flashCol = '#d9c8ff'; }
          }
        }
      }
    }
  },


  spawnFireball(x, y, ang, lvl) {
    this.allyProjectiles.push({ x, y, vx: Math.cos(ang) * 360, vy: Math.sin(ang) * 360,
      r: 9, life: 1.6, lvl, dead: false });
  },


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
  },


  _updateAbilities(dt) {
    for (const ab of this.player.abilities) {
      ab.cd -= dt;
      if (ab.cd <= 0) {
        ab.def.cast(this, ab.level);
        ab.cd = ab.def.cooldown;
      }
    }
  },


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
  },


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
  },


  _updateProjAndFx(sdt) {
    for (const pr of this.projectiles) pr.update(sdt, this);
    this._updateAllyProjectiles(sdt);
    for (const fx of this.effects) {
      fx.t += sdt;
      if (fx.kind === 'spark') { fx.x += fx.vx * sdt; fx.y += fx.vy * sdt; fx.vx *= 0.9; fx.vy *= 0.9; }
      else if (fx.kind === 'dmg') { fx.y += fx.vy * sdt; fx.vy *= 0.9; }
      else if (fx.kind === 'gib') { fx.vy += (fx.g || 540) * sdt; fx.x += fx.vx * sdt; fx.y += fx.vy * sdt; fx.vx *= 0.985; fx.rot += fx.vr * sdt; }
      else if (fx.kind === 'puff') { fx.x += fx.vx * sdt; fx.y += fx.vy * sdt; fx.vx *= 0.92; fx.vy *= 0.92; }
      else if (fx.kind === 'mote') { fx.vy += (fx.g || 0) * sdt; fx.x += fx.vx * sdt; fx.y += fx.vy * sdt; const d = fx.drag || 1; fx.vx *= d; fx.vy *= d; }
      else if (fx.kind === 'fissure' && fx.t > fx.warn) {
        // molten ground: standing on the crack burns (after the warning crack appears)
        fx.tick -= sdt;
        if (fx.tick <= 0) {
          fx.tick = 0.4;
          if (fx.friendly) {
            // CATACLYSM's cracks are OURS: foes on them burn
            for (const e of this.enemies) {
              if (!e.dead && this._nearPolyline(e.x, e.y, fx.pts, fx.w + e.r * 0.7)) {
                this.hitEnemy(e, fx.dmg, 0, 0, 'ability');
                if (!e.dead) { e.burnDmg = Math.max(e.burnDmg, fx.dmg * 0.3); e.burnT = Math.max(e.burnT, 2); }
              }
            }
          } else {
            const p = this.player;
            if (p && !p.dead && this._nearPolyline(p.x, p.y, fx.pts, fx.w + p.r * 0.7)) {
              if (p.takeHit(fx.dmg, 'the molten earth')) this.shake = Math.max(this.shake, 4);
            }
          }
        }
      }
    }
    this.effects = this.effects.filter((f) => f.t < f.dur);
  },


  // A boss broke a phase threshold: roar, flash, embers, and a banner. The boss
  // is briefly untouchable (handled in its AI) and the player gets a grace window
  // so the chaos never lands a cheap hit.
  onBossPhase(boss, def) {
    this.shake = Math.max(this.shake, 16);
    this.flashScreen = Math.max(this.flashScreen, 0.4);
    this.hitStop = Math.max(this.hitStop, 0.12);
    Sound.play('bossroar');
    Sound.setScene('boss');
    this._spawnEmberBurst();
    this.addEffect({ kind: 'boom', x: boss.x, y: boss.y, r: boss.r * 3.0, t: 0, dur: 0.5 });
    this.addEffect({ kind: 'ring', x: boss.x, y: boss.y, r: boss.r * 2, color: def.emberAura ? '#ff3a1e' : '#ff7a2a', t: 0, dur: 0.5 });
    if (this.player) this.player.invuln = Math.max(this.player.invuln, 0.7);
    this.bossPhase = { title: def.title, t: 0, dur: 2.0 };
    // the escort that was lying in wait now floods the chamber
    if (this.pendingEscort) { this.spawnQueue = this.pendingEscort; this.pendingEscort = null; this.spawnTimer = 0.5; }
  },
};
