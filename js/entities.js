// Player + enemy + projectile entities.
import { CONFIG, ENEMY_TYPES } from './config.js';
import { BASE_MODS } from './abilities.js';

const TAU = Math.PI * 2;
function norm(x, y) { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; }
function angDiff(a, b) { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }

export class Player {
  constructor(x, y, heroId = 'knight', metaB = null) {
    this.x = x; this.y = y;
    this.heroId = heroId;
    this.hero = CONFIG.heroes[heroId] || CONFIG.heroes.knight;
    this.sprite = this.hero.sprite;
    this.metaB = metaB || { hp: 0, dmg: 0, spd: 0, gold: 0 };
    this.mods = BASE_MODS();
    this.hp = this.maxHP;
    this.r = CONFIG.player.radius;
    this.fx = 1; this.fy = 0;          // facing unit vector (last moved dir)
    this.faceLeft = false;
    this.moving = false;
    this.attackAnim = 0;
    this.swingCD = 0;
    this.swingTimer = 0;               // >0 while blade can connect
    this.swingProgress = 0;            // 0..1 for the visual arc sweep
    this.invuln = 0;
    this.hitThisSwing = new Set();
    this.flash = 0;
    this.dead = false;
    // dash state
    this.dashTimer = 0;                // >0 while dashing
    this.dashCD = 0;
    this.dashDirX = 1; this.dashDirY = 0;
    // progression
    this.forge = {};                   // forge id -> level
    this.relics = new Set();           // owned relic ids
    this.abilities = [];               // (kept empty: the knight is the core)
    this.fury = 0; this.furyMax = 100;
    this.slowT = 0;                    // >0 while chilled by a Frostbound elite
  }

  get facingAngle() { return Math.atan2(this.fy, this.fx); }
  get dashing() { return this.dashTimer > 0; }
  get maxHP() { return this.hero.maxHP + (this.mods ? this.mods.bonusHP : 0) + this.metaB.hp; }
  // effective stats after upgrades (per-hero base + meta-progression)
  get moveSpeed() { return this.hero.speed * this.mods.moveSpeedMult * (1 + this.metaB.spd) * (this.slowT > 0 ? 0.55 : 1); }
  get swordDamage() { return this.hero.swordDamage * this.mods.swordDamageMult * (1 + this.metaB.dmg); }
  get reach() { return this.hero.swordReach * this.mods.reachMult; }
  get arcDeg() { return this.hero.swordArcDeg + this.mods.arcBonusDeg; }
  get swingCooldown0() { return this.hero.swingCooldown * this.mods.swingCooldownMult; }
  get dashCooldown0() { return this.hero.dashCooldown * this.mods.dashCooldownMult; }

  startSwing() {
    this.swingTimer = this.hero.swingActive;
    this.swingCD = this.swingCooldown0;
    this.attackAnim = this.hero.swingActive + 0.08;
    this.swingProgress = 0;
    this.hitThisSwing.clear();
    this._swinging = true;
  }

  startDash(mv, mlen, game) {
    const h = this.hero;
    let dx, dy;
    if (mlen > 0.1) { dx = mv.x / mlen; dy = mv.y / mlen; }
    else { dx = this.fx; dy = this.fy; }       // dash forward if not steering
    this.dashDirX = dx; this.dashDirY = dy;
    this.fx = dx; this.fy = dy; this.faceLeft = dx < 0;
    this.dashTimer = h.dashDur;
    this.dashCD = this.dashCooldown0;
    this.invuln = Math.max(this.invuln, h.dashDur + h.dashInvuln + this.mods.dashInvulnBonus);
    game.onDash(this);
  }

  update(dt, input, game) {
    const p = CONFIG.player;
    const mv = input.move;
    const mlen = Math.hypot(mv.x, mv.y);

    if (this.dashCD > 0) this.dashCD -= dt;

    // trigger a dash (double-tap move side / Shift). Consume the request.
    if (input.dashQueued) {
      input.dashQueued = false;
      if (this.dashTimer <= 0 && this.dashCD <= 0) this.startDash(mv, mlen, game);
    }

    if (this.dashTimer > 0) {
      // dashing: locked-direction burst, ignores steering
      this.dashTimer -= dt;
      this.x += this.dashDirX * this.hero.dashSpeed * dt;
      this.y += this.dashDirY * this.hero.dashSpeed * dt;
      this.moving = true;
    } else {
      this.moving = mlen > 0.08;
      if (this.moving) {
        const spd = this.moveSpeed;
        this.x += (mv.x / (mlen || 1)) * spd * Math.min(1, mlen) * dt;
        this.y += (mv.y / (mlen || 1)) * spd * Math.min(1, mlen) * dt;
        this.fx = mv.x / (mlen || 1);
        this.fy = mv.y / (mlen || 1);
        this.faceLeft = this.fx < 0;
      }
    }
    // clamp to arena
    this.x = Math.max(game.bounds.minX, Math.min(game.bounds.maxX, this.x));
    this.y = Math.max(game.bounds.minY, Math.min(game.bounds.maxY, this.y));

    // timers
    if (this.swingCD > 0) this.swingCD -= dt;
    if (this.attackAnim > 0) this.attackAnim -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.slowT > 0) this.slowT -= dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.swingTimer > 0) {
      this.swingTimer -= dt;
      this.swingProgress = 1 - Math.max(0, this.swingTimer) / this.hero.swingActive;
    } else {
      this._swinging = false;
    }

    // begin a swing (not while mid-dash)
    if (input.swingHeld && this.swingCD <= 0 && this.dashTimer <= 0) {
      this.startSwing();
      game.onSwing(this);
    }
  }

  takeHit(dmg) {
    if (this.invuln > 0 || this.dead) return false;
    const dr = Math.min(0.85, this.mods.damageReduction + (this.hero.damageReduction || 0));
    this.hp -= dmg * (1 - dr);
    this.invuln = CONFIG.player.invuln;
    this.flash = 0.25;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
    return true;
  }
}

