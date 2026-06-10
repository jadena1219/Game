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
// PRICED FOR THE LONG GAME: the Sanctum is meant to take dozens of runs to
// fill, not five — these 20 floors are the introduction, and the economy has
// to hold up across future worlds. First buys land within a few runs (the
// hook); maxing anything is a campaign.
export const META = [
  { id: 'vigor',    icon: 'armor', name: 'Vigor',           max: 6, base: 30, step: 25,
    apply: (l) => ({ hp: l * 8 }),         desc: (l) => `+${l * 8} max HP`,
    lore: 'The order tempered the body before the soul. You were their finest work — the King saw to it himself.' },
  { id: 'might',    icon: 'power', name: 'Might',            max: 6, base: 35, step: 30,
    apply: (l) => ({ dmg: l * 0.06 }),     desc: (l) => `+${l * 6}% damage`,
    lore: '"Stronger than Garrick ever was," the King said, watching you spar. He did not smile when he said it.' },
  { id: 'swift',    icon: 'boots', name: 'Swiftness',        max: 4, base: 45, step: 35,
    apply: (l) => ({ spd: l * 0.05 }),     desc: (l) => `+${l * 5}% move speed`,
    lore: 'Garrick was the realm’s blade before you. He was slower. Pray that is the only difference.' },
  { id: 'fortune',  icon: 'idol',  name: 'Fortune',          max: 6, base: 30, step: 20,
    apply: (l) => ({ gold: l * 0.14 }),    desc: (l) => `+${l * 14}% gold found`,
    lore: 'In the famine years the crown’s gold went somewhere below. No ledger says where. The dead remember.' },
  { id: 'coffers',  icon: 'idol',  name: 'Coffers',          max: 6, base: 25, step: 18,
    apply: (l) => ({ startGold: l * 15 }), desc: (l) => `Start each run with ${l * 15} gold`,
    lore: 'The royal coffers emptied the winter you came of age. Whatever the King bought, he bought it weeping.' },
  { id: 'merchant', icon: 'whet',  name: "Merchant's Pact",  max: 2, base: 120, step: 120,
    apply: (l) => ({ slots: l }),          desc: (l) => `+${l} ware${l > 1 ? 's' : ''} at the sorcerer`,
    lore: 'The sorcerer held the King’s seal once. He fled the court the night the bargain was struck.' },
];

// Relics sealed behind the Sanctum: they join the sorcerer's pool once bought
// with souls. Aspirational unlocks — the day-one pool stays deep without them.
export const LOCKED_RELICS = ['exec', 'thunder'];
export const RELIC_UNLOCK_COST = 150;

const fresh = () => ({ souls: 0, up: {}, relics: [] });

export function loadMeta() {
  try {
    const m = Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY)) || {});
    // one-time rebase: souls banked under the old economy (~8x too generous)
    // are scaled into the new one. Idempotent until the save is next written.
    if (!m.econ) { m.souls = Math.round(m.souls / 8); m.econ = 2; }
    // econ 3: full Sanctum reset — upgrades bought at the old broken prices
    // (and the souls that bought them) are wiped so progression starts honest
    // on the new curve. Death count / deepest-fall survive (the lore remembers).
    if (m.econ < 3) { m.up = {}; m.relics = []; m.souls = 0; m.econ = 3; }
    return m;
  } catch { return fresh(); }
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

// Souls earned from a run: DEPTH pays, kills barely matter (you can't farm a
// fortune lawn-mowing floor 3 forever), and felling the Demon Lord pays a
// hero's tithe. A run that dies at floor 10 banks ~30; a full clear ~120.
export function runSouls(levelsCleared, kills, won) {
  return Math.round(levelsCleared * 2 + Math.floor(kills / 12) + (won ? 50 : 0));
}
