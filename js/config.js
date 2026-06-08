// Central balance + tuning. Numbers chosen for the "Balanced" difficulty feel:
// you must play reasonably well, and reaching the Demon Lord is earned.
export const CONFIG = {
  pixelScale: 2.4,          // base sprite magnification (16x24 art -> ~38x58 px)

  player: {
    maxHP: 100,             // FIXED max HP — never grows
    speed: 200,             // px/s
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

  // Playable heroes — each overrides the base stats with a distinct feel.
  heroes: {
    knight: {
      name: 'Knight', sprite: 'knight', weapon: 'Greatsword', title: 'The Veteran',
      pips: { hp: 3, spd: 3, pow: 3 }, accent: '#7fb0ff',
      blurb: 'The balanced veteran. Wide cleaving swings that shove crowds back.',
      maxHP: 100, speed: 200, swordDamage: 34, swordReach: 78, swordArcDeg: 120,
      swingCooldown: 0.42, swingActive: 0.16, knockback: 230,
      dashSpeed: 760, dashDur: 0.18, dashCooldown: 0.85, dashInvuln: 0.32,
      swingStyle: 'sweep',
    },
    rogue: {
      name: 'Rogue', sprite: 'rogue', weapon: 'Twin Daggers', title: 'The Shadow',
      pips: { hp: 2, spd: 5, pow: 2 }, accent: '#7affc0',
      blurb: 'Fragile but lightning fast. A flurry of strikes, constant dashes, deadly crits.',
      maxHP: 70, speed: 234, swordDamage: 15, swordReach: 56, swordArcDeg: 84,
      swingCooldown: 0.19, swingActive: 0.11, knockback: 110,
      dashSpeed: 830, dashDur: 0.18, dashCooldown: 0.48, dashInvuln: 0.44,
      crit: 0.30, critMult: 2.2, swingStyle: 'stab',
    },
    paladin: {
      name: 'Paladin', sprite: 'paladin', weapon: 'Warhammer', title: 'The Bulwark',
      pips: { hp: 5, spd: 1, pow: 5 }, accent: '#ffd86a',
      blurb: 'A slow, unstoppable wall. Crushing blows send out shockwaves; shrugs off damage.',
      maxHP: 150, speed: 96, swordDamage: 42, swordReach: 84, swordArcDeg: 132,
      swingCooldown: 0.64, swingActive: 0.18, knockback: 300,
      dashSpeed: 500, dashDur: 0.12, dashCooldown: 1.9, dashInvuln: 0.26,
      damageReduction: 0.12, shockwave: true, swingStyle: 'slam',
    },
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
  // Bomber: rushes you and detonates on death — keep your distance or kill from afar.
  bomber:  { sprite: 'bomber',   hp: 24,  speed: 116, damage: 6,  radius: 12, touch: true,
             explode: { r: 70, dmg: 26 } },
  // Mini-boss (Dark Knight, L5): telegraphed CHARGE that rushes you down.
  miniboss:{ sprite: 'miniboss', hp: 560, speed: 78,  damage: 16, radius: 26, touch: true, boss: true,
             charge: { windup: 0.7, dur: 0.5, speed: 460, cooldown: 3.0 } },
  // Final boss (Demon Lord, L10): nova volleys + telegraphed ground SLAM + SUMMONS.
  boss:    { sprite: 'boss',     hp: 1050, speed: 58, damage: 13, radius: 34, touch: true, boss: true,
             ranged: { range: 9999, keep: 0, cooldown: 2.6, projSpeed: 175, projDmg: 12, nova: 12 },
             specials: { interval: 5.2, slam: { r: 160, dmg: 1.7 }, summon: { type: 'swarmer', count: 4 } } },
};

// Elite affixes — a rare enemy spawns "empowered" with a glowing aura, buffed
// stats, better loot, and one nasty trait.
export const ELITE_AFFIXES = {
  swift:    { name: 'Swift',     color: '#7fe0ff', speed: 1.75 },
  armored:  { name: 'Armored',   color: '#cfd6e0', armor: 0.45, hp: 1.6 },
  explosive:{ name: 'Explosive', color: '#ff7a2a', explode: { r: 78, dmg: 24 } },
  icy:      { name: 'Frostbound', color: '#bdf0ff', chill: true },
  vampiric: { name: 'Vampiric',  color: '#d8413a', regen: 0.05 }, // %maxHP/s
};

// Level composition. Each entry: { type: count }. miniboss at L5, boss at L10.
// Counts ramp up to match the player's snowballing ability kit.
export const LEVELS = [
  { chaser: 6 },                                          // 1  (gentle)
  { chaser: 11 },                                         // 2
  { chaser: 9, swarmer: 8 },                              // 3
  { chaser: 8, swarmer: 10, bomber: 3, tank: 1 },         // 4
  { miniboss: 1, chaser: 8 },                             // 5  — mini-boss
  { swarmer: 14, caster: 4, bomber: 4 },                  // 6
  { chaser: 12, caster: 4, tank: 3, bomber: 3 },          // 7
  { swarmer: 16, caster: 5, tank: 3, bomber: 5 },         // 8
  { chaser: 12, swarmer: 12, caster: 5, tank: 4, bomber: 4 }, // 9
  { boss: 1, caster: 3, tank: 2, bomber: 3 },             // 10 — final boss
];
