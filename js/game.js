// Core game: state machine, wave spawning, collisions, rendering, HUD.
import { CONFIG, LEVELS, ELITE_AFFIXES } from './config.js';
import { Player, Enemy, inSwingArc } from './entities.js';
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
    this.goldPop = 0;          // scale-pop when gold is picked up
    this.titleT = 0;           // title-scene animation clock
    this.tunnelScroll = 0;     // how far the title corridor has scrolled past
    this.introCut = null;      // iris-to-black blink from the corridor into Level 1
    this.interlude = null;     // Demon Lord taunt (black screen + red typewriter)
    this.interludeFade = null; // black fading out of the taunt into the camp
    this._tapped = false;      // a screen tap (used to advance/skip the taunt)
    this.wipeEl = document.getElementById('wipe');
    canvas.addEventListener('pointerdown', () => { this._tapped = true; });

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
    this._applyBiome(this.level || 1);
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
    else this._bakeBiomeDecor(g, biome, W, H);
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
    // a blood / shadow wash pooling toward the centre
    const wash = g.createRadialGradient(cx, cy, 40, cx, cy, Math.max(W, H) * 0.6);
    wash.addColorStop(0, kind === 'boss' ? 'rgba(64,6,10,0.5)' : 'rgba(26,10,40,0.45)');
    wash.addColorStop(1, 'rgba(0,0,0,0.1)');
    g.fillStyle = wash; g.fillRect(0, 0, W, H);
    // the great ritual circle scorched into the floor (centred on the spawn)
    const r = Math.min(W, H) * 0.29;
    this._bakeRitualCircle(g, cx, cy, r, kind === 'boss' ? '#b81810' : '#6a2ea0');
    // braziers set on the ring like ritual candles — ceremonial, and they light it
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * 2 * i / 6 + Math.PI / 6;
      const bx = Math.round(cx + Math.cos(a) * r), by = Math.round(cy + Math.sin(a) * r);
      this._bakeBrazierPost(g, bx, by);
      this.braziers.push({ x: bx, y: by, lava, torch: kind === 'boss' ? '#ff5a2a' : torch });
    }
    // the head of the room
    if (kind === 'boss') this._bakeThrone(g, cx, 78);
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
    const stone = '#1b1016', stoneHi = '#2c1c28', stoneDk = '#0d070b';
    // backrest with jagged spires
    g.fillStyle = stone; g.fillRect(-30, 0, 60, 84);
    g.fillStyle = stoneHi; g.fillRect(-30, 0, 4, 84);
    g.fillStyle = stoneDk; g.fillRect(26, 0, 4, 84);
    g.fillStyle = stone;
    for (const sx of [-30, -14, 14, 22]) { g.beginPath(); g.moveTo(sx, 0); g.lineTo(sx + 8, -18); g.lineTo(sx + 16, 0); g.closePath(); g.fill(); }
    // smouldering cushion
    g.shadowColor = '#ff3a1e'; g.shadowBlur = 14; g.fillStyle = '#5a0c10'; g.fillRect(-22, 30, 44, 30); g.shadowBlur = 0;
    g.fillStyle = '#7a1216'; g.fillRect(-22, 30, 44, 4);
    // arms & seat
    g.fillStyle = stone; g.fillRect(-38, 44, 12, 40); g.fillRect(26, 44, 12, 40);
    g.fillStyle = stoneDk; g.fillRect(-38, 80, 76, 6);
    // a skull set at the crown
    g.fillStyle = '#d8d0c0'; g.beginPath(); g.arc(0, -6, 8, 0, Math.PI * 2); g.fill();
    g.fillRect(-6, -2, 12, 7);
    g.fillStyle = '#1b1016'; g.fillRect(-4, -8, 3, 4); g.fillRect(2, -8, 3, 4); g.fillRect(-1, -2, 2, 4);
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
      this._bakeBanner(g, W * 0.5, 36, '#5a1414');
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
    // inner shadow so the floor reads as sunken below the walls
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(t, t, W - 2 * t, 8); g.fillRect(t, t, 8, H - 2 * t);
    g.fillRect(t, H - t - 8, W - 2 * t, 8); g.fillRect(W - t - 8, t, 8, H - 2 * t);
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
    for (const s of sh.swords) this._drawPedestal(ctx, s.x, s.y + 46);
    // depth-sort the knight among the swords
    const list = sh.swords.map((s) => ({ s, y: s.y })); list.push({ player: true, y: p.y });
    list.sort((a, b) => a.y - b.y);
    for (const it of list) {
      if (it.player) drawSprite(ctx, p.sprite, pickFrame(p, this.time), p.x, p.y, p.faceLeft, 1);
      else this._drawShrineSword(ctx, it.s);
    }
    ctx.restore();
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
    if (this.state === 'shrine' && !sh.chosen) this.input.draw(ctx);   // joystick feedback
    if (this.flashScreen > 0) { ctx.save(); ctx.globalAlpha = Math.min(0.6, this.flashScreen * 2); ctx.fillStyle = '#fff7e0'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
    this._drawTransition(ctx);
  }

  // The room transforms into the element of whichever blade you stand before.
  _drawShrineAmbiance(ctx, sh) {
    const amb = sh.amb; if (amb <= 0.01 || !sh.ambId) return;
    const W = this.vw, H = this.vh, t = this.time;
    ctx.save();
    if (sh.ambId === 'ember') {                                  // VOLCANO — lava glow, cracks, rising embers
      const g = ctx.createLinearGradient(0, H, 0, 0);
      g.addColorStop(0, `rgba(255,70,15,${0.34 * amb})`); g.addColorStop(0.5, `rgba(170,40,10,${0.12 * amb})`); g.addColorStop(1, 'rgba(50,8,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const x = (i * 137.3) % (W - 60) + 20, y = H * 0.6 + (i * 53) % (H * 0.32), pulse = 0.5 + 0.5 * Math.sin(t * 3 + i);
        ctx.strokeStyle = `rgba(255,${(120 + 90 * pulse) | 0},30,${0.5 * amb})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 16, y + 7); ctx.lineTo(x + 30, y + 1); ctx.lineTo(x + 52, y + 11); ctx.stroke();
      }
      for (let i = 0; i < 36; i++) {
        const ph = (t * 0.5 + i * 0.137) % 1, x = (i * 73.7) % W + Math.sin(t * 2 + i) * 8, y = H - ph * H * 1.05;
        ctx.globalAlpha = amb * (1 - ph) * 0.85; ctx.fillStyle = i % 2 ? '#ffb02a' : '#ff6a1e'; ctx.fillRect(x | 0, y | 0, 2, 2 + (i % 2));
      }
    } else if (sh.ambId === 'frost') {                           // BLIZZARD — cold grade, whiteout, driving snow
      ctx.fillStyle = `rgba(170,215,255,${0.15 * amb})`; ctx.fillRect(0, 0, W, H);
      const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.18, W / 2, H / 2, Math.max(W, H) * 0.7);
      v.addColorStop(0, 'rgba(255,255,255,0)'); v.addColorStop(1, `rgba(225,242,255,${0.42 * amb})`);
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = `rgba(220,245,255,${0.12 * amb})`;
      for (let i = 0; i < 6; i++) { const x = (i * 131) % W; ctx.beginPath(); ctx.ellipse(x, H - 20 - (i % 2) * 14, 30, 8, 0, 0, Math.PI * 2); ctx.fill(); }
      for (let i = 0; i < 72; i++) {
        const sp = (i % 3) + 1, x = ((i * 53.3) + t * 70 * sp) % (W + 40) - 20 + Math.sin(t + i) * 6, y = ((i * 71.1) + t * 130 * sp) % (H + 40) - 20;
        ctx.globalAlpha = amb * 0.85; ctx.fillStyle = '#eaffff'; ctx.fillRect(x | 0, y | 0, sp, sp);
      }
    } else if (sh.ambId === 'storm') {                           // STORM — dark, driving rain, purple lightning
      ctx.fillStyle = `rgba(18,12,42,${0.36 * amb})`; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = `rgba(180,168,235,${0.5 * amb})`; ctx.lineWidth = 1;
      for (let i = 0; i < 64; i++) {
        const x = ((i * 61.7) + t * 130) % (W + 60) - 30, y = ((i * 47.3) + t * 520) % (H + 60) - 30;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 6, y + 16); ctx.stroke();
      }
      if (sh.flash > 0) {
        ctx.fillStyle = `rgba(170,135,255,${0.5 * sh.flash * amb})`; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = `rgba(230,212,255,${sh.flash * amb})`; ctx.lineWidth = 2;
        let bx = sh.boltX || W * 0.5, by = 0; ctx.beginPath(); ctx.moveTo(bx, by);
        for (let s = 0; s < 6; s++) { bx += ((s * 97 + (sh.boltX | 0)) % 80 - 40) * 0.8; by += H / 6; ctx.lineTo(bx, by); }
        ctx.stroke();
      }
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  _drawPedestal(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(x, y + 7, 24, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#322d42'; ctx.fillRect(x - 17, y - 7, 34, 13);
    ctx.fillStyle = '#473f5c'; ctx.fillRect(x - 17, y - 7, 34, 3);
    ctx.fillStyle = '#221d30'; ctx.fillRect(x - 13, y + 6, 26, 7);
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
  // The way down: a black arched gateway smashed INTO the bottom wall, breathing
  // a hot red glow from the depths. Simple, embedded in the wall, and menacing.
  _drawDescentPit(ctx, d, t) {
    const p = this.player;
    const near = p ? Math.max(0, 1 - Math.hypot(p.x - d.x, p.y - d.y) / 150) : 0;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.6);
    const cx = d.x, baseY = d.y + 44, topY = d.y - 58, hw = 52;
    // trace the arched-doorway outline (rect sides + semicircle top), with inset
    const arch = (inset) => {
      const w = hw - inset, by = baseY - inset, acy = (topY + inset) + w;
      ctx.beginPath();
      ctx.moveTo(cx - w, by);
      ctx.lineTo(cx - w, acy);
      ctx.arc(cx, acy, w, Math.PI, Math.PI * 2);
      ctx.lineTo(cx + w, by);
      ctx.closePath();
    };
    ctx.save();
    ctx.lineJoin = 'round';

    // 1) a heavy carved stone arch reinforcing the opening in the wall
    arch(-13);
    ctx.fillStyle = '#231d2e'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 3; ctx.stroke();
    // voussoir block lines + a keystone for that gateway look
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5;
    for (const a of [Math.PI * 1.15, Math.PI * 1.35, Math.PI * 1.5, Math.PI * 1.65, Math.PI * 1.85]) {
      const acy = topY + hw;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * hw, acy + Math.sin(a) * hw);
      ctx.lineTo(cx + Math.cos(a) * (hw + 13), acy + Math.sin(a) * (hw + 13));
      ctx.stroke();
    }

    // 2) the pitch-black mouth
    arch(0); ctx.fillStyle = '#040207'; ctx.fill();

    // 3) the hot glow bleeding up from far below, clipped inside the mouth.
    //    Hotter and brighter the closer you stand.
    ctx.save();
    arch(2); ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    const gA = 0.32 + 0.16 * pulse + 0.42 * near;
    const gy = baseY - 4;
    const rg = ctx.createRadialGradient(cx, gy, 2, cx, gy, 150);
    rg.addColorStop(0, `rgba(255,110,40,${gA})`);
    rg.addColorStop(0.4, `rgba(200,28,14,${gA * 0.7})`);
    rg.addColorStop(1, 'rgba(40,0,0,0)');
    ctx.fillStyle = rg; ctx.fillRect(cx - hw, topY - 4, hw * 2, baseY - topY + 8);
    // embers rising out of the depths
    for (let i = 0; i < 6; i++) {
      const ph = (t * 0.4 + i * 0.17) % 1;
      ctx.globalAlpha = (1 - ph) * (0.45 + 0.55 * near);
      ctx.fillStyle = i % 2 ? '#ff8a2a' : '#ffd36b';
      ctx.fillRect(cx - 24 + ((i * 17 + t * 22) % 48), gy - ph * (baseY - topY + 4), 2, 2);
    }
    ctx.restore();

    // 4) faint top-lit rim on the stone arch
    arch(0);
    ctx.strokeStyle = 'rgba(150,140,165,0.45)'; ctx.lineWidth = 2; ctx.stroke();

    // 5) cold mist spilling out of the gate onto the floor
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 4; i++) {
      const ph = (t * 0.3 + i * 0.25) % 1;
      ctx.globalAlpha = (1 - ph) * 0.14;
      ctx.fillStyle = 'rgba(190,200,215,1)';
      ctx.beginPath();
      ctx.ellipse(cx + Math.sin(t * 0.8 + i * 2) * 26, baseY + ph * 12, 32 - ph * 8, 7, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
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
  // canvas renders the title corridor again — otherwise the last scene (e.g. the
  // victory) shows through behind the menu.
  toTitle() {
    this.state = 'title';
    this.player = null;          // the title branch renders the corridor when there's no player
    this.enemies = []; this.projectiles = []; this.allyProjectiles = []; this.effects = []; this.pickups = [];
    this.interlude = null; this.interludeFade = null; this.introCut = null; this.campToast = null;
    this.intro = null; this.sweep = null; this.transition = null; this.camp = null; this.bossKind = null;
    this.watchers = []; this.campWhisper = null;
    this.ui.showScreen('title');
    Sound.setScene('title');
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
    this.player.x = W / 2; this.player.y = H * 0.82; this.player.faceLeft = false;
    this.bounds = { minX: 40, minY: H * 0.52, maxX: W - 40, maxY: H - 46 };
    this.shrine = { t: 0, chosen: null, drawT: 0, fired: false, near: null, promptFor: undefined,
      amb: 0, ambId: null, flash: 0, lightT: 0,            // scenery-morph state (volcano/blizzard/storm)
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
  }

  _shrineWeather(sh, dt) {
    if (sh.ambId === 'storm' && sh.amb > 0.3) {
      sh.lightT -= dt;
      if (sh.lightT <= 0) { sh.lightT = 0.8 + Math.random() * 2.4; sh.flash = 1; sh.boltX = Math.random() * this.vw; }
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
      this.player.lockedRelics = new Set();   // meta unlocks disabled — full relic pool
      this.shopSlots = 4 + (mb.slots || 0);
      this.kills = 0; this.level = 1; this.gold = mb.startGold || 0; this.totalGold = 0;
      this.runSouls = 0;
      this._campsSinceEvent = 0; this._eventsRecent = [];   // event pacing (see openCamp)
      this.hpDisplay = this.hpGhost = this.player.maxHP;
      this.timeScale = 1; this.dying = 0;
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

  // Meta-progression (the Sanctum / banked Souls) is disabled for now.
  _awardSouls() { this.runSouls = 0; }

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
    // swap to this level's art. Rebuild when the biome changes — and ALWAYS for a
    // boss level (its room is special) or right after one (restore the normal room),
    // even when the biome itself didn't change (e.g. L5 shares the crypt with L4/L6).
    const wasBoss = this.bossKind;
    const bossType = (LEVELS[level - 1].boss && 'boss') || (LEVELS[level - 1].miniboss && 'miniboss');
    if (!this.biome || !this.biome.levels.includes(level) || bossType || wasBoss) this._applyBiome(level);
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
      e.burnT = Math.max(e.burnT, up.has('ember_long') ? 5 : 2.5);
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
      const amp = up.has('storm_amp') ? 1.7 : 1;
      let from = e; const hit = new Set([e]);
      for (let i = 0; i < chains; i++) {
        const t = this.nearestEnemy(from.x, from.y, 165, hit); if (!t) break; hit.add(t);
        this.addEffect({ kind: 'bolt', pts: [{ x: from.x, y: from.y }, { x: t.x, y: t.y }], t: 0, dur: 0.16 });
        let cd = dmg * 0.5 * amp; if (up.has('storm_crit') && Math.random() < 0.22) cd *= 3;
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
        this.hitEnemy(e, tick, 0, 0, 'ability');
      }
    }
  }

  onEnemyKilled(e, source) {
    const p = this.player;
    Sound.play(e.boss ? 'die_tank' : ('die_' + e.type) , { vol: e.elite ? 1.2 : 1 });
    // Fury charges slowly — the ultimate should be a rare payoff (~every few levels)
    p.fury = Math.min(p.furyMax, p.fury + (e.boss ? 16 : 1.4) * p.mods.furyMult);
    if (source === 'sword' && p.mods.lifestealHeal > 0 && !p.mods.noHeal) {
      p.hp = Math.min(p.maxHP, p.hp + p.mods.lifestealHeal);
    }
    this.kills++;
    this.combo++; this.comboT = 2.6; this.comboPop = 1;     // feed the kill streak
    // hit-pause on meaningful kills (skip trash so swarms stay fluid)
    if (e.boss) this.hitStop = Math.max(this.hitStop, 0.14);
    else if (e.type === 'tank' || e.elite) this.hitStop = Math.max(this.hitStop, 0.06);
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

  // bomber / explosive-elite detonation
  _explodeEnemy(e) {
    const cfg = (e.spec && e.spec.explode) || (e.affix && e.affix.explode) || { r: 74, dmg: 24 };
    const lvlDmg = cfg.dmg * (1 + CONFIG.scaling.dmgPerLevel * (this.level - 1));
    this.addEffect({ kind: 'boom', x: e.x, y: e.y, r: cfg.r, t: 0, dur: 0.34 });
    Sound.play('explode');
    this.shake = Math.max(this.shake, 7);
    const p = this.player;
    if (Math.hypot(p.x - e.x, p.y - e.y) < cfg.r + p.r) { if (p.takeHit(lvlDmg)) this.shake = 9; }
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
    const dmg = 120 * p.mods.abilityDmgMult;
    for (const e of this.enemies) {
      const a = Math.atan2(e.y - p.y, e.x - p.x);
      const wasAlive = !e.dead;
      e.takeHit(dmg, Math.cos(a) * 420, Math.sin(a) * 420);
      e.applySlow(1.5);
      this.spawnDamageNumber(e.x, e.y - e.r - 6, Math.round(dmg), 'ultimate');
      if (wasAlive && e.dead) this.onEnemyKilled(e, 'ultimate');
    }
    this.addEffect({ kind: 'ult', x: p.x, y: p.y, t: 0, dur: 0.55, maxR: Math.hypot(this.vw, this.vh) });
    this.addEffect({ kind: 'banner', text: 'FURY UNLEASHED!', t: 0, dur: 1.1 });
    this.flashScreen = 0.22;
    this.shake = Math.max(this.shake, 11);
    this.hitStop = Math.max(this.hitStop, 0.12);
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
    this.shake = Math.max(this.shake, 7);
    Sound.play('bossroar', { vol: 0.55 });
    this.namedToast = { name: def.name.toUpperCase(), sub: 'bears a relic', color: def.color, t: 0, dur: 2.6 };
  }

  // Cinderstep: damage everything standing in the burning dash-trail.
  _burnTrails(sdt) {
    for (const fx of this.effects) {
      if (fx.kind !== 'firetrail') continue;
      fx.dmgT = (fx.dmgT || 0) - sdt;
      if (fx.dmgT <= 0) {
        fx.dmgT = 0.22;
        const dmg = 9 * (1 + 0.5 * (this.level - 1) / 19) * this.player.mods.abilityDmgMult;
        for (const o of this.enemiesInRadius(fx.x, fx.y, fx.r)) this.hitEnemy(o, dmg, 0, 0, 'ability');
      }
    }
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
    Sound.play('swing');
    const style = (player.hero && player.hero.swingStyle) || 'sweep';
    // visual lives LONGER than the hit window so the slash actually reads on screen
    const dur = style === 'stab' ? 0.2 : 0.32;
    // anchor at the torso, not the feet (sprites are feet-anchored) so the slash
    // radiates from the knight's body evenly in every facing direction
    this.effects.push({ kind: 'swing', t: 0, dur, style, blade: player.blade,
      x: player.x, y: player.y - 16, angle: player.facingAngle });
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
        this._hitBurst(ix, iy, p.facingAngle, power);
        this.addEffect({ kind: 'hitring', x: ix, y: iy, r: (e.boss ? 40 : 24) * power, t: 0, dur: 0.18 });
        this.addEffect({ kind: 'slash', x: ix, y: iy, angle: p.facingAngle + Math.PI / 2, len: e.r * 2.0 + 14, t: 0, dur: 0.14 });
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
    if (this.state === 'camp' || this.state === 'shrine' || this.cutscene) return;   // these scenes own the camera
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
    if (this.transition && this.transition.t < this.transition.half) return;
    if (this.plunge && this.plunge.t < this.plunge.half) return;

    if (this.state === 'dying') return this._updateDying(dt);
    if (this.state === 'won') return this._updateWon(dt);
    if (this.state === 'camp') return this._updateCamp(dt);
    if (this.state === 'shrine') return this._updateShrine(dt);
    if (this.state === 'intro') return this._updateIntro(dt);
    if (this.state === 'interlude') return this._updateInterlude(dt);
    if (this.state !== 'playing') return;

    if (this.cutscene) return this._updateCutscene(dt);   // scripted boss entrance

    // brief hit-pause freezes the simulation for weight
    if (this.hitStop > 0) { this.hitStop -= dt; return; }

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
    if (p.mods.dashFireTrail) this._emitDashFire(p);
    this._burnTrails(sdt);                      // dash + Cinderstep + ember-swing flames

    for (const e of this.enemies) e.update(sdt, this);
    this._updateStatuses(sdt);                  // blade burn DoT / permafrost
    this._emitAuras(sdt);
    this._updateProjAndFx(sdt);
    this._updatePickups(sdt);
    this._separate();

    // collisions: enemy contact
    for (const e of this.enemies) {
      const dx = p.x - e.x, dy = p.y - e.y;
      if (Math.hypot(dx, dy) < p.r + e.r) {
        if (p.takeHit(e.cdmg || e.damage)) {
          this.shake = Math.max(this.shake, 6);
          if (e.elite === 'icy') p.slowT = 1.3;                 // Frostbound chills you
          if (e.type === 'bomber') { e.dead = true; this._explodeEnemy(e); } // detonates on contact
        }
      }
    }
    // collisions: projectiles vs player (Mirror Aegis makes these hit twice as hard)
    for (const pr of this.projectiles) {
      if (pr.dead) continue;
      const dx = p.x - pr.x, dy = p.y - pr.y;
      if (Math.hypot(dx, dy) < p.r + pr.r) { if (p.takeHit(pr.dmg * (p.mods.projDamageMult || 1))) this.shake = 5; pr.dead = true; }
    }

    this.enemies = this.enemies.filter((e) => !e.dead);
    this.projectiles = this.projectiles.filter((pr) => !pr.dead);

    // outcomes
    if (p.dead) return this._lose();
    if (this.spawnQueue.length === 0 && this.enemies.length === 0) {
      if (this._namedDef) { this._namedTimer = 0; this._maybeSpawnNamed(0); }  // don't end before the herald arrives
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
      if (this._hpWas != null && hp < this._hpWas - 0.01) { this.hpHitT = 0.32; Sound.play('hurt'); }
      this._hpWas = hp;
      this.hpDisplay += (hp - this.hpDisplay) * Math.min(1, dt * 14);
      if (this.hpGhost < this.hpDisplay) this.hpGhost = this.hpDisplay;
      else this.hpGhost += (this.hpDisplay - this.hpGhost) * Math.min(1, dt * 4);
    }
    // HUD juice timers
    if (this.hpHitT > 0) this.hpHitT -= dt;
    if (this.goldPop > 0) this.goldPop -= dt * 4;
    if (this.comboPop > 0) this.comboPop -= dt * 4;
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
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
      if (pl.t < pl.half) {                       // falling: a long, slow slide into the dark
        const f = pl.t / pl.half;
        this.camDrop = 940 * (f * f * 0.72 + f * 0.28);   // initial velocity so frame 1 already moves
        this.shake = Math.max(this.shake, 1.5 + 3.5 * f);  // a low rumble, not a violent quake
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
        const taunt = DEMON_LINES[this.level];    // the Demon Lord speaks on odd floors
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
      this.ui.gameOver(this.level);
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
      this.ui.victory({ kills: this.kills, gold: this.totalGold, relics: this.player.relics.size });
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
    Sound.setScene('gameover'); Sound.play('lose');
  }

  _win() {
    if (this.level >= LEVELS.length) {
      // epic celebration sequence, then the victory screen
      this.state = 'won';
      this.wonT = 0;
      this.shake = Math.max(this.shake, 10);
      this.flashScreen = 0.3;
      this._spawnEmberBurst();
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
      const d = this.camp.door, erx = 54, ery = 52, ecx = d.x, ecy = d.y - 6;
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
    // seed t slightly so the very first rendered frame already shows the fall
    // (darkness welling + camera dropping) rather than a static beat.
    // A long, deliberate fall — the red abyss should linger and unsettle.
    this.plunge = { t: 0.05, dur: 2.85, half: 1.6, fired: false, whisper,
      mid: () => this._startLevel(this.level + 1, false) };
    this.shake = Math.max(this.shake, 4);
    Sound.play('plunge');
  }

  // ---------- render ----------
  _frame(t) {
    const dt = Math.min(0.05, (t - this._last) / 1000);
    this._last = t;
    this._update(dt);
    this._render();
    requestAnimationFrame((t2) => this._frame(t2));
  }

  _render() {
    const ctx = this.ctx;
    const title = this.state === 'title';
    const camx = this.cam.x, camy = this.cam.y + (this.camDrop || 0);

    // Cold open: the title & intro are a screen-space torch-lit corridor, drawn
    // outside the normal world pipeline so the cut into Level 1 is seamless.
    if (title || this.state === 'intro') {
      ctx.clearRect(0, 0, this.vw, this.vh);
      this._drawTunnelScene(ctx);
      this._drawIntroCut(ctx);        // the dark blinking shut as he steps through
      this._drawTransition(ctx);
      return;
    }

    if (this.state === 'shrine') { this._renderShrine(ctx); return; }

    ctx.clearRect(0, 0, this.vw, this.vh);
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
    for (const fx of this.effects) if (fx.kind === 'firetrail') this._drawFireTrail(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'puff') this._drawPuff(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'death') this._drawDeathFx(ctx, fx);

    if (this.state === 'camp') this._drawCampFloor(ctx);   // door + table (on the floor)

    // depth-sort enemies + hero (+ sorcerer) by feet-y
    const drawList = [...this.enemies];
    if (!title && this.player) drawList.push(this.player);
    if (this.state === 'camp') drawList.push({ sorcerer: true, x: this.camp.sorcerer.x, y: this.camp.sorcerer.y });
    drawList.sort((a, b) => a.y - b.y);
    for (const ent of drawList) {
      if (ent === this.player) this._drawPlayer(ctx);
      else if (ent.sorcerer) this._drawSorcerer(ctx, ent);
      else this._drawEnemy(ctx, ent);
    }
    if (this.state === 'camp') this._drawCampLabels(ctx);

    for (const pr of this.projectiles) this._drawProjectile(ctx, pr);
    for (const fb of this.allyProjectiles) this._drawFireball(ctx, fb);
    for (const fx of this.effects) this._drawAbilityFx(ctx, fx);
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

    // full-screen flash (ultimate)
    if (this.flashScreen > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.6, this.flashScreen * 2);
      ctx.fillStyle = '#fff7d6';
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
    if (pl.t < pl.half) {                          // FALLING
      const f = pl.t / pl.half;
      // darkness welling up from the bottom of the screen
      const grd = ctx.createLinearGradient(0, H, 0, H * (1 - f * 1.15) - 20);
      grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
      // hold off full black until the very end so the red has room to breathe
      ctx.fillStyle = `rgba(0,0,0,${Math.max(0, (f - 0.82) / 0.18)})`; ctx.fillRect(0, 0, W, H);
      // red abyss glow swelling from below — comes up early (pow<1) and lingers
      const ra = 0.62 * Math.pow(f, 0.7);
      const rg = ctx.createRadialGradient(W / 2, H + 30, 8, W / 2, H + 30, H);
      rg.addColorStop(0, `rgba(210,34,16,${ra})`); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
      // slow, languid downward streaks (not action speed-lines)
      ctx.globalAlpha = 0.4 * f; ctx.strokeStyle = 'rgba(190,200,220,0.6)'; ctx.lineWidth = 2;
      for (let i = 0; i < 16; i++) {
        const x = (i * 97.3) % W, len = 36 + (i * 53) % 90;
        const y = ((i * 131 + pl.t * 1050) % (H + 140)) - 70;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + len); ctx.stroke();
      }
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
        const rg = ctx.createRadialGradient(W / 2, H * 0.5, 10, W / 2, H * 0.5, Math.max(W, H) * 0.7);
        rg.addColorStop(0, `rgba(150,18,10,${(1 - r / 0.6) * 0.5})`); rg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 1; ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
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
      else { g1.addColorStop(0, '#fff2c0'); g1.addColorStop(0.55, '#ff9a2a'); g1.addColorStop(1, 'rgba(200,80,0,0)'); }
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
    if (this.player) glow(this.player.x, this.player.y - 14, 64, '#cfe6ff', 0.16);
    for (const pr of this.projectiles) glow(pr.x, pr.y, 38, pr.boss ? '#ff7a2a' : '#b06bff', 0.55);
    for (const fb of this.allyProjectiles) glow(fb.x, fb.y, 42, '#ff8a3a', 0.65);
    ctx.restore();
  }

  // Dungeon darkness: overlay shadow over everything, then cut light "pools" out
  // of it at the torches, the hero and any spell flashes. This is the vibe.
  _drawDarkness(ctx) {
    const b = this.biome; if (!b || !b.dark) return;
    if (this.state === 'won') return;      // the victory is bathed in golden light
    if (this.flashScreen > 0.02) return;   // the ultimate floods the room with light
    const darkLevel = this.state === 'camp' ? Math.min(b.dark, 0.34) : b.dark; // safe room is brighter
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
    // cached light "holes": one gradient per rounded radius, reused via translate
    const hole = (wx, wy, r) => {
      const sx = (wx - this.cam.x) * S, sy = (wy - this.cam.y) * S, rr = Math.round(r * S);
      if (sx < -rr || sx > sw + rr || sy < -rr || sy > sh + rr) return;
      let grd = cache.get(rr);
      if (!grd) {
        grd = g.createRadialGradient(0, 0, rr * 0.22, 0, 0, rr);
        grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
        cache.set(rr, grd);
      }
      g.fillStyle = grd;
      g.translate(sx, sy); g.beginPath(); g.arc(0, 0, rr, 0, Math.PI * 2); g.fill(); g.translate(-sx, -sy);
    };
    for (const bz of this._torches) hole(bz.x, bz.y - 6, 168 + 9 * Math.sin(this.titleT * 17 + bz.x));
    const hx = this.player ? this.player.x : this.world.w / 2;
    const hy = this.player ? this.player.y - 8 : this.world.h / 2 + this.vh * 0.16;
    hole(hx, hy, 175);           // the hero carries the light
    for (const fb of this.allyProjectiles) hole(fb.x, fb.y, 90);
    for (const pr of this.projectiles) hole(pr.x, pr.y, 52);
    for (const pk of this.pickups) hole(pk.x, pk.y, 30);   // loot glints in the dark
    if (this.state === 'camp' && this.camp) {              // door + sorcerer + shrine light the room
      hole(this.camp.door.x, this.camp.door.y - 6, 120);
      hole(this.camp.sorcerer.x, this.camp.sorcerer.y - 12, 110);
      if (this.camp.shrine && !this.camp.eventUsed) hole(this.camp.shrine.x, this.camp.shrine.y - 8, 110);
    }
    for (const fx of this.effects) { if (fx.kind === 'boom' || fx.kind === 'ult') hole(fx.x, fx.y, Math.round((fx.r || 80) * 1.1)); }
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
    } else if (e.burnT > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) { const ph = (this.time * 4 + i * 0.45 + e.x * 0.1) % 1;
        ctx.globalAlpha = (1 - ph) * 0.7; ctx.fillStyle = i % 2 ? '#ffb02a' : '#ff5a1e';
        ctx.fillRect(e.x - e.r * 0.6 + i * e.r * 0.4 + Math.sin(this.time * 9 + i) * 2, e.y - e.r - ph * 16, 2, 3); }
      ctx.restore(); ctx.globalAlpha = 1;
    }
    const tint = e.state === 'enrage' ? { color: '#ffffff', a: 0.45 + 0.35 * Math.sin(this.time * 30) }
      : e.flash > 0 ? { color: '#ffffff', a: 0.7 }
      : e.frozenT > 0 ? { color: '#9fd8ff', a: 0.5 }
      : e.burnT > 0 ? { color: '#ff7a2a', a: 0.3 + 0.12 * Math.sin(this.time * 18) }
      : (e.state === 'windup' || e.state === 'special' ? { color: '#ff4040', a: 0.5 }
      : (e.elite ? { color: e.affix.color, a: 0.16 } : null));
    // a gentle breathing bob when idle so foes never look frozen
    const bob = (!e.boss && !e.moving) ? Math.sin(this.time * 2.6 + e.x * 0.07) : 0;
    drawSprite(ctx, e.sprite, frame, e.x, e.y - bob, e.faceLeft, 1, tint);
    // small floating HP bar for tanks & elites (bosses use the big top bar)
    if (!e.boss && (e.type === 'tank' || e.elite)) {
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

  _drawSwing(ctx, fx) {
    const p = this.player;
    const style = fx.style || (p.hero && p.hero.swingStyle) || 'sweep';
    const reach = p.reach;
    const arc = p.arcDeg * Math.PI / 180;
    const a = fx.angle, a0 = a - arc / 2;
    const life = fx.t / fx.dur;                          // 0..1 over the whole visual
    const sweep = Math.min(1, fx.t / (fx.dur * 0.42));   // leading edge wipes in fast
    const fade = life < 0.4 ? 1 : Math.max(0, 1 - (life - 0.4) / 0.6);
    ctx.save();
    ctx.translate(fx.x, fx.y);                           // slash stays where it was swung
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';            // additive glow over the dark dungeon

    if (style === 'stab') {
      // Rogue: a pair of fast neon-green dagger streaks + a thin crescent flick
      for (const off of [-0.16, 0.16]) {
        const aa = a + off;
        const grd = ctx.createLinearGradient(Math.cos(aa) * reach * 0.22, Math.sin(aa) * reach * 0.22,
          Math.cos(aa) * reach * 0.92, Math.sin(aa) * reach * 0.92);
        grd.addColorStop(0, 'rgba(120,255,190,0)');
        grd.addColorStop(0.6, `rgba(150,255,200,${0.85 * fade})`);
        grd.addColorStop(1, `rgba(255,255,255,${0.95 * fade})`);
        ctx.strokeStyle = grd; ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.moveTo(Math.cos(aa) * reach * 0.22, Math.sin(aa) * reach * 0.22);
        ctx.lineTo(Math.cos(aa) * reach * 0.92, Math.sin(aa) * reach * 0.92);
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(180,255,220,${0.5 * fade})`;
      ctx.fill(this._crescentPath(a - 0.3, 0.6, reach * 0.8, reach * 0.13, 0, sweep));

    } else {
      // Knight (sweep) & Paladin (slam): a sharp, fast crescent slash. The bright
      // edge runs ALONG the curve (the blade's edge catching light) — no radial
      // shaft, so it reads as a sword cut, not a spear thrust.
      const slam = style === 'slam';
      const rMid = reach * 0.68;                            // sits inside the hitbox, not beyond it
      // the Living Blade recolours the whole cut to its element
      const ELSW = { ember: ['150,50,10', '255,140,40'], frost: ['50,120,190', '160,225,255'], storm: ['95,60,190', '190,160,255'] };
      const elc = fx.blade && ELSW[fx.blade];
      const bloom = elc ? elc[0] : (slam ? '150,90,25' : '60,150,255');
      const body  = elc ? elc[1] : (slam ? '255,190,90' : '150,220,255');
      const outer = reach * (slam ? 0.46 : 0.4);           // crescent thickness
      // helper: trace the convex outer rim of the crescent from u=lo..hi
      const rim = (lo, hi) => {
        ctx.beginPath();
        const segs = 22;
        for (let i = 0; i <= segs; i++) {
          const u = lo + (hi - lo) * (i / segs), ang = a0 + u * arc;
          const r = rMid + Math.sin(u * Math.PI) * outer * 0.5;
          const x = Math.cos(ang) * r, y = Math.sin(ang) * r;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
      };
      // 1) origin flash — a quick radial pop where the swing begins
      if (life < 0.26) {
        const f = (1 - life / 0.26) * fade;
        const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, reach * 0.4);
        rg.addColorStop(0, `rgba(${body},${0.5 * f})`);
        rg.addColorStop(1, `rgba(${body},0)`);
        ctx.fillStyle = rg;
        ctx.beginPath(); ctx.arc(0, 0, reach * 0.4, 0, Math.PI * 2); ctx.fill();
      }
      // 2) soft bloom + 3) colored body + 4) white-hot core (thinner = sharper)
      ctx.fillStyle = `rgba(${bloom},${0.20 * fade})`;
      ctx.fill(this._crescentPath(a0, arc, rMid, outer, 0, sweep));
      ctx.fillStyle = `rgba(${body},${0.42 * fade})`;
      ctx.fill(this._crescentPath(a0, arc, rMid, outer * 0.5, 0, sweep));
      ctx.fillStyle = `rgba(255,255,255,${0.7 * fade})`;
      ctx.fill(this._crescentPath(a0, arc, rMid, outer * 0.22, 0, sweep));
      // 5) bright blade-edge glint running ALONG the outer rim (tangential)
      ctx.strokeStyle = `rgba(255,255,255,${0.92 * fade})`; ctx.lineWidth = slam ? 3.5 : 2.5;
      rim(0, sweep); ctx.stroke();
      // 6) a short hot glint + speed-streaks flicking off the leading tip
      const tu = sweep, ta = a0 + tu * arc, tr = rMid + Math.sin(tu * Math.PI) * outer * 0.5;
      const tx = Math.cos(ta) * tr, ty = Math.sin(ta) * tr, tang = ta + Math.PI / 2;
      ctx.strokeStyle = `rgba(255,255,255,${0.95 * fade})`; ctx.lineWidth = slam ? 4 : 3;
      ctx.beginPath();
      ctx.moveTo(tx - Math.cos(tang) * reach * 0.05, ty - Math.sin(tang) * reach * 0.05);
      ctx.lineTo(tx + Math.cos(tang) * reach * 0.11, ty + Math.sin(tang) * reach * 0.11);
      ctx.stroke();
      if (sweep < 1) {                       // thin speed lines trailing the edge
        ctx.lineWidth = 1.5;
        for (const k of [0.12, 0.24]) {
          const u = Math.max(0, sweep - k), aa = a0 + u * arc;
          const rr = rMid + Math.sin(u * Math.PI) * outer * 0.5;
          ctx.strokeStyle = `rgba(${body},${0.5 * (1 - k * 3) * fade})`;
          ctx.beginPath();
          ctx.moveTo(Math.cos(aa) * (rr - 6), Math.sin(aa) * (rr - 6));
          ctx.lineTo(Math.cos(aa) * (rr + 8), Math.sin(aa) * (rr + 8));
          ctx.stroke();
        }
      }
      if (slam && sweep >= 1) {              // crushing ground-flare at full extension
        ctx.strokeStyle = `rgba(255,150,40,${0.7 * fade})`; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(0, 0, reach * 1.05, a0 - 0.1, a + arc / 2 + 0.1); ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
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
    const fy = 20 + bh + 5, fh = 9, fbx = 18;
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
      const bd = bladeById(p.blade), cy2 = fy + fh + 11;
      ctx.fillStyle = bd.color; ctx.fillRect(fbx, cy2 - 5, 5, 9);
      ctx.font = '9px "Silkscreen", monospace'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillStyle = bd.color; ctx.fillText(bd.name, fbx + 10, cy2);
      const px0 = fbx + 12 + ctx.measureText(bd.name).width + 6;
      for (let i = 0; i < 3; i++) { ctx.fillStyle = i < (p.bladeTier || 0) ? bd.color : 'rgba(255,255,255,0.2)';
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

  // Kill-streak counter — pops on each kill, drifts up and fades when it lapses.
  _drawComboCounter(ctx) {
    if (this.state !== 'playing' || this.combo < 3) return;
    const fade = Math.min(1, this.comboT / 0.7);
    const pop = Math.max(0, this.comboPop || 0);
    const scale = 1 + 0.28 * pop;
    const cx = this.vw / 2, cy = 92;
    // hotter colour the longer the streak runs
    const col = this.combo >= 25 ? '#ff5a3a' : this.combo >= 12 ? '#ffae3a' : '#ffd86a';
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
    ctx.strokeText('COMBO', 0, 16); ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('COMBO', 0, 16);
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
