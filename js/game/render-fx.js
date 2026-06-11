// Painters for transient effects: particles, decals, fire/ice/storm fields.
// Split from game.js — method bodies are verbatim; attached to Game.prototype in core.js.
import { drawSprite } from '../sprite.js';

export const renderFxMethods = {

  _drawGib(ctx, fx) {
    const a = 1 - fx.t / fx.dur;
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    ctx.translate(fx.x, fx.y); ctx.rotate(fx.rot || 0);
    ctx.fillStyle = fx.color;
    const s = fx.size || 3;
    if (fx.shape === 'bone') { ctx.fillRect(-s, -1, s * 2, 2); ctx.fillRect(-s - 1, -2, 2, 4); ctx.fillRect(s - 1, -2, 2, 4); }
    else if (fx.shape === 'wisp') { ctx.beginPath(); ctx.ellipse(0, 0, s * 0.7, s * 1.8, 0, 0, Math.PI * 2); ctx.fill(); }
    else ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.restore();
  },


  _drawPuff(ctx, fx) {
    const prog = fx.t / fx.dur;
    const r = (fx.r0 || 4) + ((fx.r1 || 16) - (fx.r0 || 4)) * prog;
    ctx.save();
    ctx.globalAlpha = Math.max(0, (1 - prog) * 0.5);
    ctx.fillStyle = fx.color;
    ctx.beginPath(); ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },


  // A glowing additive mote — soft halo + bright core, with optional twinkle.
  _drawMote(ctx, fx) {
    const prog = fx.t / fx.dur;
    let a = prog < 0.2 ? prog / 0.2 : 1 - (prog - 0.2) / 0.8;   // ease in, fade out
    if (fx.twinkle) a *= 0.55 + 0.45 * Math.sin(this.time * 22 + fx.x);
    a = Math.max(0, a);
    const r = fx.r || 2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (fx.glow) {
      const g = ctx.createRadialGradient(fx.x, fx.y, 0, fx.x, fx.y, r * 3);
      g.addColorStop(0, fx.color); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = a * 0.5;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, r * 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = a;
    ctx.fillStyle = fx.color;
    ctx.beginPath(); ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },


  _drawDeathFx(ctx, fx) {
    const prog = fx.t / fx.dur, style = fx.style || 'collapse';
    ctx.save();
    let tint;
    ctx.translate(fx.x, fx.y);
    if (style === 'poof') {                    // imps/bombers: balloon out into smoke
      const s = 1 + prog * 0.45;
      ctx.globalAlpha = (1 - prog) * 0.85; ctx.scale(s, s);
      tint = { color: fx.tintCol || '#caa0e0', a: 0.4 + prog * 0.6 };
    } else if (style === 'topple') {           // ogres: lean over and fall
      ctx.translate(0, fx.r * 0.45 * prog);
      ctx.rotate(prog * 0.8 * (fx.faceLeft ? 1 : -1));
      ctx.scale(1 + prog * 0.2, 1 - prog * 0.4);
      ctx.globalAlpha = 1 - prog * 0.85; tint = { color: '#8a7a66', a: 0.3 + prog * 0.5 };
    } else if (style === 'implode') {          // mages: collapse to a bright point
      const s = Math.max(0.05, 1 - prog * 0.92);
      ctx.scale(s, s); ctx.globalAlpha = 1 - prog * prog;
      tint = { color: '#cfeaff', a: 0.5 + prog * 0.5 };
    } else {                                   // collapse: squash + dissolve (skeletons/boss/default)
      ctx.scale(1 + prog * 0.4, 1 - prog * 0.55);
      ctx.globalAlpha = (1 - prog) * 0.9;
      tint = { color: fx.boss ? '#ff8a5a' : '#dff0ff', a: 0.5 + prog * 0.5 };
    }
    ctx.translate(-fx.x, -fx.y);
    drawSprite(ctx, fx.sprite, 'idle', fx.x, fx.y, fx.faceLeft, 1, tint);
    ctx.restore();
  },


  _drawDecals(ctx) {
    const d = this.decals; if (!d || !d.length) return;
    const now = this.time;
    let w = 0;
    for (let i = 0; i < d.length; i++) {
      const dc = d[i];
      const age = now - dc.born;
      if (age >= dc.dur) continue;          // expired — compact away below
      d[w++] = dc;
      if (!this._inView(dc.x, dc.y, 60)) continue;
      // full strength for the first half-life, then a slow sink into the stone
      const k = age / dc.dur;
      const a = k < 0.5 ? 1 : 1 - (k - 0.5) / 0.5;
      ctx.save();
      ctx.translate(dc.x, dc.y);
      ctx.globalAlpha = a * 0.85;
      for (const pc of dc.pieces) {
        if (pc.ring) {                       // soft dark patch
          ctx.fillStyle = pc.col;
          ctx.beginPath(); ctx.ellipse(pc.x, pc.y, pc.ring, pc.ring * 0.45, 0, 0, Math.PI * 2); ctx.fill();
        } else if (pc.sigil) {               // arcane ring: glows young, dies dark
          const glow = Math.max(0, 1 - age / 3);
          ctx.strokeStyle = pc.col; ctx.lineWidth = 1.2;
          ctx.globalAlpha = a * (0.25 + glow * 0.6);
          ctx.beginPath(); ctx.ellipse(pc.x, pc.y, pc.sigil, pc.sigil * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
          for (let j = 0; j < 4; j++) {
            const aj = j * Math.PI / 2 + 0.6;
            ctx.fillStyle = pc.col;
            ctx.fillRect(pc.x + Math.cos(aj) * pc.sigil * 0.62 - 1, pc.y + Math.sin(aj) * pc.sigil * 0.28 - 1, 2, 2);
          }
          ctx.globalAlpha = a * 0.85;
        } else if (pc.blot) {
          ctx.fillStyle = pc.col;
          ctx.beginPath(); ctx.ellipse(pc.x, pc.y, pc.blot, pc.blot * 0.5, 0, 0, Math.PI * 2); ctx.fill();
        } else if (pc.skull) {
          ctx.fillStyle = pc.col;
          ctx.beginPath(); ctx.arc(pc.x, pc.y - 1, 2.6, 0, Math.PI * 2); ctx.fill();
          ctx.fillRect(pc.x - 2.6, pc.y, 5.2, 1.8);
        } else {
          ctx.save(); ctx.translate(pc.x, pc.y); ctx.rotate(pc.rot);
          ctx.fillStyle = pc.col; ctx.fillRect(-pc.w / 2, -pc.h / 2, pc.w, pc.h);
          ctx.restore();
        }
      }
      ctx.restore();
    }
    d.length = w;
    ctx.globalAlpha = 1;
  },


  _drawSpark(ctx, fx) {
    const a = 1 - fx.t / fx.dur;
    ctx.save();
    ctx.globalAlpha = a;
    if (fx.streak) {                      // motion-streak: a short line trailing the velocity
      ctx.strokeStyle = fx.col || '#fff'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(fx.x, fx.y);
      ctx.lineTo(fx.x - fx.vx * 0.035, fx.y - fx.vy * 0.035); ctx.stroke();
    } else {
      ctx.fillStyle = fx.col || '#fff3c0';
      ctx.fillRect(fx.x - 1.5, fx.y - 1.5, 3, 3);
    }
    ctx.restore();
  },


  // expanding white flash ring at the point of impact
  _drawHitRing(ctx, fx) {
    const p = fx.t / fx.dur, a = 1 - p;
    const r = fx.r * (0.3 + 0.7 * p);
    ctx.save();
    ctx.globalAlpha = a * 0.85;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1 + 3 * (1 - p);
    ctx.beginPath(); ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  },


  // a quick bright slash line carved across the struck foe
  _drawSlashMark(ctx, fx) {
    const p = fx.t / fx.dur, a = 1 - p;
    const grow = Math.min(1, p / 0.4), len = fx.len * (0.4 + 0.6 * grow);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(fx.x, fx.y); ctx.rotate(fx.angle);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 3.5 * (1 - p * 0.6);
    ctx.beginPath(); ctx.moveTo(-len / 2, 0); ctx.lineTo(len / 2, 0); ctx.stroke();
    ctx.restore();
  },


  _drawGhost(ctx, fx) {
    const prog = fx.t / fx.dur;
    ctx.save();
    ctx.globalAlpha = (1 - prog) * 0.5;
    drawSprite(ctx, fx.sprite || 'knight', fx.frame || 'idle', fx.x, fx.y, fx.faceLeft, 1, { color: '#aee6ff', a: 0.95 });
    ctx.restore();
  },


  _drawDashStreak(ctx, fx) {
    const prog = fx.t / fx.dur, a = 1 - prog;
    const dx = Math.cos(fx.a), dy = Math.sin(fx.a);
    const len = 30 + prog * 34;            // streak stretches out as it fades
    ctx.save();
    ctx.lineCap = 'round';
    ctx.shadowColor = '#7fd0ff'; ctx.shadowBlur = 12;
    // soft wide trail
    ctx.globalAlpha = a * 0.5; ctx.strokeStyle = '#7fd0ff'; ctx.lineWidth = 11 * a + 2;
    ctx.beginPath(); ctx.moveTo(fx.x - dx * len, fx.y - dy * len); ctx.lineTo(fx.x - dx * 6, fx.y - dy * 6); ctx.stroke();
    // bright core
    ctx.globalAlpha = a * 0.9; ctx.strokeStyle = '#eaffff'; ctx.lineWidth = 4 * a + 1;
    ctx.beginPath(); ctx.moveTo(fx.x - dx * len * 0.85, fx.y - dy * len * 0.85); ctx.lineTo(fx.x - dx * 4, fx.y - dy * 4); ctx.stroke();
    ctx.restore();
  },


  // Arrival tell: an expanding soul-ring + rising wisps where a foe enters the
  // floor — the dark announces what it gives up.
  _drawSpawnMark(ctx, fx) {
    const k = fx.t / fx.dur, a = (1 - k) * 0.9;
    if (a <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a;
    ctx.strokeStyle = fx.color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(fx.x, fx.y + 2, fx.r * (0.4 + k * 1.1), fx.r * (0.4 + k * 1.1) * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = a * 0.5;
    ctx.beginPath(); ctx.ellipse(fx.x, fx.y + 2, fx.r * (0.2 + k * 0.7), fx.r * (0.2 + k * 0.7) * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
    // wisps streaming up out of the mark
    ctx.fillStyle = fx.color;
    for (let i = 0; i < 4; i++) {
      const wx = fx.x + Math.sin(i * 2.4 + fx.x) * fx.r * 0.5;
      const wy = fx.y - k * (16 + i * 7);
      ctx.globalAlpha = a * (1 - i * 0.18);
      ctx.fillRect(wx - 1, wy - 1, 2, 2);
    }
    ctx.restore(); ctx.globalAlpha = 1;
  },


  // When only stragglers remain and they're off-screen, a pulsing chevron on the
  // screen edge points the way — no more wandering the dark for the last imp.
  _drawStragglerPing(ctx) {
    if (this.state !== 'playing' || this.cutscene || this.countdown > 0) return;
    if (this.spawnQueue.length || !this.enemies.length || this.enemies.length > 3) return;
    const m = 38, pulse = 0.6 + 0.4 * Math.sin(this.time * 6);
    for (const e of this.enemies) {
      const sx = e.x - this.cam.x, sy = e.y - this.cam.y;
      if (sx > -20 && sx < this.vw + 20 && sy > -20 && sy < this.vh + 20) continue;   // visible already
      const dx = sx - this.vw / 2, dy = sy - this.vh / 2;
      const k = Math.min((this.vw / 2 - m) / Math.max(1e-6, Math.abs(dx)), (this.vh / 2 - m) / Math.max(1e-6, Math.abs(dy)));
      const px = this.vw / 2 + dx * k, py = this.vh / 2 + dy * k;
      const col = (e.named && e.named.color) || (e.elite && e.affix && e.affix.color) || '#ff8a5a';
      ctx.save();
      ctx.translate(px, py); ctx.rotate(Math.atan2(dy, dx));
      ctx.globalAlpha = 0.85 * pulse;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-4, -7); ctx.lineTo(-1, 0); ctx.lineTo(-4, 7); ctx.closePath(); ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },


  // Cinderstep's burning footprints — animated pixel flames over an ember bed.
  _drawFireTrail(ctx, fx) {
    const k = fx.t / fx.dur;
    const a = Math.min(1, fx.t * 9) * Math.min(1, (1 - k) * 2);   // snap in, fade near the end
    if (a <= 0) return;
    const seed = fx.seed || 0;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // glowing ember bed on the floor
    const r = fx.r * (0.85 - 0.35 * k);
    const g = ctx.createRadialGradient(fx.x, fx.y, 0, fx.x, fx.y, r);
    g.addColorStop(0, `rgba(255,140,40,${0.3 * a})`); g.addColorStop(0.6, `rgba(200,50,10,${0.18 * a})`); g.addColorStop(1, 'rgba(60,8,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(fx.x, fx.y, r, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    // flickering pixel flame tongues
    const t = this.time * 15 + seed, cell = 2, tongues = 6, shrink = 1 - 0.55 * k;
    for (let i = 0; i < tongues; i++) {
      const flick = 0.45 + 0.55 * Math.sin(t + i * 1.7);
      const baseX = fx.x + (i - (tongues - 1) / 2) * 3 + Math.sin(t * 0.4 + i) * 1.4;
      const cols = Math.max(2, Math.round((5 - (i % 3)) * (0.6 + 0.9 * flick) * shrink));
      for (let cY = 0; cY < cols; cY++) {
        const f = cY / cols;                                       // 0 base .. 1 tip
        const col = f < 0.28 ? '#e23a12' : f < 0.55 ? '#ff7a2a' : f < 0.82 ? '#ffce5a' : '#fff2c0';
        const w = Math.max(1, Math.round((1 - f) * 4));
        ctx.globalAlpha = a * (1 - f * 0.45);
        ctx.fillStyle = col;
        ctx.fillRect(Math.round(baseX - w / 2), Math.round(fx.y - cY * cell - 2), w, cell);
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  },


  // One flickering pixel-flame tongue (shared by burning foes, lava, eruption).
  _flameColumn(ctx, x, baseY, h, seed, alpha) {
    const t = this.time, cell = 2;
    const flick = 0.55 + 0.45 * Math.sin(t * 13 + seed) + 0.22 * Math.sin(t * 27 + seed * 1.7);
    const cols = Math.max(2, Math.round(h * (0.55 + 0.5 * Math.max(0, flick)) / cell));
    for (let c = 0; c < cols; c++) {
      const f = c / cols;
      const col = f < 0.2 ? '#d8330e' : f < 0.45 ? '#ff6a1e' : f < 0.72 ? '#ffa828' : f < 0.9 ? '#ffe06b' : '#fff6d6';
      const w = Math.max(1, Math.round((1 - f) * 4));
      const sway = Math.sin(t * 10 + c * 0.4 + seed) * (1 + f * 3);
      ctx.globalAlpha = alpha * (1 - f * 0.35);
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(x - w / 2 + sway), Math.round(baseY - c * cell), w, cell);
    }
  },


  // Detailed living flames covering a burning foe (Emberbrand).
  _drawBurning(ctx, e) {
    const t = this.time, base = e.y + 1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gr = ctx.createRadialGradient(e.x, e.y - e.r * 0.7, 2, e.x, e.y - e.r * 0.7, e.r * 1.9);
    gr.addColorStop(0, 'rgba(255,140,40,0.4)'); gr.addColorStop(0.6, 'rgba(255,60,0,0.14)'); gr.addColorStop(1, 'rgba(255,40,0,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(e.x, e.y - e.r * 0.7, e.r * 1.9, 0, Math.PI * 2); ctx.fill();
    const tongues = Math.max(4, Math.round(e.r / 2.6));
    for (let i = 0; i < tongues; i++) {
      const fx = e.x + (i / (tongues - 1) - 0.5) * e.r * 1.7;
      const h = e.r * (1.6 + 0.9 * (0.5 + 0.5 * Math.sin(t * 9 + i * 1.9)));
      this._flameColumn(ctx, fx, base, h, i * 3.1 + e.x * 0.1, 0.9);
    }
    for (let i = 0; i < 5; i++) {
      const ph = (t * 1.2 + i * 0.21 + e.x * 0.1) % 1;
      ctx.globalAlpha = (1 - ph) * 0.8; ctx.fillStyle = i % 2 ? '#ffce5a' : '#ff7a2a';
      ctx.fillRect((e.x + Math.sin(t * 3 + i) * e.r) | 0, (e.y - e.r * 0.6 - ph * e.r * 2.4) | 0, 2, 2);
    }
    ctx.restore(); ctx.globalAlpha = 1;
  },


  // 🔥 the lingering lake of fire left by Eruption
  _drawLavaField(ctx, fx) {
    const k = fx.t / fx.dur, t = this.time, R = fx.r;
    const a = Math.min(1, fx.t * 3) * (k > 0.78 ? (1 - (k - 0.78) / 0.22) : 1);
    if (a <= 0) return;
    ctx.save();
    // molten pool
    ctx.globalAlpha = a;
    const g = ctx.createRadialGradient(fx.x, fx.y, 4, fx.x, fx.y, R);
    g.addColorStop(0, '#ffe49a'); g.addColorStop(0.3, '#ff7a2a'); g.addColorStop(0.7, '#c8200a'); g.addColorStop(1, 'rgba(70,8,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(fx.x, fx.y, R, R * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    // cooling-rock crust blotches drifting on the surface
    for (let i = 0; i < 8; i++) { const ang = i * 0.785 + t * 0.2, rr = R * 0.55 * ((i % 3) / 3 + 0.3); ctx.globalAlpha = a * 0.5; ctx.fillStyle = '#3a1408'; ctx.beginPath(); ctx.ellipse(fx.x + Math.cos(ang) * rr, fx.y + Math.sin(ang) * rr * 0.6, 8 + (i % 3) * 3, 5, 0, 0, Math.PI * 2); ctx.fill(); }
    // bubbling glow + flame tongues around the rim
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 12; i++) { const ph = (t * 0.6 + i * 0.09) % 1, ang = i * 2.39, rr = R * 0.72 * (0.3 + (i % 4) / 4); ctx.globalAlpha = a * (1 - Math.abs(ph - 0.5) * 2) * 0.8; ctx.fillStyle = '#ffe49a'; ctx.fillRect((fx.x + Math.cos(ang) * rr) | 0, (fx.y + Math.sin(ang) * rr * 0.6) | 0, 3, 3); }
    for (let i = 0; i < 9; i++) { const ang = (i / 9) * Math.PI * 2 + t * 0.1, rr = R * 0.8; this._flameColumn(ctx, fx.x + Math.cos(ang) * rr, fx.y + Math.sin(ang) * rr * 0.55, 14 + (i % 3) * 6, i * 2.7 + fx.x, a * 0.85); }
    this._flameColumn(ctx, fx.x, fx.y, 22, fx.x, a);
    ctx.restore(); ctx.globalAlpha = 1;
  },


  // A molten fissure cracked into the floor by the Dark Knight's slam: a dark
  // gouge with lava glowing up through it, breathing heat. Warning phase first
  // (a thin dark crack races out), then it ignites. Path baked at creation.
  _drawFissure(ctx, fx) {
    const t = this.time, pts = fx.pts;
    const warm = Math.max(0, Math.min(1, (fx.t - fx.warn) / 0.35));          // 0 = warning crack, 1 = fully molten
    const fade = fx.t > fx.dur - 1 ? Math.max(0, (fx.dur - fx.t)) : 1;       // die out over the last second
    const grow = Math.min(1, fx.t / fx.warn);                                // crack racing outward
    const nSeg = Math.max(2, Math.ceil((pts.length - 1) * grow) + 1);
    const path = () => { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < Math.min(pts.length, nSeg); i++) ctx.lineTo(pts[i].x, pts[i].y); };
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // the dark gouge in the stone
    ctx.globalAlpha = (0.5 + 0.4 * warm) * fade;
    ctx.strokeStyle = '#170703'; ctx.lineWidth = fx.w * (0.7 + 0.5 * warm); path(); ctx.stroke();
    if (warm > 0) {
      // lava glowing up through the crack, breathing
      const breathe = 0.75 + 0.25 * Math.sin(t * 5 + fx.seed);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55 * warm * fade * breathe;
      ctx.strokeStyle = '#c8200a'; ctx.lineWidth = fx.w * 0.8; path(); ctx.stroke();
      ctx.globalAlpha = 0.8 * warm * fade * breathe;
      ctx.strokeStyle = '#ff7a2a'; ctx.lineWidth = fx.w * 0.42; path(); ctx.stroke();
      ctx.globalAlpha = 0.9 * warm * fade * breathe;
      ctx.strokeStyle = '#ffe49a'; ctx.lineWidth = fx.w * 0.16; path(); ctx.stroke();
      // embers popping off the seam (deterministic per fissure via the baked seed)
      for (let i = 0; i < pts.length - 1; i++) {
        const ph = ((t * 0.7) + (fx.seed + i) * 0.37) % 1;
        const sx = pts[i].x + (pts[i + 1].x - pts[i].x) * ((fx.seed * 7 + i * 3.1) % 1);
        const sy = pts[i].y + (pts[i + 1].y - pts[i].y) * ((fx.seed * 7 + i * 3.1) % 1);
        ctx.globalAlpha = (1 - ph) * 0.8 * warm * fade;
        ctx.fillStyle = ph < 0.4 ? '#ffe49a' : '#ff7a2a';
        ctx.fillRect((sx | 0) + ((i % 2) ? 2 : -3), (sy - ph * 26) | 0, 2, 2);
      }
    }
    ctx.restore(); ctx.globalAlpha = 1;
  },


  // 🔥 the eruption burst — shockwave ring + a pillar of fire
  _drawErupt(ctx, fx) {
    const k = fx.t / fx.dur, a = 1 - k, R = fx.r;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const rr = R * Math.min(1, k * 1.7);
    ctx.globalAlpha = a; ctx.lineWidth = 7 * (1 - k) + 1; ctx.strokeStyle = `rgba(255,${(210 - 130 * k) | 0},120,${a})`;
    ctx.beginPath(); ctx.ellipse(fx.x, fx.y, rr, rr * 0.62, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = `rgba(255,255,255,${a * 0.8})`; ctx.beginPath(); ctx.ellipse(fx.x, fx.y, rr * 0.88, rr * 0.62 * 0.88, 0, 0, Math.PI * 2); ctx.stroke();
    const ph = (1 - k);
    for (let i = 0; i < 6; i++) this._flameColumn(ctx, fx.x + (i - 2.5) * 9, fx.y - 2, 30 + ph * 70 - Math.abs(i - 2.5) * 8, i * 4 + fx.x, a);
    ctx.restore(); ctx.globalAlpha = 1;
  },


  // ❄️ the freezing shockwave + radiating shards
  // CATACLYSM Act I — the rolling wall of flame, drawn as a travelling ring of
  // fire with tongues riding the rim.
  _drawFireWave(ctx, fx) {
    const r = fx.t * fx.speed, k = fx.t / fx.dur, a = 1 - k * k;
    if (a <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 30; ctx.strokeStyle = `rgba(255,110,30,${0.38 * a})`;
    ctx.beginPath(); ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 12; ctx.strokeStyle = `rgba(255,210,110,${0.6 * a})`;
    ctx.beginPath(); ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 26; i++) {
      const ang = (i / 26) * Math.PI * 2 + fx.t * 0.6;
      const fl = 0.6 + 0.4 * Math.sin(this.time * 17 + i * 2.3);
      const bx = fx.x + Math.cos(ang) * r, by = fx.y + Math.sin(ang) * r;
      const len = (16 + 14 * fl) * a;
      ctx.fillStyle = i % 2 ? `rgba(255,140,40,${0.7 * a})` : `rgba(255,220,120,${0.6 * a})`;
      ctx.beginPath();
      ctx.moveTo(bx - Math.sin(ang) * 5, by + Math.cos(ang) * 5);
      ctx.lineTo(bx + Math.cos(ang) * len * 0.4, by + Math.sin(ang) * len * 0.4 - len * 0.8);
      ctx.lineTo(bx + Math.sin(ang) * 5, by - Math.cos(ang) * 5);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  },


  // CATACLYSM Act III — a pillar of flame: a tightening aim-ring, then the column.
  _drawFirePillar(ctx, fx) {
    if (fx.t < fx.warn) {
      const wk = fx.t / fx.warn, wr = 30 * (1 - wk * 0.4) + 12;
      ctx.save();
      ctx.strokeStyle = `rgba(255,120,40,${0.4 + 0.4 * wk})`; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(fx.x, fx.y, wr, wr * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(255,90,30,${0.14 * wk})`;
      ctx.beginPath(); ctx.ellipse(fx.x, fx.y, 26, 12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    const pk = (fx.t - fx.warn) / (fx.dur - fx.warn);
    const a = 1 - pk * pk;
    const h = 120 * (pk < 0.25 ? pk / 0.25 : 1);          // erupts up fast, then gutters
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g2 = ctx.createRadialGradient(fx.x, fx.y, 2, fx.x, fx.y, 56);
    g2.addColorStop(0, `rgba(255,200,110,${0.5 * a})`); g2.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = g2; ctx.beginPath(); ctx.ellipse(fx.x, fx.y, 56, 24, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    this._flameColumn(ctx, fx.x, fx.y, h, fx.x * 0.37, a);
  },


  _drawFrostNova(ctx, fx) {
    const k = fx.t / fx.dur, a = 1 - k, rr = 560 * Math.min(1, k * 1.8);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a; ctx.lineWidth = 6 * (1 - k) + 1; ctx.strokeStyle = `rgba(200,240,255,${a})`;
    ctx.beginPath(); ctx.arc(fx.x, fx.y, rr, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = `rgba(255,255,255,${a * 0.85})`; ctx.beginPath(); ctx.arc(fx.x, fx.y, rr * 0.9, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 24; i++) { const ang = i * 0.2618, ix = fx.x + Math.cos(ang) * rr * 0.92, iy = fx.y + Math.sin(ang) * rr * 0.92; ctx.globalAlpha = a * 0.85; ctx.fillStyle = '#eaffff'; ctx.save(); ctx.translate(ix, iy); ctx.rotate(ang + Math.PI / 2); ctx.fillRect(-1, -5, 2, 10); ctx.restore(); }
    ctx.restore(); ctx.globalAlpha = 1;
  },


  // ⚡ the storm overlay covering the arena while Thunderstorm rages
  _drawStormOverlay(ctx, fx) {
    const k = fx.t / fx.dur, a = (k < 0.15 ? k / 0.15 : k > 0.8 ? (1 - k) / 0.2 : 1), W = this.vw, H = this.vh, t = this.time, ox = this.cam.x, oy = this.cam.y;
    ctx.save();
    ctx.fillStyle = `rgba(16,10,40,${0.4 * a})`; ctx.fillRect(ox, oy, W, H);
    ctx.strokeStyle = `rgba(195,182,255,${0.55 * a})`; ctx.lineWidth = 2;
    for (let i = 0; i < 80; i++) { const x = ox + ((i * 61.7) + t * 240) % (W + 60) - 30, y = oy + ((i * 47.3) + t * 980) % (H + 60) - 30; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 10, y + 24); ctx.stroke(); }
    ctx.restore();
  },


  _boltPath(ctx, x0, y0, x1, y1, seed) {
    ctx.beginPath(); ctx.moveTo(x0, y0); const segs = 9;
    for (let i = 1; i <= segs; i++) { const f = i / segs; const jx = i < segs ? Math.sin(seed + i * 1.7) * 26 * (1 - f) : 0; ctx.lineTo(x0 + (x1 - x0) * f + jx, y0 + (y1 - y0) * f); }
  },


  // ⚡ a colossal bolt crashing from the sky onto a foe
  _drawMegabolt(ctx, fx) {
    const k = fx.t / fx.dur, a = 1 - k, topY = this.cam.y - 24;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(170,140,255,${a * 0.5})`; ctx.lineWidth = 8 * a + 1; ctx.lineCap = 'round';
    this._boltPath(ctx, fx.x, topY, fx.x, fx.y, fx.seed); ctx.stroke();
    ctx.strokeStyle = `rgba(245,235,255,${a})`; ctx.lineWidth = 2.5;
    this._boltPath(ctx, fx.x, topY, fx.x, fx.y, fx.seed); ctx.stroke();
    const g = ctx.createRadialGradient(fx.x, fx.y, 0, fx.x, fx.y, 44); g.addColorStop(0, `rgba(225,205,255,${a})`); g.addColorStop(1, 'rgba(120,80,255,0)');
    ctx.globalAlpha = a; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(fx.x, fx.y, 44, 0, Math.PI * 2); ctx.fill();
    ctx.restore(); ctx.globalAlpha = 1;
  },


  _drawAbilityFx(ctx, fx) {
    const k = fx.kind;
    if (k === 'bolt') {
      const a = 1 - fx.t / fx.dur;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = '#bfe9ff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.shadowColor = '#7fd0ff'; ctx.shadowBlur = 10;
      ctx.beginPath();
      for (let i = 0; i < fx.pts.length - 1; i++) {
        const a0 = fx.pts[i], b0 = fx.pts[i + 1];
        ctx.moveTo(a0.x, a0.y);
        const mx = (a0.x + b0.x) / 2 + (Math.random() - 0.5) * 14;
        const my = (a0.y + b0.y) / 2 + (Math.random() - 0.5) * 14;
        ctx.lineTo(mx, my); ctx.lineTo(b0.x, b0.y);
      }
      ctx.stroke();
      ctx.restore();
    } else if (k === 'ring') {
      const prog = fx.t / fx.dur;
      ctx.save();
      ctx.globalAlpha = (1 - prog) * 0.9;
      ctx.strokeStyle = fx.color; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.r * (0.5 + 0.5 * prog), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    } else if (k === 'boom') {
      const prog = fx.t / fx.dur;
      ctx.save();
      const r = fx.r * (0.4 + 0.6 * prog);
      const g = ctx.createRadialGradient(fx.x, fx.y, 0, fx.x, fx.y, r);
      g.addColorStop(0, `rgba(255,230,150,${(1 - prog) * 0.95})`);
      g.addColorStop(0.6, `rgba(255,120,40,${(1 - prog) * 0.7})`);
      g.addColorStop(1, 'rgba(120,20,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else if (k === 'whirl') {
      const prog = fx.t / fx.dur;
      ctx.save();
      ctx.globalAlpha = (1 - prog) * 0.8;
      ctx.strokeStyle = '#dff0ff'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      const a0 = prog * Math.PI * 3;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.r * 0.9, a0, a0 + Math.PI * 1.4); ctx.stroke();
      ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.r * 0.9, a0 + Math.PI, a0 + Math.PI * 2.4); ctx.stroke();
      ctx.restore();
    } else if (k === 'ult') {
      const prog = fx.t / fx.dur;
      ctx.save();
      ctx.globalAlpha = (1 - prog) * 0.9;
      ctx.strokeStyle = '#ffe39a'; ctx.lineWidth = 14;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.maxR * prog, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.maxR * prog * 0.82, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  },


  _drawFireball(ctx, fb) {
    ctx.save();
    const g = ctx.createRadialGradient(fb.x, fb.y, 0, fb.x, fb.y, fb.r * 2.2);
    g.addColorStop(0, '#fff2b0'); g.addColorStop(0.5, '#ff8a2a'); g.addColorStop(1, 'rgba(180,40,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(fb.x, fb.y, fb.r * 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },


  _drawDamage(ctx, fx) {
    const p = fx.t / fx.dur, a = 1 - p * p;
    const pop = p < 0.16 ? p / 0.16 : 1;                 // snap up on appear, then settle
    const scale = (fx.mag || 1) * (fx.big ? 1.5 : 1) * (0.55 + 0.5 * pop) * (fx.big ? 1 + 0.12 * (1 - pop) : 1);
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    ctx.translate(fx.x, fx.y); ctx.scale(scale, scale);
    ctx.font = '11px "Silkscreen", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = fx.big ? 4 : 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(fx.text, 0, 0);
    ctx.fillStyle = fx.color;
    ctx.fillText(fx.text, 0, 0);
    ctx.restore();
  },
};
