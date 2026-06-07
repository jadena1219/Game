// Entry point: load sprites, wire up the menus, run the game.
import { loadAssets } from './assets.js';
import { Game } from './game.js';
import { nextLevelOf } from './abilities.js';

const screens = {
  title: document.getElementById('title-screen'),
  reward: document.getElementById('reward-screen'),
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

  // Reward card selection between levels.
  showRewards(level, choices, player, hp) {
    document.getElementById('rw-title').textContent =
      level + 1 === 5 ? 'Cleared! The Dark Knight awaits…'
      : level + 1 === 10 ? 'Cleared! The Demon Lord stirs…'
      : 'Level Cleared';
    document.getElementById('rw-sub').innerHTML = `+${hp} HP restored &middot; choose a power for Level ${level + 1}`;

    const wrap = document.getElementById('reward-cards');
    wrap.innerHTML = '';
    const els = [];
    choices.forEach((card, i) => {
      const lvl = nextLevelOf(player, card);
      const isNew = lvl === 1;
      const el = document.createElement('button');
      el.className = 'card' + (isNew ? ' is-new' : '');
      el.style.animationDelay = (i * 0.11) + 's';   // cascade in one-by-one
      el.innerHTML =
        `<img class="ico" src="assets/icons/${card.id}.png" alt="" draggable="false">` +
        `<div class="body">` +
        `<div class="name">${card.name}` +
        `<span class="tagchip">${isNew ? 'NEW' : 'Lv ' + lvl}</span></div>` +
        `<div class="cdesc">${card.desc(lvl)}</div>` +
        `</div>`;
      el.addEventListener('click', () => {
        if (wrap.dataset.locked) return;
        wrap.dataset.locked = '1';
        // animated pick: chosen card pops, others slide away, then commit
        els.forEach((other) => {
          other.style.animationDelay = '0s';
          other.classList.add(other === el ? 'picked' : 'dismiss');
        });
        setTimeout(() => { delete wrap.dataset.locked; game.chooseReward(card); }, 430);
      });
      els.push(el);
      wrap.appendChild(el);
    });
    this.showScreen('reward');
  },

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
