// The walkable title camp: cold open, campfire, the pit that starts a run.
// Split from game.js — method bodies are verbatim; attached to Game.prototype in core.js.
import { Assets } from '../../assets.js';
import { Sound } from '../../audio.js';
import { drawSprite, pickFrame } from '../../sprite.js';
import { FIRE_FRAMES, FIRE_PAL } from '../data.js';

export const titleMethods = {

  // ---------- flow ----------
  // Return to the title. Must reset the game state (not just the DOM) so the
  // canvas renders the title camp again — otherwise the last scene (e.g. the
  // victory) shows through behind the menu.
  toTitle() {
    this.state = 'title';
    this.player = null;
    this.enemies = []; this.projectiles = []; this.allyProjectiles = []; this.effects = []; this.pickups = [];
    this.interlude = null; this.interludeFade = null; this.introCut = null; this.campToast = null;
    this.intro = null; this.sweep = null; this.transition = null; this.camp = null; this.bossKind = null;
    this.watchers = []; this.campWhisper = null;
    this.plunge = null; this.camDrop = 0; this.descentJump = null;   // an in-flight fall must not hijack the menu
    this.titleCamp = null;       // rebuild fresh — the knight wakes by his fire again
    this.ui.showScreen('title');
    Sound.setScene('title');
  },


  // ---------- THE TITLE CAMP ----------
  // The menu IS a place: the knight's last camp at the pit mouth. He can walk.
  // The PIT is Begin; a violet SOUL BRAZIER is the Sanctum; a torn BANNER is
  // the Bargain (prologue). Walk close and the choice offers itself.
  _buildTitleCamp() {
    // The camp is COMPOSED for a phone-sized stage. On big viewports (desktop)
    // we build the same stage at logical size and scale it up — otherwise the
    // knight is a 38px black speck lost in a 2000px window.
    const SC = Math.max(1, Math.min(2.2, this.vh / 700));
    const W = Math.round(this.vw / SC), H = Math.round(this.vh / SC);
    const ox = Math.round(this.world.w / 2 - W / 2);
    const oy = Math.round(this.world.h / 2 - H / 2);
    const wallH = Math.round(H * 0.24);                  // the logo hangs over this dark wall
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');

    // floor: cold stone, warmed near where the fire will sit
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#241e30'); grd.addColorStop(1, '#151019');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    // flagstones (offset brick courses, per-stone shade, dark seams)
    const TS = 56;
    let s = 77;
    const R = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let ty = wallH - TS; ty < H; ty += TS) {
      const rowOff = (Math.floor(ty / TS) % 2) * (TS / 2);
      for (let tx = -TS; tx < W + TS; tx += TS) {
        const x = tx + rowOff, sh = (R() - 0.5) * 0.10;
        g.fillStyle = `rgba(${sh > 0 ? '255,255,255' : '0,0,0'},${Math.abs(sh)})`;
        g.fillRect(x, ty, TS, TS);
        g.fillStyle = 'rgba(0,0,0,0.34)'; g.fillRect(x, ty, TS, 2); g.fillRect(x, ty, 2, TS);
        g.fillStyle = 'rgba(255,255,255,0.045)'; g.fillRect(x + 2, ty + 2, TS - 2, 1);
        if (R() < 0.1) { g.fillStyle = 'rgba(90,140,110,0.18)'; g.fillRect(x + 6 + R() * 30, ty + 8 + R() * 30, 5, 3); }   // moss
        if (R() < 0.07) { g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1; g.beginPath();
          const cx2 = x + 10 + R() * 30, cy2 = ty + 8 + R() * 34;
          g.moveTo(cx2, cy2); g.lineTo(cx2 + 8, cy2 + 7); g.lineTo(cx2 + 5, cy2 + 15); g.stroke(); }   // crack
      }
    }
    // the back wall (logo zone): coursed dark brick with a worn lit lip
    g.fillStyle = '#120d1a'; g.fillRect(0, 0, W, wallH);
    for (let by = 8; by < wallH - 8; by += 16) {
      g.fillStyle = 'rgba(255,255,255,0.026)'; g.fillRect(0, by, W, 1);
      const off2 = (Math.floor(by / 16) % 2) * 22;
      g.fillStyle = 'rgba(0,0,0,0.35)';
      for (let bx = off2; bx < W; bx += 44) g.fillRect(bx, by, 1, 16);
    }
    g.fillStyle = 'rgba(190,170,220,0.10)'; g.fillRect(0, wallH - 2, W, 2);   // the lip catches light
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, wallH, W, 7);              // its cast shadow
    // roots hang from the ceiling of the world above — the weight overhead
    {
      let rs = 31;
      const RR = () => (rs = (rs * 1664525 + 1013904223) >>> 0) / 4294967296;
      for (let i = 0; i < 7; i++) {
        const rx = 20 + RR() * (W - 40), len = 8 + RR() * 18, sway = RR() < 0.5 ? -1 : 1;
        g.strokeStyle = 'rgba(6,4,10,0.85)'; g.lineWidth = 2 + RR() * 1.5; g.lineCap = 'round';
        g.beginPath(); g.moveTo(rx, wallH - 2);
        g.quadraticCurveTo(rx + sway * 3, wallH + len * 0.6, rx + sway * (2 + RR() * 4), wallH + len);
        g.stroke();
        if (RR() < 0.5) { g.beginPath(); g.moveTo(rx + sway, wallH + len * 0.4); g.lineTo(rx + sway * 6, wallH + len * 0.7); g.stroke(); }
      }
    }
    // THE WALL REMEMBERS: a tally scratched into the stone for every death —
    // groups of five, like a prisoner counting. No label. Those who notice, feel it.
    {
      const deaths = Math.min(40, (this.meta && this.meta.deaths) || 0);
      const tx0 = 26, ty0 = wallH - 26;
      g.strokeStyle = 'rgba(196,186,214,0.30)'; g.lineWidth = 1.5; g.lineCap = 'round';
      for (let i = 0; i < deaths; i++) {
        const grp = (i / 5) | 0, k2 = i % 5;
        const gx = tx0 + grp * 24, gy = ty0 + (grp % 2) * 1.5;
        g.beginPath();
        if (k2 < 4) { g.moveTo(gx + k2 * 4, gy); g.lineTo(gx + k2 * 4 + 1, gy + 11); }
        else { g.moveTo(gx - 2, gy + 9); g.lineTo(gx + 14, gy + 2); }   // the fifth slashes the four
        g.stroke();
      }
    }
    // side + bottom walls (thin frame)
    g.fillStyle = '#120d1a';
    g.fillRect(0, wallH, 14, H - wallH); g.fillRect(W - 14, wallH, 14, H - wallH); g.fillRect(0, H - 16, W, 16);

    // ---- staging ----
    // Asymmetry is DELIBERATE here: the brazier is a free-standing thing on the
    // floor (low-left); the banner is architecture, mounted ON the wall
    // (high-right). Different heights, different contexts — never "almost level".
    const fire = { x: ox + W * 0.5, y: oy + H * 0.55 };
    // the pit sits well INSIDE the view and big — a new player's eye should land
    // on it without scrolling their thumb anywhere
    const pit = { x: ox + W * 0.5, y: oy + H * 0.79 };
    const brazier = { x: ox + Math.max(64, W * 0.17), y: oy + H * 0.42 };
    const banner = { x: ox + Math.min(W - 64, W * 0.82), y: oy + H * 0.56 };   // a standard PLANTED on the floor
    // fire pit: scorched earth + a circle of stones (the flame itself is live pixel art)
    const fx = fire.x - ox, fy = fire.y - oy;
    const ch = g.createRadialGradient(fx, fy, 2, fx, fy, 40);
    ch.addColorStop(0, 'rgba(10,6,4,0.55)'); ch.addColorStop(1, 'rgba(10,6,4,0)');
    g.fillStyle = ch; g.beginPath(); g.ellipse(fx, fy, 40, 18, 0, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2, rx = fx + Math.cos(a) * 26, ry = fy + Math.sin(a) * 12;
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.ellipse(rx + 1, ry + 2, 5, 2.5, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = i % 2 ? '#403a4e' : '#332d40'; g.beginPath(); g.arc(rx, ry, 4, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.arc(rx - 1, ry - 1.5, 1.6, 0, Math.PI * 2); g.fill();
    }
    // the log he keeps his watch on — square to the fire, just south of it,
    // bark, knots and a sawn end-grain face (it must READ as a log)
    {
      const lx = fx, ly = fy + 38;
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(lx, ly + 8, 38, 7, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#4a3018'; g.fillRect(lx - 34, ly - 7, 68, 15);            // trunk
      g.fillStyle = '#5d3d20'; g.fillRect(lx - 34, ly - 7, 68, 5);             // top catches the firelight
      g.fillStyle = '#33200f'; g.fillRect(lx - 34, ly + 5, 68, 3);             // belly shadow
      g.fillStyle = 'rgba(0,0,0,0.30)';                                       // bark grooves
      for (let bxx = -28; bxx <= 26; bxx += 9) g.fillRect(lx + bxx, ly - 6, 2, 13);
      g.fillStyle = '#2a1a0c'; g.beginPath(); g.ellipse(lx - 10, ly - 1, 3, 2, 0, 0, Math.PI * 2); g.fill();   // knot
      // sawn end-grain (right end): pale face + growth rings
      g.fillStyle = '#8a6a42'; g.beginPath(); g.ellipse(lx + 34, ly + 0.5, 5, 7.5, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#6b4e2c'; g.lineWidth = 1;
      g.beginPath(); g.ellipse(lx + 34, ly + 0.5, 3, 5, 0, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#5d3d20'; g.fillRect(lx + 33, ly, 2, 2);                  // heartwood
    }
    // the soul brazier (Sanctum), free-standing on the floor
    this._bakeTorchColumn(g, brazier.x - ox, brazier.y - oy);
    // …raised into a proper SOUL ALCOVE: a carved arch sheltering the flame,
    // votive candles at its feet — the Sanctum reads as a shrine, not a lamp
    {
      const ax = brazier.x - ox, ay = brazier.y - oy;
      g.save();
      g.strokeStyle = '#3a3448'; g.lineWidth = 5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(ax - 22, ay + 6); g.lineTo(ax - 22, ay - 34);
      g.quadraticCurveTo(ax, ay - 56, ax + 22, ay - 34); g.lineTo(ax + 22, ay + 6); g.stroke();
      g.strokeStyle = 'rgba(120,108,150,0.35)'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(ax - 22, ay - 34); g.quadraticCurveTo(ax, ay - 56, ax + 22, ay - 34); g.stroke();
      // rune dots along the arch
      g.fillStyle = 'rgba(176,107,255,0.5)';
      for (const [rx2, ry2] of [[-18, -30], [-9, -42], [0, -46], [9, -42], [18, -30]]) g.fillRect(ax + rx2 - 1, ay + ry2 - 1, 2, 2);
      // votive candles
      for (const [cx2, ch2] of [[-16, 5], [14, 7], [20, 4]]) {
        g.fillStyle = '#cfc6b8'; g.fillRect(ax + cx2 - 1, ay + 8 - ch2, 3, ch2);
        g.fillStyle = '#7a7468'; g.fillRect(ax + cx2 - 1, ay + 8, 3, 1);
      }
      g.restore();
    }
    // the campaign standard (the Bargain) — now a shrine corner: a kneeler
    // stone and candles before it, a place he has knelt many times
    {
      const bnx = banner.x - ox, bny = banner.y - oy;
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(bnx, bny + 4, 15, 5, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3a3446'; g.fillRect(bnx - 7, bny - 2, 14, 6);             // stone footing
      g.fillStyle = '#262232'; g.fillRect(bnx - 7, bny + 2, 14, 2);
      g.fillStyle = '#4a3018'; g.fillRect(bnx - 2, bny - 84, 4, 84);            // staff
      g.fillStyle = '#5d3d20'; g.fillRect(bnx - 2, bny - 84, 2, 84);
      g.fillStyle = '#6b5a3a'; g.fillRect(bnx - 4, bny - 88, 8, 5);             // finial
      this._bakeBanner(g, bnx, bny - 76, '#4e1d22');                            // crossbar + torn cloth
      // the kneeler: a worn flat stone before the standard
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(bnx - 26, bny + 14, 16, 6, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#332e42'; g.fillRect(bnx - 38, bny + 8, 24, 9);
      g.fillStyle = '#454058'; g.fillRect(bnx - 38, bny + 8, 24, 3);
      // two small candles by the foot
      for (const [cx2, ch2] of [[14, 6], [19, 4]]) {
        g.fillStyle = '#cfc6b8'; g.fillRect(bnx + cx2, bny - ch2 + 2, 3, ch2);
        g.fillStyle = '#7a7468'; g.fillRect(bnx + cx2, bny + 2, 3, 1);
      }
    }
    // THE ARMORY RACK — two shrouded silhouettes wait for hands that haven't
    // come yet (the Rogue's daggers, the Paladin's hammer). No label. Locked.
    {
      const rx = ox + Math.min(W - 60, W * 0.84), ry = oy + wallH + 64;
      const lx = rx - ox, ly = ry - oy;
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(lx, ly + 26, 26, 6, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#4a3018'; g.fillRect(lx - 24, ly - 26, 4, 52); g.fillRect(lx + 20, ly - 26, 4, 52);   // posts
      g.fillStyle = '#5d3d20'; g.fillRect(lx - 24, ly - 26, 2, 52); g.fillRect(lx + 20, ly - 26, 2, 52);
      g.fillStyle = '#4a3018'; g.fillRect(lx - 24, ly - 22, 48, 4); g.fillRect(lx - 24, ly + 14, 48, 4);   // rails
      // the daggers (crossed) and the hammer — near-black shapes, faintly edged
      g.save(); g.translate(lx - 10, ly - 2);
      g.rotate(0.5); g.fillStyle = '#16121f'; g.fillRect(-2, -13, 4, 24);
      g.rotate(-1.0); g.fillStyle = '#16121f'; g.fillRect(-2, -13, 4, 24);
      g.restore();
      g.fillStyle = '#16121f'; g.fillRect(lx + 8, ly - 16, 5, 26); g.fillRect(lx + 2, ly - 18, 17, 9);     // hammer
      g.strokeStyle = 'rgba(140,130,160,0.22)'; g.lineWidth = 1;
      g.strokeRect(lx + 2.5, ly - 17.5, 16, 8);
      // a small padlock on the rail
      g.fillStyle = '#6b5a3a'; g.fillRect(lx - 3, ly + 16, 6, 5);
      g.strokeStyle = '#6b5a3a'; g.lineWidth = 1.5; g.beginPath(); g.arc(lx, ly + 16, 3, Math.PI, 0); g.stroke();
    }
    // his bedroll, west of the fire — and a supply sack + whetstone by the log
    {
      const bx2 = fx - 78, by2 = fy + 14;
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(bx2, by2 + 7, 28, 7, 0, 0, Math.PI * 2); g.fill();
      g.save(); g.translate(bx2, by2); g.rotate(-0.10);
      g.fillStyle = '#4e1d22'; g.fillRect(-26, -8, 52, 15);
      g.fillStyle = '#6b2a30'; g.fillRect(-26, -8, 52, 4);
      g.fillStyle = '#33141a'; g.fillRect(-26, 5, 52, 2);
      g.fillStyle = '#8a8296'; g.fillRect(18, -7, 8, 13);
      g.restore();
      g.fillStyle = '#5a4a30'; g.beginPath(); g.ellipse(fx + 46, fy + 40, 8, 9, -0.2, 0, Math.PI * 2); g.fill();   // sack
      g.fillStyle = '#6e5c3c'; g.beginPath(); g.ellipse(fx + 46, fy + 34, 5, 4, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3a3140'; g.fillRect(fx - 46, fy + 44, 10, 5);                                               // whetstone
      g.fillStyle = '#55495e'; g.fillRect(fx - 46, fy + 44, 10, 2);
    }
    // a cooking spit over the fire: forked sticks + crossbar + a small pot.
    // Baked on its OWN little canvas, not the floor: it stands at the fire's
    // depth, so it must paint OVER a knight standing behind the flame — the
    // render layers it live instead of welding it to the background.
    const spitCv = document.createElement('canvas');
    {
      spitCv.width = 60; spitCv.height = 44;
      const sg = spitCv.getContext('2d');
      sg.fillStyle = '#4a3018';
      sg.fillRect(6, 4, 3, 36); sg.fillRect(51, 4, 3, 36);                     // posts
      sg.fillRect(3, 0, 9, 3); sg.fillRect(48, 0, 9, 3);                       // forks
      sg.fillRect(6, 2, 48, 3);                                                // crossbar
      sg.fillStyle = '#2b2733'; sg.fillRect(25, 5, 10, 8);                     // the pot
      sg.fillStyle = '#454052'; sg.fillRect(25, 5, 10, 2);
      sg.fillStyle = '#1c1923'; sg.fillRect(29, 2, 2, 3);                      // its hook
    }
    // THE BROKEN SEAL: the pit didn't open — it BURST through a great carved
    // ward. Shattered ring arcs + runes + snapped chains from anchor stones.
    {
      const px3 = pit.x - ox, py3 = pit.y - oy;
      g.save(); g.translate(px3, py3);
      g.strokeStyle = 'rgba(150,140,180,0.20)'; g.lineWidth = 3;
      for (const [a0, a1] of [[0.3, 1.2], [1.7, 2.6], [3.1, 4.3], [4.8, 5.9]]) {   // broken ring
        g.beginPath(); g.ellipse(0, 0, 118, 66, 0, a0, a1); g.stroke();
      }
      g.fillStyle = 'rgba(150,140,180,0.22)';
      for (let i = 0; i < 10; i++) {                                               // ward runes
        const a = (i / 10) * Math.PI * 2 + 0.31;
        if (i % 3 === 0) continue;                                                 // gaps where it shattered
        g.fillRect(Math.cos(a) * 105 - 2, Math.sin(a) * 59 - 2, 4, 4);
      }
      // snapped chains: links trailing from anchor stones, torn at the rim
      for (const ca of [0.6, 2.4, 4.1]) {
        const ax2 = Math.cos(ca) * 150, ay2 = Math.sin(ca) * 86;
        g.fillStyle = '#3a3446'; g.fillRect(ax2 - 6, ay2 - 5, 12, 10);             // anchor stone
        g.fillStyle = '#262232'; g.fillRect(ax2 - 6, ay2 + 2, 12, 3);
        g.strokeStyle = '#55495e'; g.lineWidth = 2;
        const n2 = 5;
        for (let li = 0; li < n2; li++) {                                          // chain links
          const f2 = li / n2, gx2 = ax2 * (1 - f2) + Math.cos(ca) * 92 * f2, gy2 = ay2 * (1 - f2) + Math.sin(ca) * 52 * f2;
          g.beginPath(); g.ellipse(gx2, gy2, 4, 2.6, ca, 0, Math.PI * 2); g.stroke();
        }
        g.beginPath(); g.ellipse(Math.cos(ca) * 88, Math.sin(ca) * 50, 4, 2.6, ca, 0.8, Math.PI * 1.6); g.stroke();   // the torn link
      }
      g.restore();
    }
    // THE PIT rim is computed in WORLD coords (the torn mouth is drawn live in
    // _drawTornPit so the camp and title pit are byte-identical).
    const pitRim = this._pitRim(pit.x, pit.y);
    // vignette
    const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    this.titleBg = c;
    // pre-scale the bake ONCE: the per-frame background cost becomes a flat 1:1
    // blit (Chrome re-rasterizes a transform-scaled blit every frame — that was
    // leap jank #1)
    const bs = document.createElement('canvas');
    bs.width = Math.max(1, this.vw); bs.height = Math.max(1, this.vh);
    const bg2 = bs.getContext('2d');
    bg2.imageSmoothingEnabled = false;
    bg2.drawImage(c, 0, 0, W, H, 0, 0, bs.width, bs.height);
    this.titleBgScreen = bs;
    this._titleGrads = new Map();          // per-frame gradients, created ONCE (jank #2)

    this.titleCamp = {
      ox, oy, t: 0, sizeKey: this.vw + 'x' + this.vh, scale: SC,
      fire, pit, brazier, banner,
      spit: { cv: spitCv, x: fire.x - 30, y: fire.y - 38 },   // live-layered (depth)
      pitRim,                              // already world coords (see _pitRim)
      parts: [],                           // live fire embers
      smoke: [],                           // woodsmoke puffs climbing off the flame
      rumbleT: 7 + Math.random() * 6,      // the deep below breathes (periodic tremor)
      rumble: 0,
      glanceT: 4 + Math.random() * 4,      // the knight looks around while idle
      prompt: null, jump: null, sink: 0, sunk: false,
      bounds: { minX: ox + 44, maxX: ox + W - 44, minY: oy + wallH + 30, maxY: oy + H - 42 },
      // where he boots up (and crash-lands): just up-left of the stone ring,
      // so the flint-kneel leans him over it without standing IN the pit —
      // and once it's lit, flame and spit both burn in FRONT of him (depth)
      spawn: { x: fire.x - 26, y: fire.y - 32 },
      // THE COLD OPEN (first boot only): the knight alone in the black FALLS in
      // from above, eats dirt, picks himself up frame by frame; flint is struck;
      // the fire catches, ROARS, and its light reveals the camp — then the
      // title drops from above and locks in. Tap to skip.
      intro: this._titleIntroPlayed ? null
        : { t: 0, LAND: 0.55, RISE: 1.5, STRIKE: 2.7, IGNITE: 3.45, TITLE: 4.0, END: 4.5, landed: false, burst: false, titleDropped: false },
    };
    this._titleIntroPlayed = true;
    this._tapped = false;
    // he boots up at the fire's edge (the pratfall's landing spot)
    this.titleKnight = { x: fire.x - 26, y: fire.y - 32, sprite: 'knight',
      moving: false, faceLeft: false, attackAnim: 0 };
  },


  _updateTitleCamp(dt) {
    const key = this.vw + 'x' + this.vh;
    if (!this.titleCamp || this.titleCamp.sizeKey !== key) this._buildTitleCamp();
    const tc = this.titleCamp; tc.t += dt;
    // a DOM panel (the Sanctum) is open: hold the camp, hide the prompt
    if (this.ui.screenOpen && this.ui.screenOpen !== 'title') {
      if (tc.prompt) { tc.prompt = null; this.ui.setTitlePrompt(null); }
      return;
    }
    // the cold open: no control until the fire has spoken
    if (tc.intro) {
      const iv = tc.intro;
      // The open WANTS the hero's sheet for his big reveal, so it holds while a
      // cold CDN streams it in — but NEVER forever: after a short wait (or any
      // tap) it plays regardless, so a slow/failed sprite can't brick the menu.
      iv.wait = (iv.wait || 0) + dt;
      if (!Assets.images.knight && iv.wait < 3 && !this._tapped) return;
      iv.t += dt;
      if (this._tapped) {                                       // tap = skip
        this._tapped = false; iv.t = Math.max(iv.t, 99);
        const k0 = this.titleKnight;
        k0.pose = null; k0.x = tc.spawn.x; k0.y = tc.spawn.y;
        iv.landed = true;
      }
      // THE PRATFALL: he drops out of the black, lands flat on his face, lies
      // there a stunned beat, then peels himself up pose by pose. Castle
      // Crashers school — the comedy lands BEFORE the fire does.
      {
        const k = this.titleKnight, sp = tc.spawn;
        if (iv.t < iv.LAND) {
          // gravity owns him: slow at first, then ALL AT ONCE
          if (iv.drop === undefined) iv.drop = Math.max(120, sp.y - tc.oy + 44);
          const f = Math.max(0, iv.t) / iv.LAND;
          k.x = sp.x;
          k.y = sp.y - iv.drop * (1 - f * f);
          k.pose = (Math.floor(iv.t * 16) % 2) ? 'walkA' : 'walkB';   // limbs flailing
          k.faceLeft = false;
        } else if (iv.landed) {
          // face-down → one stir → pushup → kneel → a knight again
          if (iv.t < iv.RISE) {
            k.pose = 'prone';
            // the body gives one small bounce off the dirt, then settles
            const bt = (iv.t - iv.LAND) / 0.16;
            k.y = sp.y - (bt < 1 ? Math.sin(bt * Math.PI) * 5 : 0);
            k.x = sp.x + ((iv.t > 1.08 && iv.t < 1.2) ? 1 : 0);   // a twitch: he lives
          } else if (iv.t < iv.RISE + 0.3) k.pose = 'pushup';
          else if (iv.t < iv.RISE + 0.6) k.pose = 'kneel';
          else if (iv.t >= iv.STRIKE - 0.25 && iv.t < iv.IGNITE + 0.3) {
            k.pose = 'kneel';                             // down on a knee to work the flint
          } else if (k.pose) {
            k.pose = null;
            if (!iv.dusted) {
              iv.dusted = true;
              for (let i = 0; i < 6; i++) tc.parts.push({   // dirt shaken off the plate
                x: sp.x + (Math.random() - 0.5) * 14, y: sp.y - 6 - Math.random() * 20,
                vx: (Math.random() - 0.5) * 26, vy: 6 + Math.random() * 18,
                life: 0, dur: 0.3 + Math.random() * 0.3, col: '#8d8699',
              });
            }
          }
        } else {
          // IMPACT. The whole dark feels it.
          iv.landed = true;
          k.x = sp.x; k.y = sp.y; k.pose = 'prone';
          Sound.play('hit', { vol: 1.25 }); Sound.play('hurt', { vol: 0.7 });
          this.shake = Math.max(this.shake, 9);
          for (let i = 0; i < 14; i++) tc.parts.push({   // a ring of kicked-up dust
            x: sp.x + (Math.random() - 0.5) * 34, y: sp.y - 1 - Math.random() * 4,
            vx: (Math.random() - 0.5) * 90, vy: -(12 + Math.random() * 42),
            life: 0, dur: 0.35 + Math.random() * 0.45, col: '#9a93a8',
          });
        }
      }
      if (iv.t >= iv.IGNITE && !iv.burst) {
        iv.burst = true;
        Sound.play('swing_ember', { vol: 1.3 }); Sound.play('explode', { vol: 0.22 });
        this.shake = Math.max(this.shake, 6);
        for (let i = 0; i < 14; i++) tc.parts.push({
          x: tc.fire.x + (Math.random() - 0.5) * 20, y: tc.fire.y - 8,
          vx: (Math.random() - 0.5) * 60, vy: -(50 + Math.random() * 80),
          life: 0, dur: 0.5 + Math.random() * 0.6, hot: Math.random() < 0.6,
        });
      }
      if (iv.t >= iv.IGNITE && Math.random() < dt * 16) tc.parts.push({
        x: tc.fire.x + (Math.random() - 0.5) * 16, y: tc.fire.y - 8,
        vx: (Math.random() - 0.5) * 12, vy: -(26 + Math.random() * 34),
        life: 0, dur: 0.8 + Math.random() * 0.7, hot: Math.random() < 0.5,
      });
      if (iv.t >= iv.TITLE && !iv.titleDropped) { iv.titleDropped = true; this.ui.titleEnter(); }
      if (iv.t >= iv.END) { if (!iv.titleDropped) this.ui.titleEnter(); this.titleKnight.pose = null; tc.intro = null; }
      for (const p2 of tc.parts) { p2.life += dt; p2.x += p2.vx * dt; p2.y += p2.vy * dt; }
      tc.parts = tc.parts.filter((p2) => p2.life < p2.dur);
      return;
    }
    // BEGIN was chosen: the knight leaps into the pit, drops, and the world
    // plunges — the prologue/shrine takes over under the black.
    if (tc.jump) {
      const j = tc.jump, k2 = this.titleKnight; j.t += dt;
      const raw = Math.min(1, j.t / j.dur), HOP = 0.62;
      if (raw <= HOP) {
        const pr = raw / HOP;
        k2.x = j.x0 + (j.tx - j.x0) * pr;
        k2.y = j.y0 + (j.ty - j.y0) * pr - j.h * Math.sin(pr * Math.PI);
        tc.sink = 0;
      } else {
        const s2 = (raw - HOP) / (1 - HOP);
        k2.x = j.tx; k2.y = j.ty + s2 * 22;
        tc.sink = s2;
        // the moment he breaks the mouth's plane: embers startle up out of it,
        // and the plunge begins UNDER him (overlap = no seam between the two)
        if (!tc.plunged) {
          tc.plunged = true;
          for (let i = 0; i < 9; i++) tc.parts.push({
            x: tc.pit.x + (Math.random() - 0.5) * 40, y: tc.pit.y - 4,
            vx: (Math.random() - 0.5) * 30, vy: -(40 + Math.random() * 60),
            life: 0, dur: 0.5 + Math.random() * 0.5, hot: Math.random() < 0.5,
          });
          Sound.play('plunge');
          this.plunge = { t: 0, dur: 1.6, half: 0.72, fired: false, mid: () => this.startPrologue() };
        }
      }
      k2.moving = true;
      if (raw >= 1) { tc.jump = null; tc.sunk = true; }
      // embers + smoke keep animating through the leap
      for (const p2 of tc.parts) { p2.life += dt; p2.x += p2.vx * dt; p2.y += p2.vy * dt; }
      tc.parts = tc.parts.filter((p2) => p2.life < p2.dur);
      this._titleSmoke(tc, dt);
      return;
    }
    if (tc.sunk) return;                   // falling through the dark
    this.input.poll();
    const k = this.titleKnight, mv = this.input.move, ml = Math.hypot(mv.x, mv.y);
    k.moving = ml > 0.08;
    if (k.moving) {
      const spd = 168;
      k.x += (mv.x / (ml || 1)) * spd * Math.min(1, ml) * dt;
      k.y += (mv.y / (ml || 1)) * spd * Math.min(1, ml) * dt;
      if (Math.abs(mv.x) > 0.05) k.faceLeft = mv.x < 0;
    }
    const b = tc.bounds;
    k.x = Math.max(b.minX, Math.min(b.maxX, k.x));
    k.y = Math.max(b.minY, Math.min(b.maxY, k.y));
    // solid things: the pit mouth (stand at the rim, not on the void) and the
    // fire (it is FIRE — he walks around it)
    const solid = (ecx, ecy, erx, ery) => {
      const nx = (k.x - ecx) / erx, ny = (k.y - ecy) / ery, dl = Math.hypot(nx, ny);
      if (dl < 1 && dl > 1e-4) { k.x = ecx + (nx / dl) * erx; k.y = ecy + (ny / dl) * ery; }
    };
    solid(tc.pit.x, tc.pit.y, 84, 48);
    // the fire's solid is biased SOUTH: the north rim is standable, so his
    // boot spot behind the flame (the campfire shot) stays reachable
    solid(tc.fire.x, tc.fire.y + 6, 30, 14);
    // the campfire breathes embers
    if (Math.random() < dt * 16) tc.parts.push({
      x: tc.fire.x + (Math.random() - 0.5) * 16, y: tc.fire.y - 8,
      vx: (Math.random() - 0.5) * 12, vy: -(26 + Math.random() * 34),
      life: 0, dur: 0.8 + Math.random() * 0.7, hot: Math.random() < 0.5,
    });
    // …and a slow ambient dust mote now and then, drifting through the firelight
    if (Math.random() < dt * 1.2) tc.parts.push({
      x: tc.ox + 30 + Math.random() * (tc.bounds.maxX - tc.ox - 60), y: tc.bounds.minY + Math.random() * 200,
      vx: (Math.random() - 0.5) * 8, vy: 4 + Math.random() * 7,
      life: 0, dur: 2.5 + Math.random() * 2, col: 'rgba(120,112,140,0.5)',
    });
    for (const p2 of tc.parts) { p2.life += dt; p2.x += p2.vx * dt; p2.y += p2.vy * dt; }
    tc.parts = tc.parts.filter((p2) => p2.life < p2.dur);
    this._titleSmoke(tc, dt);
    // THE DEEP BELOW BREATHES: a periodic tremor — a muffled boom, the scene
    // shudders, dust shakes loose from the wall and falls
    tc.rumbleT -= dt;
    if (tc.rumbleT <= 0) {
      tc.rumbleT = 9 + Math.random() * 8;
      tc.rumble = 0.8;
      Sound.play('die_tank', { vol: 0.2 });
      for (let i = 0; i < 6; i++) tc.parts.push({
        x: tc.ox + 24 + Math.random() * (tc.bounds.maxX - tc.ox - 48), y: tc.bounds.minY - 22,
        vx: (Math.random() - 0.5) * 6, vy: 30 + Math.random() * 36,
        life: 0, dur: 0.5 + Math.random() * 0.4, col: '#5a5266',
      });
    }
    if (tc.rumble > 0) tc.rumble -= dt;
    // the knight is a person: idle long enough and he glances about
    if (!k.moving) {
      tc.glanceT -= dt;
      if (tc.glanceT <= 0) { tc.glanceT = 3.5 + Math.random() * 4.5; k.faceLeft = !k.faceLeft; }
    } else tc.glanceT = 3.5 + Math.random() * 4.5;
    // BEGIN is the threshold itself: come to the brink and the pit CLAIMS you —
    // a ring sweeps closed while you stand there (step back to refuse). No
    // direction-holding, no dexterity: the solid rim parks you in exactly the
    // right spot, so reaching the edge IS the input. Tapping the mouth directly
    // skips the wait and drops you at once.
    const d2 = (o) => Math.hypot(k.x - o.x, k.y - o.y);
    const dl2 = Math.hypot((k.x - tc.pit.x) / 84, (k.y - tc.pit.y) / 48);   // vs the solid ellipse
    tc.atBrink = dl2 < 1.22;
    if (this._tapped) {
      this._tapped = false;
      const [tx2, ty2] = this._tapXY || [-999, -999];
      const sx2 = (tc.pit.x - tc.ox) * tc.scale, sy2 = (tc.pit.y - tc.oy) * tc.scale;
      if (tc.atBrink && Math.hypot((tx2 - sx2) / (96 * tc.scale), (ty2 - sy2) / (58 * tc.scale)) < 1) {
        this.titleBegin(); return;
      }
    }
    if (tc.atBrink) {
      tc.commit = Math.min(1, (tc.commit || 0) + dt / 0.65);
      if (tc.commit >= 1) { this.titleBegin(); return; }
    } else {
      tc.commit = Math.max(0, (tc.commit || 0) - dt * 2.4);    // step back and it eases off
    }
    let prompt = null;
    if (d2(tc.brazier) < 64) prompt = 'sanctum';
    else if (d2(tc.banner) < 64) prompt = 'prologue';
    if (prompt !== tc.prompt) { tc.prompt = prompt; this.ui.setTitlePrompt(prompt, this.meta.souls); }
  },


  _renderTitleCamp(ctx) {
    const tc = this.titleCamp;
    ctx.clearRect(0, 0, this.vw, this.vh);
    if (!tc) return;
    const t = tc.t, k = this.titleKnight;
    // as he commits to the pit the camera LEANS IN over the mouth — the zoom
    // rides his sink and holds while the plunge swallows the screen
    const lean = tc.sunk ? 1 : (tc.jump ? Math.max(0, tc.sink || 0) : 0);
    const leaned = lean > 0.001;
    if (leaned) {
      const z = 1 + 0.22 * lean * lean;
      const px2 = (tc.pit.x - tc.ox) * tc.scale, py2 = (tc.pit.y - tc.oy) * tc.scale;
      ctx.save();
      ctx.translate(px2, py2); ctx.scale(z, z); ctx.translate(-px2, -py2);
    }
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    // the deep's tremor shudders the whole scene (screen units, around everything)
    if (tc.rumble > 0) ctx.translate(Math.sin(t * 60) * 1.6 * tc.rumble * tc.scale, Math.sin(t * 47 + 2) * 1.2 * tc.rumble * tc.scale);
    ctx.drawImage(this.titleBgScreen, 0, 0);   // pre-scaled: a flat 1:1 blit
    // the camp's own camera for the DYNAMIC layers: the logical stage scaled up
    ctx.scale(tc.scale, tc.scale);
    ctx.translate(-tc.ox, -tc.oy);
    // the pit — a torn mouth in the stone, breathing ember-light from below
    this._drawPitMouth(ctx, tc, t);
    // warm + violet + cold light pools (additive, flickering)
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    // cached origin-relative gradients; flicker rides ALPHA (radius stays fixed)
    const pool = (x, y, r, col, a) => {
      const g2 = this._tGrad(`pool|${col}|${r}`, () => {
        const gg = ctx.createRadialGradient(0, 0, 2, 0, 0, r);
        gg.addColorStop(0, this._rgba(col, 1)); gg.addColorStop(1, this._rgba(col, 0));
        return gg;
      });
      ctx.globalAlpha = a; ctx.fillStyle = g2;
      ctx.translate(x, y); ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.translate(-x, -y);
      ctx.globalAlpha = 1;
    };
    const iv = tc.intro;
    const lit = !iv || iv.t >= iv.IGNITE;
    const flick = 0.85 + 0.15 * Math.sin(t * 11) + 0.06 * Math.sin(t * 27);
    if (lit) pool(tc.fire.x, tc.fire.y - 6, 150, '#ff9a4a', 0.20 * flick);
    pool(tc.brazier.x, tc.brazier.y - 14, 90, '#b06bff', 0.16 + 0.05 * Math.sin(t * 3));
    pool(tc.banner.x, tc.banner.y, 64, '#d8413a', 0.07 + 0.03 * Math.sin(t * 2.2));
    ctx.restore();
    // the knight (shadow + sprite) — teetering toward the mouth as the pit
    // claims him, fading as he sinks. Drawn SMOOTH (no pixel-snap): the stage's
    // zoom turned snapped coords into visible stepping during the leap.
    const drawKnight = () => {
      const sink = Math.max(0, Math.min(1, tc.sink || 0));
      const c2 = (!tc.jump && tc.commit) || 0;
      const pd = Math.hypot(tc.pit.x - k.x, tc.pit.y - k.y) || 1;
      const kx = k.x + ((tc.pit.x - k.x) / pd) * 4 * c2 + Math.sin(t * 31) * 1.4 * c2;   // a smooth tremble, not noise
      const ky2 = k.y + ((tc.pit.y - k.y) / pd) * 2 * c2;
      // mid-pratfall his shadow waits AT THE LANDING SPOT, swelling as he drops
      const falling = iv && !iv.landed && iv.t < iv.LAND;
      const shY = falling ? tc.spawn.y : ky2;
      const shF = falling ? Math.max(0.3, 1 - (tc.spawn.y - k.y) / 360) : 1;
      ctx.save(); ctx.fillStyle = '#03020a';
      ctx.globalAlpha = 0.3 * (1 - sink) * shF;
      ctx.beginPath(); ctx.ellipse(kx, shY + 2, 16 * shF, 6 * shF, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = Math.max(0, 1 - sink * 1.15);
      // close to the flame, his armor catches its warmth
      const fireD = Math.hypot(k.x - tc.fire.x, k.y - tc.fire.y);
      const warm = fireD < 130 ? { color: '#ff9a4a', a: 0.13 * (1 - fireD / 130) + 0.04 } : null;
      // a forced pose (the pratfall's prone/pushup/kneel) overrides the
      // walk-cycle picker, and the idle breathing bob sits out while it plays
      drawSprite(ctx, 'knight', k.pose || pickFrame(k, t), kx,
        ky2 - ((k.moving || k.pose) ? 0 : Math.sin(t * 2.6) * 1), k.faceLeft, 1, warm, true);
      ctx.globalAlpha = 1;
    };
    // depth: north of the flame is BEHIND it — he goes down first and the
    // fire paints over his boots (the classic campfire shot)
    const kBehind = k.y < tc.fire.y + 10;
    if (!tc.sunk && kBehind) drawKnight();
    // the cooking spit straddles the fire — SOUTH of a knight on the north
    // rim, so it paints over him here (and under him when he walks in front)
    ctx.drawImage(tc.spit.cv, tc.spit.x, tc.spit.y);
    // the campfire itself — animated pixel art — and its embers.
    // During the cold open it ROARS on ignition (tall, wild) and settles.
    if (lit) {
      let fs = 2;
      if (iv) {
        const roar = Math.max(0, 1 - (iv.t - iv.IGNITE) / 0.7);
        fs = 2 + 2.4 * roar * (0.75 + 0.25 * Math.sin(t * 31));
      }
      this._drawPixelFire(ctx, tc.fire.x, tc.fire.y + 6, t, fs);
    } else if (iv && iv.t >= iv.STRIKE + 0.35 && Math.sin(iv.t * 26) > 0.55) {
      // the tinder almost catches — weak, stuttering licks of flame
      ctx.globalAlpha = 0.55;
      this._drawPixelFire(ctx, tc.fire.x, tc.fire.y + 6, t, 1.1);
      ctx.globalAlpha = 1;
    }
    // flint struck in the dark: sparks arc from his hand onto the tinder
    if (iv && iv.t >= iv.STRIKE && iv.t < iv.IGNITE) {
      for (const st of [iv.STRIKE, iv.STRIKE + 0.45]) {
        const pr = (iv.t - st) / 0.3;
        if (pr < 0 || pr > 1) continue;
        for (let i = 0; i < 3; i++) {
          const f2 = Math.min(1, pr + i * 0.07);
          const sx2 = (k.x - 8) + (tc.fire.x - (k.x - 8)) * f2;
          const sy2 = (k.y - 30) + (tc.fire.y - 4 - (k.y - 30)) * f2 - Math.sin(f2 * Math.PI) * 7 + i * 2;
          ctx.globalAlpha = 1 - f2 * 0.35;
          ctx.fillStyle = i ? '#ffd36b' : '#fff3c0';
          ctx.fillRect(sx2, sy2, 2, 2);
        }
      }
      ctx.globalAlpha = 1;
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const p2 of tc.parts) {
      const a = 1 - p2.life / p2.dur;
      ctx.globalAlpha = a;
      ctx.fillStyle = p2.col || (p2.hot ? '#ffd36b' : '#ff7a2a');
      ctx.fillRect(p2.x - 1, p2.y - 1, 2, 2);
    }
    ctx.restore(); ctx.globalAlpha = 1;
    // woodsmoke climbing off the flame, thinning into the dark
    for (const s of tc.smoke) {
      const sa = Math.sin((s.life / s.dur) * Math.PI) * 0.14;
      ctx.globalAlpha = sa;
      ctx.fillStyle = '#9a93a8';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // violet soulfire on the brazier (cached gradient; the flicker is a vertical scale)
    {
      const bx = tc.brazier.x, by = tc.brazier.y - 12, hf = 1 + Math.sin(t * 10 + 2) * 0.22;
      const g1 = this._tGrad('soulfire', () => {
        const gg = ctx.createRadialGradient(0, -3.5, 1, 0, 0, 11);
        gg.addColorStop(0, '#efe0ff'); gg.addColorStop(0.55, '#b06bff'); gg.addColorStop(1, 'rgba(120,60,200,0)');
        return gg;
      });
      ctx.save();
      ctx.translate(bx, by); ctx.scale(1, hf);
      ctx.fillStyle = g1;
      ctx.beginPath();
      ctx.moveTo(-5, 2);
      ctx.quadraticCurveTo(-4, -6.6, 0, -11);
      ctx.quadraticCurveTo(4, -6.6, 5, 2);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    if (!tc.sunk && !kBehind) drawKnight();
    // floating labels — quiet names, bobbing, brighter as you draw near
    const label = (text, x, y, col, near) => {
      const bob = Math.sin(t * 2.2 + x * 0.05) * 2;
      ctx.save();
      ctx.globalAlpha = near ? 0.95 : 0.55;
      ctx.font = `bold ${near ? 11 : 9}px "Silkscreen", monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(text, x, y + bob); ctx.fillStyle = col; ctx.fillText(text, x, y + bob);
      ctx.restore();
    };
    if (!iv) {                             // names wait for the light
      // the brink ring: fills as the knight leans into the pit, gold → white-hot
      const c = tc.commit || 0;
      if (c > 0.01 && !tc.jump && !tc.sunk) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(tc.pit.x, tc.pit.y);
        ctx.lineWidth = 3 + 3 * c; ctx.lineCap = 'round';
        ctx.strokeStyle = `rgba(255,${(210 - 90 * c) | 0},${(120 - 60 * c) | 0},${0.55 + 0.45 * c})`;
        ctx.beginPath(); ctx.ellipse(0, 0, 96, 56, 0, -Math.PI / 2, -Math.PI / 2 + c * Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      // the way down teaches itself: BEGIN at rest, STEP IN at the brink.
      // (the down-arrow is GEOMETRY, not a glyph — '▾' isn't in Silkscreen and
      // Chrome's per-frame missing-glyph fallback scan cost a whole frame)
      const atBrink = tc.atBrink && !tc.jump && !tc.sunk;
      label(atBrink ? 'STEP IN' : 'BEGIN', tc.pit.x, tc.pit.y - 92, '#ffd86a', atBrink);
      {
        const bob2 = Math.sin(t * 2.2 + tc.pit.x * 0.05) * 2;
        const ay = tc.pit.y - 82 + bob2, aw = atBrink ? 5 : 4;
        ctx.save();
        ctx.globalAlpha = atBrink ? 0.95 : 0.55;
        ctx.fillStyle = '#ffd86a';
        ctx.beginPath();
        ctx.moveTo(tc.pit.x - aw, ay); ctx.lineTo(tc.pit.x + aw, ay); ctx.lineTo(tc.pit.x, ay + aw + 2);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      label(`SANCTUM ◆${this.meta.souls || 0}`, tc.brazier.x, tc.brazier.y - 58, '#c89aff', tc.prompt === 'sanctum');
      label('THE BARGAIN', tc.banner.x, tc.banner.y - 102, '#e08a7a', tc.prompt === 'prologue');
    }
    ctx.restore();
    if (leaned) ctx.restore();             // end the lean-in (overlays stay screen-true)
    this._drawTitleIntroDark(ctx, tc);     // the cold open's black, opened by firelight
    // movement only on this screen — the sword button has no business here
    if (!this.ui.screenOpen || this.ui.screenOpen === 'title') this.input.draw(ctx, true);
    this._drawPlunge(ctx);
    this._drawTransition(ctx);
  },


  // THE COLD OPEN, Castle Crashers school: total black except a dim pool of
  // almost-light around the knight — who FALLS IN FROM ABOVE, eats dirt,
  // lies there a beat, then picks himself up frame by frame (prone → pushup →
  // kneel → stand), dusts off, strikes the flint, and the fire reveals the
  // camp. The pool follows him the whole way down. Comedy, then warmth.
  _drawTitleIntroDark(ctx, tc) {
    const iv = tc.intro; if (!iv) return;
    const S = 0.5;
    const sw = Math.max(1, Math.round(this.vw * S)), sh = Math.max(1, Math.round(this.vh * S));
    let sc = this.shadowCanvas, g = this.shadowCtx;
    if (!sc || sc.width !== sw || sc.height !== sh) {
      sc = this.shadowCanvas = document.createElement('canvas');
      sc.width = sw; sc.height = sh;
      g = this.shadowCtx = sc.getContext('2d');
      this._holeCache = new Map();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, sw, sh);
    g.fillStyle = 'rgba(2,1,6,1)'; g.fillRect(0, 0, sw, sh);
    g.globalCompositeOperation = 'destination-out';
    const hole = (wx, wy, r, a) => {
      const sx = (wx - tc.ox) * tc.scale * S, sy = (wy - tc.oy) * tc.scale * S, rr = r * tc.scale * S;
      if (rr <= 0) return;
      const grd = g.createRadialGradient(sx, sy, 1, sx, sy, rr);
      grd.addColorStop(0, `rgba(0,0,0,${a})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(sx, sy, rr, 0, Math.PI * 2); g.fill();
    };
    const k = this.titleKnight;
    hole(k.x, k.y - 26, 115, 0.62);                       // the knight, barely — it FOLLOWS his fall
    if (iv.t >= iv.IGNITE) {
      const pr = Math.min(1, (iv.t - iv.IGNITE) / 0.85);
      const e2 = 1 - Math.pow(1 - pr, 3);                 // the light RUSHES out, then eases
      hole(tc.fire.x, tc.fire.y - 6, 95 + e2 * (Math.hypot(this.vw, this.vh) / tc.scale), 1);
    } else if (iv.t >= iv.STRIKE + 0.35 && Math.sin(iv.t * 26) > 0.55) {
      hole(tc.fire.x, tc.fire.y - 6, 80, 0.5);            // a guttering catch-light
    }
    g.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.imageSmoothingEnabled = true;
    ctx.drawImage(sc, 0, 0, this.vw, this.vh);
    ctx.restore();
    // the ignition FLASH
    const fd = iv.t - iv.IGNITE;
    if (fd >= 0 && fd < 0.3) {
      ctx.fillStyle = `rgba(255,214,150,${0.5 * (1 - fd / 0.3)})`;
      ctx.fillRect(0, 0, this.vw, this.vh);
    }
  },


  // BEGIN: the knight leaps from where he stands into the pit (the same arc he
  // makes at every camp), sinks into the dark, and the plunge carries us down.
  titleBegin() {
    if (this.state !== 'title' || !this.titleCamp || this.titleCamp.jump || this.titleCamp.sunk || this.plunge) return;
    const tc = this.titleCamp, k = this.titleKnight;
    this.ui.setTitlePrompt(null);
    this.ui.swipeTitleAway();              // the logo lifts away as he commits
    Sound.play('jump');
    tc.prompt = null;
    // takeoff dust kicked from his heels
    for (let i = 0; i < 6; i++) tc.parts.push({
      x: k.x + (Math.random() - 0.5) * 14, y: k.y + 2,
      vx: (Math.random() - 0.5) * 50, vy: -(6 + Math.random() * 16),
      life: 0, dur: 0.35 + Math.random() * 0.25, col: '#9a93a8',
    });
    tc.jump = { t: 0, dur: 0.8, x0: k.x, y0: k.y, tx: tc.pit.x, ty: tc.pit.y - 4, h: 54 };
    k.attackAnim = 1;          // he LEAPS in the lunging pose, not mid-shuffle
    if (tc.pit.x < k.x - 1) k.faceLeft = true; else if (tc.pit.x > k.x + 1) k.faceLeft = false;
  },


  // Woodsmoke: soft gray puffs that swell, sway and thin as they climb off the
  // flame toward the dark — drawn in _renderTitleCamp above the fire.
  _titleSmoke(tc, dt) {
    tc.smokeT = (tc.smokeT || 0) - dt;
    if (tc.smokeT <= 0 && !tc.sunk) {
      tc.smokeT = 0.22 + Math.random() * 0.14;
      tc.smoke.push({ x: tc.fire.x + (Math.random() - 0.5) * 8, y: tc.fire.y - 26,
        r: 2.5 + Math.random() * 2, sway: Math.random() * 6.28,
        life: 0, dur: 2.2 + Math.random() * 1.2 });
    }
    for (const s of tc.smoke) {
      s.life += dt;
      s.y -= (16 + s.r * 2) * dt;
      s.x += Math.sin(tc.t * 1.6 + s.sway) * 7 * dt;
      s.r += 3.2 * dt;
    }
    tc.smoke = tc.smoke.filter((s) => s.life < s.dur);
  },


  // The animated pixel campfire: four hand-placed frames, stepped at ~9fps,
  // with a breathing glow behind the flame.
  _drawPixelFire(ctx, x, y, t, s = 2) {
    const F = FIRE_FRAMES[Math.floor(t * 9) % FIRE_FRAMES.length];
    const w = 12, h = F.length;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const flick = 0.8 + 0.2 * Math.sin(t * 13);
    const g2 = this._tGrad('fireglow', () => {
      const gg = ctx.createRadialGradient(0, 0, 2, 0, 0, 34);
      gg.addColorStop(0, 'rgba(255,170,70,0.40)'); gg.addColorStop(1, 'rgba(255,110,30,0)');
      return gg;
    });
    const gs = s / 2;                                  // the roar swells the glow with the flame
    ctx.globalAlpha = flick;
    ctx.translate(x, y - h * s * 0.4); ctx.scale(gs, gs);
    ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.fill();
    ctx.restore(); ctx.globalAlpha = 1;
    const x0 = Math.round(x - (w * s) / 2), y0 = Math.round(y - h * s);
    for (let ry = 0; ry < h; ry++) {
      const row = F[ry];
      for (let cx2 = 0; cx2 < w; cx2++) {
        const ch2 = row[cx2];
        if (!ch2 || ch2 === '.') continue;
        ctx.fillStyle = FIRE_PAL[ch2];
        ctx.fillRect(x0 + cx2 * s, y0 + ry * s, s, s);
      }
    }
  },


  // The title pit is the same torn mouth as everywhere else.
  _drawPitMouth(ctx, tc, t) {
    const d = tc.pit, k = this.titleKnight;
    const near = k && !tc.sunk ? Math.max(0, 1 - Math.hypot(k.x - d.x, k.y - d.y) / 180) : 0.4;
    this._drawTornPit(ctx, d.x, d.y, t, near, tc.pitRim);
  },
};
