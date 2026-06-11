// Narrative + tuning data shared across the game modules.
// Split from game.js — contents verbatim, with `export` added.


export const BOSS_NAMES = { miniboss: 'The Dark Knight', boss: 'The Demon Lord' };


// Named elite foes — rare, titled minibosses-of-the-floor. Each is a base enemy
// wearing one elite affix as its "twist", and each is guaranteed to drop a relic.
export const NAMED_FOES = [
  { name: 'Gravewarden',    base: 'tank',    affix: 'armored',   color: '#cfd6e0', sprite: 'gravewarden' },
  { name: 'Quickfang',      base: 'swarmer', affix: 'swift',     color: '#7fe0ff', sprite: 'quickfang' },
  { name: 'The Pale Widow', base: 'caster',  affix: 'icy',       color: '#bdf0ff', sprite: 'palewidow' },
  { name: 'Hollow Lord',    base: 'chaser',  affix: 'vampiric',  color: '#d8413a', sprite: 'hollowlord' },
  { name: 'Emberfiend',     base: 'tank',    affix: 'explosive', color: '#ff7a2a', sprite: 'emberfiend' },
  { name: 'Dreadcaller',    base: 'caster',  affix: 'vampiric',  color: '#c89aff', sprite: 'dreadcaller' },
];


// The Demon Lord's voice — cryptic, threatening, escalating. Keyed by the level
// you just cleared; the screen blacks out and these type across it in blood red.
export const DEMON_LINES = {
  1: 'ONE DOOR OPENED. NINETEEN REMAIN.\nI HAVE COUNTED THEM SINCE BEFORE YOUR BIRTH.',
  3: 'DO YOU FEEL THE COLD DEEPEN?\nTHAT IS ME — BREATHING ON YOUR NECK.',
  5: 'YOU CLIMB DOWN SO EAGERLY.\nEVERY STEP IS ONE I HAVE ALREADY WALKED.',
  7: 'MY CHAMPION SHARPENS HIS BLADE BELOW.\nHE HAS NEVER LEFT A ROOM UNQUIET.',
  9: 'THE DARK KNIGHT WAITS AT THE TENTH GATE.\nKNEEL, AND I MAY YET SPARE THE REST.',
  10: 'MY CHAMPION LIES BROKEN AT YOUR FEET.\nGOOD. I HAD GROWN BORED OF HIM.',
  13: 'PAST THE HALF NOW — AND SLOWING.\nI FEEL EACH BREATH GROW HEAVIER THAN THE LAST.',
  15: 'THE WALLS REMEMBER EVERY NAME.\nI WILL CARVE YOURS WHERE IT FITS.',
  17: 'YOUR WOUNDS OUTNUMBER YOUR VICTORIES.\nYET STILL YOU DESCEND. HOW LOVELY.',
  19: 'THE LAST DOOR IS OPEN, LITTLE KNIGHT.\nI SET TWO CHAIRS. YOU WILL NOT SIT.',
};


// The Lord REMEMBERS: certain camp choices provoke a personal interlude at the
// next floor's end — keyed 'eventId:choiceIndex'. He saw. He always sees.
export const LORD_REACTIONS = {
  'pact:0': 'YOU SEALED MY SERVANT\'S PACT WITHOUT ASKING\nWHOSE HAND HELD THE PEN. THE PRICE COMPOUNDS.',
  'pact:1': 'YOU SPAT AT MY SHADOW, LITTLE KNIGHT.\nPRIDE. I WILL ENJOY TAKING THAT FIRST.',
  'idol:1': 'THAT IDOL SANG MY PRAISES FOR A THOUSAND YEARS.\nYOU OWE ME A SONG.',
  'champion:0': 'YOU STRIP MY DEAD AND CALL IT COURAGE.\nHE WILL REMEMBER. SO WILL I.',
  'champion:1': 'TENDERNESS? HERE? FOR A CORPSE?\nI WILL TEACH YOU WHAT MERCY COSTS.',
  'fountain:1': 'YOU OPENED A VEIN AND SOLD THE BLOOD.\nWE ARE NOT SO DIFFERENT, YOU AND I.',
  'altar:0': 'THE ALTAR KEEPS WHAT IT DRINKS.\nTHAT PIECE OF YOU LIVES WITH ME NOW.',
  'souleater:0': 'YOU FED MY HOUND YOUR CHARMS AND CALLED IT TRADE.\nEVERYTHING IT SWALLOWS, I TASTE.',
};


// ---- the Revenant ("husk") — your previous run, raised against you ----
// On death, the run's shape (floor, blade, hero) is banked; the next run meets
// it on the floor where you fell, wearing your sprite and your blade's tricks.
// Lore: Garrick was the First Sacrifice, so your husks number from the Second.
export const HUSK_KEY = 'kls_husk_v1';

export function loadHusk() { try { return JSON.parse(localStorage.getItem(HUSK_KEY)); } catch (e) { return null; } }

export function saveHusk(h) { try { localStorage.setItem(HUSK_KEY, JSON.stringify(h)); } catch (e) { /* ignore */ } }

export function clearHusk() { try { localStorage.removeItem(HUSK_KEY); } catch (e) { /* ignore */ } }

export const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth',
  'Ninth', 'Tenth', 'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth'];

export const ordinal = (n) => ORDINALS[n - 1] || `${n}th`;


// The title campfire — real animated pixel art, four hand-placed frames.
// Palette: 1 ember bed, 2 deep red, 3 orange, 4 yellow, 5 white-hot core.
export const FIRE_PAL = { 1: '#7a1410', 2: '#d8431a', 3: '#ff7a2a', 4: '#ffd36b', 5: '#fff7d6' };

export const FIRE_FRAMES = [
  [
    '............',
    '......4.....',
    '.....44.....',
    '.....343....',
    '....3443....',
    '....34543...',
    '...334553...',
    '...2345543..',
    '..234555432.',
    '..234555432.',
    '.2234555432.',
    '.2233444332.',
    '..22333322..',
    '...112211...',
  ],
  [
    '.....4......',
    '....44......',
    '....343.....',
    '...3443.....',
    '...34543....',
    '...345543...',
    '..23455432..',
    '..23455532..',
    '.2334555432.',
    '.2234555332.',
    '.2234554322.',
    '..223443322.',
    '...2223222..',
    '....11221...',
  ],
  [
    '........4...',
    '.......44...',
    '......343...',
    '..4...3443..',
    '..34..34543.',
    '...3.345543.',
    '..23455543..',
    '..234555432.',
    '.2334555432.',
    '.2234554322.',
    '..223443222.',
    '..22333322..',
    '...222222...',
    '....2211....',
  ],
  [
    '......4.....',
    '......44....',
    '......54....',
    '.....454....',
    '.....4543...',
    '....34553...',
    '....345543..',
    '...23455432.',
    '..234555432.',
    '..2345555432',
    '.22345554322',
    '.2223444322.',
    '..22233322..',
    '....11221...',
  ],
];


// Kill-streak milestones: reach the count, get the title (and the stinger).
export const COMBO_TIERS = [
  { at: 10, name: 'FRENZY' },
  { at: 25, name: 'RAMPAGE' },
  { at: 50, name: 'MASSACRE' },
];