export class Projectile {
  constructor(x, y, vx, vy, dmg, fromBoss) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.dmg = dmg; this.r = fromBoss ? 9 : 7;
    this.life = 4;
    this.dead = false;
    this.boss = fromBoss;
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

    // AI timers
    this.fireCD = base.ranged ? Math.random() * 1.2 + 0.6 : 0;
    this.chargeCD = base.charge ? base.charge.cooldown * (0.5 + Math.random() * 0.5) : 0;
    this.specialCD = base.specials ? base.specials.interval * (0.6 + Math.random() * 0.4) : 0;
    this.state = 'walk';               // walk | windup | charging | special
    this.stateT = 0;
    this.cdmg = this.damage;           // current contact damage (boosted while charging)
    this.slowT = 0;                    // >0 while chilled (frost)
    this.elite = null; this.affix = null; this.armor = 0;
  }

  // Empower a regular enemy with an elite affix.
  applyElite(key, def) {
    this.elite = key; this.affix = def;
    this.maxHP = Math.round(this.maxHP * (def.hp || 2.2)); this.hp = this.maxHP;
    this.damage *= 1.25; this.cdmg = this.damage;
    this.r = Math.round(this.r * 1.16);
    if (def.speed) this.speed *= def.speed;
    if (def.armor) this.armor = def.armor;
  }

  takeHit(dmg, kx, ky) {
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

    const ranged = this.spec.ranged;
    const charge = this.spec.charge;
    const specials = this.spec.specials;

    // vampiric elites slowly knit themselves back together
    if (this.affix && this.affix.regen) this.hp = Math.min(this.maxHP, this.hp + this.maxHP * this.affix.regen * dt);

    // ---- boss special attacks: telegraphed SLAM / SUMMON ----
    if (specials) {
      if (this.state === 'special') {
        this.stateT -= dt; this.moving = false; this.attackAnim = 0.2;
        if (this.stateT <= 0) { this._doSpecial(game); this.state = 'walk'; }
        return this._finish(game);
      }
      this.specialCD -= dt;
      if (this.specialCD <= 0 && this.state === 'walk' && dist < 560) {
        this.pendingSpecial = Math.random() < 0.5 ? 'slam' : 'summon';
        this.slamR = specials.slam.r;
        this.state = 'special'; this.stateT = 0.95; this.specMax = 0.95;
        this.specialCD = specials.interval;
        return this._finish(game);
      }
    }

    // ---- charge attack (miniboss/boss) ----
    if (charge) {
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
        if (this.stateT <= 0) { this.state = 'walk'; this.chargeCD = charge.cooldown; this.cdmg = this.damage; }
        return this._finish(game);
      }
      if (this.chargeCD <= 0 && dist < 380) {
        this.state = 'windup'; this.stateT = charge.windup;
        return this._finish(game);
      }
    }

    // ---- ranged caster / boss nova ----
    if (ranged) {
      this.fireCD -= dt;
      if (this.fireCD <= 0 && dist < ranged.range) {
        this._fire(game, nx, ny, ranged);
        this.fireCD = ranged.cooldown;
        this.attackAnim = 0.25;
      }
      // kiting behaviour for non-boss casters
      if (!this.boss) {
        if (dist > ranged.range) { this._step(nx, ny, dt); this.moving = true; }
        else if (dist < ranged.keep) { this._step(-nx, -ny, dt * 0.9); this.moving = true; }
        else this.moving = false;
        return this._finish(game);
      }
    }

    // ---- default melee approach ----
    this._step(nx, ny, dt);
    this.moving = true;
    return this._finish(game);
  }

  _doSpecial(game) {
    const sp = this.spec.specials;
    if (this.pendingSpecial === 'slam') {
      const p = game.player, R = sp.slam.r;
      game.addEffect({ kind: 'boom', x: this.x, y: this.y, r: R, t: 0, dur: 0.4 });
      game.shake = Math.max(game.shake, 11);
      if (Math.hypot(p.x - this.x, p.y - this.y) < R + p.r) { if (p.takeHit(this.damage * sp.slam.dmg)) game.shake = 13; }
    } else {
      const s = sp.summon;
      for (let i = 0; i < s.count; i++) {
        const a = Math.random() * TAU;
        game.enemies.push(new Enemy(s.type, this.x + Math.cos(a) * 64, this.y + Math.sin(a) * 64, game.level));
      }
      game.addEffect({ kind: 'ring', x: this.x, y: this.y, r: 74, color: '#b06bff', t: 0, dur: 0.45 });
    }
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
    const make = (ax, ay) => {
      game.projectiles.push(new Projectile(
        this.x + ax * (this.r + 6), this.y + ay * (this.r + 6),
        ax * ranged.projSpeed, ay * ranged.projSpeed,
        ranged.projDmg * (1 + CONFIG.scaling.dmgPerLevel * (game.level - 1)),
        this.boss));
    };
    if (ranged.nova) {
      for (let i = 0; i < ranged.nova; i++) {
        const a = (i / ranged.nova) * TAU;
        make(Math.cos(a), Math.sin(a));
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
