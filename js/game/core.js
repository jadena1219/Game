// Core game: the Game class shell — state fields (constructor), the frame
// loop, the update dispatcher, camera, and small shared helpers. All other
// systems live in sibling modules and are attached to the prototype below.
// Split from game.js — method bodies are verbatim.
import { Sound } from '../audio.js';
import { CONFIG } from '../config.js';
import { Input } from '../input.js';
import { loadMeta, metaBonuses } from '../meta.js';
import { COMBO_TIERS } from './data.js';
import { worldMethods } from './world.js';
import { runMethods } from './run.js';
import { spawnMethods } from './spawn.js';
import { combatMethods } from './combat.js';
import { fxMethods } from './fx.js';
import { renderMethods } from './render.js';
import { renderFxMethods } from './render-fx.js';
import { renderActorsMethods } from './render-actors.js';
import { renderUiMethods } from './render-ui.js';
import { dialogueMethods } from './dialogue.js';
import { cinematicsMethods } from './cinematics.js';
import { titleMethods } from './scenes/title.js';
import { prologueMethods } from './scenes/prologue.js';
import { shrineMethods } from './scenes/shrine.js';
import { campMethods } from './scenes/camp.js';

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
      // where, in LOGICAL canvas coords (the title pit is tappable directly);
      // the action scale means client px and game px differ on big screens
      const r = canvas.getBoundingClientRect(), zs = this.viewScale || 1;
      this._tapXY = [(e.clientX - r.left) / zs, (e.clientY - r.top) / zs];
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
    const ww = window.innerWidth, wh = window.innerHeight;
    // ACTION SCALE: big viewports render the whole stage zoomed, so the knight
    // reads as a hero instead of a speck in a checkerboard void. The LOGICAL
    // view shrinks and the transform scales it back up — phones stay at 1:1.
    const zs = this.viewScale = Math.max(1, Math.min(1.6, Math.sqrt(ww * wh) / 720));
    this.vw = Math.round(ww / zs);
    this.vh = Math.round(wh / zs);
    this.canvas.width = Math.floor(ww * dpr);
    this.canvas.height = Math.floor(wh * dpr);
    this.ctx.setTransform(dpr * zs, 0, 0, dpr * zs, 0, 0);
    this.input.viewScale = zs;
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


  // ---------- render ----------
  _frame(t) {
    const dt = Math.min(0.05, (t - this._last) / 1000);
    this._last = t;
    this.dt = dt;                 // exposed for frame-rate-independent UI animation
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


  // ---------- update ----------
  _update(dt) {
    this.time += dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 24);
    if (this.flashScreen > 0) this.flashScreen -= dt;
    if (this.bossPhase) { this.bossPhase.t += dt; if (this.bossPhase.t >= this.bossPhase.dur) this.bossPhase = null; }

    this._updateCamera(dt);
    this._updateAmbient(dt);     // embers, transition, intro, sweep, hp bar — run in every state
    this._updateBanners(dt);     // centre-screen announcements, one at a time
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
    if (this.furyReady && !wasFury) {
      Sound.play('furyready');
      // the FIRST full bar of a run is a moment: time dips, the game says so —
      // nobody should finish a run never knowing they had an ultimate
      if (!this._furyTaught) {
        this._furyTaught = true;
        this.slowmo = Math.max(this.slowmo || 0, 0.55);
        this.addEffect({ kind: 'banner', text: 'FURY READY — UNLEASH IT!', t: 0, dur: 1.5 });
      }
    }
    // a full bar left to gather dust nags for attention (drives the button pulse)
    this.furyIdleT = this.furyReady ? (this.furyIdleT || 0) + sdt : 0;
    this._updateFuryButton();
    if (this.furyReady && this.input.furyTapped) {
      this.input.furyTapped = false; p.fury = 0; this.furyReady = false; this._ultimate();
    } else if (this.input.furyTapped) { this.input.furyTapped = false; }
    this._dashTrail(p, sdt);
    // footstep dust: walking kicks tiny scuffs off the dry stone (water makes
    // its own wakes); ravenous sprinters kick harder — you SEE the surge
    this._stepT = (this._stepT || 0) - sdt;
    if (this._stepT <= 0) {
      this._stepT = 0.21;
      const dustCol = this.biome && this.biome.id === 'keep' ? '#3a2c28' : '#322c40';
      if (p.moving && p.dashTimer <= 0 && !(this._puddleAt && this._puddleAt(p.x, p.y))) {
        this._puff(p.x - (p.faceLeft ? -5 : 5), p.y + 2, dustCol, 1, 3, { r0: 2, r1: 6.5, dur: 0.32 });
      }
      for (let i = 0; i < Math.min(6, this.enemies.length); i++) {
        const e = this.enemies[i];
        if (e.ravenous && e.moving && !e.dead && Math.random() < 0.6 && !(this._puddleAt && this._puddleAt(e.x, e.y))) {
          this._puff(e.x, e.y + 2, dustCol, 1, 4, { r0: 2, r1: 7, dur: 0.3 });
        }
      }
    }
    this._spawn(sdt);
    // the last stragglers turn RAVENOUS — they smell you and surge, so the end
    // of a floor never decays into hide-and-seek with two slow skeletons
    if (!this.spawnQueue.length && this.enemies.length > 0 && this.enemies.length <= 3) {
      for (const e of this.enemies) {
        if (e.ravenous || e.boss || e.emergeT > 0) continue;
        e.ravenous = true;
        e.speed *= 1.5;
        this.addEffect({ kind: 'spawnmark', x: e.x, y: e.y, r: e.r + 8, t: 0, dur: 0.45, color: '#ff4040' });
      }
    }
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
    this._updateWater(sdt);                     // crypt pools: drips + wakes
    this._updateUltFx(sdt);                     // lava field / thunderstorm strikes
    this._emitAuras(sdt);
    this._updateProjAndFx(sdt);
    this._updatePickups(sdt);
    this._separate();

    // collisions: enemy contact (threading one mid-dash = a PERFECT dodge)
    for (const e of this.enemies) {
      if (e.dead) continue;                      // a foe slain earlier this frame can't still bodyslam you
      if (e.emergeT > 0) continue;               // still rising — no teeth yet
      const dx = p.x - e.x, dy = p.y - e.y;
      if (Math.hypot(dx, dy) < p.r + e.r) {
        if (p.parryT > 0 && !p.dead) { this._perfectDodge(e.x, e.y - e.r * 0.4); continue; }
        if (p.takeHit(e.cdmg || e.damage, this._foeName(e))) {
          this.shake = Math.max(this.shake, 6);
          this.hitStop = Math.max(this.hitStop, 0.07);   // YOUR pain has weight too
          this.flashScreen = Math.max(this.flashScreen, 0.07); this.flashCol = '#7a0e12';
          if (e.elite === 'icy' || e.husk === 'frost') p.slowT = 1.3;   // Frostbound chills you
          // bomber detonates on contact — route through the normal kill so it
          // still drops loot / feeds fury+combo (onEnemyKilled fires the blast)
          if (e.type === 'bomber') { e.dead = true; this.onEnemyKilled(e, 'contact'); }
        }
      }
    }
    // collisions: projectiles vs player (Mirror Aegis makes these hit twice as hard)
    for (const pr of this.projectiles) {
      if (pr.dead) continue;
      const dx = p.x - pr.x, dy = p.y - pr.y;
      if (Math.hypot(dx, dy) < p.r + pr.r) {
        if (p.parryT > 0 && !p.dead) { pr.dead = true; this._spark(pr.x, pr.y); this._perfectDodge(pr.x, pr.y); continue; }
        if (p.takeHit(pr.dmg * (p.mods.projDamageMult || 1), pr.srcName || 'a dark bolt')) {
          this.shake = 5;
          this.hitStop = Math.max(this.hitStop, 0.06);
          this.flashScreen = Math.max(this.flashScreen, 0.06); this.flashCol = '#7a0e12';
        }
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
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
      const reach = r + e.r;                       // true circle-overlap test
      if (d <= reach * reach) out.push(e);
    }
    return out;
  }


  // ---- Phase 3: atmosphere draw helpers ----
  _inView(x, y, pad = 140) {
    return x > this.cam.x - pad && x < this.cam.x + this.vw + pad &&
           y > this.cam.y - pad && y < this.cam.y + this.vh + pad;
  }


  // ---------- dread: the deeper you go, the more the dark watches back ----------
  // 0 at the surface, ramping to 1 in the depths. Early floors stay clean.
  _depth() { return Math.min(1, Math.max(0, (this.level - 1) / 17)); }


  _rgba(hex, a) {
    const h = hex.replace('#', '');
    return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
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


  // Slash-wipe transition: cover the screen, run `mid` at the midpoint, then reveal.
  _slashWipe(mid) {
    this.transition = { t: 0, dur: 0.74, half: 0.37, mid, fired: false };
  }
}

Object.assign(
  Game.prototype,
  worldMethods,
  runMethods,
  spawnMethods,
  combatMethods,
  fxMethods,
  renderMethods,
  renderFxMethods,
  renderActorsMethods,
  renderUiMethods,
  dialogueMethods,
  cinematicsMethods,
  titleMethods,
  prologueMethods,
  shrineMethods,
  campMethods,
);
