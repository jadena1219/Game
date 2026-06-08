// Entry point: load sprites, wire up the menus, run the game.
import { loadAssets } from './assets.js';
import { Game } from './game.js';
import { CONFIG } from './config.js';
import { drawSprite } from './sprite.js';
import { META, metaCost, LOCKED_RELICS, RELIC_UNLOCK_COST } from './meta.js';
import { RELICS } from './abilities.js';

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

// wrap digit runs so numbers render in the clear Press Start 2P font
const numWrap = (s) => String(s).replace(/(\d+)/g, '<span class="num">$1</span>');

const ui = {
  showScreen(name) {
    if (name !== 'hero-select') this._heroAnim = false;   // stop preview loop on leave
    for (const [k, el] of Object.entries(screens)) {
      el.classList.toggle('hidden', k !== name);
    }
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
      el.onclick = () => this._showEventResult(g, g.chooseEvent(i));
      choices.appendChild(el);
    });
    document.getElementById('event-result').classList.add('hidden');
    this.showScreen('event');
  },
  _showEventResult(g, res) {
    document.getElementById('event-choices').classList.add('hidden');
    document.getElementById('event-flavor').classList.add('hidden');
    const r = document.getElementById('event-result');
    r.classList.remove('hidden');
    document.getElementById('event-result-text').textContent = res;
    document.getElementById('event-continue').onclick = () => g.closeEvent();
  },
  hideEvent() { this.showScreen(null); },

  // The sorcerer's trade panel — spend gold on forge upgrades & relics.
  showShop(g) {
    const level = g.level;
    document.getElementById('camp-title').textContent =
      level + 1 === 5 ? 'The Sorcerer — the Dark Knight waits below'
      : level + 1 === 10 ? 'The Sorcerer — the Demon Lord stirs'
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
          if (g.buyWare(w)) { this._campMsg(`Bought ${w.item.name}.`); render(); }
          else this._campMsg('Not enough gold.');
        });
        wrap.appendChild(el);
      });
    };
    render();

    document.getElementById('reroll-btn').onclick = () => {
      if (g.rerollShop()) { this._campMsg('The sorcerer lays out new wares.'); render(); }
      else this._campMsg('Not enough gold to reroll.');
    };
    document.getElementById('shrine-btn').onclick = () => {
      const r = g.gambleShrine();
      if (!r.ok) return this._campMsg('The shrine demands 30 gold.');
      if (r.kind === 'relic') this._campMsg(`The shrine grants you a relic: ${r.name}!`);
      else if (r.kind === 'gold') this._campMsg('The shrine spits back a few coins.');
      else this._campMsg('The shrine takes your gold, and laughs.');
      render();
    };
    document.getElementById('shop-back').onclick = () => g.closeShop();
    document.getElementById('camp-msg').innerHTML = '&nbsp;';
    this.showScreen('shop');
  },

  hideShop() { this.showScreen(null); },
  _campMsg(t) { const el = document.getElementById('camp-msg'); if (el) el.textContent = t; },

  gameOver(level, souls, total) {
    document.getElementById('go-sub').innerHTML = numWrap(`You reached Level ${level} of 10`);
    document.getElementById('go-souls').textContent = souls || 0;
    document.getElementById('go-total').textContent = total || 0;
    this.showScreen('gameover');
  },
  victory(stats) {
    if (stats) {
      document.getElementById('victory-stats').innerHTML =
        `<div class="vstat">Foes slain<span class="num">${stats.kills}</span></div>` +
        `<div class="vstat">Gold gathered<span class="num">${stats.gold}</span></div>` +
        `<div class="vstat">Relics claimed<span class="num">${stats.relics}</span></div>`;
      document.getElementById('win-souls').textContent = stats.souls || 0;
      document.getElementById('win-total').textContent = stats.total || 0;
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

  // Hero select stays built for a future unlock; for now every run is the Knight.
  document.getElementById('start-btn').addEventListener('click', () => game.start('knight'));
  document.getElementById('retry-btn').addEventListener('click', () => game.start('knight'));
  document.getElementById('win-btn').addEventListener('click', () => game.start('knight'));
  document.getElementById('sanctum-btn').addEventListener('click', () => ui.showSanctum(game));
  document.getElementById('sanctum-back').addEventListener('click', () => ui.showScreen('title'));
  // return to the title (where the Sanctum lives) after a run
  document.getElementById('go-menu-btn').addEventListener('click', () => ui.showScreen('title'));
  document.getElementById('win-menu-btn').addEventListener('click', () => ui.showScreen('title'));
}

boot();
