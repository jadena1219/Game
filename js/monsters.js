// Enemy definitions, AI, projectiles, and the swing-arc hit test.
// Split from entities.js — bodies are verbatim.
import { CONFIG, ENEMY_TYPES } from './config.js';
import { TAU, angDiff } from './utils.js';


// Display names for the death screen's "Slain by …" line.
export const FOE_NAMES = {
  chaser: 'a Skeleton', swarmer: 'an Imp', tank: 'an Ogre', caster: 'a Dark Mage',
  bomber: 'a Bomber', miniboss: 'the Dark Knight', boss: 'the Demon Lord',
  revenant: 'your former self',
};


export class Projectile {
  constructor(x, y, vx, vy, dmg, fromBoss, srcName = null) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.dmg = dmg; this.r = fromBoss ? 9 : 7;
    this.life = 4;
    this.dead = false;
    this.boss = fromBoss;
    this.srcName = srcName;            // who fired it (for the death summary)
  }
  update(dt, game) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.life -= dt;
    const b = game.bounds;
    if (this.life <= 0 || this.x < b.minX - 40 || this.x > b.maxX + 40 ||
        this.y < b.minY - 40 || this.y > b.maxY + 40) this.dead = true;
  }
}


export class Enemy {
  constructor(typeName, x, y, level) {
    const base = ENEMY_TYPES[typeName];
    this.type = typeName;
    this.spec = base;
    this.sprite = base.sprite;
    this.boss = !!base.boss;

    const s = CONFIG.scaling;
    const k = level - 1;
    this.maxHP = Math.round(base.hp * (1 + s.hpPerLevel * k));
    this.hp = this.maxHP;
    this.speed = base.speed * (1 + s.speedPerLevel * k);
    this.damage = base.damage * (1 + s.dmgPerLevel * k);
    this.r = base.radius;

    this.x = x; this.y = y;
    this.faceLeft = false;
    this.moving = true;
    this.attackAnim = 0;
    this.flash = 0;
    this.kbx = 0; this.kby = 0;        // knockback velocity
    this.dead = false;
    // Each foe approaches at its own slight angle (swarmers fan widest), so a
    // pack curves out and ENVELOPS you instead of arriving as a single-file queue.
    this.flank = this.boss ? 0 :
      (Math.random() - 0.5) * (typeName === 'swarmer' || typeName === 'bomber' ? 1.5 : 0.9);

    // AI timers
    this.fireCD = base.ranged ? Math.random() * 1.2 + 0.6 : 0;
    this.chargeCD = base.charge ? base.charge.cooldown * (0.5 + Math.random() * 0.5) : 0;
    this.specialCD = base.specials ? base.specials.interval * (0.6 + Math.random() * 0.4) : 0;
    this.state = 'walk';               // walk | windup | charging | special | enrage
    this.stateT = 0;
    this.cdmg = this.damage;           // current contact damage (boosted while charging)
    this.slowT = 0;                    // >0 while chilled (frost)
    this.burnT = 0; this.burnDmg = 0; this.burnTickT = 0;   // Emberbrand burn
    this.frost = 0; this.frozenT = 0;                       // Frostfang chill stacks / frozen-or-stunned
    this.elite = null; this.affix = null; this.armor = 0;
    this.emergeT = 0;                  // >0 while rising out of the spawn telegraph
    this.emergeDur = 0;                // full telegraph length (render ramps off this)
    this.ravenous = false;             // last stragglers turn ravenous (no hide-and-seek)

    // ---- boss phase escalation ----
    this.phaseDefs = base.phases || null;
    this.phase = 0;                    // 0 = base; each entry in phaseDefs is a transition
    this.baseSpeed = this.speed;
    this.invuln = false;               // true during a phase-shift (untouchable telegraph)
    this.canCharge = !!base.charge && !base.chargeGated;
    this.cdMul = 1; this.novaBonus = 0; this.summonBonus = 0;
    this.tripleCharge = false; this.shockwave = 0; this.spiral = false;
    this.doubleRing = false; this.emberAura = false;
    this.chargesLeft = 0; this.spiralA = 0;
  }

