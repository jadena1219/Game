// Power-fantasy progression: auto-cast abilities + passive upgrades.
// After each level you choose 1 of 3 cards. Abilities fire on their own on a
// cooldown (auto-aimed); upgrades modify the knight's stats via player.mods.
import { CONFIG } from './config.js';

const TAU = Math.PI * 2;

export const BASE_MODS = () => ({
  swordDamageMult: 1,
  swingCooldownMult: 1,
  reachMult: 1,
  arcBonusDeg: 0,
  moveSpeedMult: 1,
  lifestealHeal: 0,      // HP healed per sword kill
  furyMult: 1,           // fury gained per kill multiplier
  abilityDmgMult: 1,
  dashCooldownMult: 1,
});

// ---- the card catalog ----
// Abilities: kind 'ability', have cooldown + cast(game, level).
// Upgrades:  kind 'upgrade', applied in recompute() from owned levels.
export const CARDS = [
  {
    id: 'lightning', kind: 'ability', icon: '⚡', name: 'Lightning Bolt',
    max: 6, cooldown: 2.2, firstDelay: 0.5,
    desc: (l) => `Zap the nearest foe and chain to ${l} more nearby. ${l > 1 ? `(${dmgL(24, 8, l)} dmg)` : ''}`.trim(),
    cast(game, lvl) {
      const p = game.player;
      const dmg = (24 + 8 * lvl) * p.mods.abilityDmgMult;
      let cur = game.nearestEnemy(p.x, p.y, 400);
      if (!cur) return;
      const seen = new Set();
      const pts = [{ x: p.x, y: p.y - 18 }];
      for (let i = 0; i < 1 + lvl && cur; i++) {
        pts.push({ x: cur.x, y: cur.y });
        seen.add(cur);
        game.hitEnemy(cur, dmg, 0, 0, 'ability');
        cur = game.nearestEnemy(cur.x, cur.y, 150, seen);
      }
      game.addEffect({ kind: 'bolt', pts, t: 0, dur: 0.18 });
      game.shake = Math.max(game.shake, 3);
    },
  },
  {
    id: 'frost', kind: 'ability', icon: '❄️', name: 'Frost Nova',
    max: 6, cooldown: 4.0, firstDelay: 1.2,
    desc: (l) => `Burst of frost around you: ${dmgL(14, 7, l)} dmg + slows foes. Radius grows with level.`,
    cast(game, lvl) {
      const p = game.player;
      const R = 95 + 16 * lvl;
      const dmg = (14 + 7 * lvl) * p.mods.abilityDmgMult;
      for (const e of game.enemiesInRadius(p.x, p.y, R)) {
        game.hitEnemy(e, dmg, 0, 0, 'ability');
        e.applySlow(2.4);
      }
      game.addEffect({ kind: 'ring', x: p.x, y: p.y, r: R, color: '#8fe9ff', t: 0, dur: 0.42 });
    },
  },
  {
    id: 'fireball', kind: 'ability', icon: '🔥', name: 'Fireball',
    max: 6, cooldown: 2.7, firstDelay: 0.9,
    desc: (l) => `Hurl a fireball at the nearest foe; explodes for ${dmgL(34, 12, l)} area dmg.`,
    cast(game, lvl) {
      const p = game.player;
      const tgt = game.nearestEnemy(p.x, p.y, 520);
      const ang = tgt ? Math.atan2(tgt.y - p.y, tgt.x - p.x) : p.facingAngle;
      game.spawnFireball(p.x, p.y, ang, lvl);
    },
  },
  {
    id: 'whirlwind', kind: 'ability', icon: '🌀', name: 'Whirlwind',
    max: 6, cooldown: 1.9, firstDelay: 0.7,
    desc: (l) => `Spin, striking all around you for ${dmgL(18, 7, l)} dmg and knocking them back.`,
    cast(game, lvl) {
      const p = game.player;
      const R = 76 + 9 * lvl;
      const dmg = (18 + 7 * lvl) * p.mods.abilityDmgMult;
      for (const e of game.enemiesInRadius(p.x, p.y, R)) {
        const a = Math.atan2(e.y - p.y, e.x - p.x);
        game.hitEnemy(e, dmg, Math.cos(a) * 200, Math.sin(a) * 200, 'ability');
      }
      game.addEffect({ kind: 'whirl', x: p.x, y: p.y, r: R, t: 0, dur: 0.28 });
    },
  },

  // ---- upgrades ----
  { id: 'power', kind: 'upgrade', icon: '🗡️', name: 'Sharpened Blade', max: 6,
    desc: (l) => `+${22 * l}% sword damage.` },
  { id: 'haste', kind: 'upgrade', icon: '💨', name: 'Swift Strikes', max: 4,
    desc: (l) => `Swing ${Math.round((1 - clampMin(1 - 0.12 * l, 0.45)) * 100)}% faster.` },
  { id: 'reach', kind: 'upgrade', icon: '📐', name: 'Long Reach', max: 4,
    desc: (l) => `+${16 * l}% sword reach and a wider arc.` },
  { id: 'swift', kind: 'upgrade', icon: '👢', name: 'Swift Boots', max: 4,
    desc: (l) => `+${10 * l}% move speed.` },
  { id: 'lifesteal', kind: 'upgrade', icon: '❤️', name: 'Lifesteal', max: 5,
    desc: (l) => `Heal ${4 * l} HP per foe slain by your sword.` },
  { id: 'fury', kind: 'upgrade', icon: '😤', name: 'Wrath', max: 4,
    desc: (l) => `+${50 * l}% Fury gained — reach your ultimate faster.` },
  { id: 'arcane', kind: 'upgrade', icon: '🔮', name: 'Arcane Power', max: 6,
    desc: (l) => `+${20 * l}% ability damage.` },
  { id: 'dashmaster', kind: 'upgrade', icon: '🌪️', name: 'Fleetfoot', max: 3,
    desc: (l) => `Dash cooldown ${Math.round((1 - clampMin(1 - 0.22 * l, 0.35)) * 100)}% shorter.` },
];

