// Entry point: load sprites, wire up the menus, run the game.
import { loadAssets } from './assets.js';
import { Game } from './game.js';
import { CONFIG, LEVELS } from './config.js';
import { drawSprite } from './sprite.js';
import { META, metaCost, LOCKED_RELICS, RELIC_UNLOCK_COST } from './meta.js';
import { RELICS } from './abilities.js';
import { Sound } from './audio.js';

const screens = {
  title: document.getElementById('title-screen'),
  'hero-select': document.getElementById('hero-select'),
  sanctum: document.getElementById('sanctum'),
  event: document.getElementById('event-modal'),
  shop: document.getElementById('shop-modal'),
  gameover: document.getElementById('game-over'),
  victory: document.getElementById('victory'),
};

const HERO_IDS = ['knight', 'rogue', 'paladin'];

let game = null;
let godMode = (() => { try { return localStorage.getItem('kls_god') === '1'; } catch (e) { return false; } })();

// A pixel-art speaker, generated pixel-by-pixel (no asset file) in the game's
// parchment/gold palette. `muted` swaps the gold sound-waves for a red slash.
function drawMuteIcon(cv, muted) {
  const W = 16, H = 16, s = (cv.width / W) | 0;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, cv.width, cv.height);
  const body = Array.from({ length: H }, () => new Array(W).fill(0));
  const put = (x, y) => { if (x >= 0 && x < W && y >= 0 && y < H) body[y][x] = 1; };
  for (let c = 2; c <= 4; c++) for (let r = 6; r <= 9; r++) put(c, r);          // magnet box
  for (let c = 5; c <= 8; c++) for (let r = 6 - (c - 5); r <= 9 + (c - 5); r++) put(c, r);  // flaring cone
  const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x * s, y * s, s, s); };
  // dark outline: every empty cell touching the body
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (body[y][x]) continue;
    if (body[y - 1]?.[x] || body[y + 1]?.[x] || body[y]?.[x - 1] || body[y]?.[x + 1]) px(x, y, '#14101a');
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (body[y][x]) px(x, y, '#e9dcc3');
  if (!muted) {
    for (const [x, y] of [[10, 7], [10, 8], [11, 6], [11, 9], [12, 5], [12, 10], [13, 4], [13, 11]]) px(x, y, '#f4c95d');
  } else {
    for (let i = 0; i < 9; i++) { px(7 + i, 13 - i, '#d4453a'); px(7 + i, 12 - i, '#7a1410'); }   // bold slash
  }
}

// wrap digit runs so numbers render in the clear Press Start 2P font
const numWrap = (s) => String(s).replace(/(\d+)/g, '<span class="num">$1</span>');

