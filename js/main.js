// Entry point: load sprites, wire up the menus, run the game.
import { loadAssets } from './assets.js';
import { Game } from './game.js';

const screens = {
  title: document.getElementById('title-screen'),
  camp: document.getElementById('camp-screen'),
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

  // The between-level dungeon camp: spend gold on forge upgrades & relics.
  showCamp(g) {
    const level = g.level;
    document.getElementById('camp-title').textContent =
      level + 1 === 5 ? 'Camp — the Dark Knight awaits below'
      : level + 1 === 10 ? 'Camp — the Demon Lord stirs below'
      : 'The Camp';
    const greetings = [
      'A hooded figure waits by the fire…', '"Spend your gold, knight. The dark is patient."',
      '"Steel and charms. What\'ll it be?"', '"You\'ll not survive below without me."',
      '"Coin for your life. Fair trade."',
    ];
    document.getElementById('camp-sub').textContent = greetings[(Math.random() * greetings.length) | 0];

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
        el.style.animationDelay = (i * 0.08) + 's';
        const tag = w.kind === 'relic' ? 'RELIC' : (w.level > 0 ? 'Lv ' + w.next : 'NEW');
        el.innerHTML =
          `<div class="ware-ico">${w.item.icon}</div>` +
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
    this._campRender = render;

    document.getElementById('reroll-btn').onclick = () => {
      if (g.rerollShop()) { this._campMsg('New wares.'); render(); }
      else this._campMsg('Not enough gold to reroll.');
    };
    document.getElementById('shrine-btn').onclick = () => {
      const r = g.gambleShrine();
      if (!r.ok) return this._campMsg('The shrine demands 30 gold.');
      if (r.kind === 'relic') this._campMsg(`The shrine grants you ${r.icon} ${r.name}!`);
      else if (r.kind === 'gold') this._campMsg('The shrine spits back a few coins.');
      else this._campMsg('The shrine takes your gold, and laughs.');
      render();
    };
    document.getElementById('descend-btn').onclick = () => { this.showScreen(null); g.descend(); };
    document.getElementById('camp-msg').innerHTML = '&nbsp;';
    this.showScreen('camp');
  },

  _campMsg(t) { const el = document.getElementById('camp-msg'); if (el) el.textContent = t; },

  gameOver(level) {
    document.getElementById('go-sub').textContent = `You reached Level ${level} of 10`;
    this.showScreen('gameover');
  },
  victory() { this.showScreen('victory'); },
};

async function boot() {
  const canvas = document.getElementById('game');
  try {
    await loadAssets();
  } catch (err) {
    document.querySelector('#title-screen .tag').textContent =
      'Could not load sprites — serve this folder over HTTP (see README).';
    console.error(err);
    return;
  }

  game = new Game(canvas, ui);
  ui.showScreen('title');

  document.getElementById('start-btn').addEventListener('click', () => game.start());
  document.getElementById('retry-btn').addEventListener('click', () => game.start());
  document.getElementById('win-btn').addEventListener('click', () => game.start());
}

boot();
