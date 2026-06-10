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
      maxHP: 100, speed: 178, swordDamage: 34, swordReach: 78, swordArcDeg: 120,
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
  hpRestorePerLevel: 18,

  // Per-level scaling applied to base enemy stats. Ramps hard — you snowball in
  // power via cards/relics, so the dungeon has to push back to stay tense.
  scaling: {
    hpPerLevel: 0.155,      // +15.5% enemy HP per level above 1 (spread over 20 levels)
    speedPerLevel: 0.035,   // +3.5% enemy speed per level above 1
    dmgPerLevel: 0.072,     // +7.2% enemy damage per level — late floors should kill in
                            // 4-5 hits, not 3; the pressure comes from density instead
  },

  // Feature pins — built & verified, intentionally disabled for now (see
  // ROADMAP "Parked"). Flip to re-enable, e.g. for a future hero/world.
  features: {
    perfectDodge: false,    // dash-through parry: slow-mo + fury + dash refund
  },

  spawn: {
    interval: 0.52,         // s between spawn batches (tighter pressure)
    batch: 4,               // enemies per batch (bosses ignore this)
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
  // The Revenant: your own previous run, raised as a husk on the floor where you
  // fell. Duelist stats — quick, with a dash-like rush. game.js dresses it in the
  // hero sprite + Living Blade of the run that died there.
  revenant:{ sprite: 'knight',   hp: 290, speed: 104, damage: 15, radius: 14, touch: true,
             charge: { windup: 0.5, dur: 0.34, speed: 620, cooldown: 3.4 } },
  // Mini-boss (Dark Knight, L10): a GIGANTIC dread-knight — telegraphed CHARGE that rushes
  // you down, and a SLAM that cracks the floor into molten fissures you must not stand in.
  // Phase 2 (WRATH, <=50% HP): enrages into a triple-charge that erupts a shockwave nova.
  miniboss:{ sprite: 'miniboss', hp: 950, speed: 82,  damage: 22, radius: 46, touch: true, boss: true,
             charge: { windup: 0.62, dur: 0.52, speed: 500, cooldown: 2.7 },
             specials: { interval: 8.5, slamOnly: true, slam: { r: 150, dmg: 1.45, fissures: 5 } },
             phases: [
               { at: 0.5, title: 'WRATH', speed: 1.13, cd: 0.74, tripleCharge: true, shockwave: 8 },
             ] },
  // Final boss (Demon Lord, L20): nova volleys + telegraphed ground SLAM + SUMMONS.
  // Phase 2 (FURY, <=66%): gains a CHARGE rush and spiralling novas. Phase 3
  // (APOCALYPSE, <=33%): double-ring novas, more summons, an ember aura — the climax.
  // keep:120 — he holds casting distance and sidesteps along walls instead of
  // letting you pin him in a corner; the charge is live from phase 1 (long
  // cooldown) so the evasion tax exists before FURY shortens it.
  boss:    { sprite: 'boss',     hp: 1350, speed: 60, damage: 17, radius: 42, touch: true, boss: true,
             ranged: { range: 9999, keep: 120, cooldown: 2.4, projSpeed: 185, projDmg: 14, nova: 14 },
             specials: { interval: 4.6, slam: { r: 175, dmg: 1.8 }, summon: { type: 'swarmer', count: 5 } },
             charge: { windup: 0.68, dur: 0.5, speed: 470, cooldown: 6.5 },
             phases: [
               { at: 0.66, title: 'FURY', speed: 1.12, cd: 0.74, spiral: true, novaBonus: 2 },
               { at: 0.33, title: 'APOCALYPSE', speed: 1.24, cd: 0.5, novaBonus: 6, summonBonus: 3, doubleRing: true, emberAura: true },
             ] },
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

// Level composition. Each entry: { type: count }. miniboss at L10, boss at L20.
// Counts ramp up to match the player's snowballing ability kit.
export const LEVELS = [
  { chaser: 8 },                                              // 1  (gentle, but not a nap)
  { chaser: 13, swarmer: 5 },                                 // 2
  { chaser: 12, swarmer: 10 },                                // 3
  { chaser: 12, swarmer: 11, bomber: 3 },                     // 4
  { chaser: 11, swarmer: 12, bomber: 4, tank: 2 },            // 5
  { swarmer: 16, caster: 4, bomber: 5 },                      // 6
  { chaser: 14, caster: 5, tank: 3, bomber: 4 },              // 7
  { swarmer: 18, caster: 5, tank: 4, bomber: 6 },             // 8
  { chaser: 16, swarmer: 14, caster: 6, tank: 4, bomber: 6 }, // 9
  { miniboss: 1, chaser: 10, swarmer: 8 },                    // 10 — mini-boss + escort
  { chaser: 16, swarmer: 14, caster: 6, bomber: 6 },          // 11
  { swarmer: 14, caster: 7, tank: 9, bomber: 7 },             // 12 — the Vault's wardens: a tank gauntlet
  { chaser: 18, caster: 7, tank: 5, bomber: 7 },              // 13
  { swarmer: 22, caster: 8, tank: 6, bomber: 8 },             // 14
  { chaser: 18, swarmer: 18, caster: 8, tank: 6, bomber: 8 }, // 15
  { swarmer: 28, caster: 10, tank: 7, bomber: 9 },            // 16 — the flood: pure swarm pressure
  { chaser: 20, swarmer: 18, caster: 9, tank: 7, bomber: 9 }, // 17
  { swarmer: 30, caster: 10, tank: 8, bomber: 10 },           // 18
  { chaser: 22, swarmer: 22, caster: 10, tank: 9, bomber: 11 }, // 19 — everything the dark has left
  { boss: 1, caster: 5, tank: 4, bomber: 5 },                 // 20 — final boss
];
