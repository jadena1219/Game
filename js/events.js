// Update 2 — The Forking Dark.
// Between levels, a third path may open in the camp: a shrine, a corpse, a caged
// thing. Each is a risk/reward decision that fits the gloom. Effects are applied
// to the live run; some echo into the next level.
import { recompute, RELICS, FORGE, relicById, forgeById } from './abilities.js';
import { saveMeta } from './meta.js';

// ---- helpers (operate on the live game) ----
function grantRelic(g) {
  const p = g.player, locked = p.lockedRelics || new Set();
  const pool = RELICS.filter((r) => !p.relics.has(r.id) && !locked.has(r.id));
  if (!pool.length) return null;
  const r = pool[(Math.random() * pool.length) | 0];
  p.relics.add(r.id); recompute(p);
  return r;
}
function grantForge(g) {
  const p = g.player;
  const pool = FORGE.filter((f) => (p.forge[f.id] || 0) < f.max);
  if (!pool.length) return null;
  const f = pool[(Math.random() * pool.length) | 0];
  p.forge[f.id] = (p.forge[f.id] || 0) + 1; recompute(p);
  return f;
}
function hurt(g, n) { const p = g.player; p.hp = Math.max(1, p.hp - n); }
function healFull(g) { g.player.hp = g.player.maxHP; }
function addGold(g, n) { g.gold += n; if (n > 0) g.totalGold += n; }
function addSouls(g, n) { g.meta.souls += n; saveMeta(g.meta); }
function ambush(g, n = 1) { g.forceElite = (g.forceElite || 0) + n; }