  // Empower a regular enemy with an elite affix.
  applyElite(key, def) {
    this.elite = key; this.affix = def;
    this.maxHP = Math.round(this.maxHP * (def.hp || 2.4)); this.hp = this.maxHP;
    this.damage *= 1.5; this.cdmg = this.damage;       // elites hit noticeably harder
    this.r = Math.round(this.r * 1.24);                 // and loom larger
    this.auraT = Math.random() * 6.28;                  // phase for orbiting aura motes
    if (def.speed) this.speed *= def.speed;
    if (def.armor) this.armor = def.armor;
  }

  takeHit(dmg, kx, ky) {
    if (this.invuln) { this.flash = 0.1; return; }   // mid phase-shift: blade glances off
    this.hp -= dmg * (1 - this.armor);
    this.flash = 0.12;
    this.kbx += kx; this.kby += ky;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
  }

  applySlow(dur) { this.slowT = Math.max(this.slowT, dur); }

  update(dt, game) {
    if (this.flash > 0) this.flash -= dt;
    if (this.attackAnim > 0) this.attackAnim -= dt;
    if (this.slowT > 0) this.slowT -= dt;
    const p = game.player;
    let dx = p.x - this.x, dy = p.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    const [nx, ny] = [dx / dist, dy / dist];
    this.faceLeft = nx < 0;

    // apply + decay knockback
    this.x += this.kbx * dt; this.y += this.kby * dt;
    this.kbx *= 0.86; this.kby *= 0.86;

    // still EMERGING from the dark (spawn telegraph): visible, hittable, but
    // it cannot move or strike until the dark finishes giving it up
    if (this.emergeT > 0) { this.emergeT -= dt; this.moving = false; this.attackAnim = 0; return this._finish(game); }

    // frozen solid / stunned — cannot act
    if (this.frozenT > 0) { this.frozenT -= dt; this.moving = false; this.attackAnim = 0; return this._finish(game); }

    const ranged = this.spec.ranged;
    const charge = this.spec.charge;
    const specials = this.spec.specials;

    // vampiric elites slowly knit themselves back together
    if (this.affix && this.affix.regen) this.hp = Math.min(this.maxHP, this.hp + this.maxHP * this.affix.regen * dt);

    // ---- boss phase shift: a brief, untouchable enrage when HP crosses a threshold ----
    if (this.state === 'enrage') {
      this.stateT -= dt; this.moving = false; this.attackAnim = 0.3;
      if (this.stateT <= 0) { this.state = 'walk'; this.invuln = false; }
      return this._finish(game);
    }
    if (this.phaseDefs && this.phase < this.phaseDefs.length &&
        this.hp / this.maxHP <= this.phaseDefs[this.phase].at) {
      this._enterPhase(this.phaseDefs[this.phase], game);
      return this._finish(game);
    }

    // ---- boss special attacks: telegraphed SLAM / SUMMON ----
    if (specials) {
      if (this.state === 'special') {
        this.stateT -= dt; this.moving = false; this.attackAnim = 0.2;
        if (this.stateT <= 0) { this._doSpecial(game); this.state = 'walk'; }
        return this._finish(game);
      }
      this.specialCD -= dt;
      if (this.specialCD <= 0 && this.state === 'walk' && dist < 560) {
        this.pendingSpecial = specials.slamOnly ? 'slam' : (Math.random() < 0.5 ? 'slam' : 'summon');
        this.slamR = specials.slam.r;
        this.state = 'special'; this.stateT = 0.95; this.specMax = 0.95;
        this.specialCD = specials.interval * this.cdMul;
        return this._finish(game);
      }
    }

    // ---- charge attack (miniboss always; boss only once a phase unlocks it) ----
    if (charge && this.canCharge) {
      this.chargeCD -= dt;
      if (this.state === 'windup') {
        this.stateT -= dt;
        this.moving = false;
        this.attackAnim = 0.2;
        if (this.stateT <= 0) {
          this.state = 'charging';
          this.stateT = charge.dur;
          this.cdx = nx; this.cdy = ny;          // lock direction
          this.cdmg = this.damage * 1.6;
        }
        return this._finish(game);
      }
      if (this.state === 'charging') {
        this.stateT -= dt;
        this.x += this.cdx * charge.speed * dt;
        this.y += this.cdy * charge.speed * dt;
        this.moving = true;
        if (this.stateT <= 0) {
          this.cdmg = this.damage;
          if (this.shockwave) this._shockwave(game);              // erupt a ring of slow bolts
          if (this.chargesLeft > 0) {                             // triple-charge: re-aim and go again
            this.chargesLeft--;
            this.state = 'windup'; this.stateT = charge.windup * 0.45;
          } else {
            this.state = 'walk'; this.chargeCD = charge.cooldown * this.cdMul;
          }
        }
        return this._finish(game);
      }
      if (this.chargeCD <= 0 && dist < 380) {
        this.state = 'windup'; this.stateT = charge.windup;
        if (this.tripleCharge) this.chargesLeft = 2;              // this charge + two more
        return this._finish(game);
      }
    }

    // ---- ranged caster / boss nova ----
    if (ranged) {
      this.fireCD -= dt;
      if (this.fireCD <= 0 && dist < ranged.range) {
        this._fire(game, nx, ny, ranged);
        this.fireCD = ranged.cooldown * this.cdMul;
        this.attackAnim = 0.25;
      }
      // kiting behaviour for non-boss casters (the husk doesn't kite — it fires
      // its stolen blade-arc on the move and keeps coming for you)
      if (!this.boss && !this.husk) {
        if (dist > ranged.range) { this._step(nx, ny, dt); this.moving = true; }
        else if (dist < ranged.keep) { this._step(-nx, -ny, dt * 0.9); this.moving = true; }
        else this.moving = false;
        return this._finish(game);
      }
      // Boss spacing: hold casting range. Too close → back away; if the retreat
      // would back him into a wall, sidestep along the wall tangent instead —
      // he can never be pinned in a corner and face-tanked.
      if (ranged.keep > 0) {
        if (dist < ranged.keep) {
          let rx = -nx, ry = -ny;
          const b = game.bounds, m = 70;
          const px2 = this.x + rx * 60, py2 = this.y + ry * 60;
          if (px2 < b.minX + m || px2 > b.maxX - m || py2 < b.minY + m || py2 > b.maxY - m) {
            const c1x = this.x - ny * 60, c1y = this.y + nx * 60;   // tangent, two ways
            const ok1 = c1x > b.minX + m && c1x < b.maxX - m && c1y > b.minY + m && c1y < b.maxY - m;
            if (ok1) { rx = -ny; ry = nx; } else { rx = ny; ry = -nx; }
          }
          this._step(rx * 0.6, ry * 0.6, dt);
          this.moving = true;
        } else if (dist > ranged.keep * 1.7) { this._step(nx, ny, dt); this.moving = true; }
        else this.moving = false;
        return this._finish(game);
      }
    }

    // ---- default melee approach (curved by this foe's flank bias while distant) ----
    let mx = nx, my = ny;
    if (this.flank) {
      const f = this.flank * Math.min(1, Math.max(0, (dist - 70) / 260));
      const cs = Math.cos(f), sn = Math.sin(f);
      mx = nx * cs - ny * sn; my = nx * sn + ny * cs;
    }
    this._step(mx, my, dt);
    this.moving = true;
    return this._finish(game);
  }