const ui = {
  showScreen(name) {
    if (name !== 'hero-select') this._heroAnim = false;   // stop preview loop on leave
    screens.title.classList.remove('swipe-out');          // reset the cold-open animation
    for (const [k, el] of Object.entries(screens)) {
      el.classList.toggle('hidden', k !== name);
    }
    // the God-mode floor-skip button only shows during actual gameplay
    const gs = document.getElementById('god-skip');
    if (gs) gs.classList.toggle('hidden', !(godMode && name === null));
  },

  // The cold open: lift the title overlay away, revealing the live corridor
  // already scrolling on the canvas beneath it.
  swipeTitleAway() {
    const el = screens.title;
    el.classList.add('swipe-out');
    setTimeout(() => { el.classList.add('hidden'); el.classList.remove('swipe-out'); }, 620);
  },

  // Hero select — choose your champion (shown after the title 'Begin').
  showHeroSelect() {
    const wrap = document.getElementById('hero-cards');
    wrap.innerHTML = '';
    const previews = [];
    HERO_IDS.forEach((id, i) => {
      const h = CONFIG.heroes[id];
      const card = document.createElement('button');
      card.className = 'hero-card';
      card.style.setProperty('--accent', h.accent);
      card.style.animationDelay = (i * 0.09) + 's';
      const pip = (n, on) => Array.from({ length: 5 }, (_, k) => `<i class="${k < n ? 'on' : ''}"></i>`).join('');
      card.innerHTML =
        `<div class="hero-stage"><canvas width="96" height="120"></canvas></div>` +
        `<div class="hero-info">` +
          `<div class="hero-name">${h.name}</div>` +
          `<div class="hero-title">${h.title} &middot; ${h.weapon}</div>` +
          `<div class="hero-blurb">${h.blurb}</div>` +
          `<div class="hero-stats">` +
            `<div class="hstat"><span>HEALTH</span><div class="pips">${pip(h.pips.hp)}</div></div>` +
            `<div class="hstat"><span>SPEED</span><div class="pips">${pip(h.pips.spd)}</div></div>` +
            `<div class="hstat"><span>POWER</span><div class="pips">${pip(h.pips.pow)}</div></div>` +
          `</div>` +
        `</div>`;
      const cv = card.querySelector('canvas');
      previews.push({ ctx: cv.getContext('2d'), sprite: h.sprite });
      card.addEventListener('click', () => { this._heroAnim = false; game.start(id); });
      wrap.appendChild(card);
    });
    this.showScreen('hero-select');
    // animated idle/walk loop for the previews
    this._heroAnim = true;
    const t0 = performance.now();
    const loop = () => {
      if (!this._heroAnim) return;
      const t = (performance.now() - t0) / 1000;
      for (const p of previews) {
        p.ctx.clearRect(0, 0, 96, 120);
        const frame = (t % 0.9) < 0.45 ? 'walkA' : 'walkB';
        const bob = Math.sin(t * 4) * 2;
        drawSprite(p.ctx, p.sprite, frame, 48, 110 + bob, false, 1.55);
      }
      requestAnimationFrame(loop);
    };
    loop();
  },

  // The Sanctum — spend banked Souls on permanent upgrades + relic unlocks.
  showSanctum(g) {
    const m = g.meta;
    const render = () => {
      document.getElementById('sanctum-souls-n').textContent = m.souls;
      const wrap = document.getElementById('sanctum-list');
      wrap.innerHTML = '';
      META.forEach((item, i) => {
        const lvl = m.up[item.id] || 0;
        const maxed = lvl >= item.max;
        const cost = metaCost(item, lvl);
        const afford = m.souls >= cost;
        const el = document.createElement('button');
        el.className = 'soul-item' + (maxed ? ' maxed' : afford ? '' : ' broke');
        el.style.animationDelay = (i * 0.05) + 's';
        const pips = Array.from({ length: item.max }, (_, k) => `<i class="${k < lvl ? 'on' : ''}"></i>`).join('');
        el.innerHTML =
          `<img class="ware-ico-img" src="assets/icons/${item.icon}.png" alt="">` +
          `<div class="ware-body">` +
            `<div class="ware-name">${item.name}<span class="soul-pips">${pips}</span></div>` +
            `<div class="ware-desc">${maxed ? 'Mastered.' : item.desc(lvl + 1)}</div>` +
          `</div>` +
          `<div class="ware-cost soul">${maxed ? '✓' : '<span class="soul-dot small"></span><span class="num">' + cost + '</span>'}</div>`;
        if (!maxed) el.addEventListener('click', () => {
          if (g.buyMeta(item)) { this._sanctumMsg('The souls answer. Empowered.'); render(); }
          else this._sanctumMsg('Not enough souls.');
        });
        wrap.appendChild(el);
      });
      // relic unlocks
      LOCKED_RELICS.forEach((id) => {
        const relic = RELICS.find((r) => r.id === id);
        const owned = m.relics.includes(id);
        const afford = m.souls >= RELIC_UNLOCK_COST;
        const el = document.createElement('button');
        el.className = 'soul-item relicunlock' + (owned ? ' maxed' : afford ? '' : ' broke');
        el.innerHTML =
          `<img class="ware-ico-img" src="assets/icons/${id}.png" alt="">` +
          `<div class="ware-body">` +
            `<div class="ware-name">${relic.name}<span class="tagchip relic">RELIC</span></div>` +
            `<div class="ware-desc">${relic.desc}</div>` +
            `<div class="ware-flavor">${owned ? 'Unlocked — it now appears at the sorcerer.' : relic.flavor}</div>` +
          `</div>` +
          `<div class="ware-cost soul">${owned ? '✓' : '<span class="soul-dot small"></span><span class="num">' + RELIC_UNLOCK_COST + '</span>'}</div>`;
        if (!owned) el.addEventListener('click', () => {
          if (g.unlockRelic(id)) { this._sanctumMsg(`${relic.name} unlocked!`); render(); }
          else this._sanctumMsg('Not enough souls.');
        });
        wrap.appendChild(el);
      });
    };
    render();
    document.getElementById('sanctum-msg').innerHTML = '&nbsp;';
    document.getElementById('sanctum-back').onclick = () => this.showScreen('title');
    this.showScreen('sanctum');
  },
  _sanctumMsg(t) { const el = document.getElementById('sanctum-msg'); if (el) el.textContent = t; },

  // Floating prompt while roaming the camp room.
  setCampPrompt(kind) {
    const b = document.getElementById('camp-prompt');
    if (!kind) { b.classList.add('hidden'); return; }
    b.classList.remove('hidden');
    if (kind === 'sorcerer') { b.textContent = 'Trade'; b.className = 'sorcerer'; b.onclick = () => game.campTrade(); }
    else if (kind === 'shrine') { b.textContent = 'Inspect'; b.className = 'shrine'; b.onclick = () => game.campInspect(); }
    else { b.textContent = 'Descend'; b.className = 'door'; b.onclick = () => game.campDescend(); }
  },

  // A dungeon event — risk/reward decision at the shrine.
  showEvent(g, ev) {
    const m = document.getElementById('event-modal');
    m.style.setProperty('--ev', ev.color || '#b06bff');
    document.getElementById('event-icon').src = `assets/icons/${ev.icon}.png`;
    document.getElementById('event-title').textContent = ev.title;
    const flavor = document.getElementById('event-flavor');
    flavor.textContent = ev.flavor; flavor.classList.remove('hidden');
    const choices = document.getElementById('event-choices');
    choices.innerHTML = ''; choices.classList.remove('hidden');
    ev.choices.forEach((ch, i) => {
      const el = document.createElement('button');
      el.className = 'event-choice';
      el.style.animationDelay = (i * 0.07) + 's';
      el.innerHTML = `<div class="ec-label">${ch.label}</div><div class="ec-risk">${ch.risk}</div>`;
      // one tap decides it — no Continue step; the outcome floats as a camp toast
      el.onclick = () => g.resolveEvent(i);
      choices.appendChild(el);
    });
    document.getElementById('event-result').classList.add('hidden');
    this.showScreen('event');
  },
  hideEvent() { this.showScreen(null); },

  // The sorcerer's trade panel — spend gold on forge upgrades & relics.
  showShop(g) {
    const level = g.level;
    document.getElementById('camp-title').textContent =
      level + 1 === 10 ? 'The Sorcerer — the Dark Knight waits below'
      : level + 1 === 20 ? 'The Sorcerer — the Demon Lord stirs'
      : 'The Sorcerer';

    const render = () => {
      document.getElementById('camp-gold-n').textContent = g.gold;
      document.getElementById('reroll-cost').textContent = g.rerollCost;
      const wrap = document.getElementById('camp-wares');
      wrap.innerHTML = '';
      g.shopStock.forEach((w, i) => {
        const owned = w.sold;
        const afford = g.gold >= w.cost;
        const el = document.createElement('button');
        el.className = 'ware ' + w.kind + (owned ? ' sold' : afford ? '' : ' broke');
        el.style.animationDelay = (i * 0.07) + 's';
        const tag = w.kind === 'relic' ? 'RELIC' : (w.level > 0 ? 'Lv ' + w.next : 'NEW');
        el.innerHTML =
          `<img class="ware-ico-img" src="assets/icons/${w.id}.png" alt="" draggable="false">` +
          `<div class="ware-body">` +
            `<div class="ware-name">${w.item.name}<span class="tagchip ${w.kind}">${tag}</span></div>` +
            `<div class="ware-desc">${numWrap(w.label)}</div>` +
            (w.kind === 'relic' ? `<div class="ware-flavor">${w.item.flavor}</div>` : '') +
          `</div>` +
          `<div class="ware-cost">${owned ? '✓' : '◆ <span class="num">' + w.cost + '</span>'}</div>`;
        if (!owned) el.addEventListener('click', () => {
          if (g.buyWare(w)) { Sound.play(w.kind === 'relic' ? 'relic' : 'buy'); this._campMsg(`Bought ${w.item.name}.`); render(); }
          else this._campMsg('Not enough gold.');
        });
        wrap.appendChild(el);
      });
    };
    render();

    document.getElementById('reroll-btn').onclick = () => {
      if (g.rerollShop()) { Sound.play('ui'); this._campMsg('The sorcerer lays out new wares.'); render(); }
      else this._campMsg('Not enough gold to reroll.');
    };
    document.getElementById('shop-back').onclick = () => g.closeShop();
    document.getElementById('camp-msg').innerHTML = '&nbsp;';
    this.showScreen('shop');
  },

  hideShop() { this.showScreen(null); },
  _campMsg(t) { const el = document.getElementById('camp-msg'); if (el) el.textContent = t; },

  gameOver(level) {
    document.getElementById('go-sub').innerHTML = numWrap(`You reached Level ${level} of ${LEVELS.length}`);
    this.showScreen('gameover');
  },
  victory(stats) {
    if (stats) {
      document.getElementById('victory-stats').innerHTML =
        `<div class="vstat">Foes slain<span class="num">${stats.kills}</span></div>` +
        `<div class="vstat">Gold gathered<span class="num">${stats.gold}</span></div>` +
        `<div class="vstat">Relics claimed<span class="num">${stats.relics}</span></div>`;
    }
    this.showScreen('victory');
  },
};

