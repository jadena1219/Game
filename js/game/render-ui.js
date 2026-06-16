// Screen-space UI: HUD, bars, banners, toasts, title cards, buttons, overlays.
// Split from game.js — method bodies are verbatim; attached to Game.prototype in core.js.
import { bladeById } from '../blades.js';
import { LEVELS } from '../config.js';
import { BOSS_NAMES, COMBO_TIERS } from './data.js';

export const renderUiMethods = {

  _drawHUD(ctx) {
    if (this.state === 'title' || this.state === 'gameover' || this.state === 'victory' || this.state === 'won') return;
    const p = this.player;
    if (!p) return;
    // health bar (fixed max) — smoothed with a "damage ghost" chunk. On a hit
    // the whole bar jolts and flashes white.
    const bw = Math.min(180, this.vw * 0.36), bh = 20;
    const hit = Math.max(0, this.hpHitT || 0) / 0.32;
    const bx = 18 + (hit > 0 ? (Math.random() - 0.5) * 6 * hit : 0);
    const by = 20 + (hit > 0 ? (Math.random() - 0.5) * 5 * hit : 0);
    ctx.fillStyle = 'rgba(8,5,12,0.72)';
    ctx.fillRect(bx - 4, by - 4, bw + 8, bh + 8);
    const hpf = Math.max(0, this.hpDisplay / p.maxHP);
    const ghostf = Math.max(hpf, this.hpGhost / p.maxHP);
    const col = hpf > 0.5 ? '#5ec860' : hpf > 0.25 ? '#e9c84a' : '#d8413a';
    ctx.fillStyle = '#2a1d28'; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = 'rgba(232,120,120,0.65)'; ctx.fillRect(bx, by, bw * ghostf, bh); // ghost
    ctx.fillStyle = col; ctx.fillRect(bx, by, bw * hpf, bh);
    if (hit > 0) { ctx.fillStyle = `rgba(255,255,255,${0.5 * hit})`; ctx.fillRect(bx, by, bw * hpf, bh); }
    // quarter ticks: how much trouble you're in, readable at a glance
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    for (let i = 1; i < 4; i++) ctx.fillRect(Math.round(bx + (bw * i) / 4), by + 2, 1, bh - 4);
    // low-health danger pulse on the frame; otherwise the HUD wears the title's gilt
    const danger = hpf <= 0.3 ? 0.4 + 0.4 * Math.sin(this.time * 7) : 0;
    ctx.strokeStyle = danger ? `rgba(216,65,58,${danger})` : 'rgba(233,200,74,0.4)';
    ctx.lineWidth = danger ? 2 : 1; ctx.strokeRect(bx - 0.5, by - 0.5, bw + 1, bh + 1);
    ctx.fillStyle = '#fff'; ctx.font = '9px "Silkscreen", sans-serif';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText(`${Math.max(0, Math.ceil(p.hp))}/${p.maxHP}`, bx + 7, by + bh / 2 + 1);

    // fury bar (under health) — glows when fully charged
    const fy = 20 + bh + 5, fh = 11, fbx = 18;
    const ff = p.fury / p.furyMax;
    const pulse = 0.7 + 0.3 * Math.sin(this.time * 10);
    if (ff >= 1) {                                   // charged: a warm glow halo behind the bar
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 + 0.25 * pulse;
      const gg = ctx.createLinearGradient(fbx, 0, fbx + bw, 0);
      gg.addColorStop(0, 'rgba(255,180,40,0)'); gg.addColorStop(0.5, 'rgba(255,210,90,0.9)'); gg.addColorStop(1, 'rgba(255,180,40,0)');
      ctx.fillStyle = gg; ctx.fillRect(fbx - 6, fy - 6, bw + 12, fh + 12); ctx.restore();
    }
    ctx.fillStyle = 'rgba(8,5,12,0.72)'; ctx.fillRect(fbx - 4, fy - 3, bw + 8, fh + 7);
    ctx.fillStyle = '#241830'; ctx.fillRect(fbx, fy, bw, fh);
    // the bar charges in the LIVING BLADE's colour — fury and blade are one
    const bladeCol = p.blade ? bladeById(p.blade).color : '#9a59e0';
    ctx.fillStyle = ff >= 1 ? `rgba(255,220,90,${pulse})` : bladeCol;
    ctx.fillRect(fbx, fy, bw * ff, fh);
    ctx.strokeStyle = 'rgba(233,200,74,0.3)'; ctx.lineWidth = 1;
    ctx.strokeRect(fbx - 0.5, fy - 0.5, bw + 1, fh + 1);
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = 'bold 9px "Silkscreen", sans-serif';
    ctx.textAlign = 'left'; ctx.fillText(ff >= 1 ? 'ULTIMATE!' : 'FURY', fbx + 4, fy + fh / 2 + 1);

    // Living-Blade chip: name + three evolution pips, in the blade's colour
    if (p.blade) {
      const bd = bladeById(p.blade), cy2 = fy + fh + 12;
      ctx.save();
      ctx.shadowColor = bd.color; ctx.shadowBlur = 6;          // legible at phone size
      ctx.fillStyle = bd.color; ctx.fillRect(fbx, cy2 - 5, 5, 10);
      ctx.font = 'bold 10px "Silkscreen", monospace'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillStyle = bd.color; ctx.fillText(bd.name, fbx + 10, cy2);
      ctx.restore();
      ctx.font = 'bold 10px "Silkscreen", monospace'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      const px0 = fbx + 12 + ctx.measureText(bd.name).width + 6;
      for (let i = 0; i < 3; i++) { ctx.fillStyle = i < (p.bladeTier || 0) ? bd.color : 'rgba(255,255,255,0.25)';
        ctx.fillRect(px0 + i * 7, cy2 - 2, 4, 4); }
    }

    this._drawComboCounter(ctx);

    // level medallion (centred, below the bars) + foes/gold on the right.
    // numbers use Press Start 2P (unambiguous digits); icons are drawn as shapes.
    this._drawLevelBadge(ctx);
    const remaining = this.enemies.length + this.spawnQueue.length;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    const gpop = 1 + 0.4 * Math.max(0, this.goldPop || 0);
    ctx.save();
    ctx.translate(this.vw - 16, 26); ctx.scale(gpop, gpop);
    ctx.font = '12px "Silkscreen", sans-serif'; ctx.fillStyle = this.goldPop > 0.4 ? '#fff0b0' : '#f0cf5a';
    ctx.fillText('' + this.gold, 0, 0);
    ctx.restore();
    this._diamond(ctx, this.vw - 24 - ctx.measureText('' + this.gold).width, 26, 5, '#f0cf5a');
    if (this.state !== 'camp') {
      ctx.textAlign = 'right'; ctx.fillStyle = '#d6c8ea';
      ctx.font = '12px "Silkscreen", sans-serif';
      ctx.fillText('' + remaining, this.vw - 16, 48);
      this._skull(ctx, this.vw - 26 - ctx.measureText('' + remaining).width, 47, '#d6c8ea');
    }
  },


  // Kill-streak counter — pops on each kill, shows the live damage bonus, and a
  // draining ring tells you exactly how long the streak has left to live.
  _drawComboCounter(ctx) {
    if (this.state !== 'playing' || this.combo < 3) return;
    const fade = Math.min(1, this.comboT / 0.7);
    const pop = Math.max(0, this.comboPop || 0);
    const scale = 1 + 0.28 * pop;
    const cx = this.vw / 2, cy = 92;
    // hotter colour the longer the streak runs (matches COMBO_TIERS)
    const col = this.combo >= 50 ? '#ff3a6a' : this.combo >= 25 ? '#ff5a3a' : this.combo >= 10 ? '#ffae3a' : '#ffd86a';
    const tierName = this.combo >= 50 ? 'MASSACRE' : this.combo >= 25 ? 'RAMPAGE' : this.combo >= 10 ? 'FRENZY' : 'COMBO';
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(cx, cy); ctx.scale(scale, scale);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '20px "Silkscreen", sans-serif';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText('' + this.combo, 0, 0);
    ctx.fillStyle = col; ctx.fillText('' + this.combo, 0, 0);
    ctx.font = '8px "Silkscreen", sans-serif';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(tierName, 0, 16); ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(tierName, 0, 16);
    // the streak clock: a thin bar draining left as the window closes
    const frac = Math.max(0, Math.min(1, this.comboT / 2.6));
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(-27, 23, 54, 4);
    ctx.fillStyle = col; ctx.fillRect(-26, 24, 52 * frac, 2);
    // the streak is power: surface the live sword-damage bonus
    const bonus = Math.min(30, this.combo);
    if (bonus >= 3) {
      ctx.font = '7px "Silkscreen", sans-serif';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(`+${bonus}% DMG`, 0, 35);
      ctx.fillStyle = col; ctx.fillText(`+${bonus}% DMG`, 0, 35);
    }
    ctx.restore();
  },


  // A "cool" diamond level medallion (no longer collides with the bars).
  _drawLevelBadge(ctx) {
    const cx = this.vw / 2, cy = 40;
    const bossType = (LEVELS[this.level - 1].boss && 'boss') ||
      (LEVELS[this.level - 1].miniboss && 'miniboss');
    const accent = bossType ? '#e5524a' : '#f0cf5a';
    const deep = bossType ? '#3a0e0c' : '#3a2c08';
    const R = 26;
    ctx.save();
    // glow
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, R + 14);
    g.addColorStop(0, bossType ? 'rgba(229,82,74,0.5)' : 'rgba(240,207,90,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(cx - R - 16, cy - R - 16, (R + 16) * 2, (R + 16) * 2);
    // diamond plate
    const dia = (r) => { ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); };
    dia(R); ctx.fillStyle = deep; ctx.fill();
    const lg = ctx.createLinearGradient(cx, cy - R, cx, cy + R);
    lg.addColorStop(0, 'rgba(255,255,255,0.18)'); lg.addColorStop(0.5, 'rgba(0,0,0,0)');
    ctx.fillStyle = lg; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = accent; ctx.stroke();
    dia(R - 5); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.stroke();
    // text — "LEVEL" header + big number (no fraction; fits inside the diamond)
    ctx.textAlign = 'center';
    ctx.fillStyle = accent; ctx.font = '600 9px "Silkscreen", sans-serif'; ctx.textBaseline = 'middle';
    ctx.fillText(bossType ? 'BOSS' : 'LEVEL', cx, cy - 9);
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
    ctx.font = (this.level >= 10 ? '15px' : '20px') + ' "Silkscreen", sans-serif';
    ctx.fillText('' + this.level, cx, cy + 9);
    ctx.restore();
  },


  // small HUD icon shapes (so numbers can use a clean monospace pixel font)
  _diamond(ctx, x, y, r, col) {
    ctx.save(); ctx.fillStyle = col; ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
    ctx.closePath(); ctx.fill(); ctx.restore();
  },

  _skull(ctx, x, y, col) {
    ctx.save(); ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y - 1, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(x - 4, y + 2, 8, 3);
    ctx.fillStyle = '#1a1020';
    ctx.fillRect(x - 3, y - 2, 2, 2); ctx.fillRect(x + 1, y - 2, 2, 2);
    ctx.restore();
  },


  // A big Souls-style boss bar near the bottom-centre while a boss lives.
  _drawBossBar(ctx) {
    if (this.state !== 'playing' || this.cutscene) return;
    const boss = this.enemies.find((e) => e.boss && !e.dead);
    if (!boss) return;
    const W = this.vw, H = this.vh;
    // lower-centre, lifted well clear of the joystick / swing / fury controls
    const bw = Math.min(W * 0.78, 440), bx = (W - bw) / 2, bh = 13;
    const by = Math.round(Math.min(H - 168, H * 0.78));
    const hpf = Math.max(0, boss.hp / boss.maxHP);
    if (boss._hpShown == null) boss._hpShown = hpf;
    boss._hpShown += (hpf - boss._hpShown) * Math.min(1, (this.dt || 0.016) * 8);   // smooth drain (frame-rate independent)
    const name = (BOSS_NAMES[boss.type] || 'BOSS').toUpperCase();
    const fillCol = ['#d8231a', '#ff5a2a', '#ffb12a'][boss.phase] || '#ffb12a';   // hotter each phase
    ctx.save();
    // name above the bar
    ctx.font = '14px "Silkscreen", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(name, W / 2, by - 8);
    ctx.fillStyle = '#e9b8b2'; ctx.fillText(name, W / 2, by - 8);
    // frame + track
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; this._roundRect(ctx, bx - 4, by - 4, bw + 8, bh + 8, 5); ctx.fill();
    ctx.strokeStyle = 'rgba(120,16,12,0.9)'; ctx.lineWidth = 2; this._roundRect(ctx, bx - 4, by - 4, bw + 8, bh + 8, 5); ctx.stroke();
    ctx.fillStyle = '#2a0606'; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = 'rgba(255,120,90,0.4)'; ctx.fillRect(bx, by, bw * boss._hpShown, bh);  // drain ghost
    ctx.fillStyle = fillCol; ctx.fillRect(bx, by, bw * hpf, bh);
    if (boss.invuln) { ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.3 * Math.sin(this.time * 30)})`; ctx.fillRect(bx, by, bw * hpf, bh); }
    ctx.fillStyle = 'rgba(255,200,170,0.6)'; ctx.fillRect(bx, by, bw * hpf, 3);             // top sheen
    // phase-threshold notches so the player can read the fight's structure
    if (boss.phaseDefs) {
      for (const ph of boss.phaseDefs) {
        const nx = bx + bw * ph.at;
        ctx.fillStyle = 'rgba(20,4,4,0.9)'; ctx.fillRect(nx - 1, by - 1, 2, bh + 2);
        ctx.fillStyle = 'rgba(255,220,150,0.5)'; ctx.fillRect(nx, by - 1, 1, bh + 2);
      }
    }
    ctx.restore();
    // the phase-break banner ("WRATH" / "APOCALYPSE")
    if (this.bossPhase) {
      const bp = this.bossPhase, k = bp.t / bp.dur;
      const a = Math.min(1, (1 - k) * 4) * Math.min(1, bp.t * 6);
      ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const fs = 34 + (1 - Math.min(1, bp.t * 3)) * 26;       // punches in
      ctx.font = `${Math.round(fs)}px "Press Start 2P", monospace`;
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(bp.title, W / 2, H * 0.34);
      const grad = ctx.createLinearGradient(0, H * 0.3, 0, H * 0.38);
      grad.addColorStop(0, '#ffd36b'); grad.addColorStop(1, '#ff3a1e');
      ctx.fillStyle = grad; ctx.fillText(bp.title, W / 2, H * 0.34);
      ctx.restore();
    }
  },


  // A brief banner when a named elite arrives, or when its relic is claimed.
  _drawNamedToast(ctx) {
    const nt = this.namedToast; if (!nt) return;
    const k = nt.t / nt.dur, W = this.vw, H = this.vh;
    const a = Math.min(1, nt.t * 3) * Math.min(1, (1 - k) * 3);
    ctx.save();
    ctx.globalAlpha = Math.max(0, a); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const y = H * 0.2;
    let size = 22; ctx.font = `bold ${size}px "Silkscreen", sans-serif`;
    const maxW = W * 0.86, tw = ctx.measureText(nt.name).width;
    if (tw > maxW) { size = Math.floor(size * maxW / tw); ctx.font = `bold ${size}px "Silkscreen", sans-serif`; }
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(nt.name, W / 2, y);
    ctx.shadowColor = nt.color; ctx.shadowBlur = 14 * a;
    ctx.fillStyle = nt.color; ctx.fillText(nt.name, W / 2, y);
    ctx.shadowBlur = 0;
    if (nt.sub) {
      ctx.font = 'italic 12px "Silkscreen", sans-serif'; ctx.fillStyle = 'rgba(230,220,235,0.85)';
      ctx.fillText(nt.sub, W / 2, y + size * 0.72 + 6);
    }
    ctx.restore();
  },


  _drawFuryButton(ctx) {
    if (this.state !== 'playing') return;
    const b = this.input.furyBtn;
    if (!b.visible) return;
    const t = this.time;
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    // a bar left full too long DEMANDS attention: the button hops insistently
    const nag = (this.furyIdleT || 0) > 5 ? Math.abs(Math.sin(t * 7)) * 6 : 0;
    const cx = b.x, cy = b.y + Math.sin(t * 3) * 1.5 - nag;
    const PXS = 5, N = 9, half = N * PXS / 2;          // a 9x9 chunky-pixel rune tile
    const x0 = Math.round(cx - half), y0 = Math.round(cy - half);
    ctx.save();
    // soft arcane glow behind the stone
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, half + 14 + pulse * 6);
    g.addColorStop(0, `rgba(180,120,255,${0.5 + 0.3 * pulse})`);
    g.addColorStop(1, 'rgba(120,60,200,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, half + 16 + pulse * 6, 0, Math.PI * 2); ctx.fill();
    // pixel helper
    const px = (gx, gy, col) => { ctx.fillStyle = col; ctx.fillRect(x0 + gx * PXS, y0 + gy * PXS, PXS, PXS); };
    const dark = '#140a1e', rim = '#7a3fd0', rimHi = '#a368ff', face = '#2a1745', faceHi = '#36205a';
    for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
      const edge = gx === 0 || gy === 0 || gx === N - 1 || gy === N - 1;
      const ring = gx <= 1 || gy <= 1 || gx >= N - 2 || gy >= N - 2;
      if (edge) px(gx, gy, dark);
      else if (ring) px(gx, gy, (gx + gy) % 2 ? rim : rimHi);
      else px(gx, gy, (gx + gy) % 2 ? face : faceHi);
    }
    // lightning rune (flickers bright on the pulse)
    const bolt = '#fff7c0', boltDim = '#ffd23a';
    const col = pulse > 0.45 ? bolt : boltDim;
    for (const [gx, gy] of [[5, 1], [4, 2], [5, 2], [4, 3], [3, 4], [4, 4], [5, 4], [4, 5], [3, 6], [4, 6], [3, 7]]) px(gx, gy, col);
    // a few orbiting pixel sparks
    for (let i = 0; i < 3; i++) {
      const a = t * 2 + i * 2.1, rr = half + 7;
      ctx.fillStyle = `rgba(220,190,255,${0.5 + 0.5 * pulse})`;
      ctx.fillRect(Math.round(cx + Math.cos(a) * rr) - 1, Math.round(cy + Math.sin(a) * rr) - 1, 3, 3);
    }
    // FURY label above (pixel font, gold glow)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '8px "Silkscreen", sans-serif';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,10,30,0.85)';
    ctx.strokeText('FURY', cx, y0 - 9);
    ctx.fillStyle = `rgba(216,184,255,${0.7 + 0.3 * pulse})`;
    ctx.fillText('FURY', cx, y0 - 9);
    ctx.restore();
  },


  // Fury button: a fixed control centred at the bottom, between move + swing.
  _updateFuryButton() {
    const ib = this.input.furyBtn || (this.input.furyBtn = { x: 0, y: 0, r: 0, visible: false });
    if (this.furyReady && this.state === 'playing' && this.countdown <= 0) {
      ib.x = this.vw / 2;
      ib.y = this.vh - (this.input.btn.r || 60) - 30;
      ib.r = 30; ib.visible = true;
    } else { ib.visible = false; }
  },


  _drawCountdownIntro(ctx) {
    // boss reveal: a pulsing red vignette + heavy letterbox closing the room in
    if (this.intro && this.intro.kind === 'boss') {
      const p = this.intro.t / this.intro.dur;
      const W = this.vw, H = this.vh;
      // dread-red vignette, throbbing like a slow heartbeat, easing out at the end
      const fade = p > 0.82 ? 1 - (p - 0.82) / 0.18 : 1;
      const pulse = 0.42 + 0.30 * Math.sin(this.intro.t * 7);
      ctx.save();
      const rg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.18, W / 2, H / 2, Math.max(W, H) * 0.62);
      rg.addColorStop(0, 'rgba(0,0,0,0)');
      rg.addColorStop(1, `rgba(150,8,8,${(0.55 * pulse * fade).toFixed(3)})`);
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
      ctx.restore();
      const barH = (p < 0.85 ? 1 : 1 - (p - 0.85) / 0.15) * 78;
      ctx.save();
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, barH);
      ctx.fillRect(0, H - barH, W, barH);
      // a thin blood line along the letterbox edge
      ctx.fillStyle = `rgba(180,20,16,${(0.7 * fade).toFixed(3)})`;
      ctx.fillRect(0, barH - 2, W, 2); ctx.fillRect(0, H - barH, W, 2);
      ctx.restore();
    }
    if (this.intro) {
      const it = this.intro, p = it.t / it.dur;
      const slide = p < 0.2 ? p / 0.2 : 1;
      const a = p > 0.8 ? 1 - (p - 0.8) / 0.2 : 1;
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const y = this.vh * 0.38;
      if (it.kind === 'boss') {
        // small dread label above
        ctx.font = 'bold 13px "Silkscreen", sans-serif'; ctx.fillStyle = 'rgba(180,40,30,0.85)';
        ctx.fillText('THE WAY IS BARRED BY', this.vw / 2, y - 38);
        // the name SLAMS in big, then settles — blood red with a red glow
        const slam = 1 + (1 - slide) * 0.6;             // overshoot → settle
        let size = (30 + slide * 4) * slam;
        ctx.font = `bold ${size}px "Silkscreen", sans-serif`;
        const maxW = this.vw * 0.9;                     // scale down so it never overflows
        const tw = ctx.measureText(it.text).width;
        if (tw > maxW) { size = Math.floor(size * maxW / tw); ctx.font = `bold ${size}px "Silkscreen", sans-serif`; }
        ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(it.text, this.vw / 2, y);
        ctx.shadowColor = '#ff2a1e'; ctx.shadowBlur = 18 * a;
        ctx.fillStyle = '#e5251c'; ctx.fillText(it.text, this.vw / 2, y);
        ctx.shadowBlur = 0;
        ctx.font = 'italic 13px "Silkscreen", sans-serif'; ctx.fillStyle = 'rgba(207,160,160,0.8)';
        ctx.fillText(it.sub, this.vw / 2, y + size * 0.62 + 8);
      } else if (it.kind === 'ambush') {
        // a hard red warning that shakes/pulses — empowered foes came down with you
        const jx = (Math.random() - 0.5) * 5 * a, jy = (Math.random() - 0.5) * 5 * a;
        let size = 34 + slide * 4;
        ctx.font = `bold ${size}px "Silkscreen", sans-serif`;
        const maxW = this.vw * 0.9, tw = ctx.measureText(it.text).width;
        if (tw > maxW) { size = Math.floor(size * maxW / tw); ctx.font = `bold ${size}px "Silkscreen", sans-serif`; }
        ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(it.text, this.vw / 2 + jx, y + jy);
        ctx.shadowColor = '#ff2a1e'; ctx.shadowBlur = 16 * a;
        ctx.fillStyle = '#ff3326'; ctx.fillText(it.text, this.vw / 2 + jx, y + jy);
        ctx.shadowBlur = 0;
        ctx.font = 'italic 13px "Silkscreen", sans-serif'; ctx.fillStyle = 'rgba(220,160,150,0.85)';
        ctx.fillText(it.sub, this.vw / 2, y + size * 0.6 + 8);
      } else {
        // floor title card: the ACT above, the floor in gold, the biome's name
        // glowing in its own light, under a gilded rule — a card, not a label
        const x = this.vw / 2 + (1 - slide) * 80;
        const act = (this.biome && this.biome.act) || '';
        const col = (this.biome && this.biome.torch) || '#e9c84a';
        if (act) {
          ctx.font = 'bold 11px "Silkscreen", sans-serif'; ctx.fillStyle = 'rgba(214,205,230,0.6)';
          ctx.fillText('— ACT ' + act + ' —', x, y - 34);
        }
        ctx.font = '26px "Silkscreen", sans-serif';   // clear digits
        ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.strokeText(it.text, x, y);
        ctx.fillStyle = '#e9c84a';
        ctx.fillText(it.text, x, y);
        if (it.sub) {
          ctx.font = 'italic 15px "Silkscreen", sans-serif';
          ctx.shadowColor = col; ctx.shadowBlur = 9;
          ctx.fillStyle = col;
          ctx.fillText(it.sub, x, y + 30);
          ctx.shadowBlur = 0;
          const rule = ctx.createLinearGradient(x - 92, 0, x + 92, 0);
          rule.addColorStop(0, 'rgba(0,0,0,0)'); rule.addColorStop(0.5, col); rule.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.globalAlpha = Math.max(0, a) * 0.75;
          ctx.fillStyle = rule; ctx.fillRect(x - 92, y + 45, 184, 2);
        }
      }
      ctx.restore();
    }
    // 3..2..1..FIGHT countdown
    if (this.state === 'playing' && this.countdown > 0) {
      const c = this.countdown;
      const fight = c <= 0.9;
      const label = fight ? 'FIGHT!' : '' + Math.ceil(c - 0.9);
      // pulse: each number/word pops then settles within its ~0.9s window
      const phase = (c % 0.9) / 0.9;            // 1 at appear -> 0 at end
      const scale = 1 + 0.22 * phase;
      const a = fight ? Math.min(1, c / 0.5) : Math.min(1, phase * 4);
      ctx.save();
      ctx.globalAlpha = Math.max(0.25, a);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const sz = (fight ? 46 : 72) * scale;
      ctx.font = fight ? `bold ${sz}px "Silkscreen", sans-serif` : `${sz}px "Silkscreen", sans-serif`;
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(label, this.vw / 2, this.vh * 0.5);
      ctx.fillStyle = fight ? '#d8413a' : '#fff';
      ctx.fillText(label, this.vw / 2, this.vh * 0.5);
      ctx.restore();
    }
  },


  _drawSweep(ctx) {
    if (!this.sweep) return;
    const prog = this.sweep.t / this.sweep.dur;
    // a band sweeps left->right with the text, then fades
    const a = prog < 0.7 ? 1 : 1 - (prog - 0.7) / 0.3;
    const cx = this.vw / 2;
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = 'rgba(10,8,18,0.7)';
    const bandH = 92;
    ctx.fillRect(0, this.vh / 2 - bandH / 2, this.vw, bandH);
    ctx.fillStyle = '#e9c84a';
    ctx.fillRect(0, this.vh / 2 - bandH / 2, this.vw, 3);
    ctx.fillRect(0, this.vh / 2 + bandH / 2 - 3, this.vw, 3);
    const slideIn = Math.min(1, prog / 0.25);
    const x = cx - (1 - slideIn) * 60;
    ctx.globalAlpha *= slideIn;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 40px "Silkscreen", sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText('LEVEL CLEARED', x, this.vh / 2);
    ctx.restore();
  },


  // The wipe is a DOM layer (above the menus); drive it from the transition clock.
  _drawTransition() {
    if (!this.wipeEl) return;
    if (!this.transition) {
      if (this.wipeEl.style.opacity !== '0') this.wipeEl.style.opacity = '0';
      return;
    }
    const prog = Math.min(1, this.transition.t / this.transition.dur);
    const tx = -140 + 280 * prog;   // slides across, covering the screen at the midpoint
    this.wipeEl.style.opacity = '1';
    this.wipeEl.style.transform = `translateX(${tx}%) skewX(-12deg)`;
  },


  _drawDeathOverlay(ctx) {
    if (this.state !== 'dying') return;
    const p = 1 - this.dying / 1.5;
    ctx.save();
    ctx.globalAlpha = Math.min(0.55, p);
    ctx.fillStyle = '#1a0c10';
    ctx.fillRect(0, 0, this.vw, this.vh);
    if (p > 0.35) {
      const sp = Math.min(1, (p - 0.35) / 0.25);
      ctx.globalAlpha = sp;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `bold ${64 + (1 - sp) * 40}px "Silkscreen", sans-serif`;
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText('YOU FELL', this.vw / 2, this.vh * 0.45);
      ctx.fillStyle = '#d8413a';
      ctx.fillText('YOU FELL', this.vw / 2, this.vh * 0.45);
    }
    ctx.restore();
  },


  _drawVictory(ctx) {
    if (this.state !== 'won') return;
    const t = this.wonT, cx = this.vw / 2;
    ctx.save();
    // golden wash
    ctx.fillStyle = `rgba(70,46,8,${Math.min(0.4, t * 0.28)})`;
    ctx.fillRect(0, 0, this.vw, this.vh);
    // heavenly light beam + glow on the hero
    if (this.player) {
      const sx = this.player.x - this.cam.x, sy = this.player.y - this.cam.y;
      const beam = ctx.createLinearGradient(sx, 0, sx, sy + 10);
      beam.addColorStop(0, 'rgba(255,236,170,0)'); beam.addColorStop(1, 'rgba(255,236,170,0.28)');
      ctx.fillStyle = beam;
      ctx.beginPath(); ctx.moveTo(sx - 14, 0); ctx.lineTo(sx + 14, 0);
      ctx.lineTo(sx + 60, sy + 16); ctx.lineTo(sx - 60, sy + 16); ctx.closePath(); ctx.fill();
      const rg = ctx.createRadialGradient(sx, sy - 16, 2, sx, sy - 16, 90);
      rg.addColorStop(0, `rgba(255,240,180,${0.4 + 0.1 * Math.sin(t * 5)})`); rg.addColorStop(1, 'rgba(255,220,120,0)');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(sx, sy - 16, 90, 0, Math.PI * 2); ctx.fill();
    }
    // VICTORY slam-in
    if (t > 0.35) {
      const p = Math.min(1, (t - 0.35) / 0.45);
      ctx.globalAlpha = Math.min(1, p * 1.5);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const sz = 26 + (1 - p) * 16;
      ctx.font = `${sz}px "Silkscreen", sans-serif`;
      ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(40,20,0,0.7)';
      ctx.strokeText('VICTORY', cx, this.vh * 0.32);
      const grd = ctx.createLinearGradient(0, this.vh * 0.30, 0, this.vh * 0.35);
      grd.addColorStop(0, '#fff3c0'); grd.addColorStop(1, '#f0b835');
      ctx.fillStyle = grd; ctx.fillText('VICTORY', cx, this.vh * 0.32);
    }
    if (t > 1.0) {
      ctx.globalAlpha = Math.min(1, (t - 1.0) / 0.5);
      ctx.font = 'bold 17px "Silkscreen", sans-serif'; ctx.fillStyle = '#ffe9b0';
      ctx.fillText('The Demon Lord Falls', cx, this.vh * 0.32 + 40);
    }
    ctx.restore();
  },
};
