// Entry point: load sprites, wire up the menus, run the game.
import { loadAssets } from './assets.js';
import { Game } from './game.js';

const screens = {
  title: document.getElementById('title-screen'),
  levelcomplete: document.getElementById('level-complete'),
  gameover: document.getElementById('game-over'),
  victory: document.getElementById('victory'),
};

const ui = {
  showScreen(name) {
    for (const [k, el] of Object.entries(screens)) {
      el.classList.toggle('hidden', k !== name);
    }
  },
  levelComplete(level, hp) {
    document.getElementById('lc-title').textContent =
      level === 4 ? 'Wave Cleared — brace yourself' : 'Level Cleared';
    document.getElementById('lc-sub').textContent = `+${hp} HP restored`;
    document.getElementById('next-btn').textContent =
      level + 1 === 5 ? 'Face the Dark Knight'
      : level + 1 === 10 ? 'Face the Demon Lord'
      : `Begin Level ${level + 1}`;
    this.showScreen('levelcomplete');
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

  const game = new Game(canvas, ui);
  ui.showScreen('title');

  document.getElementById('start-btn').addEventListener('click', () => game.start());
  document.getElementById('next-btn').addEventListener('click', () => game.nextLevel());
  document.getElementById('retry-btn').addEventListener('click', () => game.start());
  document.getElementById('win-btn').addEventListener('click', () => game.start());
}

boot();
