// Meta-progression: Souls banked from each run persist in localStorage and are
// spent in the Sanctum on permanent upgrades + relic unlocks that apply to every
// future run, whatever hero you pick.
const KEY = 'kls_meta_v2';

// Permanent upgrades. Each level costs more; effects stack across runs.
export const META = [
  { id: 'vigor',    icon: 'armor', name: 'Vigor',           max: 6, base: 14, step: 12,
    apply: (l) => ({ hp: l * 8 }),         desc: (l) => `+${l * 8} max HP` },
  { id: 'might',    icon: 'power', name: 'Might',            max: 6, base: 16, step: 14,
    apply: (l) => ({ dmg: l * 0.06 }),     desc: (l) => `+${l * 6}% damage` },
  { id: 'swift',    icon: 'boots', name: 'Swiftness',        max: 4, base: 22, step: 18,
    apply: (l) => ({ spd: l * 0.05 }),     desc: (l) => `+${l * 5}% move speed` },
  { id: 'fortune',  icon: 'idol',  name: 'Fortune',          max: 6, base: 14, step: 10,
    apply: (l) => ({ gold: l * 0.14 }),    desc: (l) => `+${l * 14}% gold found` },
  { id: 'coffers',  icon: 'idol',  name: 'Coffers',          max: 6, base: 12, step: 9,
    apply: (l) => ({ startGold: l * 15 }), desc: (l) => `Start each run with ${l * 15} gold` },
  { id: 'merchant', icon: 'whet',  name: "Merchant's Pact",  max: 2, base: 55, step: 55,
    apply: (l) => ({ slots: l }),          desc: (l) => `+${l} ware${l > 1 ? 's' : ''} at the sorcerer` },
];

// Meta-progression is DISABLED for now (the Sanctum is hidden). Nothing is
// locked, and no permanent bonuses apply — every run starts from a clean slate.
export const LOCKED_RELICS = [];
export const RELIC_UNLOCK_COST = 70;

const fresh = () => ({ souls: 0, up: {}, relics: [] });

export function loadMeta() {
  try { return Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY)) || {}); }
  catch { return fresh(); }
}
export function saveMeta(m) { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch (e) { /* ignore */ } }

export function metaCost(item, ownedLevel) { return item.base + item.step * ownedLevel; }

// Roll up all owned upgrades into a flat bonus object applied at run start.
// Disabled for now — always returns a neutral (zero) bonus so no permanent
// upgrades affect a run.
export function metaBonuses(_meta) {
  return { hp: 0, dmg: 0, spd: 0, gold: 0, startGold: 0, slots: 0 };
}

// Souls earned from a run.
export function runSouls(levelsCleared, kills, won) {
  return Math.round(levelsCleared * 10 + kills + (won ? 150 : 0));
}
