// The Lord's voice and the dungeon's whispers: interludes, dread watchers, camp toasts.
// Split from game.js — method bodies are verbatim; attached to Game.prototype in core.js.
import { Sound } from '../audio.js';

export const dialogueMethods = {

  // The Demon Lord's voice: black out, type his words in blood red, then fade
  // back into the dungeon (the camp). Runs as its own state, the field frozen.
  _beginInterlude(line) {
    const wrapped = this._wrapText(line, 24);                 // longer lines read horizontally
    const totalChars = wrapped.reduce((s, l) => s + l.length, 0);
    this.interlude = { line, wrapped, totalChars, shown: 0, phase: 'in', t: 0 };
    this.state = 'interlude';
    this._tapped = false;
    this.ui.showScreen(null);
  },


  _updateInterlude(dt) {
    const il = this.interlude; if (!il) return;
    il.t += dt;
    if (il.phase === 'in') {
      if (il.t >= 0.6 || this._tapped) { il.phase = 'type'; il.t = 0; this._tapped = false; }
    } else if (il.phase === 'type') {
      il.shown = Math.min(il.totalChars, il.shown + dt * 11);     // ~11 chars/sec — slow & ominous
      if (this._tapped && il.t > 0.25) { il.shown = il.totalChars; this._tapped = false; }  // tap = finish line
      if (il.shown >= il.totalChars) { il.phase = 'hold'; il.t = 0; this._tapped = false; }
    } else if (il.phase === 'hold') {
      // hold here forever — only a deliberate tap dismisses it
      if (this._tapped && il.t > 0.25) {
        this.interlude = null; this._tapped = false;
        this.interludeFade = { t: 0, dur: 0.7 };
        this.openCamp();                                            // built under black; the fade reveals it
      }
    }
  },


  // The Demon Lord's taunt: black out the field, then type his words across it
  // in blood red with a blinking cursor and a low red glow. Tap advances it.
  _drawInterlude(ctx) {
    const il = this.interlude; if (!il) return;
    const W = this.vw, H = this.vh;
    const cover = il.phase === 'in' ? Math.min(1, il.t / 0.6) : 1;
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${cover})`; ctx.fillRect(0, 0, W, H);
    if (il.phase === 'in') { ctx.restore(); return; }      // still fading to black; no text yet
    // a faint red breath of light behind the words
    const rg = ctx.createRadialGradient(W / 2, H * 0.46, 10, W / 2, H * 0.46, W * 0.7);
    rg.addColorStop(0, 'rgba(60,4,4,0.5)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);

    // HE IS NEARER EVERY ACT: the eyes above his words begin as distant embers
    // and end wide and lidless — and past the half, his horns shade into view
    {
      const depth = Math.min(1, Math.max(0, (this.level || 1) / 20));
      const br = 0.7 + 0.3 * Math.sin(this.time * 1.6);
      const ew = 5 + 22 * depth;
      const gap = ew * 2.4, eyY = H * 0.2, tilt = 0.3;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const s of [-1, 1]) {
        const ex = W / 2 + s * gap;
        const gr = ctx.createRadialGradient(ex, eyY, 1, ex, eyY, ew * 3.2);
        gr.addColorStop(0, `rgba(255,40,24,${((0.14 + 0.3 * depth) * br).toFixed(3)})`);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(ex, eyY, ew * 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.save();
        ctx.translate(ex, eyY); ctx.rotate(s * tilt);   // outer corners raised: malice
        ctx.fillStyle = `rgba(255,70,40,${((0.45 + 0.5 * depth) * br).toFixed(3)})`;
        ctx.beginPath(); ctx.ellipse(0, 0, ew, ew * 0.34, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(255,200,150,${(0.5 * br).toFixed(3)})`;
        ctx.beginPath(); ctx.ellipse(s * ew * 0.2, 0, ew * 0.3, ew * 0.16, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      if (depth > 0.45) {
        const ha = ((depth - 0.45) / 0.55) * 0.5 * br;
        ctx.strokeStyle = `rgba(120,10,8,${ha.toFixed(3)})`;
        ctx.lineWidth = ew * 0.5; ctx.lineCap = 'round';
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(W / 2 + s * gap * 1.7, eyY + ew);
          ctx.quadraticCurveTo(W / 2 + s * gap * 2.6, eyY - ew * 3.4, W / 2 + s * gap * 1.9, eyY - ew * 5);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // readable type — longer wrapped lines, sized to fit the width
    const lines = il.wrapped;
    ctx.font = '100px "Silkscreen", monospace';
    let longest = 1; for (const l of lines) longest = Math.max(longest, ctx.measureText(l).width);
    const sizeW = 100 * (W * 0.78) / longest;              // fill the width
    const sizeH = (H * 0.5) / (lines.length * 1.5);        // …or the height, whichever's smaller
    const size = Math.max(11, Math.min(sizeW, sizeH, 22));
    ctx.font = `${size}px "Silkscreen", monospace`;
    const lh = size * 1.5, cy = H * 0.46 - (lines.length - 1) * lh / 2;

    const shownN = Math.floor(il.shown);
    let counted = 0, cursorPlaced = false;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < lines.length; i++) {
      const full = lines[i];
      const start = counted, end = start + full.length;
      let vis = shownN <= start ? '' : (shownN < end ? full.slice(0, shownN - start) : full);
      counted = end;                                       // wrapped lines counted contiguously
      let text = vis;
      const blink = Math.floor(this.time * 2.5) % 2 === 0;
      if (!cursorPlaced && il.phase === 'type' && shownN < end && (vis.length || i === 0)) {
        if (blink) text = vis + '▌'; cursorPlaced = true;
      }
      if (il.phase === 'hold' && i === lines.length - 1 && blink) text = full + '▌';
      const y = cy + i * lh;
      ctx.shadowColor = '#ff2a1e'; ctx.shadowBlur = size * 0.5;
      ctx.lineWidth = Math.max(2, size * 0.06); ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(text, W / 2, y);
      ctx.fillStyle = '#e8241a'; ctx.fillText(text, W / 2, y);
      ctx.shadowBlur = 0;
    }
    // a quiet hint to move on
    if (il.phase === 'hold') {
      ctx.font = '9px "Silkscreen", monospace'; ctx.fillStyle = 'rgba(180,40,30,0.5)';
      ctx.fillText('tap to continue', W / 2, H * 0.9);
    }
    ctx.restore();
  },


  // The black veil fading out of a taunt, revealing the camp beneath.
  _drawInterludeFade(ctx) {
    if (!this.interludeFade) return;
    const a = Math.max(0, 1 - this.interludeFade.t / this.interludeFade.dur);
    ctx.save(); ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.fillRect(0, 0, this.vw, this.vh); ctx.restore();
  },


  _updateDread(dt) {
    // age & cull watchers; give them slow, occasional blinks
    for (const w of this.watchers) {
      w.t += dt;
      if (w.blinkT > 0) w.blinkT -= dt;
      else if (Math.random() < dt * 0.35) w.blinkT = 0.12;
    }
    if (this.watchers.length) this.watchers = this.watchers.filter((w) => w.t < w.dur);
    if (this.campWhisper) { this.campWhisper.t += dt; if (this.campWhisper.t >= this.campWhisper.dur) this.campWhisper = null; }

    const playing = this.state === 'playing' && this.countdown <= 0 && !this.cutscene;
    const inCamp = this.state === 'camp' && !this.descentJump;
    if ((!playing && !inCamp) || this.plunge || this.transition) return;
    const depth = this._depth();
    if (depth <= 0.04) return;

    // (eyes-in-the-dark "watchers" are disabled for now — revisit later)

    // intrusive whispers — only in the camp, where you decide whether to go on
    if (inCamp) {
      this._whisperT -= dt;
      if (this._whisperT <= 0 && !this.campWhisper) {
        this._whisperT = (15 - depth * 8) * (0.7 + Math.random() * 0.7);
        this._spawnCampWhisper(depth);
      }
    }
  },


  _spawnWatcher(depth) {
    const W = this.vw, H = this.vh;
    let sx, sy;
    const m = 0.05 + Math.random() * 0.12;
    if (Math.random() < 0.45) { sx = W * (Math.random() < 0.5 ? m : 1 - m); sy = H * (0.15 + Math.random() * 0.5); }
    else { sx = W * (0.12 + Math.random() * 0.76); sy = H * (0.11 + Math.random() * 0.26); }   // upper dark band
    const lerp = (a, b) => Math.round(a + (b - a) * depth);
    const color = `rgb(${lerp(150, 216)},${lerp(168, 32)},${lerp(188, 26)})`;   // pale slate → blood red
    // anchor to a WORLD position (cam + screen offset) so the eyes stay put in the
    // dark as the camera pans, instead of gliding along with the viewport.
    this.watchers.push({ x: this.cam.x + sx, y: this.cam.y + sy, t: 0, dur: 2.8 + Math.random() * 2.4,
      blinkT: 0, gap: 9 + Math.random() * 6, size: 2.2 + Math.random() * 1.2 + depth, color });
  },


  _spawnCampWhisper(depth) {
    const POOLS = [
      ['do you hear it?', 'deeper...', 'something stirs below.', 'you are not alone.', 'the dark remembers you.', 'come down.'],
      ['i see you.', 'they fell here too.', 'why do you still fight?', 'closer now.', 'you feel it, don’t you?', 'turn back. (you won’t.)'],
      ['i have been waiting.', 'you cannot turn back now.', 'give in.', 'your blade tires.', 'soon. so soon.', 'kneel.'],
    ];
    const tier = depth < 0.34 ? 0 : depth < 0.7 ? 1 : 2;
    const pool = POOLS[tier];
    const text = pool[(Math.random() * pool.length) | 0];
    this.campWhisper = { text, t: 0, dur: 4.6, fx: 0.3 + Math.random() * 0.4, fy: 0.2 + Math.random() * 0.22 };
    Sound.play('whisper');
  },


  _drawWatchers(ctx) {
    if (!this.watchers.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const w of this.watchers) {
      const k = w.t / w.dur;
      let a = Math.min(1, k * 6) * Math.min(1, (1 - k) * 4) * 0.85;
      if (w.blinkT > 0) a *= 0.04;
      const eye = (ex) => {
        const g = ctx.createRadialGradient(ex, w.y, 0, ex, w.y, w.size * 3.4);
        g.addColorStop(0, w.color); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = a * 0.85; ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(ex, w.y, w.size * 3.4, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = a; ctx.fillStyle = w.color;
        ctx.beginPath(); ctx.ellipse(ex, w.y, w.size * 0.62, w.size, 0, 0, Math.PI * 2); ctx.fill();
      };
      eye(w.x - w.gap / 2); eye(w.x + w.gap / 2);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  },


  _drawDread(ctx) {
    if (this.state !== 'playing' && this.state !== 'camp') return;
    const W = this.vw, H = this.vh, depth = this._depth();
    const breathe = 0.5 + 0.5 * Math.sin(this.time * 0.7);
    let strength = depth * (0.2 + 0.08 * breathe);
    // low-HP dread: the edges throb red, faster, as death nears
    const p = this.player; let low = 0;
    if (p && this.state === 'playing' && p.hp > 0 && p.hp < p.maxHP * 0.3) {
      low = (0.5 + 0.5 * Math.sin(this.time * 4.2)) * (1 - p.hp / (p.maxHP * 0.3));
    }
    const a = strength + low * 0.32;
    if (a < 0.02) return;
    const red = Math.round(18 + 80 * depth + 130 * low);
    const g = ctx.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.3, W / 2, H * 0.5, Math.max(W, H) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(${red},6,8,${Math.min(0.82, a)})`);
    ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
  },


  _drawCampWhisper(ctx) {
    const w = this.campWhisper; if (!w) return;
    const k = w.t / w.dur;
    const a = Math.min(1, k * 4) * Math.min(1, (1 - k) * 3) * 0.55;
    if (a <= 0) return;
    const x = this.vw * w.fx, y = this.vh * w.fy;
    ctx.save();
    ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '15px "Silkscreen", monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(w.text, x + 1, y + 1);
    ctx.fillStyle = '#a3140f'; ctx.fillText(w.text, x, y);
    ctx.restore();
  },


  // A small parchment toast that floats the outcome of an event choice, then fades.
  _drawCampToast(ctx) {
    const t = this.campToast; if (!t) return;
    const W = this.vw, p = t.t / t.dur;
    const a = p < 0.12 ? p / 0.12 : (p > 0.8 ? 1 - (p - 0.8) / 0.2 : 1);
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    ctx.font = '13px "Silkscreen", monospace';
    const lines = this._wrapText(t.text, 30);
    const lh = 20, padX = 16, padY = 12;
    let tw = 0; for (const l of lines) tw = Math.max(tw, ctx.measureText(l).width);
    const bw = Math.min(W - 24, tw + padX * 2), bh = lines.length * lh + padY * 2;
    const bx = (W - bw) / 2, by = this.vh * 0.12;
    ctx.fillStyle = 'rgba(14,10,20,0.9)'; this._roundRect(ctx, bx, by, bw, bh, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(176,107,255,0.55)'; ctx.lineWidth = 2; this._roundRect(ctx, bx, by, bw, bh, 8); ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e7dcc4';
    lines.forEach((l, i) => ctx.fillText(l, W / 2, by + padY + lh / 2 + i * lh));
    ctx.restore();
  },
};
