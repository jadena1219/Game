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
    knockback: 230,         // px/s impulse applied to struck enemies (shoves crowds back)
    invuln: 0.8,            // s of i-frames after taking a hit
    // Dodge dash — double-tap the move side (or Shift on desktop)
    dashSpeed: 760,         // px/s burst speed
    dashDur: 0.18,          // s of dash motion (~135px)
    dashCooldown: 0.85,     // s before you can dash again
    dashInvuln: 0.32,       // s of invulnerability granted by a dash (slip through crowds)
  },

  // HP restored after clearing each level (capped at maxHP)
  hpRestorePerLevel: 35,

  // Per-level scaling applied to base enemy stats. Ramps harder than before
  // because the knight now snowballs in power via per-level ability cards.
  scaling: {
    hpPerLevel: 0.16,       // +16% enemy HP per level above 1
    speedPerLevel: 0.035,   // +3.5% enemy speed per level above 1
    dmgPerLevel: 0.05,      // +5% enemy contact/projectile damage per level above 1
  },

  spawn: {
    interval: 0.62,         // s between spawn batches
    batch: 3,               // enemies per batch (bosses ignore this)
  },
};

// Base enemy archetypes (level-1 values; scaled up each level).
export const ENEMY_TYPES = {
  chaser:  { sprite: 'skeleton', hp: 30,  speed: 72,  damage: 8,  radius: 13, touch: true },
  swarmer: { sprite: 'imp',      hp: 16,  speed: 132, damage: 5,  radius: 10, touch: true },
  tank:    { sprite: 'ogre',     hp: 130, speed: 42,  damage: 15, radius: 20, touch: true },
  caster:  { sprite: 'mage',     hp: 38,  speed: 58,  damage: 9,  radius: 13, touch: true,
             ranged: { range: 320, keep: 240, cooldown: 2.1, projSpeed: 185, projDmg: 9 } },
  // Steady bruisers: slow, tanky, no dash — kite them in circles and chip them down.
  miniboss:{ sprite: 'miniboss', hp: 560, speed: 80,  damage: 16, radius: 26, touch: true,
             boss: true },
  boss:    { sprite: 'boss',     hp: 1050, speed: 60, damage: 13, radius: 34, touch: true,
             boss: true,
             ranged: { range: 9999, keep: 0, cooldown: 2.4, projSpeed: 175, projDmg: 12, nova: 12 } },
};

// Level composition. Each entry: { type: count }. miniboss at L5, boss at L10.
// Counts ramp up to match the player's snowballing ability kit.
export const LEVELS = [
  { chaser: 6 },                                  // 1  (no abilities yet — gentle)
  { chaser: 11 },                                 // 2
  { chaser: 9, swarmer: 8 },                      // 3
  { chaser: 8, swarmer: 12, tank: 1 },            // 4
  { miniboss: 1, chaser: 8 },                     // 5  — mini-boss
  { swarmer: 16, caster: 4 },                     // 6
  { chaser: 12, caster: 4, tank: 3 },             // 7
  { swarmer: 18, caster: 5, tank: 3 },            // 8
  { chaser: 12, swarmer: 14, caster: 5, tank: 4 },// 9
  { boss: 1, caster: 3, tank: 2 },                // 10 — final boss
];
