// The hero. Split from entities.js — class body is verbatim.
import { CONFIG } from './config.js';
import { BASE_MODS } from './abilities.js';


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
    this.parryT = 0;                   // perfect-dodge window: open while a dash can "thread" a hit
    // progression
    this.forge = {};                   // forge id -> level
    this.relics = new Set();           // owned relic ids
    this.abilities = [];               // (kept empty: the knight is the core)
    this.fury = 0; this.furyMax = 100;
    // The Living Blade
    this.blade = null;                 // chosen blade id ('ember' | 'frost' | 'storm')
    this.bladeUp = new Set();          // chosen evolution ids
    this.bladeTier = 0;                // evolutions taken (0..3)
    this.bladeCharge = 0;              // Stormedge static-charge counter
    this.slowT = 0;                    // >0 while chilled by a Frostbound elite
    this.eventDmg = 1;                 // run-scoped multipliers from dungeon events
    this.eventHP = 0;
    this.eventVuln = 1;                // incoming-damage multiplier (demon pacts, etc.)
  }

  get facingAngle() { return Math.atan2(this.fy, this.fx); }
  get dashing() { return this.dashTimer > 0; }
  get maxHP() { const base = this.hero.maxHP + (this.mods ? this.mods.bonusHP : 0) + this.metaB.hp + this.eventHP; return Math.max(1, Math.round(base * (this.mods ? this.mods.maxHPMult : 1))); }
  // effective stats after upgrades (per-hero base + meta-progression + events)
  get moveSpeed() { return this.hero.speed * this.mods.moveSpeedMult * (1 + this.metaB.spd) * (this.slowT > 0 ? 0.55 : 1); }
  get swordDamage() { return this.hero.swordDamage * this.mods.swordDamageMult * (1 + this.metaB.dmg) * this.eventDmg; }
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
    // PERFECT-dodge window — currently pinned (CONFIG.features.perfectDodge);
    // kept for a future hero/world whose identity is the dodge-dance
    if (CONFIG.features && CONFIG.features.perfectDodge) this.parryT = h.dashDur + h.dashInvuln * 0.5;
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
      const ds = this.hero.dashSpeed * (this.mods.dashRangeMult || 1);
      this.x += this.dashDirX * ds * dt;
      this.y += this.dashDirY * ds * dt;
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
    if (this.parryT > 0) this.parryT -= dt;
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

  takeHit(dmg, source = null) {
    if (this.god) return false;                 // GOD MODE: shrug off all damage
    if (this.invuln > 0 || this.dead) return false;
    const dr = Math.min(0.85, this.mods.damageReduction + (this.hero.damageReduction || 0));
    this.hp -= dmg * (1 - dr) * this.eventVuln * (this.mods.damageTakenMult || 1);
    this.invuln = CONFIG.player.invuln;
    this.flash = 0.25;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; this.killedBy = source; }   // for the run summary
    return true;
  }
}
