// Central balance + tuning. Numbers chosen for the "Balanced" difficulty feel:
// you must play reasonably well, and reaching the Demon Lord is earned.
export const CONFIG = {
  pixelScale: 2.4,          // base sprite magnification (16x24 art -> ~38x58 px)

  player: {
    maxHP: 100,             // FIXED max HP — never grows
    speed: 178,             // px/s
    radius: 14,
    // Sword swing
    swordReach: 78,         // px from player centre
    swordArcDeg: 120,       // total cone width
    swordDamage: 34,
    swingCooldown: 0.42,    // s between swings
    swingActive: 0.16,      // s the blade can connect
    knockback: 150,         // px/s impulse applied to struck enemies
    invuln: 0.8,            // s of i-frames after taking a hit
  },

  // HP restored after clearing each level (capped at maxHP)
  hpRestorePerLevel: 35,

  // Per-level scaling applied to base enemy stats
  scaling: {
    hpPerLevel: 0.12,       // +12% enemy HP per level above 1
    speedPerLevel: 0.035,   // +3.5% enemy speed per level above 1
    dmgPerLevel: 0.05,      // +5% enemy contact/projectile damage per level above 1
  },

  spawn: {
    interval: 0.7,          // s between spawn batches
    batch: 2,               // enemies per batch (bosses ignore this)
  },
};

// Base enemy archetypes (level-1 values; scaled up each level).
export const ENEMY_TYPES = {
  chaser:  { sprite: 'skeleton', hp: 30,  speed: 72,  damage: 8,  radius: 13, touch: true },
  swarmer: { sprite: 'imp',      hp: 16,  speed: 132, damage: 5,  radius: 10, touch: true },
  tank:    { sprite: 'ogre',     hp: 130, speed: 42,  damage: 15, radius: 20, touch: true },
  caster:  { sprite: 'mage',     hp: 38,  speed: 58,  damage: 9,  radius: 13, touch: true,
             ranged: { range: 320, keep: 240, cooldown: 2.1, projSpeed: 185, projDmg: 9 } },
  miniboss:{ sprite: 'miniboss', hp: 360, speed: 86,  damage: 16, radius: 26, touch: true,
             boss: true, charge: { cooldown: 3.4, speed: 350, windup: 0.75, dur: 0.45 } },
  boss:    { sprite: 'boss',     hp: 500, speed: 56,  damage: 13, radius: 34, touch: true,
             boss: true,
             ranged: { range: 9999, keep: 0, cooldown: 2.6, projSpeed: 170, projDmg: 12, nova: 10 },
             charge: { cooldown: 5.0, speed: 300, windup: 0.8, dur: 0.5 } },
};

// Level composition. Each entry: { type: count }. miniboss at L5, boss at L10.
export const LEVELS = [
  { chaser: 6 },                                  // 1
  { chaser: 9 },                                  // 2
  { chaser: 6, swarmer: 6 },                      // 3
  { chaser: 6, swarmer: 8, tank: 1 },             // 4
  { miniboss: 1, chaser: 4 },                     // 5  — mini-boss
  { swarmer: 10, caster: 3 },                     // 6
  { chaser: 8, caster: 3, tank: 2 },              // 7
  { swarmer: 10, caster: 3, tank: 2 },            // 8
  { chaser: 8, swarmer: 8, caster: 3, tank: 2 },  // 9
  { boss: 1, caster: 2, tank: 1 },                // 10 — final boss
];