  _doSpecial(game) {
    const sp = this.spec.specials;
    if (this.pendingSpecial === 'slam') {
      const p = game.player, R = sp.slam.r;
      game.addEffect({ kind: 'boom', x: this.x, y: this.y, r: R, t: 0, dur: 0.4 });
      game.shake = Math.max(game.shake, 11);
      if (Math.hypot(p.x - this.x, p.y - this.y) < R + p.r) { if (p.takeHit(this.damage * sp.slam.dmg, (FOE_NAMES[this.type] || 'the dark') + "'s slam")) game.shake = 13; }
      // the Dark Knight's slam cracks the floor into molten fissures
      if (sp.slam.fissures && game.spawnFissures) game.spawnFissures(this.x, this.y, sp.slam.fissures, this.damage);
    } else {
      const s = sp.summon, count = s.count + this.summonBonus;
      for (let i = 0; i < count; i++) {
        const a = Math.random() * TAU;
        game.enemies.push(new Enemy(s.type, this.x + Math.cos(a) * 64, this.y + Math.sin(a) * 64, game.level));
      }
      game.addEffect({ kind: 'ring', x: this.x, y: this.y, r: 74, color: '#b06bff', t: 0, dur: 0.45 });
    }
  }

  // Enter the next boss phase: enrage (briefly untouchable), then come out faster
  // and with new tricks unlocked.
  _enterPhase(def, game) {
    this.phase++;
    this.state = 'enrage'; this.stateT = 1.0; this.invuln = true; this.moving = false;
    if (def.speed) this.speed = this.baseSpeed * def.speed;
    if (def.cd) this.cdMul = def.cd;
    this.novaBonus += def.novaBonus || 0;
    this.summonBonus += def.summonBonus || 0;
    this.tripleCharge = this.tripleCharge || !!def.tripleCharge;
    if (def.shockwave) this.shockwave = def.shockwave;
    this.spiral = this.spiral || !!def.spiral;
    this.doubleRing = this.doubleRing || !!def.doubleRing;
    this.emberAura = this.emberAura || !!def.emberAura;
    if (def.enableCharge) this.canCharge = true;
    // shorten the next attack so the new phase comes out swinging
    this.chargeCD = Math.min(this.chargeCD, 0.7);
    this.specialCD = Math.min(this.specialCD, 1.0);
    this.fireCD = Math.min(this.fireCD, 0.9);
    if (game.onBossPhase) game.onBossPhase(this, def);
  }

