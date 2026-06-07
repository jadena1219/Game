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
    for (const card of choices) {
      const lvl = nextLevelOf(player, card);
      const isNew = lvl === 1;
      const el = document.createElement('button');
      el.className = 'card' + (isNew ? ' is-new' : '');
      el.innerHTML =
        `<div class="ico">${card.icon}</div>` +
        `<div class="body">` +
        `<div class="name">${card.name}` +
        `<span class="tagchip">${isNew ? 'NEW' : 'Lv ' + lvl}</span></div>` +
        `<div class="cdesc">${card.desc(lvl)}</div>` +
        `</div>`;
      el.addEventListener('click', () => game.chooseReward(card), { once: true });
      wrap.appendChild(el);
    }
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
