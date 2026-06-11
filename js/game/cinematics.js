// Cinematics: boss entrances, the descent plunge, the walk-in tunnel intro.
// Split from game.js — method bodies are verbatim; attached to Game.prototype in core.js.
import { Sound } from '../audio.js';
import { biomeForLevel } from '../biomes.js';
import { drawSprite } from '../sprite.js';

export const cinematicsMethods = {

  // The boss-entrance cutscene: the knight stands at the chamber mouth, scanning
  // the dark and breathing, then the altar wakes and the boss drags itself up
  // out of the ritual symbol. Then the fight begins.
  _updateCutscene(dt) {
    const cs = this.cutscene, p = this.player, boss = this.cutsceneBoss;
    cs.t += dt;
    const cx = this.world.w / 2, cy = this.world.h / 2;
    const total = cs.look + cs.rise + cs.settle;

    p.moving = false; p.attackAnim = 0; p.swingTimer = 0; p.dashTimer = 0;
    if (cs.t < cs.look) p.faceLeft = Math.sin(cs.t * 1.5) < 0;   // curious — scanning left and right
    else p.faceLeft = false;                                     // fixated on the rising shape

    // camera drifts from the knight up to the altar as the menace reveals itself
    const focusY = cy + (1 - this._smooth(cs.t / cs.look)) * 155;
    const tx = Math.max(0, Math.min(this.world.w - this.vw, cx - this.vw / 2));
    const ty = Math.max(0, Math.min(this.world.h - this.vh, focusY - this.vh / 2));
    const k = Math.min(1, dt * 2.4);
    this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * k;

    if (cs.t >= cs.look) {                                        // RISE
      const rp = Math.min(1, (cs.t - cs.look) / cs.rise);
      boss.rising = this._smooth(rp);
      this.shake = Math.max(this.shake, 1 + 5 * rp);              // building rumble
      if (Math.random() < dt * 34) {
        this._mote(cx + (Math.random() - 0.5) * 74, cy + 8, Math.random() < 0.5 ? '#ff6a2a' : '#b81810',
          { vy: -(22 + Math.random() * 46), g: -12, r: 1.5 + Math.random() * 1.7, twinkle: 1, dur: 0.8 + Math.random() * 0.4 });
      }
      if (!cs.roared && rp > 0.62) {
        cs.roared = true; Sound.play('bossroar');
        this.shake = Math.max(this.shake, 16); this.flashScreen = Math.max(this.flashScreen, 0.28);
      }
    } else if (Math.random() < dt * 9) {                         // faint awakening glimmer at the symbol
      this._mote(cx + (Math.random() - 0.5) * 44, cy + 6, '#7a2ed0', { vy: -12, r: 1.2, twinkle: 1, dur: 0.7 });
    }

    this._updateProjAndFx(dt);

    if (cs.t >= total) {                                          // → FIGHT
      this.cutscene = null; this.cutsceneBoss = null;
      boss.inert = false; boss.rising = 1; boss.state = 'walk';
      p.invuln = 0.9;
      this.countdown = 0;
      Sound.play('fight');
    }
  },


  // Cinematic dressing for the boss entrance: letterbox bars slide in, and the
  // boss's name slams up once it tears free of the altar.
  _drawCutscene(ctx) {
    const cs = this.cutscene; if (!cs) return;
    const W = this.vw, H = this.vh, total = cs.look + cs.rise + cs.settle;
    const inOut = Math.min(1, cs.t / 0.6) * Math.min(1, (total - cs.t) / 0.5);
    const bar = Math.max(0, inOut) * Math.min(46, H * 0.07);
    ctx.save();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
    ctx.restore();
    if (cs.roared) {
      const since = cs.t - (cs.look + cs.rise * 0.62);
      const a = Math.min(1, since * 2.4);
      const slam = 1 + Math.max(0, 1 - since * 4) * 0.5;        // SLAMS in, then settles
      const name = cs.name.toUpperCase(), y = H * 0.26;
      ctx.save();
      ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      let size = Math.round(28 * slam);
      ctx.font = `bold ${size}px "Silkscreen", sans-serif`;
      const maxW = W * 0.88, tw = ctx.measureText(name).width;
      if (tw > maxW) { size = Math.floor(size * maxW / tw); ctx.font = `bold ${size}px "Silkscreen", sans-serif`; }
      // small dread label above the name
      ctx.font = `bold 11px "Silkscreen", sans-serif`; ctx.fillStyle = 'rgba(190,46,36,0.85)';
      ctx.fillText('THE WAY IS BARRED BY', W / 2, y - size * 0.7 - 6);
      ctx.font = `bold ${size}px "Silkscreen", sans-serif`;
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(name, W / 2, y);
      ctx.shadowColor = '#ff2a1e'; ctx.shadowBlur = 16 * a;
      ctx.fillStyle = '#e8241a'; ctx.fillText(name, W / 2, y);
      ctx.restore();
    }
  },


  // The descent: darkness rushes up as you fall, red abyss-light swells from
  // below, speed-lines streak down, the Demon Lord whispers — then the next
  // floor fades up out of the black.
  _drawPlunge(ctx) {
    if (!this.plunge) return;
    const pl = this.plunge, W = this.vw, H = this.vh;
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (pl.t < pl.half) {                          // FALLING — and it should FEEL like falling
      const f = pl.t / pl.half;
      const fe = Math.pow(f, 0.6);                 // the dark SLAMS up, front-loaded
      const fb = Math.min(20, Math.round(fe * 20));
      const grd = this._tGrad(`plungefall|${fb}|${H}`, () => {
        const gg = ctx.createLinearGradient(0, H, 0, H * (1 - (fb / 20) * 1.15) - 20);
        gg.addColorStop(0, 'rgba(0,0,0,1)'); gg.addColorStop(1, 'rgba(0,0,0,0)');
        return gg;
      });
      ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
      // hold off full black until the very end so the red has room to breathe
      ctx.fillStyle = `rgba(0,0,0,${Math.max(0, (f - 0.82) / 0.18)})`; ctx.fillRect(0, 0, W, H);
      // red abyss glow surging from below
      const rg = this._tGrad(`plungered|${W}x${H}`, () => {
        const gg = ctx.createRadialGradient(W / 2, H + 30, 8, W / 2, H + 30, H);
        gg.addColorStop(0, 'rgba(210,34,16,1)'); gg.addColorStop(1, 'rgba(0,0,0,0)');
        return gg;
      });
      ctx.globalAlpha = 0.66 * Math.pow(f, 0.55) * (0.92 + 0.08 * Math.sin(pl.t * 21));
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      // WIND: two layers of hard vertical speed-streaks (near = fast and long,
      // far = slower parallax), the whole sheet juddering with the fall
      ctx.save();
      ctx.translate(Math.sin(pl.t * 67) * 3 * f, 0);
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.55 * f; ctx.strokeStyle = 'rgba(205,212,230,0.7)'; ctx.lineWidth = 2.5;
      for (let i = 0; i < 22; i++) {
        const x = (i * 89.7) % W, len = 90 + (i * 53) % 130;
        const y = ((i * 131 + pl.t * 2600) % (H + len + 160)) - len - 80;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + len); ctx.stroke();
      }
      ctx.globalAlpha = 0.28 * f; ctx.lineWidth = 1.5;
      for (let i = 0; i < 12; i++) {
        const x = (i * 137.3 + 40) % W, len = 40 + (i * 71) % 60;
        const y = ((i * 97 + pl.t * 1400) % (H + len + 120)) - len - 60;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + len); ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      if (pl.whisper && f > 0.24) {                // the whisper from below — eases in slowly (and rare)
        ctx.globalAlpha = Math.min(1, (f - 0.24) / 0.45) * 0.85;
        ctx.font = '600 19px "Silkscreen", monospace';
        ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fillText(pl.whisper, W / 2 + 1, H * 0.5 + 1);
        ctx.fillStyle = '#c8201a'; ctx.fillText(pl.whisper, W / 2, H * 0.5);
        ctx.globalAlpha = 1;
      }
    } else {                                       // RISING into the new floor
      const r = (pl.t - pl.half) / (pl.dur - pl.half);
      ctx.globalAlpha = 1 - r;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      // a red afterglow clinging to the dark as the new floor emerges
      if (r < 0.6) {
        const rg = this._tGrad(`plungemid|${W}x${H}`, () => {
          const gg = ctx.createRadialGradient(W / 2, H * 0.5, 10, W / 2, H * 0.5, Math.max(W, H) * 0.7);
          gg.addColorStop(0, 'rgba(150,18,10,1)'); gg.addColorStop(1, 'rgba(0,0,0,0)');
          return gg;
        });
        ctx.globalAlpha = (1 - r / 0.6) * 0.5;
        ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1 - r;
      }
      if (pl.whisper && r < 0.5) {
        ctx.globalAlpha = (1 - r / 0.5) * 0.8;
        ctx.font = '600 19px "Silkscreen", monospace';
        ctx.fillStyle = '#c8201a'; ctx.fillText(pl.whisper, W / 2, H * 0.5);
      }
    }
    ctx.restore();
  },


  // Bake one repeating slice of the title corridor (walls + floor + a torch on
  // each wall). Rebuilt only if the viewport changed.
  _buildTunnel() {
    const W = this.vw, H = this.vh, SEG = 200;
    const b = biomeForLevel(1);                       // catacomb palette → matches Level 1
    // band sits a touch low so the title text never overlaps the knight, who is
    // centred within it
    const top = Math.round(H * 0.34), bot = Math.round(H * 0.86);
    this._tunnel = { SEG, top, bot, torchY: { top, bot } };
    const c = document.createElement('canvas'); c.width = SEG; c.height = H;
    const g = c.getContext('2d');
    // sunken floor
    const grd = g.createLinearGradient(0, top, 0, bot);
    grd.addColorStop(0, b.ground[0]); grd.addColorStop(1, b.ground[1]);
    g.fillStyle = grd; g.fillRect(0, top, SEG, bot - top);
    g.strokeStyle = 'rgba(0,0,0,0.42)'; g.lineWidth = 2;
    for (let x = 0; x <= SEG; x += 50) { g.beginPath(); g.moveTo(x, top); g.lineTo(x, bot); g.stroke(); }
    for (let y = top; y <= bot; y += 50) { g.beginPath(); g.moveTo(0, y); g.lineTo(SEG, y); g.stroke(); }
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(Math.random() * SEG, top + Math.random() * (bot - top), 1 + Math.random() * 2, 1); }
    // walls above & below
    g.fillStyle = b.wall; g.fillRect(0, 0, SEG, top); g.fillRect(0, bot, SEG, H - bot);
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2;
    for (let x = 0; x <= SEG; x += 46) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, top); g.moveTo(x + 23, bot); g.lineTo(x + 23, H); g.stroke();
    }
    for (let y = 0; y < top; y += 26) { g.beginPath(); g.moveTo(0, y); g.lineTo(SEG, y); g.stroke(); }
    for (let y = bot + 26; y < H; y += 26) { g.beginPath(); g.moveTo(0, y); g.lineTo(SEG, y); g.stroke(); }
    // lit cap + recessed shadow where wall meets floor
    g.fillStyle = b.cap; g.fillRect(0, top - 5, SEG, 5); g.fillRect(0, bot, SEG, 5);
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, top, SEG, 10); g.fillRect(0, bot - 10, SEG, 10);
    // a brazier standing against each wall, centred in the slice
    this._bakeBrazierPost(g, SEG * 0.5, top);
    this._bakeBrazierPost(g, SEG * 0.5, bot);
    this.tunnelStrip = c; this._tunnelW = W; this._tunnelH = H;
  },


  // The title / cold-open scene: an endless torch-lit corridor seen from far
  // off, the knight slowly striding forward. The whole thing scrolls left (he
  // walks right); pressing Begin gently pushes the camera in toward him.
  _drawTunnelScene(ctx) {
    if (!this.tunnelStrip || this._tunnelW !== this.vw || this._tunnelH !== this.vh) this._buildTunnel();
    const W = this.vw, H = this.vh, { SEG, top, bot, torchY } = this._tunnel;
    const scroll = this.tunnelScroll;
    const off = ((scroll % SEG) + SEG) % SEG;
    const hx = W * 0.46, hy = (top + bot) / 2 + 6;

    // far view by default; Begin eases a slow push-in toward the knight
    ctx.fillStyle = '#06040c'; ctx.fillRect(0, 0, W, H);   // void fills the whole frame
    ctx.save();
    if (this.state === 'intro') {
      const z = 1 + Math.min(0.3, this.introT * 0.13);     // gentle dolly-in
      ctx.translate(hx, hy); ctx.scale(z, z); ctx.translate(-hx, -hy);
    }

    // the corridor is finite during the intro: it ends at an archway (endSx),
    // beyond which a wide open chamber waits. In the title it runs forever.
    const endSx = (this.state === 'intro' && this.introEnd != null) ? this.introEnd - scroll : Infinity;

    // open chamber first (behind the arch), then the corridor clipped to the arch.
    // The chamber is BAKED once and blitted, so its flagstone grime never flickers.
    if (endSx < W) {
      if (!this.openingBg || this._openingW !== W || this._openingH !== H) this._buildOpening();
      ctx.drawImage(this.openingBg, Math.round(endSx), 0);
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, Math.max(0, Math.min(W, endSx)), H); ctx.clip();
    for (let x = -off; x < W + SEG; x += SEG) ctx.drawImage(this.tunnelStrip, Math.round(x), 0);
    ctx.restore();
    // a heavy darkness veil — it all lives in shadow
    ctx.fillStyle = 'rgba(5,3,10,0.7)'; ctx.fillRect(0, 0, W, H);

    // on-screen torches (one per slice, on each wall), only those before the arch.
    // Flicker is keyed to WORLD position so it doesn't strobe as it scrolls past.
    const torches = [];
    for (let x = -off; x < W + SEG; x += SEG) {
      const tx = x + SEG * 0.5; if (tx > endSx - 12) continue;
      const world = tx + scroll;                           // stable per physical torch
      torches.push([tx, torchY.top, world], [tx, torchY.bot, world + 53]);
    }

    // additive light pass: warm, dim torch pools + a soft glow on the hero
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const cache = this._glowCache || (this._glowCache = new Map());
    const glow = (x, y, r, col, a) => {
      const rr = Math.round(r), key = rr + '|' + col;
      let grd = cache.get(key);
      if (!grd) { grd = ctx.createRadialGradient(0, 0, 0, 0, 0, rr); grd.addColorStop(0, col); grd.addColorStop(1, 'rgba(0,0,0,0)'); cache.set(key, grd); }
      ctx.globalAlpha = a; ctx.fillStyle = grd;
      ctx.translate(x, y); ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.fill(); ctx.translate(-x, -y);
    };
    for (const [tx, ty, world] of torches) {
      const fl = 0.9 + 0.1 * Math.sin(this.titleT * 2.4 + world * 0.05);   // slow, gentle
      glow(tx, ty, 130, '#ffae46', 0.28 * fl);
    }
    if (endSx < W) {                                       // braziers framing the corridor mouth
      const fl = 0.9 + 0.1 * Math.sin(this.titleT * 2.4);
      glow(endSx - 4, top, 150, '#ffae46', 0.3 * fl);
      glow(endSx - 4, bot, 150, '#ffae46', 0.3 * fl);
    }
    glow(hx, hy - 10, 96, '#ffd28a', 0.14);
    ctx.restore();

    // torch flames on top of their pools
    for (const [tx, ty, world] of torches) this._tunnelFlame(ctx, tx, ty, world);
    if (endSx < W) { this._tunnelFlame(ctx, endSx - 4, top, scroll); this._tunnelFlame(ctx, endSx - 4, bot, scroll + 99); }

    // the knight, far off, walking slowly and carefully into the dark
    const cyc = this.titleT * 1.7;                          // slow gait
    const bob = Math.abs(Math.sin(cyc * Math.PI)) * 1.4;
    const frame = cyc % 1 < 0.5 ? 'walkA' : 'walkB';
    ctx.save();
    ctx.globalAlpha = 0.45; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(hx, hy + 13, 13, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // he carries the last light down the corridor — a warm breathing aura + embers
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const lr = 92 + 7 * Math.sin(this.titleT * 2.1);
    const lg = ctx.createRadialGradient(hx, hy - 26, 6, hx, hy - 26, lr);
    lg.addColorStop(0, 'rgba(255,190,110,0.34)'); lg.addColorStop(0.55, 'rgba(220,120,50,0.13)'); lg.addColorStop(1, 'rgba(120,40,0,0)');
    ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(hx, hy - 26, lr, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 9; i++) {                         // embers rising off the light
      const ph = ((this.titleT * (0.32 + (i % 3) * 0.11)) + i * 0.37) % 1;
      const ex = hx + Math.sin(i * 2.3 + this.titleT * 1.4) * (16 + i * 4);
      ctx.globalAlpha = (1 - ph) * 0.55;
      ctx.fillStyle = i % 3 ? '#ffb163' : '#ffe1a8';
      ctx.fillRect(ex | 0, (hy - 10 - ph * 86) | 0, 2, 2);
    }
    ctx.restore(); ctx.globalAlpha = 1;
    drawSprite(ctx, 'knight', frame, hx, hy - bob, false, 1.5);

    ctx.restore();   // end push-in
  },


  // Bake the chamber beyond the corridor mouth ONCE: a wide, dark catacomb floor
  // that opens up taller than the passage and fades into depth, framed by stone
  // jambs and a smashed, rotting door — so when Level 1 dissolves in over it, he
  // is already standing in a ruined open space. Baking kills the live-paint flicker.
  _buildOpening() {
    const W = this.vw, H = this.vh, b = biomeForLevel(1);
    const { top, bot } = this._tunnel;
    const oTop = Math.round(H * 0.12), oBot = Math.round(H * 0.95);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    // chamber floor
    const grd = g.createLinearGradient(0, oTop, 0, oBot);
    grd.addColorStop(0, b.ground[0]); grd.addColorStop(1, b.ground[1]);
    g.fillStyle = grd; g.fillRect(0, oTop, W, oBot - oTop);
    if (b.detail) {                                        // flagstone grime — baked, so it never flickers
      g.save(); g.beginPath(); g.rect(0, oTop, W, oBot - oTop); g.clip();
      g.translate(0, oTop); b.detail(g, W, oBot - oTop); g.restore();
    }
    // depth: the far side of the room sinks into black
    const dg = g.createLinearGradient(0, 0, W, 0);
    dg.addColorStop(0, 'rgba(0,0,0,0)'); dg.addColorStop(0.6, 'rgba(2,1,6,0.5)'); dg.addColorStop(1, 'rgba(2,1,6,0.96)');
    g.fillStyle = dg; g.fillRect(0, oTop, W, oBot - oTop);
    // stone jambs above & below the passage opening (continue the corridor walls)
    g.fillStyle = b.wall; g.fillRect(0, 0, 16, top + 6); g.fillRect(0, bot - 6, 16, H - bot + 6);
    g.fillStyle = b.cap; g.fillRect(0, top - 3, 20, 7); g.fillRect(0, bot - 4, 20, 7);
    this._bakeRuinedDoor(g, top, bot);
    this.openingBg = c; this._openingW = W; this._openingH = H;
  },


  // A long-rotted wooden door, long since broken inward — splintered planks
  // still hang from the lintel and jut from the sill, the middle smashed open,
  // debris scattered across the threshold. We're entering a sealed, ruined place.
  _bakeRuinedDoor(g, top, bot) {
    const dh = bot - top, woodDk = '#241a0e', wood = '#3a2a18', woodHi = '#4d3a22';
    const iron = '#2b2b33', rivet = '#454552';
    const plank = (x, y, w, h, splinterDown) => {
      g.fillStyle = wood; g.fillRect(x, y, w, h);
      g.fillStyle = woodHi; g.fillRect(x, y, 2, h);                 // grain highlight
      g.fillStyle = woodDk; g.fillRect(x + w - 2, y, 2, h);         // grain shadow
      // jagged splintered break at one end
      const sy = splinterDown ? y + h : y;
      g.fillStyle = wood;
      for (let i = 0; i < w; i += 2) {
        const len = (3 + ((i * 7 + x) % 5)) * (splinterDown ? 1 : -1);
        g.fillRect(x + i, splinterDown ? sy : sy + len, 2, Math.abs(len));
      }
    };
    g.save();
    // planks hanging down from the top lintel, broken at the bottom
    plank(3, top, 7, dh * 0.46, true);
    plank(12, top, 7, dh * 0.30, true);
    plank(21, top, 6, dh * 0.52, true);
    // an iron band bracing the hanging planks, with rivets
    g.fillStyle = iron; g.fillRect(2, top + dh * 0.16, 26, 4);
    g.fillStyle = rivet; g.fillRect(4, top + dh * 0.16 + 1, 2, 2); g.fillRect(24, top + dh * 0.16 + 1, 2, 2);
    // stub planks rising from the bottom sill, broken at the top
    plank(5, bot - dh * 0.34, 7, dh * 0.34, false);
    plank(20, bot - dh * 0.22, 6, dh * 0.22, false);
    // a plank fallen across the gap at an angle
    g.translate(15, top + dh * 0.5); g.rotate(0.5);
    g.fillStyle = woodDk; g.fillRect(-3, -2, 30, 6);
    g.fillStyle = wood; g.fillRect(-3, -2, 30, 2);
    g.restore();
    // splinters & debris scattered on the floor just inside the threshold
    g.fillStyle = woodDk;
    const debris = [[30, top + dh * 0.62, 5, 2], [40, bot - dh * 0.3, 6, 2], [26, bot - 8, 4, 2],
      [48, top + dh * 0.5, 3, 2], [34, top + dh * 0.4, 4, 2]];
    for (const [x, y, w, h] of debris) { g.fillRect(x, y, w, h); g.fillStyle = wood; g.fillRect(x, y, w, 1); g.fillStyle = woodDk; }
  },


  _tunnelFlame(ctx, x, y, world) {
    const f = this.titleT * 4 + world * 0.1;               // calm flicker, world-anchored
    const h = 11 + Math.sin(f) * 2 + Math.sin(f * 1.7) * 1.2;
    const cy = y - 4;
    ctx.save();
    const g1 = ctx.createRadialGradient(x, cy - h * 0.3, 1, x, cy, h);
    g1.addColorStop(0, '#ffe9b0'); g1.addColorStop(0.5, '#ff9a32'); g1.addColorStop(1, 'rgba(180,70,10,0)');
    ctx.fillStyle = g1;
    ctx.beginPath();
    ctx.moveTo(x - 5, cy + 2);
    ctx.quadraticCurveTo(x - 4, cy - h * 0.6, x, cy - h);
    ctx.quadraticCurveTo(x + 4, cy - h * 0.6, x + 5, cy + 2);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  },


  // The cut into Level 1: an iris of darkness snaps shut on the knight, the
  // level is swapped in under full black, then the iris opens in the new room.
  // No crossfade, no double-image — a hard blink that the dark motivates.
  _drawIntroCut(ctx) {
    if (!this.introCut) return;
    const { t, dur } = this.introCut, half = dur * 0.42;
    const c = t < half ? t / half : 1 - (t - half) / (dur - half);   // 0..1 darkness
    const cl = Math.max(0, Math.min(1, c));
    const W = this.vw, H = this.vh, cx = W * 0.48, cy = H * 0.5;
    const maxR = Math.hypot(W, H) * 0.62, feather = 80;
    const r = (1 - cl) * maxR;
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r + feather);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(Math.max(0, Math.min(1, r / (r + feather))), 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.save(); ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H); ctx.restore();
  },


  _updateIntro(dt) {
    this.introT += dt;
    // a slow, careful walk that only gently gathers pace
    const speed = 56 + Math.min(150, this.introT * 60);
    this.tunnelScroll += speed * dt;
    // the archway's on-screen x; once he's stepped well past it (into the open
    // chamber) we blend into Level 1 from there — not from mid-corridor.
    const hx = this.vw * 0.46;
    const endSx = this.introEnd - this.tunnelScroll;
    if (!this.introFired && (endSx < hx - 90 || this.introT > 6.5)) {
      this.introFired = true;
      // the dark blinks shut around him; Level 1 is swapped in under full black
      // (handled by the introCut tick), then the iris opens in the new room.
      this.introCut = { t: 0, dur: 0.62, fired: false };
    }
  },
};
