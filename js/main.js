// Entry point: load sprites, wire up the menus, run the game.
import { loadAssets } from './assets.js';
import { Game } from './game.js';

const screens = {
  title: document.getElementById('title-screen'),
  shop: document.getElementById('shop-modal'),
  gameover: document.getElementById('game-over'),
  victory: document.getElementById('victory'),
};

let game = null;

const ui = {
  showScreen(name) {
    for (const [k, el] of Object.entries(screens)) {
      el.classList.toggle('hidden', k !== name);
    }
  },

  // Floating prompt while roaming the camp room.
  setCampPrompt(kind) {
    const b = document.getElementById('camp-prompt');
    if (!kind) { b.classList.add('hidden'); return; }
    b.classList.remove('hidden');
    if (kind === 'sorcerer') { b.innerHTML = '✦ Trade'; b.className = 'sorcerer'; b.onclick = () => game.campTrade(); }
    else { b.innerHTML = 'Descend ▾'; b.className = 'door'; b.onclick = () => game.campDescend(); }
  },

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
            `<div class="ware-desc">${w.label}</div>` +
            (w.kind === 'relic' ? `<div class="ware-flavor">${w.item.flavor}</div>` : '') +
          `</div>` +
          `<div class="ware-cost">${owned ? '✓' : '◆ ' + w.cost}</div>`;
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

  gameOver(level) {
    document.getElementById('go-sub').textContent = `You reached Level ${level} of 10`;
    this.showScreen('gameover');
  },
  victory() { this.showScreen('victory'); },
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

  document.getElementById('start-btn').addEventListener('click', () => game.start());
  document.getElementById('retry-btn').addEventListener('click', () => game.start());
  document.getElementById('win-btn').addEventListener('click', () => game.start());
}

boot();
