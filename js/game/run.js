// Run lifecycle: starting runs, floor setup, win/lose, souls, meta purchases.
// Split from game.js — method bodies are verbatim; attached to Game.prototype in core.js.
import { Sound } from '../audio.js';
import { bladeById } from '../blades.js';
import { CONFIG, LEVELS } from '../config.js';
import { LOCKED_RELICS, RELIC_UNLOCK_COST, metaBonuses, metaCost, runSouls, saveMeta } from '../meta.js';
import { Enemy, FOE_NAMES } from '../monsters.js';
import { Player } from '../player.js';
import { BOSS_NAMES, NAMED_FOES, clearHusk, loadHusk, saveHusk } from './data.js';

export const runMethods = {

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
      this._furyTaught = false; this.furyIdleT = 0;   // re-teach the ultimate each run
      this._lordQueue = [];                            // his grudges don't cross runs
      this._startLevel(1, true);
      if (!wiped) { this.intro = null; this.countdown = 1.5; }  // skip the LEVEL card; let the bloom breathe
    };
    if (wiped) this._slashWipe(begin); else begin();
  },


  // ---- Sanctum (meta-progression) purchases ----
  buyMeta(item) {
    const lvl = this.meta.up[item.id] || 0;
    if (lvl >= item.max || this.meta.souls < metaCost(item, lvl)) return false;
    this.meta.souls -= metaCost(item, lvl);
    this.meta.up[item.id] = lvl + 1;
    this.metaB = metaBonuses(this.meta);
    saveMeta(this.meta);
    return true;
  },

  unlockRelic(id) {
    if (this.meta.relics.includes(id) || this.meta.souls < RELIC_UNLOCK_COST) return false;
    this.meta.souls -= RELIC_UNLOCK_COST;
    this.meta.relics.push(id);
    saveMeta(this.meta);
    return true;
  },


  // Bank the run's Souls — the essence of the fallen, spent in the Sanctum.
  // God-mode runs bank nothing (testing shouldn't fund progression).
  _awardSouls(won) {
    if (this._soulsAwarded) return;            // once per run, however it ends
    this._soulsAwarded = true;
    if (this.godMode) { this.lastRunSouls = 0; return; }
    const cleared = won ? LEVELS.length : Math.max(0, this.level - 1);
    this.lastRunSouls = runSouls(cleared, this.kills, won);
    if (this.lastRunSouls > 0) { this.meta.souls += this.lastRunSouls; saveMeta(this.meta); }
  },


  nextLevel() { this._slashWipe(() => this._startLevel(this.level + 1, false)); },


  // GOD MODE: jump straight to the next floor (full heal) for fast testing.
  godSkip() {
    if (!this.godMode) return;
    if (this.state !== 'playing' && this.state !== 'camp') return;
    const next = Math.min(LEVELS.length, this.level + 1);
    if (next === this.level && this.state === 'playing') return;   // already on the last floor
    this.cutscene = null; this.cutsceneBoss = null; this.plunge = null; this.descentJump = null;
    this._slashWipe(() => this._startLevel(next, true));
  },


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
    this.decals = [];                          // a fresh floor bears no scars yet
    this.bounds = this.worldBounds;                  // restore arena bounds (camp shrinks them)
    this.cam.x = this.player.x - this.vw / 2; this.cam.y = this.player.y - this.vh / 2;
    this.spawnTimer = 0;
    this._buildQueue(level);
    // roll for a named elite "herald" on normal floors (never on boss floors)
    const isBoss = !!(LEVELS[level - 1].boss || LEVELS[level - 1].miniboss);
    // floors 13 / 16 / 18 are AUTHORED: a named herald always holds the floor,
    // so the long back half has faces, not just bigger numbers
    const setPiece = level === 13 || level === 16 || level === 18;
    this._namedDef = (!isBoss && (setPiece || (level >= 3 && Math.random() < 0.55)))
      ? NAMED_FOES[(Math.random() * NAMED_FOES.length) | 0] : null;
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
  },


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
  },


  // Display name for a foe — its elite title if it has one, else its kind.
  _foeName(e) {
    if (!e) return null;
    return (e.named && e.named.name) || FOE_NAMES[e.type] || 'the dark';
  },


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
  },


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
      // clear bonus: front-loaded enough that the FIRST sorcerer visit can buy
      // one cheap ware — window-shopping with an empty purse teaches nothing
      { const b = 8 + Math.round(this.level * 1.5); this.gold += b; this.totalGold += b; }
      this.state = 'clearing';
      this.sweep = { t: 0, dur: 1.5 };
      Sound.play('clear');
      this.pendingReward = { heal: CONFIG.hpRestorePerLevel };
    }
  },


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
  },


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
  },


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
  },
};