function dmgL(base, per, l) { return Math.round(base + per * l); }
function clampMin(v, m) { return Math.max(m, v); }
export function cardById(id) { return CARDS.find((c) => c.id === id); }

// Recompute player.mods from owned upgrade levels.
export function recompute(player) {
  const m = BASE_MODS();
  const L = player.cardLevels;
  if (L.power) m.swordDamageMult = 1 + 0.22 * L.power;
  if (L.haste) m.swingCooldownMult = clampMin(1 - 0.12 * L.haste, 0.45);
  if (L.reach) { m.reachMult = 1 + 0.16 * L.reach; m.arcBonusDeg = 12 * L.reach; }
  if (L.swift) m.moveSpeedMult = 1 + 0.10 * L.swift;
  if (L.lifesteal) m.lifestealHeal = 4 * L.lifesteal;
  if (L.fury) m.furyMult = 1 + 0.5 * L.fury;
  if (L.arcane) m.abilityDmgMult = 1 + 0.2 * L.arcane;
  if (L.dashmaster) m.dashCooldownMult = clampMin(1 - 0.22 * L.dashmaster, 0.35);
  player.mods = m;
}

// Apply a chosen card to the player (level it up / unlock the ability).
export function applyCard(player, card) {
  const lvl = (player.cardLevels[card.id] || 0) + 1;
  player.cardLevels[card.id] = lvl;
  if (card.kind === 'ability') {
    const owned = player.abilities.find((a) => a.id === card.id);
    if (owned) owned.level = lvl;
    else player.abilities.push({ id: card.id, def: card, level: lvl, cd: card.firstDelay ?? 0.6 });
  }
  recompute(player);
}

// Roll N distinct, not-yet-maxed cards for the choice screen.
export function rollChoices(player, n = 3) {
  const pool = CARDS.filter((c) => (player.cardLevels[c.id] || 0) < c.max);
  // shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(n, pool.length));
}

// The level a card would become if picked now (for display).
export function nextLevelOf(player, card) { return (player.cardLevels[card.id] || 0) + 1; }