async function boot() {
  const canvas = document.getElementById('game');
  // Cold loads (esp. mobile Safari) can drop a request; retry a couple of times
  // so the title/start button is always wired up on first visit.
  let loaded = false;
  for (let attempt = 0; attempt < 3 && !loaded; attempt++) {
    try { await loadAssets(); loaded = true; }
    catch (err) {
      console.error('asset load attempt failed', err);
      if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  if (!loaded) {
    document.querySelector('#title-screen .tag').textContent =
      'Could not load sprites — tap to retry…';
    document.getElementById('start-btn').onclick = () => location.reload();
    return;
  }

  game = new Game(canvas, ui);
  ui.showScreen('title');

  // WebAudio can only start from a user gesture — unlock on the first interaction.
  const unlock = () => { Sound.unlock(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  // a small mute toggle in the corner (and the 'M' key)
  const muteBtn = document.getElementById('mute-btn');
  let muteCv = null;
  if (muteBtn) { muteCv = document.createElement('canvas'); muteCv.width = muteCv.height = 32; muteBtn.appendChild(muteCv); }
  const syncMute = () => { if (muteCv) drawMuteIcon(muteCv, Sound.muted); };
  syncMute();
  if (muteBtn) muteBtn.addEventListener('click', (e) => { e.stopPropagation(); Sound.unlock(); Sound.toggleMute(); syncMute(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'm' || e.key === 'M') { Sound.toggleMute(); syncMute(); } });

  // ---- God mode (debug/testing): no damage taken, one-shot foes, floor-skip ----
  game.godMode = godMode;
  const godBtn = document.getElementById('god-btn');
  const godSkip = document.getElementById('god-skip');
  const syncGod = () => {
    if (godBtn) { godBtn.textContent = 'God Mode: ' + (godMode ? 'On' : 'Off'); godBtn.classList.toggle('god-on', godMode); }
  };
  syncGod();
  if (godBtn) godBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    godMode = !godMode;
    try { localStorage.setItem('kls_god', godMode ? '1' : '0'); } catch (err) { /* ignore */ }
    game.godMode = godMode;
    if (game.player) game.player.god = godMode;
    syncGod();
  });
  if (godSkip) godSkip.addEventListener('click', (e) => { e.stopPropagation(); game.godSkip(); });

  // Hero select stays built for a future unlock; for now every run is the Knight.
  document.getElementById('start-btn').addEventListener('click', () => { Sound.unlock(); game.beginIntro('knight'); });
  document.getElementById('retry-btn').addEventListener('click', () => game.start('knight'));
  document.getElementById('win-btn').addEventListener('click', () => game.start('knight'));
  // return to the title after a run (resets game state so the corridor shows)
  document.getElementById('go-menu-btn').addEventListener('click', () => game.toTitle());
  document.getElementById('win-menu-btn').addEventListener('click', () => game.toTitle());
}

boot();