  // A radial burst of slow bolts — the aftershock of a WRATH charge.
  _shockwave(game) {
    const n = this.shockwave, sp = 150;
    const dmg = this.damage * 0.6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.random() * 0.12;
      game.projectiles.push(new Projectile(
        this.x + Math.cos(a) * (this.r + 6), this.y + Math.sin(a) * (this.r + 6),
        Math.cos(a) * sp, Math.sin(a) * sp, dmg, true));
    }
    game.addEffect({ kind: 'ring', x: this.x, y: this.y, r: this.r + 26, color: '#ff5a2a', t: 0, dur: 0.4 });
    game.shake = Math.max(game.shake, 8);
  }

  _step(nx, ny, dt) {
    const spd = this.speed * (this.slowT > 0 ? 0.5 : 1);
    this.x += nx * spd * dt; this.y += ny * spd * dt;
  }

  _finish(game) {
    const b = game.bounds;
    this.x = Math.max(b.minX - 30, Math.min(b.maxX + 30, this.x));
    this.y = Math.max(b.minY - 30, Math.min(b.maxY + 30, this.y));
  }

  _fire(game, nx, ny, ranged) {
    const dmg = ranged.projDmg * (1 + CONFIG.scaling.dmgPerLevel * (game.level - 1));
    const who = (this.named && this.named.name) || FOE_NAMES[this.type] || 'the dark';
    const make = (ax, ay, sm = 1) => {
      game.projectiles.push(new Projectile(
        this.x + ax * (this.r + 6), this.y + ay * (this.r + 6),
        ax * ranged.projSpeed * sm, ay * ranged.projSpeed * sm, dmg, this.boss, who));
    };
    if (ranged.nova) {
      const n = ranged.nova + this.novaBonus;
      this.spiralA += 0.4;                                  // each volley rotates (spiral)
      const off = this.spiral ? this.spiralA : 0;
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU + off; make(Math.cos(a), Math.sin(a)); }
      if (this.doubleRing) {                                // a second, faster ring threaded between
        for (let i = 0; i < n; i++) { const a = (i / n) * TAU + off + Math.PI / n; make(Math.cos(a), Math.sin(a), 1.4); }
      }
    } else {
      make(nx, ny);
    }
  }
}


// Test whether an enemy is inside the player's swing cone this frame.
export function inSwingArc(player, enemy) {
  const dx = enemy.x - player.x, dy = enemy.y - player.y;
  const dist = Math.hypot(dx, dy);
  if (dist > player.reach + enemy.r) return false;
  const a = Math.atan2(dy, dx);
  const half = (player.arcDeg * Math.PI / 180) / 2;
  return Math.abs(angDiff(a, player.facingAngle)) <= half;
}
