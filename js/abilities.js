// Progression: the knight is the core. Between levels you spend GOLD at a camp
// shop on FORGE upgrades (clear, repeatable stat boosts that visibly improve your
// gear) and RELICS (rare, characterful items with build-defining effects).
// No more random auto-cast spells — relics hang their magic on your blade.
import { CONFIG } from './config.js';

export const BASE_MODS = () => ({
  swordDamageMult: 1,
  swingCooldownMult: 1,
  reachMult: 1,
  arcBonusDeg: 0,
  moveSpeedMult: 1,
  lifestealHeal: 0,        // HP healed per sword kill
  furyMult: 1,             // fury gained per kill multiplier
  abilityDmgMult: 1,       // relic proc damage
  dashCooldownMult: 1,
  dashInvulnBonus: 0,
  bonusHP: 0,
  damageReduction: 0,      // 0..1 incoming damage cut
  goldMult: 1,
});

// ---- FORGE: repeatable upgrades, cost grows with each level owned ----
export const FORGE = [
  { id: 'power', icon: '🗡️', name: 'Sharpen Blade', max: 8, baseCost: 14, costStep: 10,
    desc: (l) => `+${20 * l}% sword damage` },
  { id: 'armor', icon: '🛡️', name: 'Reinforce Armor', max: 8, baseCost: 15, costStep: 11,
    desc: (l) => `+${18 * l} max HP` },
  { id: 'whet', icon: '💨', name: 'Whetstone', max: 5, baseCost: 17, costStep: 12,
    desc: (l) => `+${Math.round((1 - Math.max(0.5, 1 - 0.1 * l)) * 100)}% swing speed` },
  { id: 'boots', icon: '👢', name: 'Swift Boots', max: 5, baseCost: 13, costStep: 9,
    desc: (l) => `+${8 * l}% move speed` },
  { id: 'reach', icon: '📐', name: 'Long Reach', max: 4, baseCost: 16, costStep: 11,
    desc: (l) => `+${14 * l}% reach & wider arc` },
  { id: 'wrath', icon: '😤', name: 'Wrath', max: 4, baseCost: 13, costStep: 9,
    desc: (l) => `+${50 * l}% Fury gained` },
];

// ---- RELICS: unique, characterful, build-defining ----
export const RELICS = [
  { id: 'vampire', icon: '🩸', name: 'Vampiric Fang', cost: 48,
    flavor: 'Torn from a thing that refused to die.', desc: 'Heal 2 HP for every foe your sword slays.' },
  { id: 'ember', icon: '👑', name: 'Ember Crown', cost: 56,
    flavor: "It smoulders still with a dead king's wrath.", desc: 'Slain foes erupt, burning those nearby.' },
  { id: 'thunder', icon: '⚡', name: 'Thunderbrand', cost: 58,
    flavor: 'A storm sleeps in the steel.', desc: 'Sword hits arc lightning to a nearby foe.' },
  { id: 'frost', icon: '❄️', name: 'Frostbite Edge', cost: 42,
    flavor: 'Cold enough to still a beating heart.', desc: 'Sword hits chill foes, slowing them.' },
  { id: 'stone', icon: '🪨', name: 'Stoneheart', cost: 54,
    flavor: 'Your heart beats slow as the mountain.', desc: 'Take 18% less damage from everything.' },
  { id: 'berserk', icon: '💢', name: "Berserker's Heart", cost: 54,
    flavor: 'It drinks your pain and repays it in rage.', desc: 'Up to +45% sword damage as your HP falls.' },
  { id: 'idol', icon: '🪙', name: 'Golden Idol', cost: 38,
    flavor: "The dungeon's greed, given form.", desc: '+30% gold from the slain.' },
  { id: 'wind', icon: '🌬️', name: 'Windrunner Boots', cost: 48,
    flavor: 'The wind owes you a favour.', desc: 'Dash recharges 30% faster, longer invulnerability.' },
  { id: 'exec', icon: '🪓', name: "Executioner's Seal", cost: 54,
    flavor: 'Finish what the dungeon started.', desc: '+70% sword damage to foes below 35% HP.' },
];

export function relicById(id) { return RELICS.find((r) => r.id === id); }
export function forgeById(id) { return FORGE.find((f) => f.id === id); }
export function forgeCost(item, ownedLevel) { return item.baseCost + item.costStep * ownedLevel; }

// Recompute player.mods from owned forge levels + relics.
export function recompute(player) {
  const m = BASE_MODS();
  const L = player.forge;
  if (L.power) m.swordDamageMult = 1 + 0.20 * L.power;
  if (L.whet) m.swingCooldownMult = Math.max(0.5, 1 - 0.10 * L.whet);
  if (L.reach) { m.reachMult = 1 + 0.14 * L.reach; m.arcBonusDeg = 12 * L.reach; }
  if (L.boots) m.moveSpeedMult = 1 + 0.08 * L.boots;
  if (L.wrath) m.furyMult = 1 + 0.5 * L.wrath;
  if (L.armor) m.bonusHP = 18 * L.armor;

  const R = player.relics;
  if (R.has('vampire')) m.lifestealHeal += 2;
  if (R.has('stone')) m.damageReduction += 0.18;
  if (R.has('idol')) m.goldMult *= 1.3;
  if (R.has('wind')) { m.dashCooldownMult *= 0.7; m.dashInvulnBonus += 0.15; }
  player.mods = m;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Build the camp's wares: a mix of forge upgrades (not maxed) + relics (not owned).
export function rollStock(player, n = 4) {
  const locked = player.lockedRelics || new Set();
  const forgePool = shuffle(FORGE.filter((f) => (player.forge[f.id] || 0) < f.max).map((f) => ({ kind: 'forge', item: f })));
  const relicPool = shuffle(RELICS.filter((r) => !player.relics.has(r.id) && !locked.has(r.id)).map((r) => ({ kind: 'relic', item: r })));
  const stock = [];
  const relicN = Math.min(2, relicPool.length);
  for (let i = 0; i < relicN; i++) stock.push(relicPool[i]);
  for (const f of forgePool) { if (stock.length >= n) break; stock.push(f); }
  for (let i = relicN; i < relicPool.length && stock.length < n; i++) stock.push(relicPool[i]);
  shuffle(stock);
  return stock.slice(0, n).map((w) => {
    if (w.kind === 'forge') {
      const lvl = player.forge[w.item.id] || 0;
      return { kind: 'forge', id: w.item.id, item: w.item, level: lvl, next: lvl + 1,
        cost: forgeCost(w.item, lvl), label: w.item.desc(lvl + 1) };
    }
    return { kind: 'relic', id: w.item.id, item: w.item, cost: w.item.cost, label: w.item.desc };
  });
}
