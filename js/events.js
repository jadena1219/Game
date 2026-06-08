// Update 2 — The Forking Dark.
// Between levels, a third path may open in the camp: a shrine, a corpse, a caged
// thing. Each is a risk/reward decision that fits the gloom. Effects are applied
// to the live run; some echo into the next level.
import { recompute, RELICS, FORGE, relicById, forgeById } from './abilities.js';

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
function ambush(g, n = 1) { g.forceElite = (g.forceElite || 0) + n; }

// ---- the event pool ----
// Each: { id, icon, color, title, flavor, available?(g), choices:[{ label, risk, apply(g)->string }] }
// Designed to be TENSE: real dilemmas, both sides carry weight, gambles swing hard.
export const EVENTS = [
  {
    id: 'altar', icon: 'berserk', color: '#d8413a', title: 'The Bloodthirst Altar',
    flavor: 'A black altar weeps a slow red. It hungers for an offering — and offers terrible strength in kind.',
    choices: [
      { label: 'Carve out your strength', risk: '+35% damage all run · −22 max HP (permanent)',
        apply: (g) => { g.player.eventDmg *= 1.35; g.player.eventHP -= 22; g.player.hp = Math.min(g.player.hp, g.player.maxHP);
          return 'The altar drinks deep. Power floods your arm — and a part of you will never come back.'; } },
      { label: 'Turn away', risk: 'Walk from the offer untaken',
        apply: () => 'You leave the altar weeping in the dark. The hunger follows your steps.' },
    ],
  },
  {
    id: 'pact', icon: 'thunder', color: '#ff3a3a', title: "The Demon's Pact",
    flavor: 'A horned shadow unfolds from the wall, smiling without a face. "A gift of power, little knight. The price comes later."',
    choices: [
      { label: 'Seal the pact in blood', risk: 'Gain a RELIC + 25% damage · take 20% MORE damage all run',
        apply: (g) => { const r = grantRelic(g); g.player.eventDmg *= 1.25; g.player.eventVuln *= 1.2;
          return r ? `${r.name} burns into your grip and dark might floods you — but the dark will bite back twice as hard.`
            : 'Dark might floods you — but the dark will bite back twice as hard.'; } },
      { label: 'Refuse the pact', risk: 'Some prices are too high',
        apply: () => 'You spit at its feet. It chuckles, and melts back into the stone.' },
    ],
  },
  {
    id: 'chalices', icon: 'frost', color: '#7fe0c0', title: 'The Twin Chalices',
    flavor: 'Two chalices rest on a bier — one brims crimson, one black as a grave. You may drink but one.',
    choices: [
      { label: 'The crimson chalice', risk: 'Heal to FULL · but it scars you (−15 max HP)',
        apply: (g) => { g.player.eventHP -= 15; healFull(g); return 'Warmth floods you, wounds sealing whole — the cure leaves a cold scar that never fades.'; } },
      { label: 'The black chalice', risk: '+28% damage all run · take 22 damage NOW',
        apply: (g) => { g.player.eventDmg *= 1.28; hurt(g, 22); return 'It burns going down. Your blade hums with new fury, your gut with new pain.'; } },
    ],
  },
  {
    id: 'cage', icon: 'vampire', color: '#9a6ce0', title: 'The Caged Wretch',
    flavor: 'A withered thing claws at iron bars, clutching something that glitters. Its eyes plead — or scheme.',
    choices: [
      { label: 'Break the cage', risk: 'Gain a RELIC · 2 elite foes ambush you next level',
        apply: (g) => { const r = grantRelic(g); ambush(g, 2);
          return r ? `It presses ${r.name} into your hand — then flees, cackling, to lie in wait below.`
            : 'It flees empty-handed, cackling, to lie in wait below.'; } },
      { label: 'Leave it caged', risk: 'Let it rot',
        apply: () => 'Its shrieks chase you down the stair, then fall to silence.' },
    ],
  },
  {
    id: 'gambler', icon: 'idol', color: '#e9c84a', title: "The Gambler's Skull",
    flavor: 'A skull hovers in cold blue flame, jaw clattering. "Wager it ALL, knight. Thrice your coin — or the dark keeps every piece."',
    available: (g) => g.gold >= 12,
    choices: [
      { label: 'Wager everything', risk: 'Coin flip: TRIPLE your gold, or lose it all',
        apply: (g) => { if (Math.random() < 0.5) { addGold(g, g.gold * 2); return `The flame roars gold — your purse swells to ${g.gold}!`; }
          const lost = g.gold; g.gold = 0; return `The skull howls with laughter. All ${lost} coins crumble to ash.`; } },
      { label: 'Keep your coin', risk: 'Refuse the wager',
        apply: () => 'You close your purse. The skull sneers and dims to embers.' },
    ],
  },
  {
    id: 'fountain', icon: 'armor', color: '#d8413a', title: 'The Crimson Fountain',
    flavor: 'A fountain runs thick and red, warm against the dungeon chill. It could mend you — or mark you for what lurks below.',
    choices: [
      { label: 'Drink deep', risk: 'Heal to FULL · the scent draws an elite ambush next level',
        apply: (g) => { healFull(g); ambush(g, 2); return 'Warmth knits your wounds whole — but something below has caught the scent of blood.'; } },
      { label: 'Bleed into it', risk: '−18 HP now · +75 gold',
        apply: (g) => { hurt(g, 18); addGold(g, 75); return 'You open a vein. The fountain drinks, and answers with a heavy glint of gold.'; } },
    ],
  },
  {
    id: 'champion', icon: 'whet', color: '#cfd6e0', title: 'The Fallen Champion',
    flavor: 'A dead knight slumps against the stone, armour still gleaming. A faint ghost-light flickers behind the visor.',
    choices: [
      { label: 'Loot the armour', risk: 'A free forge upgrade · 2 elite foes ambush you next level',
        apply: (g) => { const f = grantForge(g); ambush(g, 2);
          return f ? `You pry loose ${f.name}. The ghost-light snaps awake and gutters down the stair after you.`
            : 'The armour is spent — but the ghost-light snaps awake all the same.'; } },
      { label: 'Honour the dead', risk: 'Mend 40 HP · take nothing',
        apply: (g) => { g.player.hp = Math.min(g.player.maxHP, g.player.hp + 40);
          return 'You bow your head and close the visor. The ghost-light steadies, grateful, and mends your wounds.'; } },
    ],
  },
  {
    id: 'idol', icon: 'idol', color: '#b06bff', title: 'The Whispering Idol',
    flavor: 'A squat idol of black jade murmurs promises in a tongue you almost understand. It wants only a little of you.',
    choices: [
      { label: 'Kneel and pray', risk: 'A free forge upgrade · −15 HP',
        apply: (g) => { const f = grantForge(g); hurt(g, 15);
          return f ? `It whispers, and ${f.name} settles into your gear — the price is a little of your own warmth.`
            : 'It whispers, but has nothing left to give — only takes a little of your warmth.'; } },
      { label: 'Smash it open', risk: 'It was hollow — pocket the coins',
        apply: (g) => { addGold(g, 40); return 'The idol shatters. A scatter of old coins spills across the flagstones.'; } },
    ],
  },
  {
    id: 'coffer', icon: 'idol', color: '#e9c84a', title: 'The Sealed Coffer',
    flavor: 'An iron coffer bound in a flaking sigil. Treasure, surely — unless the sigil was never a lock, but a warning.',
    choices: [
      { label: 'Force it open', risk: '55%: a relic · 45%: trapped (−30 HP + elite ambush)',
        apply: (g) => { if (Math.random() < 0.55) { const r = grantRelic(g); return r ? `The lid groans wide — ${r.name} rests on the velvet within.` : 'The lid groans wide — but the velvet is bare.'; }
          hurt(g, 30); ambush(g, 2); return 'The sigil flares crimson. Iron needles bite deep, and something below hears you scream.'; } },
      { label: 'Leave it sealed', risk: 'Some locks are mercies',
        apply: () => 'You step over the coffer and leave its secret to the dark.' },
    ],
  },
  {
    id: 'souleater', icon: 'thunder', color: '#7a4fd0', title: "The Soul-Eater's Bargain",
    flavor: 'A maw of shadow opens in the wall. "Feed me one of your charms, little knight, and I will return you two — though I choose which."',
    available: (g) => g.player.relics.size >= 1,
    choices: [
      { label: 'Strike the bargain', risk: 'Lose a random relic · gain TWO (random)',
        apply: (g) => { const p = g.player; const owned = [...p.relics]; const lose = owned[(Math.random() * owned.length) | 0];
          p.relics.delete(lose); recompute(p);
          const a = grantRelic(g), b = grantRelic(g);
          const got = [a, b].filter(Boolean).map((r) => r.name).join(' and ') || 'nothing but its laughter';
          return `It swallows your ${relicById(lose).name}... and disgorges ${got}.`; } },
      { label: 'Refuse', risk: 'Keep your charms close',
        apply: () => 'You back away. The maw closes with a wet, disappointed sigh.' },
    ],
  },
];

// Pick a random event whose availability conditions are met. Avoid anything
// seen in the last few camps so the fork never feels like a rerun; only fall
// back to repeats if variety has run dry.
export function pickEvent(g) {
  const recent = g._eventsRecent || [];
  const ok = (e) => !e.available || e.available(g);
  let pool = EVENTS.filter((e) => ok(e) && !recent.includes(e.id));
  if (!pool.length) pool = EVENTS.filter(ok);
  return pool.length ? pool[(Math.random() * pool.length) | 0] : null;
}