// ---- the event pool ----
// Each: { id, icon, color, title, flavor, available?(g), choices:[{ label, risk, apply(g)->string }] }
export const EVENTS = [
  {
    id: 'altar', icon: 'berserk', color: '#d8413a', title: 'The Bloodthirst Altar',
    flavor: 'A black altar weeps a slow red. It hungers for an offering — and offers power for it.',
    choices: [
      { label: 'Offer your blood', risk: '+30% damage (this run) · −18 max HP',
        apply: (g) => { g.player.eventDmg *= 1.3; g.player.eventHP -= 18; g.player.hp = Math.min(g.player.hp, g.player.maxHP);
          return 'The altar drinks deep. Strength floods your arm, but you feel hollowed out.'; } },
      { label: 'Turn away', risk: 'Leave the altar to its hunger',
        apply: () => 'You leave the altar weeping in the dark.' },
    ],
  },
  {
    id: 'cage', icon: 'vampire', color: '#9a6ce0', title: 'The Caged Wretch',
    flavor: 'A withered thing claws at iron bars, clutching something that glitters. Its eyes plead — or scheme.',
    choices: [
      { label: 'Break the cage', risk: 'Gain a relic · it haunts the next level (elite ambush)',
        apply: (g) => { const r = grantRelic(g); ambush(g, 1);
          return r ? `It presses ${r.name} into your hand — then flees, cackling, into the dark below.`
            : 'It flees empty-handed, cackling into the dark below.'; } },
      { label: 'Leave it caged', risk: 'It wails as you pass',
        apply: () => 'Its wails follow you down the stair.' },
    ],
  },
  {
    id: 'gambler', icon: 'idol', color: '#e9c84a', title: "The Gambler's Skull",
    flavor: 'A skull hovers in a cold blue flame, jaw clattering. "Wager your coin, knight. Double or nothing."',
    available: (g) => g.gold >= 10,
    choices: [
      { label: 'Take the wager', risk: 'Coin flip: double your gold, or lose half',
        apply: (g) => { if (Math.random() < 0.5) { const b = g.gold; addGold(g, b); return `The flame flares gold — your purse is doubled to ${g.gold}.`; }
          const lost = Math.floor(g.gold / 2); g.gold -= lost; return `The skull laughs. ${lost} coins crumble to ash.`; } },
      { label: 'Pocket your coin', risk: 'Refuse the wager',
        apply: () => 'You close your purse. The skull sneers and dims.' },
    ],
  },
  {
    id: 'fountain', icon: 'frost', color: '#7fe0c0', title: 'The Crimson Fountain',
    flavor: 'A fountain runs thick and red, warm against the dungeon chill. It could mend you — or mark you.',
    choices: [
      { label: 'Drink deep', risk: 'Heal to full · the scent draws an elite next level',
        apply: (g) => { healFull(g); ambush(g, 1); return 'Warmth knits your wounds whole — but something below has caught the scent.'; } },
      { label: 'Bleed into it', risk: '−15 HP · +60 gold',
        apply: (g) => { hurt(g, 15); addGold(g, 60); return 'You open a vein; the fountain answers with a glint of gold.'; } },
    ],
  },
  {
    id: 'champion', icon: 'armor', color: '#cfd6e0', title: 'The Fallen Champion',
    flavor: 'A dead knight slumps against the stone, armour still gleaming. A faint ghost-light flickers at the visor.',
    choices: [
      { label: 'Loot the armour', risk: 'A free forge upgrade · wakes its ghost (ambush)',
        apply: (g) => { const f = grantForge(g); ambush(g, 1);
          return f ? `You pry loose ${f.name}. The ghost-light snaps awake and gutters down the stair.`
            : 'The armour is spent — but the ghost-light snaps awake all the same.'; } },
      { label: 'Honour the dead', risk: '+40 souls · mend 25 HP',
        apply: (g) => { addSouls(g, 40); g.player.hp = Math.min(g.player.maxHP, g.player.hp + 25);
          return 'You bow your head. The ghost-light steadies, grateful, and gifts you its strength.'; } },
    ],
  },
  {
    id: 'idol', icon: 'idol', color: '#b06bff', title: 'The Whispering Idol',
    flavor: 'A squat idol of black jade murmurs promises in a tongue you almost understand.',
    choices: [
      { label: 'Kneel and pray', risk: '+45 souls · −10 HP',
        apply: (g) => { addSouls(g, 45); hurt(g, 10); return 'It whispers, and the souls of the fallen pour into your keeping. The price is a little of your own.'; } },
      { label: 'Smash it open', risk: 'It was hollow — pocket the coins',
        apply: (g) => { addGold(g, 35); return 'The idol shatters. A scatter of old coins spills across the flagstones.'; } },
    ],
  },
  {
    id: 'coffer', icon: 'whet', color: '#e9c84a', title: 'The Sealed Coffer',
    flavor: 'An iron coffer bound in a flaking sigil. Treasure, surely — unless the sigil was a warning.',
    choices: [
      { label: 'Force it open', risk: '60%: a relic · 40%: trapped (−25 HP)',
        apply: (g) => { if (Math.random() < 0.6) { const r = grantRelic(g); return r ? `The lid groans wide — ${r.name} rests within.` : 'The lid groans wide — but the velvet is bare.'; }
          hurt(g, 25); return 'The sigil flares. Iron needles bite deep before the coffer falls silent.'; } },
      { label: 'Leave it sealed', risk: 'Better not to know',
        apply: () => 'You step over the coffer and leave its secret to the dark.' },
    ],
  },
  {
    id: 'souleater', icon: 'thunder', color: '#7a4fd0', title: "The Soul-Eater's Bargain",
    flavor: 'A maw of shadow opens in the wall. "Feed me one of your charms, little knight. I will return you two."',
    available: (g) => g.player.relics.size >= 1,
    choices: [
      { label: 'Strike the bargain', risk: 'Lose a random relic · gain two',
        apply: (g) => { const p = g.player; const owned = [...p.relics]; const lose = owned[(Math.random() * owned.length) | 0];
          p.relics.delete(lose); recompute(p);
          const a = grantRelic(g), b = grantRelic(g);
          const got = [a, b].filter(Boolean).map((r) => r.name).join(' and ') || 'nothing but laughter';
          return `It swallows your ${relicById(lose).name}... and disgorges ${got}.`; } },
      { label: 'Refuse', risk: 'Keep your charms close',
        apply: () => 'You back away. The maw closes with a wet sigh.' },
    ],
  },
];

// Pick a random event whose availability conditions are met.
export function pickEvent(g) {
  const pool = EVENTS.filter((e) => !e.available || e.available(g));
  return pool.length ? pool[(Math.random() * pool.length) | 0] : null;
}
