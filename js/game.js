// Core game: state machine, wave spawning, collisions, rendering, HUD.
import { CONFIG, LEVELS, ELITE_AFFIXES } from './config.js';
import { Player, Enemy, inSwingArc, FOE_NAMES } from './entities.js';
import { drawSprite, pickFrame } from './sprite.js';
import { Input } from './input.js';
import { recompute, rollStock, RELICS, relicById } from './abilities.js';
import { Assets } from './assets.js';
import { biomeForLevel } from './biomes.js';
import { loadMeta, saveMeta, metaBonuses, runSouls, metaCost, LOCKED_RELICS, RELIC_UNLOCK_COST } from './meta.js';
import { pickEvent } from './events.js';
import { Sound } from './audio.js';
import { BLADES, bladeById, BLADE_MILESTONES } from './blades.js';

const BOSS_NAMES = { miniboss: 'The Dark Knight', boss: 'The Demon Lord' };

// Named elite foes — rare, titled minibosses-of-the-floor. Each is a base enemy
// wearing one elite affix as its "twist", and each is guaranteed to drop a relic.
const NAMED_FOES = [
  { name: 'Gravewarden',    base: 'tank',    affix: 'armored',   color: '#cfd6e0', sprite: 'gravewarden' },
  { name: 'Quickfang',      base: 'swarmer', affix: 'swift',     color: '#7fe0ff', sprite: 'quickfang' },
  { name: 'The Pale Widow', base: 'caster',  affix: 'icy',       color: '#bdf0ff', sprite: 'palewidow' },
  { name: 'Hollow Lord',    base: 'chaser',  affix: 'vampiric',  color: '#d8413a', sprite: 'hollowlord' },
  { name: 'Emberfiend',     base: 'tank',    affix: 'explosive', color: '#ff7a2a', sprite: 'emberfiend' },
  { name: 'Dreadcaller',    base: 'caster',  affix: 'vampiric',  color: '#c89aff', sprite: 'dreadcaller' },
];

// The Demon Lord's voice — cryptic, threatening, escalating. Keyed by the level
// you just cleared; the screen blacks out and these type across it in blood red.
const DEMON_LINES = {
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

// ---- the Revenant ("husk") — your previous run, raised against you ----
// On death, the run's shape (floor, blade, hero) is banked; the next run meets
// it on the floor where you fell, wearing your sprite and your blade's tricks.
// Lore: Garrick was the First Sacrifice, so your husks number from the Second.
const HUSK_KEY = 'kls_husk_v1';
function loadHusk() { try { return JSON.parse(localStorage.getItem(HUSK_KEY)); } catch (e) { return null; } }
function saveHusk(h) { try { localStorage.setItem(HUSK_KEY, JSON.stringify(h)); } catch (e) { /* ignore */ } }
function clearHusk() { try { localStorage.removeItem(HUSK_KEY); } catch (e) { /* ignore */ } }
const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth',
  'Ninth', 'Tenth', 'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth'];
const ordinal = (n) => ORDINALS[n - 1] || `${n}th`;

// The title campfire — real animated pixel art, four hand-placed frames.
// Palette: 1 ember bed, 2 deep red, 3 orange, 4 yellow, 5 white-hot core.
const FIRE_PAL = { 1: '#7a1410', 2: '#d8431a', 3: '#ff7a2a', 4: '#ffd36b', 5: '#fff7d6' };
const FIRE_FRAMES = [
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
const COMBO_TIERS = [
  { at: 10, name: 'FRENZY' },
  { at: 25, name: 'RAMPAGE' },
  { at: 50, name: 'MASSACRE' },
];

export class Game {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ui = ui;
    this.input = new Input(canvas);
    this.meta = loadMeta();
    this.metaB = metaBonuses(this.meta);
    this.shopSlots = 4;
    this.state = 'title';
    this.time = 0;
    this.shake = 0;

    this.player = null;
    this.enemies = [];
    this.projectiles = [];
    this.allyProjectiles = [];
    this.effects = [];
    this.level = 1;
    this.spawnQueue = [];
    this.pendingEscort = null;   // L10 escort held back until the boss enters WRATH
    this.cutscene = null;        // scripted boss-entrance sequence
    this.cutsceneBoss = null;
    this.godMode = false;        // debug: no damage taken, one-shot foes, floor-skip
    this._namedDef = null;       // a named elite queued to appear this floor
    this._namedTimer = 0;
    this.namedToast = null;      // brief "<Name> appears" / "Claimed: <relic>" banner
    this.spawnTimer = 0;
    this.flashScreen = 0;
    this.kills = 0;

    // --- Phase 2 polish state ---
    this.embers = [];          // ambient floating ember particles
    this.transition = null;    // slash-wipe between scenes
    this.plunge = null;        // "plunge into darkness" descent sequence
    this.descentJump = null;   // the knight's leap into the pit before the plunge
    this.descentSink = 0;      // 0..1 as the knight drops into the mouth and fades
    this.camDrop = 0;          // world y-offset while falling through the pit
    this.watchers = [];        // eyes that fade in from the dark to watch you
    this._watchT = 8;          // countdown to the next watcher
    this.campWhisper = null;   // intrusive Demon Lord voice in the "safe" room
    this._whisperT = 6;
    this.countdown = 0;        // 3..2..1..FIGHT pre-level timer
    this.intro = null;         // level/boss intro card
    this.sweep = null;         // "LEVEL CLEARED" banner sweep
    this.pendingReward = null; // rewards shown after the sweep
    this.hitStop = 0;          // brief world freeze on heavy hits
    this.timeScale = 1;        // for slow-mo on death
    this.dying = 0;            // dramatic death sequence timer
    this.hpDisplay = 100;      // smoothed health-bar value
    this.hpGhost = 100;        // lagging "damage taken" chunk
    this.hpHitT = 0;           // >0 briefly when damaged (HP-bar shake/flash)
    this._hpWas = null;        // last-frame HP, to detect damage
    this.combo = 0;            // kill streak
    this.comboT = 0;           // time left before the streak lapses
    this.comboPop = 0;         // scale-pop on each new kill
    this._comboTier = 0;       // highest COMBO_TIERS milestone hit this streak
    this.zoom = 0;             // camera zoom-punch impulse (decays; big kills/crits)
    this.slowmo = 0;           // seconds of perfect-dodge slow-motion left
    this._huskDef = null;      // a Revenant (your previous run) queued for this floor
    this._huskTimer = 0;
    this.goldPop = 0;          // scale-pop when gold is picked up
    this.titleT = 0;           // title-scene animation clock
    this.tunnelScroll = 0;     // how far the title corridor has scrolled past
    this.introCut = null;      // iris-to-black blink from the corridor into Level 1
    this.interlude = null;     // Demon Lord taunt (black screen + red typewriter)
    this.interludeFade = null; // black fading out of the taunt into the camp
    this._tapped = false;      // a screen tap (used to advance/skip the taunt)
    this.wipeEl = document.getElementById('wipe');
    canvas.addEventListener('pointerdown', (e) => {
      this._tapped = true;
      // where, in canvas coords (the title pit is tappable directly)
      const r = canvas.getBoundingClientRect();
      this._tapXY = [e.clientX - r.left, e.clientY - r.top];
    });

    // --- Phase 3b: open world ---
    this.cam = { x: 0, y: 0 };  // top-left of the view in world space (locked to player)
    this.world = { w: 2600, h: 2600 };
    this.pickups = [];          // walk-over gold / health
    this.gold = 0;
    this.totalGold = 0;

    this.bg = null;
    this._resize();
    window.addEventListener('resize', () => this._resize());
    // Orientation flip (portrait <-> landscape): some mobile browsers report the
    // new window size a frame or two late, so re-layout again shortly after.
    window.addEventListener('orientationchange', () => {
      this._resize();
      setTimeout(() => this._resize(), 200);
      setTimeout(() => this._resize(), 500);
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => this._resize());
    }

    this._last = performance.now();
    if (typeof window !== 'undefined') window.__KLS = this;   // debug/profiling handle
    requestAnimationFrame((t) => this._frame(t));
  }

  _resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
    this.canvas.width = Math.floor(this.vw * dpr);
    this.canvas.height = Math.floor(this.vh * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.input.layout(this.vw, this.vh);

    // a contained arena ~1.5x the screen — room to roam, walls in view
    // contained arena (~1.7x screen). The speed bug was the joystick math, not
    // the camera; the camera now follows exactly (no smoothing) for consistency.
    this.world = { w: Math.round(this.vw * 1.7), h: Math.round(this.vh * 1.7) };
    const m = 56;
    this.worldBounds = { minX: m, minY: m, maxX: this.world.w - m, maxY: this.world.h - m };
    this.bounds = this.worldBounds;
    // The arena bake is DEFERRED to the first floor: the title camp is fully
    // procedural, so nothing heavy blocks first paint (the old eager 2600x2600
    // biome bake stalled cold boots for a screen nobody was looking at).
    this.atmos = [];
  }

  // Switch to the biome for `level`: bake the whole arena (ground + scattered
  // NATURE + intentionally-framed structures + walls) to one canvas we blit.
  _applyBiome(level) {
    const biome = biomeForLevel(level);
    this.biome = biome;
    const bossKind = (LEVELS[level - 1].boss && 'boss') || (LEVELS[level - 1].miniboss && 'miniboss');
    this.bossKind = bossKind;
    this.atmos = this.atmos || [];
    const W = this.world.w, H = this.world.h;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');

    // ground gradient
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, biome.ground[0]); grd.addColorStop(1, biome.ground[1]);
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    // scattered NATURE (flowers, grass, leaves, cracks) — looks good scattered
    if (biome.detail) biome.detail(g, W, H);

    // intentional structures, framed along the arena — never random clutter
    this.braziers = [];
    const lava = !!biome.lava, torch = biome.torch || '#ffb24a';
    // a brazier in each corner for light + framing
    const ci = 64;
    for (const [bx, by] of [[ci, ci], [W - ci, ci], [ci, H - ci], [W - ci, H - ci]]) {
      this._bakeBrazierPost(g, bx, by); this.braziers.push({ x: bx, y: by, lava, torch });
    }
    if (bossKind) this._bakeBossRoom(g, biome, W, H, bossKind, lava, torch);
    else {
      // COLONNADE light: stone fire-columns on a flagstone-aligned grid, like
      // pillars down a great hall — even, architectural pools of light. (The
      // earlier jittered ring read as random glowing clutter and patchy light.)
      const step = 620, off = (level % 2) ? step / 2 : 0;   // alternate floors shift the hall
      for (let gy = 350; gy < H - 120; gy += step) {
        for (let gx = 350; gx < W - 120; gx += step) {
          const bx = gx + off;
          if (bx > W - 120) continue;
          if (Math.hypot(bx - W / 2, gy - H / 2) < 230) continue;   // the spawn stays clear
          this._bakeTorchColumn(g, bx, gy);
          this.braziers.push({ x: bx, y: gy - 6, lava, torch });
        }
      }
      this._bakeBiomeDecor(g, biome, W, H); this._bakeScatter(g, biome, W, H, level);
      // each floor wears its biome a little differently — a faint colour cast
      const casts = ['rgba(120,80,200,0.045)', 'rgba(60,120,200,0.05)', 'rgba(200,90,60,0.04)',
        'rgba(70,170,140,0.045)', 'rgba(200,60,110,0.04)'];
      g.fillStyle = casts[level % casts.length]; g.fillRect(0, 0, W, H);
    }
    this._bakeWalls(g, biome, W, H);

    // vignette (heavier — this is a dungeon; bloodier and tighter in a boss room)
    const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * (bossKind ? 0.16 : 0.22), W / 2, H / 2, Math.max(W, H) * 0.6);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, bossKind === 'boss' ? 'rgba(26,0,2,0.72)' : (bossKind ? 'rgba(10,2,18,0.7)' : 'rgba(0,0,0,0.55)'));
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    this.bg = c;
    this.voidColor = bossKind === 'boss' ? '#0a0103' : (bossKind ? '#070210' : '#050308');
  }

  // A dedicated boss chamber: a great scorched ritual circle, a ring of braziers,
  // and a centrepiece at the head of the room (a throne for the Demon Lord, a
  // shrine of broken weapons for his Dark Knight). Threatening, ceremonial, lit.
  _bakeBossRoom(g, biome, W, H, kind, lava, torch) {
    const cx = W / 2, cy = H / 2;
    const boss = kind === 'boss';
    // a wash pooling toward the centre — cold moonlight for the Demon Lord's hall,
    // the old violet murk for the Dark Knight's shrine.
    const wash = g.createRadialGradient(cx, cy, 40, cx, cy, Math.max(W, H) * 0.6);
    wash.addColorStop(0, boss ? 'rgba(30,42,78,0.42)' : 'rgba(26,10,40,0.45)');
    wash.addColorStop(1, 'rgba(0,0,0,0.12)');
    g.fillStyle = wash; g.fillRect(0, 0, W, H);
    // a shaft of cold moonlight spilling from behind the throne, pooling on the circle
    if (boss) {
      g.save(); g.globalCompositeOperation = 'lighter';
      const moon = g.createRadialGradient(cx, 30, 4, cx, 30, 150);
      moon.addColorStop(0, 'rgba(206,222,255,0.5)'); moon.addColorStop(0.4, 'rgba(150,178,235,0.18)'); moon.addColorStop(1, 'rgba(150,178,235,0)');
      g.fillStyle = moon; g.fillRect(cx - 160, -80, 320, 230);
      const beam = g.createLinearGradient(0, 0, 0, cy + 40);
      beam.addColorStop(0, 'rgba(166,196,255,0.16)'); beam.addColorStop(1, 'rgba(166,196,255,0)');
      g.fillStyle = beam; g.beginPath(); g.moveTo(cx - 64, 0); g.lineTo(cx + 64, 0); g.lineTo(cx + W * 0.22, cy + 30); g.lineTo(cx - W * 0.22, cy + 30); g.closePath(); g.fill();
      g.restore();
    }
    // the great ritual circle worked into the floor (centred on the spawn)
    const r = Math.min(W, H) * 0.29;
    this._bakeRitualCircle(g, cx, cy, r, boss ? '#9fb6e8' : '#6a2ea0');
    // braziers set on the ring like ritual candles — cold soulfire for the throne
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * 2 * i / 6 + Math.PI / 6;
      const bx = Math.round(cx + Math.cos(a) * r), by = Math.round(cy + Math.sin(a) * r);
      this._bakeBrazierPost(g, bx, by);
      this.braziers.push({ x: bx, y: by, lava: boss ? false : lava, torch: boss ? '#aac8ff' : torch });
    }
    // the head of the room
    if (boss) this._bakeThrone(g, cx, 78);
    else this._bakeWeaponShrine(g, cx, 78);
  }

  // A scorched summoning circle: concentric rings, radial spokes & runes, and a
  // faint hexagram — glowing dim red/violet.
  _bakeRitualCircle(g, cx, cy, r, col) {
    g.save();
    g.translate(cx, cy);
    // a dark scorch under the whole sigil
    const sc = g.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.05);
    sc.addColorStop(0, 'rgba(0,0,0,0)'); sc.addColorStop(0.8, 'rgba(0,0,0,0.28)'); sc.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sc; g.beginPath(); g.arc(0, 0, r * 1.05, 0, Math.PI * 2); g.fill();
    g.shadowColor = col; g.shadowBlur = 10; g.strokeStyle = col; g.globalAlpha = 0.6;
    g.lineWidth = 3; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(0, 0, r * 0.74, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 2; g.beginPath(); g.arc(0, 0, r * 0.4, 0, Math.PI * 2); g.stroke();
    // radial spokes + rune ticks between the two outer rings
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * 2 * i / n;
      g.beginPath(); g.moveTo(Math.cos(a) * r * 0.74, Math.sin(a) * r * 0.74); g.lineTo(Math.cos(a) * r, Math.sin(a) * r); g.stroke();
      g.globalAlpha = 0.5; g.fillStyle = col;
      g.fillRect(Math.cos(a) * r * 0.87 - 2, Math.sin(a) * r * 0.87 - 2, 4, 4);
      g.globalAlpha = 0.6;
    }
    // a faint hexagram inside the inner ring
    g.lineWidth = 2; g.globalAlpha = 0.4;
    for (let t = 0; t < 2; t++) {
      g.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = Math.PI * 2 * i / 3 + t * Math.PI / 3 - Math.PI / 2;
        const x = Math.cos(a) * r * 0.4, y = Math.sin(a) * r * 0.4;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath(); g.stroke();
    }
    g.restore();
  }

  // The Demon Lord's throne: jagged black stone, a smouldering cushion, a skull
  // set at its crown. Drawn at the head of the room (x centred, y near the wall).
  _bakeThrone(g, x, y) {
    g.save();
    g.translate(x, y);
    const stone = '#161520', stoneHi = '#2a2840', stoneDk = '#09080e';
    // backrest with jagged spires
    g.fillStyle = stone; g.fillRect(-30, 0, 60, 84);
    g.fillStyle = stoneHi; g.fillRect(-30, 0, 4, 84);
    g.fillStyle = stoneDk; g.fillRect(26, 0, 4, 84);
    g.fillStyle = stone;
    for (const sx of [-30, -14, 14, 22]) { g.beginPath(); g.moveTo(sx, 0); g.lineTo(sx + 8, -18); g.lineTo(sx + 16, 0); g.closePath(); g.fill(); }
    // cold cushion, kissed by pale moonlight rather than embers
    g.shadowColor = '#9fb8ff'; g.shadowBlur = 14; g.fillStyle = '#101524'; g.fillRect(-22, 30, 44, 30); g.shadowBlur = 0;
    g.fillStyle = '#26304c'; g.fillRect(-22, 30, 44, 4);
    // arms & seat
    g.fillStyle = stone; g.fillRect(-38, 44, 12, 40); g.fillRect(26, 44, 12, 40);
    g.fillStyle = stoneDk; g.fillRect(-38, 80, 76, 6);
    // a skull set at the crown, bone gone cold
    g.fillStyle = '#cfd6e2'; g.beginPath(); g.arc(0, -6, 8, 0, Math.PI * 2); g.fill();
    g.fillRect(-6, -2, 12, 7);
    g.fillStyle = '#161520'; g.fillRect(-4, -8, 3, 4); g.fillRect(2, -8, 3, 4); g.fillRect(-1, -2, 2, 4);
    g.restore();
  }

  // The Dark Knight's shrine: a banner and a fan of broken blades driven into a
  // mound — the trophies of those who came before.
  _bakeWeaponShrine(g, x, y) {
    g.save();
    g.translate(x, y);
    // tattered banner
    g.fillStyle = '#2a0c2c'; g.fillRect(-22, 0, 44, 64);
    g.fillStyle = '#3c1240'; g.fillRect(-22, 0, 44, 5);
    g.fillStyle = '#160616'; for (let i = -18; i < 22; i += 10) g.fillRect(i, 58, 5, 8);
    // a fan of broken blades stabbed into the ground
    const blade = (ang, len) => {
      g.save(); g.rotate(ang);
      g.fillStyle = '#5a5e6a'; g.fillRect(-2, -len, 4, len);                 // blade
      g.fillStyle = '#7e828e'; g.fillRect(-2, -len, 1, len);
      g.fillStyle = '#2a2a30'; g.fillRect(-5, -6, 10, 3);                    // guard
      g.fillStyle = '#3a2a18'; g.fillRect(-1.5, -3, 3, 9);                   // grip
      g.restore();
    };
    g.translate(0, 70);
    blade(-0.5, 40); blade(-0.2, 52); blade(0.15, 46); blade(0.5, 38); blade(0.0, 30);
    g.fillStyle = '#100a0e'; g.beginPath(); g.ellipse(0, 2, 30, 8, 0, 0, Math.PI * 2); g.fill();   // mound
    g.restore();
  }

  // Biome-specific framed decoration (placed deliberately, not scattered).
  _bakeBiomeDecor(g, biome, W, H) {
    if (biome.id === 'catacomb') {
      this._bakeStatue(g, W * 0.5, 44);
      this._bakePillar(g, 40, H * 0.32); this._bakePillar(g, 40, H * 0.68);
      this._bakePillar(g, W - 40, H * 0.32); this._bakePillar(g, W - 40, H * 0.68);
    } else if (biome.id === 'crypt') {
      this._bakePillar(g, 40, H * 0.3); this._bakePillar(g, 40, H * 0.7);
      this._bakePillar(g, W - 40, H * 0.3); this._bakePillar(g, W - 40, H * 0.7);
      this._bakeBanner(g, W * 0.5, 38, '#2f5a4a');
    } else if (biome.id === 'keep') {
      this._bakeStatue(g, W * 0.5, 44);
      this._bakeBanner(g, W * 0.27, 38, '#7a2222'); this._bakeBanner(g, W * 0.73, 38, '#7a2222');
      this._bakePillar(g, 42, H * 0.32); this._bakePillar(g, 42, H * 0.68);
      this._bakePillar(g, W - 42, H * 0.32); this._bakePillar(g, W - 42, H * 0.68);
    } else if (biome.id === 'throne') {
      this._bakeStatue(g, W * 0.3, 44); this._bakeStatue(g, W * 0.7, 44);
      this._bakeBanner(g, W * 0.5, 36, '#1e2742');
    }
  }

  // Floor debris seeded per floor — flat (no collision), each piece carrying a
  // lit edge and a shadowed edge so it POPS when the blade-light sweeps across
  // it. Under Bladelight, an empty lit pool feels like nothing happened; this
  // gives the light something to discover.
  _bakeScatter(g, biome, W, H, level) {
    let s = (level * 2654435761) >>> 0;
    const R = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    const cx = W / 2, cy = H / 2;
    const n = 26 + (R() * 9 | 0);    // dense enough that the floor has TEXTURE everywhere
    for (let i = 0; i < n; i++) {
      const x = 100 + R() * (W - 200), y = 100 + R() * (H - 200);
      if (Math.hypot(x - cx, y - cy) < 140) continue;            // keep the spawn clear
      const kind = R();
      g.save(); g.translate(x | 0, y | 0);
      if (kind < 0.4) {
        // rubble cluster: tumbled stones, lit from above-left
        for (let k = 0, m = 2 + (R() * 3 | 0); k < m; k++) {
          const ox = (R() - 0.5) * 22, oy = (R() - 0.5) * 14, r = 3 + R() * 4;
          g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(ox + 1.5, oy + 2, r * 1.1, r * 0.5, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#3c3546'; g.beginPath(); g.arc(ox, oy, r, 0, Math.PI * 2); g.fill();
          g.fillStyle = 'rgba(230,238,255,0.16)'; g.beginPath(); g.arc(ox - r * 0.3, oy - r * 0.35, r * 0.55, 0, Math.PI * 2); g.fill();
        }
      } else if (kind < 0.7) {
        // a fallen grave-slab, cracked — lit top edge, sunken shadow
        const w = 18 + R() * 16, h = 10 + R() * 8, rot = (R() - 0.5) * 0.9;
        g.rotate(rot);
        g.fillStyle = 'rgba(0,0,0,0.32)'; g.fillRect(-w / 2 + 2, -h / 2 + 3, w, h);
        g.fillStyle = '#332c40'; g.fillRect(-w / 2, -h / 2, w, h);
        g.fillStyle = 'rgba(235,242,255,0.14)'; g.fillRect(-w / 2, -h / 2, w, 2);
        g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(-w * 0.2, -h / 2); g.lineTo(w * 0.1, h * 0.1); g.lineTo(-w * 0.05, h / 2); g.stroke();
      } else {
        // the fallen: a ribcage / scattered bones, pale enough to glint in the dark
        g.rotate((R() - 0.5) * 1.4);
        g.fillStyle = 'rgba(0,0,0,0.26)'; g.beginPath(); g.ellipse(1, 2, 13, 5, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#b9b2a0'; g.lineWidth = 2;
        for (let k = -2; k <= 2; k++) { g.beginPath(); g.arc(k * 4, 0, 5, Math.PI * 0.15, Math.PI * 0.85, false); g.stroke(); }
        g.fillStyle = '#c8c2b0'; g.fillRect(-12, -2, 4, 3); g.fillRect(9, -1, 5, 3);
      }
      g.restore();
    }
  }

  // A wall band hugging the arena rim, dark dungeon stone.
  _bakeWalls(g, biome, W, H) {
    const t = 28;
    const wall = biome.wall || '#211b2c', cap = biome.cap || '#332a44';
    g.fillStyle = wall;
    g.fillRect(0, 0, W, t); g.fillRect(0, H - t, W, t); g.fillRect(0, 0, t, H); g.fillRect(W - t, 0, t, H);
    // block courses on the wall
    g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 2;
    for (let x = 0; x < W; x += 46) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, t); g.moveTo(x + 23, H - t); g.lineTo(x + 23, H); g.stroke(); }
    g.fillStyle = cap;
    g.fillRect(0, t - 5, W, 5); g.fillRect(0, H - t, W, 5); g.fillRect(t - 5, 0, 5, H); g.fillRect(W - t, 0, 5, H);
    // layered ambient occlusion so the floor reads as sunken below the walls —
    // a tight dark seam, then a wide soft falloff (sells depth under Bladelight)
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(t, t, W - 2 * t, 8); g.fillRect(t, t, 8, H - 2 * t);
    g.fillRect(t, H - t - 8, W - 2 * t, 8); g.fillRect(W - t - 8, t, 8, H - 2 * t);
    g.fillStyle = 'rgba(0,0,0,0.16)';
    g.fillRect(t, t, W - 2 * t, 22); g.fillRect(t, t, 22, H - 2 * t);
    g.fillRect(t, H - t - 22, W - 2 * t, 22); g.fillRect(W - t - 22, t, 22, H - 2 * t);
    if (biome.lava) { // molten trim
      g.fillStyle = 'rgba(255,90,20,0.55)';
      g.fillRect(t, t, W - 2 * t, 2); g.fillRect(t, H - t - 2, W - 2 * t, 2);
    }
  }

  _bakeBrazierPost(g, x, y) {
    g.fillStyle = '#3a3340'; g.fillRect(x - 4, y, 8, 26);          // stand
    g.fillStyle = '#2a2530'; g.fillRect(x - 4, y, 2, 26);
    g.fillStyle = '#6b5a3a'; g.fillRect(x - 9, y - 6, 18, 8);      // bowl
    g.fillStyle = '#4a3d28'; g.fillRect(x - 9, y, 18, 2);
  }
  // A squat stone column bearing an iron fire-bowl — hall architecture, so the
  // light source reads as part of the building, not furniture dropped mid-floor.
  _bakeTorchColumn(g, x, y) {
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(x, y + 30, 16, 6, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2e2938'; g.fillRect(x - 7, y - 2, 14, 30);     // shaft
    g.fillStyle = '#403a4e'; g.fillRect(x - 7, y - 2, 3, 30);      // lit edge
    g.fillStyle = '#1f1b28'; g.fillRect(x + 4, y - 2, 3, 30);      // shadow edge
    g.fillStyle = '#4a4258'; g.fillRect(x - 9, y - 6, 18, 5);      // cap
    g.fillStyle = '#5c5066'; g.fillRect(x - 9, y - 6, 18, 1);
    g.fillStyle = '#241f30'; g.fillRect(x - 9, y + 26, 18, 4);     // base
    g.fillStyle = '#3a3340'; g.fillRect(x - 6, y - 11, 12, 6);     // iron bowl
    g.fillStyle = '#15121c'; g.fillRect(x - 6, y - 6, 12, 1);
  }
  _bakeBanner(g, x, y, col) {
    g.fillStyle = '#5a4a2a'; g.fillRect(x - 16, y - 6, 32, 3);     // pole top
    g.fillStyle = col; g.fillRect(x - 13, y - 4, 26, 46);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x - 13, y - 4, 5, 46);
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 8, y - 4, 5, 46);
    g.fillStyle = '#e9c84a'; g.fillRect(x - 3, y + 12, 6, 6);      // emblem
    g.beginPath(); g.moveTo(x - 13, y + 42); g.lineTo(x, y + 50); g.lineTo(x + 13, y + 42); g.closePath();
    g.fillStyle = col; g.fill();
  }
  _bakePillar(g, x, y) {
    g.fillStyle = '#b9b2c0'; g.fillRect(x - 11, y - 34, 22, 40);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x - 11, y - 34, 5, 40);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 6, y - 34, 5, 40);
    g.fillStyle = '#cfc8d6'; g.fillRect(x - 14, y - 38, 28, 6); g.fillRect(x - 14, y + 4, 28, 7);
  }
  _bakeTree(g, x, y) {
    g.fillStyle = '#4a3320'; g.fillRect(x - 5, y - 6, 10, 34);     // trunk
    g.fillStyle = '#3a2818'; g.fillRect(x - 5, y - 6, 3, 34);
    for (const [dx, dy, r, c] of [[0, -40, 34, '#2f6b34'], [-18, -26, 24, '#367a3c'], [18, -28, 22, '#2a5e30'], [0, -54, 24, '#3e8a44']]) {
      g.fillStyle = c; g.beginPath(); g.arc(x + dx, y + dy, r, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.arc(x - 8, y - 48, 12, 0, Math.PI * 2); g.fill();
  }
  _bakeStatue(g, x, y) {
    g.fillStyle = '#9a93a6'; g.fillRect(x - 14, y + 30, 28, 8);    // base
    g.fillStyle = '#b4adc0'; g.fillRect(x - 8, y - 6, 16, 38);     // body
    g.fillStyle = '#c7c0d2'; g.beginPath(); g.arc(x, y - 12, 8, 0, Math.PI * 2); g.fill(); // head
    g.fillStyle = '#cfc8d6'; g.fillRect(x - 12, y + 4, 24, 5);     // arms
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x + 4, y - 6, 4, 38);
  }

  // ---------- The Shrine of Blades render ----------
  _renderShrine(ctx) {
    const W = this.vw, H = this.vh, sh = this.shrine, p = this.player;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    ctx.fillStyle = this.voidColor || '#070510'; ctx.fillRect(-30, -30, W + 60, H + 60);
    if (this.shrineBg) ctx.drawImage(this.shrineBg, 0, 0);
    this._drawShrineMystique(ctx, false);   // cold high light + ground fog (under everything)
    // each blade stands in its own shaft of falling element-light
    for (const s of sh.swords) this._drawShrineShaft(ctx, s);
    for (const s of sh.swords) this._drawPedestal(ctx, s.x, s.y + 46, bladeById(s.id).color);
    // depth-sort the knight among the swords
    const list = sh.swords.map((s) => ({ s, y: s.y })); list.push({ player: true, y: p.y });
    list.sort((a, b) => a.y - b.y);
    for (const it of list) {
      if (it.player) drawSprite(ctx, p.sprite, pickFrame(p, this.time), p.x, p.y, p.faceLeft, 1);
      else this._drawShrineSword(ctx, it.s);
    }
    for (const fx of this.effects) if (fx.kind === 'puff') this._drawPuff(ctx, fx);   // landing dust
    ctx.restore();
    this._drawShrineMystique(ctx, true);    // spirit wisps + the breathing dark (over the scene)
    this._drawShrineAmbiance(ctx, sh);   // volcano / blizzard / storm weather, faded by proximity
    // labels + title (screen space; cam is at the origin so world == screen)
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (!sh.chosen) {
      ctx.globalAlpha = Math.min(1, sh.t * 1.5);
      ctx.font = 'bold 15px "Silkscreen", sans-serif'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText('TAKE UP A BLADE', W / 2, H * 0.12); ctx.fillStyle = '#e9c84a'; ctx.fillText('TAKE UP A BLADE', W / 2, H * 0.12);
      ctx.globalAlpha = 1;
      for (const s of sh.swords) {
        const bd = bladeById(s.id), isNear = sh.near === s;
        ctx.font = `bold ${isNear ? 13 : 11}px "Silkscreen", sans-serif`;
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(bd.name, s.x, s.y + 64); ctx.fillStyle = bd.color; ctx.fillText(bd.name, s.x, s.y + 64);
      }
      const n = sh.near;
      if (n) {                                            // the near blade explains itself
        const bd = bladeById(n.id);
        ctx.font = '11px "Silkscreen", sans-serif';
        for (const [li, line] of this._wrapText(bd.sig, 34).entries()) {
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
          ctx.strokeText(line, W / 2, H * 0.88 + li * 16); ctx.fillStyle = '#e7dcf2'; ctx.fillText(line, W / 2, H * 0.88 + li * 16);
        }
      }
    }
    ctx.restore();
    if (this.state === 'shrine' && !sh.chosen) this.input.draw(ctx, true);   // walking only — no sword yet
    if (this.flashScreen > 0) { ctx.save(); ctx.globalAlpha = Math.min(0.6, this.flashScreen * 2); ctx.fillStyle = '#fff7e0'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
    this._drawPlunge(ctx);               // the fall from the title camp resolves here
    this._drawTransition(ctx);
  }

  // The Shrine of Blades is a haunted place: a cold light falls from somewhere
  // far above, fog creeps along the floor, and the dead drift up to watch the
  // choosing. Two layers: under the pedestals (ray + fog), over the scene
  // (wisps + a breathing edge-dark).
  _drawShrineMystique(ctx, over) {
    const W = this.vw, H = this.vh, t = this.time;
    ctx.save();
    if (!over) {
      ctx.globalCompositeOperation = 'lighter';
      const ray = ctx.createLinearGradient(0, 0, 0, H * 0.75);
      ray.addColorStop(0, 'rgba(150,170,220,0.10)'); ray.addColorStop(1, 'rgba(150,170,220,0)');
      ctx.fillStyle = ray;
      ctx.beginPath();
      ctx.moveTo(W * 0.30, 0); ctx.lineTo(W * 0.70, 0);
      ctx.lineTo(W * 0.86, H * 0.75); ctx.lineTo(W * 0.14, H * 0.75);
      ctx.closePath(); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 3; i++) {                      // fog banks creeping across the floor
        const fy2 = H * (0.62 + i * 0.13);
        const fx2 = ((t * (7 + i * 5) + i * 240) % (W + 360)) - 180;
        ctx.fillStyle = `rgba(140,150,200,${0.045 + i * 0.012})`;
        ctx.beginPath(); ctx.ellipse(fx2, fy2, 190, 26 + i * 8, 0, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 9; i++) {                      // the dead, drifting up to watch
        const ph = (t * 0.12 + i * 0.111) % 1;
        const wx = ((i * 167.7) % W) + Math.sin(t * 0.8 + i * 2.2) * 24;
        const wy = H * (1.02 - ph);
        const a = Math.sin(ph * Math.PI) * (0.22 + (i % 3) * 0.05) * (0.6 + 0.4 * Math.sin(t * 3 + i * 1.7));
        ctx.globalAlpha = Math.max(0, a);
        ctx.fillStyle = i % 3 ? '#9fb6e8' : '#cfe0ff';
        ctx.fillRect(wx | 0, wy | 0, 2, 2);
        ctx.globalAlpha *= 0.4; ctx.fillRect(wx | 0, (wy + 3) | 0, 1, 3);
      }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      const v = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.25, W / 2, H * 0.5, Math.max(W, H) * 0.7);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, `rgba(2,2,10,${0.34 + 0.05 * Math.sin(t * 0.7)})`);
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  // The room transforms into the element of whichever blade you stand before.
  _drawShrineAmbiance(ctx, sh) {
    const amb = sh.amb; if (amb <= 0.01 || !sh.ambId) return;
    const W = this.vw, H = this.vh, t = this.time;
    ctx.save();
    if (sh.ambId === 'ember') {                                  // VOLCANO
      const g = ctx.createLinearGradient(0, H, 0, 0);
      g.addColorStop(0, `rgba(255,70,15,${0.42 * amb})`); g.addColorStop(0.45, `rgba(180,40,10,${0.16 * amb})`); g.addColorStop(1, `rgba(40,6,0,${0.1 * amb})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      // molten cracks crawling across the floor
      for (let i = 0; i < 7; i++) {
        const x = (i * 137.3) % (W - 60) + 20, y = H * 0.55 + (i * 53) % (H * 0.38), pulse = 0.5 + 0.5 * Math.sin(t * 3 + i);
        ctx.strokeStyle = `rgba(255,${(120 + 90 * pulse) | 0},30,${0.55 * amb})`; ctx.lineWidth = 2 + pulse;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 16, y + 7); ctx.lineTo(x + 30, y + 1); ctx.lineTo(x + 52, y + 11); ctx.lineTo(x + 70, y + 4); ctx.stroke();
      }
      // flame columns roaring up the side walls
      for (const sx of [16, W - 16]) for (let i = 0; i < 7; i++) {
        const fl = 0.5 + 0.5 * Math.sin(t * 8 + i * 1.3 + sx); const fy = H - i * 26 - fl * 18;
        ctx.globalAlpha = amb * (0.6 - i * 0.06); ctx.fillStyle = i % 2 ? '#ff7a2a' : '#ffce5a';
        ctx.fillRect(sx - 5 + Math.sin(t * 6 + i) * 3, fy, 8, 14);
      }
      // a storm of rising embers
      for (let i = 0; i < 60; i++) {
        const ph = (t * 0.5 + i * 0.0137) % 1, x = (i * 73.7) % W + Math.sin(t * 2 + i) * 9, y = H - ph * H * 1.05;
        ctx.globalAlpha = amb * (1 - ph) * 0.9; ctx.fillStyle = i % 2 ? '#ffb02a' : '#ff5a1e'; ctx.fillRect(x | 0, y | 0, 2, 2 + (i % 2));
      }
      // drifting ash
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 26; i++) {
        const ph = (t * 0.18 + i * 0.05) % 1, x = ((i * 91.3) + t * 14) % W, y = ph * H;
        ctx.globalAlpha = amb * 0.4; ctx.fillStyle = '#3a2a24'; ctx.fillRect(x | 0, y | 0, 2, 2);
      }
    } else if (sh.ambId === 'frost') {                           // BLIZZARD
      ctx.fillStyle = `rgba(170,215,255,${0.17 * amb})`; ctx.fillRect(0, 0, W, H);
      const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.15, W / 2, H / 2, Math.max(W, H) * 0.7);
      v.addColorStop(0, 'rgba(255,255,255,0)'); v.addColorStop(1, `rgba(228,243,255,${0.5 * amb})`);
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
      // drifting fog bands
      for (let i = 0; i < 3; i++) {
        const fy = (H * 0.3 + i * H * 0.25), fx = ((t * (18 + i * 8)) % (W + 200)) - 100;
        ctx.fillStyle = `rgba(220,238,255,${0.06 * amb})`; ctx.beginPath(); ctx.ellipse(fx, fy, 160, 30, 0, 0, Math.PI * 2); ctx.fill();
      }
      // frost crusting the floor
      ctx.fillStyle = `rgba(220,245,255,${0.14 * amb})`;
      for (let i = 0; i < 7; i++) { const x = (i * 131) % W; ctx.beginPath(); ctx.ellipse(x, H - 18 - (i % 2) * 16, 34, 9, 0, 0, Math.PI * 2); ctx.fill(); }
      // driving snow — two layers, near flakes bigger & faster
      for (let i = 0; i < 110; i++) {
        const sp = (i % 4) + 1, x = ((i * 53.3) + t * 80 * sp) % (W + 40) - 20 + Math.sin(t * 1.4 + i) * 8, y = ((i * 71.1) + t * 150 * sp) % (H + 40) - 20;
        ctx.globalAlpha = amb * (0.5 + sp * 0.12); ctx.fillStyle = '#f2ffff'; ctx.fillRect(x | 0, y | 0, sp, sp);
      }
    } else if (sh.ambId === 'storm') {                           // TEMPEST
      ctx.fillStyle = `rgba(16,10,40,${0.46 * amb})`; ctx.fillRect(0, 0, W, H);
      // two rain layers
      ctx.strokeStyle = `rgba(170,160,230,${0.45 * amb})`; ctx.lineWidth = 1;
      for (let i = 0; i < 70; i++) { const x = ((i * 61.7) + t * 130) % (W + 60) - 30, y = ((i * 47.3) + t * 540) % (H + 60) - 30; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 6, y + 16); ctx.stroke(); }
      ctx.strokeStyle = `rgba(200,190,255,${0.55 * amb})`; ctx.lineWidth = 2;
      for (let i = 0; i < 36; i++) { const x = ((i * 97.1) + t * 200) % (W + 80) - 40, y = ((i * 59.7) + t * 760) % (H + 80) - 40; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 9, y + 22); ctx.stroke(); }
      // rain spattering the floor
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 16; i++) { const x = ((i * 113 + ((t * 3) | 0) * 37) % W), a2 = (Math.sin(t * 20 + i) > 0.6) ? 0.5 : 0; ctx.globalAlpha = amb * a2; ctx.fillStyle = '#b9aaff'; ctx.fillRect(x, H - 22, 3, 1); }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      if (sh.flash > 0) {
        ctx.fillStyle = `rgba(175,140,255,${0.55 * sh.flash * amb})`; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = `rgba(235,218,255,${sh.flash * amb})`; ctx.lineWidth = 2 + 2 * sh.flash;
        let bx = sh.boltX || W * 0.5, by = 0; ctx.beginPath(); ctx.moveTo(bx, by);
        for (let s = 0; s < 7; s++) { bx += ((s * 97 + (sh.boltX | 0)) % 80 - 40) * 0.8; by += H / 7; ctx.lineTo(bx, by); }
        ctx.stroke();
        // a couple of forks
        ctx.lineWidth = 1.5; for (let f = 0; f < 2; f++) { let fx = sh.boltX + (f ? 30 : -30), fy = H * 0.4; ctx.beginPath(); ctx.moveTo(fx, fy); for (let s = 0; s < 3; s++) { fx += (f ? 14 : -14); fy += H * 0.12; ctx.lineTo(fx, fy); } ctx.stroke(); }
      }
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  // A god-ray falling from the dark onto each pedestal, in the blade's colour.
  _drawShrineShaft(ctx, s) {
    const bd = bladeById(s.id), t = this.time;
    const flick = 0.85 + 0.15 * Math.sin(t * 2.1 + s.x * 0.13);
    const topW = 13, botW = 38, by = s.y + 52;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(0, 0, 0, by);
    g.addColorStop(0, this._rgba(bd.color, 0.16 * flick));
    g.addColorStop(0.7, this._rgba(bd.color, 0.07 * flick));
    g.addColorStop(1, this._rgba(bd.color, 0.02));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(s.x - topW, 0); ctx.lineTo(s.x + topW, 0);
    ctx.lineTo(s.x + botW, by); ctx.lineTo(s.x - botW, by);
    ctx.closePath(); ctx.fill();
    // the pool of light where the ray lands
    const pg = ctx.createRadialGradient(s.x, by, 4, s.x, by, 56);
    pg.addColorStop(0, this._rgba(bd.color, 0.22 * flick)); pg.addColorStop(1, this._rgba(bd.color, 0));
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.ellipse(s.x, by, 56, 22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  _drawPedestal(ctx, x, y, col = '#9a6ce0') {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(x, y + 7, 24, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#322d42'; ctx.fillRect(x - 17, y - 7, 34, 13);
    ctx.fillStyle = '#473f5c'; ctx.fillRect(x - 17, y - 7, 34, 3);
    ctx.fillStyle = '#221d30'; ctx.fillRect(x - 13, y + 6, 26, 7);
    // a band of living runes in the blade's colour, breathing
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 2.4 + x * 0.11);
    ctx.globalAlpha = 0.55 + 0.4 * pulse;
    ctx.fillStyle = col;
    for (let i = 0; i < 4; i++) ctx.fillRect(x - 12 + i * 7, y - 2, 3, 2);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _drawShrineSword(ctx, s) {
    const sh = this.shrine, bd = bladeById(s.id), sword = Assets.bladeSwords && Assets.bladeSwords[s.id];
    const t = this.time;
    let cx = s.x, cy = s.y, alpha = 1, scale = 1.35, glowR = 44;
    if (sh.chosen) {
      if (s.id === sh.chosen) { const k = Math.min(1, sh.drawT / 0.9); cx = s.x + (this.player.x - s.x) * k; cy = (s.y) + (this.player.y - 24 - s.y) * k; scale = 1.35 - 0.55 * k; glowR = 44 + 70 * k * (1 - k); }
      else { alpha = Math.max(0, 1 - sh.drawT * 2.6); }
    }
    if (alpha <= 0) return;
    const bob = (sh.chosen === s.id) ? 0 : Math.sin(t * 1.5 + s.x * 0.05) * 4;
    const sway = Math.sin(t * 1.1 + s.x * 0.07) * 0.08;
    cy += bob;
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.5 + 0.5 * Math.sin(t * 3 + s.x);
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, glowR);
    g.addColorStop(0, this._rgba(bd.color, 0.45 + 0.2 * pulse)); g.addColorStop(1, this._rgba(bd.color, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, glowR, 0, Math.PI * 2); ctx.fill();
    // rising/falling element motes
    for (let i = 0; i < 6; i++) {
      const ph = (t * 0.5 + i * 0.17 + s.x * 0.1) % 1;
      const px = cx + Math.sin(t * 1.4 + i * 2) * 18;
      const py = s.id === 'frost' ? cy - 34 + ph * 66 : cy + 32 - ph * 66;
      ctx.globalAlpha = alpha * (1 - ph) * 0.85; ctx.fillStyle = ph < 0.5 ? '#ffffff' : bd.color;
      ctx.fillRect(Math.round(px), Math.round(py), 2, 2);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = alpha;
    if (sword) {
      const w = 30 * scale, h = 104 * scale;
      ctx.translate(cx, cy); ctx.rotate(sway); ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sword, -w / 2, -h / 2, w, h);
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  // Cinderstep's burning footprints — animated pixel flames over an ember bed.
  _drawFireTrail(ctx, fx) {
    const k = fx.t / fx.dur;
    const a = Math.min(1, fx.t * 9) * Math.min(1, (1 - k) * 2);   // snap in, fade near the end
    if (a <= 0) return;
    const seed = fx.seed || 0;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // glowing ember bed on the floor
    const r = fx.r * (0.85 - 0.35 * k);
    const g = ctx.createRadialGradient(fx.x, fx.y, 0, fx.x, fx.y, r);
    g.addColorStop(0, `rgba(255,140,40,${0.3 * a})`); g.addColorStop(0.6, `rgba(200,50,10,${0.18 * a})`); g.addColorStop(1, 'rgba(60,8,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(fx.x, fx.y, r, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    // flickering pixel flame tongues
    const t = this.time * 15 + seed, cell = 2, tongues = 6, shrink = 1 - 0.55 * k;
    for (let i = 0; i < tongues; i++) {
      const flick = 0.45 + 0.55 * Math.sin(t + i * 1.7);
      const baseX = fx.x + (i - (tongues - 1) / 2) * 3 + Math.sin(t * 0.4 + i) * 1.4;
      const cols = Math.max(2, Math.round((5 - (i % 3)) * (0.6 + 0.9 * flick) * shrink));
      for (let cY = 0; cY < cols; cY++) {
        const f = cY / cols;                                       // 0 base .. 1 tip
        const col = f < 0.28 ? '#e23a12' : f < 0.55 ? '#ff7a2a' : f < 0.82 ? '#ffce5a' : '#fff2c0';
        const w = Math.max(1, Math.round((1 - f) * 4));
        ctx.globalAlpha = a * (1 - f * 0.45);
        ctx.fillStyle = col;
        ctx.fillRect(Math.round(baseX - w / 2), Math.round(fx.y - cY * cell - 2), w, cell);
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // One flickering pixel-flame tongue (shared by burning foes, lava, eruption).
  _flameColumn(ctx, x, baseY, h, seed, alpha) {
    const t = this.time, cell = 2;
    const flick = 0.55 + 0.45 * Math.sin(t * 13 + seed) + 0.22 * Math.sin(t * 27 + seed * 1.7);
    const cols = Math.max(2, Math.round(h * (0.55 + 0.5 * Math.max(0, flick)) / cell));
    for (let c = 0; c < cols; c++) {
      const f = c / cols;
      const col = f < 0.2 ? '#d8330e' : f < 0.45 ? '#ff6a1e' : f < 0.72 ? '#ffa828' : f < 0.9 ? '#ffe06b' : '#fff6d6';
      const w = Math.max(1, Math.round((1 - f) * 4));
      const sway = Math.sin(t * 10 + c * 0.4 + seed) * (1 + f * 3);
      ctx.globalAlpha = alpha * (1 - f * 0.35);
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(x - w / 2 + sway), Math.round(baseY - c * cell), w, cell);
    }
  }

  // Detailed living flames covering a burning foe (Emberbrand).
  _drawBurning(ctx, e) {
    const t = this.time, base = e.y + 1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gr = ctx.createRadialGradient(e.x, e.y - e.r * 0.7, 2, e.x, e.y - e.r * 0.7, e.r * 1.9);
    gr.addColorStop(0, 'rgba(255,140,40,0.4)'); gr.addColorStop(0.6, 'rgba(255,60,0,0.14)'); gr.addColorStop(1, 'rgba(255,40,0,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(e.x, e.y - e.r * 0.7, e.r * 1.9, 0, Math.PI * 2); ctx.fill();
    const tongues = Math.max(4, Math.round(e.r / 2.6));
    for (let i = 0; i < tongues; i++) {
      const fx = e.x + (i / (tongues - 1) - 0.5) * e.r * 1.7;
      const h = e.r * (1.6 + 0.9 * (0.5 + 0.5 * Math.sin(t * 9 + i * 1.9)));
      this._flameColumn(ctx, fx, base, h, i * 3.1 + e.x * 0.1, 0.9);
    }
    for (let i = 0; i < 5; i++) {
      const ph = (t * 1.2 + i * 0.21 + e.x * 0.1) % 1;
      ctx.globalAlpha = (1 - ph) * 0.8; ctx.fillStyle = i % 2 ? '#ffce5a' : '#ff7a2a';
      ctx.fillRect((e.x + Math.sin(t * 3 + i) * e.r) | 0, (e.y - e.r * 0.6 - ph * e.r * 2.4) | 0, 2, 2);
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  // 🔥 the lingering lake of fire left by Eruption
  _drawLavaField(ctx, fx) {
    const k = fx.t / fx.dur, t = this.time, R = fx.r;
    const a = Math.min(1, fx.t * 3) * (k > 0.78 ? (1 - (k - 0.78) / 0.22) : 1);
    if (a <= 0) return;
    ctx.save();
    // molten pool
    ctx.globalAlpha = a;
    const g = ctx.createRadialGradient(fx.x, fx.y, 4, fx.x, fx.y, R);
    g.addColorStop(0, '#ffe49a'); g.addColorStop(0.3, '#ff7a2a'); g.addColorStop(0.7, '#c8200a'); g.addColorStop(1, 'rgba(70,8,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(fx.x, fx.y, R, R * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    // cooling-rock crust blotches drifting on the surface
    for (let i = 0; i < 8; i++) { const ang = i * 0.785 + t * 0.2, rr = R * 0.55 * ((i % 3) / 3 + 0.3); ctx.globalAlpha = a * 0.5; ctx.fillStyle = '#3a1408'; ctx.beginPath(); ctx.ellipse(fx.x + Math.cos(ang) * rr, fx.y + Math.sin(ang) * rr * 0.6, 8 + (i % 3) * 3, 5, 0, 0, Math.PI * 2); ctx.fill(); }
    // bubbling glow + flame tongues around the rim
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 12; i++) { const ph = (t * 0.6 + i * 0.09) % 1, ang = i * 2.39, rr = R * 0.72 * (0.3 + (i % 4) / 4); ctx.globalAlpha = a * (1 - Math.abs(ph - 0.5) * 2) * 0.8; ctx.fillStyle = '#ffe49a'; ctx.fillRect((fx.x + Math.cos(ang) * rr) | 0, (fx.y + Math.sin(ang) * rr * 0.6) | 0, 3, 3); }
    for (let i = 0; i < 9; i++) { const ang = (i / 9) * Math.PI * 2 + t * 0.1, rr = R * 0.8; this._flameColumn(ctx, fx.x + Math.cos(ang) * rr, fx.y + Math.sin(ang) * rr * 0.55, 14 + (i % 3) * 6, i * 2.7 + fx.x, a * 0.85); }
    this._flameColumn(ctx, fx.x, fx.y, 22, fx.x, a);
    ctx.restore(); ctx.globalAlpha = 1;
  }

  // A molten fissure cracked into the floor by the Dark Knight's slam: a dark
  // gouge with lava glowing up through it, breathing heat. Warning phase first
  // (a thin dark crack races out), then it ignites. Path baked at creation.
  _drawFissure(ctx, fx) {
    const t = this.time, pts = fx.pts;
    const warm = Math.max(0, Math.min(1, (fx.t - fx.warn) / 0.35));          // 0 = warning crack, 1 = fully molten
    const fade = fx.t > fx.dur - 1 ? Math.max(0, (fx.dur - fx.t)) : 1;       // die out over the last second
    const grow = Math.min(1, fx.t / fx.warn);                                // crack racing outward
    const nSeg = Math.max(2, Math.ceil((pts.length - 1) * grow) + 1);
    const path = () => { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < Math.min(pts.length, nSeg); i++) ctx.lineTo(pts[i].x, pts[i].y); };
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // the dark gouge in the stone
    ctx.globalAlpha = (0.5 + 0.4 * warm) * fade;
    ctx.strokeStyle = '#170703'; ctx.lineWidth = fx.w * (0.7 + 0.5 * warm); path(); ctx.stroke();
    if (warm > 0) {
      // lava glowing up through the crack, breathing
      const breathe = 0.75 + 0.25 * Math.sin(t * 5 + fx.seed);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55 * warm * fade * breathe;
      ctx.strokeStyle = '#c8200a'; ctx.lineWidth = fx.w * 0.8; path(); ctx.stroke();
      ctx.globalAlpha = 0.8 * warm * fade * breathe;
      ctx.strokeStyle = '#ff7a2a'; ctx.lineWidth = fx.w * 0.42; path(); ctx.stroke();
      ctx.globalAlpha = 0.9 * warm * fade * breathe;
      ctx.strokeStyle = '#ffe49a'; ctx.lineWidth = fx.w * 0.16; path(); ctx.stroke();
      // embers popping off the seam (deterministic per fissure via the baked seed)
      for (let i = 0; i < pts.length - 1; i++) {
        const ph = ((t * 0.7) + (fx.seed + i) * 0.37) % 1;
        const sx = pts[i].x + (pts[i + 1].x - pts[i].x) * ((fx.seed * 7 + i * 3.1) % 1);
        const sy = pts[i].y + (pts[i + 1].y - pts[i].y) * ((fx.seed * 7 + i * 3.1) % 1);
        ctx.globalAlpha = (1 - ph) * 0.8 * warm * fade;
        ctx.fillStyle = ph < 0.4 ? '#ffe49a' : '#ff7a2a';
        ctx.fillRect((sx | 0) + ((i % 2) ? 2 : -3), (sy - ph * 26) | 0, 2, 2);
      }
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  // 🔥 the eruption burst — shockwave ring + a pillar of fire
  _drawErupt(ctx, fx) {
    const k = fx.t / fx.dur, a = 1 - k, R = fx.r;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const rr = R * Math.min(1, k * 1.7);
    ctx.globalAlpha = a; ctx.lineWidth = 7 * (1 - k) + 1; ctx.strokeStyle = `rgba(255,${(210 - 130 * k) | 0},120,${a})`;
    ctx.beginPath(); ctx.ellipse(fx.x, fx.y, rr, rr * 0.62, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = `rgba(255,255,255,${a * 0.8})`; ctx.beginPath(); ctx.ellipse(fx.x, fx.y, rr * 0.88, rr * 0.62 * 0.88, 0, 0, Math.PI * 2); ctx.stroke();
    const ph = (1 - k);
    for (let i = 0; i < 6; i++) this._flameColumn(ctx, fx.x + (i - 2.5) * 9, fx.y - 2, 30 + ph * 70 - Math.abs(i - 2.5) * 8, i * 4 + fx.x, a);
    ctx.restore(); ctx.globalAlpha = 1;
  }

  // ❄️ the freezing shockwave + radiating shards
  // CATACLYSM Act I — the rolling wall of flame, drawn as a travelling ring of
  // fire with tongues riding the rim.
  _drawFireWave(ctx, fx) {
    const r = fx.t * fx.speed, k = fx.t / fx.dur, a = 1 - k * k;
    if (a <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 30; ctx.strokeStyle = `rgba(255,110,30,${0.38 * a})`;
    ctx.beginPath(); ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 12; ctx.strokeStyle = `rgba(255,210,110,${0.6 * a})`;
    ctx.beginPath(); ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 26; i++) {
      const ang = (i / 26) * Math.PI * 2 + fx.t * 0.6;
      const fl = 0.6 + 0.4 * Math.sin(this.time * 17 + i * 2.3);
      const bx = fx.x + Math.cos(ang) * r, by = fx.y + Math.sin(ang) * r;
      const len = (16 + 14 * fl) * a;
      ctx.fillStyle = i % 2 ? `rgba(255,140,40,${0.7 * a})` : `rgba(255,220,120,${0.6 * a})`;
      ctx.beginPath();
      ctx.moveTo(bx - Math.sin(ang) * 5, by + Math.cos(ang) * 5);
      ctx.lineTo(bx + Math.cos(ang) * len * 0.4, by + Math.sin(ang) * len * 0.4 - len * 0.8);
      ctx.lineTo(bx + Math.sin(ang) * 5, by - Math.cos(ang) * 5);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // CATACLYSM Act III — a pillar of flame: a tightening aim-ring, then the column.
  _drawFirePillar(ctx, fx) {
    if (fx.t < fx.warn) {
      const wk = fx.t / fx.warn, wr = 30 * (1 - wk * 0.4) + 12;
      ctx.save();
      ctx.strokeStyle = `rgba(255,120,40,${0.4 + 0.4 * wk})`; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(fx.x, fx.y, wr, wr * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(255,90,30,${0.14 * wk})`;
      ctx.beginPath(); ctx.ellipse(fx.x, fx.y, 26, 12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    const pk = (fx.t - fx.warn) / (fx.dur - fx.warn);
    const a = 1 - pk * pk;
    const h = 120 * (pk < 0.25 ? pk / 0.25 : 1);          // erupts up fast, then gutters
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g2 = ctx.createRadialGradient(fx.x, fx.y, 2, fx.x, fx.y, 56);
    g2.addColorStop(0, `rgba(255,200,110,${0.5 * a})`); g2.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = g2; ctx.beginPath(); ctx.ellipse(fx.x, fx.y, 56, 24, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    this._flameColumn(ctx, fx.x, fx.y, h, fx.x * 0.37, a);
  }

  _drawFrostNova(ctx, fx) {
    const k = fx.t / fx.dur, a = 1 - k, rr = 560 * Math.min(1, k * 1.8);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a; ctx.lineWidth = 6 * (1 - k) + 1; ctx.strokeStyle = `rgba(200,240,255,${a})`;
    ctx.beginPath(); ctx.arc(fx.x, fx.y, rr, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = `rgba(255,255,255,${a * 0.85})`; ctx.beginPath(); ctx.arc(fx.x, fx.y, rr * 0.9, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 24; i++) { const ang = i * 0.2618, ix = fx.x + Math.cos(ang) * rr * 0.92, iy = fx.y + Math.sin(ang) * rr * 0.92; ctx.globalAlpha = a * 0.85; ctx.fillStyle = '#eaffff'; ctx.save(); ctx.translate(ix, iy); ctx.rotate(ang + Math.PI / 2); ctx.fillRect(-1, -5, 2, 10); ctx.restore(); }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  // ⚡ the storm overlay covering the arena while Thunderstorm rages
  _drawStormOverlay(ctx, fx) {
    const k = fx.t / fx.dur, a = (k < 0.15 ? k / 0.15 : k > 0.8 ? (1 - k) / 0.2 : 1), W = this.vw, H = this.vh, t = this.time, ox = this.cam.x, oy = this.cam.y;
    ctx.save();
    ctx.fillStyle = `rgba(16,10,40,${0.4 * a})`; ctx.fillRect(ox, oy, W, H);
    ctx.strokeStyle = `rgba(195,182,255,${0.55 * a})`; ctx.lineWidth = 2;
    for (let i = 0; i < 80; i++) { const x = ox + ((i * 61.7) + t * 240) % (W + 60) - 30, y = oy + ((i * 47.3) + t * 980) % (H + 60) - 30; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 10, y + 24); ctx.stroke(); }
    ctx.restore();
  }

  _boltPath(ctx, x0, y0, x1, y1, seed) {
    ctx.beginPath(); ctx.moveTo(x0, y0); const segs = 9;
    for (let i = 1; i <= segs; i++) { const f = i / segs; const jx = i < segs ? Math.sin(seed + i * 1.7) * 26 * (1 - f) : 0; ctx.lineTo(x0 + (x1 - x0) * f + jx, y0 + (y1 - y0) * f); }
  }

  // ⚡ a colossal bolt crashing from the sky onto a foe
  _drawMegabolt(ctx, fx) {
    const k = fx.t / fx.dur, a = 1 - k, topY = this.cam.y - 24;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(170,140,255,${a * 0.5})`; ctx.lineWidth = 8 * a + 1; ctx.lineCap = 'round';
    this._boltPath(ctx, fx.x, topY, fx.x, fx.y, fx.seed); ctx.stroke();
    ctx.strokeStyle = `rgba(245,235,255,${a})`; ctx.lineWidth = 2.5;
    this._boltPath(ctx, fx.x, topY, fx.x, fx.y, fx.seed); ctx.stroke();
    const g = ctx.createRadialGradient(fx.x, fx.y, 0, fx.x, fx.y, 44); g.addColorStop(0, `rgba(225,205,255,${a})`); g.addColorStop(1, 'rgba(120,80,255,0)');
    ctx.globalAlpha = a; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(fx.x, fx.y, 44, 0, Math.PI * 2); ctx.fill();
    ctx.restore(); ctx.globalAlpha = 1;
  }

  _drawPickup(ctx, pk) {
    const x = pk.x, y = pk.y + Math.sin((this.titleT + pk.x * 0.05) * 4) * 2;
    ctx.save();
    if (pk.type === 'relic') {
      // a hovering relic gem with a halo + sparkle — unmistakably loot
      const pulse = 0.6 + 0.4 * Math.sin(this.time * 4);
      const g = ctx.createRadialGradient(x, y, 0, x, y, 20);
      g.addColorStop(0, `rgba(255,210,120,${0.5 * pulse})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 20, 0, Math.PI * 2); ctx.fill();
      ctx.translate(x, y); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#7a3ea0'; ctx.fillRect(-5, -5, 10, 10);
      ctx.fillStyle = '#c89aff'; ctx.fillRect(-3.5, -3.5, 7, 7);
      ctx.fillStyle = '#fff3c0'; ctx.fillRect(-3.5, -3.5, 2, 2);
      ctx.restore();
      return;
    }
    if (pk.type === 'gold') {
      const g = ctx.createRadialGradient(x, y, 0, x, y, 11);
      g.addColorStop(0, 'rgba(255,220,90,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#caa52a'; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff7d0'; ctx.fillRect(x - 2, y - 2, 1, 2);
    } else { // health
      const g = ctx.createRadialGradient(x, y, 0, x, y, 13);
      g.addColorStop(0, 'rgba(90,200,96,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5ec860'; ctx.fillRect(x - 2, y - 6, 4, 12); ctx.fillRect(x - 6, y - 2, 12, 4);
      ctx.fillStyle = '#b8ffc6'; ctx.fillRect(x - 2, y - 6, 1.5, 12);
    }
    ctx.restore();
  }

  // ---- camp room props ----
  // A deterministic torn-mouth rim (16 jagged points) for a pit centred at (cx,cy).
  _pitRim(cx, cy) {
    const rim = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const hsh = Math.sin(i * 12.9898 + 4.13) * 43758.5453;
      const j = hsh - Math.floor(hsh);
      rim.push([cx + Math.cos(a) * (80 + j * 18 - 9), cy + Math.sin(a) * (42 + ((j * 7) % 1) * 10 - 5)]);
    }
    return rim;
  }

  // THE PIT — one pit for the whole game: a torn mouth ripped in the stone (no
  // doorway), a broken-soil lip with cracks radiating out, a black throat
  // falling to a deep ember glow that swells as you near, and sparks rising.
  // Drawn entirely at frame time so the camp and the title camp look identical.
  _drawTornPit(ctx, cx, cy, t, near, rim) {
    rim = rim || this._pitRim(cx, cy);
    const trace = () => { ctx.beginPath(); rim.forEach(([x2, y2], i) => (i ? ctx.lineTo(x2, y2) : ctx.moveTo(x2, y2))); ctx.closePath(); };
    ctx.save();
    ctx.lineJoin = 'round';
    // broken-soil lip
    trace(); ctx.lineWidth = 16; ctx.strokeStyle = '#171221'; ctx.stroke();
    ctx.lineWidth = 6; ctx.strokeStyle = '#241c30'; ctx.stroke();
    // cracks radiating into the floor
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.4;
      const x0 = cx + Math.cos(a) * 86, y0 = cy + Math.sin(a) * 48;
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + Math.cos(a) * 16 + 4, y0 + Math.sin(a) * 10 - 3);
      ctx.lineTo(x0 + Math.cos(a) * 30 - 3, y0 + Math.sin(a) * 19 + 2);
      ctx.stroke();
    }
    // the black throat, falling to embers — gradients cached origin-relative
    // (per-frame gradient creation was a Chrome jank source)
    ctx.translate(cx, cy);
    const traceR = (dy = 0) => {
      ctx.beginPath();
      rim.forEach(([x2, y2], i) => (i ? ctx.lineTo(x2 - cx, y2 - cy + dy) : ctx.moveTo(x2 - cx, y2 - cy + dy)));
      ctx.closePath();
    };
    traceR();
    ctx.fillStyle = this._tGrad('pit_vg', () => {
      const gg = ctx.createLinearGradient(0, -48, 0, 44);
      gg.addColorStop(0, '#020108'); gg.addColorStop(0.55, '#0a0306'); gg.addColorStop(1, '#2e0c06');
      return gg;
    });
    ctx.fill();
    ctx.clip();
    // THE LONG DESCENT: peer in and the shaft falls away — ledge after ledge,
    // each ring tinted by the act it belongs to, down and down to a point of
    // dark where two red eyes wait. (Strata breathe; the eyes blink.)
    {
      const ACTS = ['#6b6276', '#2a6a6e', '#5a4a3a', '#4a2a7a', '#6a1a24', '#2a3a6e'];
      const breathe = Math.sin(t * 0.8) * 1.5;
      for (let i = 0; i < 6; i++) {
        const f2 = (i + 1) / 7;
        const rx2 = 64 * (1 - f2 * 0.82) + breathe * (1 - f2);
        const ry2 = 30 * (1 - f2 * 0.82);
        const dy2 = 4 + f2 * 26;
        ctx.globalAlpha = (0.20 - i * 0.024) * (0.6 + 0.4 * near);
        ctx.strokeStyle = ACTS[i]; ctx.lineWidth = 2.5 - i * 0.25;
        ctx.beginPath(); ctx.ellipse(0, dy2, rx2, ry2, 0, 0, Math.PI * 2); ctx.stroke();
      }
      // the eyes at the bottom of everything — they blink, and they see you
      const blink = ((t + 1.7) % 4.6) > 0.18;
      if (blink) {
        ctx.globalAlpha = 0.35 + 0.6 * near;
        ctx.fillStyle = '#ff2a16';
        ctx.fillRect(-4, 28, 2, 2); ctx.fillRect(2, 28, 2, 2);
        ctx.globalAlpha *= 0.4;
        ctx.fillRect(-5, 27, 4, 4); ctx.fillRect(1, 27, 4, 4);
      }
      ctx.globalAlpha = 1;
    }
    // a ledge of stone catching light just inside the rim — the depth read
    ctx.strokeStyle = 'rgba(200,190,230,0.10)'; ctx.lineWidth = 2;
    traceR(-5); ctx.stroke();
    // the ember glow far below, swelling as you draw near (alpha-driven)
    ctx.globalAlpha = 0.26 + 0.22 * near + 0.07 * Math.sin(t * 2.4);
    ctx.fillStyle = this._tGrad('pit_eg', () => {
      const gg = ctx.createRadialGradient(0, 30, 2, 0, 30, 66);
      gg.addColorStop(0, 'rgba(255,110,40,1)'); gg.addColorStop(1, 'rgba(120,30,8,0)');
      return gg;
    });
    ctx.fillRect(-84, -30, 168, 84);
    // sparks rising out of the throat
    for (let i = 0; i < 8; i++) {
      const ph = (t * 0.4 + i * 0.125) % 1;
      const ex = Math.sin(t * 1.3 + i * 2.4) * (34 - ph * 12);
      const ey = 26 - ph * 60;
      ctx.globalAlpha = (1 - ph) * (0.4 + 0.6 * near);
      ctx.fillStyle = i % 2 ? '#ff9a4a' : '#ffd36b';
      ctx.fillRect(ex, ey, 2, 2);
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  _drawDescentPit(ctx, d, t) {
    const p = this.player || (this.state === 'title' ? this.titleKnight : null);
    const near = p ? Math.max(0, 1 - Math.hypot(p.x - d.x, p.y - d.y) / 180) : 0;
    this._drawTornPit(ctx, d.x, d.y, t, near);
  }

  _drawCampFloor(ctx) {
    const t = this.camp.t;
    this._drawDescentPit(ctx, this.camp.door, t);

    // the sorcerer's table
    const s = this.camp.sorcerer, tx = s.x, ty = s.y + 20;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(tx, ty + 8, 30, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a3320'; ctx.fillRect(tx - 26, ty - 4, 52, 12);       // top
    ctx.fillStyle = '#33230f'; ctx.fillRect(tx - 26, ty + 4, 52, 4);
    ctx.fillStyle = '#3a2818'; ctx.fillRect(tx - 22, ty + 8, 4, 12); ctx.fillRect(tx + 18, ty + 8, 4, 12); // legs
    // wares on the table: candle + potions
    ctx.fillStyle = '#caa54a'; ctx.fillRect(tx - 20, ty - 9, 3, 5);
    const fl = 0.6 + 0.4 * Math.sin(t * 9);
    ctx.fillStyle = `rgba(255,180,80,${fl})`; ctx.fillRect(tx - 19, ty - 12, 1, 3);
    ctx.fillStyle = '#7fe0a0'; ctx.fillRect(tx - 4, ty - 9, 4, 5);          // green potion
    ctx.fillStyle = '#e06a9a'; ctx.fillRect(tx + 10, ty - 8, 4, 4);        // pink potion
    ctx.restore();

    // the event shrine (the third path)
    if (this.camp.shrine && !this.camp.eventUsed) this._drawShrine(ctx, this.camp.shrine, this.camp.event);
  }

  _drawShrine(ctx, sh, ev) {
    const t = this.camp.t, pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
    const col = ev.color || '#b06bff';
    const x = sh.x, y = sh.y;
    ctx.save();
    // ground glow
    const g = ctx.createRadialGradient(x, y - 6, 3, x, y - 6, 56);
    g.addColorStop(0, this._rgba(col, 0.4 + 0.25 * pulse)); g.addColorStop(1, this._rgba(col, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - 6, 56, 0, Math.PI * 2); ctx.fill();
    // shadow + stone plinth
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y + 12, 22, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a3446'; ctx.fillRect(x - 16, y + 2, 32, 12);        // base
    ctx.fillStyle = '#4a4458'; ctx.fillRect(x - 13, y - 10, 26, 14);       // pillar
    ctx.fillStyle = '#2a2636'; ctx.fillRect(x - 13, y + 2, 26, 2);
    // a floating rune-stone / sigil bobbing above
    const ry = y - 24 + Math.sin(t * 2) * 2.5;
    ctx.fillStyle = this._rgba(col, 0.9);
    ctx.save(); ctx.translate(x, ry); ctx.rotate(t * 0.6);
    ctx.fillRect(-7, -7, 14, 14);
    ctx.fillStyle = '#100a18'; ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();
    // its glow
    const og = ctx.createRadialGradient(x, ry, 0, x, ry, 16 + pulse * 4);
    og.addColorStop(0, this._rgba(col, 0.7)); og.addColorStop(1, this._rgba(col, 0));
    ctx.fillStyle = og; ctx.beginPath(); ctx.arc(x, ry, 16 + pulse * 4, 0, Math.PI * 2); ctx.fill();
    // rising motes
    for (let i = 0; i < 3; i++) {
      const my = y - ((t * 22 + i * 16) % 44);
      ctx.fillStyle = this._rgba(col, 0.6 * pulse);
      ctx.fillRect(x - 10 + ((i * 7 + t * 9) % 20), my, 2, 2);
    }
    ctx.restore();
  }

  _drawSorcerer(ctx, s) {
    const t = this.camp.t;
    // arcane aura
    ctx.save();
    const aur = ctx.createRadialGradient(s.x, s.y - 14, 2, s.x, s.y - 14, 40);
    aur.addColorStop(0, `rgba(150,110,230,${0.3 + 0.1 * Math.sin(t * 2)})`);
    aur.addColorStop(1, 'rgba(120,80,200,0)');
    ctx.fillStyle = aur; ctx.beginPath(); ctx.arc(s.x, s.y - 14, 40, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    const frame = (t % 1.4) < 0.7 ? 'idle' : 'walkA';
    drawSprite(ctx, 'sorcerer', frame, s.x, s.y - Math.sin(t * 2) * 1.5, true, 1.5);
    // floating orb above his hand
    const ox = s.x - 12, oy = s.y - 22 + Math.sin(t * 3) * 2;
    ctx.save();
    const og = ctx.createRadialGradient(ox, oy, 0, ox, oy, 7);
    og.addColorStop(0, '#e9d8ff'); og.addColorStop(0.6, '#9a6ce0'); og.addColorStop(1, 'rgba(120,80,200,0)');
    ctx.fillStyle = og; ctx.beginPath(); ctx.arc(ox, oy, 7, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  _drawCampLabels(ctx) {
    const t = this.camp.t, c = this.camp;
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const label = (text, x, y, col, glow) => {
      ctx.font = 'bold 13px "Silkscreen", sans-serif';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(text, x, y); ctx.fillStyle = col; ctx.fillText(text, x, y);
    };
    const bob = Math.sin(t * 2.5) * 2;
    label('The Sorcerer', c.sorcerer.x, c.sorcerer.y - 94 + bob, '#9af0ff');
    label('Descend ▾', c.door.x, c.door.y - 72 + bob, '#ffb487');
    if (c.shrine && !c.eventUsed) label('? ? ?', c.shrine.x, c.shrine.y - 52 + bob, c.event.color || '#c8a8ff');
    ctx.restore();
  }

  // ---------- flow ----------
  // Return to the title. Must reset the game state (not just the DOM) so the
  // canvas renders the title camp again — otherwise the last scene (e.g. the
  // victory) shows through behind the menu.
  toTitle() {
    this.state = 'title';
    this.player = null;
    this.enemies = []; this.projectiles = []; this.allyProjectiles = []; this.effects = []; this.pickups = [];
    this.interlude = null; this.interludeFade = null; this.introCut = null; this.campToast = null;
    this.intro = null; this.sweep = null; this.transition = null; this.camp = null; this.bossKind = null;
    this.watchers = []; this.campWhisper = null;
    this.plunge = null; this.camDrop = 0; this.descentJump = null;   // an in-flight fall must not hijack the menu
    this.titleCamp = null;       // rebuild fresh — the knight wakes by his fire again
    this.ui.showScreen('title');
    Sound.setScene('title');
  }

  // ---------- THE TITLE CAMP ----------
  // The menu IS a place: the knight's last camp at the pit mouth. He can walk.
  // The PIT is Begin; a violet SOUL BRAZIER is the Sanctum; a torn BANNER is
  // the Bargain (prologue). Walk close and the choice offers itself.
  _buildTitleCamp() {
    // The camp is COMPOSED for a phone-sized stage. On big viewports (desktop)
    // we build the same stage at logical size and scale it up — otherwise the
    // knight is a 38px black speck lost in a 2000px window.
    const SC = Math.max(1, Math.min(2.2, this.vh / 700));
    const W = Math.round(this.vw / SC), H = Math.round(this.vh / SC);
    const ox = Math.round(this.world.w / 2 - W / 2);
    const oy = Math.round(this.world.h / 2 - H / 2);
    const wallH = Math.round(H * 0.24);                  // the logo hangs over this dark wall
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');

    // floor: cold stone, warmed near where the fire will sit
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#241e30'); grd.addColorStop(1, '#151019');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    // flagstones (offset brick courses, per-stone shade, dark seams)
    const TS = 56;
    let s = 77;
    const R = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let ty = wallH - TS; ty < H; ty += TS) {
      const rowOff = (Math.floor(ty / TS) % 2) * (TS / 2);
      for (let tx = -TS; tx < W + TS; tx += TS) {
        const x = tx + rowOff, sh = (R() - 0.5) * 0.10;
        g.fillStyle = `rgba(${sh > 0 ? '255,255,255' : '0,0,0'},${Math.abs(sh)})`;
        g.fillRect(x, ty, TS, TS);
        g.fillStyle = 'rgba(0,0,0,0.34)'; g.fillRect(x, ty, TS, 2); g.fillRect(x, ty, 2, TS);
        g.fillStyle = 'rgba(255,255,255,0.045)'; g.fillRect(x + 2, ty + 2, TS - 2, 1);
        if (R() < 0.1) { g.fillStyle = 'rgba(90,140,110,0.18)'; g.fillRect(x + 6 + R() * 30, ty + 8 + R() * 30, 5, 3); }   // moss
        if (R() < 0.07) { g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1; g.beginPath();
          const cx2 = x + 10 + R() * 30, cy2 = ty + 8 + R() * 34;
          g.moveTo(cx2, cy2); g.lineTo(cx2 + 8, cy2 + 7); g.lineTo(cx2 + 5, cy2 + 15); g.stroke(); }   // crack
      }
    }
    // the back wall (logo zone): coursed dark brick with a worn lit lip
    g.fillStyle = '#120d1a'; g.fillRect(0, 0, W, wallH);
    for (let by = 8; by < wallH - 8; by += 16) {
      g.fillStyle = 'rgba(255,255,255,0.026)'; g.fillRect(0, by, W, 1);
      const off2 = (Math.floor(by / 16) % 2) * 22;
      g.fillStyle = 'rgba(0,0,0,0.35)';
      for (let bx = off2; bx < W; bx += 44) g.fillRect(bx, by, 1, 16);
    }
    g.fillStyle = 'rgba(190,170,220,0.10)'; g.fillRect(0, wallH - 2, W, 2);   // the lip catches light
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, wallH, W, 7);              // its cast shadow
    // roots hang from the ceiling of the world above — the weight overhead
    {
      let rs = 31;
      const RR = () => (rs = (rs * 1664525 + 1013904223) >>> 0) / 4294967296;
      for (let i = 0; i < 7; i++) {
        const rx = 20 + RR() * (W - 40), len = 8 + RR() * 18, sway = RR() < 0.5 ? -1 : 1;
        g.strokeStyle = 'rgba(6,4,10,0.85)'; g.lineWidth = 2 + RR() * 1.5; g.lineCap = 'round';
        g.beginPath(); g.moveTo(rx, wallH - 2);
        g.quadraticCurveTo(rx + sway * 3, wallH + len * 0.6, rx + sway * (2 + RR() * 4), wallH + len);
        g.stroke();
        if (RR() < 0.5) { g.beginPath(); g.moveTo(rx + sway, wallH + len * 0.4); g.lineTo(rx + sway * 6, wallH + len * 0.7); g.stroke(); }
      }
    }
    // THE WALL REMEMBERS: a tally scratched into the stone for every death —
    // groups of five, like a prisoner counting. No label. Those who notice, feel it.
    {
      const deaths = Math.min(40, (this.meta && this.meta.deaths) || 0);
      const tx0 = 26, ty0 = wallH - 26;
      g.strokeStyle = 'rgba(196,186,214,0.30)'; g.lineWidth = 1.5; g.lineCap = 'round';
      for (let i = 0; i < deaths; i++) {
        const grp = (i / 5) | 0, k2 = i % 5;
        const gx = tx0 + grp * 24, gy = ty0 + (grp % 2) * 1.5;
        g.beginPath();
        if (k2 < 4) { g.moveTo(gx + k2 * 4, gy); g.lineTo(gx + k2 * 4 + 1, gy + 11); }
        else { g.moveTo(gx - 2, gy + 9); g.lineTo(gx + 14, gy + 2); }   // the fifth slashes the four
        g.stroke();
      }
    }
    // side + bottom walls (thin frame)
    g.fillStyle = '#120d1a';
    g.fillRect(0, wallH, 14, H - wallH); g.fillRect(W - 14, wallH, 14, H - wallH); g.fillRect(0, H - 16, W, 16);

    // ---- staging ----
    // Asymmetry is DELIBERATE here: the brazier is a free-standing thing on the
    // floor (low-left); the banner is architecture, mounted ON the wall
    // (high-right). Different heights, different contexts — never "almost level".
    const fire = { x: ox + W * 0.5, y: oy + H * 0.55 };
    // the pit sits well INSIDE the view and big — a new player's eye should land
    // on it without scrolling their thumb anywhere
    const pit = { x: ox + W * 0.5, y: oy + H * 0.79 };
    const brazier = { x: ox + Math.max(64, W * 0.17), y: oy + H * 0.42 };
    const banner = { x: ox + Math.min(W - 64, W * 0.82), y: oy + H * 0.56 };   // a standard PLANTED on the floor
    // fire pit: scorched earth + a circle of stones (the flame itself is live pixel art)
    const fx = fire.x - ox, fy = fire.y - oy;
    const ch = g.createRadialGradient(fx, fy, 2, fx, fy, 40);
    ch.addColorStop(0, 'rgba(10,6,4,0.55)'); ch.addColorStop(1, 'rgba(10,6,4,0)');
    g.fillStyle = ch; g.beginPath(); g.ellipse(fx, fy, 40, 18, 0, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2, rx = fx + Math.cos(a) * 26, ry = fy + Math.sin(a) * 12;
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.ellipse(rx + 1, ry + 2, 5, 2.5, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = i % 2 ? '#403a4e' : '#332d40'; g.beginPath(); g.arc(rx, ry, 4, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.arc(rx - 1, ry - 1.5, 1.6, 0, Math.PI * 2); g.fill();
    }
    // the log he keeps his watch on — square to the fire, just south of it,
    // bark, knots and a sawn end-grain face (it must READ as a log)
    {
      const lx = fx, ly = fy + 38;
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(lx, ly + 8, 38, 7, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#4a3018'; g.fillRect(lx - 34, ly - 7, 68, 15);            // trunk
      g.fillStyle = '#5d3d20'; g.fillRect(lx - 34, ly - 7, 68, 5);             // top catches the firelight
      g.fillStyle = '#33200f'; g.fillRect(lx - 34, ly + 5, 68, 3);             // belly shadow
      g.fillStyle = 'rgba(0,0,0,0.30)';                                       // bark grooves
      for (let bxx = -28; bxx <= 26; bxx += 9) g.fillRect(lx + bxx, ly - 6, 2, 13);
      g.fillStyle = '#2a1a0c'; g.beginPath(); g.ellipse(lx - 10, ly - 1, 3, 2, 0, 0, Math.PI * 2); g.fill();   // knot
      // sawn end-grain (right end): pale face + growth rings
      g.fillStyle = '#8a6a42'; g.beginPath(); g.ellipse(lx + 34, ly + 0.5, 5, 7.5, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#6b4e2c'; g.lineWidth = 1;
      g.beginPath(); g.ellipse(lx + 34, ly + 0.5, 3, 5, 0, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#5d3d20'; g.fillRect(lx + 33, ly, 2, 2);                  // heartwood
    }
    // the soul brazier (Sanctum), free-standing on the floor
    this._bakeTorchColumn(g, brazier.x - ox, brazier.y - oy);
    // …raised into a proper SOUL ALCOVE: a carved arch sheltering the flame,
    // votive candles at its feet — the Sanctum reads as a shrine, not a lamp
    {
      const ax = brazier.x - ox, ay = brazier.y - oy;
      g.save();
      g.strokeStyle = '#3a3448'; g.lineWidth = 5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(ax - 22, ay + 6); g.lineTo(ax - 22, ay - 34);
      g.quadraticCurveTo(ax, ay - 56, ax + 22, ay - 34); g.lineTo(ax + 22, ay + 6); g.stroke();
      g.strokeStyle = 'rgba(120,108,150,0.35)'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(ax - 22, ay - 34); g.quadraticCurveTo(ax, ay - 56, ax + 22, ay - 34); g.stroke();
      // rune dots along the arch
      g.fillStyle = 'rgba(176,107,255,0.5)';
      for (const [rx2, ry2] of [[-18, -30], [-9, -42], [0, -46], [9, -42], [18, -30]]) g.fillRect(ax + rx2 - 1, ay + ry2 - 1, 2, 2);
      // votive candles
      for (const [cx2, ch2] of [[-16, 5], [14, 7], [20, 4]]) {
        g.fillStyle = '#cfc6b8'; g.fillRect(ax + cx2 - 1, ay + 8 - ch2, 3, ch2);
        g.fillStyle = '#7a7468'; g.fillRect(ax + cx2 - 1, ay + 8, 3, 1);
      }
      g.restore();
    }
    // the campaign standard (the Bargain) — now a shrine corner: a kneeler
    // stone and candles before it, a place he has knelt many times
    {
      const bnx = banner.x - ox, bny = banner.y - oy;
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(bnx, bny + 4, 15, 5, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3a3446'; g.fillRect(bnx - 7, bny - 2, 14, 6);             // stone footing
      g.fillStyle = '#262232'; g.fillRect(bnx - 7, bny + 2, 14, 2);
      g.fillStyle = '#4a3018'; g.fillRect(bnx - 2, bny - 84, 4, 84);            // staff
      g.fillStyle = '#5d3d20'; g.fillRect(bnx - 2, bny - 84, 2, 84);
      g.fillStyle = '#6b5a3a'; g.fillRect(bnx - 4, bny - 88, 8, 5);             // finial
      this._bakeBanner(g, bnx, bny - 76, '#4e1d22');                            // crossbar + torn cloth
      // the kneeler: a worn flat stone before the standard
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(bnx - 26, bny + 14, 16, 6, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#332e42'; g.fillRect(bnx - 38, bny + 8, 24, 9);
      g.fillStyle = '#454058'; g.fillRect(bnx - 38, bny + 8, 24, 3);
      // two small candles by the foot
      for (const [cx2, ch2] of [[14, 6], [19, 4]]) {
        g.fillStyle = '#cfc6b8'; g.fillRect(bnx + cx2, bny - ch2 + 2, 3, ch2);
        g.fillStyle = '#7a7468'; g.fillRect(bnx + cx2, bny + 2, 3, 1);
      }
    }
    // THE ARMORY RACK — two shrouded silhouettes wait for hands that haven't
    // come yet (the Rogue's daggers, the Paladin's hammer). No label. Locked.
    {
      const rx = ox + Math.min(W - 60, W * 0.84), ry = oy + wallH + 64;
      const lx = rx - ox, ly = ry - oy;
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(lx, ly + 26, 26, 6, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#4a3018'; g.fillRect(lx - 24, ly - 26, 4, 52); g.fillRect(lx + 20, ly - 26, 4, 52);   // posts
      g.fillStyle = '#5d3d20'; g.fillRect(lx - 24, ly - 26, 2, 52); g.fillRect(lx + 20, ly - 26, 2, 52);
      g.fillStyle = '#4a3018'; g.fillRect(lx - 24, ly - 22, 48, 4); g.fillRect(lx - 24, ly + 14, 48, 4);   // rails
      // the daggers (crossed) and the hammer — near-black shapes, faintly edged
      g.save(); g.translate(lx - 10, ly - 2);
      g.rotate(0.5); g.fillStyle = '#16121f'; g.fillRect(-2, -13, 4, 24);
      g.rotate(-1.0); g.fillStyle = '#16121f'; g.fillRect(-2, -13, 4, 24);
      g.restore();
      g.fillStyle = '#16121f'; g.fillRect(lx + 8, ly - 16, 5, 26); g.fillRect(lx + 2, ly - 18, 17, 9);     // hammer
      g.strokeStyle = 'rgba(140,130,160,0.22)'; g.lineWidth = 1;
      g.strokeRect(lx + 2.5, ly - 17.5, 16, 8);
      // a small padlock on the rail
      g.fillStyle = '#6b5a3a'; g.fillRect(lx - 3, ly + 16, 6, 5);
      g.strokeStyle = '#6b5a3a'; g.lineWidth = 1.5; g.beginPath(); g.arc(lx, ly + 16, 3, Math.PI, 0); g.stroke();
    }
    // his bedroll, west of the fire — and a supply sack + whetstone by the log
    {
      const bx2 = fx - 78, by2 = fy + 14;
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(bx2, by2 + 7, 28, 7, 0, 0, Math.PI * 2); g.fill();
      g.save(); g.translate(bx2, by2); g.rotate(-0.10);
      g.fillStyle = '#4e1d22'; g.fillRect(-26, -8, 52, 15);
      g.fillStyle = '#6b2a30'; g.fillRect(-26, -8, 52, 4);
      g.fillStyle = '#33141a'; g.fillRect(-26, 5, 52, 2);
      g.fillStyle = '#8a8296'; g.fillRect(18, -7, 8, 13);
      g.restore();
      g.fillStyle = '#5a4a30'; g.beginPath(); g.ellipse(fx + 46, fy + 40, 8, 9, -0.2, 0, Math.PI * 2); g.fill();   // sack
      g.fillStyle = '#6e5c3c'; g.beginPath(); g.ellipse(fx + 46, fy + 34, 5, 4, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3a3140'; g.fillRect(fx - 46, fy + 44, 10, 5);                                               // whetstone
      g.fillStyle = '#55495e'; g.fillRect(fx - 46, fy + 44, 10, 2);
    }
    // a cooking spit over the fire: forked sticks + crossbar + a small pot
    {
      g.fillStyle = '#4a3018';
      g.fillRect(fx - 24, fy - 34, 3, 36); g.fillRect(fx + 21, fy - 34, 3, 36);
      g.fillRect(fx - 27, fy - 38, 9, 3); g.fillRect(fx + 18, fy - 38, 9, 3);   // forks
      g.fillRect(fx - 24, fy - 36, 48, 3);                                     // crossbar
      g.fillStyle = '#2b2733'; g.fillRect(fx - 5, fy - 33, 10, 8);             // the pot
      g.fillStyle = '#454052'; g.fillRect(fx - 5, fy - 33, 10, 2);
      g.fillStyle = '#1c1923'; g.fillRect(fx - 1, fy - 36, 2, 3);              // its hook
    }
    // THE BROKEN SEAL: the pit didn't open — it BURST through a great carved
    // ward. Shattered ring arcs + runes + snapped chains from anchor stones.
    {
      const px3 = pit.x - ox, py3 = pit.y - oy;
      g.save(); g.translate(px3, py3);
      g.strokeStyle = 'rgba(150,140,180,0.20)'; g.lineWidth = 3;
      for (const [a0, a1] of [[0.3, 1.2], [1.7, 2.6], [3.1, 4.3], [4.8, 5.9]]) {   // broken ring
        g.beginPath(); g.ellipse(0, 0, 118, 66, 0, a0, a1); g.stroke();
      }
      g.fillStyle = 'rgba(150,140,180,0.22)';
      for (let i = 0; i < 10; i++) {                                               // ward runes
        const a = (i / 10) * Math.PI * 2 + 0.31;
        if (i % 3 === 0) continue;                                                 // gaps where it shattered
        g.fillRect(Math.cos(a) * 105 - 2, Math.sin(a) * 59 - 2, 4, 4);
      }
      // snapped chains: links trailing from anchor stones, torn at the rim
      for (const ca of [0.6, 2.4, 4.1]) {
        const ax2 = Math.cos(ca) * 150, ay2 = Math.sin(ca) * 86;
        g.fillStyle = '#3a3446'; g.fillRect(ax2 - 6, ay2 - 5, 12, 10);             // anchor stone
        g.fillStyle = '#262232'; g.fillRect(ax2 - 6, ay2 + 2, 12, 3);
        g.strokeStyle = '#55495e'; g.lineWidth = 2;
        const n2 = 5;
        for (let li = 0; li < n2; li++) {                                          // chain links
          const f2 = li / n2, gx2 = ax2 * (1 - f2) + Math.cos(ca) * 92 * f2, gy2 = ay2 * (1 - f2) + Math.sin(ca) * 52 * f2;
          g.beginPath(); g.ellipse(gx2, gy2, 4, 2.6, ca, 0, Math.PI * 2); g.stroke();
        }
        g.beginPath(); g.ellipse(Math.cos(ca) * 88, Math.sin(ca) * 50, 4, 2.6, ca, 0.8, Math.PI * 1.6); g.stroke();   // the torn link
      }
      g.restore();
    }
    // THE PIT rim is computed in WORLD coords (the torn mouth is drawn live in
    // _drawTornPit so the camp and title pit are byte-identical).
    const pitRim = this._pitRim(pit.x, pit.y);
    // vignette
    const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    this.titleBg = c;
    // pre-scale the bake ONCE: the per-frame background cost becomes a flat 1:1
    // blit (Chrome re-rasterizes a transform-scaled blit every frame — that was
    // leap jank #1)
    const bs = document.createElement('canvas');
    bs.width = Math.max(1, this.vw); bs.height = Math.max(1, this.vh);
    const bg2 = bs.getContext('2d');
    bg2.imageSmoothingEnabled = false;
    bg2.drawImage(c, 0, 0, W, H, 0, 0, bs.width, bs.height);
    this.titleBgScreen = bs;
    this._titleGrads = new Map();          // per-frame gradients, created ONCE (jank #2)

    this.titleCamp = {
      ox, oy, t: 0, sizeKey: this.vw + 'x' + this.vh, scale: SC,
      fire, pit, brazier, banner,
      pitRim,                              // already world coords (see _pitRim)
      parts: [],                           // live fire embers
      smoke: [],                           // woodsmoke puffs climbing off the flame
      rumbleT: 7 + Math.random() * 6,      // the deep below breathes (periodic tremor)
      rumble: 0,
      glanceT: 4 + Math.random() * 4,      // the knight looks around while idle
      prompt: null, jump: null, sink: 0, sunk: false,
      bounds: { minX: ox + 44, maxX: ox + W - 44, minY: oy + wallH + 30, maxY: oy + H - 42 },
      spawn: { x: fire.x + 10, y: fire.y + 62 },   // where he boots up (and crash-lands)
      // THE COLD OPEN (first boot only): the knight alone in the black FALLS in
      // from above, eats dirt, picks himself up frame by frame; flint is struck;
      // the fire catches, ROARS, and its light reveals the camp — then the
      // title drops from above and locks in. Tap to skip.
      intro: this._titleIntroPlayed ? null
        : { t: 0, LAND: 0.55, RISE: 1.5, STRIKE: 2.7, IGNITE: 3.45, TITLE: 4.0, END: 4.5, landed: false, burst: false, titleDropped: false },
    };
    this._titleIntroPlayed = true;
    this._tapped = false;
    // he rises from his seat on the log
    this.titleKnight = { x: fire.x + 10, y: fire.y + 62, sprite: 'knight',
      moving: false, faceLeft: false, attackAnim: 0 };
  }

  _updateTitleCamp(dt) {
    const key = this.vw + 'x' + this.vh;
    if (!this.titleCamp || this.titleCamp.sizeKey !== key) this._buildTitleCamp();
    const tc = this.titleCamp; tc.t += dt;
    // a DOM panel (the Sanctum) is open: hold the camp, hide the prompt
    if (this.ui.screenOpen && this.ui.screenOpen !== 'title') {
      if (tc.prompt) { tc.prompt = null; this.ui.setTitlePrompt(null); }
      return;
    }
    // the cold open: no control until the fire has spoken
    if (tc.intro) {
      const iv = tc.intro;
      // The open WANTS the hero's sheet for his big reveal, so it holds while a
      // cold CDN streams it in — but NEVER forever: after a short wait (or any
      // tap) it plays regardless, so a slow/failed sprite can't brick the menu.
      iv.wait = (iv.wait || 0) + dt;
      if (!Assets.images.knight && iv.wait < 3 && !this._tapped) return;
      iv.t += dt;
      if (this._tapped) {                                       // tap = skip
        this._tapped = false; iv.t = Math.max(iv.t, 99);
        const k0 = this.titleKnight;
        k0.pose = null; k0.x = tc.spawn.x; k0.y = tc.spawn.y;
        iv.landed = true;
      }
      // THE PRATFALL: he drops out of the black, lands flat on his face, lies
      // there a stunned beat, then peels himself up pose by pose. Castle
      // Crashers school — the comedy lands BEFORE the fire does.
      {
        const k = this.titleKnight, sp = tc.spawn;
        if (iv.t < iv.LAND) {
          // gravity owns him: slow at first, then ALL AT ONCE
          if (iv.drop === undefined) iv.drop = Math.max(120, sp.y - tc.oy + 44);
          const f = Math.max(0, iv.t) / iv.LAND;
          k.x = sp.x;
          k.y = sp.y - iv.drop * (1 - f * f);
          k.pose = (Math.floor(iv.t * 16) % 2) ? 'walkA' : 'walkB';   // limbs flailing
          k.faceLeft = false;
        } else if (iv.landed) {
          // face-down → one stir → pushup → kneel → a knight again
          if (iv.t < iv.RISE) {
            k.pose = 'prone';
            // the body gives one small bounce off the dirt, then settles
            const bt = (iv.t - iv.LAND) / 0.16;
            k.y = sp.y - (bt < 1 ? Math.sin(bt * Math.PI) * 5 : 0);
            k.x = sp.x + ((iv.t > 1.08 && iv.t < 1.2) ? 1 : 0);   // a twitch: he lives
          } else if (iv.t < iv.RISE + 0.3) k.pose = 'pushup';
          else if (iv.t < iv.RISE + 0.6) k.pose = 'kneel';
          else if (iv.t >= iv.STRIKE - 0.25 && iv.t < iv.IGNITE + 0.3) {
            k.pose = 'kneel';                             // down on a knee to work the flint
          } else if (k.pose) {
            k.pose = null;
            if (!iv.dusted) {
              iv.dusted = true;
              for (let i = 0; i < 6; i++) tc.parts.push({   // dirt shaken off the plate
                x: sp.x + (Math.random() - 0.5) * 14, y: sp.y - 6 - Math.random() * 20,
                vx: (Math.random() - 0.5) * 26, vy: 6 + Math.random() * 18,
                life: 0, dur: 0.3 + Math.random() * 0.3, col: '#8d8699',
              });
            }
          }
        } else {
          // IMPACT. The whole dark feels it.
          iv.landed = true;
          k.x = sp.x; k.y = sp.y; k.pose = 'prone';
          Sound.play('hit', { vol: 1.25 }); Sound.play('hurt', { vol: 0.7 });
          this.shake = Math.max(this.shake, 9);
          for (let i = 0; i < 14; i++) tc.parts.push({   // a ring of kicked-up dust
            x: sp.x + (Math.random() - 0.5) * 34, y: sp.y - 1 - Math.random() * 4,
            vx: (Math.random() - 0.5) * 90, vy: -(12 + Math.random() * 42),
            life: 0, dur: 0.35 + Math.random() * 0.45, col: '#9a93a8',
          });
        }
      }
      if (iv.t >= iv.IGNITE && !iv.burst) {
        iv.burst = true;
        Sound.play('swing_ember', { vol: 1.3 }); Sound.play('explode', { vol: 0.22 });
        this.shake = Math.max(this.shake, 6);
        for (let i = 0; i < 14; i++) tc.parts.push({
          x: tc.fire.x + (Math.random() - 0.5) * 20, y: tc.fire.y - 8,
          vx: (Math.random() - 0.5) * 60, vy: -(50 + Math.random() * 80),
          life: 0, dur: 0.5 + Math.random() * 0.6, hot: Math.random() < 0.6,
        });
      }
      if (iv.t >= iv.IGNITE && Math.random() < dt * 16) tc.parts.push({
        x: tc.fire.x + (Math.random() - 0.5) * 16, y: tc.fire.y - 8,
        vx: (Math.random() - 0.5) * 12, vy: -(26 + Math.random() * 34),
        life: 0, dur: 0.8 + Math.random() * 0.7, hot: Math.random() < 0.5,
      });
      if (iv.t >= iv.TITLE && !iv.titleDropped) { iv.titleDropped = true; this.ui.titleEnter(); }
      if (iv.t >= iv.END) { if (!iv.titleDropped) this.ui.titleEnter(); this.titleKnight.pose = null; tc.intro = null; }
      for (const p2 of tc.parts) { p2.life += dt; p2.x += p2.vx * dt; p2.y += p2.vy * dt; }
      tc.parts = tc.parts.filter((p2) => p2.life < p2.dur);
      return;
    }
    // BEGIN was chosen: the knight leaps into the pit, drops, and the world
    // plunges — the prologue/shrine takes over under the black.
    if (tc.jump) {
      const j = tc.jump, k2 = this.titleKnight; j.t += dt;
      const raw = Math.min(1, j.t / j.dur), HOP = 0.62;
      if (raw <= HOP) {
        const pr = raw / HOP;
        k2.x = j.x0 + (j.tx - j.x0) * pr;
        k2.y = j.y0 + (j.ty - j.y0) * pr - j.h * Math.sin(pr * Math.PI);
        tc.sink = 0;
      } else {
        const s2 = (raw - HOP) / (1 - HOP);
        k2.x = j.tx; k2.y = j.ty + s2 * 22;
        tc.sink = s2;
        // the moment he breaks the mouth's plane: embers startle up out of it,
        // and the plunge begins UNDER him (overlap = no seam between the two)
        if (!tc.plunged) {
          tc.plunged = true;
          for (let i = 0; i < 9; i++) tc.parts.push({
            x: tc.pit.x + (Math.random() - 0.5) * 40, y: tc.pit.y - 4,
            vx: (Math.random() - 0.5) * 30, vy: -(40 + Math.random() * 60),
            life: 0, dur: 0.5 + Math.random() * 0.5, hot: Math.random() < 0.5,
          });
          Sound.play('plunge');
          this.plunge = { t: 0, dur: 1.6, half: 0.72, fired: false, mid: () => this.startPrologue() };
        }
      }
      k2.moving = true;
      if (raw >= 1) { tc.jump = null; tc.sunk = true; }
      // embers + smoke keep animating through the leap
      for (const p2 of tc.parts) { p2.life += dt; p2.x += p2.vx * dt; p2.y += p2.vy * dt; }
      tc.parts = tc.parts.filter((p2) => p2.life < p2.dur);
      this._titleSmoke(tc, dt);
      return;
    }
    if (tc.sunk) return;                   // falling through the dark
    this.input.poll();
    const k = this.titleKnight, mv = this.input.move, ml = Math.hypot(mv.x, mv.y);
    k.moving = ml > 0.08;
    if (k.moving) {
      const spd = 168;
      k.x += (mv.x / (ml || 1)) * spd * Math.min(1, ml) * dt;
      k.y += (mv.y / (ml || 1)) * spd * Math.min(1, ml) * dt;
      if (Math.abs(mv.x) > 0.05) k.faceLeft = mv.x < 0;
    }
    const b = tc.bounds;
    k.x = Math.max(b.minX, Math.min(b.maxX, k.x));
    k.y = Math.max(b.minY, Math.min(b.maxY, k.y));
    // solid things: the pit mouth (stand at the rim, not on the void) and the
    // fire (it is FIRE — he walks around it)
    const solid = (ecx, ecy, erx, ery) => {
      const nx = (k.x - ecx) / erx, ny = (k.y - ecy) / ery, dl = Math.hypot(nx, ny);
      if (dl < 1 && dl > 1e-4) { k.x = ecx + (nx / dl) * erx; k.y = ecy + (ny / dl) * ery; }
    };
    solid(tc.pit.x, tc.pit.y, 84, 48);
    solid(tc.fire.x, tc.fire.y + 2, 32, 18);
    // the campfire breathes embers
    if (Math.random() < dt * 16) tc.parts.push({
      x: tc.fire.x + (Math.random() - 0.5) * 16, y: tc.fire.y - 8,
      vx: (Math.random() - 0.5) * 12, vy: -(26 + Math.random() * 34),
      life: 0, dur: 0.8 + Math.random() * 0.7, hot: Math.random() < 0.5,
    });
    // …and a slow ambient dust mote now and then, drifting through the firelight
    if (Math.random() < dt * 1.2) tc.parts.push({
      x: tc.ox + 30 + Math.random() * (tc.bounds.maxX - tc.ox - 60), y: tc.bounds.minY + Math.random() * 200,
      vx: (Math.random() - 0.5) * 8, vy: 4 + Math.random() * 7,
      life: 0, dur: 2.5 + Math.random() * 2, col: 'rgba(120,112,140,0.5)',
    });
    for (const p2 of tc.parts) { p2.life += dt; p2.x += p2.vx * dt; p2.y += p2.vy * dt; }
    tc.parts = tc.parts.filter((p2) => p2.life < p2.dur);
    this._titleSmoke(tc, dt);
    // THE DEEP BELOW BREATHES: a periodic tremor — a muffled boom, the scene
    // shudders, dust shakes loose from the wall and falls
    tc.rumbleT -= dt;
    if (tc.rumbleT <= 0) {
      tc.rumbleT = 9 + Math.random() * 8;
      tc.rumble = 0.8;
      Sound.play('die_tank', { vol: 0.2 });
      for (let i = 0; i < 6; i++) tc.parts.push({
        x: tc.ox + 24 + Math.random() * (tc.bounds.maxX - tc.ox - 48), y: tc.bounds.minY - 22,
        vx: (Math.random() - 0.5) * 6, vy: 30 + Math.random() * 36,
        life: 0, dur: 0.5 + Math.random() * 0.4, col: '#5a5266',
      });
    }
    if (tc.rumble > 0) tc.rumble -= dt;
    // the knight is a person: idle long enough and he glances about
    if (!k.moving) {
      tc.glanceT -= dt;
      if (tc.glanceT <= 0) { tc.glanceT = 3.5 + Math.random() * 4.5; k.faceLeft = !k.faceLeft; }
    } else tc.glanceT = 3.5 + Math.random() * 4.5;
    // BEGIN is the threshold itself: come to the brink and the pit CLAIMS you —
    // a ring sweeps closed while you stand there (step back to refuse). No
    // direction-holding, no dexterity: the solid rim parks you in exactly the
    // right spot, so reaching the edge IS the input. Tapping the mouth directly
    // skips the wait and drops you at once.
    const d2 = (o) => Math.hypot(k.x - o.x, k.y - o.y);
    const dl2 = Math.hypot((k.x - tc.pit.x) / 84, (k.y - tc.pit.y) / 48);   // vs the solid ellipse
    tc.atBrink = dl2 < 1.22;
    if (this._tapped) {
      this._tapped = false;
      const [tx2, ty2] = this._tapXY || [-999, -999];
      const sx2 = (tc.pit.x - tc.ox) * tc.scale, sy2 = (tc.pit.y - tc.oy) * tc.scale;
      if (tc.atBrink && Math.hypot((tx2 - sx2) / (96 * tc.scale), (ty2 - sy2) / (58 * tc.scale)) < 1) {
        this.titleBegin(); return;
      }
    }
    if (tc.atBrink) {
      tc.commit = Math.min(1, (tc.commit || 0) + dt / 0.65);
      if (tc.commit >= 1) { this.titleBegin(); return; }
    } else {
      tc.commit = Math.max(0, (tc.commit || 0) - dt * 2.4);    // step back and it eases off
    }
    let prompt = null;
    if (d2(tc.brazier) < 64) prompt = 'sanctum';
    else if (d2(tc.banner) < 64) prompt = 'prologue';
    if (prompt !== tc.prompt) { tc.prompt = prompt; this.ui.setTitlePrompt(prompt, this.meta.souls); }
  }

  // Per-frame canvas gradients are expensive on Chrome (Safari shrugs). These
  // are created once — origin-relative where reused at many positions — and
  // intensity/flicker rides globalAlpha instead of re-baked colour stops.
  _tGrad(key, make) {
    const m = this._titleGrads || (this._titleGrads = new Map());
    let g2 = m.get(key);
    if (!g2) { g2 = make(); m.set(key, g2); }
    return g2;
  }

  _renderTitleCamp(ctx) {
    const tc = this.titleCamp;
    ctx.clearRect(0, 0, this.vw, this.vh);
    if (!tc) return;
    const t = tc.t, k = this.titleKnight;
    // as he commits to the pit the camera LEANS IN over the mouth — the zoom
    // rides his sink and holds while the plunge swallows the screen
    const lean = tc.sunk ? 1 : (tc.jump ? Math.max(0, tc.sink || 0) : 0);
    const leaned = lean > 0.001;
    if (leaned) {
      const z = 1 + 0.22 * lean * lean;
      const px2 = (tc.pit.x - tc.ox) * tc.scale, py2 = (tc.pit.y - tc.oy) * tc.scale;
      ctx.save();
      ctx.translate(px2, py2); ctx.scale(z, z); ctx.translate(-px2, -py2);
    }
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    // the deep's tremor shudders the whole scene (screen units, around everything)
    if (tc.rumble > 0) ctx.translate(Math.sin(t * 60) * 1.6 * tc.rumble * tc.scale, Math.sin(t * 47 + 2) * 1.2 * tc.rumble * tc.scale);
    ctx.drawImage(this.titleBgScreen, 0, 0);   // pre-scaled: a flat 1:1 blit
    // the camp's own camera for the DYNAMIC layers: the logical stage scaled up
    ctx.scale(tc.scale, tc.scale);
    ctx.translate(-tc.ox, -tc.oy);
    // the pit — a torn mouth in the stone, breathing ember-light from below
    this._drawPitMouth(ctx, tc, t);
    // warm + violet + cold light pools (additive, flickering)
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    // cached origin-relative gradients; flicker rides ALPHA (radius stays fixed)
    const pool = (x, y, r, col, a) => {
      const g2 = this._tGrad(`pool|${col}|${r}`, () => {
        const gg = ctx.createRadialGradient(0, 0, 2, 0, 0, r);
        gg.addColorStop(0, this._rgba(col, 1)); gg.addColorStop(1, this._rgba(col, 0));
        return gg;
      });
      ctx.globalAlpha = a; ctx.fillStyle = g2;
      ctx.translate(x, y); ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.translate(-x, -y);
      ctx.globalAlpha = 1;
    };
    const iv = tc.intro;
    const lit = !iv || iv.t >= iv.IGNITE;
    const flick = 0.85 + 0.15 * Math.sin(t * 11) + 0.06 * Math.sin(t * 27);
    if (lit) pool(tc.fire.x, tc.fire.y - 6, 150, '#ff9a4a', 0.20 * flick);
    pool(tc.brazier.x, tc.brazier.y - 14, 90, '#b06bff', 0.16 + 0.05 * Math.sin(t * 3));
    pool(tc.banner.x, tc.banner.y, 64, '#d8413a', 0.07 + 0.03 * Math.sin(t * 2.2));
    ctx.restore();
    // the campfire itself — animated pixel art — and its embers.
    // During the cold open it ROARS on ignition (tall, wild) and settles.
    if (lit) {
      let fs = 2;
      if (iv) {
        const roar = Math.max(0, 1 - (iv.t - iv.IGNITE) / 0.7);
        fs = 2 + 2.4 * roar * (0.75 + 0.25 * Math.sin(t * 31));
      }
      this._drawPixelFire(ctx, tc.fire.x, tc.fire.y + 6, t, fs);
    } else if (iv && iv.t >= iv.STRIKE + 0.35 && Math.sin(iv.t * 26) > 0.55) {
      // the tinder almost catches — weak, stuttering licks of flame
      ctx.globalAlpha = 0.55;
      this._drawPixelFire(ctx, tc.fire.x, tc.fire.y + 6, t, 1.1);
      ctx.globalAlpha = 1;
    }
    // flint struck in the dark: sparks arc from his hand onto the tinder
    if (iv && iv.t >= iv.STRIKE && iv.t < iv.IGNITE) {
      for (const st of [iv.STRIKE, iv.STRIKE + 0.45]) {
        const pr = (iv.t - st) / 0.3;
        if (pr < 0 || pr > 1) continue;
        for (let i = 0; i < 3; i++) {
          const f2 = Math.min(1, pr + i * 0.07);
          const sx2 = (k.x - 8) + (tc.fire.x - (k.x - 8)) * f2;
          const sy2 = (k.y - 30) + (tc.fire.y - 4 - (k.y - 30)) * f2 - Math.sin(f2 * Math.PI) * 7 + i * 2;
          ctx.globalAlpha = 1 - f2 * 0.35;
          ctx.fillStyle = i ? '#ffd36b' : '#fff3c0';
          ctx.fillRect(sx2, sy2, 2, 2);
        }
      }
      ctx.globalAlpha = 1;
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const p2 of tc.parts) {
      const a = 1 - p2.life / p2.dur;
      ctx.globalAlpha = a;
      ctx.fillStyle = p2.col || (p2.hot ? '#ffd36b' : '#ff7a2a');
      ctx.fillRect(p2.x - 1, p2.y - 1, 2, 2);
    }
    ctx.restore(); ctx.globalAlpha = 1;
    // woodsmoke climbing off the flame, thinning into the dark
    for (const s of tc.smoke) {
      const sa = Math.sin((s.life / s.dur) * Math.PI) * 0.14;
      ctx.globalAlpha = sa;
      ctx.fillStyle = '#9a93a8';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // violet soulfire on the brazier (cached gradient; the flicker is a vertical scale)
    {
      const bx = tc.brazier.x, by = tc.brazier.y - 12, hf = 1 + Math.sin(t * 10 + 2) * 0.22;
      const g1 = this._tGrad('soulfire', () => {
        const gg = ctx.createRadialGradient(0, -3.5, 1, 0, 0, 11);
        gg.addColorStop(0, '#efe0ff'); gg.addColorStop(0.55, '#b06bff'); gg.addColorStop(1, 'rgba(120,60,200,0)');
        return gg;
      });
      ctx.save();
      ctx.translate(bx, by); ctx.scale(1, hf);
      ctx.fillStyle = g1;
      ctx.beginPath();
      ctx.moveTo(-5, 2);
      ctx.quadraticCurveTo(-4, -6.6, 0, -11);
      ctx.quadraticCurveTo(4, -6.6, 5, 2);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // the knight (shadow + sprite) — teetering toward the mouth as the pit
    // claims him, fading as he sinks. Drawn SMOOTH (no pixel-snap): the stage's
    // zoom turned snapped coords into visible stepping during the leap.
    if (!tc.sunk) {
      const sink = Math.max(0, Math.min(1, tc.sink || 0));
      const c2 = (!tc.jump && tc.commit) || 0;
      const pd = Math.hypot(tc.pit.x - k.x, tc.pit.y - k.y) || 1;
      const kx = k.x + ((tc.pit.x - k.x) / pd) * 4 * c2 + Math.sin(t * 31) * 1.4 * c2;   // a smooth tremble, not noise
      const ky2 = k.y + ((tc.pit.y - k.y) / pd) * 2 * c2;
      // mid-pratfall his shadow waits AT THE LANDING SPOT, swelling as he drops
      const falling = iv && !iv.landed && iv.t < iv.LAND;
      const shY = falling ? tc.spawn.y : ky2;
      const shF = falling ? Math.max(0.3, 1 - (tc.spawn.y - k.y) / 360) : 1;
      ctx.save(); ctx.fillStyle = '#03020a';
      ctx.globalAlpha = 0.3 * (1 - sink) * shF;
      ctx.beginPath(); ctx.ellipse(kx, shY + 2, 16 * shF, 6 * shF, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = Math.max(0, 1 - sink * 1.15);
      // close to the flame, his armor catches its warmth
      const fireD = Math.hypot(k.x - tc.fire.x, k.y - tc.fire.y);
      const warm = fireD < 130 ? { color: '#ff9a4a', a: 0.13 * (1 - fireD / 130) + 0.04 } : null;
      // a forced pose (the pratfall's prone/pushup/kneel) overrides the
      // walk-cycle picker, and the idle breathing bob sits out while it plays
      drawSprite(ctx, 'knight', k.pose || pickFrame(k, t), kx,
        ky2 - ((k.moving || k.pose) ? 0 : Math.sin(t * 2.6) * 1), k.faceLeft, 1, warm, true);
      ctx.globalAlpha = 1;
    }
    // floating labels — quiet names, bobbing, brighter as you draw near
    const label = (text, x, y, col, near) => {
      const bob = Math.sin(t * 2.2 + x * 0.05) * 2;
      ctx.save();
      ctx.globalAlpha = near ? 0.95 : 0.55;
      ctx.font = `bold ${near ? 11 : 9}px "Silkscreen", monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(text, x, y + bob); ctx.fillStyle = col; ctx.fillText(text, x, y + bob);
      ctx.restore();
    };
    if (!iv) {                             // names wait for the light
      // the brink ring: fills as the knight leans into the pit, gold → white-hot
      const c = tc.commit || 0;
      if (c > 0.01 && !tc.jump && !tc.sunk) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(tc.pit.x, tc.pit.y);
        ctx.lineWidth = 3 + 3 * c; ctx.lineCap = 'round';
        ctx.strokeStyle = `rgba(255,${(210 - 90 * c) | 0},${(120 - 60 * c) | 0},${0.55 + 0.45 * c})`;
        ctx.beginPath(); ctx.ellipse(0, 0, 96, 56, 0, -Math.PI / 2, -Math.PI / 2 + c * Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      // the way down teaches itself: BEGIN at rest, STEP IN at the brink.
      // (the down-arrow is GEOMETRY, not a glyph — '▾' isn't in Silkscreen and
      // Chrome's per-frame missing-glyph fallback scan cost a whole frame)
      const atBrink = tc.atBrink && !tc.jump && !tc.sunk;
      label(atBrink ? 'STEP IN' : 'BEGIN', tc.pit.x, tc.pit.y - 92, '#ffd86a', atBrink);
      {
        const bob2 = Math.sin(t * 2.2 + tc.pit.x * 0.05) * 2;
        const ay = tc.pit.y - 82 + bob2, aw = atBrink ? 5 : 4;
        ctx.save();
        ctx.globalAlpha = atBrink ? 0.95 : 0.55;
        ctx.fillStyle = '#ffd86a';
        ctx.beginPath();
        ctx.moveTo(tc.pit.x - aw, ay); ctx.lineTo(tc.pit.x + aw, ay); ctx.lineTo(tc.pit.x, ay + aw + 2);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      label(`SANCTUM ◆${this.meta.souls || 0}`, tc.brazier.x, tc.brazier.y - 58, '#c89aff', tc.prompt === 'sanctum');
      label('THE BARGAIN', tc.banner.x, tc.banner.y - 102, '#e08a7a', tc.prompt === 'prologue');
    }
    ctx.restore();
    if (leaned) ctx.restore();             // end the lean-in (overlays stay screen-true)
    this._drawTitleIntroDark(ctx, tc);     // the cold open's black, opened by firelight
    // movement only on this screen — the sword button has no business here
    if (!this.ui.screenOpen || this.ui.screenOpen === 'title') this.input.draw(ctx, true);
    this._drawPlunge(ctx);
    this._drawTransition(ctx);
  }

  // THE COLD OPEN, Castle Crashers school: total black except a dim pool of
  // almost-light around the knight — who FALLS IN FROM ABOVE, eats dirt,
  // lies there a beat, then picks himself up frame by frame (prone → pushup →
  // kneel → stand), dusts off, strikes the flint, and the fire reveals the
  // camp. The pool follows him the whole way down. Comedy, then warmth.
  _drawTitleIntroDark(ctx, tc) {
    const iv = tc.intro; if (!iv) return;
    const S = 0.5;
    const sw = Math.max(1, Math.round(this.vw * S)), sh = Math.max(1, Math.round(this.vh * S));
    let sc = this.shadowCanvas, g = this.shadowCtx;
    if (!sc || sc.width !== sw || sc.height !== sh) {
      sc = this.shadowCanvas = document.createElement('canvas');
      sc.width = sw; sc.height = sh;
      g = this.shadowCtx = sc.getContext('2d');
      this._holeCache = new Map();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, sw, sh);
    g.fillStyle = 'rgba(2,1,6,1)'; g.fillRect(0, 0, sw, sh);
    g.globalCompositeOperation = 'destination-out';
    const hole = (wx, wy, r, a) => {
      const sx = (wx - tc.ox) * tc.scale * S, sy = (wy - tc.oy) * tc.scale * S, rr = r * tc.scale * S;
      if (rr <= 0) return;
      const grd = g.createRadialGradient(sx, sy, 1, sx, sy, rr);
      grd.addColorStop(0, `rgba(0,0,0,${a})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(sx, sy, rr, 0, Math.PI * 2); g.fill();
    };
    const k = this.titleKnight;
    hole(k.x, k.y - 26, 115, 0.62);                       // the knight, barely — it FOLLOWS his fall
    if (iv.t >= iv.IGNITE) {
      const pr = Math.min(1, (iv.t - iv.IGNITE) / 0.85);
      const e2 = 1 - Math.pow(1 - pr, 3);                 // the light RUSHES out, then eases
      hole(tc.fire.x, tc.fire.y - 6, 95 + e2 * (Math.hypot(this.vw, this.vh) / tc.scale), 1);
    } else if (iv.t >= iv.STRIKE + 0.35 && Math.sin(iv.t * 26) > 0.55) {
      hole(tc.fire.x, tc.fire.y - 6, 80, 0.5);            // a guttering catch-light
    }
    g.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.imageSmoothingEnabled = true;
    ctx.drawImage(sc, 0, 0, this.vw, this.vh);
    ctx.restore();
    // the ignition FLASH
    const fd = iv.t - iv.IGNITE;
    if (fd >= 0 && fd < 0.3) {
      ctx.fillStyle = `rgba(255,214,150,${0.5 * (1 - fd / 0.3)})`;
      ctx.fillRect(0, 0, this.vw, this.vh);
    }
  }

  // BEGIN: the knight leaps from where he stands into the pit (the same arc he
  // makes at every camp), sinks into the dark, and the plunge carries us down.
  titleBegin() {
    if (this.state !== 'title' || !this.titleCamp || this.titleCamp.jump || this.titleCamp.sunk || this.plunge) return;
    const tc = this.titleCamp, k = this.titleKnight;
    this.ui.setTitlePrompt(null);
    this.ui.swipeTitleAway();              // the logo lifts away as he commits
    Sound.play('jump');
    tc.prompt = null;
    // takeoff dust kicked from his heels
    for (let i = 0; i < 6; i++) tc.parts.push({
      x: k.x + (Math.random() - 0.5) * 14, y: k.y + 2,
      vx: (Math.random() - 0.5) * 50, vy: -(6 + Math.random() * 16),
      life: 0, dur: 0.35 + Math.random() * 0.25, col: '#9a93a8',
    });
    tc.jump = { t: 0, dur: 0.8, x0: k.x, y0: k.y, tx: tc.pit.x, ty: tc.pit.y - 4, h: 54 };
    k.attackAnim = 1;          // he LEAPS in the lunging pose, not mid-shuffle
    if (tc.pit.x < k.x - 1) k.faceLeft = true; else if (tc.pit.x > k.x + 1) k.faceLeft = false;
  }

  // Woodsmoke: soft gray puffs that swell, sway and thin as they climb off the
  // flame toward the dark — drawn in _renderTitleCamp above the fire.
  _titleSmoke(tc, dt) {
    tc.smokeT = (tc.smokeT || 0) - dt;
    if (tc.smokeT <= 0 && !tc.sunk) {
      tc.smokeT = 0.22 + Math.random() * 0.14;
      tc.smoke.push({ x: tc.fire.x + (Math.random() - 0.5) * 8, y: tc.fire.y - 26,
        r: 2.5 + Math.random() * 2, sway: Math.random() * 6.28,
        life: 0, dur: 2.2 + Math.random() * 1.2 });
    }
    for (const s of tc.smoke) {
      s.life += dt;
      s.y -= (16 + s.r * 2) * dt;
      s.x += Math.sin(tc.t * 1.6 + s.sway) * 7 * dt;
      s.r += 3.2 * dt;
    }
    tc.smoke = tc.smoke.filter((s) => s.life < s.dur);
  }

  // The animated pixel campfire: four hand-placed frames, stepped at ~9fps,
  // with a breathing glow behind the flame.
  _drawPixelFire(ctx, x, y, t, s = 2) {
    const F = FIRE_FRAMES[Math.floor(t * 9) % FIRE_FRAMES.length];
    const w = 12, h = F.length;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const flick = 0.8 + 0.2 * Math.sin(t * 13);
    const g2 = this._tGrad('fireglow', () => {
      const gg = ctx.createRadialGradient(0, 0, 2, 0, 0, 34);
      gg.addColorStop(0, 'rgba(255,170,70,0.40)'); gg.addColorStop(1, 'rgba(255,110,30,0)');
      return gg;
    });
    const gs = s / 2;                                  // the roar swells the glow with the flame
    ctx.globalAlpha = flick;
    ctx.translate(x, y - h * s * 0.4); ctx.scale(gs, gs);
    ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.fill();
    ctx.restore(); ctx.globalAlpha = 1;
    const x0 = Math.round(x - (w * s) / 2), y0 = Math.round(y - h * s);
    for (let ry = 0; ry < h; ry++) {
      const row = F[ry];
      for (let cx2 = 0; cx2 < w; cx2++) {
        const ch2 = row[cx2];
        if (!ch2 || ch2 === '.') continue;
        ctx.fillStyle = FIRE_PAL[ch2];
        ctx.fillRect(x0 + cx2 * s, y0 + ry * s, s, s);
      }
    }
  }

  // The title pit is the same torn mouth as everywhere else.
  _drawPitMouth(ctx, tc, t) {
    const d = tc.pit, k = this.titleKnight;
    const near = k && !tc.sunk ? Math.max(0, 1 - Math.hypot(k.x - d.x, k.y - d.y) / 180) : 0.4;
    this._drawTornPit(ctx, d.x, d.y, t, near, tc.pitRim);
  }

  // The cold open: the title lifts away and the knight walks on down the
  // corridor. An archway and a wide chamber scroll into view ahead; he steps
  // through the opening, and only then does Level 1 blend in beneath him.
  beginIntro(heroId = 'knight') {
    if (this.state !== 'title') return;
    this.heroId = heroId;
    this.state = 'intro';
    this.introT = 0;
    this.introFired = false;
    // the corridor mouth sits a fixed distance ahead (in world/scroll units)
    this.introEnd = this.tunnelScroll + this.vw * 1.15;
    this.ui.swipeTitleAway();           // CSS lift-and-blur on the title overlay
  }

  // ---------- The Prologue: an animated legend told before the descent ----------
  // Plays in full the first time; afterwards Begin skips straight to the Shrine
  // (the title screen offers a Replay button, which passes force=true).
  startPrologue(force = false) {
    if (this.state !== 'title') return;
    let seen = false;
    try { seen = localStorage.getItem('kls_seen_intro') === '1'; } catch (e) { /* */ }
    if (seen && !force) { this.ui.swipeTitleAway(); this.startShrine(); return; }
    this.heroId = 'knight';
    this.prologue = { i: 0, t: 0, beats: [
      { lines: ['The kingdom stood in gold,', 'and the King ruled it well —', 'just, and beloved by all.'], dur: 9.0 },
      { lines: ['Then the deep woke.', 'A hunger climbed from below.', 'Fire took the towers. The light failed.'], dur: 9.0 },
      { lines: ['At the brink of ruin, the King knelt', 'to the dark, and struck a bargain:', 'the realm spared — for the price of his finest blade.'], dur: 10.5 },
      { lines: ['He had raised that blade from an orphan boy.', 'He loved him as a son.', 'And he sent that son into the dark to save him —', 'knowing what waited below.'], dur: 11.5 },
      { lines: ['You are that son.', 'You do not yet know the truth.', 'You know only your oath.', 'So you descend.'], dur: 11.0 },
    ] };
    this.state = 'prologue';
    this._tapped = false;
    Sound.setScene('camp');
    this.ui.swipeTitleAway();
  }

  _endPrologue() { this.prologue = null; try { localStorage.setItem('kls_seen_intro', '1'); } catch (e) { /* */ } this.state = 'title'; this.startShrine(); }

  _updatePrologue(dt) {
    const pr = this.prologue; pr.t += dt;
    if (this._tapped) { this._tapped = false; pr.i++; pr.t = 0; if (pr.i >= pr.beats.length) return this._endPrologue(); Sound.setScene(pr.i >= 2 ? 'boss' : 'camp'); return; }
    if (pr.t >= pr.beats[pr.i].dur) { pr.i++; pr.t = 0; if (pr.i >= pr.beats.length) return this._endPrologue(); Sound.setScene(pr.i >= 2 ? 'boss' : 'camp'); }
  }

  _renderPrologue(ctx) {
    const pr = this.prologue, W = this.vw, H = this.vh, b = pr.beats[pr.i];
    ctx.clearRect(0, 0, W, H);
    const fin = Math.min(1, pr.t / 0.7), fout = Math.min(1, (b.dur - pr.t) / 0.7);
    const a = Math.max(0, Math.min(fin, fout));
    this._drawPrologueArt(ctx, pr.i, a);
    // a dark band so the narration always reads
    const band = ctx.createLinearGradient(0, H * 0.6, 0, H);
    band.addColorStop(0, 'rgba(0,0,0,0)'); band.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = band; ctx.fillRect(0, H * 0.6, W, H * 0.4); ctx.restore();
    // narration — lines fade in, staggered
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const baseY = H * 0.74, lh = 26;
    b.lines.forEach((line, k) => {
      const la = Math.max(0, Math.min(1, (pr.t - (0.9 + k * 1.5)) / 0.8)) * a;
      if (la <= 0) return;
      ctx.globalAlpha = la; ctx.font = '600 16px "Silkscreen", monospace';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.strokeText(line, W / 2, baseY + k * lh);
      ctx.fillStyle = pr.i >= 2 ? '#e7d2c4' : '#fff3df'; ctx.fillText(line, W / 2, baseY + k * lh);
    });
    if (pr.t > 1.2) { ctx.globalAlpha = 0.4 * a; ctx.font = '10px "Silkscreen", monospace'; ctx.fillStyle = '#fff'; ctx.fillText('tap to continue', W / 2, H * 0.955); }
    ctx.restore(); ctx.globalAlpha = 1;
    this._drawPlunge(ctx);               // the fall from the title camp resolves here
    this._drawTransition(ctx);
  }

  _drawPrologueArt(ctx, i, a) {
    const W = this.vw, H = this.vh, t = this.time, pt = this.prologue.t;
    const PA = Assets.prologueArt || {};
    // blit an image (sprite canvas OR loaded PNG) sized to a target on-screen height
    const blit = (img, cx, by, targetH) => { if (!img) return; const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height; if (!ih) return; const s = targetH / ih; ctx.imageSmoothingEnabled = true; ctx.drawImage(img, Math.round(cx - iw * s / 2), Math.round(by - targetH), Math.round(iw * s), Math.round(targetH)); };
    ctx.save(); ctx.globalAlpha = a;
    if (i === 0) {                                            // the realm, golden
      this._drawKingdomScene(ctx, false);
    } else if (i === 1) {                                     // the rising dark
      this._drawKingdomScene(ctx, true);
    } else if (i === 2) {                                     // the bargain
      ctx.fillStyle = '#0b0712'; ctx.fillRect(0, 0, W, H);
      const cx = W * 0.5, baseY = H * 0.72;
      const rise = (u => 1 - Math.pow(1 - u, 3))(Math.min(1, pt / 3.4));   // easeOutCubic emergence
      const pg = ctx.createRadialGradient(cx, baseY + 24, 4, cx, baseY + 24, 200 + 130 * rise); pg.addColorStop(0, `rgba(210,30,16,${0.32 + 0.30 * rise})`); pg.addColorStop(1, 'rgba(40,0,0,0)'); ctx.fillStyle = pg; ctx.fillRect(0, 0, W, H);
      this._drawDemonRise(ctx, cx, baseY, H * 0.54, rise, t, pt);          // climbs up out of the ground
      blit(PA.king, cx - W * 0.26, baseY, H * 0.13);          // the King, small before it
      drawSprite(ctx, 'knight', 'idle', cx + W * 0.24, baseY, false, 1.3);   // the price
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; const sg = 0.4 + 0.4 * Math.sin(t * 3);
      ctx.strokeStyle = `rgba(225,30,20,${sg * rise})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx + W * 0.24, baseY - 26, 22, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    } else if (i === 3) {                                     // the oath at the gate
      ctx.fillStyle = '#0d0916'; ctx.fillRect(0, 0, W, H);
      const cx = W * 0.5, baseY = H * 0.72;
      ctx.fillStyle = '#191322'; ctx.fillRect(cx - 96, baseY - 150, 192, 150);
      ctx.fillStyle = '#060410'; ctx.beginPath(); ctx.moveTo(cx - 40, baseY); ctx.lineTo(cx - 40, baseY - 84); ctx.arc(cx, baseY - 84, 40, Math.PI, 0); ctx.lineTo(cx + 40, baseY); ctx.closePath(); ctx.fill();
      const tg = ctx.createRadialGradient(cx, baseY - 46, 4, cx, baseY - 46, 130); tg.addColorStop(0, 'rgba(120,40,30,0.35)'); tg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = tg; ctx.fillRect(0, 0, W, H);
      blit(PA.king, cx - W * 0.16, baseY, H * 0.16);
      ctx.fillStyle = `rgba(180,220,255,${0.4 + 0.6 * Math.abs(Math.sin(t * 1.6))})`; ctx.fillRect(cx - W * 0.16 - 6, baseY - 48, 2, 3);   // a tear
      drawSprite(ctx, 'knight', 'idle', cx + W * 0.14, baseY, true, 1.45);
    } else {                                                  // the descent
      ctx.fillStyle = '#0a0610'; ctx.fillRect(0, 0, W, H);
      const cx = W * 0.5, baseY = H * 0.5, k = Math.min(1, pt / 4.5);
      ctx.fillStyle = '#15101e'; ctx.fillRect(cx - 64, baseY - 100, 128, 100);
      ctx.fillStyle = '#04020a'; ctx.beginPath(); ctx.moveTo(cx - 34, baseY); ctx.lineTo(cx - 34, baseY - 64); ctx.arc(cx, baseY - 64, 34, Math.PI, 0); ctx.lineTo(cx + 34, baseY); ctx.closePath(); ctx.fill();
      const rg = ctx.createRadialGradient(cx, baseY + 30, 4, cx, baseY + 30, 170); rg.addColorStop(0, 'rgba(200,30,16,0.5)'); rg.addColorStop(1, 'rgba(40,0,0,0)'); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rg; ctx.fillRect(0, baseY - 30, W, H); ctx.restore();
      drawSprite(ctx, 'knight', 'idle', cx, baseY - 4 + k * 70, false, 1.4 * (1 - 0.4 * k));
      ctx.fillStyle = `rgba(0,0,0,${k * 0.85})`; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  // The Demon Lord's entrance. He climbs UP through a fixed ground line — the part
  // of him below it is erased on an offscreen buffer, so he genuinely emerges from
  // the floor rather than fading in place — out of a swelling infernal portal, with
  // embers/ash streaming off the seam and a flash + shock ring as his feet land.
  // `rise` is the eased 0..1 emergence; `pt` drives the one-shot landing pulse.
  _drawDemonRise(ctx, cx, groundY, targetH, rise, t, pt) {
    const img = (Assets.prologueArt || {}).demon || Assets.demonBig;
    if (!img) return;
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!ih) return;
    const s = targetH / ih, dw = Math.round(iw * s), dh = Math.round(targetH);
    const reveal = Math.max(0.02, rise);
    const bobAmt = Math.max(0, Math.min(1, (rise - 0.85) / 0.15));
    const bob = Math.sin(t * 1.6) * 2 * bobAmt;                   // subtle breathing once grounded
    const dx = Math.round(cx - dw / 2);
    const dyTop = Math.round(groundY - reveal * dh + bob);
    // 1) infernal portal pooled on the ground, swelling as he rises
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gr = dw * (0.42 + 0.26 * rise);
    const pg = ctx.createRadialGradient(cx, groundY, 2, cx, groundY, gr);
    pg.addColorStop(0, `rgba(255,128,46,${0.34 + 0.30 * rise})`);
    pg.addColorStop(0.45, `rgba(214,40,14,${0.22 + 0.20 * rise})`);
    pg.addColorStop(1, 'rgba(60,0,0,0)');
    ctx.fillStyle = pg; ctx.beginPath(); ctx.ellipse(cx, groundY, gr, gr * 0.30, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // 2) offscreen: draw him, then erase everything below the ground seam (soft band)
    if (!this._demonBuf) { this._demonBuf = document.createElement('canvas'); this._demonBx = this._demonBuf.getContext('2d'); }
    const buf = this._demonBuf, bx = this._demonBx;
    if (buf.width !== dw || buf.height !== dh) { buf.width = dw; buf.height = dh; }
    bx.clearRect(0, 0, dw, dh);
    bx.imageSmoothingEnabled = true;
    bx.drawImage(img, 0, 0, dw, dh);
    const seam = groundY - dyTop;                                 // ground line in buffer space
    const band = Math.max(10, dh * 0.09);
    bx.globalCompositeOperation = 'destination-out';
    const er = bx.createLinearGradient(0, seam - band, 0, seam + 2);
    er.addColorStop(0, 'rgba(0,0,0,0)'); er.addColorStop(1, 'rgba(0,0,0,1)');
    bx.fillStyle = er; bx.fillRect(0, Math.round(seam - band), dw, dh - Math.round(seam - band) + 2);
    bx.globalCompositeOperation = 'source-over';
    // 3) ember bloom hugging the seam so the fade reads as fire, not a cut
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const eg = ctx.createRadialGradient(cx, groundY, 2, cx, groundY, dw * 0.5);
    eg.addColorStop(0, `rgba(255,96,34,${0.26 + 0.18 * rise})`); eg.addColorStop(0.6, 'rgba(150,16,8,0.10)'); eg.addColorStop(1, 'rgba(70,0,0,0)');
    ctx.fillStyle = eg; ctx.fillRect(dx - 30, dyTop, dw + 60, dh); ctx.restore();
    // 4) the demon
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(buf, dx, dyTop);
    // 5) embers + ash streaming up off the seam
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 30; k++) {
      const sd = k * 12.9898, rnd = (o) => { const v = Math.sin(sd + o) * 43758.5453; return v - Math.floor(v); };
      const life = ((t * (0.4 + 0.3 * rnd(5))) + rnd(1)) % 1;
      const ex = cx + (rnd(2) - 0.5) * dw * 0.78 + Math.sin(t * 1.4 + k) * 5;
      const ey = groundY - life * dh * (0.4 + 0.3 * rise);
      const al = (1 - life) * (0.35 + 0.5 * rise);
      const sz = 1 + rnd(3) * 2.4;
      ctx.fillStyle = `rgba(255,${(110 + rnd(4) * 110) | 0},44,${al * 0.85})`;
      ctx.fillRect(Math.round(ex), Math.round(ey), Math.ceil(sz), Math.ceil(sz));
    }
    ctx.restore();
    // 6) one-shot landing flash + shock ring as his feet hit
    const lp = Math.max(0, 1 - Math.abs(pt - 3.5) / 0.45);
    if (lp > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const fr = dw * (0.3 + 0.9 * (1 - lp));
      const fg = ctx.createRadialGradient(cx, groundY, 2, cx, groundY, fr);
      fg.addColorStop(0, `rgba(255,180,90,${0.5 * lp})`); fg.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = fg; ctx.fillRect(cx - fr, groundY - fr, fr * 2, fr * 2);
      ctx.strokeStyle = `rgba(255,150,70,${0.6 * lp})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(cx, groundY, fr, fr * 0.32, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  // The kingdom horizon — uses assets/prologue/kingdom.png if you drop it in,
  // otherwise a detailed procedural castle-city. `fire` burns/darkens it.
  _drawKingdomScene(ctx, fire) {
    const W = this.vw, H = this.vh, t = this.time, horizon = H * 0.66;
    const k = fire ? Math.min(1, this.prologue.t / 2.6) : 0;
    const img = Assets.kingdomImg, haveImg = img && img.complete && img.naturalWidth;
    if (haveImg) {
      // fit the panorama to the width, then EDGE-EXTEND: stretch its top row up to
      // fill the sky and its bottom row down to fill the ground, so it blends into
      // the screen seamlessly (no letterbox, no colour mismatch).
      const iw = img.naturalWidth, ih = img.naturalHeight;
      const OVER = 1.08, NUDGE = 0.03;                                       // overscan + a small rightward nudge to centre the castle on the text
      const dw = W * OVER, dh = dw * ih / iw, dx = Math.round((W - dw) / 2 + W * NUDGE);
      // tile the three regions edge-to-edge with INTEGER boundaries (no overlap,
      // no gap) so they never seam — even mid-fade. The sky/ground bleeds use the
      // image's own top/bottom row (same horizontal mapping) so the colours match.
      const dy = Math.max(0, Math.round(horizon - dh * 0.82)), by = Math.min(H, Math.round(dy + dh));
      ctx.imageSmoothingEnabled = true;
      if (dy > 0) ctx.drawImage(img, 0, 0, iw, 1, dx, 0, dw, dy);            // sky (top row, stretched up)
      ctx.drawImage(img, dx, dy, dw, by - dy);                              // the kingdom itself
      if (by < H) ctx.drawImage(img, 0, ih - 1, iw, 1, dx, by, dw, H - by);  // ground (bottom row, stretched down)
    } else {
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      if (!fire) { sky.addColorStop(0, '#e0a84e'); sky.addColorStop(1, '#f4e0a4'); }
      else { sky.addColorStop(0, `rgb(${(28 + 80 * (1 - k)) | 0},${(12 + 44 * (1 - k)) | 0},${(14 + 18 * (1 - k)) | 0})`); sky.addColorStop(1, `rgb(${(150 + 70 * (1 - k)) | 0},${(60 + 80 * (1 - k)) | 0},${(34 + 36 * (1 - k)) | 0})`); }
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, horizon);
      if (!fire) { const s = ctx.createRadialGradient(W * 0.5, horizon - 4, 4, W * 0.5, horizon - 4, 220); s.addColorStop(0, 'rgba(255,248,222,0.55)'); s.addColorStop(1, 'rgba(255,232,176,0)'); ctx.fillStyle = s; ctx.fillRect(0, 0, W, horizon + 50); }
      this._drawKingdomProc(ctx, horizon, fire);
      ctx.fillStyle = fire ? '#160c08' : '#1c1408'; ctx.fillRect(0, horizon, W, H - horizon);
    }
    if (!fire) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < 24; i++) { const ph = ((t * 0.16) + i * 0.04) % 1; ctx.globalAlpha = (1 - ph) * 0.4; ctx.fillStyle = '#ffe9a8'; ctx.fillRect((i * 53.7) % W, horizon - ph * horizon, 2, 2); } ctx.restore(); ctx.globalAlpha = 1; }
    if (fire) {
      ctx.save(); ctx.fillStyle = `rgba(120,24,10,${0.32 * k})`; ctx.fillRect(0, 0, W, H); ctx.restore();   // redden the gold
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const fg = ctx.createLinearGradient(0, horizon, 0, horizon - 140); fg.addColorStop(0, `rgba(255,90,20,${0.45 * k})`); fg.addColorStop(1, 'rgba(255,40,0,0)'); ctx.fillStyle = fg; ctx.fillRect(0, horizon - 140, W, 140);
      ctx.restore();
      ctx.fillStyle = 'rgba(18,12,12,0.5)';
      for (let i = 0; i < 7; i++) { const ph = ((t * 0.22) + i * 0.14) % 1; ctx.globalAlpha = (1 - ph) * 0.5 * k; ctx.beginPath(); ctx.arc(W * (0.16 + i * 0.11), horizon - 24 - ph * horizon * 0.85, 11 + ph * 18, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1; ctx.fillStyle = `rgba(0,0,0,${0.32 * k})`; ctx.fillRect(0, 0, W, H);
    }
  }

  // A symmetric castle-city skyline (fallback when no kingdom.png is provided).
  _drawKingdomProc(ctx, baseY, fire) {
    const W = this.vw, cx = W * 0.5, t = this.time;
    const body = fire ? '#1d110c' : '#3a2a1a', bodyD = fire ? '#100806' : '#281c11', back = fire ? '#2a1610' : '#4c3923', lit = fire ? null : '#ffcf6a', flag = fire ? '#7a1812' : '#9a3a30';
    const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.ceil(w), Math.ceil(h)); };
    // distant mountains
    ctx.fillStyle = fire ? '#241410' : '#5a4730';
    for (const mx of [W * 0.12, W * 0.88]) { for (let s = 0; s < 30; s++) R(mx - 30 + s, baseY - 30 + Math.abs(s - 15), 2, 30, fire ? '#241410' : '#5a4730'); }
    // far rooftop band
    for (let x = -10; x < W + 10; x += 15) { const h = 16 + ((x * 53) % 22); R(x, baseY - h, 15, h, back); }
    // curtain wall + crenellations + central gate
    const wallH = 40, wy = baseY - wallH; R(0, wy, W, wallH, bodyD);
    for (let x = 0; x < W; x += 13) R(x, wy - 5, 6, 5, bodyD);
    R(cx - 13, baseY - 28, 26, 28, body); ctx.fillStyle = '#06030a'; ctx.beginPath(); ctx.moveTo(cx - 9, baseY); ctx.lineTo(cx - 9, baseY - 18); ctx.arc(cx, baseY - 18, 9, Math.PI, 0); ctx.lineTo(cx + 9, baseY); ctx.closePath(); ctx.fill();
    // structures (symmetric), drawn outer→inner
    const tower = (x, w, h, roof) => {
      R(x - w / 2, baseY - h, w, h, body); R(x - w / 2, baseY - h, 1, h, bodyD);
      for (let cxx = x - w / 2; cxx < x + w / 2; cxx += 5) R(cxx, baseY - h - 4, 3, 4, body);   // crenellations
      if (roof) { for (let s = 0; s < w / 2 + 3; s++) R(x - (w / 2 + 3) + s, baseY - h - 4 - s, (w + 6) - 2 * s, 1, body); R(x, baseY - h - 4 - (w / 2 + 4), 1, 5, flag); R(x, baseY - h - 4 - (w / 2 + 4), 5 + Math.sin(t * 3 + x) * 1.5, 3, flag); }
      if (lit) for (let wy2 = baseY - h + 8; wy2 < baseY - 6; wy2 += 9) for (let wx = x - w / 2 + 3; wx < x + w / 2 - 2; wx += 7) R(wx, wy2, 2, 3, lit);
    };
    tower(cx - W * 0.40, 26, 56, true); tower(cx + W * 0.40, 26, 56, true);
    tower(cx - W * 0.28, 22, 78, false); tower(cx + W * 0.28, 22, 78, false);
    tower(cx - W * 0.14, 30, 104, true); tower(cx + W * 0.14, 30, 104, true);
    // central keep + great spire
    R(cx - 34, baseY - 120, 68, 120, body); R(cx - 34, baseY - 120, 1, 120, bodyD);
    for (let cxx = cx - 34; cxx < cx + 34; cxx += 6) R(cxx, baseY - 124, 4, 4, body);
    if (lit) for (let wy2 = baseY - 112; wy2 < baseY - 10; wy2 += 10) for (let wx = cx - 28; wx < cx + 26; wx += 8) R(wx, wy2, 2, 3, lit);
    R(cx - 9, baseY - 188, 18, 68, body);                                  // spire base
    for (let s = 0; s < 16; s++) R(cx - 9 + s * 0.56, baseY - 188 - s * 1.4, 18 - s * 1.12, 2, body);   // pointed spire
    R(cx, baseY - 214, 1, 8, flag); R(cx, baseY - 214, 7 + Math.sin(t * 3) * 1.5, 4, flag);
  }

  _drawCastle(ctx, cx, baseY, fire) {
    const col = fire ? '#1c1110' : '#241a12';
    ctx.fillStyle = col;
    ctx.fillRect(cx - 40, baseY - 70, 80, 70);
    for (let x = cx - 40; x < cx + 40; x += 12) ctx.fillRect(x, baseY - 78, 6, 8);
    for (const tx of [cx - 60, cx + 42]) {
      ctx.fillStyle = col; ctx.fillRect(tx, baseY - 92, 18, 92);
      for (let x = tx; x < tx + 18; x += 8) ctx.fillRect(x, baseY - 100, 5, 8);
      ctx.beginPath(); ctx.moveTo(tx - 2, baseY - 92); ctx.lineTo(tx + 9, baseY - 108); ctx.lineTo(tx + 20, baseY - 92); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#070507'; ctx.beginPath(); ctx.moveTo(cx - 9, baseY); ctx.lineTo(cx - 9, baseY - 16); ctx.arc(cx, baseY - 16, 9, Math.PI, 0); ctx.lineTo(cx + 9, baseY); ctx.closePath(); ctx.fill();
    ctx.fillStyle = fire ? '#7a1510' : '#b08a3a';
    for (const bx of [cx - 60 + 9, cx + 42 + 9]) { const w = Math.sin(this.time * 3 + bx) * 2; ctx.fillRect(bx - 1, baseY - 118, 1, 16); ctx.beginPath(); ctx.moveTo(bx, baseY - 118); ctx.lineTo(bx + 8 + w, baseY - 114); ctx.lineTo(bx, baseY - 110); ctx.closePath(); ctx.fill(); }
    if (fire) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const fg = ctx.createRadialGradient(cx, baseY - 24, 4, cx, baseY - 24, 110); fg.addColorStop(0, 'rgba(255,120,30,0.7)'); fg.addColorStop(0.5, 'rgba(255,60,10,0.3)'); fg.addColorStop(1, 'rgba(255,40,0,0)'); ctx.fillStyle = fg; ctx.fillRect(cx - 120, baseY - 120, 240, 130);
      ctx.restore();
      ctx.fillStyle = 'rgba(28,20,20,0.55)';
      for (let i = 0; i < 5; i++) { const ph = ((this.time * 0.3) + i * 0.2) % 1; ctx.globalAlpha = (1 - ph) * 0.5; ctx.beginPath(); ctx.arc(cx - 48 + i * 24 + Math.sin(this.time + i) * 6, baseY - 92 - ph * 100, 8 + ph * 12, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
  }

  _silKing(ctx, x, baseY, h, kneel) {
    const yb = baseY - (kneel ? 0 : 0), bodyTop = yb - h * 0.66;
    ctx.fillStyle = '#181320';
    ctx.beginPath(); ctx.moveTo(x - 11, yb); ctx.lineTo(x - 6, bodyTop); ctx.lineTo(x + 6, bodyTop); ctx.lineTo(x + 11, yb); ctx.closePath(); ctx.fill();   // robe
    ctx.fillRect(x - 4, yb - h, 8, h * 0.36);                                   // head/neck
    ctx.fillStyle = '#caa54a';
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x + i * 5 - 1, yb - h); ctx.lineTo(x + i * 5, yb - h - 5); ctx.lineTo(x + i * 5 + 1, yb - h); ctx.closePath(); ctx.fill(); }
    ctx.fillRect(x - 6, yb - h, 12, 2);
  }

  _silKnight(ctx, x, baseY, h, blade) {
    ctx.fillStyle = '#121019';
    ctx.fillRect(x - 5, baseY - h * 0.62, 10, h * 0.62);
    ctx.fillRect(x - 4, baseY - h, 8, h * 0.36);
    ctx.fillStyle = '#5a5a72'; ctx.fillRect(x - 4, baseY - h - 3, 1, 4); ctx.fillRect(x + 3, baseY - h - 3, 1, 4);
    ctx.fillStyle = '#74e0ff'; ctx.fillRect(x - 2, baseY - h * 0.82, 4, 1);
    if (blade) { ctx.save(); ctx.translate(x + 5, baseY - h * 0.5); ctx.rotate(-0.5); ctx.fillStyle = '#cfd6e2'; ctx.fillRect(-1, -h * 0.8, 2, h * 0.8); ctx.fillStyle = '#caa54a'; ctx.fillRect(-3, 0, 6, 2); ctx.restore(); }
  }

  _drawDemonShadow(ctx, cx, baseY, rise) {
    const top = baseY - 36 - rise * 78;
    ctx.fillStyle = '#080510';
    ctx.beginPath(); ctx.moveTo(cx - 74, baseY); ctx.quadraticCurveTo(cx - 52, top, cx - 22, top - 8); ctx.lineTo(cx + 22, top - 8); ctx.quadraticCurveTo(cx + 52, top, cx + 74, baseY); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - 22, top - 4); ctx.lineTo(cx - 36, top - 28 - rise * 12); ctx.lineTo(cx - 14, top - 10); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + 22, top - 4); ctx.lineTo(cx + 36, top - 28 - rise * 12); ctx.lineTo(cx + 14, top - 10); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; const eg = 0.5 + 0.5 * Math.sin(this.time * 4);
    ctx.fillStyle = `rgba(255,40,28,${0.75 * rise})`; ctx.fillRect(cx - 15, top + 2, 6, 4); ctx.fillRect(cx + 9, top + 2, 6, 4);
    ctx.fillStyle = `rgba(255,170,130,${0.9 * rise * eg})`; ctx.fillRect(cx - 14, top + 3, 2, 1); ctx.fillRect(cx + 10, top + 3, 2, 1);
    ctx.restore();
  }

  // ---------- The Shrine of Blades: the run-opening sword choice ----------
  startShrine() {
    if (this.state !== 'title') return;
    this.heroId = 'knight';
    this.biome = biomeForLevel(1);
    this._buildShrineRoom();
    const mb = this.metaB = metaBonuses(this.meta);
    this.player = new Player(this.world.w / 2, this.world.h / 2, 'knight', mb);
    this.player.blade = null;                            // weaponless until he takes one up
    const W = this.vw, H = this.vh, sy = H * 0.42;
    this.cam.x = 0; this.cam.y = 0;                      // screen-sized chamber at the origin
    // he FALLS into the chamber (continuing the leap into the pit): the drop
    // plays out as the plunge-black clears, landing where he used to just stand
    this.player.x = W / 2; this.player.y = H * 0.30; this.player.faceLeft = false;
    this.bounds = { minX: 40, minY: H * 0.52, maxX: W - 40, maxY: H - 46 };
    this.shrine = { t: 0, chosen: null, drawT: 0, fired: false, near: null, promptFor: undefined,
      amb: 0, ambId: null, flash: 0, lightT: 0,            // scenery-morph state (volcano/blizzard/storm)
      drop: { t: 0, dur: 0.55, y0: H * 0.30, y1: H * 0.82 },
      swords: [ { id: 'ember', x: W * 0.26, y: sy }, { id: 'frost', x: W * 0.5, y: sy - 10 }, { id: 'storm', x: W * 0.74, y: sy } ] };
    this.state = 'shrine';
    Sound.setScene('camp');
    this.ui.swipeTitleAway();
  }

  _buildShrineRoom() {
    const W = this.vw, H = this.vh, b = this.biome;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, b.ground[0]); grd.addColorStop(1, b.ground[1]);
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    if (b.detail) b.detail(g, W, H);
    const rg = g.createRadialGradient(W / 2, H * 0.42, 10, W / 2, H * 0.42, Math.max(W, H) * 0.42);
    rg.addColorStop(0, 'rgba(120,90,170,0.16)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, W, H);
    this._campTorchScreen = [[52, 84], [W - 52, 84]];
    for (const [tx, ty] of this._campTorchScreen) this._bakeBrazierPost(g, tx, ty);
    this._bakeWalls(g, b, W, H);
    const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.26, W / 2, H / 2, Math.max(W, H) * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.64)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    this.shrineBg = c;
  }

  _updateShrine(dt) {
    const sh = this.shrine, p = this.player; sh.t += dt;
    // the fall resolves: he drops out of the dark and lands hard
    if (sh.drop) {
      const d = sh.drop; d.t += dt;
      const k = Math.min(1, d.t / d.dur);
      p.y = d.y0 + (d.y1 - d.y0) * k * k;                // accelerating fall
      p.moving = true;
      if (k >= 1) {
        sh.drop = null; p.moving = false;
        this.shake = Math.max(this.shake, 7);
        this._puff(p.x - 8, p.y, '#4a4350', 3, 6, { r0: 3, r1: 12, dur: 0.4 });
        this._puff(p.x + 8, p.y, '#4a4350', 3, 6, { r0: 3, r1: 12, dur: 0.4 });
        Sound.play('hit', { vol: 0.5 });
      }
      this._updateProjAndFx(dt);
      return;
    }
    if (sh.chosen) {                                     // the chosen blade flies to his hand, then we descend
      sh.amb = Math.min(1, sh.amb + dt * 3);             // its element surges as you take it up
      this._shrineWeather(sh, dt);
      sh.drawT += dt;
      if (sh.drawT >= 0.9 && !sh.fired) { sh.fired = true; this._slashWipe(() => this.start('knight')); }
      return;
    }
    this.input.poll();
    const mv = this.input.move, ml = Math.hypot(mv.x, mv.y);
    if (ml > 0.08) { const spd = p.moveSpeed; p.x += (mv.x / ml) * spd * Math.min(1, ml) * dt; p.y += (mv.y / ml) * spd * Math.min(1, ml) * dt; p.fx = mv.x / ml; p.fy = mv.y / ml; p.faceLeft = p.fx < 0; p.moving = true; } else p.moving = false;
    const b = this.bounds; p.x = Math.max(b.minX, Math.min(b.maxX, p.x)); p.y = Math.max(b.minY, Math.min(b.maxY, p.y));
    let near = null, nd = 80; for (const s of sh.swords) { const d = Math.hypot(p.x - s.x, p.y - (s.y + 20)); if (d < nd) { nd = d; near = s; } }
    sh.near = near;
    const id = near && near.id, was = sh.promptFor && sh.promptFor.id;
    if (id !== was) { sh.promptFor = near; this.ui.setShrinePrompt(near); }
    // the chamber morphs into whichever element you stand before, and melts back
    const target = near ? near.id : null;
    if (sh.ambId === target) sh.amb += ((target ? 1 : 0) - sh.amb) * Math.min(1, dt * 5);
    else { sh.amb -= sh.amb * Math.min(1, dt * 6); if (sh.amb < 0.04) { sh.amb = 0; sh.ambId = target; } }
    this._shrineWeather(sh, dt);
    this._updateProjAndFx(dt);             // landing dust etc. animate out
  }

  _shrineWeather(sh, dt) {
    if (sh.ambId === 'storm' && sh.amb > 0.3) {
      sh.lightT -= dt;
      if (sh.lightT <= 0) { sh.lightT = 0.5 + Math.random() * 1.5; sh.flash = 1; sh.boltX = Math.random() * this.vw; }
    }
    if (sh.flash > 0) sh.flash = Math.max(0, sh.flash - dt * 5);
  }

  chooseShrineBlade(id) {
    if (!this.shrine || this.shrine.chosen) return;
    this.shrine.chosen = id; this.shrine.drawT = 0; this.shrine.fired = false;
    this.setBlade(id);
    this.ui.setShrinePrompt(null);
    Sound.play('relic'); Sound.play('furyready');
    this.flashScreen = Math.max(this.flashScreen, 0.3);
    this.shake = Math.max(this.shake, 6);
  }

  _updateIntro(dt) {
    this.introT += dt;
    // a slow, careful walk that only gently gathers pace
    const speed = 56 + Math.min(150, this.introT * 60);
    this.tunnelScroll += speed * dt;
    // the archway's on-screen x; once he's stepped well past it (into the open
    // chamber) we blend into Level 1 from there — not from mid-corridor.
    const hx = this.vw * 0.46;
    const endSx = this.introEnd - this.tunnelScroll;
    if (!this.introFired && (endSx < hx - 90 || this.introT > 6.5)) {
      this.introFired = true;
      // the dark blinks shut around him; Level 1 is swapped in under full black
      // (handled by the introCut tick), then the iris opens in the new room.
      this.introCut = { t: 0, dur: 0.62, fired: false };
    }
  }

  // A fresh run resets all progression (death sends you back to Level 1). When
  // `wiped` is false (the cold-open hand-off) we set the level up immediately so
  // only the light-bloom covers the transition, not the diagonal slash.
  start(heroId = 'knight', wiped = true) {
    this.heroId = heroId;
    const begin = () => {
      const mb = this.metaB = metaBonuses(this.meta);
      this.player = new Player(this.world.w / 2, this.world.h / 2, heroId, mb);
      this.player.god = this.godMode;         // GOD MODE: immune to enemy damage
      this.player.blade = this.bladeId || 'ember';   // the Living Blade chosen at the title
      this.player.bladeUp = new Set(); this.player.bladeTier = 0; this.player.bladeCharge = 0;
      // Sanctum-sealed relics stay out of the sorcerer's pool until bought with souls.
      this.player.lockedRelics = new Set(LOCKED_RELICS.filter((id) => !this.meta.relics.includes(id)));
      this.shopSlots = 4 + (mb.slots || 0);
      this.kills = 0; this.level = 1; this.gold = mb.startGold || 0; this.totalGold = 0;
      this.bestCombo = 0; this.runT = 0; this.lastRunSouls = 0; this._soulsAwarded = false;   // run-summary stats
      this._campsSinceEvent = 0; this._eventsRecent = [];   // event pacing (see openCamp)
      this.hpDisplay = this.hpGhost = this.player.maxHP;
      this.timeScale = 1; this.dying = 0;
      this.combo = 0; this.comboT = 0; this._comboTier = 0; this.zoom = 0; this.slowmo = 0;
      this._startLevel(1, true);
      if (!wiped) { this.intro = null; this.countdown = 1.5; }  // skip the LEVEL card; let the bloom breathe
    };
    if (wiped) this._slashWipe(begin); else begin();
  }

  // ---- Sanctum (meta-progression) purchases ----
  buyMeta(item) {
    const lvl = this.meta.up[item.id] || 0;
    if (lvl >= item.max || this.meta.souls < metaCost(item, lvl)) return false;
    this.meta.souls -= metaCost(item, lvl);
    this.meta.up[item.id] = lvl + 1;
    this.metaB = metaBonuses(this.meta);
    saveMeta(this.meta);
    return true;
  }
  unlockRelic(id) {
    if (this.meta.relics.includes(id) || this.meta.souls < RELIC_UNLOCK_COST) return false;
    this.meta.souls -= RELIC_UNLOCK_COST;
    this.meta.relics.push(id);
    saveMeta(this.meta);
    return true;
  }

  // Bank the run's Souls — the essence of the fallen, spent in the Sanctum.
  // God-mode runs bank nothing (testing shouldn't fund progression).
  _awardSouls(won) {
    if (this._soulsAwarded) return;            // once per run, however it ends
    this._soulsAwarded = true;
    if (this.godMode) { this.lastRunSouls = 0; return; }
    const cleared = won ? LEVELS.length : Math.max(0, this.level - 1);
    this.lastRunSouls = runSouls(cleared, this.kills, won);
    if (this.lastRunSouls > 0) { this.meta.souls += this.lastRunSouls; saveMeta(this.meta); }
  }

  nextLevel() { this._slashWipe(() => this._startLevel(this.level + 1, false)); }

  // GOD MODE: jump straight to the next floor (full heal) for fast testing.
  godSkip() {
    if (!this.godMode) return;
    if (this.state !== 'playing' && this.state !== 'camp') return;
    const next = Math.min(LEVELS.length, this.level + 1);
    if (next === this.level && this.state === 'playing') return;   // already on the last floor
    this.cutscene = null; this.cutsceneBoss = null; this.plunge = null; this.descentJump = null;
    this._slashWipe(() => this._startLevel(next, true));
  }

  _startLevel(level, fullHeal) {
    this.level = level;
    this.descentSink = 0;                      // restore visibility after a plunge
    this.watchers = []; this.campWhisper = null; this._watchT = 5 + Math.random() * 4;
    this.cutscene = null; this.cutsceneBoss = null; this.pendingEscort = null;
    if (!this.player) this.player = new Player(this.world.w / 2, this.world.h / 2);
    this.player.god = this.godMode;            // keep GOD MODE in sync each floor
    this.player.x = this.world.w / 2; this.player.y = this.world.h / 2;
    if (fullHeal) { this.player.hp = this.player.maxHP; }
    this.player.dead = false; this.player.invuln = 0.6;
    // stagger ability cooldowns so they don't all fire at once on level start
    this.player.abilities.forEach((a, i) => { a.cd = 0.4 + i * 0.14; });

    this.enemies = []; this.projectiles = []; this.allyProjectiles = []; this.effects = [];
    this.pickups = [];
    this.bounds = this.worldBounds;                  // restore arena bounds (camp shrinks them)
    this.cam.x = this.player.x - this.vw / 2; this.cam.y = this.player.y - this.vh / 2;
    this.spawnTimer = 0;
    this._buildQueue(level);
    // roll for a named elite "herald" on normal floors (never on boss floors)
    const isBoss = !!(LEVELS[level - 1].boss || LEVELS[level - 1].miniboss);
    this._namedDef = (!isBoss && level >= 3 && Math.random() < 0.55) ? NAMED_FOES[(Math.random() * NAMED_FOES.length) | 0] : null;
    this._namedTimer = 5 + Math.random() * 7;
    this.namedToast = null;
    // your previous self waits where you fell — the Lord raised what you left
    this._huskDef = null;
    const husk = (!isBoss && level >= 2) ? loadHusk() : null;
    if (husk && husk.floor === level) {
      clearHusk();                               // one encounter per death
      this._huskDef = husk;
      this._huskTimer = 3.5 + Math.random() * 3;
      this._namedDef = null;                     // the floor belongs to the Revenant
    }
    // swap to this level's art — rebuilt EVERY floor now: the brazier ring turns,
    // the scatter rerolls and the colour cast shifts, so floors within one biome
    // stop looking like the same room three times in a row.
    const bossType = (LEVELS[level - 1].boss && 'boss') || (LEVELS[level - 1].miniboss && 'miniboss');
    this._applyBiome(level);
    this.state = 'playing';
    this.ui.showScreen(null);
    Sound.setScene(bossType ? 'boss' : 'combat');

    // pre-level countdown + intro card (boss reveal on 10 & 20)
    this.countdown = 3.6;
    if (bossType) {
      // The boss does NOT march in — it RISES from the altar in a cutscene.
      this.spawnQueue = this.spawnQueue.filter((t) => t !== bossType);
      const cx = this.world.w / 2, cy = this.world.h / 2;
      // the knight stands at the chamber's mouth, looking in
      this.player.x = cx;
      this.player.y = Math.min(this.worldBounds.maxY - 40, cy + 210);
      this.player.faceLeft = false; this.player.invuln = 999;        // untouchable through the scene
      this.cam.x = this.player.x - this.vw / 2; this.cam.y = this.player.y - this.vh / 2;
      // place the boss dormant at the altar, ready to emerge
      const boss = new Enemy(bossType, cx, cy, level);
      boss.inert = true; boss.rising = 0; boss.state = 'rise';
      this.enemies.push(boss);
      this.cutsceneBoss = boss;
      // L10: the escort lies in wait — it only pours in once WRATH breaks
      if (level === 10) { this.pendingEscort = this.spawnQueue; this.spawnQueue = []; }
      this.cutscene = { t: 0, look: 3.0, rise: 3.4, settle: 0.7, roared: false, name: BOSS_NAMES[bossType] };
      this.countdown = 0; this.intro = null;
    } else if (this.forceElite > 0) {
      // something you woke in the camp followed you down — warn the player loudly
      this.intro = { kind: 'ambush', text: 'AMBUSH', sub: 'Something followed you down…', t: 0, dur: 2.6 };
      this.countdown = 3.8;
      this.shake = Math.max(this.shake, 8);
    } else {
      this.intro = { kind: 'level', text: `LEVEL ${level}`, sub: this.biome.name, t: 0, dur: 2.0 };
    }
  }

  // Slash-wipe transition: cover the screen, run `mid` at the midpoint, then reveal.
  _slashWipe(mid) {
    this.transition = { t: 0, dur: 0.74, half: 0.37, mid, fired: false };
  }

  // ---------- combat helpers (used by abilities) ----------
  nearestEnemy(x, y, maxDist, exclude) {
    let best = null, bd = maxDist != null ? maxDist * maxDist : Infinity;
    for (const e of this.enemies) {
      if (e.dead || (exclude && exclude.has(e))) continue;
      const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  enemiesInRadius(x, y, r) {
    const out = [];
    const rr = r * r;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
      if (d <= rr + e.r * e.r) out.push(e);
    }
    return out;
  }

  addEffect(fx) { this.effects.push(fx); }

  hitEnemy(e, dmg, kx = 0, ky = 0, source = 'ability') {
    const wasAlive = !e.dead;
    if (this.godMode) dmg = 999999;          // GOD MODE: one-shot everything
    else if (this.player && this.player.bladeUp.has('frost_vuln') && e.slowT > 0) dmg *= 1.25;   // Frostbite
    e.takeHit(dmg, kx, ky);
    this.spawnDamageNumber(e.x, e.y - e.r - 6, Math.round(dmg), source);
    if (source === 'sword') { this._relicOnHit(e, dmg); this._bladeOnHit(e, dmg); }   // sparks/feedback in _applySwingDamage
    if (e.boss && wasAlive) this.hitStop = Math.max(this.hitStop, 0.05); // weight on boss hits
    if (wasAlive && e.dead) this.onEnemyKilled(e, source);
  }

  // Relic procs that hang off the blade (only on direct sword hits).
  _relicOnHit(e, dmg) {
    const p = this.player;
    if (p.relics.has('frost')) e.applySlow(1.4);
    if (p.relics.has('thunder')) {
      const t = this.nearestEnemy(e.x, e.y, 150, new Set([e]));
      if (t) {
        this.addEffect({ kind: 'bolt', pts: [{ x: e.x, y: e.y }, { x: t.x, y: t.y }], t: 0, dur: 0.16 });
        this.hitEnemy(t, dmg * 0.5, 0, 0, 'ability');   // 'ability' source won't re-proc
      }
    }
  }

  // ---------- The Living Blade ----------
  // Elemental particles flung along the swing arc — fire embers, ice shards, sparks.
  _bladeSwingFx(p) {
    const a = p.facingAngle, arc = p.arcDeg * Math.PI / 180, reach = p.reach, oy = p.y - 16;
    for (let i = 0; i < 11; i++) {
      const u = Math.random(), ang = a - arc / 2 + u * arc, r = reach * (0.45 + Math.random() * 0.55);
      const x = p.x + Math.cos(ang) * r, y = oy + Math.sin(ang) * r;
      const tang = ang + Math.PI / 2;          // fling tangent to the arc
      if (p.blade === 'ember') {
        this._mote(x, y, Math.random() < 0.5 ? '#ff7a2a' : '#ffd36b',
          { vx: Math.cos(ang) * 30, vy: Math.sin(ang) * 30 - 26, g: -36, r: 1.4 + Math.random() * 1.6, twinkle: 1, dur: 0.4 + Math.random() * 0.3 });
      } else if (p.blade === 'frost') {
        this.effects.push({ kind: 'spark', x, y, vx: Math.cos(tang) * (90 + Math.random() * 90) * (Math.random() < 0.5 ? 1 : -1),
          vy: Math.sin(tang) * (90 + Math.random() * 90), t: 0, dur: 0.34, col: Math.random() < 0.5 ? '#eaffff' : '#bfe9ff' });
      } else {
        this.effects.push({ kind: 'spark', x, y, vx: Math.cos(tang) * 170 * (Math.random() < 0.5 ? 1 : -1),
          vy: Math.sin(tang) * 170, t: 0, dur: 0.2, col: Math.random() < 0.5 ? '#cdbfff' : '#f0eaff', streak: true });
      }
    }
  }

  _bladeOnHit(e, dmg) {
    const p = this.player; if (!p || !p.blade) return;
    const up = p.bladeUp;
    if (p.blade === 'ember') {                          // EMBERBRAND — set ablaze
      if (e.dead) return;
      const mult = up.has('ember_hotter') ? 1.7 : 1;
      e.burnDmg = Math.max(e.burnDmg, dmg * 0.22 * mult);
      e.burnT = Math.max(e.burnT, 2.6);
      if (e.burnTickT <= 0) e.burnTickT = 0.5;
    } else if (p.blade === 'frost') {                   // FROSTFANG — chill / freeze / shatter
      if (e.boss) { e.applySlow(1.0); return; }          // bosses chill, never freeze
      if (e.frozenT > 0) return this._shatter(e, dmg);
      e.applySlow(1.4);
      const need = up.has('frost_quick') ? 2 : 3;
      e.frost = (e.frost || 0) + 1;
      if (e.frost >= need) { e.frost = 0; e.frozenT = 1.3;
        this.addEffect({ kind: 'ring', x: e.x, y: e.y, r: e.r + 6, color: '#bfe9ff', t: 0, dur: 0.3 }); }
    } else if (p.blade === 'storm') {                   // STORMEDGE — arc lightning
      const chains = up.has('storm_tempest') ? 4 : up.has('storm_fork') ? 2 : 1;
      let from = e; const hit = new Set([e]);
      for (let i = 0; i < chains; i++) {
        const t = this.nearestEnemy(from.x, from.y, 165, hit); if (!t) break; hit.add(t);
        this.addEffect({ kind: 'bolt', pts: [{ x: from.x, y: from.y }, { x: t.x, y: t.y }], t: 0, dur: 0.16 });
        let cd = dmg * 0.5; if (up.has('storm_crit') && Math.random() < 0.22) cd *= 3;
        if (up.has('storm_stun') && !t.boss) t.frozenT = Math.max(t.frozenT, 0.5);
        this.hitEnemy(t, cd, 0, 0, 'ability'); from = t;
      }
      if (up.has('storm_build')) { p.bladeCharge++; if (p.bladeCharge >= 12) { p.bladeCharge = 0; this._stormNova(); } }
    }
  }

  _shatter(e, dmg) {
    const p = this.player; e.frozenT = 0;
    const bonus = (p.bladeUp.has('frost_brittle') ? 2.4 : 1.3) * dmg + 24;
    this.addEffect({ kind: 'boom', x: e.x, y: e.y, r: e.r + 18, color: '#bfe9ff', t: 0, dur: 0.3 });
    this._gib(e.x, e.y - e.r * 0.5, '#cdeeff', 6, 120, { size: 2 });
    Sound.play('crit', { vol: 0.5 });
    this.hitEnemy(e, bonus, 0, 0, 'ability');
    if (p.bladeUp.has('frost_spread')) for (const o of this.enemiesInRadius(e.x, e.y, 72)) { if (o !== e && !o.boss) o.applySlow(1.4); }
    if (p.bladeUp.has('frost_chain')) for (const o of this.enemiesInRadius(e.x, e.y, 90)) {
      if (o !== e && o.frozenT > 0) { o.frozenT = 0; this.addEffect({ kind: 'boom', x: o.x, y: o.y, r: o.r + 12, color: '#bfe9ff', t: 0, dur: 0.25 }); this.hitEnemy(o, bonus * 0.7, 0, 0, 'ability'); }
    }
  }

  _stormNova() {
    const p = this.player, R = 120, dmg = 40 * p.mods.abilityDmgMult;
    this.addEffect({ kind: 'boom', x: p.x, y: p.y, r: R, color: '#b9a6ff', t: 0, dur: 0.34 });
    Sound.play('crit', { vol: 0.6 }); this.shake = Math.max(this.shake, 5);
    for (const o of this.enemiesInRadius(p.x, p.y, R)) { const a = Math.atan2(o.y - p.y, o.x - p.x); this.hitEnemy(o, dmg, Math.cos(a) * 120, Math.sin(a) * 120, 'ability'); }
  }

  // Burn damage-over-time + Permafrost aura, ticked each combat frame.
  _updateStatuses(sdt) {
    const p = this.player; if (!p) return;
    if (p.bladeUp.has('frost_aura')) for (const e of this.enemies) { if (!e.boss && Math.hypot(e.x - p.x, e.y - p.y) < 120) e.applySlow(0.4); }
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead || e.burnT <= 0) continue;
      e.burnT -= sdt; e.burnTickT -= sdt;
      if (e.burnTickT <= 0) {
        e.burnTickT = 0.5;
        let tick = e.burnDmg;
        if (p.bladeUp.has('ember_exec') && !e.boss && e.hp < e.maxHP * 0.4) tick = e.hp + 1;   // Immolation
        if (p.bladeUp.has('ember_soul')) p.fury = Math.min(p.furyMax, p.fury + 1.0);   // Kindled Fury
        this.hitEnemy(e, tick, 0, 0, 'ability');
      }
    }
  }

  onEnemyKilled(e, source) {
    const p = this.player;
    Sound.play(e.boss ? 'die_tank' : ('die_' + e.type) , { vol: e.elite ? 1.2 : 1 });
    // Fury charges slowly — the ultimate should be a rare payoff (~every few
    // levels). A hot streak feeds it faster (up to +50%).
    p.fury = Math.min(p.furyMax, p.fury + (e.boss ? 16 : 1.4) * p.mods.furyMult
      * (1 + Math.min(0.5, this.combo * 0.02)));
    if (source === 'sword' && p.mods.lifestealHeal > 0 && !p.mods.noHeal) {
      p.hp = Math.min(p.maxHP, p.hp + p.mods.lifestealHeal);
    }
    this.kills++;
    this.combo++; this.comboT = 2.6; this.comboPop = 1;     // feed the kill streak
    if (this.combo > (this.bestCombo || 0)) this.bestCombo = this.combo;
    // streak milestones: a stinger + banner as the slaughter escalates
    for (let i = COMBO_TIERS.length - 1; i >= 0; i--) {
      if (this.combo >= COMBO_TIERS[i].at && this._comboTier < i + 1) {
        this._comboTier = i + 1;
        this.addEffect({ kind: 'banner', text: COMBO_TIERS[i].name + '!', t: 0, dur: 1.1 });
        Sound.play('combo', { tier: i + 1 });
        this.zoom = Math.max(this.zoom, 0.7);
        this.shake = Math.max(this.shake, 5);
        this._buzz(40);
        break;
      }
    }
    // a slain Revenant earns the Lord's next taunt (delivered after the floor)
    if (e.husk) this._huskTauntDue = true;
    // hit-pause on meaningful kills (skip trash so swarms stay fluid)
    if (e.boss) { this.hitStop = Math.max(this.hitStop, 0.14); this.zoom = Math.max(this.zoom, 1); this._buzz(90); }
    else if (e.type === 'tank' || e.elite) { this.hitStop = Math.max(this.hitStop, 0.06); this.zoom = Math.max(this.zoom, 0.55); this._buzz(25); }
    this._spawnDeathFx(e);
    this._dropLoot(e);
    // bombers + Explosive elites detonate when slain
    if (e.type === 'bomber' || e.elite === 'explosive') this._explodeEnemy(e);
    // Ember Crown: the slain erupt, scorching nearby foes (no chain-recursion)
    if (p.relics.has('ember') && !this._inEmber) {
      this._inEmber = true;
      const R = 64, dmg = 16 * p.mods.abilityDmgMult;
      for (const o of this.enemiesInRadius(e.x, e.y, R)) {
        if (o === e) continue;
        const a = Math.atan2(o.y - e.y, o.x - e.x);
        this.hitEnemy(o, dmg, Math.cos(a) * 80, Math.sin(a) * 80, 'ability');
      }
      this.addEffect({ kind: 'boom', x: e.x, y: e.y, r: R, t: 0, dur: 0.3 });
      this._inEmber = false;
    }
    // Emberbrand: foes slain while burning erupt / spread their fire
    if (e.burnT > 0 && p.blade === 'ember') {
      if (p.bladeUp.has('ember_pyre') && !this._inPyre) {
        this._inPyre = true;
        const R = 70, dmg = 22 * p.mods.abilityDmgMult;
        for (const o of this.enemiesInRadius(e.x, e.y, R)) { if (o === e) continue; const a = Math.atan2(o.y - e.y, o.x - e.x); this.hitEnemy(o, dmg, Math.cos(a) * 90, Math.sin(a) * 90, 'ability'); }
        this.addEffect({ kind: 'boom', x: e.x, y: e.y, r: R, t: 0, dur: 0.32 }); Sound.play('explode', { vol: 0.5 });
        this._inPyre = false;
      }
      if (p.bladeUp.has('ember_spread')) for (const o of this.enemiesInRadius(e.x, e.y, 64)) { if (o !== e && o.burnT <= 0) { o.burnT = 2.5; o.burnDmg = e.burnDmg * 0.7; o.burnTickT = 0.4; } }
    }
  }

  _dropLoot(e) {
    const drop = (type, value) => this.pickups.push({ type, value, x: e.x + (Math.random() - 0.5) * 14,
      y: e.y + (Math.random() - 0.5) * 14, vx: (Math.random() - 0.5) * 80, vy: -(40 + Math.random() * 60),
      t: 0, dead: false });
    // gold: most enemies drop a little; bosses/tanks/elites drop more. Odds are
    // deliberately low — there are a LOT of mobs, and you shouldn't afford the
    // whole catalogue in one run. Spend choices should hurt a little.
    const coins = e.boss ? 12 : (e.elite ? 4 : (e.type === 'tank' ? 3 : (Math.random() < 0.45 ? 1 : 0)));
    for (let i = 0; i < coins; i++) drop('gold', e.boss ? 5 : 1);
    // health: bosses always; otherwise scarce, so big waves don't flood you with heals
    if (e.boss || (e.elite && Math.random() < 0.4) || (e.type === 'tank' && Math.random() < 0.22) || Math.random() < 0.012) {
      drop('health', e.boss ? 30 : 14);
    }
    // named elites always yield a relic (or a pile of gold if you own them all)
    if (e.dropsRelic) {
      const id = this._pickDropRelic();
      if (id) this.pickups.push({ type: 'relic', relicId: id, x: e.x, y: e.y, vx: 0, vy: -34, t: 0, dead: false });
      else for (let i = 0; i < 12; i++) drop('gold', 4);
    }
  }

  _pickDropRelic() {
    const p = this.player, locked = p.lockedRelics || new Set();
    const pool = RELICS.filter((r) => !p.relics.has(r.id) && !locked.has(r.id));
    return pool.length ? pool[(Math.random() * pool.length) | 0].id : null;
  }

  // The Dark Knight's slam cracks the floor: jagged molten fissures radiate out
  // from the impact, glow hot for a few seconds, and burn anyone standing on
  // them. Paths are baked once at creation (no per-frame randomness).
  // `friendly` flips the allegiance: CATACLYSM's fissures burn the foes instead.
  spawnFissures(x, y, n, baseDmg, friendly = false) {
    const b = this.bounds;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.7;
      const len = 95 + Math.random() * 70;
      const joints = 4 + (Math.random() * 2 | 0);
      const pts = [{ x: x + Math.cos(a) * 18, y: y + Math.sin(a) * 18 }];
      for (let j = 1; j <= joints; j++) {
        const d = 18 + (len - 18) * (j / joints);
        const wob = (Math.random() - 0.5) * 26;
        const px = x + Math.cos(a) * d - Math.sin(a) * wob;
        const py = y + Math.sin(a) * d + Math.cos(a) * wob;
        pts.push({ x: Math.max(b.minX, Math.min(b.maxX, px)), y: Math.max(b.minY, Math.min(b.maxY, py)) });
      }
      this.addEffect({ kind: 'fissure', pts, w: 12, t: 0, dur: 6.5, warn: friendly ? 0.1 : 0.55, tick: 0,
        dmg: baseDmg * 0.55, friendly, seed: Math.random() * 6.28 });
    }
    Sound.play('explode', { vol: 0.55 });
  }

  // distance from a point to a polyline, within `r`?
  _nearPolyline(px, py, pts, r) {
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i].x, ay = pts[i].y, bx = pts[i + 1].x, by = pts[i + 1].y;
      const dx = bx - ax, dy = by - ay;
      const L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
      const cx = ax + dx * t, cy = ay + dy * t;
      if ((px - cx) * (px - cx) + (py - cy) * (py - cy) < r * r) return true;
    }
    return false;
  }

  // bomber / explosive-elite detonation
  _explodeEnemy(e) {
    const cfg = (e.spec && e.spec.explode) || (e.affix && e.affix.explode) || { r: 74, dmg: 24 };
    const lvlDmg = cfg.dmg * (1 + CONFIG.scaling.dmgPerLevel * (this.level - 1));
    this.addEffect({ kind: 'boom', x: e.x, y: e.y, r: cfg.r, t: 0, dur: 0.34 });
    Sound.play('explode');
    this.shake = Math.max(this.shake, 7);
    const p = this.player;
    if (Math.hypot(p.x - e.x, p.y - e.y) < cfg.r + p.r) { if (p.takeHit(lvlDmg, (this._foeName(e) || 'a bomber') + "'s blast")) this.shake = 9; }
    // also harms other enemies caught in the blast
    for (const o of this.enemiesInRadius(e.x, e.y, cfg.r)) {
      if (o === e) continue;
      const a = Math.atan2(o.y - e.y, o.x - e.x);
      this.hitEnemy(o, lvlDmg * 0.6, Math.cos(a) * 120, Math.sin(a) * 120, 'ability');
    }
  }

  _updatePickups(sdt) {
    const p = this.player;
    const magnet = 95, grab = p.r + 12;
    for (const pk of this.pickups) {
      if (pk.dead) continue;
      pk.t += sdt;
      // little pop on spawn, then settle
      pk.x += pk.vx * sdt; pk.y += pk.vy * sdt;
      pk.vx *= 0.88; pk.vy *= 0.88;
      const dx = p.x - pk.x, dy = p.y - pk.y, d = Math.hypot(dx, dy);
      if (d < magnet) { const s = (1 - d / magnet) * 420; pk.x += (dx / (d || 1)) * s * sdt; pk.y += (dy / (d || 1)) * s * sdt; }
      if (d < grab) { this._collect(pk); pk.dead = true; }
    }
    this.pickups = this.pickups.filter((pk) => !pk.dead);
  }

  _collect(pk) {
    if (pk.type === 'gold') {
      const g = Math.ceil(pk.value * this.player.mods.goldMult * (1 + this.metaB.gold)); this.gold += g; this.totalGold += g;
      this.goldPop = 1;                              // the HUD coin tally pops
      this._mote(pk.x, pk.y, '#ffe08a', { vy: -30, r: 1.6, twinkle: 1, dur: 0.35 });
      Sound.play('gold');
    }
    else if (pk.type === 'health') {
      if (this.player.mods.noHeal) return;                 // Famine Crown: no healing
      this.player.hp = Math.min(this.player.maxHP, this.player.hp + pk.value);
      this.effects.push({ kind: 'dmg', x: this.player.x, y: this.player.y - 30, text: '+' + pk.value,
        vy: -42, color: '#5ec860', t: 0, dur: 0.7 });
    }
    else if (pk.type === 'relic') {
      const p = this.player;
      p.relics.add(pk.relicId); recompute(p);
      p.hp = Math.min(p.hp, p.maxHP);                      // a cursed relic may have shrunk max HP
      const r = relicById(pk.relicId);
      this.namedToast = { name: 'CLAIMED', sub: r ? r.name : 'a relic', color: '#ffd36b', t: 0, dur: 3.0 };
      Sound.play('relic');
      for (let i = 0; i < 14; i++) this._mote(pk.x, pk.y, Math.random() < 0.5 ? '#ffd36b' : '#fff3c0',
        { vx: (Math.random() - 0.5) * 90, vy: -(40 + Math.random() * 90), g: 60, r: 1.6 + Math.random() * 1.6, twinkle: 1, dur: 0.7 });
    }
  }

  // flying debris chunks (bone, ash, stone, wisp) — gravity + spin, then fade
  _gib(x, y, color, n, power, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * power;
      this.effects.push({ kind: 'gib', x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - (30 + Math.random() * 70),
        g: opts.g ?? 540, size: opts.size ?? (2 + Math.random() * 3),
        rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 16,
        color, shape: opts.shape || 'rect', t: 0, dur: opts.dur ?? (0.4 + Math.random() * 0.4) });
    }
  }

  // soft expanding smoke/ash puffs
  _puff(x, y, color, n, spread, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * spread;
      this.effects.push({ kind: 'puff', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d,
        vx: Math.cos(a) * (10 + Math.random() * 26), vy: -(10 + Math.random() * 38),
        r0: opts.r0 ?? (3 + Math.random() * 5), r1: opts.r1 ?? (14 + Math.random() * 14),
        color, t: 0, dur: opts.dur ?? (0.4 + Math.random() * 0.3) });
    }
  }

  // Per-archetype death: each foe dies in its own characterful way.
  _spawnDeathFx(e) {
    const x = e.x, y = e.y, r = e.r, type = e.type;
    let style = 'collapse', dur = 0.4, tintCol = null;

    if (e.boss) {                              // bosses: a violent, ringing death
      style = 'collapse'; dur = 0.95;
      const hot = type === 'boss';
      this.addEffect({ kind: 'boom', x, y, r: r * 2.0, t: 0, dur: 0.6 });
      this.addEffect({ kind: 'ring', x, y, r: r * 2.6, color: '#ffffff', t: 0, dur: 0.5 });
      this.addEffect({ kind: 'ring', x, y, r: r * 3.6, color: hot ? '#ff7a3a' : '#cbd6ff', t: 0, dur: 0.75 });
      this._gib(x, y, hot ? '#7a2230' : '#4a4a5e', 28, 340, { dur: 1.0, size: 3 + Math.random() * 4 });
      this._puff(x, y, hot ? '#2a0e10' : '#14101e', 16, r, { r1: r * 1.5, dur: 0.9 });
      this.shake = Math.max(this.shake, 12);
    } else if (type === 'chaser') {            // skeleton: clatters apart into bones
      this._gib(x, y, '#ddd6c2', 9, 190, { dur: 0.6, size: 2 + Math.random() * 3, shape: 'bone' });
      this._puff(x, y - 2, '#b6b09c', 3, r * 0.5, { r1: r * 0.8, dur: 0.35 });
    } else if (type === 'swarmer') {           // imp: ruptures into crimson cinders + dark blood-smoke
      style = 'poof'; dur = 0.26; tintCol = '#ff8a5a';
      this._puff(x, y - 2, '#3a0c10', 5, r * 0.5, { r0: 3, r1: r * 1.3, dur: 0.4 });
      this.addEffect({ kind: 'ring', x, y: y - r * 0.3, r: r * 1.5, color: '#ff5a30', t: 0, dur: 0.26 });
      for (let i = 0; i < 8; i++) this._mote(x + (Math.random() - 0.5) * r, y - r * 0.3 + (Math.random() - 0.5) * r,
        Math.random() < 0.5 ? '#ff8a3a' : '#ff3a28',
        { vx: (Math.random() - 0.5) * 150, vy: -(20 + Math.random() * 120), g: 240, r: 1.5 + Math.random() * 1.6, dur: 0.35 + Math.random() * 0.3 });
    } else if (type === 'tank') {              // ogre: topples with a heavy dust-burst
      style = 'topple'; dur = 0.62;
      this._puff(x, y + r * 0.4, '#5a5048', 9, r * 0.9, { r0: 6, r1: r * 1.7, dur: 0.6 });
      this._gib(x, y, '#7a6a58', 13, 210, { dur: 0.7, size: 3 + Math.random() * 4 });
      this.addEffect({ kind: 'ring', x, y: y + r * 0.5, r: r * 1.9, color: 'rgba(150,135,110,0.6)', t: 0, dur: 0.4 });
      this.shake = Math.max(this.shake, 6);
    } else if (type === 'caster') {            // mage: arcane implosion + scattering wisps
      style = 'implode'; dur = 0.46;
      this.addEffect({ kind: 'ring', x, y, r: r * 2.2, color: '#9fd0ff', t: 0, dur: 0.4 });
      this._gib(x, y, '#7fd0ff', 10, 230, { dur: 0.55, size: 2 + Math.random() * 2, shape: 'wisp' });
      this._puff(x, y, '#5a8adf', 4, r * 0.3, { r1: r * 0.9, dur: 0.5 });
    } else if (type === 'bomber') {            // bomber: the blast does the talking; hurl blazing fire-bits
      style = 'poof'; dur = 0.24; tintCol = '#ffb060';
      this._gib(x, y, '#ff9a3a', 9, 260, { dur: 0.5, size: 2 + Math.random() * 3 });
      for (let i = 0; i < 6; i++) this._mote(x, y - r * 0.3, Math.random() < 0.5 ? '#ffd36b' : '#ff6a2a',
        { vx: (Math.random() - 0.5) * 160, vy: -(30 + Math.random() * 120), g: 220, r: 1.5 + Math.random() * 2, dur: 0.4 });
    } else {
      this._gib(x, y, '#cfd0da', 7, 180, { dur: 0.5 });
    }

    // elites die LOUD — an affix-coloured shockwave, a flash ring, a fan of
    // glowing motes + debris. You feel the threat extinguish.
    if (e.elite) {
      const col = (ELITE_AFFIXES[e.elite] && ELITE_AFFIXES[e.elite].color) || '#fff';
      this.addEffect({ kind: 'ring', x, y, r: r * 2.0, color: '#ffffff', t: 0, dur: 0.3 });
      this.addEffect({ kind: 'ring', x, y, r: r * 3.2, color: col, t: 0, dur: 0.55 });
      this._gib(x, y, col, 12, 300, { dur: 0.7, size: 2 + Math.random() * 3 });
      for (let i = 0; i < 14; i++) { const a = Math.random() * 6.28, s = 60 + Math.random() * 200;
        this._mote(x, y - r * 0.4, col, { vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, g: 160, drag: 0.97, r: 1.6 + Math.random() * 2, dur: 0.5 + Math.random() * 0.4 }); }
      this.shake = Math.max(this.shake, 6);
    }

    // the dissolving / animating corpse sprite
    this.effects.push({ kind: 'death', sprite: e.sprite, x, y, r, style, tintCol,
      faceLeft: e.faceLeft, boss: e.boss, t: 0, dur });

    // rising soul embers / wisps
    const n = e.boss ? 24 : 4;
    for (let i = 0; i < n; i++) {
      this.embers.push({ x: x + (Math.random() - 0.5) * r * 1.5,
        y: y - r * 0.5 + (Math.random() - 0.5) * r,
        vx: (Math.random() - 0.5) * 40, vy: -(40 + Math.random() * 70),
        r: 1 + Math.random() * 2, life: 0, dur: 0.5 + Math.random() * 0.7,
        hue: e.boss ? '#ff5a3a' : '#cfe0ff' });
    }
  }

  _spawnEmberBurst() {
    for (let i = 0; i < 80; i++) {
      this.embers.push({ x: this.cam.x + Math.random() * this.vw,
        y: this.cam.y + this.vh * (0.5 + Math.random() * 0.6),
        vx: (Math.random() - 0.5) * 30, vy: -(30 + Math.random() * 70),
        r: 1 + Math.random() * 2.5, life: 0, dur: 2 + Math.random() * 3,
        hue: Math.random() < 0.5 ? '#ff8a3a' : '#e9c84a' });
    }
  }

  // A boss broke a phase threshold: roar, flash, embers, and a banner. The boss
  // is briefly untouchable (handled in its AI) and the player gets a grace window
  // so the chaos never lands a cheap hit.
  onBossPhase(boss, def) {
    this.shake = Math.max(this.shake, 16);
    this.flashScreen = Math.max(this.flashScreen, 0.4);
    this.hitStop = Math.max(this.hitStop, 0.12);
    Sound.play('bossroar');
    Sound.setScene('boss');
    this._spawnEmberBurst();
    this.addEffect({ kind: 'boom', x: boss.x, y: boss.y, r: boss.r * 3.0, t: 0, dur: 0.5 });
    this.addEffect({ kind: 'ring', x: boss.x, y: boss.y, r: boss.r * 2, color: def.emberAura ? '#ff3a1e' : '#ff7a2a', t: 0, dur: 0.5 });
    if (this.player) this.player.invuln = Math.max(this.player.invuln, 0.7);
    this.bossPhase = { title: def.title, t: 0, dur: 2.0 };
    // the escort that was lying in wait now floods the chamber
    if (this.pendingEscort) { this.spawnQueue = this.pendingEscort; this.pendingEscort = null; this.spawnTimer = 0.5; }
  }

  // ---------- dread: the deeper you go, the more the dark watches back ----------
  // 0 at the surface, ramping to 1 in the depths. Early floors stay clean.
  _depth() { return Math.min(1, Math.max(0, (this.level - 1) / 17)); }

  _updateDread(dt) {
    // age & cull watchers; give them slow, occasional blinks
    for (const w of this.watchers) {
      w.t += dt;
      if (w.blinkT > 0) w.blinkT -= dt;
      else if (Math.random() < dt * 0.35) w.blinkT = 0.12;
    }
    if (this.watchers.length) this.watchers = this.watchers.filter((w) => w.t < w.dur);
    if (this.campWhisper) { this.campWhisper.t += dt; if (this.campWhisper.t >= this.campWhisper.dur) this.campWhisper = null; }

    const playing = this.state === 'playing' && this.countdown <= 0 && !this.cutscene;
    const inCamp = this.state === 'camp' && !this.descentJump;
    if ((!playing && !inCamp) || this.plunge || this.transition) return;
    const depth = this._depth();
    if (depth <= 0.04) return;

    // (eyes-in-the-dark "watchers" are disabled for now — revisit later)

    // intrusive whispers — only in the camp, where you decide whether to go on
    if (inCamp) {
      this._whisperT -= dt;
      if (this._whisperT <= 0 && !this.campWhisper) {
        this._whisperT = (15 - depth * 8) * (0.7 + Math.random() * 0.7);
        this._spawnCampWhisper(depth);
      }
    }
  }

  _spawnWatcher(depth) {
    const W = this.vw, H = this.vh;
    let sx, sy;
    const m = 0.05 + Math.random() * 0.12;
    if (Math.random() < 0.45) { sx = W * (Math.random() < 0.5 ? m : 1 - m); sy = H * (0.15 + Math.random() * 0.5); }
    else { sx = W * (0.12 + Math.random() * 0.76); sy = H * (0.11 + Math.random() * 0.26); }   // upper dark band
    const lerp = (a, b) => Math.round(a + (b - a) * depth);
    const color = `rgb(${lerp(150, 216)},${lerp(168, 32)},${lerp(188, 26)})`;   // pale slate → blood red
    // anchor to a WORLD position (cam + screen offset) so the eyes stay put in the
    // dark as the camera pans, instead of gliding along with the viewport.
    this.watchers.push({ x: this.cam.x + sx, y: this.cam.y + sy, t: 0, dur: 2.8 + Math.random() * 2.4,
      blinkT: 0, gap: 9 + Math.random() * 6, size: 2.2 + Math.random() * 1.2 + depth, color });
  }

  _spawnCampWhisper(depth) {
    const POOLS = [
      ['do you hear it?', 'deeper...', 'something stirs below.', 'you are not alone.', 'the dark remembers you.', 'come down.'],
      ['i see you.', 'they fell here too.', 'why do you still fight?', 'closer now.', 'you feel it, don’t you?', 'turn back. (you won’t.)'],
      ['i have been waiting.', 'you cannot turn back now.', 'give in.', 'your blade tires.', 'soon. so soon.', 'kneel.'],
    ];
    const tier = depth < 0.34 ? 0 : depth < 0.7 ? 1 : 2;
    const pool = POOLS[tier];
    const text = pool[(Math.random() * pool.length) | 0];
    this.campWhisper = { text, t: 0, dur: 4.6, fx: 0.3 + Math.random() * 0.4, fy: 0.2 + Math.random() * 0.22 };
    Sound.play('whisper');
  }

  _drawWatchers(ctx) {
    if (!this.watchers.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const w of this.watchers) {
      const k = w.t / w.dur;
      let a = Math.min(1, k * 6) * Math.min(1, (1 - k) * 4) * 0.85;
      if (w.blinkT > 0) a *= 0.04;
      const eye = (ex) => {
        const g = ctx.createRadialGradient(ex, w.y, 0, ex, w.y, w.size * 3.4);
        g.addColorStop(0, w.color); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = a * 0.85; ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(ex, w.y, w.size * 3.4, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = a; ctx.fillStyle = w.color;
        ctx.beginPath(); ctx.ellipse(ex, w.y, w.size * 0.62, w.size, 0, 0, Math.PI * 2); ctx.fill();
      };
      eye(w.x - w.gap / 2); eye(w.x + w.gap / 2);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  _drawDread(ctx) {
    if (this.state !== 'playing' && this.state !== 'camp') return;
    const W = this.vw, H = this.vh, depth = this._depth();
    const breathe = 0.5 + 0.5 * Math.sin(this.time * 0.7);
    let strength = depth * (0.2 + 0.08 * breathe);
    // low-HP dread: the edges throb red, faster, as death nears
    const p = this.player; let low = 0;
    if (p && this.state === 'playing' && p.hp > 0 && p.hp < p.maxHP * 0.3) {
      low = (0.5 + 0.5 * Math.sin(this.time * 4.2)) * (1 - p.hp / (p.maxHP * 0.3));
    }
    const a = strength + low * 0.32;
    if (a < 0.02) return;
    const red = Math.round(18 + 80 * depth + 130 * low);
    const g = ctx.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.3, W / 2, H * 0.5, Math.max(W, H) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(${red},6,8,${Math.min(0.82, a)})`);
    ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
  }

  _drawCampWhisper(ctx) {
    const w = this.campWhisper; if (!w) return;
    const k = w.t / w.dur;
    const a = Math.min(1, k * 4) * Math.min(1, (1 - k) * 3) * 0.55;
    if (a <= 0) return;
    const x = this.vw * w.fx, y = this.vh * w.fy;
    ctx.save();
    ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '15px "Silkscreen", monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(w.text, x + 1, y + 1);
    ctx.fillStyle = '#a3140f'; ctx.fillText(w.text, x, y);
    ctx.restore();
  }

  spawnDamageNumber(x, y, amount, source) {
    const big = source === 'ultimate';   // crits & the ultimate land BIG and gold
    const color = source === 'sword' ? '#ffffff' : source === 'ultimate' ? '#ffd36b' : '#bfe3ff';
    this.effects.push({ kind: 'dmg', x: x + (Math.random() - 0.5) * 10, y, text: '' + amount,
      vy: big ? -56 : -42, color, big, t: 0, dur: big ? 0.8 : 0.6 });
  }

  spawnFireball(x, y, ang, lvl) {
    this.allyProjectiles.push({ x, y, vx: Math.cos(ang) * 360, vy: Math.sin(ang) * 360,
      r: 9, life: 1.6, lvl, dead: false });
  }

  _explodeFireball(fb) {
    const p = this.player;
    const R = 38 + 4 * fb.lvl;                       // much tighter blast
    const dmg = (18 + 7 * fb.lvl) * p.mods.abilityDmgMult;
    for (const e of this.enemiesInRadius(fb.x, fb.y, R)) {
      const a = Math.atan2(e.y - fb.y, e.x - fb.x);
      this.hitEnemy(e, dmg, Math.cos(a) * 90, Math.sin(a) * 90, 'ability');
    }
    this.addEffect({ kind: 'boom', x: fb.x, y: fb.y, r: R, t: 0, dur: 0.32 });
    this.shake = Math.max(this.shake, 3);
  }

  _ultimate() {
    const p = this.player;
    Sound.play('ultimate');
    this.shake = Math.max(this.shake, 13);
    this.hitStop = Math.max(this.hitStop, 0.12);
    this.zoom = Math.max(this.zoom, 1);
    this._buzz(120);
    if (p.blade === 'ember') this._ultEruption();
    else if (p.blade === 'frost') this._ultAbsoluteZero();
    else if (p.blade === 'storm') this._ultThunderstorm();
    else this._ultNova();
  }

  _ultHit(e, dmg, kx = 0, ky = 0, slow = 0) {
    const wasAlive = !e.dead;
    e.takeHit(dmg, kx, ky);
    if (slow) e.applySlow(slow);
    this.spawnDamageNumber(e.x, e.y - e.r - 6, Math.round(dmg), 'ultimate');
    if (wasAlive && e.dead) this.onEnemyKilled(e, 'ultimate');
  }

  _ultNova() {                                            // fallback (no blade)
    const p = this.player, dmg = 120 * p.mods.abilityDmgMult;
    for (const e of this.enemies) { const a = Math.atan2(e.y - p.y, e.x - p.x); this._ultHit(e, dmg, Math.cos(a) * 420, Math.sin(a) * 420, 1.5); }
    this.addEffect({ kind: 'ult', x: p.x, y: p.y, t: 0, dur: 0.55, maxR: Math.hypot(this.vw, this.vh) });
    this.addEffect({ kind: 'banner', text: 'FURY UNLEASHED!', t: 0, dur: 1.1 });
    this.flashScreen = 0.22;
  }

  // 🔥 CATACLYSM — the fire ultimate in three acts:
  //   I.   A WALL OF FLAME rolls out from the knight across the entire arena,
  //        striking each foe as it reaches them — hurled, ignited, staggered
  //        hits that read as one travelling catastrophe.
  //   II.  The floor SPLITS: molten fissures radiate out — ours this time —
  //        burning anything that stands on them for seconds.
  //   III. The sky answers: pillars of flame rain on the survivors.
  //   ...and a lake of fire is left where he stood.
  _ultEruption() {
    const p = this.player, lvl = 1 + CONFIG.scaling.dmgPerLevel * (this.level - 1);
    const dmg = 130 * p.mods.abilityDmgMult * lvl;
    this.addEffect({ kind: 'banner', text: 'CATACLYSM', t: 0, dur: 1.3 });
    this.flashScreen = 0.32; this.flashCol = '#ffd9a0';
    Sound.play('explode'); Sound.play('bossroar', { vol: 0.35 });   // the deep rumble under it
    this.shake = Math.max(this.shake, 15);
    this.zoom = Math.max(this.zoom, 1.2);
    // ACT I — the travelling wave
    this.addEffect({ kind: 'firewave', x: p.x, y: p.y, t: 0, dur: 1.15, speed: 640, dmg, hit: new Set() });
    // ACT II — the floor splits (friendly fissures)
    this.spawnFissures(p.x, p.y, 6, dmg * 0.5, true);
    // ACT III — fire rains on whoever is left
    this.addEffect({ kind: 'firestorm', t: 0, dur: 2.3, strikeT: 0.35, dmg: dmg * 0.55 });
    // the lake of fire
    this.addEffect({ kind: 'erupt', x: p.x, y: p.y, t: 0, dur: 0.75, r: 170 });
    this.addEffect({ kind: 'lavafield', x: p.x, y: p.y, r: 150, t: 0, dur: 5.0, dmgT: 0.1, dmg: dmg * 0.2 });
    this._gib(p.x, p.y - 8, '#ff7a2a', 16, 240, { size: 3, g: 700 });
    this._gib(p.x, p.y - 8, '#3a1408', 8, 180, { size: 3, g: 800 });
  }

  // ❄️ ABSOLUTE ZERO — a freezing detonation that locks every foe on the floor
  // in solid ice (your strikes shatter them) and savages bosses.
  _ultAbsoluteZero() {
    const p = this.player, lvl = 1 + CONFIG.scaling.dmgPerLevel * (this.level - 1);
    const dmg = 95 * p.mods.abilityDmgMult * lvl;
    this.addEffect({ kind: 'banner', text: 'ABSOLUTE ZERO', t: 0, dur: 1.2 });
    this.flashScreen = 0.34; this.flashCol = '#dff2ff';
    Sound.play('crit', { vol: 0.7 });
    for (const e of this.enemies) {
      this._ultHit(e, dmg, 0, 0);
      if (e.dead) continue;
      if (e.boss) e.applySlow(3.5);
      else { e.frozenT = Math.max(e.frozenT, 4.2); e.frost = 0; }
      this.addEffect({ kind: 'ring', x: e.x, y: e.y, r: e.r + 8, color: '#bfe9ff', t: 0, dur: 0.45 });
      this._gib(e.x, e.y - e.r * 0.4, '#cdeeff', 4, 80, { size: 2 });
    }
    this.addEffect({ kind: 'frostnova', x: p.x, y: p.y, t: 0, dur: 0.95 });
  }

  // ⚡ THUNDERSTORM — the heavens open and bolts rain across the arena, chaining
  // between foes for a few seconds of relentless electrocution.
  _ultThunderstorm() {
    const p = this.player, lvl = 1 + CONFIG.scaling.dmgPerLevel * (this.level - 1);
    this.addEffect({ kind: 'banner', text: 'THUNDERSTORM', t: 0, dur: 1.2 });
    this.flashScreen = 0.28; this.flashCol = '#d9c8ff';
    Sound.play('crit', { vol: 0.7 });
    this.addEffect({ kind: 'thunderstorm', t: 0, dur: 2.7, strikeT: 0.05, dmg: 55 * p.mods.abilityDmgMult * lvl });
  }

  // lava-field damage ticks + thunderstorm strikes, run each combat frame
  _updateUltFx(sdt) {
    for (const fx of [...this.effects]) {
      if (fx.kind === 'lavafield') {
        fx.dmgT -= sdt;
        if (fx.dmgT <= 0) { fx.dmgT = 0.35; for (const e of this.enemiesInRadius(fx.x, fx.y, fx.r)) { this._ultHit(e, fx.dmg, 0, 0); if (!e.dead) { e.burnDmg = Math.max(e.burnDmg, fx.dmg * 0.5); e.burnT = Math.max(e.burnT, 1.4); } } }
      } else if (fx.kind === 'firewave') {
        // the travelling wall of flame: each foe is struck AS THE WAVE ARRIVES
        const r = fx.t * fx.speed;
        for (const e of this.enemies) {
          if (e.dead || fx.hit.has(e)) continue;
          const d = Math.hypot(e.x - fx.x, e.y - fx.y);
          if (d < r + 26 && d > r - 64) {
            fx.hit.add(e);
            const a = Math.atan2(e.y - fx.y, e.x - fx.x);
            this._ultHit(e, fx.dmg, Math.cos(a) * 480, Math.sin(a) * 480);
            if (!e.dead) { e.burnDmg = Math.max(e.burnDmg, fx.dmg * 0.12); e.burnT = Math.max(e.burnT, 4); e.burnTickT = Math.min(e.burnTickT || 9, 0.3); }
            this.addEffect({ kind: 'boom', x: e.x, y: e.y, r: e.r + 16, t: 0, dur: 0.3 });
            this.shake = Math.max(this.shake, 5);
          }
        }
      } else if (fx.kind === 'firestorm') {
        // fire rains on the survivors for a few seconds
        fx.strikeT -= sdt;
        if (fx.strikeT <= 0 && this.enemies.length) {
          fx.strikeT = 0.22;
          const e = this.enemies[(Math.random() * this.enemies.length) | 0];
          if (e && !e.dead) this.addEffect({ kind: 'firepillar', x: e.x + (Math.random() - 0.5) * 20,
            y: e.y + (Math.random() - 0.5) * 14, t: 0, dur: 0.62, warn: 0.26, dmg: fx.dmg, fired: false });
        }
      } else if (fx.kind === 'firepillar') {
        if (!fx.fired && fx.t >= fx.warn) {
          fx.fired = true;
          Sound.play('explode', { vol: 0.45 });
          this.shake = Math.max(this.shake, 6);
          for (const o of this.enemiesInRadius(fx.x, fx.y, 64)) {
            this._ultHit(o, fx.dmg, 0, 0);
            if (!o.dead) { o.burnDmg = Math.max(o.burnDmg, fx.dmg * 0.15); o.burnT = Math.max(o.burnT, 3); }
          }
        }
      } else if (fx.kind === 'thunderstorm') {
        fx.strikeT -= sdt;
        if (fx.strikeT <= 0 && this.enemies.length) {
          fx.strikeT = 0.1;
          const e = this.enemies[(Math.random() * this.enemies.length) | 0];
          if (e && !e.dead) {
            this.addEffect({ kind: 'megabolt', x: e.x, y: e.y, t: 0, dur: 0.22, seed: Math.random() * 99 });
            this._ultHit(e, fx.dmg, 0, 0); if (!e.boss) e.frozenT = Math.max(e.frozenT, 0.25);
            for (const o of this.enemiesInRadius(e.x, e.y, 95)) { if (o !== e && Math.random() < 0.6) { this.addEffect({ kind: 'bolt', pts: [{ x: e.x, y: e.y }, { x: o.x, y: o.y }], t: 0, dur: 0.14 }); this._ultHit(o, fx.dmg * 0.6, 0, 0); } }
            this.shake = Math.max(this.shake, 3.5);
            if (Math.random() < 0.3) { this.flashScreen = Math.max(this.flashScreen, 0.12); this.flashCol = '#d9c8ff'; }
          }
        }
      }
    }
  }

  _buildQueue(level) {
    const comp = LEVELS[level - 1];
    const q = [];
    for (const [type, count] of Object.entries(comp)) {
      for (let i = 0; i < count; i++) q.push(type);
    }
    // bosses first so they appear immediately
    q.sort((a, b) => (b.includes('boss') ? 1 : 0) - (a.includes('boss') ? 1 : 0));
    this.spawnQueue = q;
    this.totalForLevel = q.length;
  }

  // Spawn just off-camera, biased toward where the player is moving, so foes
  // walk into frame "as if they were already there".
  _spawnPos() {
    const p = this.player, b = this.bounds;
    const moving = p.moving && Math.hypot(p.fx, p.fy) > 0.01;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    let best = null;
    for (let tries = 0; tries < 12; tries++) {
      let x, y;
      if (moving && Math.random() < 0.72) {
        const ang = Math.atan2(p.fy, p.fx) + (Math.random() - 0.5) * 1.2;
        const dist = Math.max(this.vw, this.vh) * 0.42 + 40 + Math.random() * 110;
        x = clamp(p.x + Math.cos(ang) * dist, b.minX, b.maxX);
        y = clamp(p.y + Math.sin(ang) * dist, b.minY, b.maxY);
      } else {
        x = b.minX + Math.random() * (b.maxX - b.minX);
        y = b.minY + Math.random() * (b.maxY - b.minY);
      }
      best = [x, y];
      // prefer points that are currently off-screen (so they march in)
      const sx = x - this.cam.x, sy = y - this.cam.y;
      if (sx < -8 || sx > this.vw + 8 || sy < -8 || sy > this.vh + 8) break;
    }
    return best;
  }

  _spawn(dt) {
    if (!this.spawnQueue.length) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = CONFIG.spawn.interval;
    const n = Math.min(CONFIG.spawn.batch, this.spawnQueue.length);
    for (let i = 0; i < n; i++) {
      const type = this.spawnQueue.shift();
      const pos = this._spawnPos();   // bosses also stride in from off-screen
      const e = new Enemy(type, pos[0], pos[1], this.level);
      // empowered "elite" foe — forced by an event ambush, else rare & depth-scaled
      if (!e.boss) {
        if (this.forceElite > 0) { this.forceElite--; this._eliteify(e); }
        else if (this.level >= 3 && Math.random() < Math.min(0.16, 0.015 + this.level * 0.008)) this._eliteify(e);
      }
      this.enemies.push(e);
      // arrival tell: a brief soul-glow where the dark gives this one up, so foes
      // never just MATERIALIZE out of the black
      this.addEffect({ kind: 'spawnmark', x: e.x, y: e.y, r: e.r + 10, t: 0, dur: 0.6,
        color: e.elite ? (e.affix && e.affix.color) || '#ff7a2a' : (this.biome && this.biome.torch) || '#b06bff' });
      if (type === 'boss' || type === 'miniboss') break; // a boss is its own batch
    }
  }

  _eliteify(e) {
    const keys = Object.keys(ELITE_AFFIXES);
    const key = keys[(Math.random() * keys.length) | 0];
    e.applyElite(key, ELITE_AFFIXES[key]);
  }

  // The floor's named elite — a titled, relic-bearing herald that strides in
  // partway through the fight (or right before the floor would clear).
  _maybeSpawnNamed(sdt) {
    if (!this._namedDef) return;
    this._namedTimer -= sdt;
    if (this._namedTimer > 0) return;
    const def = this._namedDef; this._namedDef = null;
    const pos = this._spawnPos();
    const e = new Enemy(def.base, pos[0], pos[1], this.level);
    e.applyElite(def.affix, ELITE_AFFIXES[def.affix]);
    if (def.sprite) e.sprite = def.sprite;                   // its own brand-new creature sprite
    e.named = { name: def.name, color: def.color };
    e.maxHP = Math.round(e.maxHP * 1.7); e.hp = e.maxHP;     // a true mini-threat
    e.dropsRelic = true;
    this.enemies.push(e);
    this.addEffect({ kind: 'spawnmark', x: e.x, y: e.y, r: e.r + 18, t: 0, dur: 0.8, color: def.color });
    this.shake = Math.max(this.shake, 7);
    Sound.play('bossroar', { vol: 0.55 });
    this.namedToast = { name: def.name.toUpperCase(), sub: 'bears a relic', color: def.color, t: 0, dur: 2.6 };
  }

  // The Revenant strides in: your previous run, wearing your hero's body and the
  // Living Blade it died with. Slay it and it yields a relic — what you were,
  // returned to you.
  _maybeSpawnHusk(sdt) {
    if (!this._huskDef) return;
    this._huskTimer -= sdt;
    if (this._huskTimer > 0) return;
    const def = this._huskDef; this._huskDef = null;
    const pos = this._spawnPos();
    const e = new Enemy('revenant', pos[0], pos[1], this.level);
    const hero = CONFIG.heroes[def.hero] || CONFIG.heroes.knight;
    e.sprite = hero.sprite;
    const bd = def.blade ? bladeById(def.blade) : null;
    const col = bd ? bd.color : '#9aa6c0';
    e.named = { name: `The ${ordinal(def.n)} Sacrifice`, color: col };
    e.husk = def.blade || 'none';
    e.elite = 'husk'; e.affix = { name: 'Husk', color: col };  // elite dressing: ground ring + orbit motes
    e.auraT = Math.random() * 6.28;
    e.dropsRelic = true;
    // a Stormedge husk keeps its arc — a slow bolt loosed on the move
    if (def.blade === 'storm') {
      e.spec = { ...e.spec, ranged: { range: 300, keep: 0, cooldown: 3.6, projSpeed: 215, projDmg: 11 } };
      e.fireCD = 2.4;
    }
    this.enemies.push(e);
    this.addEffect({ kind: 'spawnmark', x: e.x, y: e.y, r: e.r + 18, t: 0, dur: 0.9, color: col });
    this.shake = Math.max(this.shake, 8);
    Sound.play('bossroar', { vol: 0.5 });
    Sound.play('whisper', { vol: 1.4 });
    this.namedToast = { name: e.named.name.toUpperCase(), sub: 'what you were, raised against you', color: col, t: 0, dur: 3.2 };
  }

  // Cinderstep: damage everything standing in the burning dash-trail.
  // (Hostile trails — laid by an Emberbrand husk — burn YOU instead.)
  _burnTrails(sdt) {
    for (const fx of this.effects) {
      if (fx.kind !== 'firetrail') continue;
      fx.dmgT = (fx.dmgT || 0) - sdt;
      if (fx.dmgT <= 0) {
        fx.dmgT = 0.22;
        if (fx.hostile) {
          const p = this.player;
          if (p && !p.dead && Math.hypot(p.x - fx.x, p.y - fx.y) < fx.r + p.r * 0.6) {
            if (p.takeHit(fx.hdmg, 'the cinders of what you were')) this.shake = Math.max(this.shake, 4);
          }
          continue;
        }
        const dmg = 9 * (1 + 0.5 * (this.level - 1) / 19) * this.player.mods.abilityDmgMult;
        for (const o of this.enemiesInRadius(fx.x, fx.y, fx.r)) this.hitEnemy(o, dmg, 0, 0, 'ability');
      }
    }
  }

  // ---------- perfect dodge ----------
  // Dash THROUGH an attack and the world holds its breath: slow-mo, a cold shock
  // ring, a burst of Fury, and your dash comes back almost at once so the dance
  // can continue. One per dash (the window is consumed on trigger).
  _perfectDodge(x, y) {
    const p = this.player;
    p.parryT = 0;
    p.dashCD = Math.min(p.dashCD, p.dashCooldown0 * 0.25);
    p.fury = Math.min(p.furyMax, p.fury + 8 * p.mods.furyMult);
    this.slowmo = 0.4;
    this.hitStop = Math.max(this.hitStop, 0.045);
    this.shake = Math.max(this.shake, 5);
    this.zoom = Math.max(this.zoom, 0.9);
    this.addEffect({ kind: 'ring', x, y, r: 64, color: '#bfe9ff', t: 0, dur: 0.34 });
    this.addEffect({ kind: 'hitring', x, y, r: 34, t: 0, dur: 0.2 });
    this.effects.push({ kind: 'dmg', x: p.x, y: p.y - 44, text: 'PERFECT', vy: -36,
      color: '#9fe8ff', big: true, t: 0, dur: 0.7 });
    this._hitBurst(x, y, Math.atan2(y - (p.y - 16), x - p.x), 1.2);
    Sound.play('parry');
    this._buzz(45);
  }

  // ---------- dash ----------
  onDash(player) {
    this.shake = Math.max(this.shake, 2.5);
    Sound.play('dash');
    this._dashGhostT = 0;
    const a = Math.atan2(player.fy, player.fx);
    // a bright launch streak + a spray of sparks kicked out behind the heel
    this.effects.push({ kind: 'dashstreak', x: player.x, y: player.y - 16, a, t: 0, dur: 0.26 });
    for (let i = 0; i < 7; i++) {
      const sa = a + Math.PI + (Math.random() - 0.5) * 1.1, s = 70 + Math.random() * 120;
      this.effects.push({ kind: 'spark', x: player.x - Math.cos(a) * 8, y: player.y - 14 - Math.sin(a) * 8,
        vx: Math.cos(sa) * s, vy: Math.sin(sa) * s, t: 0, dur: 0.3, col: '#bfe9ff' });
    }
    // Cinderstep (keystone): drop the first ember where he launches; the rest is
    // laid down frame-by-frame in _emitDashFire so it trails off his boots.
    if (player.mods.dashFireTrail) { this._fireDist = 99; this._lastFireX = player.x; this._lastFireY = player.y; }
    // Ride the Lightning (Stormedge): the dash itself looses an arc
    if (player.blade === 'storm' && player.bladeUp.has('storm_dash')) {
      const t = this.nearestEnemy(player.x, player.y, 210);
      if (t) {
        this.addEffect({ kind: 'bolt', pts: [{ x: player.x, y: player.y - 14 }, { x: t.x, y: t.y }], t: 0, dur: 0.16 });
        this.hitEnemy(t, player.swordDamage * 0.9, 0, 0, 'ability');
        Sound.play('crit', { vol: 0.4 });
      }
    }
  }

  // Lay burning footprints along the dash as the knight travels (Cinderstep).
  _emitDashFire(p) {
    if (!p.dashing) { this._lastFireX = p.x; this._lastFireY = p.y; return; }
    const lx = this._lastFireX ?? p.x, ly = this._lastFireY ?? p.y;
    this._fireDist = (this._fireDist || 0) + Math.hypot(p.x - lx, p.y - ly);
    this._lastFireX = p.x; this._lastFireY = p.y;
    if (this._fireDist >= 8) {
      this._fireDist = 0;
      this.effects.push({ kind: 'firetrail', x: p.x, y: p.y + 2, r: 24, t: 0, dur: 1.15, dmgT: 0.05,
        seed: Math.random() * 6.28 });
    }
  }

  // glowing after-image trail while dashing (used in play AND the camp room)
  _dashTrail(p, sdt) {
    if (!p.dashing) return;
    this._dashGhostT = (this._dashGhostT || 0) - sdt;
    if (this._dashGhostT <= 0) {
      this._dashGhostT = 0.026;
      this.effects.push({ kind: 'ghost', sprite: p.sprite, frame: pickFrame(p, this.time),
        x: p.x, y: p.y, faceLeft: p.faceLeft, t: 0, dur: 0.3 });
    }
  }

  // ---------- swing ----------
  onSwing(player) {
    this.shake = Math.max(this.shake, 3.5);
    // each blade sounds like its element (fire roars, ice shings, storm rips)
    Sound.play(player.blade ? 'swing_' + player.blade : 'swing');
    const style = (player.hero && player.hero.swingStyle) || 'sweep';
    // visual lives LONGER than the hit window so the slash actually reads on
    // screen — and each element keeps its own time: storm SNAPS, fire rolls,
    // frost stands frozen a beat
    const dur = style === 'stab' ? 0.2
      : player.blade === 'storm' ? 0.22
      : player.blade === 'ember' ? 0.5
      : player.blade === 'frost' ? 0.55 : 0.32;
    // anchor at the torso, not the feet (sprites are feet-anchored) so the slash
    // radiates from the knight's body evenly in every facing direction
    this.effects.push({ kind: 'swing', t: 0, dur, style, blade: player.blade,
      x: player.x, y: player.y - 16, angle: player.facingAngle, seed: Math.random() * 6.28 });
    // each Living Blade throws its own elemental flourish off the cut
    if (player.blade) this._bladeSwingFx(player);
    // Trail of Cinders (Emberbrand evolution): the swing scorches the ground
    if (player.bladeUp && player.bladeUp.has('ember_trail')) {
      const a = player.facingAngle;
      for (let i = 0; i < 3; i++) {
        const d = 14 + i * 13;
        this.effects.push({ kind: 'firetrail', x: player.x + Math.cos(a) * d, y: player.y + Math.sin(a) * d + 2,
          r: 22, t: 0, dur: 1.0, dmgT: 0.05, seed: Math.random() * 6.28 });
      }
    }
  }

  // knockback resistance: bosses are immovable, tanks heavy, trash light
  _kbResist(e) { return e.boss ? 0.07 : (e.type === 'tank' ? 0.4 : 1); }

  _applySwingDamage() {
    const p = this.player;
    if (p.swingTimer <= 0) return;
    const kbStrength = p.hero.knockback;
    const missing = 1 - p.hp / p.maxHP;
    const berserk = p.relics.has('berserk') ? 1 + 0.45 * missing : 1;
    for (const e of this.enemies) {
      if (p.hitThisSwing.has(e)) continue;
      if (inSwingArc(p, e)) {
        const [kx, ky] = [Math.cos(p.facingAngle), Math.sin(p.facingAngle)];
        // bosses are heavy — barely shoved (stops perma-knockback cheese)
        const kb = kbStrength * this._kbResist(e);
        let dmg = p.swordDamage * berserk;
        // a running kill-streak sharpens the blade (+1%/kill, capped at +30%)
        dmg *= 1 + Math.min(0.30, this.combo * 0.01);
        if (p.relics.has('exec') && e.hp < e.maxHP * 0.35) dmg *= 1.7;
        // Rogue: chance to crit
        let crit = false;
        if (p.hero.crit && Math.random() < p.hero.crit) { dmg *= p.hero.critMult; crit = true; }
        this.hitEnemy(e, dmg, kx * kb, ky * kb, crit ? 'ultimate' : 'sword');
        p.hitThisSwing.add(e);
        Sound.play(e.boss ? 'bosshit' : crit ? 'crit' : 'hit');
        // --- the "fuck yeah" impact: directional sparks, a flash ring, a slash
        // mark across the foe, crunchy hitstop + shake scaled to the blow ---
        const ix = e.x, iy = e.y - e.r * 0.35, power = crit ? 1.7 : 1;
        if (crit) this.zoom = Math.max(this.zoom, 0.45);   // crits punch the camera in
        this._hitBurst(ix, iy, p.facingAngle, power);
        this.addEffect({ kind: 'hitring', x: ix, y: iy, r: (e.boss ? 40 : 24) * power, t: 0, dur: 0.18 });
        this.addEffect({ kind: 'slash', x: ix, y: iy, angle: p.facingAngle + Math.PI / 2, len: e.r * 2.0 + 14, t: 0, dur: 0.14 });
        // the element answers every connect — fire pops, ice cracks, storm jolts
        if (p.blade === 'ember') {
          for (let i = 0; i < 4; i++) this._mote(ix + (Math.random() - 0.5) * 10, iy + (Math.random() - 0.5) * 8,
            Math.random() < 0.5 ? '#ffd36b' : '#ff7a2a',
            { vx: (Math.random() - 0.5) * 40, vy: -(30 + Math.random() * 50), g: -40, r: 1.4 + Math.random() * 1.6, twinkle: 1, dur: 0.4 + Math.random() * 0.3 });
          this.addEffect({ kind: 'ring', x: ix, y: iy, r: 18, color: '#ff7a2a', t: 0, dur: 0.22 });
          Sound.play('hit_ember', { vol: 0.7 });
        } else if (p.blade === 'frost') {
          this._gib(ix, iy, '#cdeeff', 4, 100, { size: 2 });
          for (let i = 0; i < 3; i++) {
            const aa = p.facingAngle + (Math.random() - 0.5) * 1.6, s = 120 + Math.random() * 120;
            this.effects.push({ kind: 'spark', x: ix, y: iy, vx: Math.cos(aa) * s, vy: Math.sin(aa) * s, t: 0, dur: 0.26, streak: true, col: '#dffaff' });
          }
          Sound.play('hit_frost', { vol: 0.6 });
        } else if (p.blade === 'storm') {
          const ja = Math.random() * 6.28;
          this.addEffect({ kind: 'bolt', pts: [{ x: ix, y: iy },
            { x: ix + Math.cos(ja) * 14, y: iy + Math.sin(ja) * 14 },
            { x: ix + Math.cos(ja + 0.5) * 24, y: iy + Math.sin(ja + 0.5) * 24 }], t: 0, dur: 0.12 });
          Sound.play('hit_storm', { vol: 0.55 });
        }
        this.hitStop = Math.max(this.hitStop, e.boss ? 0.08 : (e.type === 'tank' || e.elite) ? 0.06 : (crit ? 0.06 : 0.035));
        this.shake = Math.max(this.shake, e.boss ? 7 : (crit ? 7 : 4.5));
        // Paladin: crushing blows ripple out a shockwave
        if (p.hero.shockwave) {
          this.addEffect({ kind: 'ring', x: e.x, y: e.y, r: 48, color: '#e9c84a', t: 0, dur: 0.3 });
          for (const o of this.enemiesInRadius(e.x, e.y, 48)) {
            if (o === e || p.hitThisSwing.has(o)) continue;
            const a = Math.atan2(o.y - e.y, o.x - e.x);
            const sk = 200 * this._kbResist(o);
            this.hitEnemy(o, dmg * 0.32, Math.cos(a) * sk, Math.sin(a) * sk, 'ability');
            p.hitThisSwing.add(o);
          }
          this.hitStop = Math.max(this.hitStop, 0.04);
        }
      }
    }
    // deflect projectiles caught in the arc
    for (const pr of this.projectiles) {
      const dx = pr.x - p.x, dy = pr.y - p.y;
      if (Math.hypot(dx, dy) <= p.reach) {
        const a = Math.atan2(dy, dx);
        let d = (a - p.facingAngle) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
        if (Math.abs(d) <= (p.arcDeg * Math.PI / 180) / 2) {
          pr.dead = true; this._spark(pr.x, pr.y);
        }
      }
    }
  }

  // Arrival tell: an expanding soul-ring + rising wisps where a foe enters the
  // floor — the dark announces what it gives up.
  _drawSpawnMark(ctx, fx) {
    const k = fx.t / fx.dur, a = (1 - k) * 0.9;
    if (a <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a;
    ctx.strokeStyle = fx.color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(fx.x, fx.y + 2, fx.r * (0.4 + k * 1.1), fx.r * (0.4 + k * 1.1) * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = a * 0.5;
    ctx.beginPath(); ctx.ellipse(fx.x, fx.y + 2, fx.r * (0.2 + k * 0.7), fx.r * (0.2 + k * 0.7) * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
    // wisps streaming up out of the mark
    ctx.fillStyle = fx.color;
    for (let i = 0; i < 4; i++) {
      const wx = fx.x + Math.sin(i * 2.4 + fx.x) * fx.r * 0.5;
      const wy = fx.y - k * (16 + i * 7);
      ctx.globalAlpha = a * (1 - i * 0.18);
      ctx.fillRect(wx - 1, wy - 1, 2, 2);
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  // When only stragglers remain and they're off-screen, a pulsing chevron on the
  // screen edge points the way — no more wandering the dark for the last imp.
  _drawStragglerPing(ctx) {
    if (this.state !== 'playing' || this.cutscene || this.countdown > 0) return;
    if (this.spawnQueue.length || !this.enemies.length || this.enemies.length > 3) return;
    const m = 38, pulse = 0.6 + 0.4 * Math.sin(this.time * 6);
    for (const e of this.enemies) {
      const sx = e.x - this.cam.x, sy = e.y - this.cam.y;
      if (sx > -20 && sx < this.vw + 20 && sy > -20 && sy < this.vh + 20) continue;   // visible already
      const dx = sx - this.vw / 2, dy = sy - this.vh / 2;
      const k = Math.min((this.vw / 2 - m) / Math.max(1e-6, Math.abs(dx)), (this.vh / 2 - m) / Math.max(1e-6, Math.abs(dy)));
      const px = this.vw / 2 + dx * k, py = this.vh / 2 + dy * k;
      const col = (e.named && e.named.color) || (e.elite && e.affix && e.affix.color) || '#ff8a5a';
      ctx.save();
      ctx.translate(px, py); ctx.rotate(Math.atan2(dy, dx));
      ctx.globalAlpha = 0.85 * pulse;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-4, -7); ctx.lineTo(-1, 0); ctx.lineTo(-4, 7); ctx.closePath(); ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  _spark(x, y) {
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 120;
      this.effects.push({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        t: 0, dur: 0.3 });
    }
  }

  // A directional shower of hot streak-sparks fired out along `ang` — the spray
  // that sells a clean sword hit. `power` scales count + speed (crits hit harder).
  _hitBurst(x, y, ang, power = 1) {
    const n = Math.round(7 * power);
    for (let i = 0; i < n; i++) {
      const a = ang + (Math.random() - 0.5) * 1.2;
      const s = (150 + Math.random() * 240) * power;
      this.effects.push({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        t: 0, dur: 0.2 + Math.random() * 0.14, streak: true,
        col: Math.random() < 0.5 ? '#ffffff' : '#cfeaff' });
    }
    // a stubby cluster of slow embers at the point of impact
    for (let i = 0; i < 3; i++) {
      const a = ang + (Math.random() - 0.5) * 2.4, s = 30 + Math.random() * 50;
      this.effects.push({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        t: 0, dur: 0.16 + Math.random() * 0.1, col: '#9fd0ff' });
    }
  }

  // A single drifting glow-mote (used for elite auras, ember rain, frost mist...).
  _mote(x, y, color, opts = {}) {
    this.effects.push({ kind: 'mote', x, y,
      vx: opts.vx ?? 0, vy: opts.vy ?? 0, g: opts.g ?? 0, drag: opts.drag ?? 1,
      r: opts.r ?? 2, color, glow: opts.glow !== false, twinkle: opts.twinkle || 0,
      t: 0, dur: opts.dur ?? (0.5 + Math.random() * 0.5) });
  }

  // Ambient particle breath for every elite on screen — each affix exhales its
  // own threat: fire-rain, frost-mist, blood-drip, sparks. Throttled by sdt so
  // it scales with framerate, not enemy count.
  _emitAuras(sdt) {
    const rate = (per) => Math.random() < per * sdt * 60;   // ~per particles/frame@60
    const p = this.player;
    // the blessed knight sheds slow rising motes of holy light
    if (p && this.furyReady && this.countdown <= 0 && rate(0.6)) {
      this._mote(p.x + (Math.random() - 0.5) * p.r * 1.6, p.y - 6 - Math.random() * 10,
        Math.random() < 0.5 ? '#ffe9a8' : '#ffd36b',
        { vx: (Math.random() - 0.5) * 10, vy: -(18 + Math.random() * 24), g: -10, r: 1.4 + Math.random() * 1.4, twinkle: 1, dur: 0.6 + Math.random() * 0.4 });
    }
    // footstep dust kicked up underfoot as the hero runs
    if (p && p.moving && (p.dashTimer || 0) <= 0 && this.countdown <= 0 && rate(0.4)) {
      this._puff(p.x + (Math.random() - 0.5) * 8, p.y, '#4a4350', 1, 0, { r0: 2, r1: 8, dur: 0.34 });
    }
    for (const e of this.enemies) {
      if (e.dead) continue;
      // heavy foes throw up dust with every stride
      if ((e.type === 'tank' || e.boss) && e.moving && rate(e.boss ? 0.5 : 0.3)) {
        this._puff(e.x + (Math.random() - 0.5) * e.r, e.y, '#4a4248', 1, 0, { r0: 3, r1: e.boss ? 16 : 10, dur: 0.45 });
      }
      if (e.boss) continue;
      const x = e.x, y = e.y - e.r * 0.4, r = e.r;
      if (e.type === 'bomber') {                 // a hissing, smoking fuse
        if (rate(0.5)) this._mote(x + (Math.random() - 0.5) * r, y - r * 0.8,
          Math.random() < 0.5 ? '#ffd36b' : '#ff7a2a', { vy: -(20 + Math.random() * 30), g: -40, r: 1.5 + Math.random(), dur: 0.4 });
        continue;
      }
      if (!e.elite) continue;
      switch (e.elite) {
        case 'explosive': {                      // smouldering — rains embers, glows hot
          if (rate(0.9)) this._mote(x + (Math.random() - 0.5) * r * 1.4, y + (Math.random() - 0.5) * r,
            Math.random() < 0.4 ? '#ffe08a' : (Math.random() < 0.6 ? '#ff7a2a' : '#e0401a'),
            { vx: (Math.random() - 0.5) * 20, vy: -(25 + Math.random() * 45), g: -30, r: 1.5 + Math.random() * 1.8, dur: 0.5 + Math.random() * 0.4 });
          break;
        }
        case 'icy': {                            // a slow, cold frost-mist + ice motes
          if (rate(0.7)) this._mote(x + (Math.random() - 0.5) * r * 1.8, y + (Math.random() - 0.5) * r * 1.2,
            Math.random() < 0.5 ? '#dffaff' : '#9fe0ff',
            { vx: (Math.random() - 0.5) * 12, vy: (Math.random() - 0.3) * 14, drag: 0.95, r: 1.2 + Math.random() * 1.6, twinkle: 1, dur: 0.8 + Math.random() * 0.6 });
          break;
        }
        case 'vampiric': {                       // weeps blood, pulses a dark heart
          if (rate(0.5)) this.effects.push({ kind: 'gib', x: x + (Math.random() - 0.5) * r * 1.2, y: y + Math.random() * r * 0.5,
            vx: (Math.random() - 0.5) * 16, vy: 10 + Math.random() * 30, g: 380, size: 1.5 + Math.random() * 1.5,
            rot: 0, vr: 0, color: Math.random() < 0.5 ? '#8a1518' : '#5a0c10', shape: 'rect', t: 0, dur: 0.5 + Math.random() * 0.3 });
          if (rate(0.5)) this._mote(x + (Math.random() - 0.5) * r * 2.4, y + (Math.random() - 0.5) * r * 2,
            '#d8413a', { vx: 0, vy: 0, r: 1.4 + Math.random(), dur: 0.4, twinkle: 1 });
          break;
        }
        case 'swift': {                          // crackling, electric — darting sparks
          if (rate(0.8)) { const a = Math.random() * 6.28, s = 40 + Math.random() * 90;
            this.effects.push({ kind: 'spark', x: x + (Math.random() - 0.5) * r, y: y + (Math.random() - 0.5) * r,
              vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, dur: 0.18 + Math.random() * 0.12, streak: true, col: '#bfffff' }); }
          break;
        }
        case 'husk': {                           // the unmade — cold ash rising off a hollow body
          if (rate(0.7)) this._mote(x + (Math.random() - 0.5) * r * 1.6, y + (Math.random() - 0.5) * r,
            Math.random() < 0.6 ? '#3a3346' : e.affix.color,
            { vx: (Math.random() - 0.5) * 10, vy: -(16 + Math.random() * 26), g: -14,
              r: 1.3 + Math.random() * 1.5, twinkle: 1, dur: 0.6 + Math.random() * 0.5 });
          break;
        }
        case 'armored': {                        // heavy — occasional grinding spark + dust
          if (rate(0.35)) { const a = Math.random() * 6.28, s = 30 + Math.random() * 60;
            this.effects.push({ kind: 'spark', x: x + Math.cos(a) * r, y: y + Math.sin(a) * r,
              vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, t: 0, dur: 0.25, col: '#fff0d0' }); }
          break;
        }
      }
    }
  }

  // Fury button: a fixed control centred at the bottom, between move + swing.
  _updateFuryButton() {
    const ib = this.input.furyBtn || (this.input.furyBtn = { x: 0, y: 0, r: 0, visible: false });
    if (this.furyReady && this.state === 'playing' && this.countdown <= 0) {
      ib.x = this.vw / 2;
      ib.y = this.vh - (this.input.btn.r || 60) - 30;
      ib.r = 30; ib.visible = true;
    } else { ib.visible = false; }
  }

  _smooth(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }

  // Haptic tick (mobile): a tiny vibration on the big beats. Throttled so swarm
  // kills don't rattle the phone; silently unsupported on iOS Safari.
  _buzz(ms) {
    if (!navigator.vibrate) return;
    const now = performance.now();
    if (now - (this._buzzT || 0) < 90) return;
    this._buzzT = now;
    try { navigator.vibrate(ms); } catch (e) { /* ignore */ }
  }

  // The boss-entrance cutscene: the knight stands at the chamber mouth, scanning
  // the dark and breathing, then the altar wakes and the boss drags itself up
  // out of the ritual symbol. Then the fight begins.
  _updateCutscene(dt) {
    const cs = this.cutscene, p = this.player, boss = this.cutsceneBoss;
    cs.t += dt;
    const cx = this.world.w / 2, cy = this.world.h / 2;
    const total = cs.look + cs.rise + cs.settle;

    p.moving = false; p.attackAnim = 0; p.swingTimer = 0; p.dashTimer = 0;
    if (cs.t < cs.look) p.faceLeft = Math.sin(cs.t * 1.5) < 0;   // curious — scanning left and right
    else p.faceLeft = false;                                     // fixated on the rising shape

    // camera drifts from the knight up to the altar as the menace reveals itself
    const focusY = cy + (1 - this._smooth(cs.t / cs.look)) * 155;
    const tx = Math.max(0, Math.min(this.world.w - this.vw, cx - this.vw / 2));
    const ty = Math.max(0, Math.min(this.world.h - this.vh, focusY - this.vh / 2));
    const k = Math.min(1, dt * 2.4);
    this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * k;

    if (cs.t >= cs.look) {                                        // RISE
      const rp = Math.min(1, (cs.t - cs.look) / cs.rise);
      boss.rising = this._smooth(rp);
      this.shake = Math.max(this.shake, 1 + 5 * rp);              // building rumble
      if (Math.random() < dt * 34) {
        this._mote(cx + (Math.random() - 0.5) * 74, cy + 8, Math.random() < 0.5 ? '#ff6a2a' : '#b81810',
          { vy: -(22 + Math.random() * 46), g: -12, r: 1.5 + Math.random() * 1.7, twinkle: 1, dur: 0.8 + Math.random() * 0.4 });
      }
      if (!cs.roared && rp > 0.62) {
        cs.roared = true; Sound.play('bossroar');
        this.shake = Math.max(this.shake, 16); this.flashScreen = Math.max(this.flashScreen, 0.28);
      }
    } else if (Math.random() < dt * 9) {                         // faint awakening glimmer at the symbol
      this._mote(cx + (Math.random() - 0.5) * 44, cy + 6, '#7a2ed0', { vy: -12, r: 1.2, twinkle: 1, dur: 0.7 });
    }

    this._updateProjAndFx(dt);

    if (cs.t >= total) {                                          // → FIGHT
      this.cutscene = null; this.cutsceneBoss = null;
      boss.inert = false; boss.rising = 1; boss.state = 'walk';
      p.invuln = 0.9;
      this.countdown = 0;
      Sound.play('fight');
    }
  }

  // Camera follows the hero with a GENTLE ease (restores the smooth feel; the
  // actual move speed is constant because that bug was in the joystick, not here).
  _updateCamera(dt) {
    if (this.state === 'camp' || this.state === 'shrine' || this.state === 'prologue' || this.cutscene) return;   // these scenes own the camera
    const cw = this.world.w - this.vw, ch = this.world.h - this.vh;
    if (this.state === 'title' || !this.player) {
      this.cam.x = Math.max(0, Math.min(cw, this.world.w / 2 - this.vw / 2));
      this.cam.y = Math.max(0, Math.min(ch, this.world.h / 2 - this.vh / 2));
      return;
    }
    const tx = Math.max(0, Math.min(cw, this.player.x - this.vw / 2));
    const ty = Math.max(0, Math.min(ch, this.player.y - this.vh / 2));
    const k = Math.min(1, (dt || 0.016) * 12);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
  }

  // ---------- update ----------
  _update(dt) {
    this.time += dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 24);
    if (this.flashScreen > 0) this.flashScreen -= dt;
    if (this.bossPhase) { this.bossPhase.t += dt; if (this.bossPhase.t >= this.bossPhase.dur) this.bossPhase = null; }

    this._updateCamera(dt);
    this._updateAmbient(dt);     // embers, transition, intro, sweep, hp bar — run in every state
    this._updateDread(dt);       // eyes in the dark + intrusive whispers, escalating with depth

    // hold the world while the slash-wipe / plunge-fall covers the screen
    // (the title camp is the exception: the knight finishes sinking into the
    // pit UNDER the falling black — freezing him mid-leap reads as a hitch)
    if (this.transition && this.transition.t < this.transition.half) return;
    if (this.plunge && this.plunge.t < this.plunge.half && this.state !== 'title') return;

    if (this.state === 'playing' || this.state === 'camp' || this.state === 'shrine') this.runT = (this.runT || 0) + dt;

    if (this.state === 'dying') return this._updateDying(dt);
    if (this.state === 'won') return this._updateWon(dt);
    if (this.state === 'camp') return this._updateCamp(dt);
    if (this.state === 'title') return this._updateTitleCamp(dt);
    if (this.state === 'prologue') return this._updatePrologue(dt);
    if (this.state === 'shrine') return this._updateShrine(dt);
    if (this.state === 'intro') return this._updateIntro(dt);
    if (this.state === 'interlude') return this._updateInterlude(dt);
    if (this.state !== 'playing') return;

    if (this.cutscene) return this._updateCutscene(dt);   // scripted boss entrance

    // brief hit-pause freezes the simulation for weight
    if (this.hitStop > 0) { this.hitStop -= dt; return; }

    // perfect-dodge slow-mo: the world holds its breath, then eases back up
    if (this.slowmo > 0) { this.slowmo -= dt; this.timeScale = 0.35; }
    else if (this.timeScale < 1) this.timeScale = Math.min(1, this.timeScale + dt * 5);

    const sdt = dt * this.timeScale;
    this.input.poll();
    const p = this.player;
    p.update(sdt, this.input, this);
    this._applySwingDamage();

    // pre-level countdown: you can move, but nothing spawns until "FIGHT!"
    if (this.countdown > 0) {
      const was = this.countdown;
      this.countdown -= dt;
      if (was > 0 && this.countdown <= 0) Sound.play('fight');   // the bell that starts the wave
      this._updateProjAndFx(sdt);
      return;
    }

    this._updateAbilities(sdt);
    // Heart of Fury (keystone): Fury builds endlessly on its own — a fresh
    // ultimate roughly every ~11s (slow enough that the double-damage bites
    // between unleashes, not a spammable room-clear).
    if (p.mods.furyLocked) p.fury = Math.min(p.furyMax, p.fury + p.furyMax * sdt / 11);
    // Fury no longer auto-fires — it arms a button the player taps to unleash.
    const wasFury = this.furyReady;
    this.furyReady = p.fury >= p.furyMax;
    if (this.furyReady && !wasFury) Sound.play('furyready');
    this._updateFuryButton();
    if (this.furyReady && this.input.furyTapped) {
      this.input.furyTapped = false; p.fury = 0; this.furyReady = false; this._ultimate();
    } else if (this.input.furyTapped) { this.input.furyTapped = false; }
    this._dashTrail(p, sdt);
    this._spawn(sdt);
    this._maybeSpawnNamed(sdt);                 // the floor's named elite herald
    this._maybeSpawnHusk(sdt);                  // the Revenant — your previous run, raised
    if (p.mods.dashFireTrail) this._emitDashFire(p);
    this._burnTrails(sdt);                      // dash + Cinderstep + ember-swing flames

    for (const e of this.enemies) e.update(sdt, this);
    // an Emberbrand husk scorches the ground in its rush — your Cinderstep, turned on you
    for (const e of this.enemies) {
      if (e.husk === 'ember' && e.state === 'charging' && Math.random() < sdt * 26) {
        this.effects.push({ kind: 'firetrail', hostile: true, x: e.x, y: e.y + 2, r: 22, t: 0, dur: 1.1,
          dmgT: 0.1, hdmg: 7 * (1 + CONFIG.scaling.dmgPerLevel * (this.level - 1)), seed: Math.random() * 6.28 });
      }
    }
    this._updateStatuses(sdt);                  // blade burn DoT / permafrost
    this._updateUltFx(sdt);                     // lava field / thunderstorm strikes
    this._emitAuras(sdt);
    this._updateProjAndFx(sdt);
    this._updatePickups(sdt);
    this._separate();

    // collisions: enemy contact (threading one mid-dash = a PERFECT dodge)
    for (const e of this.enemies) {
      const dx = p.x - e.x, dy = p.y - e.y;
      if (Math.hypot(dx, dy) < p.r + e.r) {
        if (p.parryT > 0 && !p.dead) { this._perfectDodge(e.x, e.y - e.r * 0.4); continue; }
        if (p.takeHit(e.cdmg || e.damage, this._foeName(e))) {
          this.shake = Math.max(this.shake, 6);
          if (e.elite === 'icy' || e.husk === 'frost') p.slowT = 1.3;   // Frostbound chills you
          if (e.type === 'bomber') { e.dead = true; this._explodeEnemy(e); } // detonates on contact
        }
      }
    }
    // collisions: projectiles vs player (Mirror Aegis makes these hit twice as hard)
    for (const pr of this.projectiles) {
      if (pr.dead) continue;
      const dx = p.x - pr.x, dy = p.y - pr.y;
      if (Math.hypot(dx, dy) < p.r + pr.r) {
        if (p.parryT > 0 && !p.dead) { pr.dead = true; this._spark(pr.x, pr.y); this._perfectDodge(pr.x, pr.y); continue; }
        if (p.takeHit(pr.dmg * (p.mods.projDamageMult || 1), pr.srcName || 'a dark bolt')) this.shake = 5;
        pr.dead = true;
      }
    }

    this.enemies = this.enemies.filter((e) => !e.dead);
    this.projectiles = this.projectiles.filter((pr) => !pr.dead);

    // outcomes
    if (p.dead) return this._lose();
    if (this.spawnQueue.length === 0 && this.enemies.length === 0) {
      if (this._namedDef) { this._namedTimer = 0; this._maybeSpawnNamed(0); }  // don't end before the herald arrives
      else if (this._huskDef) { this._huskTimer = 0; this._maybeSpawnHusk(0); } // …or before your past self does
      else this._win();
    }
  }

  _updateProjAndFx(sdt) {
    for (const pr of this.projectiles) pr.update(sdt, this);
    this._updateAllyProjectiles(sdt);
    for (const fx of this.effects) {
      fx.t += sdt;
      if (fx.kind === 'spark') { fx.x += fx.vx * sdt; fx.y += fx.vy * sdt; fx.vx *= 0.9; fx.vy *= 0.9; }
      else if (fx.kind === 'dmg') { fx.y += fx.vy * sdt; fx.vy *= 0.9; }
      else if (fx.kind === 'gib') { fx.vy += (fx.g || 540) * sdt; fx.x += fx.vx * sdt; fx.y += fx.vy * sdt; fx.vx *= 0.985; fx.rot += fx.vr * sdt; }
      else if (fx.kind === 'puff') { fx.x += fx.vx * sdt; fx.y += fx.vy * sdt; fx.vx *= 0.92; fx.vy *= 0.92; }
      else if (fx.kind === 'mote') { fx.vy += (fx.g || 0) * sdt; fx.x += fx.vx * sdt; fx.y += fx.vy * sdt; const d = fx.drag || 1; fx.vx *= d; fx.vy *= d; }
      else if (fx.kind === 'fissure' && fx.t > fx.warn) {
        // molten ground: standing on the crack burns (after the warning crack appears)
        fx.tick -= sdt;
        if (fx.tick <= 0) {
          fx.tick = 0.4;
          if (fx.friendly) {
            // CATACLYSM's cracks are OURS: foes on them burn
            for (const e of this.enemies) {
              if (!e.dead && this._nearPolyline(e.x, e.y, fx.pts, fx.w + e.r * 0.7)) {
                this.hitEnemy(e, fx.dmg, 0, 0, 'ability');
                if (!e.dead) { e.burnDmg = Math.max(e.burnDmg, fx.dmg * 0.3); e.burnT = Math.max(e.burnT, 2); }
              }
            }
          } else {
            const p = this.player;
            if (p && !p.dead && this._nearPolyline(p.x, p.y, fx.pts, fx.w + p.r * 0.7)) {
              if (p.takeHit(fx.dmg, 'the molten earth')) this.shake = Math.max(this.shake, 4);
            }
          }
        }
      }
    }
    this.effects = this.effects.filter((f) => f.t < f.dur);
  }

  // Ambient/UI animation that runs regardless of pause/menus.
  _updateAmbient(dt) {
    this.titleT += dt;
    // the title corridor scrolls on its own — a slow, careful stroll into the dark
    if (this.state === 'title') this.tunnelScroll += dt * 34;
    if (this.introCut) {
      this.introCut.t += dt;
      // swap to Level 1 at the instant the iris is fully closed (under black)
      if (!this.introCut.fired && this.introCut.t >= this.introCut.dur * 0.42) {
        this.introCut.fired = true;
        this.start(this.heroId, false);   // no slash-wipe — the blink covers the cut
      }
      if (this.introCut.t >= this.introCut.dur) this.introCut = null;
    }
    if (this.interludeFade) {
      this.interludeFade.t += dt;
      if (this.interludeFade.t >= this.interludeFade.dur) this.interludeFade = null;
    }
    if (this.campToast) {
      this.campToast.t += dt;
      if (this.campToast.t >= this.campToast.dur) this.campToast = null;
    }
    if (this.namedToast) {
      this.namedToast.t += dt;
      if (this.namedToast.t >= this.namedToast.dur) this.namedToast = null;
    }
    // smoothed health bar (+ detect damage for the HP-bar punch)
    if (this.player) {
      const hp = Math.max(0, this.player.hp);
      if (this._hpWas != null && hp < this._hpWas - 0.01) {
        this.hpHitT = 0.32; Sound.play('hurt'); this._buzz(60);
        // pain breaks the rhythm: taking a hit ends the kill-streak
        if (this.state === 'playing' && this.combo > 0) { this.combo = 0; this.comboT = 0; this._comboTier = 0; }
      }
      this._hpWas = hp;
      this.hpDisplay += (hp - this.hpDisplay) * Math.min(1, dt * 14);
      if (this.hpGhost < this.hpDisplay) this.hpGhost = this.hpDisplay;
      else this.hpGhost += (this.hpDisplay - this.hpGhost) * Math.min(1, dt * 4);
    }
    // HUD juice timers
    if (this.hpHitT > 0) this.hpHitT -= dt;
    if (this.goldPop > 0) this.goldPop -= dt * 4;
    if (this.comboPop > 0) this.comboPop -= dt * 4;
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) { this.combo = 0; this._comboTier = 0; } }
    if (this.zoom > 0) this.zoom = Math.max(0, this.zoom - dt * 3.2);   // zoom-punch eases back out
    // floating embers (used for death fx, title & victory celebration) — spawned
    // in world space around the current view
    const want = (this.state === 'victory') ? 60 : 0;   // title now uses the corridor scene
    if (this.embers.length < want && Math.random() < 0.6) {
      this.embers.push({ x: this.cam.x + Math.random() * this.vw, y: this.cam.y + this.vh + 8,
        vx: (Math.random() - 0.5) * 14, vy: -(18 + Math.random() * 34),
        r: 1 + Math.random() * 2.2, life: 0, dur: 3 + Math.random() * 4,
        hue: Math.random() < 0.5 ? '#ff8a3a' : '#e9c84a' });
    }
    for (const e of this.embers) {
      e.life += dt; e.x += e.vx * dt; e.y += e.vy * dt;
      e.vy += 4 * dt; e.flick = 0.5 + 0.5 * Math.sin(this.titleT * 8 + e.x);
    }
    this.embers = this.embers.filter((e) => e.life < e.dur && e.y > -20);

    this._updateAtmos(dt);

    // slash-wipe transition
    if (this.transition) {
      const tr = this.transition;
      tr.t += dt;
      if (!tr.fired && tr.t >= tr.half) { tr.fired = true; if (tr.mid) tr.mid(); }
      if (tr.t >= tr.dur) this.transition = null;
    }
    // plunge-into-darkness descent
    if (this.plunge) {
      const pl = this.plunge; pl.t += dt;
      if (pl.t < pl.half) {                       // falling: the world TEARS away upward
        const f = pl.t / pl.half;
        this.camDrop = 1500 * (f * f * 0.8 + f * 0.2);     // initial velocity so frame 1 already moves
        this.shake = Math.max(this.shake, 2.5 + 6 * f);    // it rattles the whole way down
      } else { this.camDrop = 0; }
      if (!pl.fired && pl.t >= pl.half) { pl.fired = true; if (pl.mid) pl.mid(); }
      if (pl.t >= pl.dur) { this.plunge = null; this.camDrop = 0; }
    }
    // intro card timer
    if (this.intro) {
      this.intro.t += dt;
      // a low, building rumble through the boss reveal
      if (this.intro.kind === 'boss' && this.intro.t < this.intro.dur * 0.82) {
        this.shake = Math.max(this.shake, 2.5 + 2.5 * (this.intro.t / this.intro.dur));
      }
      if (this.intro.t >= this.intro.dur) this.intro = null;
    }
    // "level cleared" sweep -> then the camp shop
    if (this.sweep) {
      this.sweep.t += dt;
      if (this.sweep.t >= this.sweep.dur) {
        this.sweep = null;
        this.pendingReward = null;
        // the Demon Lord speaks on odd floors — and always after you cut down a husk
        const taunt = this._huskTauntDue
          ? 'YOU CUT DOWN WHAT YOU WERE.\nI CAN RAISE AS MANY OF YOU AS YOU LEAVE ME.'
          : DEMON_LINES[this.level];
        this._huskTauntDue = false;
        if (taunt) this._beginInterlude(taunt);
        else this._slashWipe(() => this.openCamp());   // wipe into the camp room
      }
    }
  }

  // The Demon Lord's voice: black out, type his words in blood red, then fade
  // back into the dungeon (the camp). Runs as its own state, the field frozen.
  _beginInterlude(line) {
    const wrapped = this._wrapText(line, 24);                 // longer lines read horizontally
    const totalChars = wrapped.reduce((s, l) => s + l.length, 0);
    this.interlude = { line, wrapped, totalChars, shown: 0, phase: 'in', t: 0 };
    this.state = 'interlude';
    this._tapped = false;
    this.ui.showScreen(null);
  }

  _updateInterlude(dt) {
    const il = this.interlude; if (!il) return;
    il.t += dt;
    if (il.phase === 'in') {
      if (il.t >= 0.6 || this._tapped) { il.phase = 'type'; il.t = 0; this._tapped = false; }
    } else if (il.phase === 'type') {
      il.shown = Math.min(il.totalChars, il.shown + dt * 11);     // ~11 chars/sec — slow & ominous
      if (this._tapped && il.t > 0.25) { il.shown = il.totalChars; this._tapped = false; }  // tap = finish line
      if (il.shown >= il.totalChars) { il.phase = 'hold'; il.t = 0; this._tapped = false; }
    } else if (il.phase === 'hold') {
      // hold here forever — only a deliberate tap dismisses it
      if (this._tapped && il.t > 0.25) {
        this.interlude = null; this._tapped = false;
        this.interludeFade = { t: 0, dur: 0.7 };
        this.openCamp();                                            // built under black; the fade reveals it
      }
    }
  }

  // Biome weather particles (pollen / leaves / embers / snow).
  _updateAtmos(dt) {
    const b = this.biome;
    if (!b || this.state === 'title' || this.state === 'victory') {
      // let any leftover atmos drift out on menus
      for (const a of this.atmos) { a.life += dt; a.x += a.vx * dt; a.y += a.vy * dt; }
      this.atmos = this.atmos.filter((a) => a.life < a.dur);
      return;
    }
    const cap = this.biome.particle === 'pollen' ? 18 : 14;   // sparse & gentle (no confetti)
    if (this.atmos.length < cap && Math.random() < 0.22) {
      const type = b.particle, col = b.pcol[(Math.random() * b.pcol.length) | 0];
      if (type === 'leaves' || type === 'snow') {
        this.atmos.push({ type, x: Math.random() * this.vw, y: -10, col,
          vx: (Math.random() - 0.5) * 24, vy: (type === 'snow' ? 24 : 40) + Math.random() * 30,
          r: type === 'snow' ? 1.5 + Math.random() * 1.5 : 2 + Math.random() * 2,
          spin: Math.random() * 6, life: 0, dur: 6 });
      } else if (type === 'embers') {
        this.atmos.push({ type, x: Math.random() * this.vw, y: this.vh + 8, col,
          vx: (Math.random() - 0.5) * 16, vy: -(20 + Math.random() * 36),
          r: 1 + Math.random() * 2, life: 0, dur: 4 + Math.random() * 3 });
      } else { // pollen / motes
        this.atmos.push({ type: 'pollen', x: Math.random() * this.vw, y: Math.random() * this.vh, col,
          vx: (Math.random() - 0.5) * 10, vy: -(4 + Math.random() * 10),
          r: 1 + Math.random() * 1.6, life: 0, dur: 5 + Math.random() * 4 });
      }
    }
    for (const a of this.atmos) {
      a.life += dt;
      a.x += (a.vx + Math.sin((this.titleT + a.y) * 1.5) * 8) * dt;
      a.y += a.vy * dt;
      a.flick = a.type === 'pollen' || a.type === 'embers' ? 0.5 + 0.5 * Math.sin(this.titleT * 6 + a.x) : 1;
    }
    this.atmos = this.atmos.filter((a) => a.life < a.dur && a.y < this.vh + 20 && a.y > -20);
  }

  _updateDying(dt) {
    // ease into slow-mo, keep the world drifting, then show game over
    this.timeScale += (0.18 - this.timeScale) * Math.min(1, dt * 6);
    const sdt = dt * this.timeScale;
    for (const e of this.enemies) e.update(sdt, this);
    this._updateProjAndFx(sdt);
    this._separate();
    this.dying -= dt;
    if (this.dying <= 0) {
      this.timeScale = 1;
      this.state = 'gameover';
      this.ui.gameOver(this.level, this._runSummary());
    }
  }

  _updateWon(dt) {
    this.wonT += dt;
    this._updateProjAndFx(dt);
    // a steady rain of golden confetti for the celebration
    if (Math.random() < 0.7) {
      this.embers.push({ x: this.cam.x + Math.random() * this.vw, y: this.cam.y - 8,
        vx: (Math.random() - 0.5) * 30, vy: 40 + Math.random() * 70,
        r: 1.5 + Math.random() * 2.5, life: 0, dur: 3 + Math.random() * 2,
        hue: Math.random() < 0.5 ? '#ffd86a' : (Math.random() < 0.5 ? '#fff3c0' : '#ff9a3a') });
    }
    if (this.wonT >= 3.6) {
      this.state = 'victory';
      this.ui.victory(this._runSummary());
    }
  }

  _updateAbilities(dt) {
    for (const ab of this.player.abilities) {
      ab.cd -= dt;
      if (ab.cd <= 0) {
        ab.def.cast(this, ab.level);
        ab.cd = ab.def.cooldown;
      }
    }
  }

  _updateAllyProjectiles(dt) {
    for (const fb of this.allyProjectiles) {
      if (fb.dead) continue;
      fb.x += fb.vx * dt; fb.y += fb.vy * dt; fb.life -= dt;
      // explode on contact with an enemy, or when it expires
      let hit = false;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dx = e.x - fb.x, dy = e.y - fb.y;
        if (dx * dx + dy * dy < (e.r + fb.r) * (e.r + fb.r)) { hit = true; break; }
      }
      const b = this.bounds;
      const out = fb.x < b.minX - 30 || fb.x > b.maxX + 30 || fb.y < b.minY - 30 || fb.y > b.maxY + 30;
      if (hit || fb.life <= 0 || out) { if (hit || !out) this._explodeFireball(fb); fb.dead = true; }
    }
    this.allyProjectiles = this.allyProjectiles.filter((f) => !f.dead);
  }

  _separate() {
    const a = this.enemies;
    for (let i = 0; i < a.length; i++) {
      for (let j = i + 1; j < a.length; j++) {
        const e1 = a[i], e2 = a[j];
        let dx = e2.x - e1.x, dy = e2.y - e1.y;
        let d = Math.hypot(dx, dy);
        const min = e1.r + e2.r;
        if (d > 0 && d < min) {
          const push = (min - d) / 2;
          dx /= d; dy /= d;
          const w1 = e1.boss ? 0.1 : 1, w2 = e2.boss ? 0.1 : 1;
          e1.x -= dx * push * w1; e1.y -= dy * push * w1;
          e2.x += dx * push * w2; e2.y += dy * push * w2;
        }
      }
    }
  }

  _lose() {
    // dramatic death: slow-mo + desaturate, then the game-over screen
    this.state = 'dying';
    this.dying = 1.5;
    this.shake = Math.max(this.shake, 9);
    this._buzz(220);
    // The Lord does not keep every corpse — only your FINEST. A husk is banked
    // only when this death is your deepest fall yet, so the Revenant stays a
    // rare, earned event (not a tax on every death in a death-loop game). It
    // stands a couple of floors ABOVE where you fell: you meet what you were on
    // the way back down, before the wall that killed you, and its relic is your
    // way through. (Boss floors shift up one more; god-mode runs leave nothing.)
    if (!this.godMode && this.level >= 2 && this.player) {
      this.meta.deaths = (this.meta.deaths || 0) + 1;
      if (this.level > (this.meta.bestFall || 0)) {
        this.meta.bestFall = this.level;
        let floor = Math.max(2, this.level - 2);
        while (floor > 2 && (LEVELS[floor - 1].boss || LEVELS[floor - 1].miniboss)) floor--;
        // Garrick was the First Sacrifice — your husks number from the Second
        saveHusk({ floor, n: this.meta.deaths + 1, blade: this.player.blade || null, hero: this.heroId || 'knight' });
      }
      saveMeta(this.meta);
    }
    this._awardSouls(false);
    Sound.setScene('gameover'); Sound.play('lose');
  }

  // Display name for a foe — its elite title if it has one, else its kind.
  _foeName(e) {
    if (!e) return null;
    return (e.named && e.named.name) || FOE_NAMES[e.type] || 'the dark';
  }

  // Everything the end-of-run screens need, gathered in one place.
  _runSummary() {
    const p = this.player || {};
    const blade = p.blade ? bladeById(p.blade) : null;
    return {
      floor: this.level, floors: LEVELS.length,
      time: this.runT || 0,
      kills: this.kills || 0,
      gold: this.totalGold || 0,
      bestCombo: this.bestCombo || 0,
      relics: p.relics ? p.relics.size : 0,
      blade: blade ? blade.name : null, bladeTier: p.bladeTier || 0,
      killedBy: p.killedBy || null,
      souls: this.lastRunSouls || 0,
    };
  }

  _win() {
    // nothing earned stays behind: sweep all uncollected loot into your pack
    // (a herald's relic must never be lost to the floor when the level ends)
    for (const pk of this.pickups) if (!pk.dead) this._collect(pk);
    this.pickups = [];
    if (this.level >= LEVELS.length) {
      // epic celebration sequence, then the victory screen
      this.state = 'won';
      this.wonT = 0;
      this.shake = Math.max(this.shake, 10);
      this.flashScreen = 0.3;
      this._spawnEmberBurst();
      this._awardSouls(true);
      Sound.setScene('victory'); Sound.play('win');
    } else {
      // "LEVEL CLEARED" sweep, then the camp shop
      this.player.hp = Math.min(this.player.maxHP, this.player.hp + CONFIG.hpRestorePerLevel);
      { const b = 4 + Math.round(this.level * 1.5); this.gold += b; this.totalGold += b; }   // modest clear bonus
      this.state = 'clearing';
      this.sweep = { t: 0, dur: 1.5 };
      Sound.play('clear');
      this.pendingReward = { heal: CONFIG.hpRestorePerLevel };
    }
  }

  // ---- the camp: an in-world safe room with a sorcerer to trade with and a
  // glowing door to descend through ----
  openCamp() {
    Sound.setScene('camp');
    this.shopStock = rollStock(this.player, this.shopSlots || 4);
    this.rerollCost = 12;
    this.shopOpen = false;
    this.enemies = []; this.projectiles = []; this.allyProjectiles = []; this.pickups = [];
    this.effects = [];                      // clear leftover swing arcs / damage numbers / death fx
    this.hitStop = 0; this.timeScale = 1;
    this.descentJump = null; this.plunge = null; this.camDrop = 0; this.descentSink = 0;
    this.watchers = []; this.campWhisper = null;
    this._watchT = 3.5 + Math.random() * 3; this._whisperT = 4 + Math.random() * 4;
    this._buildCampRoom();
    // a small, contained room centred in the world; the camera stays put
    const ox = Math.round(this.world.w / 2 - this.vw / 2);
    const oy = Math.round(this.world.h / 2 - this.vh / 2);
    this.cam.x = ox; this.cam.y = oy;
    this.player.x = ox + this.vw * 0.5; this.player.y = oy + this.vh * 0.30;
    this.player.dashTimer = 0; this.player.swingTimer = 0; this.player.invuln = 0;
    this.forceElite = 0;                    // reset any pending event-ambush
    const b = this.biome;
    // A fork in the dark is the signature of the descent, so it almost always
    // opens — but never the same one twice running (pickEvent skips the recent),
    // and never two blank camps in a row (pity). Variety keeps it special; the
    // reliability lets the player build a run around the gambles.
    const forced = (this._campsSinceEvent || 0) >= 1;
    const event = (forced || Math.random() < 0.82) ? pickEvent(this) : null;
    this._campsSinceEvent = event ? 0 : (this._campsSinceEvent || 0) + 1;
    if (event) this._eventsRecent = [event.id, ...(this._eventsRecent || [])].slice(0, 3);
    this.camp = {
      sorcerer: { x: ox + this.vw * 0.74, y: oy + this.vh * 0.42 },
      door: { x: ox + this.vw * 0.5, y: oy + this.vh - 120 },  // a hole in the floor — room to walk all around it
      shrine: event ? { x: ox + this.vw * 0.26, y: oy + this.vh * 0.46 } : null,
      event, eventUsed: false,
      torches: this._campTorchScreen.map(([x, y]) => ({ x: ox + x, y: oy + y, lava: !!b.lava, torch: b.torch })),
      prompt: null, t: 0,
    };
    // keep the player inside the little room — floor now extends below the pit so
    // you can circle it completely (down to just above the bottom wall)
    this.bounds = { minX: ox + 46, minY: oy + 50, maxX: ox + this.vw - 46, maxY: oy + this.vh - 40 };
    this.state = 'camp';
    this.ui.showScreen(null);
    this.ui.setCampPrompt(null);
    // the Living Blade hungers — offer an evolution at floors 5 / 10 / 15
    const tier = this.player.bladeTier || 0;
    if (this.player.blade && tier < 3 && this.level >= BLADE_MILESTONES[tier]) {
      this._bladeEvolveDue = tier;
      this.ui.showBladeEvolve(this, bladeById(this.player.blade), tier);
    } else { this._bladeEvolveDue = null; }
  }

  // pick one of the two evolution options offered for the current tier
  chooseBladeEvolve(idx) {
    const tier = this._bladeEvolveDue;
    if (tier == null) { this.ui.hideEvent(); return; }
    const blade = bladeById(this.player.blade);
    const opt = blade.tiers[tier][idx];
    this.player.bladeUp.add(opt.id);
    this.player.bladeTier = tier + 1;
    this._bladeEvolveDue = null;
    Sound.play('relic');
    this.ui.hideEvent();
    this.campToast = { text: `${blade.name} awakens: ${opt.name}.`, t: 0, dur: 4.2 };
  }

  // chosen at the title before a run
  setBlade(id) { this.bladeId = id; if (this.player) this.player.blade = id; }

  // torches active right now (camp room vs arena)
  get _torches() { return (this.state === 'camp' && this.camp) ? this.camp.torches : (this.braziers || []); }

  // Bake a small, screen-sized stone room for the camp (walls + torches + a rug).
  _buildCampRoom() {
    const W = this.vw, H = this.vh, b = this.biome;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, b.ground[0]); grd.addColorStop(1, b.ground[1]);
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    if (b.detail) b.detail(g, W, H);
    // a circular trade rug in the middle-right (toward the sorcerer)
    g.save();
    const rg = g.createRadialGradient(W * 0.5, H * 0.5, 10, W * 0.5, H * 0.5, H * 0.34);
    rg.addColorStop(0, 'rgba(120,90,40,0.18)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, W, H); g.restore();
    // torch posts at the four inner corners
    this._campTorchScreen = [[52, 78], [W - 52, 78], [52, H - 96], [W - 52, H - 96]];
    for (const [tx, ty] of this._campTorchScreen) this._bakeBrazierPost(g, tx, ty);
    this._bakeWalls(g, b, W, H);
    const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    this.campBg = c;
  }

  _updateCamp(dt) {
    if (this.transition && this.transition.t < this.transition.half) return;
    this.camp.t += dt;
    if (this.descentJump) return this._updateDescentJump(dt);   // leaping into the pit
    if (this.shopOpen) return;                 // frozen while the shop panel is open
    this.input.poll();
    const p = this.player;
    p.update(dt, this.input, this);
    // the descent pit is solid — you can stand at its rim, but not on the mouth
    {
      const d = this.camp.door, erx = 84, ery = 48, ecx = d.x, ecy = d.y;
      const nx = (p.x - ecx) / erx, ny = (p.y - ecy) / ery, dl = Math.hypot(nx, ny);
      if (dl < 1 && dl > 1e-4) { p.x = ecx + (nx / dl) * erx; p.y = ecy + (ny / dl) * ery; }
    }
    this._dashTrail(p, dt);                     // dash trail in the camp too
    this._updateProjAndFx(dt);                 // animate & clear any practice-swing arcs
    const c = this.camp;
    const sd = Math.hypot(p.x - c.sorcerer.x, p.y - c.sorcerer.y);
    const dd = Math.hypot(p.x - c.door.x, p.y - c.door.y);
    const shrineLive = c.shrine && !c.eventUsed;
    const ss = shrineLive ? Math.hypot(p.x - c.shrine.x, p.y - c.shrine.y) : Infinity;
    let prompt = null;
    if (sd < 70) prompt = 'sorcerer';
    else if (ss < 66) prompt = 'shrine';
    else if (dd < 72) prompt = 'door';
    if (prompt !== c.prompt) { c.prompt = prompt; this.ui.setCampPrompt(prompt); }
  }

  // The knight physically leaps from wherever he stands into the pit; when he
  // lands in the mouth the world plunges into darkness (the existing transition).
  _updateDescentJump(dt) {
    const j = this.descentJump; j.t += dt;
    const p = this.player, raw = Math.min(1, j.t / j.dur);
    const HOP = 0.62;                               // first part arcs to the mouth...
    if (raw <= HOP) {
      const prog = raw / HOP;
      p.x = j.x0 + (j.tx - j.x0) * prog;
      const by = j.y0 + (j.ty - j.y0) * prog;
      p.y = by - j.h * Math.sin(prog * Math.PI);    // parabolic hop
      this.descentSink = 0;
    } else {
      // ...the rest drops STRAIGHT down into the dark and fades, so the plunge
      // takes over from an empty pit (no frozen frame of the knight on the rim).
      const s = (raw - HOP) / (1 - HOP);
      p.x = j.tx; p.y = j.ty + s * 24;
      this.descentSink = s;
    }
    p.moving = false; p.attackAnim = 0; p.swingTimer = 0; p.dashTimer = 0;
    if (j.tx < j.x0 - 1) p.faceLeft = true; else if (j.tx > j.x0 + 1) p.faceLeft = false;
    this._updateProjAndFx(dt);
    if (raw >= 1) { this.descentJump = null; this.descend(); }
  }

  // called by the floating prompt button / shop panel
  campTrade() { if (this.state === 'camp') { this.shopOpen = true; this.ui.setCampPrompt(null); this.ui.showShop(this); } }
  campDescend() {
    if (this.state !== 'camp' || this.descentJump || this.plunge) return;
    this.ui.setCampPrompt(null); this.ui.hideShop();
    const d = this.camp.door, p = this.player;
    this._puff(p.x, p.y, '#4a4350', 2, 4, { r0: 2, r1: 9, dur: 0.3 });   // takeoff dust
    Sound.play('jump');
    this.descentSink = 0;
    this.descentJump = { t: 0, dur: 0.72, x0: p.x, y0: p.y, tx: d.x, ty: d.y - 2, h: 50 };
  }
  closeShop() { this.shopOpen = false; this.ui.hideShop(); }

  // ---- dungeon event (the third path) ----
  campInspect() {
    if (this.state !== 'camp' || !this.camp.event || this.camp.eventUsed) return;
    this.shopOpen = true; this.ui.setCampPrompt(null);
    this.ui.showEvent(this, this.camp.event);
  }
  // Pick a choice: apply it, close the panel immediately (no Continue step —
  // the second choice IS the "leave it" option), and float the outcome as a toast.
  resolveEvent(idx) {
    const ev = this.camp.event;
    const res = ev.choices[idx].apply(this);
    this.camp.eventUsed = true; this.camp.prompt = null;
    this.shopOpen = false;
    this.ui.hideEvent(); this.ui.setCampPrompt(null);
    this.campToast = { text: res, t: 0, dur: 4.2 };
  }

  buyWare(ware) {
    if (!ware || ware.sold || this.gold < ware.cost) return false;
    const p = this.player;
    this.gold -= ware.cost;
    if (ware.kind === 'forge') {
      const before = p.maxHP;
      p.forge[ware.id] = (p.forge[ware.id] || 0) + 1;
      recompute(p);
      if (ware.id === 'armor') p.hp += p.maxHP - before;   // new armor heals the gained HP
    } else {
      p.relics.add(ware.id);
      recompute(p);
      p.hp = Math.min(p.hp, p.maxHP);          // a cursed relic may have lowered max HP
    }
    ware.sold = true;
    return true;
  }

  rerollShop() {
    if (this.gold < this.rerollCost) return false;
    this.gold -= this.rerollCost;
    this.rerollCost += 8;
    this.shopStock = rollStock(this.player, this.shopSlots || 4);
    return true;
  }

  // Cursed shrine: gamble gold for a chance at a random relic.
  gambleShrine() {
    const cost = 30;
    if (this.gold < cost) return { ok: false };
    this.gold -= cost;
    const p = this.player;
    const locked = p.lockedRelics || new Set();
    const unowned = RELICS.filter((r) => !p.relics.has(r.id) && !locked.has(r.id));
    const r = Math.random();
    if (r < 0.6 && unowned.length) {
      const relic = unowned[(Math.random() * unowned.length) | 0];
      p.relics.add(relic.id); recompute(p);
      return { ok: true, kind: 'relic', name: relic.name, icon: relic.icon };
    }
    if (r < 0.85) { this.gold += 12; this.totalGold += 12; return { ok: true, kind: 'gold', amount: 12 }; }
    return { ok: true, kind: 'nothing' };
  }

  // Descending the pit is a PLUNGE — the floor swallows you into the dark, the
  // Demon Lord whispers, and you sink onto the next, deeper floor.
  descend() {
    const whispers = ['DEEPER.', 'DOWN YOU COME.', 'CLOSER NOW.', 'I FELT THAT.', 'YES. DESCEND.', 'NEARER TO ME.'];
    // The voice is RARE now — silence is scarier than a guarantee. Only now and
    // then does the Demon Lord stir as you fall.
    const whisper = Math.random() < 0.22 ? whispers[(Math.random() * whispers.length) | 0] : null;
    // seed t slightly so the very first rendered frame already shows the fall.
    // FAST now — a real drop, not a slow curtain (the whisper still lands).
    this.plunge = { t: 0.05, dur: 1.9, half: 1.05, fired: false, whisper,
      mid: () => this._startLevel(this.level + 1, false) };
    this.shake = Math.max(this.shake, 6);
    Sound.play('plunge');
  }

  // ---------- render ----------
  _frame(t) {
    const dt = Math.min(0.05, (t - this._last) / 1000);
    this._last = t;
    // The loop is UNKILLABLE: a thrown frame logs loudly and the next frame
    // still runs. (A single first-frame exception once froze the whole game
    // as a half-drawn screen — never again.)
    try {
      this._update(dt);
      this._render();
    } catch (err) {
      this._frameErrs = (this._frameErrs || 0) + 1;
      if (this._frameErrs <= 3) console.error('frame error (#' + this._frameErrs + ', loop continues):', err);
    }
    requestAnimationFrame((t2) => this._frame(t2));
  }

  _render() {
    const ctx = this.ctx;
    const title = this.state === 'title';
    const camx = this.cam.x, camy = this.cam.y + (this.camDrop || 0);

    // The title is the knight's camp at the pit mouth — a walkable menu.
    if (title) { this._renderTitleCamp(ctx); return; }

    // Cold open: the intro is a screen-space torch-lit corridor, drawn outside
    // the normal world pipeline so the cut into Level 1 is seamless.
    if (this.state === 'intro') {
      ctx.clearRect(0, 0, this.vw, this.vh);
      this._drawTunnelScene(ctx);
      this._drawIntroCut(ctx);        // the dark blinking shut as he steps through
      this._drawTransition(ctx);
      return;
    }

    if (this.state === 'prologue') { this._renderPrologue(ctx); return; }
    if (this.state === 'shrine') { this._renderShrine(ctx); return; }

    ctx.clearRect(0, 0, this.vw, this.vh);
    // zoom-punch: big kills/crits/perfect dodges shove the camera in for a beat.
    // Wraps the world AND the lighting overlays so they stay registered.
    const zp = 1 + 0.05 * Math.min(1, this.zoom || 0);
    const zoomed = zp > 1.001;
    if (zoomed) {
      ctx.save();
      ctx.translate(this.vw / 2, this.vh / 2); ctx.scale(zp, zp); ctx.translate(-this.vw / 2, -this.vh / 2);
    }
    ctx.save();
    if (this.shake > 0) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }
    // void beyond the arena (only visible if shake nudges past the wall)
    ctx.fillStyle = this.voidColor || '#070510';
    ctx.fillRect(-30, -30, this.vw + 60, this.vh + 60);

    // ===== world space =====
    ctx.save();
    ctx.translate(-camx, -camy);

    // baked arena, or the small camp room — one blit
    if (this.state === 'camp' && this.campBg) ctx.drawImage(this.campBg, this.cam.x, this.cam.y);
    else if (this.bg) ctx.drawImage(this.bg, 0, 0);
    this._drawBrazierFlames(ctx);
    for (const pk of this.pickups) this._drawPickup(ctx, pk);

    for (const fx of this.effects) if (fx.kind === 'ghost') this._drawGhost(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'dashstreak') this._drawDashStreak(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'swing') this._drawSwing(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'lavafield') this._drawLavaField(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'fissure') this._drawFissure(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'firetrail') this._drawFireTrail(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'spawnmark') this._drawSpawnMark(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'puff') this._drawPuff(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'death') this._drawDeathFx(ctx, fx);

    if (this.state === 'camp') this._drawCampFloor(ctx);   // door + table (on the floor)

    // depth-sort enemies + hero (+ sorcerer) by feet-y
    const drawList = [...this.enemies];
    if (!title && this.player) drawList.push(this.player);
    if (this.state === 'camp') drawList.push({ sorcerer: true, x: this.camp.sorcerer.x, y: this.camp.sorcerer.y });
    drawList.sort((a, b) => a.y - b.y);
    // contact shadows first — a soft pool under every figure grounds it in the
    // floor (flat sprites read as cutouts under directional light without this)
    ctx.save(); ctx.fillStyle = '#03020a';
    for (const ent of drawList) {
      if (ent.rising != null && ent.rising < 1) continue;   // still emerging from the floor
      const r = ent.r || 12;
      ctx.globalAlpha = 0.30;
      ctx.beginPath(); ctx.ellipse(ent.x, ent.y + 2, r * 1.15, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.18;
      ctx.beginPath(); ctx.ellipse(ent.x, ent.y + 2, r * 1.6, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore(); ctx.globalAlpha = 1;
    for (const ent of drawList) {
      if (ent === this.player) this._drawPlayer(ctx);
      else if (ent.sorcerer) this._drawSorcerer(ctx, ent);
      else this._drawEnemy(ctx, ent);
    }
    if (this.state === 'camp') this._drawCampLabels(ctx);

    for (const pr of this.projectiles) this._drawProjectile(ctx, pr);
    for (const fb of this.allyProjectiles) this._drawFireball(ctx, fb);
    for (const fx of this.effects) this._drawAbilityFx(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'erupt') this._drawErupt(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'firewave') this._drawFireWave(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'firepillar') this._drawFirePillar(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'frostnova') this._drawFrostNova(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'thunderstorm') this._drawStormOverlay(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'megabolt') this._drawMegabolt(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'gib') this._drawGib(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'mote') this._drawMote(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'slash') this._drawSlashMark(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'hitring') this._drawHitRing(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'spark') this._drawSpark(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'dmg') this._drawDamage(ctx, fx);

    this._drawEmbers(ctx);          // death/title/victory embers (world space)
    ctx.restore();                  // ===== end world space =====
    ctx.restore();                  // end shake

    this._drawDarkness(ctx);        // dungeon shadow with torch-lit pools
    ctx.save(); ctx.translate(-this.cam.x, -this.cam.y);
    this._drawLights(ctx);          // additive light cores, on top of the dark
    ctx.restore();

    this._drawAtmos(ctx);           // biome weather (screen overlay)
    this._drawGrade(ctx);           // biome colour grade (screen overlay)
    this._drawDread(ctx);           // depth/low-HP dread vignette pressing in
    this._drawIntroCut(ctx);        // iris opening back up inside Level 1
    this._drawInterludeFade(ctx);   // black fading out of a Demon Lord taunt into the camp
    this._drawDeathOverlay(ctx);    // desaturate + "YOU FELL" during dying/gameover lead-in
    this._drawVictory(ctx);         // golden celebration during the 'won' sequence
    if (zoomed) ctx.restore();      // end zoom-punch (HUD/banners stay unscaled)

    // full-screen flash (ultimate)
    if (this.flashScreen > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.6, this.flashScreen * 2);
      ctx.fillStyle = this.flashCol || '#fff7d6';
      ctx.fillRect(0, 0, this.vw, this.vh);
      ctx.restore();
    }

    // ultimate banner (screen-space)
    for (const fx of this.effects) {
      if (fx.kind !== 'banner') continue;
      const prog = fx.t / fx.dur;
      const a = prog < 0.15 ? prog / 0.15 : 1 - (prog - 0.15) / 0.85;
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const size = 30 + prog * 14;
      ctx.font = `bold ${size}px "Silkscreen", sans-serif`;
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.strokeText(fx.text, this.vw / 2, this.vh * 0.32);
      ctx.fillStyle = '#ffdd6a';
      ctx.fillText(fx.text, this.vw / 2, this.vh * 0.32);
      ctx.restore();
    }

    this._drawSweep(ctx);          // "LEVEL CLEARED" banner sweep
    this._drawCountdownIntro(ctx); // level/boss intro + 3..2..1..FIGHT
    if (!this.cutscene) this._drawHUD(ctx);
    if (!this.cutscene) this._drawStragglerPing(ctx);   // edge chevrons to the last foes
    this._drawBossBar(ctx);        // big top-of-screen boss health bar
    if (!this.cutscene && (this.state === 'playing' || (this.state === 'camp' && !this.shopOpen))) this.input.draw(ctx);
    if (!this.cutscene) this._drawFuryButton(ctx);     // floating "unleash fury" button above the hero
    if (this.state === 'camp') this._drawCampToast(ctx);   // event outcome flavour
    if (this.state === 'camp') this._drawCampWhisper(ctx);  // intrusive voice in the safe room
    if (!this.cutscene) this._drawNamedToast(ctx);  // "<Name> — bears a relic" / "Claimed: …"
    this._drawCutscene(ctx);       // boss-entrance letterbox + name reveal
    this._drawInterlude(ctx);      // Demon Lord taunt: blacks out the whole screen + red typewriter
    this._drawPlunge(ctx);         // plunge-into-darkness descent overlay
    this._drawTransition(ctx);     // slash-wipe on the very top
  }

  // Cinematic dressing for the boss entrance: letterbox bars slide in, and the
  // boss's name slams up once it tears free of the altar.
  _drawCutscene(ctx) {
    const cs = this.cutscene; if (!cs) return;
    const W = this.vw, H = this.vh, total = cs.look + cs.rise + cs.settle;
    const inOut = Math.min(1, cs.t / 0.6) * Math.min(1, (total - cs.t) / 0.5);
    const bar = Math.max(0, inOut) * Math.min(46, H * 0.07);
    ctx.save();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
    ctx.restore();
    if (cs.roared) {
      const since = cs.t - (cs.look + cs.rise * 0.62);
      const a = Math.min(1, since * 2.4);
      const slam = 1 + Math.max(0, 1 - since * 4) * 0.5;        // SLAMS in, then settles
      const name = cs.name.toUpperCase(), y = H * 0.26;
      ctx.save();
      ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      let size = Math.round(28 * slam);
      ctx.font = `bold ${size}px "Silkscreen", sans-serif`;
      const maxW = W * 0.88, tw = ctx.measureText(name).width;
      if (tw > maxW) { size = Math.floor(size * maxW / tw); ctx.font = `bold ${size}px "Silkscreen", sans-serif`; }
      // small dread label above the name
      ctx.font = `bold 11px "Silkscreen", sans-serif`; ctx.fillStyle = 'rgba(190,46,36,0.85)';
      ctx.fillText('THE WAY IS BARRED BY', W / 2, y - size * 0.7 - 6);
      ctx.font = `bold ${size}px "Silkscreen", sans-serif`;
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(name, W / 2, y);
      ctx.shadowColor = '#ff2a1e'; ctx.shadowBlur = 16 * a;
      ctx.fillStyle = '#e8241a'; ctx.fillText(name, W / 2, y);
      ctx.restore();
    }
  }

  // The descent: darkness rushes up as you fall, red abyss-light swells from
  // below, speed-lines streak down, the Demon Lord whispers — then the next
  // floor fades up out of the black.
  _drawPlunge(ctx) {
    if (!this.plunge) return;
    const pl = this.plunge, W = this.vw, H = this.vh;
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (pl.t < pl.half) {                          // FALLING — and it should FEEL like falling
      const f = pl.t / pl.half;
      const fe = Math.pow(f, 0.6);                 // the dark SLAMS up, front-loaded
      const fb = Math.min(20, Math.round(fe * 20));
      const grd = this._tGrad(`plungefall|${fb}|${H}`, () => {
        const gg = ctx.createLinearGradient(0, H, 0, H * (1 - (fb / 20) * 1.15) - 20);
        gg.addColorStop(0, 'rgba(0,0,0,1)'); gg.addColorStop(1, 'rgba(0,0,0,0)');
        return gg;
      });
      ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
      // hold off full black until the very end so the red has room to breathe
      ctx.fillStyle = `rgba(0,0,0,${Math.max(0, (f - 0.82) / 0.18)})`; ctx.fillRect(0, 0, W, H);
      // red abyss glow surging from below
      const rg = this._tGrad(`plungered|${W}x${H}`, () => {
        const gg = ctx.createRadialGradient(W / 2, H + 30, 8, W / 2, H + 30, H);
        gg.addColorStop(0, 'rgba(210,34,16,1)'); gg.addColorStop(1, 'rgba(0,0,0,0)');
        return gg;
      });
      ctx.globalAlpha = 0.66 * Math.pow(f, 0.55) * (0.92 + 0.08 * Math.sin(pl.t * 21));
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      // WIND: two layers of hard vertical speed-streaks (near = fast and long,
      // far = slower parallax), the whole sheet juddering with the fall
      ctx.save();
      ctx.translate(Math.sin(pl.t * 67) * 3 * f, 0);
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.55 * f; ctx.strokeStyle = 'rgba(205,212,230,0.7)'; ctx.lineWidth = 2.5;
      for (let i = 0; i < 22; i++) {
        const x = (i * 89.7) % W, len = 90 + (i * 53) % 130;
        const y = ((i * 131 + pl.t * 2600) % (H + len + 160)) - len - 80;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + len); ctx.stroke();
      }
      ctx.globalAlpha = 0.28 * f; ctx.lineWidth = 1.5;
      for (let i = 0; i < 12; i++) {
        const x = (i * 137.3 + 40) % W, len = 40 + (i * 71) % 60;
        const y = ((i * 97 + pl.t * 1400) % (H + len + 120)) - len - 60;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + len); ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      if (pl.whisper && f > 0.24) {                // the whisper from below — eases in slowly (and rare)
        ctx.globalAlpha = Math.min(1, (f - 0.24) / 0.45) * 0.85;
        ctx.font = '600 19px "Silkscreen", monospace';
        ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fillText(pl.whisper, W / 2 + 1, H * 0.5 + 1);
        ctx.fillStyle = '#c8201a'; ctx.fillText(pl.whisper, W / 2, H * 0.5);
        ctx.globalAlpha = 1;
      }
    } else {                                       // RISING into the new floor
      const r = (pl.t - pl.half) / (pl.dur - pl.half);
      ctx.globalAlpha = 1 - r;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      // a red afterglow clinging to the dark as the new floor emerges
      if (r < 0.6) {
        const rg = this._tGrad(`plungemid|${W}x${H}`, () => {
          const gg = ctx.createRadialGradient(W / 2, H * 0.5, 10, W / 2, H * 0.5, Math.max(W, H) * 0.7);
          gg.addColorStop(0, 'rgba(150,18,10,1)'); gg.addColorStop(1, 'rgba(0,0,0,0)');
          return gg;
        });
        ctx.globalAlpha = (1 - r / 0.6) * 0.5;
        ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1 - r;
      }
      if (pl.whisper && r < 0.5) {
        ctx.globalAlpha = (1 - r / 0.5) * 0.8;
        ctx.font = '600 19px "Silkscreen", monospace';
        ctx.fillStyle = '#c8201a'; ctx.fillText(pl.whisper, W / 2, H * 0.5);
      }
    }
    ctx.restore();
  }

  // A small parchment toast that floats the outcome of an event choice, then fades.
  _drawCampToast(ctx) {
    const t = this.campToast; if (!t) return;
    const W = this.vw, p = t.t / t.dur;
    const a = p < 0.12 ? p / 0.12 : (p > 0.8 ? 1 - (p - 0.8) / 0.2 : 1);
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    ctx.font = '13px "Silkscreen", monospace';
    const lines = this._wrapText(t.text, 30);
    const lh = 20, padX = 16, padY = 12;
    let tw = 0; for (const l of lines) tw = Math.max(tw, ctx.measureText(l).width);
    const bw = Math.min(W - 24, tw + padX * 2), bh = lines.length * lh + padY * 2;
    const bx = (W - bw) / 2, by = this.vh * 0.12;
    ctx.fillStyle = 'rgba(14,10,20,0.9)'; this._roundRect(ctx, bx, by, bw, bh, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(176,107,255,0.55)'; ctx.lineWidth = 2; this._roundRect(ctx, bx, by, bw, bh, 8); ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e7dcc4';
    lines.forEach((l, i) => ctx.fillText(l, W / 2, by + padY + lh / 2 + i * lh));
    ctx.restore();
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Word-wrap text into lines of at most `maxChars`, honouring explicit newlines.
  _wrapText(text, maxChars) {
    const out = [];
    for (const para of String(text).split('\n')) {
      let cur = '';
      for (const w of para.split(' ')) {
        if (cur && (cur.length + 1 + w.length) > maxChars) { out.push(cur); cur = w; }
        else cur = cur ? cur + ' ' + w : w;
      }
      out.push(cur);
    }
    return out;
  }

  _drawFuryButton(ctx) {
    if (this.state !== 'playing') return;
    const b = this.input.furyBtn;
    if (!b.visible) return;
    const t = this.time;
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    const cx = b.x, cy = b.y + Math.sin(t * 3) * 1.5;
    const PXS = 5, N = 9, half = N * PXS / 2;          // a 9x9 chunky-pixel rune tile
    const x0 = Math.round(cx - half), y0 = Math.round(cy - half);
    ctx.save();
    // soft arcane glow behind the stone
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, half + 14 + pulse * 6);
    g.addColorStop(0, `rgba(180,120,255,${0.5 + 0.3 * pulse})`);
    g.addColorStop(1, 'rgba(120,60,200,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, half + 16 + pulse * 6, 0, Math.PI * 2); ctx.fill();
    // pixel helper
    const px = (gx, gy, col) => { ctx.fillStyle = col; ctx.fillRect(x0 + gx * PXS, y0 + gy * PXS, PXS, PXS); };
    const dark = '#140a1e', rim = '#7a3fd0', rimHi = '#a368ff', face = '#2a1745', faceHi = '#36205a';
    for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
      const edge = gx === 0 || gy === 0 || gx === N - 1 || gy === N - 1;
      const ring = gx <= 1 || gy <= 1 || gx >= N - 2 || gy >= N - 2;
      if (edge) px(gx, gy, dark);
      else if (ring) px(gx, gy, (gx + gy) % 2 ? rim : rimHi);
      else px(gx, gy, (gx + gy) % 2 ? face : faceHi);
    }
    // lightning rune (flickers bright on the pulse)
    const bolt = '#fff7c0', boltDim = '#ffd23a';
    const col = pulse > 0.45 ? bolt : boltDim;
    for (const [gx, gy] of [[5, 1], [4, 2], [5, 2], [4, 3], [3, 4], [4, 4], [5, 4], [4, 5], [3, 6], [4, 6], [3, 7]]) px(gx, gy, col);
    // a few orbiting pixel sparks
    for (let i = 0; i < 3; i++) {
      const a = t * 2 + i * 2.1, rr = half + 7;
      ctx.fillStyle = `rgba(220,190,255,${0.5 + 0.5 * pulse})`;
      ctx.fillRect(Math.round(cx + Math.cos(a) * rr) - 1, Math.round(cy + Math.sin(a) * rr) - 1, 3, 3);
    }
    // FURY label above (pixel font, gold glow)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '8px "Silkscreen", sans-serif';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,10,30,0.85)';
    ctx.strokeText('FURY', cx, y0 - 9);
    ctx.fillStyle = `rgba(216,184,255,${0.7 + 0.3 * pulse})`;
    ctx.fillText('FURY', cx, y0 - 9);
    ctx.restore();
  }

  // ---- Phase 3: atmosphere draw helpers ----
  _inView(x, y, pad = 140) {
    return x > this.cam.x - pad && x < this.cam.x + this.vw + pad &&
           y > this.cam.y - pad && y < this.cam.y + this.vh + pad;
  }

  _drawBrazierFlames(ctx) {
    for (const bz of this._torches) {
      if (!this._inView(bz.x, bz.y)) continue;
      const f = this.titleT * 12 + bz.x;
      const h = 12 + Math.sin(f) * 3 + Math.sin(f * 2.3) * 2;
      // flame body
      ctx.save();
      const cy = bz.y - 4;
      const g1 = ctx.createRadialGradient(bz.x, cy - h * 0.3, 1, bz.x, cy, h);
      if (bz.lava) { g1.addColorStop(0, '#fff2b0'); g1.addColorStop(0.5, '#ff5a1e'); g1.addColorStop(1, 'rgba(150,20,0,0)'); }
      else {
        // soulfire takes the biome's hue — teal flames in the drowned halls,
        // violet in the vault — so the hall and its light agree
        const mid = bz.torch || '#ff9a2a';
        g1.addColorStop(0, '#fff2c0'); g1.addColorStop(0.55, mid); g1.addColorStop(1, this._rgba(mid, 0));
      }
      ctx.fillStyle = g1;
      ctx.beginPath();
      ctx.moveTo(bz.x - 6, cy + 2);
      ctx.quadraticCurveTo(bz.x - 5, cy - h * 0.6, bz.x, cy - h);
      ctx.quadraticCurveTo(bz.x + 5, cy - h * 0.6, bz.x + 6, cy + 2);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  _drawLights(ctx) {
    // additive warm glow — gradients are cached per (radius,colour) and reused
    // via translate so we don't allocate dozens of gradients every frame.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const cache = this._glowCache || (this._glowCache = new Map());
    const glow = (x, y, r, col, a) => {
      const rr = Math.round(r), key = rr + '|' + col;
      let grd = cache.get(key);
      if (!grd) {
        grd = ctx.createRadialGradient(0, 0, 0, 0, 0, rr);
        grd.addColorStop(0, col); grd.addColorStop(1, 'rgba(0,0,0,0)');
        cache.set(key, grd);
      }
      ctx.globalAlpha = a; ctx.fillStyle = grd;
      ctx.translate(x, y); ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.fill(); ctx.translate(-x, -y);
    };
    for (const bz of this._torches) {
      if (!this._inView(bz.x, bz.y)) continue;
      // a layered, candle-like flicker rather than a single clean sine
      const fl = 0.74 + 0.16 * Math.sin(this.titleT * 11 + bz.x) + 0.1 * Math.sin(this.titleT * 27 + bz.x * 1.7);
      glow(bz.x, bz.y - 6, 130 + 10 * Math.sin(this.titleT * 17 + bz.x), bz.lava ? '#ff7a2a' : (bz.torch || '#ffb24a'), 0.6 * fl);
    }
    if (this.player) {
      const L = this._bladeLight(), p = this.player;
      glow(p.x, p.y - 14, Math.round(L.r * 0.55), L.col, L.glowA);
      // motes drifting in the blade-light — deterministic (time+index), no allocs
      if (this.state === 'playing') {
        ctx.fillStyle = L.col;
        for (let i = 0; i < 12; i++) {
          const ph = ((this.time * (0.16 + (i % 4) * 0.05)) + i * 0.318) % 1;
          const ang = i * 2.4 + this.time * (i % 2 ? 0.21 : -0.17);
          const rr2 = L.r * (0.18 + 0.4 * ((i * 0.618) % 1));
          const mx = p.x + Math.cos(ang) * rr2, my = p.y - 16 + Math.sin(ang) * rr2 * 0.6 - ph * 26;
          ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.5;
          ctx.fillRect(mx | 0, my | 0, 2, 2);
        }
        ctx.globalAlpha = 1;
      }
    }
    for (const pr of this.projectiles) glow(pr.x, pr.y, 38, pr.boss ? '#ff7a2a' : '#b06bff', 0.55);
    for (const fb of this.allyProjectiles) glow(fb.x, fb.y, 42, '#ff8a3a', 0.65);
    ctx.restore();
  }

  // BLADELIGHT — the sword is the last light in the world. Its colour, reach and
  // character follow the chosen blade and the knight's state: it breathes like
  // fire, holds hard like frost, or pulses like a caged storm; it swells with the
  // kill-streak, flares mid-swing, and gutters when he's nearly done. Memoized
  // per frame (this.time only advances once per update).
  _bladeLight() {
    if (this._lightT === this.time && this._lightMemo) return this._lightMemo;
    this._lightT = this.time;
    const p = this.player, t = this.time;
    let L;
    if (!p) L = { r: 205, col: '#cfe6ff', hard: false, glowA: 0.16 };
    else {
      let r = 240, col = '#ffd9a0', hard = false, glowA = 0.26;
      if (p.blade === 'ember') {        // warm firelight that breathes
        col = '#ff9a4a';
        r *= 1 + 0.05 * Math.sin(t * 11) + 0.03 * Math.sin(t * 27 + 1.7);
      } else if (p.blade === 'frost') { // pale, steady, hard-edged cold
        col = '#bfe2ff'; hard = true; r *= 1.06; glowA = 0.2;
      } else if (p.blade === 'storm') { // a caged tempest, slowly pulsing
        col = '#c9b8ff';
        r *= 1 + 0.07 * Math.sin(t * 4.4);
      }
      r += Math.min(70, (this.combo || 0) * 2.5);            // the streak feeds the light
      if (p.swingTimer > 0) r *= 1.12;                       // the swing flares
      if (p.hp < p.maxHP * 0.3 && !p.dead) {                 // near death, it gutters
        r *= 0.72 + 0.06 * Math.sin(t * 9) + 0.03 * Math.sin(t * 23);
        glowA *= 0.8;
      }
      L = { r, col, hard, glowA };
    }
    return this._lightMemo = L;
  }

  // How lit a world point is (0 = swallowed by the dark, 1 = fully seen):
  // the blade-light first, then the braziers. Boss halls are always lit —
  // the Lord keeps the light the realm lost.
  _litAt(x, y) {
    if (!this.biome || !this.biome.dark || this.bossKind || this.state !== 'playing') return 1;
    let best = 0;
    const p = this.player;
    if (p) {
      const L = this._bladeLight();
      const d = Math.hypot(x - p.x, y - (p.y - 8));
      best = 1 - Math.max(0, d - L.r * 0.5) / (L.r * 0.55);
    }
    for (const bz of this._torches) {
      const d = Math.hypot(x - bz.x, y - (bz.y - 6));
      const v = 1 - Math.max(0, d - 95) / 125;
      if (v > best) best = v;
    }
    return Math.max(0, Math.min(1, best));
  }

  // Dungeon darkness: overlay shadow over everything, then cut light "pools" out
  // of it at the torches, the hero and any spell flashes. This is the vibe.
  _drawDarkness(ctx) {
    const b = this.biome; if (!b || !b.dark) return;
    if (this.state === 'won') return;      // the victory is bathed in golden light
    if (this.flashScreen > 0.02) return;   // the ultimate floods the room with light
    const darkLevel = this.state === 'camp' ? Math.min(b.dark, 0.34)
      : this.bossKind ? Math.min(b.dark, 0.32)               // boss halls are LIT — the inversion
      : Math.min(b.dark * 0.8, 0.68);   // combat: mood at the edges, never a void —
                                        // the floor must stay readable on a phone
    const S = 0.5;                          // half-res shadow buffer (soft, cheap)
    const sw = Math.max(1, Math.round(this.vw * S)), sh = Math.max(1, Math.round(this.vh * S));
    let sc = this.shadowCanvas, g = this.shadowCtx;
    if (!sc || sc.width !== sw || sc.height !== sh) {
      sc = this.shadowCanvas = document.createElement('canvas');
      sc.width = sw; sc.height = sh;
      g = this.shadowCtx = sc.getContext('2d');
      this._holeCache = new Map();   // gradients are tied to this ctx
    }
    const cache = this._holeCache || (this._holeCache = new Map());
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, sw, sh);
    g.fillStyle = `rgba(4,3,9,${darkLevel})`;
    g.fillRect(0, 0, sw, sh);
    g.globalCompositeOperation = 'destination-out';
    // cached light "holes": one gradient per rounded radius + edge profile,
    // reused via translate. `hard` = frost's crisp cone vs. the soft fire feather.
    // `soft` pools (torches) only PARTIALLY cut the dark with a long feather, so
    // neighbouring pools blend into ambience instead of stamping bright circles.
    const hole = (wx, wy, r, hard = false, soft = false) => {
      const sx = (wx - this.cam.x) * S, sy = (wy - this.cam.y) * S, rr = Math.round(r * S);
      if (sx < -rr || sx > sw + rr || sy < -rr || sy > sh + rr) return;
      const key = rr + (hard ? '|h' : soft ? '|s' : '');
      let grd = cache.get(key);
      if (!grd) {
        grd = g.createRadialGradient(0, 0, rr * (hard ? 0.55 : soft ? 0.1 : 0.22), 0, 0, rr);
        grd.addColorStop(0, `rgba(0,0,0,${soft ? 0.8 : 1})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
        cache.set(key, grd);
      }
      g.fillStyle = grd;
      g.translate(sx, sy); g.beginPath(); g.arc(0, 0, rr, 0, Math.PI * 2); g.fill(); g.translate(-sx, -sy);
    };
    for (const bz of this._torches) hole(bz.x, bz.y - 6, 200 + 7 * Math.sin(this.titleT * 17 + bz.x), false, true);
    // the BLADE carries the light — reach/breath/edge follow blade + state
    const L = this._bladeLight();
    const hx = this.player ? this.player.x : this.world.w / 2;
    const hy = this.player ? this.player.y - 8 : this.world.h / 2 + this.vh * 0.16;
    hole(hx, hy, L.r, L.hard);
    for (const fb of this.allyProjectiles) hole(fb.x, fb.y, 90);
    for (const pr of this.projectiles) hole(pr.x, pr.y, 52);
    for (const pk of this.pickups) hole(pk.x, pk.y, 30);   // loot glints in the dark
    if (this.state === 'camp' && this.camp) {              // door + sorcerer + shrine light the room
      hole(this.camp.door.x, this.camp.door.y - 6, 120);
      hole(this.camp.sorcerer.x, this.camp.sorcerer.y - 12, 110);
      if (this.camp.shrine && !this.camp.eventUsed) hole(this.camp.shrine.x, this.camp.shrine.y - 8, 110);
    }
    for (const fx of this.effects) {
      if (fx.kind === 'boom' || fx.kind === 'ult') hole(fx.x, fx.y, Math.round((fx.r || 80) * 1.1));
      else if (fx.kind === 'lavafield') hole(fx.x, fx.y, fx.r * 1.15);
      else if (fx.kind === 'firetrail') hole(fx.x, fx.y, 52);
      else if (fx.kind === 'firepillar') hole(fx.x, fx.y, 120);
      else if (fx.kind === 'firewave') {
        // the wave carries its own ring of light across the dark
        const wr = fx.t * fx.speed;
        for (let i = 0; i < 10; i++) {
          const a2 = (i / 10) * Math.PI * 2;
          hole(fx.x + Math.cos(a2) * wr, fx.y + Math.sin(a2) * wr, 110);
        }
      }
      else if (fx.kind === 'bolt' && fx.pts) hole(fx.pts[fx.pts.length - 1].x, fx.pts[fx.pts.length - 1].y, 70);
      else if (fx.kind === 'fissure' && fx.t > fx.warn * 0.6) {
        for (let i = 1; i < fx.pts.length; i += 2) hole(fx.pts[i].x, fx.pts[i].y, 54);
      }
    }
    // foes that carry their own light: the burning, and bosses mid-telegraph
    // (a windup you can't see is a cheap death, not a dark one)
    for (const e of this.enemies) {
      if (e.burnT > 0) hole(e.x, e.y - 10, 64);
      else if (e.state === 'windup' || e.state === 'special' || e.state === 'charging' || e.state === 'enrage') hole(e.x, e.y - 10, e.r * 3.2);
    }
    g.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.imageSmoothingEnabled = true;
    ctx.drawImage(sc, 0, 0, this.vw, this.vh);
    ctx.restore();
  }

  _drawAtmos(ctx) {
    if (!this.atmos || !this.atmos.length) return;
    ctx.save();
    for (const a of this.atmos) {
      const fade = a.life < 0.4 ? a.life / 0.4 : (a.life > a.dur - 0.6 ? (a.dur - a.life) / 0.6 : 1);
      ctx.globalAlpha = Math.max(0, Math.min(1, fade)) * (a.flick ?? 1) * 0.9;
      ctx.fillStyle = a.col;
      if (a.type === 'leaves') {
        ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.spin + this.titleT * 2);
        ctx.fillRect(-a.r, -a.r * 0.5, a.r * 2, a.r); ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  _drawGrade(ctx) {
    if (!this.biome) return;
    ctx.save();
    ctx.fillStyle = this.biome.grade;
    ctx.fillRect(0, 0, this.vw, this.vh);
    ctx.restore();
  }

  // ---- Phase 2 draw helpers ----
  _drawEmbers(ctx) {
    if (!this.embers.length) return;
    ctx.save();
    for (const e of this.embers) {
      const a = Math.min(1, e.life < 0.3 ? e.life / 0.3 : 1 - e.life / e.dur) * (e.flick ?? 1);
      ctx.globalAlpha = Math.max(0, a) * 0.9;
      ctx.fillStyle = e.hue;
      ctx.fillRect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2);
    }
    ctx.restore();
  }

  // Bake one repeating slice of the title corridor (walls + floor + a torch on
  // each wall). Rebuilt only if the viewport changed.
  _buildTunnel() {
    const W = this.vw, H = this.vh, SEG = 200;
    const b = biomeForLevel(1);                       // catacomb palette → matches Level 1
    // band sits a touch low so the title text never overlaps the knight, who is
    // centred within it
    const top = Math.round(H * 0.34), bot = Math.round(H * 0.86);
    this._tunnel = { SEG, top, bot, torchY: { top, bot } };
    const c = document.createElement('canvas'); c.width = SEG; c.height = H;
    const g = c.getContext('2d');
    // sunken floor
    const grd = g.createLinearGradient(0, top, 0, bot);
    grd.addColorStop(0, b.ground[0]); grd.addColorStop(1, b.ground[1]);
    g.fillStyle = grd; g.fillRect(0, top, SEG, bot - top);
    g.strokeStyle = 'rgba(0,0,0,0.42)'; g.lineWidth = 2;
    for (let x = 0; x <= SEG; x += 50) { g.beginPath(); g.moveTo(x, top); g.lineTo(x, bot); g.stroke(); }
    for (let y = top; y <= bot; y += 50) { g.beginPath(); g.moveTo(0, y); g.lineTo(SEG, y); g.stroke(); }
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(Math.random() * SEG, top + Math.random() * (bot - top), 1 + Math.random() * 2, 1); }
    // walls above & below
    g.fillStyle = b.wall; g.fillRect(0, 0, SEG, top); g.fillRect(0, bot, SEG, H - bot);
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2;
    for (let x = 0; x <= SEG; x += 46) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, top); g.moveTo(x + 23, bot); g.lineTo(x + 23, H); g.stroke();
    }
    for (let y = 0; y < top; y += 26) { g.beginPath(); g.moveTo(0, y); g.lineTo(SEG, y); g.stroke(); }
    for (let y = bot + 26; y < H; y += 26) { g.beginPath(); g.moveTo(0, y); g.lineTo(SEG, y); g.stroke(); }
    // lit cap + recessed shadow where wall meets floor
    g.fillStyle = b.cap; g.fillRect(0, top - 5, SEG, 5); g.fillRect(0, bot, SEG, 5);
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, top, SEG, 10); g.fillRect(0, bot - 10, SEG, 10);
    // a brazier standing against each wall, centred in the slice
    this._bakeBrazierPost(g, SEG * 0.5, top);
    this._bakeBrazierPost(g, SEG * 0.5, bot);
    this.tunnelStrip = c; this._tunnelW = W; this._tunnelH = H;
  }

  // The title / cold-open scene: an endless torch-lit corridor seen from far
  // off, the knight slowly striding forward. The whole thing scrolls left (he
  // walks right); pressing Begin gently pushes the camera in toward him.
  _drawTunnelScene(ctx) {
    if (!this.tunnelStrip || this._tunnelW !== this.vw || this._tunnelH !== this.vh) this._buildTunnel();
    const W = this.vw, H = this.vh, { SEG, top, bot, torchY } = this._tunnel;
    const scroll = this.tunnelScroll;
    const off = ((scroll % SEG) + SEG) % SEG;
    const hx = W * 0.46, hy = (top + bot) / 2 + 6;

    // far view by default; Begin eases a slow push-in toward the knight
    ctx.fillStyle = '#06040c'; ctx.fillRect(0, 0, W, H);   // void fills the whole frame
    ctx.save();
    if (this.state === 'intro') {
      const z = 1 + Math.min(0.3, this.introT * 0.13);     // gentle dolly-in
      ctx.translate(hx, hy); ctx.scale(z, z); ctx.translate(-hx, -hy);
    }

    // the corridor is finite during the intro: it ends at an archway (endSx),
    // beyond which a wide open chamber waits. In the title it runs forever.
    const endSx = (this.state === 'intro' && this.introEnd != null) ? this.introEnd - scroll : Infinity;

    // open chamber first (behind the arch), then the corridor clipped to the arch.
    // The chamber is BAKED once and blitted, so its flagstone grime never flickers.
    if (endSx < W) {
      if (!this.openingBg || this._openingW !== W || this._openingH !== H) this._buildOpening();
      ctx.drawImage(this.openingBg, Math.round(endSx), 0);
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, Math.max(0, Math.min(W, endSx)), H); ctx.clip();
    for (let x = -off; x < W + SEG; x += SEG) ctx.drawImage(this.tunnelStrip, Math.round(x), 0);
    ctx.restore();
    // a heavy darkness veil — it all lives in shadow
    ctx.fillStyle = 'rgba(5,3,10,0.7)'; ctx.fillRect(0, 0, W, H);

    // on-screen torches (one per slice, on each wall), only those before the arch.
    // Flicker is keyed to WORLD position so it doesn't strobe as it scrolls past.
    const torches = [];
    for (let x = -off; x < W + SEG; x += SEG) {
      const tx = x + SEG * 0.5; if (tx > endSx - 12) continue;
      const world = tx + scroll;                           // stable per physical torch
      torches.push([tx, torchY.top, world], [tx, torchY.bot, world + 53]);
    }

    // additive light pass: warm, dim torch pools + a soft glow on the hero
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const cache = this._glowCache || (this._glowCache = new Map());
    const glow = (x, y, r, col, a) => {
      const rr = Math.round(r), key = rr + '|' + col;
      let grd = cache.get(key);
      if (!grd) { grd = ctx.createRadialGradient(0, 0, 0, 0, 0, rr); grd.addColorStop(0, col); grd.addColorStop(1, 'rgba(0,0,0,0)'); cache.set(key, grd); }
      ctx.globalAlpha = a; ctx.fillStyle = grd;
      ctx.translate(x, y); ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.fill(); ctx.translate(-x, -y);
    };
    for (const [tx, ty, world] of torches) {
      const fl = 0.9 + 0.1 * Math.sin(this.titleT * 2.4 + world * 0.05);   // slow, gentle
      glow(tx, ty, 130, '#ffae46', 0.28 * fl);
    }
    if (endSx < W) {                                       // braziers framing the corridor mouth
      const fl = 0.9 + 0.1 * Math.sin(this.titleT * 2.4);
      glow(endSx - 4, top, 150, '#ffae46', 0.3 * fl);
      glow(endSx - 4, bot, 150, '#ffae46', 0.3 * fl);
    }
    glow(hx, hy - 10, 96, '#ffd28a', 0.14);
    ctx.restore();

    // torch flames on top of their pools
    for (const [tx, ty, world] of torches) this._tunnelFlame(ctx, tx, ty, world);
    if (endSx < W) { this._tunnelFlame(ctx, endSx - 4, top, scroll); this._tunnelFlame(ctx, endSx - 4, bot, scroll + 99); }

    // the knight, far off, walking slowly and carefully into the dark
    const cyc = this.titleT * 1.7;                          // slow gait
    const bob = Math.abs(Math.sin(cyc * Math.PI)) * 1.4;
    const frame = cyc % 1 < 0.5 ? 'walkA' : 'walkB';
    ctx.save();
    ctx.globalAlpha = 0.45; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(hx, hy + 13, 13, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // he carries the last light down the corridor — a warm breathing aura + embers
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const lr = 92 + 7 * Math.sin(this.titleT * 2.1);
    const lg = ctx.createRadialGradient(hx, hy - 26, 6, hx, hy - 26, lr);
    lg.addColorStop(0, 'rgba(255,190,110,0.34)'); lg.addColorStop(0.55, 'rgba(220,120,50,0.13)'); lg.addColorStop(1, 'rgba(120,40,0,0)');
    ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(hx, hy - 26, lr, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 9; i++) {                         // embers rising off the light
      const ph = ((this.titleT * (0.32 + (i % 3) * 0.11)) + i * 0.37) % 1;
      const ex = hx + Math.sin(i * 2.3 + this.titleT * 1.4) * (16 + i * 4);
      ctx.globalAlpha = (1 - ph) * 0.55;
      ctx.fillStyle = i % 3 ? '#ffb163' : '#ffe1a8';
      ctx.fillRect(ex | 0, (hy - 10 - ph * 86) | 0, 2, 2);
    }
    ctx.restore(); ctx.globalAlpha = 1;
    drawSprite(ctx, 'knight', frame, hx, hy - bob, false, 1.5);

    ctx.restore();   // end push-in
  }

  // Bake the chamber beyond the corridor mouth ONCE: a wide, dark catacomb floor
  // that opens up taller than the passage and fades into depth, framed by stone
  // jambs and a smashed, rotting door — so when Level 1 dissolves in over it, he
  // is already standing in a ruined open space. Baking kills the live-paint flicker.
  _buildOpening() {
    const W = this.vw, H = this.vh, b = biomeForLevel(1);
    const { top, bot } = this._tunnel;
    const oTop = Math.round(H * 0.12), oBot = Math.round(H * 0.95);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    // chamber floor
    const grd = g.createLinearGradient(0, oTop, 0, oBot);
    grd.addColorStop(0, b.ground[0]); grd.addColorStop(1, b.ground[1]);
    g.fillStyle = grd; g.fillRect(0, oTop, W, oBot - oTop);
    if (b.detail) {                                        // flagstone grime — baked, so it never flickers
      g.save(); g.beginPath(); g.rect(0, oTop, W, oBot - oTop); g.clip();
      g.translate(0, oTop); b.detail(g, W, oBot - oTop); g.restore();
    }
    // depth: the far side of the room sinks into black
    const dg = g.createLinearGradient(0, 0, W, 0);
    dg.addColorStop(0, 'rgba(0,0,0,0)'); dg.addColorStop(0.6, 'rgba(2,1,6,0.5)'); dg.addColorStop(1, 'rgba(2,1,6,0.96)');
    g.fillStyle = dg; g.fillRect(0, oTop, W, oBot - oTop);
    // stone jambs above & below the passage opening (continue the corridor walls)
    g.fillStyle = b.wall; g.fillRect(0, 0, 16, top + 6); g.fillRect(0, bot - 6, 16, H - bot + 6);
    g.fillStyle = b.cap; g.fillRect(0, top - 3, 20, 7); g.fillRect(0, bot - 4, 20, 7);
    this._bakeRuinedDoor(g, top, bot);
    this.openingBg = c; this._openingW = W; this._openingH = H;
  }

  // A long-rotted wooden door, long since broken inward — splintered planks
  // still hang from the lintel and jut from the sill, the middle smashed open,
  // debris scattered across the threshold. We're entering a sealed, ruined place.
  _bakeRuinedDoor(g, top, bot) {
    const dh = bot - top, woodDk = '#241a0e', wood = '#3a2a18', woodHi = '#4d3a22';
    const iron = '#2b2b33', rivet = '#454552';
    const plank = (x, y, w, h, splinterDown) => {
      g.fillStyle = wood; g.fillRect(x, y, w, h);
      g.fillStyle = woodHi; g.fillRect(x, y, 2, h);                 // grain highlight
      g.fillStyle = woodDk; g.fillRect(x + w - 2, y, 2, h);         // grain shadow
      // jagged splintered break at one end
      const sy = splinterDown ? y + h : y;
      g.fillStyle = wood;
      for (let i = 0; i < w; i += 2) {
        const len = (3 + ((i * 7 + x) % 5)) * (splinterDown ? 1 : -1);
        g.fillRect(x + i, splinterDown ? sy : sy + len, 2, Math.abs(len));
      }
    };
    g.save();
    // planks hanging down from the top lintel, broken at the bottom
    plank(3, top, 7, dh * 0.46, true);
    plank(12, top, 7, dh * 0.30, true);
    plank(21, top, 6, dh * 0.52, true);
    // an iron band bracing the hanging planks, with rivets
    g.fillStyle = iron; g.fillRect(2, top + dh * 0.16, 26, 4);
    g.fillStyle = rivet; g.fillRect(4, top + dh * 0.16 + 1, 2, 2); g.fillRect(24, top + dh * 0.16 + 1, 2, 2);
    // stub planks rising from the bottom sill, broken at the top
    plank(5, bot - dh * 0.34, 7, dh * 0.34, false);
    plank(20, bot - dh * 0.22, 6, dh * 0.22, false);
    // a plank fallen across the gap at an angle
    g.translate(15, top + dh * 0.5); g.rotate(0.5);
    g.fillStyle = woodDk; g.fillRect(-3, -2, 30, 6);
    g.fillStyle = wood; g.fillRect(-3, -2, 30, 2);
    g.restore();
    // splinters & debris scattered on the floor just inside the threshold
    g.fillStyle = woodDk;
    const debris = [[30, top + dh * 0.62, 5, 2], [40, bot - dh * 0.3, 6, 2], [26, bot - 8, 4, 2],
      [48, top + dh * 0.5, 3, 2], [34, top + dh * 0.4, 4, 2]];
    for (const [x, y, w, h] of debris) { g.fillRect(x, y, w, h); g.fillStyle = wood; g.fillRect(x, y, w, 1); g.fillStyle = woodDk; }
  }

  _tunnelFlame(ctx, x, y, world) {
    const f = this.titleT * 4 + world * 0.1;               // calm flicker, world-anchored
    const h = 11 + Math.sin(f) * 2 + Math.sin(f * 1.7) * 1.2;
    const cy = y - 4;
    ctx.save();
    const g1 = ctx.createRadialGradient(x, cy - h * 0.3, 1, x, cy, h);
    g1.addColorStop(0, '#ffe9b0'); g1.addColorStop(0.5, '#ff9a32'); g1.addColorStop(1, 'rgba(180,70,10,0)');
    ctx.fillStyle = g1;
    ctx.beginPath();
    ctx.moveTo(x - 5, cy + 2);
    ctx.quadraticCurveTo(x - 4, cy - h * 0.6, x, cy - h);
    ctx.quadraticCurveTo(x + 4, cy - h * 0.6, x + 5, cy + 2);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // The cut into Level 1: an iris of darkness snaps shut on the knight, the
  // level is swapped in under full black, then the iris opens in the new room.
  // No crossfade, no double-image — a hard blink that the dark motivates.
  _drawIntroCut(ctx) {
    if (!this.introCut) return;
    const { t, dur } = this.introCut, half = dur * 0.42;
    const c = t < half ? t / half : 1 - (t - half) / (dur - half);   // 0..1 darkness
    const cl = Math.max(0, Math.min(1, c));
    const W = this.vw, H = this.vh, cx = W * 0.48, cy = H * 0.5;
    const maxR = Math.hypot(W, H) * 0.62, feather = 80;
    const r = (1 - cl) * maxR;
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r + feather);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(Math.max(0, Math.min(1, r / (r + feather))), 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.save(); ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H); ctx.restore();
  }

  // The black veil fading out of a taunt, revealing the camp beneath.
  _drawInterludeFade(ctx) {
    if (!this.interludeFade) return;
    const a = Math.max(0, 1 - this.interludeFade.t / this.interludeFade.dur);
    ctx.save(); ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.fillRect(0, 0, this.vw, this.vh); ctx.restore();
  }

  // The Demon Lord's taunt: black out the field, then type his words across it
  // in blood red with a blinking cursor and a low red glow. Tap advances it.
  _drawInterlude(ctx) {
    const il = this.interlude; if (!il) return;
    const W = this.vw, H = this.vh;
    const cover = il.phase === 'in' ? Math.min(1, il.t / 0.6) : 1;
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${cover})`; ctx.fillRect(0, 0, W, H);
    if (il.phase === 'in') { ctx.restore(); return; }      // still fading to black; no text yet
    // a faint red breath of light behind the words
    const rg = ctx.createRadialGradient(W / 2, H * 0.46, 10, W / 2, H * 0.46, W * 0.7);
    rg.addColorStop(0, 'rgba(60,4,4,0.5)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);

    // readable type — longer wrapped lines, sized to fit the width
    const lines = il.wrapped;
    ctx.font = '100px "Silkscreen", monospace';
    let longest = 1; for (const l of lines) longest = Math.max(longest, ctx.measureText(l).width);
    const sizeW = 100 * (W * 0.78) / longest;              // fill the width
    const sizeH = (H * 0.5) / (lines.length * 1.5);        // …or the height, whichever's smaller
    const size = Math.max(11, Math.min(sizeW, sizeH, 22));
    ctx.font = `${size}px "Silkscreen", monospace`;
    const lh = size * 1.5, cy = H * 0.46 - (lines.length - 1) * lh / 2;

    const shownN = Math.floor(il.shown);
    let counted = 0, cursorPlaced = false;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < lines.length; i++) {
      const full = lines[i];
      const start = counted, end = start + full.length;
      let vis = shownN <= start ? '' : (shownN < end ? full.slice(0, shownN - start) : full);
      counted = end;                                       // wrapped lines counted contiguously
      let text = vis;
      const blink = Math.floor(this.time * 2.5) % 2 === 0;
      if (!cursorPlaced && il.phase === 'type' && shownN < end && (vis.length || i === 0)) {
        if (blink) text = vis + '▌'; cursorPlaced = true;
      }
      if (il.phase === 'hold' && i === lines.length - 1 && blink) text = full + '▌';
      const y = cy + i * lh;
      ctx.shadowColor = '#ff2a1e'; ctx.shadowBlur = size * 0.5;
      ctx.lineWidth = Math.max(2, size * 0.06); ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(text, W / 2, y);
      ctx.fillStyle = '#e8241a'; ctx.fillText(text, W / 2, y);
      ctx.shadowBlur = 0;
    }
    // a quiet hint to move on
    if (il.phase === 'hold') {
      ctx.font = '9px "Silkscreen", monospace'; ctx.fillStyle = 'rgba(180,40,30,0.5)';
      ctx.fillText('tap to continue', W / 2, H * 0.9);
    }
    ctx.restore();
  }

  _drawGib(ctx, fx) {
    const a = 1 - fx.t / fx.dur;
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    ctx.translate(fx.x, fx.y); ctx.rotate(fx.rot || 0);
    ctx.fillStyle = fx.color;
    const s = fx.size || 3;
    if (fx.shape === 'bone') { ctx.fillRect(-s, -1, s * 2, 2); ctx.fillRect(-s - 1, -2, 2, 4); ctx.fillRect(s - 1, -2, 2, 4); }
    else if (fx.shape === 'wisp') { ctx.beginPath(); ctx.ellipse(0, 0, s * 0.7, s * 1.8, 0, 0, Math.PI * 2); ctx.fill(); }
    else ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.restore();
  }

  _drawPuff(ctx, fx) {
    const prog = fx.t / fx.dur;
    const r = (fx.r0 || 4) + ((fx.r1 || 16) - (fx.r0 || 4)) * prog;
    ctx.save();
    ctx.globalAlpha = Math.max(0, (1 - prog) * 0.5);
    ctx.fillStyle = fx.color;
    ctx.beginPath(); ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // A glowing additive mote — soft halo + bright core, with optional twinkle.
  _drawMote(ctx, fx) {
    const prog = fx.t / fx.dur;
    let a = prog < 0.2 ? prog / 0.2 : 1 - (prog - 0.2) / 0.8;   // ease in, fade out
    if (fx.twinkle) a *= 0.55 + 0.45 * Math.sin(this.time * 22 + fx.x);
    a = Math.max(0, a);
    const r = fx.r || 2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (fx.glow) {
      const g = ctx.createRadialGradient(fx.x, fx.y, 0, fx.x, fx.y, r * 3);
      g.addColorStop(0, fx.color); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = a * 0.5;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, r * 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = a;
    ctx.fillStyle = fx.color;
    ctx.beginPath(); ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  _drawDeathFx(ctx, fx) {
    const prog = fx.t / fx.dur, style = fx.style || 'collapse';
    ctx.save();
    let tint;
    ctx.translate(fx.x, fx.y);
    if (style === 'poof') {                    // imps/bombers: balloon out into smoke
      const s = 1 + prog * 0.45;
      ctx.globalAlpha = (1 - prog) * 0.85; ctx.scale(s, s);
      tint = { color: fx.tintCol || '#caa0e0', a: 0.4 + prog * 0.6 };
    } else if (style === 'topple') {           // ogres: lean over and fall
      ctx.translate(0, fx.r * 0.45 * prog);
      ctx.rotate(prog * 0.8 * (fx.faceLeft ? 1 : -1));
      ctx.scale(1 + prog * 0.2, 1 - prog * 0.4);
      ctx.globalAlpha = 1 - prog * 0.85; tint = { color: '#8a7a66', a: 0.3 + prog * 0.5 };
    } else if (style === 'implode') {          // mages: collapse to a bright point
      const s = Math.max(0.05, 1 - prog * 0.92);
      ctx.scale(s, s); ctx.globalAlpha = 1 - prog * prog;
      tint = { color: '#cfeaff', a: 0.5 + prog * 0.5 };
    } else {                                   // collapse: squash + dissolve (skeletons/boss/default)
      ctx.scale(1 + prog * 0.4, 1 - prog * 0.55);
      ctx.globalAlpha = (1 - prog) * 0.9;
      tint = { color: fx.boss ? '#ff8a5a' : '#dff0ff', a: 0.5 + prog * 0.5 };
    }
    ctx.translate(-fx.x, -fx.y);
    drawSprite(ctx, fx.sprite, 'idle', fx.x, fx.y, fx.faceLeft, 1, tint);
    ctx.restore();
  }

  // The wipe is a DOM layer (above the menus); drive it from the transition clock.
  _drawTransition() {
    if (!this.wipeEl) return;
    if (!this.transition) {
      if (this.wipeEl.style.opacity !== '0') this.wipeEl.style.opacity = '0';
      return;
    }
    const prog = Math.min(1, this.transition.t / this.transition.dur);
    const tx = -140 + 280 * prog;   // slides across, covering the screen at the midpoint
    this.wipeEl.style.opacity = '1';
    this.wipeEl.style.transform = `translateX(${tx}%) skewX(-12deg)`;
  }

  _drawSweep(ctx) {
    if (!this.sweep) return;
    const prog = this.sweep.t / this.sweep.dur;
    // a band sweeps left->right with the text, then fades
    const a = prog < 0.7 ? 1 : 1 - (prog - 0.7) / 0.3;
    const cx = this.vw / 2;
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = 'rgba(10,8,18,0.7)';
    const bandH = 92;
    ctx.fillRect(0, this.vh / 2 - bandH / 2, this.vw, bandH);
    ctx.fillStyle = '#e9c84a';
    ctx.fillRect(0, this.vh / 2 - bandH / 2, this.vw, 3);
    ctx.fillRect(0, this.vh / 2 + bandH / 2 - 3, this.vw, 3);
    const slideIn = Math.min(1, prog / 0.25);
    const x = cx - (1 - slideIn) * 60;
    ctx.globalAlpha *= slideIn;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 40px "Silkscreen", sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText('LEVEL CLEARED', x, this.vh / 2);
    ctx.restore();
  }

  _drawCountdownIntro(ctx) {
    // boss reveal: a pulsing red vignette + heavy letterbox closing the room in
    if (this.intro && this.intro.kind === 'boss') {
      const p = this.intro.t / this.intro.dur;
      const W = this.vw, H = this.vh;
      // dread-red vignette, throbbing like a slow heartbeat, easing out at the end
      const fade = p > 0.82 ? 1 - (p - 0.82) / 0.18 : 1;
      const pulse = 0.42 + 0.30 * Math.sin(this.intro.t * 7);
      ctx.save();
      const rg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.18, W / 2, H / 2, Math.max(W, H) * 0.62);
      rg.addColorStop(0, 'rgba(0,0,0,0)');
      rg.addColorStop(1, `rgba(150,8,8,${(0.55 * pulse * fade).toFixed(3)})`);
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
      ctx.restore();
      const barH = (p < 0.85 ? 1 : 1 - (p - 0.85) / 0.15) * 78;
      ctx.save();
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, barH);
      ctx.fillRect(0, H - barH, W, barH);
      // a thin blood line along the letterbox edge
      ctx.fillStyle = `rgba(180,20,16,${(0.7 * fade).toFixed(3)})`;
      ctx.fillRect(0, barH - 2, W, 2); ctx.fillRect(0, H - barH, W, 2);
      ctx.restore();
    }
    if (this.intro) {
      const it = this.intro, p = it.t / it.dur;
      const slide = p < 0.2 ? p / 0.2 : 1;
      const a = p > 0.8 ? 1 - (p - 0.8) / 0.2 : 1;
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const y = this.vh * 0.38;
      if (it.kind === 'boss') {
        // small dread label above
        ctx.font = 'bold 13px "Silkscreen", sans-serif'; ctx.fillStyle = 'rgba(180,40,30,0.85)';
        ctx.fillText('THE WAY IS BARRED BY', this.vw / 2, y - 38);
        // the name SLAMS in big, then settles — blood red with a red glow
        const slam = 1 + (1 - slide) * 0.6;             // overshoot → settle
        let size = (30 + slide * 4) * slam;
        ctx.font = `bold ${size}px "Silkscreen", sans-serif`;
        const maxW = this.vw * 0.9;                     // scale down so it never overflows
        const tw = ctx.measureText(it.text).width;
        if (tw > maxW) { size = Math.floor(size * maxW / tw); ctx.font = `bold ${size}px "Silkscreen", sans-serif`; }
        ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(it.text, this.vw / 2, y);
        ctx.shadowColor = '#ff2a1e'; ctx.shadowBlur = 18 * a;
        ctx.fillStyle = '#e5251c'; ctx.fillText(it.text, this.vw / 2, y);
        ctx.shadowBlur = 0;
        ctx.font = 'italic 13px "Silkscreen", sans-serif'; ctx.fillStyle = 'rgba(207,160,160,0.8)';
        ctx.fillText(it.sub, this.vw / 2, y + size * 0.62 + 8);
      } else if (it.kind === 'ambush') {
        // a hard red warning that shakes/pulses — empowered foes came down with you
        const jx = (Math.random() - 0.5) * 5 * a, jy = (Math.random() - 0.5) * 5 * a;
        let size = 34 + slide * 4;
        ctx.font = `bold ${size}px "Silkscreen", sans-serif`;
        const maxW = this.vw * 0.9, tw = ctx.measureText(it.text).width;
        if (tw > maxW) { size = Math.floor(size * maxW / tw); ctx.font = `bold ${size}px "Silkscreen", sans-serif`; }
        ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(it.text, this.vw / 2 + jx, y + jy);
        ctx.shadowColor = '#ff2a1e'; ctx.shadowBlur = 16 * a;
        ctx.fillStyle = '#ff3326'; ctx.fillText(it.text, this.vw / 2 + jx, y + jy);
        ctx.shadowBlur = 0;
        ctx.font = 'italic 13px "Silkscreen", sans-serif'; ctx.fillStyle = 'rgba(220,160,150,0.85)';
        ctx.fillText(it.sub, this.vw / 2, y + size * 0.6 + 8);
      } else {
        const x = this.vw / 2 + (1 - slide) * 80;
        ctx.font = '26px "Silkscreen", sans-serif';   // clear digits
        ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.strokeText(it.text, x, y);
        ctx.fillStyle = '#e9c84a';
        ctx.fillText(it.text, x, y);
        if (it.sub) { ctx.font = 'italic 15px "Silkscreen", sans-serif'; ctx.fillStyle = '#cfc6e6';
          ctx.fillText(it.sub, x, y + 30); }
      }
      ctx.restore();
    }
    // 3..2..1..FIGHT countdown
    if (this.state === 'playing' && this.countdown > 0) {
      const c = this.countdown;
      const fight = c <= 0.9;
      const label = fight ? 'FIGHT!' : '' + Math.ceil(c - 0.9);
      // pulse: each number/word pops then settles within its ~0.9s window
      const phase = (c % 0.9) / 0.9;            // 1 at appear -> 0 at end
      const scale = 1 + 0.22 * phase;
      const a = fight ? Math.min(1, c / 0.5) : Math.min(1, phase * 4);
      ctx.save();
      ctx.globalAlpha = Math.max(0.25, a);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const sz = (fight ? 46 : 72) * scale;
      ctx.font = fight ? `bold ${sz}px "Silkscreen", sans-serif` : `${sz}px "Silkscreen", sans-serif`;
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(label, this.vw / 2, this.vh * 0.5);
      ctx.fillStyle = fight ? '#d8413a' : '#fff';
      ctx.fillText(label, this.vw / 2, this.vh * 0.5);
      ctx.restore();
    }
  }

  _drawDeathOverlay(ctx) {
    if (this.state !== 'dying') return;
    const p = 1 - this.dying / 1.5;
    ctx.save();
    ctx.globalAlpha = Math.min(0.55, p);
    ctx.fillStyle = '#1a0c10';
    ctx.fillRect(0, 0, this.vw, this.vh);
    if (p > 0.35) {
      const sp = Math.min(1, (p - 0.35) / 0.25);
      ctx.globalAlpha = sp;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `bold ${64 + (1 - sp) * 40}px "Silkscreen", sans-serif`;
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText('YOU FELL', this.vw / 2, this.vh * 0.45);
      ctx.fillStyle = '#d8413a';
      ctx.fillText('YOU FELL', this.vw / 2, this.vh * 0.45);
    }
    ctx.restore();
  }

  _drawVictory(ctx) {
    if (this.state !== 'won') return;
    const t = this.wonT, cx = this.vw / 2;
    ctx.save();
    // golden wash
    ctx.fillStyle = `rgba(70,46,8,${Math.min(0.4, t * 0.28)})`;
    ctx.fillRect(0, 0, this.vw, this.vh);
    // heavenly light beam + glow on the hero
    if (this.player) {
      const sx = this.player.x - this.cam.x, sy = this.player.y - this.cam.y;
      const beam = ctx.createLinearGradient(sx, 0, sx, sy + 10);
      beam.addColorStop(0, 'rgba(255,236,170,0)'); beam.addColorStop(1, 'rgba(255,236,170,0.28)');
      ctx.fillStyle = beam;
      ctx.beginPath(); ctx.moveTo(sx - 14, 0); ctx.lineTo(sx + 14, 0);
      ctx.lineTo(sx + 60, sy + 16); ctx.lineTo(sx - 60, sy + 16); ctx.closePath(); ctx.fill();
      const rg = ctx.createRadialGradient(sx, sy - 16, 2, sx, sy - 16, 90);
      rg.addColorStop(0, `rgba(255,240,180,${0.4 + 0.1 * Math.sin(t * 5)})`); rg.addColorStop(1, 'rgba(255,220,120,0)');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(sx, sy - 16, 90, 0, Math.PI * 2); ctx.fill();
    }
    // VICTORY slam-in
    if (t > 0.35) {
      const p = Math.min(1, (t - 0.35) / 0.45);
      ctx.globalAlpha = Math.min(1, p * 1.5);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const sz = 26 + (1 - p) * 16;
      ctx.font = `${sz}px "Silkscreen", sans-serif`;
      ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(40,20,0,0.7)';
      ctx.strokeText('VICTORY', cx, this.vh * 0.32);
      const grd = ctx.createLinearGradient(0, this.vh * 0.30, 0, this.vh * 0.35);
      grd.addColorStop(0, '#fff3c0'); grd.addColorStop(1, '#f0b835');
      ctx.fillStyle = grd; ctx.fillText('VICTORY', cx, this.vh * 0.32);
    }
    if (t > 1.0) {
      ctx.globalAlpha = Math.min(1, (t - 1.0) / 0.5);
      ctx.font = 'bold 17px "Silkscreen", sans-serif'; ctx.fillStyle = '#ffe9b0';
      ctx.fillText('The Demon Lord Falls', cx, this.vh * 0.32 + 40);
    }
    ctx.restore();
  }

  _drawAbilityFx(ctx, fx) {
    const k = fx.kind;
    if (k === 'bolt') {
      const a = 1 - fx.t / fx.dur;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = '#bfe9ff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.shadowColor = '#7fd0ff'; ctx.shadowBlur = 10;
      ctx.beginPath();
      for (let i = 0; i < fx.pts.length - 1; i++) {
        const a0 = fx.pts[i], b0 = fx.pts[i + 1];
        ctx.moveTo(a0.x, a0.y);
        const mx = (a0.x + b0.x) / 2 + (Math.random() - 0.5) * 14;
        const my = (a0.y + b0.y) / 2 + (Math.random() - 0.5) * 14;
        ctx.lineTo(mx, my); ctx.lineTo(b0.x, b0.y);
      }
      ctx.stroke();
      ctx.restore();
    } else if (k === 'ring') {
      const prog = fx.t / fx.dur;
      ctx.save();
      ctx.globalAlpha = (1 - prog) * 0.9;
      ctx.strokeStyle = fx.color; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.r * (0.5 + 0.5 * prog), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    } else if (k === 'boom') {
      const prog = fx.t / fx.dur;
      ctx.save();
      const r = fx.r * (0.4 + 0.6 * prog);
      const g = ctx.createRadialGradient(fx.x, fx.y, 0, fx.x, fx.y, r);
      g.addColorStop(0, `rgba(255,230,150,${(1 - prog) * 0.95})`);
      g.addColorStop(0.6, `rgba(255,120,40,${(1 - prog) * 0.7})`);
      g.addColorStop(1, 'rgba(120,20,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else if (k === 'whirl') {
      const prog = fx.t / fx.dur;
      ctx.save();
      ctx.globalAlpha = (1 - prog) * 0.8;
      ctx.strokeStyle = '#dff0ff'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      const a0 = prog * Math.PI * 3;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.r * 0.9, a0, a0 + Math.PI * 1.4); ctx.stroke();
      ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.r * 0.9, a0 + Math.PI, a0 + Math.PI * 2.4); ctx.stroke();
      ctx.restore();
    } else if (k === 'ult') {
      const prog = fx.t / fx.dur;
      ctx.save();
      ctx.globalAlpha = (1 - prog) * 0.9;
      ctx.strokeStyle = '#ffe39a'; ctx.lineWidth = 14;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.maxR * prog, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.maxR * prog * 0.82, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  _drawFireball(ctx, fb) {
    ctx.save();
    const g = ctx.createRadialGradient(fb.x, fb.y, 0, fb.x, fb.y, fb.r * 2.2);
    g.addColorStop(0, '#fff2b0'); g.addColorStop(0.5, '#ff8a2a'); g.addColorStop(1, 'rgba(180,40,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(fb.x, fb.y, fb.r * 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  _drawDamage(ctx, fx) {
    const p = fx.t / fx.dur, a = 1 - p * p;
    const pop = p < 0.16 ? p / 0.16 : 1;                 // snap up on appear, then settle
    const scale = (fx.big ? 1.5 : 1) * (0.55 + 0.5 * pop) * (fx.big ? 1 + 0.12 * (1 - pop) : 1);
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    ctx.translate(fx.x, fx.y); ctx.scale(scale, scale);
    ctx.font = '11px "Silkscreen", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = fx.big ? 4 : 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(fx.text, 0, 0);
    ctx.fillStyle = fx.color;
    ctx.fillText(fx.text, 0, 0);
    ctx.restore();
  }

  _drawPlayer(ctx) {
    const p = this.player;
    const frame = pickFrame(p, this.time);
    // Fury charged: the knight is BLESSED — a soft holy halo + a thin glowing
    // gold rim traced around the body (a real silhouette outline, not a square).
    if (this.furyReady && this.state === 'playing') {
      const t = this.time, pulse = 0.5 + 0.5 * Math.sin(t * 6);
      ctx.save();
      // warm radial halo behind the body
      const g = ctx.createRadialGradient(p.x, p.y - 18, 4, p.x, p.y - 18, 44);
      g.addColorStop(0, `rgba(255,224,150,${0.18 + 0.12 * pulse})`);
      g.addColorStop(1, 'rgba(255,200,90,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y - 18, 44, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      this._drawBlessedRim(ctx, p, frame, pulse);
    }
    if (p.invuln > 0 && Math.floor(this.time * 20) % 2 === 0 && p.flash <= 0) {
      ctx.globalAlpha = 0.6;   // blink during i-frames
    }
    if (this.descentSink > 0) ctx.globalAlpha *= Math.max(0, 1 - this.descentSink * 1.15);  // sinking into the pit
    const breath = this.cutscene ? Math.sin(this.time * 2.2) * 1.4 : 0;   // chest rises/falls during the scene
    const tint = p.flash > 0 ? { color: '#ff5a5a', a: 0.6 }
      : (p.slowT > 0 ? { color: '#9fe0ff', a: 0.45 } : null);
    drawSprite(ctx, p.sprite, frame, p.x, p.y - breath, p.faceLeft, 1, tint);
    ctx.globalAlpha = 1;
    this._drawHeldBlade(ctx, p, breath);
  }

  // The chosen Living Blade, gripped in the knight's gauntlet. Held in a ready
  // guard when idle; on a swing it WHIPS through a wide arc — eased (wind-up →
  // fast cut → follow-through), the hand reaching into the cut, with a fading
  // motion-blur trail of the blade so the slash reads as one flowing motion.
  _drawHeldBlade(ctx, p, breath = 0) {
    const sword = (Assets.bladeHeld && Assets.bladeHeld[p.blade]) || (Assets.bladeSwords && Assets.bladeSwords[p.blade]);
    if (!sword || p.dead) return;
    const cw = 18, ch = 64, gripY = 52, sc = CONFIG.pixelScale * 0.31;   // simpler/slimmer; sized to fit him
    const faceSign = p.faceLeft ? -1 : 1, bd = bladeById(p.blade);
    let hx = p.x + faceSign * 10, hy = p.y - 20 - breath;
    const poses = [];
    if (p.swingTimer > 0) {
      const sp = Math.min(1, p.swingProgress);
      const arcV = (p.arcDeg * Math.PI / 180) * 1.5;     // sweep wider than the hit arc — dramatic
      const a0v = p.facingAngle - arcV * 0.45;
      // q: wind back slightly, then whip forward (smoothstepped) and follow through
      const qOf = (s) => { if (s < 0.2) return -0.15 * (s / 0.2); const u = (s - 0.2) / 0.8; return -0.15 + 1.15 * (u * u * (3 - 2 * u)); };
      const mainAim = a0v + qOf(sp) * arcV;
      const reach = Math.sin(sp * Math.PI) * 7;          // the arm pushes out through the cut
      hx += Math.cos(mainAim) * reach; hy += Math.sin(mainAim) * reach;
      for (const [ds, a] of [[-0.18, 0.18], [-0.10, 0.38], [0, 1]]) {   // trail → main
        poses.push({ aim: a0v + qOf(Math.max(0, sp + ds)) * arcV, a });
      }
    } else if (p.dashing) {
      poses.push({ aim: p.facingAngle + Math.PI * 0.85, a: 1 });
    } else {
      poses.push({ aim: -Math.PI / 2 + faceSign * 0.22 + Math.sin(this.time * 2.3) * 0.04, a: 1 });   // upright ready guard (not stuck out)
    }
    // an elemental glow at the hilt so the blade never blends into him
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gg = ctx.createRadialGradient(hx, hy, 2, hx, hy, 26);
    gg.addColorStop(0, this._rgba(bd.color, 0.3 + 0.12 * Math.sin(this.time * 5))); gg.addColorStop(1, this._rgba(bd.color, 0));
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(hx, hy, 26, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    for (const ps of poses) {
      ctx.save();
      ctx.globalAlpha = ps.a;
      ctx.translate(hx, hy);
      ctx.rotate(ps.aim + Math.PI / 2);                  // canvas tip is up; align it to `aim`
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sword, -cw * sc / 2, -gripY * sc, cw * sc, ch * sc);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // Render the hero sprite to a transparent offscreen, tint it solid gold (the
  // silhouette mask is correct there), then blit it offset + blurred behind the
  // real sprite — leaving only a glowing gold rim showing: a "blessed" outline.
  _drawBlessedRim(ctx, p, frame, pulse) {
    const AW = 120, AH = 140, PAD = 10;
    if (!this._auraCv) {
      this._auraCv = (typeof OffscreenCanvas !== 'undefined')
        ? new OffscreenCanvas(AW, AH) : document.createElement('canvas');
      this._auraCv.width = AW; this._auraCv.height = AH;
      this._auraCx = this._auraCv.getContext('2d');
    }
    const acx = this._auraCx;
    acx.setTransform(1, 0, 0, 1, 0, 0);
    acx.clearRect(0, 0, AW, AH);
    acx.imageSmoothingEnabled = false;
    // solid gold silhouette on a transparent backdrop (source-atop masks cleanly here)
    drawSprite(acx, p.sprite, frame, AW / 2, AH - PAD, p.faceLeft, 1, { color: '#ffe9a8', a: 1 });
    const destX = p.x - AW / 2, destY = p.y - (AH - PAD);
    const grow = 1.4 + pulse;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 + 0.3 * pulse;
    ctx.shadowColor = '#ffd86a'; ctx.shadowBlur = 7 + 5 * pulse;
    for (const [dx, dy] of [[grow, 0], [-grow, 0], [0, grow], [0, -grow]]) {
      ctx.drawImage(this._auraCv, destX + dx, destY + dy);
    }
    ctx.restore();
  }

  // The boss dragging itself up out of the ritual symbol: a waking altar-glow, the
  // figure rising through a clip at the floor line (head first), and churning smoke.
  _drawBossRise(ctx, e) {
    const rise = Math.max(0, e.rising), t = this.time;
    const col = e.sprite === 'boss' ? '#b81810' : '#7a2ed0';
    // the symbol waking: a pulsing glow welling out of the floor
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gr = 70 + 46 * rise + 8 * Math.sin(t * 6);
    const g = ctx.createRadialGradient(e.x, e.y, 4, e.x, e.y, gr);
    g.addColorStop(0, this._rgba(col, 0.5 * rise + 0.16)); g.addColorStop(1, this._rgba(col, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, gr, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // the figure rising — clipped at the feet line so it emerges from the floor
    const sh = e.r * 3.6, yoff = (1 - rise) * sh;
    ctx.save();
    ctx.beginPath(); ctx.rect(e.x - e.r * 2.6, e.y - sh - 60, e.r * 5.2, sh + 60); ctx.clip();
    ctx.globalAlpha = Math.min(1, rise / 0.14);          // just his sprite, fading in as he clears the floor
    drawSprite(ctx, e.sprite, 'idle', e.x, e.y + yoff, e.faceLeft, 1, null);
    ctx.restore();
    // dark smoke churning at the base to mask the seam
    ctx.save();
    for (let i = 0; i < 6; i++) {
      const ox = e.x + Math.cos(t * 1.3 + i * 1.7) * e.r * (0.5 + 0.5 * Math.sin(t + i));
      const oy = e.y - ((t * 22 + i * 20) % 42);
      ctx.globalAlpha = 0.16; ctx.fillStyle = '#0a0208';
      ctx.beginPath(); ctx.ellipse(ox, oy, e.r * 0.72, e.r * 0.32, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  _drawEnemy(ctx, e) {
    if (e.rising != null && e.rising < 1) { this._drawBossRise(ctx, e); return; }   // emerging from the altar
    const frame = pickFrame(e, this.time + e.x * 0.01);
    // CHARGE telegraph: a tapering danger lane with chevrons rushing outward and a
    // charge-glow gathering on the boss — reads clearly as "I'm about to dash here".
    if (e.state === 'windup' && e.spec.charge && this.player) {
      const a = Math.atan2(this.player.y - e.y, this.player.x - e.x);
      const prog = Math.max(0, Math.min(1, 1 - e.stateT / e.spec.charge.windup));
      const len = 220 + 40 * prog, w0 = e.r * 0.55, w1 = e.r * 1.5;
      ctx.save();
      ctx.translate(e.x, e.y); ctx.rotate(a);
      // the danger lane: a red wedge fading along its length
      const grad = ctx.createLinearGradient(0, 0, len, 0);
      grad.addColorStop(0, `rgba(255,42,28,${0.26 + 0.2 * prog})`);
      grad.addColorStop(1, 'rgba(255,42,28,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, -w0); ctx.lineTo(len, -w1); ctx.lineTo(len, w1); ctx.lineTo(0, w0); ctx.closePath(); ctx.fill();
      // chevrons sliding down the lane toward the target
      ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const cp = (this.time * 1.7 + i / 3) % 1;
        const cx = cp * len, cw = w0 + (w1 - w0) * cp;
        ctx.strokeStyle = `rgba(255,140,90,${(1 - cp) * 0.75 * (0.4 + 0.6 * prog)})`;
        ctx.beginPath(); ctx.moveTo(cx - 11, -cw * 0.68); ctx.lineTo(cx + 7, 0); ctx.lineTo(cx - 11, cw * 0.68); ctx.stroke();
      }
      ctx.restore();
      // a hot core gathering on the boss as it coils to spring
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const gr = e.r * (1.0 + 0.6 * prog);
      const g = ctx.createRadialGradient(e.x, e.y - e.r * 0.4, 0, e.x, e.y - e.r * 0.4, gr);
      g.addColorStop(0, `rgba(255,70,44,${0.45 * prog})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y - e.r * 0.4, gr, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // boss SLAM telegraph: a growing red danger ring you must leave
    if (e.state === 'special' && e.pendingSpecial === 'slam') {
      const prog = 1 - e.stateT / (e.specMax || 0.95);
      ctx.save();
      ctx.strokeStyle = `rgba(255,70,50,${0.4 + 0.5 * prog})`; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.slamR, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(255,60,40,${0.12 * prog})`;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.slamR * prog, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // PHASE-SHIFT enrage: a violent expanding shock-ring while the boss is untouchable
    if (e.state === 'enrage') {
      const prog = 1 - e.stateT / 1.0;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,${Math.round(150 - 110 * prog)},50,${(1 - prog) * 0.8 + 0.2})`;
      ctx.lineWidth = 3 + 5 * (0.5 + 0.5 * Math.sin(this.time * 30));
      ctx.beginPath(); ctx.arc(e.x, e.y - e.r * 0.4, e.r * (1.1 + prog * 1.8), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    // APOCALYPSE ember aura: flames rising off the Demon Lord
    if (e.emberAura) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 7; i++) {
        const ph = (this.time * 0.6 + i / 7) % 1;
        const ang = i * 2.39 + this.time * 0.5;
        const ox = e.x + Math.cos(ang) * e.r * (0.6 + 0.6 * ph);
        const oy = (e.y - e.r * 0.2) - ph * e.r * 2.2;
        const mr = 3.2 * (1 - ph);
        const gg = ctx.createRadialGradient(ox, oy, 0, ox, oy, mr * 3);
        gg.addColorStop(0, ph < 0.5 ? '#ffd36b' : '#ff6a2a'); gg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = (1 - ph) * 0.9; ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(ox, oy, mr * 3, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    // boss menace: a heavy cast shadow + a slow roiling aura of dread
    if (e.boss) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ctx.beginPath(); ctx.ellipse(e.x, e.y + 6, e.r * 1.35, e.r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      const col = e.sprite === 'boss' ? '#ff3a1e' : '#d81818';
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 3 + e.x * 0.01);
      const rr = Math.round(e.r * 2.4);
      const cache = this._glowCache || (this._glowCache = new Map());
      const key = rr + '|' + col;
      let g = cache.get(key);
      if (!g) { g = ctx.createRadialGradient(0, 0, 0, 0, 0, rr); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); cache.set(key, g); }
      ctx.save(); ctx.globalAlpha = 0.16 + 0.12 * pulse; ctx.fillStyle = g;
      ctx.translate(e.x, e.y - e.r * 0.7); ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // elite aura + bomber fuse-glow
    if ((e.elite || e.type === 'bomber') && !e.boss) {
      const isElite = !!e.elite;
      const col = e.affix ? e.affix.color : '#ff7a2a';
      const pulse = 0.5 + 0.5 * Math.sin(this.time * (e.type === 'bomber' ? 9 : 3.2) + e.x);
      // soft radial ground glow (cached gradient)
      const rr = Math.round(e.r * (isElite ? 2.5 : 2.0));
      const cache = this._glowCache || (this._glowCache = new Map());
      const key = rr + '|' + col;
      let g = cache.get(key);
      if (!g) { g = ctx.createRadialGradient(0, 0, 0, 0, 0, rr); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); cache.set(key, g); }
      ctx.save();
      ctx.globalAlpha = (isElite ? 0.22 : 0.3) + 0.18 * pulse; ctx.fillStyle = g;
      ctx.translate(e.x, e.y - e.r * 0.5); ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (isElite) {
        // Frostbound chills the very ground it stands on
        if (e.elite === 'icy') {
          ctx.save(); ctx.globalAlpha = 0.18 + 0.1 * pulse; ctx.fillStyle = col;
          ctx.beginPath(); ctx.ellipse(e.x, e.y + 5, e.r * 1.5, e.r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        // a pulsing consecrated ring at the feet
        ctx.save();
        ctx.globalAlpha = 0.3 + 0.3 * pulse; ctx.strokeStyle = col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(e.x, e.y + 4, e.r * 1.3, e.r * 0.52, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        // three glowing motes orbiting the body — the unmistakable elite signature
        const t = this.time * 1.8 + (e.auraT || 0);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
          const a = t + i * (Math.PI * 2 / 3);
          const ox = e.x + Math.cos(a) * e.r * 1.5;
          const oy = (e.y - e.r * 0.8) + Math.sin(a) * e.r * 0.62;
          const mr = 2.6 + 0.8 * Math.sin(t * 3 + i);
          const gg = ctx.createRadialGradient(ox, oy, 0, ox, oy, mr * 3);
          gg.addColorStop(0, col); gg.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.globalAlpha = 0.85; ctx.fillStyle = gg;
          ctx.beginPath(); ctx.arc(ox, oy, mr * 3, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1; ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(ox, oy, mr * 0.55, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
    }
    // Living-Blade status flourishes: flames on burning foes, an icy casing on frozen
    if (e.frozenT > 0) {
      ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = '#bfe9ff'; ctx.lineWidth = 1;
      ctx.strokeRect(e.x - e.r * 0.8, e.y - e.r * 1.5, e.r * 1.6, e.r * 1.85);
      ctx.globalAlpha = 0.25; ctx.fillStyle = '#bfe9ff'; ctx.fillRect(e.x - e.r * 0.8, e.y - e.r * 1.5, e.r * 1.6, e.r * 1.85);
      ctx.restore(); ctx.globalAlpha = 1;
    }
    let tint = e.state === 'enrage' ? { color: '#ffffff', a: 0.45 + 0.35 * Math.sin(this.time * 30) }
      : e.flash > 0 ? { color: '#ffffff', a: 0.7 }
      : e.frozenT > 0 ? { color: '#9fd8ff', a: 0.5 }
      : e.burnT > 0 ? { color: '#ff7a2a', a: 0.32 + 0.12 * Math.sin(this.time * 18) }
      : (e.state === 'windup' || e.state === 'special' ? { color: '#ff4040', a: 0.5 }
      : (e.husk ? { color: '#16102a', a: 0.5 }            // the Revenant: a shade of what you were
      : (e.elite ? { color: e.affix.color, a: 0.16 } : null)));
    // BLADELIGHT: outside the light, foes live as silhouettes with burning eyes.
    // Hit-flash / telegraphs / burning override — those must read through the dark.
    // (Capped at 0.8 so a hint of body colour always survives — foes never strobe
    // fully in and out of existence at the light's rim.)
    const lit = (e.boss || tint) ? 1 : this._litAt(e.x, e.y);
    if (lit < 0.85) tint = { color: '#070310', a: Math.min(0.8, (1 - lit) * 0.95) };
    // cold rim/backlight so the all-black Demon Lord reads against the dark throne
    if (e.boss && this.biome && this.biome.moonlit) {
      const rl = this.biome.moonlit, sh = e.r * 3.4;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const halo = ctx.createRadialGradient(e.x, e.y - sh * 0.5, 4, e.x, e.y - sh * 0.5, sh * 0.92);
      halo.addColorStop(0, this._rgba(rl, 0.26)); halo.addColorStop(0.5, this._rgba(rl, 0.10)); halo.addColorStop(1, this._rgba(rl, 0));
      ctx.fillStyle = halo; ctx.beginPath(); ctx.ellipse(e.x, e.y - sh * 0.5, sh * 0.62, sh * 0.92, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // a gentle breathing bob when idle so foes never look frozen
    const bob = (!e.boss && !e.moving) ? Math.sin(this.time * 2.6 + e.x * 0.07) : 0;
    drawSprite(ctx, e.sprite, frame, e.x, e.y - bob, e.faceLeft, 1, tint);
    if (e.burnT > 0) this._drawBurning(ctx, e);   // real flames, drawn over the body
    // eyes in the dark: the only thing a swallowed silhouette gives away
    if (lit < 0.55) {
      const ec = (e.named && e.named.color) || (e.elite && e.affix.color) ||
        ({ chaser: '#ff5040', swarmer: '#ffb24a', tank: '#ff4040', caster: '#b06bff', bomber: '#ffd23a' })[e.type] || '#ff5040';
      const ea = (1 - lit) * (0.75 + 0.25 * Math.sin(this.time * 5 + e.x * 0.13));
      const ey = e.y - bob - e.r * 1.5, off = e.faceLeft ? -1 : 1;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ea;
      ctx.fillStyle = ec;
      ctx.fillRect((e.x - 4 + off) | 0, ey | 0, 2, 2);
      ctx.fillRect((e.x + 2 + off) | 0, ey | 0, 2, 2);
      ctx.globalAlpha = ea * 0.35;
      ctx.fillRect((e.x - 5 + off) | 0, (ey - 1) | 0, 4, 4);
      ctx.fillRect((e.x + 1 + off) | 0, (ey - 1) | 0, 4, 4);
      ctx.restore(); ctx.globalAlpha = 1;
    }
    // small floating HP bar for tanks & elites (bosses use the big top bar)
    if (!e.boss && (e.type === 'tank' || e.elite) && lit > 0.35) {
      const named = e.named, w = named ? 48 : 34, hpf = e.hp / e.maxHP, hy = e.y - (named ? 62 : 56);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(e.x - w / 2 - 1, hy - 1, w + 2, 6);
      ctx.fillStyle = named ? named.color : (e.elite ? e.affix.color : '#c9a23a');
      ctx.fillRect(e.x - w / 2, hy, w * hpf, 4);
      if (named) {                                   // a title plate above the bar
        ctx.save();
        ctx.font = 'bold 10px "Silkscreen", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(named.name, e.x, hy - 5);
        ctx.fillStyle = named.color; ctx.fillText(named.name, e.x, hy - 5);
        ctx.restore();
      }
    }
  }

  // A brief banner when a named elite arrives, or when its relic is claimed.
  _drawNamedToast(ctx) {
    const nt = this.namedToast; if (!nt) return;
    const k = nt.t / nt.dur, W = this.vw, H = this.vh;
    const a = Math.min(1, nt.t * 3) * Math.min(1, (1 - k) * 3);
    ctx.save();
    ctx.globalAlpha = Math.max(0, a); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const y = H * 0.2;
    let size = 22; ctx.font = `bold ${size}px "Silkscreen", sans-serif`;
    const maxW = W * 0.86, tw = ctx.measureText(nt.name).width;
    if (tw > maxW) { size = Math.floor(size * maxW / tw); ctx.font = `bold ${size}px "Silkscreen", sans-serif`; }
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(nt.name, W / 2, y);
    ctx.shadowColor = nt.color; ctx.shadowBlur = 14 * a;
    ctx.fillStyle = nt.color; ctx.fillText(nt.name, W / 2, y);
    ctx.shadowBlur = 0;
    if (nt.sub) {
      ctx.font = 'italic 12px "Silkscreen", sans-serif'; ctx.fillStyle = 'rgba(230,220,235,0.85)';
      ctx.fillText(nt.sub, W / 2, y + size * 0.72 + 6);
    }
    ctx.restore();
  }

  // A big Souls-style boss bar near the bottom-centre while a boss lives.
  _drawBossBar(ctx) {
    if (this.state !== 'playing' || this.cutscene) return;
    const boss = this.enemies.find((e) => e.boss && !e.dead);
    if (!boss) return;
    const W = this.vw, H = this.vh;
    // lower-centre, lifted well clear of the joystick / swing / fury controls
    const bw = Math.min(W * 0.78, 440), bx = (W - bw) / 2, bh = 13;
    const by = Math.round(Math.min(H - 168, H * 0.78));
    const hpf = Math.max(0, boss.hp / boss.maxHP);
    if (boss._hpShown == null) boss._hpShown = hpf;
    boss._hpShown += (hpf - boss._hpShown) * Math.min(1, 0.016 * 8);   // smooth drain
    const name = (BOSS_NAMES[boss.type] || 'BOSS').toUpperCase();
    const fillCol = ['#d8231a', '#ff5a2a', '#ffb12a'][boss.phase] || '#ffb12a';   // hotter each phase
    ctx.save();
    // name above the bar
    ctx.font = '14px "Silkscreen", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(name, W / 2, by - 8);
    ctx.fillStyle = '#e9b8b2'; ctx.fillText(name, W / 2, by - 8);
    // frame + track
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; this._roundRect(ctx, bx - 4, by - 4, bw + 8, bh + 8, 5); ctx.fill();
    ctx.strokeStyle = 'rgba(120,16,12,0.9)'; ctx.lineWidth = 2; this._roundRect(ctx, bx - 4, by - 4, bw + 8, bh + 8, 5); ctx.stroke();
    ctx.fillStyle = '#2a0606'; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = 'rgba(255,120,90,0.4)'; ctx.fillRect(bx, by, bw * boss._hpShown, bh);  // drain ghost
    ctx.fillStyle = fillCol; ctx.fillRect(bx, by, bw * hpf, bh);
    if (boss.invuln) { ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.3 * Math.sin(this.time * 30)})`; ctx.fillRect(bx, by, bw * hpf, bh); }
    ctx.fillStyle = 'rgba(255,200,170,0.6)'; ctx.fillRect(bx, by, bw * hpf, 3);             // top sheen
    // phase-threshold notches so the player can read the fight's structure
    if (boss.phaseDefs) {
      for (const ph of boss.phaseDefs) {
        const nx = bx + bw * ph.at;
        ctx.fillStyle = 'rgba(20,4,4,0.9)'; ctx.fillRect(nx - 1, by - 1, 2, bh + 2);
        ctx.fillStyle = 'rgba(255,220,150,0.5)'; ctx.fillRect(nx, by - 1, 1, bh + 2);
      }
    }
    ctx.restore();
    // the phase-break banner ("WRATH" / "APOCALYPSE")
    if (this.bossPhase) {
      const bp = this.bossPhase, k = bp.t / bp.dur;
      const a = Math.min(1, (1 - k) * 4) * Math.min(1, bp.t * 6);
      ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const fs = 34 + (1 - Math.min(1, bp.t * 3)) * 26;       // punches in
      ctx.font = `${Math.round(fs)}px "Press Start 2P", monospace`;
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(bp.title, W / 2, H * 0.34);
      const grad = ctx.createLinearGradient(0, H * 0.3, 0, H * 0.38);
      grad.addColorStop(0, '#ffd36b'); grad.addColorStop(1, '#ff3a1e');
      ctx.fillStyle = grad; ctx.fillText(bp.title, W / 2, H * 0.34);
      ctx.restore();
    }
  }

  _rgba(hex, a) {
    const h = hex.replace('#', '');
    return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
  }

  _drawProjectile(ctx, pr) {
    ctx.save();
    const col = pr.boss ? '#ff7a2a' : '#b06bff';
    const glow = ctx.createRadialGradient(pr.x, pr.y, 0, pr.x, pr.y, pr.r * 2.4);
    glow.addColorStop(0, col);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r * 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  _drawGhost(ctx, fx) {
    const prog = fx.t / fx.dur;
    ctx.save();
    ctx.globalAlpha = (1 - prog) * 0.5;
    drawSprite(ctx, fx.sprite || 'knight', fx.frame || 'idle', fx.x, fx.y, fx.faceLeft, 1, { color: '#aee6ff', a: 0.95 });
    ctx.restore();
  }

  _drawDashStreak(ctx, fx) {
    const prog = fx.t / fx.dur, a = 1 - prog;
    const dx = Math.cos(fx.a), dy = Math.sin(fx.a);
    const len = 30 + prog * 34;            // streak stretches out as it fades
    ctx.save();
    ctx.lineCap = 'round';
    ctx.shadowColor = '#7fd0ff'; ctx.shadowBlur = 12;
    // soft wide trail
    ctx.globalAlpha = a * 0.5; ctx.strokeStyle = '#7fd0ff'; ctx.lineWidth = 11 * a + 2;
    ctx.beginPath(); ctx.moveTo(fx.x - dx * len, fx.y - dy * len); ctx.lineTo(fx.x - dx * 6, fx.y - dy * 6); ctx.stroke();
    // bright core
    ctx.globalAlpha = a * 0.9; ctx.strokeStyle = '#eaffff'; ctx.lineWidth = 4 * a + 1;
    ctx.beginPath(); ctx.moveTo(fx.x - dx * len * 0.85, fx.y - dy * len * 0.85); ctx.lineTo(fx.x - dx * 4, fx.y - dy * 4); ctx.stroke();
    ctx.restore();
  }

  _drawSpark(ctx, fx) {
    const a = 1 - fx.t / fx.dur;
    ctx.save();
    ctx.globalAlpha = a;
    if (fx.streak) {                      // motion-streak: a short line trailing the velocity
      ctx.strokeStyle = fx.col || '#fff'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(fx.x, fx.y);
      ctx.lineTo(fx.x - fx.vx * 0.035, fx.y - fx.vy * 0.035); ctx.stroke();
    } else {
      ctx.fillStyle = fx.col || '#fff3c0';
      ctx.fillRect(fx.x - 1.5, fx.y - 1.5, 3, 3);
    }
    ctx.restore();
  }

  // expanding white flash ring at the point of impact
  _drawHitRing(ctx, fx) {
    const p = fx.t / fx.dur, a = 1 - p;
    const r = fx.r * (0.3 + 0.7 * p);
    ctx.save();
    ctx.globalAlpha = a * 0.85;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1 + 3 * (1 - p);
    ctx.beginPath(); ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // a quick bright slash line carved across the struck foe
  _drawSlashMark(ctx, fx) {
    const p = fx.t / fx.dur, a = 1 - p;
    const grow = Math.min(1, p / 0.4), len = fx.len * (0.4 + 0.6 * grow);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(fx.x, fx.y); ctx.rotate(fx.angle);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 3.5 * (1 - p * 0.6);
    ctx.beginPath(); ctx.moveTo(-len / 2, 0); ctx.lineTo(len / 2, 0); ctx.stroke();
    ctx.restore();
  }

  // Build a tapered crescent (lens) Path2D: pinched to points at both ends, fat
  // in the middle — the classic anime blade-trail shape. `u0..u1` lets the slash
  // "wipe in" along the arc as it's drawn.
  _crescentPath(a0, arc, rMid, thick, u0, u1) {
    const path = new Path2D(), steps = 24;
    for (let i = 0; i <= steps; i++) {
      const u = u0 + (u1 - u0) * (i / steps), ang = a0 + u * arc;
      const t = Math.sin(u * Math.PI), r = rMid + t * thick * 0.5;
      const x = Math.cos(ang) * r, y = Math.sin(ang) * r;
      i === 0 ? path.moveTo(x, y) : path.lineTo(x, y);
    }
    for (let i = steps; i >= 0; i--) {
      const u = u0 + (u1 - u0) * (i / steps), ang = a0 + u * arc;
      const t = Math.sin(u * Math.PI), r = rMid - t * thick * 0.5;
      path.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
    }
    path.closePath();
    return path;
  }

  // The swing. Each Living Blade has its OWN cut — not a recolour:
  //   Emberbrand  → a burning cut: flame tongues lick off the arc, embers pop,
  //                 and the path keeps a red afterburn as it fades.
  //   Frostfang   → a crystallizing cut: a hard faceted rim and a fan of ice
  //                 shards that shoot out and hang glinting in the cold.
  //   Stormedge   → the cut IS lightning: a jagged crackling arc that re-rolls
  //                 its jitter every frame, throwing micro-forks off the edge.
  // No blade (shrine/camp) keeps the plain steel crescent.
  _drawSwing(ctx, fx) {
    const p = this.player;
    const style = fx.style || (p.hero && p.hero.swingStyle) || 'sweep';
    const reach = p.reach;
    const arc = p.arcDeg * Math.PI / 180;
    const a = fx.angle, a0 = a - arc / 2;
    const life = fx.t / fx.dur;                          // 0..1 over the whole visual
    const sweep = Math.min(1, fx.t / (fx.dur * 0.42));   // leading edge wipes in fast
    const fade = life < 0.4 ? 1 : Math.max(0, 1 - (life - 0.4) / 0.6);
    // shared geometry for all the renderers below
    const G = {
      a, a0, arc, reach, life, sweep, fade, seed: fx.seed || 0,
      slam: style === 'slam',
      rMid: reach * 0.68,
      outer: reach * (style === 'slam' ? 0.46 : 0.4),
      // point on the crescent spine/rim at sweep-fraction u (off = radial offset)
      at: (u, off = 0) => {
        const ang = a0 + u * arc;
        const r = G.rMid + Math.sin(u * Math.PI) * G.outer * 0.5 + off;
        return [Math.cos(ang) * r, Math.sin(ang) * r, ang];
      },
    };
    ctx.save();
    ctx.translate(fx.x, fx.y);                           // slash stays where it was swung
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';            // additive glow over the dark dungeon

    if (style === 'stab') this._swingStab(ctx, G, fx.blade);
    else if (fx.blade === 'ember') this._swingEmber(ctx, G);
    else if (fx.blade === 'frost') this._swingFrost(ctx, G);
    else if (fx.blade === 'storm') this._swingStorm(ctx, G);
    else this._swingSteel(ctx, G);

    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  // Rogue: a pair of fast dagger streaks + a thin crescent flick (tinted by blade).
  _swingStab(ctx, G, blade) {
    const { a, reach, sweep, fade } = G;
    const tint = { ember: ['255,150,60', '255,220,150'], frost: ['150,225,255', '235,250,255'],
      storm: ['185,150,255', '240,230,255'] }[blade] || ['150,255,200', '180,255,220'];
    for (const off of [-0.16, 0.16]) {
      const aa = a + off;
      const grd = ctx.createLinearGradient(Math.cos(aa) * reach * 0.22, Math.sin(aa) * reach * 0.22,
        Math.cos(aa) * reach * 0.92, Math.sin(aa) * reach * 0.92);
      grd.addColorStop(0, `rgba(${tint[0]},0)`);
      grd.addColorStop(0.6, `rgba(${tint[0]},${0.85 * fade})`);
      grd.addColorStop(1, `rgba(255,255,255,${0.95 * fade})`);
      ctx.strokeStyle = grd; ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(aa) * reach * 0.22, Math.sin(aa) * reach * 0.22);
      ctx.lineTo(Math.cos(aa) * reach * 0.92, Math.sin(aa) * reach * 0.92);
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(${tint[1]},${0.5 * fade})`;
    ctx.fill(this._crescentPath(a - 0.3, 0.6, reach * 0.8, reach * 0.13, 0, sweep));
  }

  // the shared crescent layers (bloom / body / core / rim glint / tip streaks)
  _swingCrescentBase(ctx, G, bloom, body, opts = {}) {
    const { a0, arc, reach, life, sweep, fade, slam, rMid, outer } = G;
    const bodyA = opts.bodyA ?? 0.42, coreA = opts.coreA ?? 0.7;
    if (life < 0.26 && (opts.flash ?? true)) {       // origin flash where the swing begins
      const f = (1 - life / 0.26) * fade;
      const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, reach * 0.4);
      rg.addColorStop(0, `rgba(${body},${0.5 * f})`);
      rg.addColorStop(1, `rgba(${body},0)`);
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(0, 0, reach * 0.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = `rgba(${bloom},${0.20 * fade})`;
    ctx.fill(this._crescentPath(a0, arc, rMid, outer, 0, sweep));
    ctx.fillStyle = `rgba(${body},${bodyA * fade})`;
    ctx.fill(this._crescentPath(a0, arc, rMid, outer * 0.5, 0, sweep));
    if (coreA > 0) {
      ctx.fillStyle = `rgba(255,255,255,${coreA * fade})`;
      ctx.fill(this._crescentPath(a0, arc, rMid, outer * 0.22, 0, sweep));
    }
    if (opts.rim ?? true) {                          // blade-edge glint along the outer rim
      ctx.strokeStyle = `rgba(255,255,255,${0.92 * fade})`; ctx.lineWidth = slam ? 3.5 : 2.5;
      ctx.beginPath();
      const segs = 22;
      for (let i = 0; i <= segs; i++) {
        const [x, y] = G.at((i / segs) * sweep);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    if (opts.tip ?? true) {                          // hot glint flicking off the leading tip
      const [tx, ty, ta] = G.at(sweep), tang = ta + Math.PI / 2;
      ctx.strokeStyle = `rgba(255,255,255,${0.95 * fade})`; ctx.lineWidth = slam ? 4 : 3;
      ctx.beginPath();
      ctx.moveTo(tx - Math.cos(tang) * reach * 0.05, ty - Math.sin(tang) * reach * 0.05);
      ctx.lineTo(tx + Math.cos(tang) * reach * 0.11, ty + Math.sin(tang) * reach * 0.11);
      ctx.stroke();
    }
  }

  // No blade chosen (shrine/camp): the plain steel cut, gold-warm for the Paladin.
  _swingSteel(ctx, G) {
    const { a0, a, arc, reach, sweep, fade, slam } = G;
    this._swingCrescentBase(ctx, G, slam ? '150,90,25' : '60,150,255', slam ? '255,190,90' : '150,220,255');
    if (sweep < 1) {                                 // thin speed lines trailing the edge
      ctx.lineWidth = 1.5;
      for (const k of [0.12, 0.24]) {
        const [x1, y1, aa] = G.at(Math.max(0, sweep - k));
        ctx.strokeStyle = `rgba(150,220,255,${0.5 * (1 - k * 3) * fade})`;
        ctx.beginPath();
        ctx.moveTo(x1 - Math.cos(aa) * 6, y1 - Math.sin(aa) * 6);
        ctx.lineTo(x1 + Math.cos(aa) * 8, y1 + Math.sin(aa) * 8);
        ctx.stroke();
      }
    }
    if (slam && sweep >= 1) {                        // crushing ground-flare at full extension
      ctx.strokeStyle = `rgba(255,150,40,${0.7 * fade})`; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(0, 0, reach * 1.05, a0 - 0.1, a + arc / 2 + 0.1); ctx.stroke();
    }
  }

  // 🔥 EMBERBRAND — no crescent at all: a white-hot lash wipes through, and a
  // WAVE OF REAL FLAME erupts along the cut — tongues billow, curl, lift and
  // break apart as they die (the flame releases WITH the slash, Rengoku-style).
  _swingEmber(ctx, G) {
    const { reach, life, sweep, fade, seed } = G;
    // 1) the cut itself: thin, white-hot, gone in a blink
    if (life < 0.3) {
      const ca = 1 - life / 0.3;
      ctx.strokeStyle = `rgba(255,240,200,${0.95 * ca})`; ctx.lineWidth = 3; ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i <= 20; i++) { const [x, y] = G.at((i / 20) * sweep); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    }
    // 2) the flame wave: tongues are born as the edge passes (the wave ROLLS),
    //    each one growing, curling sideways, lifting off and dying upward
    const N = 13;
    for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N;
      if (u > sweep) break;
      const born = u * 0.22;
      const tl = Math.max(0, Math.min(1, (life - born) / 0.72));
      if (tl <= 0) continue;
      const env = Math.sin(tl * Math.PI);                  // swell → gutter out
      const [bx, by, ang] = G.at(u, -2);
      const ox = Math.cos(ang), oy = Math.sin(ang);
      const tx = -oy, ty = ox;                             // tangent (sideways curl)
      const flick = 0.75 + 0.25 * Math.sin(seed + i * 2.7 + this.time * 19);
      const len = reach * (0.30 + 0.34 * Math.sin(u * Math.PI)) * env * flick;
      const w = (6.5 + 2 * Math.sin(seed + i * 1.7)) * env;
      const drift = tl * tl * 16;                          // dying flames LIFT
      const cx1 = bx + ox * len * 0.5 + tx * Math.sin(seed * 2 + i) * 5;
      const cy1 = by + oy * len * 0.5 - drift * 0.5;
      const tipx = bx + ox * len + tx * Math.sin(this.time * 13 + i * 2) * 4;
      const tipy = by + oy * len - drift;
      // three layered licks: deep red body → orange → a yellow core
      for (const [col, k] of [
        [`rgba(190,40,10,${0.50 * fade})`, 1.25],
        [`rgba(255,120,30,${0.62 * fade})`, 1.0],
        [`rgba(255,220,110,${0.60 * fade})`, 0.55],
      ]) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(bx - tx * w * k, by - ty * w * k);
        ctx.quadraticCurveTo(cx1, cy1, tipx, tipy);
        ctx.quadraticCurveTo(cx1 + tx * w * k * 0.7, cy1 + ty * w * k * 0.7, bx + tx * w * k, by + ty * w * k);
        ctx.closePath(); ctx.fill();
      }
    }
    // 3) ignition flash at the hand as the wave is loosed
    if (life < 0.2) {
      const f = (1 - life / 0.2) * fade;
      const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, reach * 0.5);
      rg.addColorStop(0, `rgba(255,230,170,${0.7 * f})`);
      rg.addColorStop(0.4, `rgba(255,140,40,${0.45 * f})`);
      rg.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(0, 0, reach * 0.5, 0, Math.PI * 2); ctx.fill();
    }
    // 4) embers spat up off the burning arc
    for (let i = 0; i < 8; i++) {
      const u = ((Math.sin(seed * 3.3 + i * 4.7) + 1) / 2) * sweep;
      const [ex, ey] = G.at(u, 2);
      const rise = life * (26 + (i % 4) * 12), wob = Math.sin(this.time * 9 + i * 2.4) * 3;
      const s2 = i % 3 === 0 ? 2.5 : 1.6;
      ctx.fillStyle = i % 2 ? `rgba(255,220,120,${0.85 * fade})` : `rgba(255,110,30,${0.85 * fade})`;
      ctx.fillRect(ex + wob - s2 / 2, ey - rise - s2 / 2, s2, s2);
    }
  }

  // ❄️ FROSTFANG — no crescent: one razor-thin cut-line, and then the slash
  // CRYSTALLIZES — a fan of big faceted ice spikes erupts out of the cut with
  // an overshoot pop and stands frozen, glinting, while the cold mists off it.
  _swingFrost(ctx, G) {
    const { reach, life, sweep, seed } = G;
    const fade = Math.pow(G.fade, 0.65);                   // the cold lingers
    // 1) the cut: surgical, silver, brief
    if (life < 0.35) {
      const ca = 1 - life / 0.35;
      ctx.strokeStyle = `rgba(235,250,255,${0.95 * ca})`; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 18; i++) { const [x, y] = G.at((i / 18) * sweep); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    }
    // 2) crystallization: faceted spikes erupt where the edge passed
    const N = 7;
    const pop = (t) => (t < 0.6 ? 1.15 * (t / 0.6) : 1.15 - 0.15 * ((t - 0.6) / 0.4));   // overshoot, settle
    for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N;
      if (u > sweep) continue;
      const born = u * 0.2 + 0.05;
      const tl = Math.max(0, Math.min(1, (life - born) / 0.5));
      if (tl <= 0) continue;
      const grow = pop(tl);
      const [bx, by, ang] = G.at(u, -1);
      const sa = ang + Math.sin(seed * 2.1 + i * 3.9) * 0.3;     // each spike skewed
      const ox = Math.cos(sa), oy = Math.sin(sa);
      const tx = -oy, ty = ox;
      const len = reach * (0.22 + 0.30 * Math.sin(u * Math.PI)) * grow
        * (0.85 + 0.3 * ((Math.sin(seed + i * 7) + 1) / 2));
      const w = (4.5 + (i % 3)) * grow;
      const tipx = bx + ox * len, tipy = by + oy * len;
      // two-tone facets + a white sun-catch edge: it reads as CUT ICE
      ctx.fillStyle = `rgba(110,180,230,${0.50 * fade})`;
      ctx.beginPath(); ctx.moveTo(bx - tx * w, by - ty * w); ctx.lineTo(tipx, tipy); ctx.lineTo(bx, by); ctx.closePath(); ctx.fill();
      ctx.fillStyle = `rgba(205,240,255,${0.65 * fade})`;
      ctx.beginPath(); ctx.moveTo(bx + tx * w, by + ty * w); ctx.lineTo(tipx, tipy); ctx.lineTo(bx, by); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${0.85 * fade})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bx + tx * w, by + ty * w); ctx.lineTo(tipx, tipy); ctx.stroke();
      // a smaller flanking crystal at every other station
      if (i % 2 === 0) {
        const l2 = len * 0.4;
        ctx.fillStyle = `rgba(170,220,250,${0.5 * fade})`;
        ctx.beginPath();
        ctx.moveTo(bx + tx * (w + 3), by + ty * (w + 3));
        ctx.lineTo(bx + ox * l2 + tx * 4, by + oy * l2 + ty * 4);
        ctx.lineTo(bx + tx, by + ty);
        ctx.closePath(); ctx.fill();
      }
      // glint stars on the standing crystals
      if (tl > 0.55 && (i + Math.floor(this.time * 6)) % 3 === 0) {
        ctx.strokeStyle = `rgba(255,255,255,${0.9 * fade})`; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tipx - 3, tipy); ctx.lineTo(tipx + 3, tipy);
        ctx.moveTo(tipx, tipy - 3); ctx.lineTo(tipx, tipy + 3);
        ctx.stroke();
      }
    }
    // 3) cold mist rolling off the cut
    for (let i = 0; i < 4; i++) {
      const u = ((Math.sin(seed * 5 + i * 3.1) + 1) / 2) * sweep;
      const [mx, my] = G.at(u, 4);
      const mr = 5 + life * 14 + i * 2;
      const mg = ctx.createRadialGradient(mx, my, 0, mx, my, mr);
      mg.addColorStop(0, `rgba(190,233,255,${0.12 * fade})`);
      mg.addColorStop(1, 'rgba(190,233,255,0)');
      ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ⚡ STORMEDGE — no band at all: the swing is 3 REAL bolts that leap from the
  // hand to points across (and past) the arc, re-aimed every crackle tick, each
  // ending in a strike-flash. Pure snap — it's gone almost before it lands.
  _swingStorm(ctx, G) {
    const { a0, arc, life, sweep, seed } = G;
    const fade = Math.pow(G.fade, 1.6);
    const tick = Math.floor(this.time * 36);               // chaos clock
    const rnd = (k) => Math.sin(seed * 9.17 + k * 13.7 + tick * 7.31) * 0.5 + 0.5;
    // the faintest violet wash gives the bolts a stage
    ctx.fillStyle = `rgba(110,80,200,${0.10 * fade})`;
    ctx.fill(this._crescentPath(a0, arc, G.rMid, G.outer * 0.8, 0, sweep));
    for (let b = 0; b < 3; b++) {
      const u = (0.15 + 0.7 * rnd(b * 3 + 1)) * sweep;
      const over = 0.85 + rnd(b * 5 + 2) * 0.5;            // some bolts stab past the arc
      const ang = a0 + u * arc;
      const r = (G.rMid + Math.sin(u * Math.PI) * G.outer * 0.5) * over;
      const ex = Math.cos(ang) * r, ey = Math.sin(ang) * r;
      // jagged leap from the hand to the strike point (glow + white core)
      for (const [col, lw] of [[`rgba(150,110,255,${0.5 * fade})`, 5], [`rgba(248,242,255,${0.95 * fade})`, 1.6]]) {
        ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(0, 0);
        for (let i = 1; i <= 6; i++) {
          const f = i / 6;
          const j = (i < 6) ? (rnd(b * 17 + i) - 0.5) * 22 * (1 - Math.abs(f - 0.5)) : 0;
          ctx.lineTo(ex * f - Math.sin(ang) * j, ey * f + Math.cos(ang) * j);
        }
        ctx.stroke();
      }
      // strike flash where the bolt lands
      const fr = 5 + rnd(b * 7 + 3) * 5;
      const fg = ctx.createRadialGradient(ex, ey, 0, ex, ey, fr * 2.4);
      fg.addColorStop(0, `rgba(240,232,255,${0.8 * fade})`);
      fg.addColorStop(1, 'rgba(140,90,255,0)');
      ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(ex, ey, fr * 2.4, 0, Math.PI * 2); ctx.fill();
    }
    // the hand crackles as the charge releases
    if (life < 0.4) {
      const f = 1 - life / 0.4;
      const og = ctx.createRadialGradient(0, 0, 0, 0, 0, 18);
      og.addColorStop(0, `rgba(240,232,255,${0.7 * f})`);
      og.addColorStop(1, 'rgba(140,90,255,0)');
      ctx.fillStyle = og; ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();
    }
  }

  _drawHUD(ctx) {
    if (this.state === 'title' || this.state === 'gameover' || this.state === 'victory' || this.state === 'won') return;
    const p = this.player;
    if (!p) return;
    // health bar (fixed max) — smoothed with a "damage ghost" chunk. On a hit
    // the whole bar jolts and flashes white.
    const bw = Math.min(180, this.vw * 0.36), bh = 20;
    const hit = Math.max(0, this.hpHitT || 0) / 0.32;
    const bx = 18 + (hit > 0 ? (Math.random() - 0.5) * 6 * hit : 0);
    const by = 20 + (hit > 0 ? (Math.random() - 0.5) * 5 * hit : 0);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(bx - 3, by - 3, bw + 6, bh + 6);
    const hpf = Math.max(0, this.hpDisplay / p.maxHP);
    const ghostf = Math.max(hpf, this.hpGhost / p.maxHP);
    const col = hpf > 0.5 ? '#5ec860' : hpf > 0.25 ? '#e9c84a' : '#d8413a';
    ctx.fillStyle = '#2a1d28'; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = 'rgba(232,120,120,0.65)'; ctx.fillRect(bx, by, bw * ghostf, bh); // ghost
    ctx.fillStyle = col; ctx.fillRect(bx, by, bw * hpf, bh);
    if (hit > 0) { ctx.fillStyle = `rgba(255,255,255,${0.5 * hit})`; ctx.fillRect(bx, by, bw * hpf, bh); }
    // low-health danger pulse on the frame
    const danger = hpf <= 0.3 ? 0.4 + 0.4 * Math.sin(this.time * 7) : 0;
    ctx.strokeStyle = danger ? `rgba(216,65,58,${danger})` : 'rgba(255,255,255,0.25)';
    ctx.lineWidth = danger ? 2 : 1; ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = '#fff'; ctx.font = '9px "Silkscreen", sans-serif';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText(`${Math.max(0, Math.ceil(p.hp))}/${p.maxHP}`, bx + 7, by + bh / 2 + 1);

    // fury bar (under health) — glows when fully charged
    const fy = 20 + bh + 5, fh = 11, fbx = 18;
    const ff = p.fury / p.furyMax;
    const pulse = 0.7 + 0.3 * Math.sin(this.time * 10);
    if (ff >= 1) {                                   // charged: a warm glow halo behind the bar
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 + 0.25 * pulse;
      const gg = ctx.createLinearGradient(fbx, 0, fbx + bw, 0);
      gg.addColorStop(0, 'rgba(255,180,40,0)'); gg.addColorStop(0.5, 'rgba(255,210,90,0.9)'); gg.addColorStop(1, 'rgba(255,180,40,0)');
      ctx.fillStyle = gg; ctx.fillRect(fbx - 6, fy - 6, bw + 12, fh + 12); ctx.restore();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(fbx - 3, fy - 3, bw + 6, fh + 6);
    ctx.fillStyle = '#241830'; ctx.fillRect(fbx, fy, bw, fh);
    ctx.fillStyle = ff >= 1 ? `rgba(255,220,90,${pulse})` : '#9a59e0';
    ctx.fillRect(fbx, fy, bw * ff, fh);
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = 'bold 9px "Silkscreen", sans-serif';
    ctx.textAlign = 'left'; ctx.fillText(ff >= 1 ? 'ULTIMATE!' : 'FURY', fbx + 4, fy + fh / 2 + 1);

    // Living-Blade chip: name + three evolution pips, in the blade's colour
    if (p.blade) {
      const bd = bladeById(p.blade), cy2 = fy + fh + 12;
      ctx.save();
      ctx.shadowColor = bd.color; ctx.shadowBlur = 6;          // legible at phone size
      ctx.fillStyle = bd.color; ctx.fillRect(fbx, cy2 - 5, 5, 10);
      ctx.font = 'bold 10px "Silkscreen", monospace'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillStyle = bd.color; ctx.fillText(bd.name, fbx + 10, cy2);
      ctx.restore();
      ctx.font = 'bold 10px "Silkscreen", monospace'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      const px0 = fbx + 12 + ctx.measureText(bd.name).width + 6;
      for (let i = 0; i < 3; i++) { ctx.fillStyle = i < (p.bladeTier || 0) ? bd.color : 'rgba(255,255,255,0.25)';
        ctx.fillRect(px0 + i * 7, cy2 - 2, 4, 4); }
    }

    this._drawComboCounter(ctx);

    // level medallion (centred, below the bars) + foes/gold on the right.
    // numbers use Press Start 2P (unambiguous digits); icons are drawn as shapes.
    this._drawLevelBadge(ctx);
    const remaining = this.enemies.length + this.spawnQueue.length;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    const gpop = 1 + 0.4 * Math.max(0, this.goldPop || 0);
    ctx.save();
    ctx.translate(this.vw - 16, 26); ctx.scale(gpop, gpop);
    ctx.font = '12px "Silkscreen", sans-serif'; ctx.fillStyle = this.goldPop > 0.4 ? '#fff0b0' : '#f0cf5a';
    ctx.fillText('' + this.gold, 0, 0);
    ctx.restore();
    this._diamond(ctx, this.vw - 24 - ctx.measureText('' + this.gold).width, 26, 5, '#f0cf5a');
    if (this.state !== 'camp') {
      ctx.textAlign = 'right'; ctx.fillStyle = '#d6c8ea';
      ctx.font = '12px "Silkscreen", sans-serif';
      ctx.fillText('' + remaining, this.vw - 16, 48);
      this._skull(ctx, this.vw - 26 - ctx.measureText('' + remaining).width, 47, '#d6c8ea');
    }
  }

  // Kill-streak counter — pops on each kill, shows the live damage bonus, and a
  // draining ring tells you exactly how long the streak has left to live.
  _drawComboCounter(ctx) {
    if (this.state !== 'playing' || this.combo < 3) return;
    const fade = Math.min(1, this.comboT / 0.7);
    const pop = Math.max(0, this.comboPop || 0);
    const scale = 1 + 0.28 * pop;
    const cx = this.vw / 2, cy = 92;
    // hotter colour the longer the streak runs (matches COMBO_TIERS)
    const col = this.combo >= 50 ? '#ff3a6a' : this.combo >= 25 ? '#ff5a3a' : this.combo >= 10 ? '#ffae3a' : '#ffd86a';
    const tierName = this.combo >= 50 ? 'MASSACRE' : this.combo >= 25 ? 'RAMPAGE' : this.combo >= 10 ? 'FRENZY' : 'COMBO';
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(cx, cy); ctx.scale(scale, scale);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '20px "Silkscreen", sans-serif';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText('' + this.combo, 0, 0);
    ctx.fillStyle = col; ctx.fillText('' + this.combo, 0, 0);
    ctx.font = '8px "Silkscreen", sans-serif';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(tierName, 0, 16); ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(tierName, 0, 16);
    // the streak clock: a thin bar draining left as the window closes
    const frac = Math.max(0, Math.min(1, this.comboT / 2.6));
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(-27, 23, 54, 4);
    ctx.fillStyle = col; ctx.fillRect(-26, 24, 52 * frac, 2);
    // the streak is power: surface the live sword-damage bonus
    const bonus = Math.min(30, this.combo);
    if (bonus >= 3) {
      ctx.font = '7px "Silkscreen", sans-serif';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(`+${bonus}% DMG`, 0, 35);
      ctx.fillStyle = col; ctx.fillText(`+${bonus}% DMG`, 0, 35);
    }
    ctx.restore();
  }

  // A "cool" diamond level medallion (no longer collides with the bars).
  _drawLevelBadge(ctx) {
    const cx = this.vw / 2, cy = 40;
    const bossType = (LEVELS[this.level - 1].boss && 'boss') ||
      (LEVELS[this.level - 1].miniboss && 'miniboss');
    const accent = bossType ? '#e5524a' : '#f0cf5a';
    const deep = bossType ? '#3a0e0c' : '#3a2c08';
    const R = 26;
    ctx.save();
    // glow
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, R + 14);
    g.addColorStop(0, bossType ? 'rgba(229,82,74,0.5)' : 'rgba(240,207,90,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(cx - R - 16, cy - R - 16, (R + 16) * 2, (R + 16) * 2);
    // diamond plate
    const dia = (r) => { ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); };
    dia(R); ctx.fillStyle = deep; ctx.fill();
    const lg = ctx.createLinearGradient(cx, cy - R, cx, cy + R);
    lg.addColorStop(0, 'rgba(255,255,255,0.18)'); lg.addColorStop(0.5, 'rgba(0,0,0,0)');
    ctx.fillStyle = lg; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = accent; ctx.stroke();
    dia(R - 5); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.stroke();
    // text — "LEVEL" header + big number (no fraction; fits inside the diamond)
    ctx.textAlign = 'center';
    ctx.fillStyle = accent; ctx.font = '600 9px "Silkscreen", sans-serif'; ctx.textBaseline = 'middle';
    ctx.fillText(bossType ? 'BOSS' : 'LEVEL', cx, cy - 9);
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
    ctx.font = (this.level >= 10 ? '15px' : '20px') + ' "Silkscreen", sans-serif';
    ctx.fillText('' + this.level, cx, cy + 9);
    ctx.restore();
  }

  // small HUD icon shapes (so numbers can use a clean monospace pixel font)
  _diamond(ctx, x, y, r, col) {
    ctx.save(); ctx.fillStyle = col; ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  _skull(ctx, x, y, col) {
    ctx.save(); ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y - 1, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(x - 4, y + 2, 8, 3);
    ctx.fillStyle = '#1a1020';
    ctx.fillRect(x - 3, y - 2, 2, 2); ctx.fillRect(x + 1, y - 2, 2, 2);
    ctx.restore();
  }
}
