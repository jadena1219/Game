// Meta-progression: Souls banked from each run persist in localStorage and are
// spent in the Sanctum on permanent upgrades + relic unlocks that apply to every
// future run, whatever hero you pick.
//
// Souls are the essence of the fallen — the kingdom's dead. Each unlock also
// surfaces a fragment of LORE: the Sanctum is where the truth of the bargain
// leaks out, one purchase at a time (see docs/STORY.md — "grind that tells the
// story").
const KEY = 'kls_meta_v2';

// Permanent upgrades. Each level costs more; effects stack across runs.
export const META = [
  { id: 'vigor',    icon: 'armor', name: 'Vigor',           max: 6, base: 14, step: 12,
    apply: (l) => ({ hp: l * 8 }),         desc: (l) => `+${l * 8} max HP`,
    lore: 'The order tempered the body before the soul. You were their finest work — the King saw to it himself.' },
  { id: 'might',    icon: 'power', name: 'Might',            max: 6, base: 16, step: 14,
    apply: (l) => ({ dmg: l * 0.06 }),     desc: (l) => `+${l * 6}% damage`,
    lore: '"Stronger than Garrick ever was," the King said, watching you spar. He did not smile when he said it.' },
  { id: 'swift',    icon: 'boots', name: 'Swiftness',        max: 4, base: 22, step: 18,
    apply: (l) => ({ spd: l * 0.05 }),     desc: (l) => `+${l * 5}% move speed`,
    lore: 'Garrick was the realm’s blade before you. He was slower. Pray that is the only difference.' },
  { id: 'fortune',  icon: 'idol',  name: 'Fortune',          max: 6, base: 14, step: 10,
    apply: (l) => ({ gold: l * 0.14 }),    desc: (l) => `+${l * 14}% gold found`,
    lore: 'In the famine years the crown’s gold went somewhere below. No ledger says where. The dead remember.' },
  { id: 'coffers',  icon: 'idol',  name: 'Coffers',          max: 6, base: 12, step: 9,
    apply: (l) => ({ startGold: l * 15 }), desc: (l) => `Start each run with ${l * 15} gold`,
    lore: 'The royal coffers emptied the winter you came of age. Whatever the King bought, he bought it weeping.' },
  { id: 'merchant', icon: 'whet',  name: "Merchant's Pact",  max: 2, base: 55, step: 55,
    apply: (l) => ({ slots: l }),          desc: (l) => `+${l} ware${l > 1 ? 's' : ''} at the sorcerer`,
    lore: 'The sorcerer held the King’s seal once. He fled the court the night the bargain was struck.' },
];

// Relics sealed behind the Sanctum: they join the sorcerer's pool once bought
// with souls. Aspirational unlocks — the day-one pool stays deep without them.
export const LOCKED_RELICS = ['exec', 'thunder'];
export const RELIC_UNLOCK_COST = 70;

const fresh = () => ({ souls: 0, up: {}, relics: [] });

export function loadMeta() {
  try { return Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY)) || {}); }
  catch { return fresh(); }
}
export function saveMeta(m) { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch (e) { /* ignore */ } }

export function metaCost(item, ownedLevel) { return item.base + item.step * ownedLevel; }

// Roll up all owned upgrades into a flat bonus object applied at run start.
export function metaBonuses(meta) {
  const out = { hp: 0, dmg: 0, spd: 0, gold: 0, startGold: 0, slots: 0 };
  if (!meta || !meta.up) return out;
  for (const item of META) {
    const lvl = meta.up[item.id] || 0;
    if (!lvl) continue;
    const b = item.apply(lvl);
    for (const k of Object.keys(b)) out[k] = (out[k] || 0) + b[k];
  }
  return out;
}

// Souls earned from a run: every floor matters, every kill counts, and felling
// the Demon Lord pays a hero's tithe.
export function runSouls(levelsCleared, kills, won) {
  return Math.round(levelsCleared * 10 + kills + (won ? 150 : 0));
}
