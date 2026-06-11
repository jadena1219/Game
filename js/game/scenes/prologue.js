// The storybook prologue.
// Split from game.js — method bodies are verbatim; attached to Game.prototype in core.js.
import { Assets } from '../../assets.js';
import { Sound } from '../../audio.js';
import { drawSprite } from '../../sprite.js';

export const prologueMethods = {

  // The cold open: the title lifts away and the knight walks on down the
  // corridor. An archway and a wide chamber scroll into view ahead; he steps
  // through the opening, and only then does Level 1 blend in beneath him.
  beginIntro(heroId = 'knight') {
    if (this.state !== 'title') return;
    this.heroId = heroId;
    this.state = 'intro';
    this.introT = 0;
    this.introFired = false;
    // the corridor mouth sits a fixed distance ahead (in world/scroll units)
    this.introEnd = this.tunnelScroll + this.vw * 1.15;
    this.ui.swipeTitleAway();           // CSS lift-and-blur on the title overlay
  },


  // ---------- The Prologue: an animated legend told before the descent ----------
  // Plays in full the first time; afterwards Begin skips straight to the Shrine
  // (the title screen offers a Replay button, which passes force=true).
  startPrologue(force = false) {
    if (this.state !== 'title') return;
    let seen = false;
    try { seen = localStorage.getItem('kls_seen_intro') === '1'; } catch (e) { /* */ }
    if (seen && !force) { this.ui.swipeTitleAway(); this.startShrine(); return; }
    this.heroId = 'knight';
    this.prologue = { i: 0, t: 0, beats: [
      { lines: ['The kingdom stood in gold,', 'and the King ruled it well —', 'just, and beloved by all.'], dur: 9.0 },
      { lines: ['Then the deep woke.', 'A hunger climbed from below.', 'Fire took the towers. The light failed.'], dur: 9.0 },
      { lines: ['At the brink of ruin, the King knelt', 'to the dark, and struck a bargain:', 'the realm spared — for the price of his finest blade.'], dur: 10.5 },
      { lines: ['He had raised that blade from an orphan boy.', 'He loved him as a son.', 'And he sent that son into the dark to save him —', 'knowing what waited below.'], dur: 11.5 },
      { lines: ['You are that son.', 'You do not yet know the truth.', 'You know only your oath.', 'So you descend.'], dur: 11.0 },
    ] };
    this.state = 'prologue';
    this._tapped = false;
    Sound.setScene('camp');
    this.ui.swipeTitleAway();
  },


  _endPrologue() { this.prologue = null; try { localStorage.setItem('kls_seen_intro', '1'); } catch (e) { /* */ } this.state = 'title'; this.startShrine(); },


  _updatePrologue(dt) {
    const pr = this.prologue; pr.t += dt;
    if (this._tapped) { this._tapped = false; pr.i++; pr.t = 0; if (pr.i >= pr.beats.length) return this._endPrologue(); Sound.setScene(pr.i >= 2 ? 'boss' : 'camp'); return; }
    if (pr.t >= pr.beats[pr.i].dur) { pr.i++; pr.t = 0; if (pr.i >= pr.beats.length) return this._endPrologue(); Sound.setScene(pr.i >= 2 ? 'boss' : 'camp'); }
  },


  _renderPrologue(ctx) {
    const pr = this.prologue, W = this.vw, H = this.vh, b = pr.beats[pr.i];
    ctx.clearRect(0, 0, W, H);
    const fin = Math.min(1, pr.t / 0.7), fout = Math.min(1, (b.dur - pr.t) / 0.7);
    const a = Math.max(0, Math.min(fin, fout));
    this._drawPrologueArt(ctx, pr.i, a);
    // a dark band so the narration always reads
    const band = ctx.createLinearGradient(0, H * 0.6, 0, H);
    band.addColorStop(0, 'rgba(0,0,0,0)'); band.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = band; ctx.fillRect(0, H * 0.6, W, H * 0.4); ctx.restore();
    // narration — lines fade in, staggered
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const baseY = H * 0.74, lh = 26;
    b.lines.forEach((line, k) => {
      const la = Math.max(0, Math.min(1, (pr.t - (0.9 + k * 1.5)) / 0.8)) * a;
      if (la <= 0) return;
      ctx.globalAlpha = la; ctx.font = '600 16px "Silkscreen", monospace';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.strokeText(line, W / 2, baseY + k * lh);
      ctx.fillStyle = pr.i >= 2 ? '#e7d2c4' : '#fff3df'; ctx.fillText(line, W / 2, baseY + k * lh);
    });
    if (pr.t > 1.2) { ctx.globalAlpha = 0.4 * a; ctx.font = '10px "Silkscreen", monospace'; ctx.fillStyle = '#fff'; ctx.fillText('tap to continue', W / 2, H * 0.955); }
    ctx.restore(); ctx.globalAlpha = 1;
    this._drawPlunge(ctx);               // the fall from the title camp resolves here
    this._drawTransition(ctx);
  },


  _drawPrologueArt(ctx, i, a) {
    const W = this.vw, H = this.vh, t = this.time, pt = this.prologue.t;
    const PA = Assets.prologueArt || {};
    // blit an image (sprite canvas OR loaded PNG) sized to a target on-screen height
    const blit = (img, cx, by, targetH) => { if (!img) return; const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height; if (!ih) return; const s = targetH / ih; ctx.imageSmoothingEnabled = true; ctx.drawImage(img, Math.round(cx - iw * s / 2), Math.round(by - targetH), Math.round(iw * s), Math.round(targetH)); };
    ctx.save(); ctx.globalAlpha = a;
    if (i === 0) {                                            // the realm, golden
      this._drawKingdomScene(ctx, false);
    } else if (i === 1) {                                     // the rising dark
      this._drawKingdomScene(ctx, true);
    } else if (i === 2) {                                     // the bargain
      ctx.fillStyle = '#0b0712'; ctx.fillRect(0, 0, W, H);
      const cx = W * 0.5, baseY = H * 0.72;
      const rise = (u => 1 - Math.pow(1 - u, 3))(Math.min(1, pt / 3.4));   // easeOutCubic emergence
      const pg = ctx.createRadialGradient(cx, baseY + 24, 4, cx, baseY + 24, 200 + 130 * rise); pg.addColorStop(0, `rgba(210,30,16,${0.32 + 0.30 * rise})`); pg.addColorStop(1, 'rgba(40,0,0,0)'); ctx.fillStyle = pg; ctx.fillRect(0, 0, W, H);
      this._drawDemonRise(ctx, cx, baseY, H * 0.54, rise, t, pt);          // climbs up out of the ground
      blit(PA.king, cx - W * 0.26, baseY, H * 0.13);          // the King, small before it
      drawSprite(ctx, 'knight', 'idle', cx + W * 0.24, baseY, false, 1.3);   // the price
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; const sg = 0.4 + 0.4 * Math.sin(t * 3);
      ctx.strokeStyle = `rgba(225,30,20,${sg * rise})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx + W * 0.24, baseY - 26, 22, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    } else if (i === 3) {                                     // the oath at the gate
      ctx.fillStyle = '#0d0916'; ctx.fillRect(0, 0, W, H);
      const cx = W * 0.5, baseY = H * 0.72;
      ctx.fillStyle = '#191322'; ctx.fillRect(cx - 96, baseY - 150, 192, 150);
      ctx.fillStyle = '#060410'; ctx.beginPath(); ctx.moveTo(cx - 40, baseY); ctx.lineTo(cx - 40, baseY - 84); ctx.arc(cx, baseY - 84, 40, Math.PI, 0); ctx.lineTo(cx + 40, baseY); ctx.closePath(); ctx.fill();
      const tg = ctx.createRadialGradient(cx, baseY - 46, 4, cx, baseY - 46, 130); tg.addColorStop(0, 'rgba(120,40,30,0.35)'); tg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = tg; ctx.fillRect(0, 0, W, H);
      blit(PA.king, cx - W * 0.16, baseY, H * 0.16);
      ctx.fillStyle = `rgba(180,220,255,${0.4 + 0.6 * Math.abs(Math.sin(t * 1.6))})`; ctx.fillRect(cx - W * 0.16 - 6, baseY - 48, 2, 3);   // a tear
      drawSprite(ctx, 'knight', 'idle', cx + W * 0.14, baseY, true, 1.45);
    } else {                                                  // the descent
      ctx.fillStyle = '#0a0610'; ctx.fillRect(0, 0, W, H);
      const cx = W * 0.5, baseY = H * 0.5, k = Math.min(1, pt / 4.5);
      ctx.fillStyle = '#15101e'; ctx.fillRect(cx - 64, baseY - 100, 128, 100);
      ctx.fillStyle = '#04020a'; ctx.beginPath(); ctx.moveTo(cx - 34, baseY); ctx.lineTo(cx - 34, baseY - 64); ctx.arc(cx, baseY - 64, 34, Math.PI, 0); ctx.lineTo(cx + 34, baseY); ctx.closePath(); ctx.fill();
      const rg = ctx.createRadialGradient(cx, baseY + 30, 4, cx, baseY + 30, 170); rg.addColorStop(0, 'rgba(200,30,16,0.5)'); rg.addColorStop(1, 'rgba(40,0,0,0)'); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rg; ctx.fillRect(0, baseY - 30, W, H); ctx.restore();
      drawSprite(ctx, 'knight', 'idle', cx, baseY - 4 + k * 70, false, 1.4 * (1 - 0.4 * k));
      ctx.fillStyle = `rgba(0,0,0,${k * 0.85})`; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore(); ctx.globalAlpha = 1;
  },


  // The Demon Lord's entrance. He climbs UP through a fixed ground line — the part
  // of him below it is erased on an offscreen buffer, so he genuinely emerges from
  // the floor rather than fading in place — out of a swelling infernal portal, with
  // embers/ash streaming off the seam and a flash + shock ring as his feet land.
  // `rise` is the eased 0..1 emergence; `pt` drives the one-shot landing pulse.
  _drawDemonRise(ctx, cx, groundY, targetH, rise, t, pt) {
    const img = (Assets.prologueArt || {}).demon || Assets.demonBig;
    if (!img) return;
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!ih) return;
    const s = targetH / ih, dw = Math.round(iw * s), dh = Math.round(targetH);
    const reveal = Math.max(0.02, rise);
    const bobAmt = Math.max(0, Math.min(1, (rise - 0.85) / 0.15));
    const bob = Math.sin(t * 1.6) * 2 * bobAmt;                   // subtle breathing once grounded
    const dx = Math.round(cx - dw / 2);
    const dyTop = Math.round(groundY - reveal * dh + bob);
    // 1) infernal portal pooled on the ground, swelling as he rises
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gr = dw * (0.42 + 0.26 * rise);
    const pg = ctx.createRadialGradient(cx, groundY, 2, cx, groundY, gr);
    pg.addColorStop(0, `rgba(255,128,46,${0.34 + 0.30 * rise})`);
    pg.addColorStop(0.45, `rgba(214,40,14,${0.22 + 0.20 * rise})`);
    pg.addColorStop(1, 'rgba(60,0,0,0)');
    ctx.fillStyle = pg; ctx.beginPath(); ctx.ellipse(cx, groundY, gr, gr * 0.30, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // 2) offscreen: draw him, then erase everything below the ground seam (soft band)
    if (!this._demonBuf) { this._demonBuf = document.createElement('canvas'); this._demonBx = this._demonBuf.getContext('2d'); }
    const buf = this._demonBuf, bx = this._demonBx;
    if (buf.width !== dw || buf.height !== dh) { buf.width = dw; buf.height = dh; }
    bx.clearRect(0, 0, dw, dh);
    bx.imageSmoothingEnabled = true;
    bx.drawImage(img, 0, 0, dw, dh);
    const seam = groundY - dyTop;                                 // ground line in buffer space
    const band = Math.max(10, dh * 0.09);
    bx.globalCompositeOperation = 'destination-out';
    const er = bx.createLinearGradient(0, seam - band, 0, seam + 2);
    er.addColorStop(0, 'rgba(0,0,0,0)'); er.addColorStop(1, 'rgba(0,0,0,1)');
    bx.fillStyle = er; bx.fillRect(0, Math.round(seam - band), dw, dh - Math.round(seam - band) + 2);
    bx.globalCompositeOperation = 'source-over';
    // 3) ember bloom hugging the seam so the fade reads as fire, not a cut
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const eg = ctx.createRadialGradient(cx, groundY, 2, cx, groundY, dw * 0.5);
    eg.addColorStop(0, `rgba(255,96,34,${0.26 + 0.18 * rise})`); eg.addColorStop(0.6, 'rgba(150,16,8,0.10)'); eg.addColorStop(1, 'rgba(70,0,0,0)');
    ctx.fillStyle = eg; ctx.fillRect(dx - 30, dyTop, dw + 60, dh); ctx.restore();
    // 4) the demon
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(buf, dx, dyTop);
    // 5) embers + ash streaming up off the seam
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 30; k++) {
      const sd = k * 12.9898, rnd = (o) => { const v = Math.sin(sd + o) * 43758.5453; return v - Math.floor(v); };
      const life = ((t * (0.4 + 0.3 * rnd(5))) + rnd(1)) % 1;
      const ex = cx + (rnd(2) - 0.5) * dw * 0.78 + Math.sin(t * 1.4 + k) * 5;
      const ey = groundY - life * dh * (0.4 + 0.3 * rise);
      const al = (1 - life) * (0.35 + 0.5 * rise);
      const sz = 1 + rnd(3) * 2.4;
      ctx.fillStyle = `rgba(255,${(110 + rnd(4) * 110) | 0},44,${al * 0.85})`;
      ctx.fillRect(Math.round(ex), Math.round(ey), Math.ceil(sz), Math.ceil(sz));
    }
    ctx.restore();
    // 6) one-shot landing flash + shock ring as his feet hit
    const lp = Math.max(0, 1 - Math.abs(pt - 3.5) / 0.45);
    if (lp > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const fr = dw * (0.3 + 0.9 * (1 - lp));
      const fg = ctx.createRadialGradient(cx, groundY, 2, cx, groundY, fr);
      fg.addColorStop(0, `rgba(255,180,90,${0.5 * lp})`); fg.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = fg; ctx.fillRect(cx - fr, groundY - fr, fr * 2, fr * 2);
      ctx.strokeStyle = `rgba(255,150,70,${0.6 * lp})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(cx, groundY, fr, fr * 0.32, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  },


  // The kingdom horizon — uses assets/prologue/kingdom.png if you drop it in,
  // otherwise a detailed procedural castle-city. `fire` burns/darkens it.
  _drawKingdomScene(ctx, fire) {
    const W = this.vw, H = this.vh, t = this.time, horizon = H * 0.66;
    const k = fire ? Math.min(1, this.prologue.t / 2.6) : 0;
    const img = Assets.kingdomImg, haveImg = img && img.complete && img.naturalWidth;
    if (haveImg) {
      // fit the panorama to the width, then EDGE-EXTEND: stretch its top row up to
      // fill the sky and its bottom row down to fill the ground, so it blends into
      // the screen seamlessly (no letterbox, no colour mismatch).
      const iw = img.naturalWidth, ih = img.naturalHeight;
      const OVER = 1.08, NUDGE = 0.03;                                       // overscan + a small rightward nudge to centre the castle on the text
      const dw = W * OVER, dh = dw * ih / iw, dx = Math.round((W - dw) / 2 + W * NUDGE);
      // tile the three regions edge-to-edge with INTEGER boundaries (no overlap,
      // no gap) so they never seam — even mid-fade. The sky/ground bleeds use the
      // image's own top/bottom row (same horizontal mapping) so the colours match.
      const dy = Math.max(0, Math.round(horizon - dh * 0.82)), by = Math.min(H, Math.round(dy + dh));
      ctx.imageSmoothingEnabled = true;
      if (dy > 0) ctx.drawImage(img, 0, 0, iw, 1, dx, 0, dw, dy);            // sky (top row, stretched up)
      ctx.drawImage(img, dx, dy, dw, by - dy);                              // the kingdom itself
      if (by < H) ctx.drawImage(img, 0, ih - 1, iw, 1, dx, by, dw, H - by);  // ground (bottom row, stretched down)
    } else {
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      if (!fire) { sky.addColorStop(0, '#e0a84e'); sky.addColorStop(1, '#f4e0a4'); }
      else { sky.addColorStop(0, `rgb(${(28 + 80 * (1 - k)) | 0},${(12 + 44 * (1 - k)) | 0},${(14 + 18 * (1 - k)) | 0})`); sky.addColorStop(1, `rgb(${(150 + 70 * (1 - k)) | 0},${(60 + 80 * (1 - k)) | 0},${(34 + 36 * (1 - k)) | 0})`); }
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, horizon);
      if (!fire) { const s = ctx.createRadialGradient(W * 0.5, horizon - 4, 4, W * 0.5, horizon - 4, 220); s.addColorStop(0, 'rgba(255,248,222,0.55)'); s.addColorStop(1, 'rgba(255,232,176,0)'); ctx.fillStyle = s; ctx.fillRect(0, 0, W, horizon + 50); }
      this._drawKingdomProc(ctx, horizon, fire);
      ctx.fillStyle = fire ? '#160c08' : '#1c1408'; ctx.fillRect(0, horizon, W, H - horizon);
    }
    if (!fire) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < 24; i++) { const ph = ((t * 0.16) + i * 0.04) % 1; ctx.globalAlpha = (1 - ph) * 0.4; ctx.fillStyle = '#ffe9a8'; ctx.fillRect((i * 53.7) % W, horizon - ph * horizon, 2, 2); } ctx.restore(); ctx.globalAlpha = 1; }
    if (fire) {
      ctx.save(); ctx.fillStyle = `rgba(120,24,10,${0.32 * k})`; ctx.fillRect(0, 0, W, H); ctx.restore();   // redden the gold
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const fg = ctx.createLinearGradient(0, horizon, 0, horizon - 140); fg.addColorStop(0, `rgba(255,90,20,${0.45 * k})`); fg.addColorStop(1, 'rgba(255,40,0,0)'); ctx.fillStyle = fg; ctx.fillRect(0, horizon - 140, W, 140);
      ctx.restore();
      ctx.fillStyle = 'rgba(18,12,12,0.5)';
      for (let i = 0; i < 7; i++) { const ph = ((t * 0.22) + i * 0.14) % 1; ctx.globalAlpha = (1 - ph) * 0.5 * k; ctx.beginPath(); ctx.arc(W * (0.16 + i * 0.11), horizon - 24 - ph * horizon * 0.85, 11 + ph * 18, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1; ctx.fillStyle = `rgba(0,0,0,${0.32 * k})`; ctx.fillRect(0, 0, W, H);
    }
  },


  // A symmetric castle-city skyline (fallback when no kingdom.png is provided).
  _drawKingdomProc(ctx, baseY, fire) {
    const W = this.vw, cx = W * 0.5, t = this.time;
    const body = fire ? '#1d110c' : '#3a2a1a', bodyD = fire ? '#100806' : '#281c11', back = fire ? '#2a1610' : '#4c3923', lit = fire ? null : '#ffcf6a', flag = fire ? '#7a1812' : '#9a3a30';
    const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.ceil(w), Math.ceil(h)); };
    // distant mountains
    ctx.fillStyle = fire ? '#241410' : '#5a4730';
    for (const mx of [W * 0.12, W * 0.88]) { for (let s = 0; s < 30; s++) R(mx - 30 + s, baseY - 30 + Math.abs(s - 15), 2, 30, fire ? '#241410' : '#5a4730'); }
    // far rooftop band
    for (let x = -10; x < W + 10; x += 15) { const h = 16 + ((x * 53) % 22); R(x, baseY - h, 15, h, back); }
    // curtain wall + crenellations + central gate
    const wallH = 40, wy = baseY - wallH; R(0, wy, W, wallH, bodyD);
    for (let x = 0; x < W; x += 13) R(x, wy - 5, 6, 5, bodyD);
    R(cx - 13, baseY - 28, 26, 28, body); ctx.fillStyle = '#06030a'; ctx.beginPath(); ctx.moveTo(cx - 9, baseY); ctx.lineTo(cx - 9, baseY - 18); ctx.arc(cx, baseY - 18, 9, Math.PI, 0); ctx.lineTo(cx + 9, baseY); ctx.closePath(); ctx.fill();
    // structures (symmetric), drawn outer→inner
    const tower = (x, w, h, roof) => {
      R(x - w / 2, baseY - h, w, h, body); R(x - w / 2, baseY - h, 1, h, bodyD);
      for (let cxx = x - w / 2; cxx < x + w / 2; cxx += 5) R(cxx, baseY - h - 4, 3, 4, body);   // crenellations
      if (roof) { for (let s = 0; s < w / 2 + 3; s++) R(x - (w / 2 + 3) + s, baseY - h - 4 - s, (w + 6) - 2 * s, 1, body); R(x, baseY - h - 4 - (w / 2 + 4), 1, 5, flag); R(x, baseY - h - 4 - (w / 2 + 4), 5 + Math.sin(t * 3 + x) * 1.5, 3, flag); }
      if (lit) for (let wy2 = baseY - h + 8; wy2 < baseY - 6; wy2 += 9) for (let wx = x - w / 2 + 3; wx < x + w / 2 - 2; wx += 7) R(wx, wy2, 2, 3, lit);
    };
    tower(cx - W * 0.40, 26, 56, true); tower(cx + W * 0.40, 26, 56, true);
    tower(cx - W * 0.28, 22, 78, false); tower(cx + W * 0.28, 22, 78, false);
    tower(cx - W * 0.14, 30, 104, true); tower(cx + W * 0.14, 30, 104, true);
    // central keep + great spire
    R(cx - 34, baseY - 120, 68, 120, body); R(cx - 34, baseY - 120, 1, 120, bodyD);
    for (let cxx = cx - 34; cxx < cx + 34; cxx += 6) R(cxx, baseY - 124, 4, 4, body);
    if (lit) for (let wy2 = baseY - 112; wy2 < baseY - 10; wy2 += 10) for (let wx = cx - 28; wx < cx + 26; wx += 8) R(wx, wy2, 2, 3, lit);
    R(cx - 9, baseY - 188, 18, 68, body);                                  // spire base
    for (let s = 0; s < 16; s++) R(cx - 9 + s * 0.56, baseY - 188 - s * 1.4, 18 - s * 1.12, 2, body);   // pointed spire
    R(cx, baseY - 214, 1, 8, flag); R(cx, baseY - 214, 7 + Math.sin(t * 3) * 1.5, 4, flag);
  },


  _drawCastle(ctx, cx, baseY, fire) {
    const col = fire ? '#1c1110' : '#241a12';
    ctx.fillStyle = col;
    ctx.fillRect(cx - 40, baseY - 70, 80, 70);
    for (let x = cx - 40; x < cx + 40; x += 12) ctx.fillRect(x, baseY - 78, 6, 8);
    for (const tx of [cx - 60, cx + 42]) {
      ctx.fillStyle = col; ctx.fillRect(tx, baseY - 92, 18, 92);
      for (let x = tx; x < tx + 18; x += 8) ctx.fillRect(x, baseY - 100, 5, 8);
      ctx.beginPath(); ctx.moveTo(tx - 2, baseY - 92); ctx.lineTo(tx + 9, baseY - 108); ctx.lineTo(tx + 20, baseY - 92); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#070507'; ctx.beginPath(); ctx.moveTo(cx - 9, baseY); ctx.lineTo(cx - 9, baseY - 16); ctx.arc(cx, baseY - 16, 9, Math.PI, 0); ctx.lineTo(cx + 9, baseY); ctx.closePath(); ctx.fill();
    ctx.fillStyle = fire ? '#7a1510' : '#b08a3a';
    for (const bx of [cx - 60 + 9, cx + 42 + 9]) { const w = Math.sin(this.time * 3 + bx) * 2; ctx.fillRect(bx - 1, baseY - 118, 1, 16); ctx.beginPath(); ctx.moveTo(bx, baseY - 118); ctx.lineTo(bx + 8 + w, baseY - 114); ctx.lineTo(bx, baseY - 110); ctx.closePath(); ctx.fill(); }
    if (fire) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const fg = ctx.createRadialGradient(cx, baseY - 24, 4, cx, baseY - 24, 110); fg.addColorStop(0, 'rgba(255,120,30,0.7)'); fg.addColorStop(0.5, 'rgba(255,60,10,0.3)'); fg.addColorStop(1, 'rgba(255,40,0,0)'); ctx.fillStyle = fg; ctx.fillRect(cx - 120, baseY - 120, 240, 130);
      ctx.restore();
      ctx.fillStyle = 'rgba(28,20,20,0.55)';
      for (let i = 0; i < 5; i++) { const ph = ((this.time * 0.3) + i * 0.2) % 1; ctx.globalAlpha = (1 - ph) * 0.5; ctx.beginPath(); ctx.arc(cx - 48 + i * 24 + Math.sin(this.time + i) * 6, baseY - 92 - ph * 100, 8 + ph * 12, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
  },


  _silKing(ctx, x, baseY, h, kneel) {
    const yb = baseY - (kneel ? 0 : 0), bodyTop = yb - h * 0.66;
    ctx.fillStyle = '#181320';
    ctx.beginPath(); ctx.moveTo(x - 11, yb); ctx.lineTo(x - 6, bodyTop); ctx.lineTo(x + 6, bodyTop); ctx.lineTo(x + 11, yb); ctx.closePath(); ctx.fill();   // robe
    ctx.fillRect(x - 4, yb - h, 8, h * 0.36);                                   // head/neck
    ctx.fillStyle = '#caa54a';
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x + i * 5 - 1, yb - h); ctx.lineTo(x + i * 5, yb - h - 5); ctx.lineTo(x + i * 5 + 1, yb - h); ctx.closePath(); ctx.fill(); }
    ctx.fillRect(x - 6, yb - h, 12, 2);
  },


  _silKnight(ctx, x, baseY, h, blade) {
    ctx.fillStyle = '#121019';
    ctx.fillRect(x - 5, baseY - h * 0.62, 10, h * 0.62);
    ctx.fillRect(x - 4, baseY - h, 8, h * 0.36);
    ctx.fillStyle = '#5a5a72'; ctx.fillRect(x - 4, baseY - h - 3, 1, 4); ctx.fillRect(x + 3, baseY - h - 3, 1, 4);
    ctx.fillStyle = '#74e0ff'; ctx.fillRect(x - 2, baseY - h * 0.82, 4, 1);
    if (blade) { ctx.save(); ctx.translate(x + 5, baseY - h * 0.5); ctx.rotate(-0.5); ctx.fillStyle = '#cfd6e2'; ctx.fillRect(-1, -h * 0.8, 2, h * 0.8); ctx.fillStyle = '#caa54a'; ctx.fillRect(-3, 0, 6, 2); ctx.restore(); }
  },


  _drawDemonShadow(ctx, cx, baseY, rise) {
    const top = baseY - 36 - rise * 78;
    ctx.fillStyle = '#080510';
    ctx.beginPath(); ctx.moveTo(cx - 74, baseY); ctx.quadraticCurveTo(cx - 52, top, cx - 22, top - 8); ctx.lineTo(cx + 22, top - 8); ctx.quadraticCurveTo(cx + 52, top, cx + 74, baseY); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - 22, top - 4); ctx.lineTo(cx - 36, top - 28 - rise * 12); ctx.lineTo(cx - 14, top - 10); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + 22, top - 4); ctx.lineTo(cx + 36, top - 28 - rise * 12); ctx.lineTo(cx + 14, top - 10); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; const eg = 0.5 + 0.5 * Math.sin(this.time * 4);
    ctx.fillStyle = `rgba(255,40,28,${0.75 * rise})`; ctx.fillRect(cx - 15, top + 2, 6, 4); ctx.fillRect(cx + 9, top + 2, 6, 4);
    ctx.fillStyle = `rgba(255,170,130,${0.9 * rise * eg})`; ctx.fillRect(cx - 14, top + 3, 2, 1); ctx.fillRect(cx + 10, top + 3, 2, 1);
    ctx.restore();
  },
};
