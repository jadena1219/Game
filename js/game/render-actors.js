// Painters for actors: player, held blade, enemies, projectiles, pickups, swing arcs.
// Split from game.js — method bodies are verbatim; attached to Game.prototype in core.js.
import { Assets } from '../assets.js';
import { bladeById } from '../blades.js';
import { CONFIG } from '../config.js';
import { drawSprite, pickFrame } from '../sprite.js';

export const renderActorsMethods = {

  _drawPlayer(ctx) {
    const p = this.player;
    const frame = pickFrame(p, this.time);
    // contact shadow — the knight stands ON the stone, not over it. It thins
    // while he dashes (skimming) and fades as he sinks into a descent.
    if (!p.dead) {
      const dashK = p.dashTimer > 0 ? 0.55 : 1;
      const sink = this.descentSink > 0 ? Math.max(0, 1 - this.descentSink * 1.15) : 1;
      ctx.save();
      ctx.fillStyle = `rgba(0,0,0,${(0.32 * dashK * sink).toFixed(3)})`;
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 4, 13 * (p.dashTimer > 0 ? 1.15 : 1), 4.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // Fury charged: the knight is BLESSED — a soft holy halo + a thin glowing
    // gold rim traced around the body (a real silhouette outline, not a square).
    if (this.furyReady && this.state === 'playing') {
      const t = this.time, pulse = 0.5 + 0.5 * Math.sin(t * 6);
      ctx.save();
      // warm radial halo behind the body
      const g = ctx.createRadialGradient(p.x, p.y - 18, 4, p.x, p.y - 18, 44);
      g.addColorStop(0, `rgba(255,224,150,${0.18 + 0.12 * pulse})`);
      g.addColorStop(1, 'rgba(255,200,90,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y - 18, 44, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      this._drawBlessedRim(ctx, p, frame, pulse);
    }
    if (p.invuln > 0 && Math.floor(this.time * 20) % 2 === 0 && p.flash <= 0) {
      ctx.globalAlpha = 0.6;   // blink during i-frames
    }
    if (this.descentSink > 0) ctx.globalAlpha *= Math.max(0, 1 - this.descentSink * 1.15);  // sinking into the pit
    const breath = this.cutscene ? Math.sin(this.time * 2.2) * 1.4 : 0;   // chest rises/falls during the scene
    const tint = p.flash > 0 ? { color: '#ff5a5a', a: 0.6 }
      : (p.slowT > 0 ? { color: '#9fe0ff', a: 0.45 } : null);
    drawSprite(ctx, p.sprite, frame, p.x, p.y - breath, p.faceLeft, 1, tint);
    ctx.globalAlpha = 1;
    this._drawHeldBlade(ctx, p, breath);
  },


  // The chosen Living Blade, gripped in the knight's gauntlet. Held in a ready
  // guard when idle; on a swing it WHIPS through a wide arc — eased (wind-up →
  // fast cut → follow-through), the hand reaching into the cut, with a fading
  // motion-blur trail of the blade so the slash reads as one flowing motion.
  _drawHeldBlade(ctx, p, breath = 0) {
    const sword = (Assets.bladeHeld && Assets.bladeHeld[p.blade]) || (Assets.bladeSwords && Assets.bladeSwords[p.blade]);
    if (!sword || p.dead) return;
    const cw = 18, ch = 64, gripY = 52, sc = CONFIG.pixelScale * 0.31;   // simpler/slimmer; sized to fit him
    const faceSign = p.faceLeft ? -1 : 1, bd = bladeById(p.blade);
    let hx = p.x + faceSign * 10, hy = p.y - 20 - breath;
    const poses = [];
    if (p.swingTimer > 0) {
      const sp = Math.min(1, p.swingProgress);
      const arcV = (p.arcDeg * Math.PI / 180) * 1.5;     // sweep wider than the hit arc — dramatic
      const a0v = p.facingAngle - arcV * 0.45;
      // q: wind back slightly, then whip forward (smoothstepped) and follow through
      const qOf = (s) => { if (s < 0.2) return -0.15 * (s / 0.2); const u = (s - 0.2) / 0.8; return -0.15 + 1.15 * (u * u * (3 - 2 * u)); };
      const mainAim = a0v + qOf(sp) * arcV;
      const reach = Math.sin(sp * Math.PI) * 7;          // the arm pushes out through the cut
      hx += Math.cos(mainAim) * reach; hy += Math.sin(mainAim) * reach;
      for (const [ds, a] of [[-0.18, 0.18], [-0.10, 0.38], [0, 1]]) {   // trail → main
        poses.push({ aim: a0v + qOf(Math.max(0, sp + ds)) * arcV, a });
      }
    } else if (p.dashing) {
      poses.push({ aim: p.facingAngle + Math.PI * 0.85, a: 1 });
    } else {
      poses.push({ aim: -Math.PI / 2 + faceSign * 0.22 + Math.sin(this.time * 2.3) * 0.04, a: 1 });   // upright ready guard (not stuck out)
    }
    // an elemental glow at the hilt so the blade never blends into him
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gg = ctx.createRadialGradient(hx, hy, 2, hx, hy, 26);
    gg.addColorStop(0, this._rgba(bd.color, 0.3 + 0.12 * Math.sin(this.time * 5))); gg.addColorStop(1, this._rgba(bd.color, 0));
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(hx, hy, 26, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    for (const ps of poses) {
      ctx.save();
      ctx.globalAlpha = ps.a;
      ctx.translate(hx, hy);
      ctx.rotate(ps.aim + Math.PI / 2);                  // canvas tip is up; align it to `aim`
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sword, -cw * sc / 2, -gripY * sc, cw * sc, ch * sc);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },


  // Render the hero sprite to a transparent offscreen, tint it solid gold (the
  // silhouette mask is correct there), then blit it offset + blurred behind the
  // real sprite — leaving only a glowing gold rim showing: a "blessed" outline.
  _drawBlessedRim(ctx, p, frame, pulse) {
    const AW = 120, AH = 140, PAD = 10;
    if (!this._auraCv) {
      this._auraCv = (typeof OffscreenCanvas !== 'undefined')
        ? new OffscreenCanvas(AW, AH) : document.createElement('canvas');
      this._auraCv.width = AW; this._auraCv.height = AH;
      this._auraCx = this._auraCv.getContext('2d');
    }
    const acx = this._auraCx;
    acx.setTransform(1, 0, 0, 1, 0, 0);
    acx.clearRect(0, 0, AW, AH);
    acx.imageSmoothingEnabled = false;
    // solid gold silhouette on a transparent backdrop (source-atop masks cleanly here)
    drawSprite(acx, p.sprite, frame, AW / 2, AH - PAD, p.faceLeft, 1, { color: '#ffe9a8', a: 1 });
    const destX = p.x - AW / 2, destY = p.y - (AH - PAD);
    const grow = 1.4 + pulse;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 + 0.3 * pulse;
    ctx.shadowColor = '#ffd86a'; ctx.shadowBlur = 7 + 5 * pulse;
    for (const [dx, dy] of [[grow, 0], [-grow, 0], [0, grow], [0, -grow]]) {
      ctx.drawImage(this._auraCv, destX + dx, destY + dy);
    }
    ctx.restore();
  },


  // The boss dragging itself up out of the ritual symbol: a waking altar-glow, the
  // figure rising through a clip at the floor line (head first), and churning smoke.
  _drawBossRise(ctx, e) {
    const rise = Math.max(0, e.rising), t = this.time;
    const col = e.sprite === 'boss' ? '#b81810' : '#7a2ed0';
    // the symbol waking: a pulsing glow welling out of the floor
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gr = 70 + 46 * rise + 8 * Math.sin(t * 6);
    const g = ctx.createRadialGradient(e.x, e.y, 4, e.x, e.y, gr);
    g.addColorStop(0, this._rgba(col, 0.5 * rise + 0.16)); g.addColorStop(1, this._rgba(col, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, gr, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // the figure rising — clipped at the feet line so it emerges from the floor
    const sh = e.r * 3.6, yoff = (1 - rise) * sh;
    ctx.save();
    ctx.beginPath(); ctx.rect(e.x - e.r * 2.6, e.y - sh - 60, e.r * 5.2, sh + 60); ctx.clip();
    ctx.globalAlpha = Math.min(1, rise / 0.14);          // just his sprite, fading in as he clears the floor
    drawSprite(ctx, e.sprite, 'idle', e.x, e.y + yoff, e.faceLeft, 1, null);
    ctx.restore();
    // dark smoke churning at the base to mask the seam
    ctx.save();
    for (let i = 0; i < 6; i++) {
      const ox = e.x + Math.cos(t * 1.3 + i * 1.7) * e.r * (0.5 + 0.5 * Math.sin(t + i));
      const oy = e.y - ((t * 22 + i * 20) % 42);
      ctx.globalAlpha = 0.16; ctx.fillStyle = '#0a0208';
      ctx.beginPath(); ctx.ellipse(ox, oy, e.r * 0.72, e.r * 0.32, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  },


  _drawEnemy(ctx, e) {
    if (e.rising != null && e.rising < 1) { this._drawBossRise(ctx, e); return; }   // emerging from the altar
    const frame = pickFrame(e, this.time + e.x * 0.01);
    // contact shadow FIRST, under everything — every foe stands ON the stone
    // (bosses cast their own heavier one below). It grows in as the foe emerges.
    if (!e.boss) {
      const em = e.emergeT > 0 && e.emergeDur ? 1 - e.emergeT / e.emergeDur : 1;
      const k = 0.4 + 0.6 * em;
      ctx.fillStyle = `rgba(0,0,0,${(0.3 * em + 0.06).toFixed(3)})`;
      ctx.beginPath(); ctx.ellipse(e.x, e.y + 4, e.r * 0.95 * k, e.r * 0.34 * k, 0, 0, Math.PI * 2); ctx.fill();
    }
    // CHARGE telegraph: a tapering danger lane with chevrons rushing outward and a
    // charge-glow gathering on the boss — reads clearly as "I'm about to dash here".
    if (e.state === 'windup' && e.spec.charge && this.player) {
      const a = Math.atan2(this.player.y - e.y, this.player.x - e.x);
      const prog = Math.max(0, Math.min(1, 1 - e.stateT / e.spec.charge.windup));
      const len = 220 + 40 * prog, w0 = e.r * 0.55, w1 = e.r * 1.5;
      ctx.save();
      ctx.translate(e.x, e.y); ctx.rotate(a);
      // the danger lane: a red wedge fading along its length
      const grad = ctx.createLinearGradient(0, 0, len, 0);
      grad.addColorStop(0, `rgba(255,42,28,${0.26 + 0.2 * prog})`);
      grad.addColorStop(1, 'rgba(255,42,28,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, -w0); ctx.lineTo(len, -w1); ctx.lineTo(len, w1); ctx.lineTo(0, w0); ctx.closePath(); ctx.fill();
      // chevrons sliding down the lane toward the target
      ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const cp = (this.time * 1.7 + i / 3) % 1;
        const cx = cp * len, cw = w0 + (w1 - w0) * cp;
        ctx.strokeStyle = `rgba(255,140,90,${(1 - cp) * 0.75 * (0.4 + 0.6 * prog)})`;
        ctx.beginPath(); ctx.moveTo(cx - 11, -cw * 0.68); ctx.lineTo(cx + 7, 0); ctx.lineTo(cx - 11, cw * 0.68); ctx.stroke();
      }
      ctx.restore();
      // a hot core gathering on the boss as it coils to spring
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const gr = e.r * (1.0 + 0.6 * prog);
      const g = ctx.createRadialGradient(e.x, e.y - e.r * 0.4, 0, e.x, e.y - e.r * 0.4, gr);
      g.addColorStop(0, `rgba(255,70,44,${0.45 * prog})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y - e.r * 0.4, gr, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // boss SLAM telegraph: a growing red danger ring you must leave
    if (e.state === 'special' && e.pendingSpecial === 'slam') {
      const prog = 1 - e.stateT / (e.specMax || 0.95);
      ctx.save();
      ctx.strokeStyle = `rgba(255,70,50,${0.4 + 0.5 * prog})`; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.slamR, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(255,60,40,${0.12 * prog})`;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.slamR * prog, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // PHASE-SHIFT enrage: a violent expanding shock-ring while the boss is untouchable
    if (e.state === 'enrage') {
      const prog = 1 - e.stateT / 1.0;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,${Math.round(150 - 110 * prog)},50,${(1 - prog) * 0.8 + 0.2})`;
      ctx.lineWidth = 3 + 5 * (0.5 + 0.5 * Math.sin(this.time * 30));
      ctx.beginPath(); ctx.arc(e.x, e.y - e.r * 0.4, e.r * (1.1 + prog * 1.8), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    // APOCALYPSE ember aura: flames rising off the Demon Lord
    if (e.emberAura) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 7; i++) {
        const ph = (this.time * 0.6 + i / 7) % 1;
        const ang = i * 2.39 + this.time * 0.5;
        const ox = e.x + Math.cos(ang) * e.r * (0.6 + 0.6 * ph);
        const oy = (e.y - e.r * 0.2) - ph * e.r * 2.2;
        const mr = 3.2 * (1 - ph);
        const gg = ctx.createRadialGradient(ox, oy, 0, ox, oy, mr * 3);
        gg.addColorStop(0, ph < 0.5 ? '#ffd36b' : '#ff6a2a'); gg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = (1 - ph) * 0.9; ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(ox, oy, mr * 3, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    // boss menace: a heavy cast shadow + a slow roiling aura of dread
    if (e.boss) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ctx.beginPath(); ctx.ellipse(e.x, e.y + 6, e.r * 1.35, e.r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      const col = e.sprite === 'boss' ? '#ff3a1e' : '#d81818';
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 3 + e.x * 0.01);
      const rr = Math.round(e.r * 2.4);
      const cache = this._glowCache || (this._glowCache = new Map());
      const key = rr + '|' + col;
      let g = cache.get(key);
      if (!g) { g = ctx.createRadialGradient(0, 0, 0, 0, 0, rr); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); cache.set(key, g); }
      ctx.save(); ctx.globalAlpha = 0.16 + 0.12 * pulse; ctx.fillStyle = g;
      ctx.translate(e.x, e.y - e.r * 0.7); ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // elite aura + bomber fuse-glow
    if ((e.elite || e.type === 'bomber') && !e.boss) {
      const isElite = !!e.elite;
      const col = e.affix ? e.affix.color : '#ff7a2a';
      const pulse = 0.5 + 0.5 * Math.sin(this.time * (e.type === 'bomber' ? 9 : 3.2) + e.x);
      // soft radial ground glow (cached gradient)
      const rr = Math.round(e.r * (isElite ? 2.5 : 2.0));
      const cache = this._glowCache || (this._glowCache = new Map());
      const key = rr + '|' + col;
      let g = cache.get(key);
      if (!g) { g = ctx.createRadialGradient(0, 0, 0, 0, 0, rr); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); cache.set(key, g); }
      ctx.save();
      ctx.globalAlpha = (isElite ? 0.22 : 0.3) + 0.18 * pulse; ctx.fillStyle = g;
      ctx.translate(e.x, e.y - e.r * 0.5); ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (isElite) {
        // Frostbound chills the very ground it stands on
        if (e.elite === 'icy') {
          ctx.save(); ctx.globalAlpha = 0.18 + 0.1 * pulse; ctx.fillStyle = col;
          ctx.beginPath(); ctx.ellipse(e.x, e.y + 5, e.r * 1.5, e.r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        // a pulsing consecrated ring at the feet
        ctx.save();
        ctx.globalAlpha = 0.3 + 0.3 * pulse; ctx.strokeStyle = col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(e.x, e.y + 4, e.r * 1.3, e.r * 0.52, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        // three glowing motes orbiting the body — the unmistakable elite signature
        const t = this.time * 1.8 + (e.auraT || 0);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
          const a = t + i * (Math.PI * 2 / 3);
          const ox = e.x + Math.cos(a) * e.r * 1.5;
          const oy = (e.y - e.r * 0.8) + Math.sin(a) * e.r * 0.62;
          const mr = 2.6 + 0.8 * Math.sin(t * 3 + i);
          const gg = ctx.createRadialGradient(ox, oy, 0, ox, oy, mr * 3);
          gg.addColorStop(0, col); gg.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.globalAlpha = 0.85; ctx.fillStyle = gg;
          ctx.beginPath(); ctx.arc(ox, oy, mr * 3, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1; ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(ox, oy, mr * 0.55, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
    }
    // Living-Blade status flourishes: flames on burning foes, an icy casing on frozen
    if (e.frozenT > 0) {
      ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = '#bfe9ff'; ctx.lineWidth = 1;
      ctx.strokeRect(e.x - e.r * 0.8, e.y - e.r * 1.5, e.r * 1.6, e.r * 1.85);
      ctx.globalAlpha = 0.25; ctx.fillStyle = '#bfe9ff'; ctx.fillRect(e.x - e.r * 0.8, e.y - e.r * 1.5, e.r * 1.6, e.r * 1.85);
      ctx.restore(); ctx.globalAlpha = 1;
    }
    let tint = e.state === 'enrage' ? { color: '#ffffff', a: 0.45 + 0.35 * Math.sin(this.time * 30) }
      : e.flash > 0 ? { color: '#ffffff', a: 0.7 }
      : e.frozenT > 0 ? { color: '#9fd8ff', a: 0.5 }
      : e.burnT > 0 ? { color: '#ff7a2a', a: 0.32 + 0.12 * Math.sin(this.time * 18) }
      : (e.state === 'windup' || e.state === 'special' ? { color: '#ff4040', a: 0.5 }
      : (e.husk ? { color: '#16102a', a: 0.5 }            // the Revenant: a shade of what you were
      : (e.ravenous ? { color: '#ff4040', a: 0.16 + 0.1 * Math.sin(this.time * 9) }   // stragglers run hot
      : (e.elite ? { color: e.affix.color, a: 0.16 } : null))));
    // BLADELIGHT: outside the light, foes live as silhouettes with burning eyes.
    // Hit-flash / telegraphs / burning override — those must read through the dark.
    // (Capped at 0.8 so a hint of body colour always survives — foes never strobe
    // fully in and out of existence at the light's rim.)
    const lit = (e.boss || tint) ? 1 : this._litAt(e.x, e.y);
    if (lit < 0.85) tint = { color: '#070310', a: Math.min(0.8, (1 - lit) * 0.95) };
    // cold rim/backlight so the all-black Demon Lord reads against the dark throne
    if (e.boss && this.biome && this.biome.moonlit) {
      const rl = this.biome.moonlit, sh = e.r * 3.4;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const halo = ctx.createRadialGradient(e.x, e.y - sh * 0.5, 4, e.x, e.y - sh * 0.5, sh * 0.92);
      halo.addColorStop(0, this._rgba(rl, 0.26)); halo.addColorStop(0.5, this._rgba(rl, 0.10)); halo.addColorStop(1, this._rgba(rl, 0));
      ctx.fillStyle = halo; ctx.beginPath(); ctx.ellipse(e.x, e.y - sh * 0.5, sh * 0.62, sh * 0.92, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // a gentle breathing bob when idle so foes never look frozen
    const bob = (!e.boss && !e.moving) ? Math.sin(this.time * 2.6 + e.x * 0.07) : 0;
    if (e.emergeT > 0 && e.emergeDur > 0) {
      // EMERGING: the body rises out of the spawn mark, clipped at the ground
      // line — climbing up out of the dark, not blinking into existence
      const raw = 1 - e.emergeT / e.emergeDur;
      const em = raw * raw * (3 - 2 * raw);                // smoothstep rise
      const sh = Math.max(46, e.r * 3.4);
      ctx.save();
      ctx.beginPath(); ctx.rect(e.x - sh, e.y - sh, sh * 2, sh + 3); ctx.clip();
      ctx.globalAlpha = 0.45 + 0.55 * em;
      drawSprite(ctx, e.sprite, frame, e.x, e.y + (1 - em) * sh * 0.85, e.faceLeft, 1, tint);
      ctx.restore(); ctx.globalAlpha = 1;
    } else {
      drawSprite(ctx, e.sprite, frame, e.x, e.y - bob, e.faceLeft, 1, tint);
    }
    if (e.burnT > 0) this._drawBurning(ctx, e);   // real flames, drawn over the body
    // eyes in the dark: the only thing a swallowed silhouette gives away
    if (lit < 0.55) {
      const ec = (e.named && e.named.color) || (e.elite && e.affix.color) ||
        ({ chaser: '#ff5040', swarmer: '#ffb24a', tank: '#ff4040', caster: '#b06bff', bomber: '#ffd23a' })[e.type] || '#ff5040';
      const ea = (1 - lit) * (0.75 + 0.25 * Math.sin(this.time * 5 + e.x * 0.13));
      const ey = e.y - bob - e.r * 1.5, off = e.faceLeft ? -1 : 1;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ea;
      ctx.fillStyle = ec;
      ctx.fillRect((e.x - 4 + off) | 0, ey | 0, 2, 2);
      ctx.fillRect((e.x + 2 + off) | 0, ey | 0, 2, 2);
      ctx.globalAlpha = ea * 0.35;
      ctx.fillRect((e.x - 5 + off) | 0, (ey - 1) | 0, 4, 4);
      ctx.fillRect((e.x + 1 + off) | 0, (ey - 1) | 0, 4, 4);
      ctx.restore(); ctx.globalAlpha = 1;
    }
    // small floating HP bar for tanks & elites (bosses use the big top bar)
    if (!e.boss && (e.type === 'tank' || e.elite) && lit > 0.35) {
      const named = e.named, w = named ? 48 : 34, hpf = e.hp / e.maxHP, hy = e.y - (named ? 62 : 56);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(e.x - w / 2 - 1, hy - 1, w + 2, 6);
      ctx.fillStyle = named ? named.color : (e.elite ? e.affix.color : '#c9a23a');
      ctx.fillRect(e.x - w / 2, hy, w * hpf, 4);
      if (named) {                                   // a title plate above the bar
        ctx.save();
        ctx.font = 'bold 10px "Silkscreen", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(named.name, e.x, hy - 5);
        ctx.fillStyle = named.color; ctx.fillText(named.name, e.x, hy - 5);
        ctx.restore();
      }
    }
  },


  _drawProjectile(ctx, pr) {
    ctx.save();
    const col = pr.boss ? '#ff7a2a' : '#b06bff';
    const glow = ctx.createRadialGradient(pr.x, pr.y, 0, pr.x, pr.y, pr.r * 2.4);
    glow.addColorStop(0, col);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r * 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },


  _drawPickup(ctx, pk) {
    const x = pk.x, y = pk.y + Math.sin((this.titleT + pk.x * 0.05) * 4) * 2;
    ctx.save();
    // a small ground shadow that breathes opposite the hover-bob
    const lift = pk.y - y;   // +ve when the piece floats high
    ctx.fillStyle = `rgba(0,0,0,${(0.2 - lift * 0.02).toFixed(3)})`;
    ctx.beginPath(); ctx.ellipse(x, pk.y + 7, Math.max(3, 4.6 - lift * 0.4), 1.8, 0, 0, Math.PI * 2); ctx.fill();
    if (pk.type === 'relic') {
      // a hovering relic gem with a halo + sparkle — unmistakably loot
      const pulse = 0.6 + 0.4 * Math.sin(this.time * 4);
      const g = ctx.createRadialGradient(x, y, 0, x, y, 20);
      g.addColorStop(0, `rgba(255,210,120,${0.5 * pulse})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 20, 0, Math.PI * 2); ctx.fill();
      ctx.translate(x, y); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#7a3ea0'; ctx.fillRect(-5, -5, 10, 10);
      ctx.fillStyle = '#c89aff'; ctx.fillRect(-3.5, -3.5, 7, 7);
      ctx.fillStyle = '#fff3c0'; ctx.fillRect(-3.5, -3.5, 2, 2);
      ctx.restore();
      return;
    }
    if (pk.type === 'gold') {
      // rushing toward the hero (loot vacuum): a short golden comet-tail
      const spd = Math.hypot(pk.vx || 0, pk.vy || 0);
      if (spd > 230) {
        ctx.strokeStyle = 'rgba(255,222,110,0.5)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.lineTo(x - (pk.vx / spd) * 11, y - (pk.vy / spd) * 11); ctx.stroke();
      }
      const g = ctx.createRadialGradient(x, y, 0, x, y, 11);
      g.addColorStop(0, 'rgba(255,220,90,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#caa52a'; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff7d0'; ctx.fillRect(x - 2, y - 2, 1, 2);
      // a passing twinkle, so piles of coin GLINT in the dark
      const tw = (this.time * 1.3 + pk.x * 0.37 + pk.y * 0.11) % 3;
      if (tw < 0.3) {
        const k = 1 - Math.abs(tw - 0.15) / 0.15;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255,250,220,${(k * 0.9).toFixed(3)})`;
        ctx.fillRect(x - 0.75, y - 2 - 4 * k, 1.5, 4 + 8 * k);
        ctx.fillRect(x - 2 - 4 * k, y - 0.75, 4 + 8 * k, 1.5);
        ctx.restore();
      }
    } else { // health
      const g = ctx.createRadialGradient(x, y, 0, x, y, 13);
      g.addColorStop(0, 'rgba(90,200,96,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5ec860'; ctx.fillRect(x - 2, y - 6, 4, 12); ctx.fillRect(x - 6, y - 2, 12, 4);
      ctx.fillStyle = '#b8ffc6'; ctx.fillRect(x - 2, y - 6, 1.5, 12);
    }
    ctx.restore();
  },


  // The swing. Each Living Blade has its OWN cut — not a recolour:
  //   Emberbrand  → a burning cut: flame tongues lick off the arc, embers pop,
  //                 and the path keeps a red afterburn as it fades.
  //   Frostfang   → a crystallizing cut: a hard faceted rim and a fan of ice
  //                 shards that shoot out and hang glinting in the cold.
  //   Stormedge   → the cut IS lightning: a jagged crackling arc that re-rolls
  //                 its jitter every frame, throwing micro-forks off the edge.
  // No blade (shrine/camp) keeps the plain steel crescent.
  _drawSwing(ctx, fx) {
    const p = this.player;
    const style = fx.style || (p.hero && p.hero.swingStyle) || 'sweep';
    const reach = p.reach;
    const arc = p.arcDeg * Math.PI / 180;
    const a = fx.angle, a0 = a - arc / 2;
    const life = fx.t / fx.dur;                          // 0..1 over the whole visual
    const sweep = Math.min(1, fx.t / (fx.dur * 0.42));   // leading edge wipes in fast
    const fade = life < 0.4 ? 1 : Math.max(0, 1 - (life - 0.4) / 0.6);
    // shared geometry for all the renderers below
    const G = {
      a, a0, arc, reach, life, sweep, fade, seed: fx.seed || 0,
      slam: style === 'slam',
      rMid: reach * 0.68,
      outer: reach * (style === 'slam' ? 0.46 : 0.4),
      // point on the crescent spine/rim at sweep-fraction u (off = radial offset)
      at: (u, off = 0) => {
        const ang = a0 + u * arc;
        const r = G.rMid + Math.sin(u * Math.PI) * G.outer * 0.5 + off;
        return [Math.cos(ang) * r, Math.sin(ang) * r, ang];
      },
    };
    ctx.save();
    ctx.translate(fx.x, fx.y);                           // slash stays where it was swung
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';            // additive glow over the dark dungeon

    if (style === 'stab') this._swingStab(ctx, G, fx.blade);
    else if (fx.blade === 'ember') this._swingEmber(ctx, G);
    else if (fx.blade === 'frost') this._swingFrost(ctx, G);
    else if (fx.blade === 'storm') this._swingStorm(ctx, G);
    else this._swingSteel(ctx, G);

    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  },


  // Rogue: a pair of fast dagger streaks + a thin crescent flick (tinted by blade).
  _swingStab(ctx, G, blade) {
    const { a, reach, sweep, fade } = G;
    const tint = { ember: ['255,150,60', '255,220,150'], frost: ['150,225,255', '235,250,255'],
      storm: ['185,150,255', '240,230,255'] }[blade] || ['150,255,200', '180,255,220'];
    for (const off of [-0.16, 0.16]) {
      const aa = a + off;
      const grd = ctx.createLinearGradient(Math.cos(aa) * reach * 0.22, Math.sin(aa) * reach * 0.22,
        Math.cos(aa) * reach * 0.92, Math.sin(aa) * reach * 0.92);
      grd.addColorStop(0, `rgba(${tint[0]},0)`);
      grd.addColorStop(0.6, `rgba(${tint[0]},${0.85 * fade})`);
      grd.addColorStop(1, `rgba(255,255,255,${0.95 * fade})`);
      ctx.strokeStyle = grd; ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(aa) * reach * 0.22, Math.sin(aa) * reach * 0.22);
      ctx.lineTo(Math.cos(aa) * reach * 0.92, Math.sin(aa) * reach * 0.92);
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(${tint[1]},${0.5 * fade})`;
    ctx.fill(this._crescentPath(a - 0.3, 0.6, reach * 0.8, reach * 0.13, 0, sweep));
  },


  // the shared crescent layers (bloom / body / core / rim glint / tip streaks)
  _swingCrescentBase(ctx, G, bloom, body, opts = {}) {
    const { a0, arc, reach, life, sweep, fade, slam, rMid, outer } = G;
    const bodyA = opts.bodyA ?? 0.42, coreA = opts.coreA ?? 0.7;
    if (life < 0.26 && (opts.flash ?? true)) {       // origin flash where the swing begins
      const f = (1 - life / 0.26) * fade;
      const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, reach * 0.4);
      rg.addColorStop(0, `rgba(${body},${0.5 * f})`);
      rg.addColorStop(1, `rgba(${body},0)`);
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(0, 0, reach * 0.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = `rgba(${bloom},${0.20 * fade})`;
    ctx.fill(this._crescentPath(a0, arc, rMid, outer, 0, sweep));
    ctx.fillStyle = `rgba(${body},${bodyA * fade})`;
    ctx.fill(this._crescentPath(a0, arc, rMid, outer * 0.5, 0, sweep));
    if (coreA > 0) {
      ctx.fillStyle = `rgba(255,255,255,${coreA * fade})`;
      ctx.fill(this._crescentPath(a0, arc, rMid, outer * 0.22, 0, sweep));
    }
    if (opts.rim ?? true) {                          // blade-edge glint along the outer rim
      ctx.strokeStyle = `rgba(255,255,255,${0.92 * fade})`; ctx.lineWidth = slam ? 3.5 : 2.5;
      ctx.beginPath();
      const segs = 22;
      for (let i = 0; i <= segs; i++) {
        const [x, y] = G.at((i / segs) * sweep);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    if (opts.tip ?? true) {                          // hot glint flicking off the leading tip
      const [tx, ty, ta] = G.at(sweep), tang = ta + Math.PI / 2;
      ctx.strokeStyle = `rgba(255,255,255,${0.95 * fade})`; ctx.lineWidth = slam ? 4 : 3;
      ctx.beginPath();
      ctx.moveTo(tx - Math.cos(tang) * reach * 0.05, ty - Math.sin(tang) * reach * 0.05);
      ctx.lineTo(tx + Math.cos(tang) * reach * 0.11, ty + Math.sin(tang) * reach * 0.11);
      ctx.stroke();
    }
  },


  // No blade chosen (shrine/camp): the plain steel cut, gold-warm for the Paladin.
  _swingSteel(ctx, G) {
    const { a0, a, arc, reach, sweep, fade, slam } = G;
    this._swingCrescentBase(ctx, G, slam ? '150,90,25' : '60,150,255', slam ? '255,190,90' : '150,220,255');
    if (sweep < 1) {                                 // thin speed lines trailing the edge
      ctx.lineWidth = 1.5;
      for (const k of [0.12, 0.24]) {
        const [x1, y1, aa] = G.at(Math.max(0, sweep - k));
        ctx.strokeStyle = `rgba(150,220,255,${0.5 * (1 - k * 3) * fade})`;
        ctx.beginPath();
        ctx.moveTo(x1 - Math.cos(aa) * 6, y1 - Math.sin(aa) * 6);
        ctx.lineTo(x1 + Math.cos(aa) * 8, y1 + Math.sin(aa) * 8);
        ctx.stroke();
      }
    }
    if (slam && sweep >= 1) {                        // crushing ground-flare at full extension
      ctx.strokeStyle = `rgba(255,150,40,${0.7 * fade})`; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(0, 0, reach * 1.05, a0 - 0.1, a + arc / 2 + 0.1); ctx.stroke();
    }
  },


  // 🔥 EMBERBRAND — no crescent at all: a white-hot lash wipes through, and a
  // WAVE OF REAL FLAME erupts along the cut — tongues billow, curl, lift and
  // break apart as they die (the flame releases WITH the slash, Rengoku-style).
  _swingEmber(ctx, G) {
    const { reach, life, sweep, fade, seed } = G;
    // 1) the cut itself: thin, white-hot, gone in a blink
    if (life < 0.3) {
      const ca = 1 - life / 0.3;
      ctx.strokeStyle = `rgba(255,240,200,${0.95 * ca})`; ctx.lineWidth = 3; ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i <= 20; i++) { const [x, y] = G.at((i / 20) * sweep); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    }
    // 2) the flame wave: tongues are born as the edge passes (the wave ROLLS),
    //    each one growing, curling sideways, lifting off and dying upward
    const N = 13;
    for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N;
      if (u > sweep) break;
      const born = u * 0.22;
      const tl = Math.max(0, Math.min(1, (life - born) / 0.72));
      if (tl <= 0) continue;
      const env = Math.sin(tl * Math.PI);                  // swell → gutter out
      const [bx, by, ang] = G.at(u, -2);
      const ox = Math.cos(ang), oy = Math.sin(ang);
      const tx = -oy, ty = ox;                             // tangent (sideways curl)
      const flick = 0.75 + 0.25 * Math.sin(seed + i * 2.7 + this.time * 19);
      const len = reach * (0.30 + 0.34 * Math.sin(u * Math.PI)) * env * flick;
      const w = (6.5 + 2 * Math.sin(seed + i * 1.7)) * env;
      const drift = tl * tl * 16;                          // dying flames LIFT
      const cx1 = bx + ox * len * 0.5 + tx * Math.sin(seed * 2 + i) * 5;
      const cy1 = by + oy * len * 0.5 - drift * 0.5;
      const tipx = bx + ox * len + tx * Math.sin(this.time * 13 + i * 2) * 4;
      const tipy = by + oy * len - drift;
      // three layered licks: deep red body → orange → a yellow core
      for (const [col, k] of [
        [`rgba(190,40,10,${0.50 * fade})`, 1.25],
        [`rgba(255,120,30,${0.62 * fade})`, 1.0],
        [`rgba(255,220,110,${0.60 * fade})`, 0.55],
      ]) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(bx - tx * w * k, by - ty * w * k);
        ctx.quadraticCurveTo(cx1, cy1, tipx, tipy);
        ctx.quadraticCurveTo(cx1 + tx * w * k * 0.7, cy1 + ty * w * k * 0.7, bx + tx * w * k, by + ty * w * k);
        ctx.closePath(); ctx.fill();
      }
    }
    // 3) ignition flash at the hand as the wave is loosed
    if (life < 0.2) {
      const f = (1 - life / 0.2) * fade;
      const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, reach * 0.5);
      rg.addColorStop(0, `rgba(255,230,170,${0.7 * f})`);
      rg.addColorStop(0.4, `rgba(255,140,40,${0.45 * f})`);
      rg.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(0, 0, reach * 0.5, 0, Math.PI * 2); ctx.fill();
    }
    // 4) embers spat up off the burning arc
    for (let i = 0; i < 8; i++) {
      const u = ((Math.sin(seed * 3.3 + i * 4.7) + 1) / 2) * sweep;
      const [ex, ey] = G.at(u, 2);
      const rise = life * (26 + (i % 4) * 12), wob = Math.sin(this.time * 9 + i * 2.4) * 3;
      const s2 = i % 3 === 0 ? 2.5 : 1.6;
      ctx.fillStyle = i % 2 ? `rgba(255,220,120,${0.85 * fade})` : `rgba(255,110,30,${0.85 * fade})`;
      ctx.fillRect(ex + wob - s2 / 2, ey - rise - s2 / 2, s2, s2);
    }
  },


  // ❄️ FROSTFANG — no crescent: one razor-thin cut-line, and then the slash
  // CRYSTALLIZES — a fan of big faceted ice spikes erupts out of the cut with
  // an overshoot pop and stands frozen, glinting, while the cold mists off it.
  _swingFrost(ctx, G) {
    const { reach, life, sweep, seed } = G;
    const fade = Math.pow(G.fade, 0.65);                   // the cold lingers
    // 1) the cut: surgical, silver, brief
    if (life < 0.35) {
      const ca = 1 - life / 0.35;
      ctx.strokeStyle = `rgba(235,250,255,${0.95 * ca})`; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 18; i++) { const [x, y] = G.at((i / 18) * sweep); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    }
    // 2) crystallization: faceted spikes erupt where the edge passed
    const N = 7;
    const pop = (t) => (t < 0.6 ? 1.15 * (t / 0.6) : 1.15 - 0.15 * ((t - 0.6) / 0.4));   // overshoot, settle
    for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N;
      if (u > sweep) continue;
      const born = u * 0.2 + 0.05;
      const tl = Math.max(0, Math.min(1, (life - born) / 0.5));
      if (tl <= 0) continue;
      const grow = pop(tl);
      const [bx, by, ang] = G.at(u, -1);
      const sa = ang + Math.sin(seed * 2.1 + i * 3.9) * 0.3;     // each spike skewed
      const ox = Math.cos(sa), oy = Math.sin(sa);
      const tx = -oy, ty = ox;
      const len = reach * (0.22 + 0.30 * Math.sin(u * Math.PI)) * grow
        * (0.85 + 0.3 * ((Math.sin(seed + i * 7) + 1) / 2));
      const w = (4.5 + (i % 3)) * grow;
      const tipx = bx + ox * len, tipy = by + oy * len;
      // two-tone facets + a white sun-catch edge: it reads as CUT ICE
      ctx.fillStyle = `rgba(110,180,230,${0.50 * fade})`;
      ctx.beginPath(); ctx.moveTo(bx - tx * w, by - ty * w); ctx.lineTo(tipx, tipy); ctx.lineTo(bx, by); ctx.closePath(); ctx.fill();
      ctx.fillStyle = `rgba(205,240,255,${0.65 * fade})`;
      ctx.beginPath(); ctx.moveTo(bx + tx * w, by + ty * w); ctx.lineTo(tipx, tipy); ctx.lineTo(bx, by); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${0.85 * fade})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bx + tx * w, by + ty * w); ctx.lineTo(tipx, tipy); ctx.stroke();
      // a smaller flanking crystal at every other station
      if (i % 2 === 0) {
        const l2 = len * 0.4;
        ctx.fillStyle = `rgba(170,220,250,${0.5 * fade})`;
        ctx.beginPath();
        ctx.moveTo(bx + tx * (w + 3), by + ty * (w + 3));
        ctx.lineTo(bx + ox * l2 + tx * 4, by + oy * l2 + ty * 4);
        ctx.lineTo(bx + tx, by + ty);
        ctx.closePath(); ctx.fill();
      }
      // glint stars on the standing crystals
      if (tl > 0.55 && (i + Math.floor(this.time * 6)) % 3 === 0) {
        ctx.strokeStyle = `rgba(255,255,255,${0.9 * fade})`; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tipx - 3, tipy); ctx.lineTo(tipx + 3, tipy);
        ctx.moveTo(tipx, tipy - 3); ctx.lineTo(tipx, tipy + 3);
        ctx.stroke();
      }
    }
    // 3) cold mist rolling off the cut
    for (let i = 0; i < 4; i++) {
      const u = ((Math.sin(seed * 5 + i * 3.1) + 1) / 2) * sweep;
      const [mx, my] = G.at(u, 4);
      const mr = 5 + life * 14 + i * 2;
      const mg = ctx.createRadialGradient(mx, my, 0, mx, my, mr);
      mg.addColorStop(0, `rgba(190,233,255,${0.12 * fade})`);
      mg.addColorStop(1, 'rgba(190,233,255,0)');
      ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
    }
  },


  // ⚡ STORMEDGE — no band at all: the swing is 3 REAL bolts that leap from the
  // hand to points across (and past) the arc, re-aimed every crackle tick, each
  // ending in a strike-flash. Pure snap — it's gone almost before it lands.
  _swingStorm(ctx, G) {
    const { a0, arc, life, sweep, seed } = G;
    const fade = Math.pow(G.fade, 1.6);
    const tick = Math.floor(this.time * 36);               // chaos clock
    const rnd = (k) => Math.sin(seed * 9.17 + k * 13.7 + tick * 7.31) * 0.5 + 0.5;
    // the faintest violet wash gives the bolts a stage
    ctx.fillStyle = `rgba(110,80,200,${0.10 * fade})`;
    ctx.fill(this._crescentPath(a0, arc, G.rMid, G.outer * 0.8, 0, sweep));
    for (let b = 0; b < 3; b++) {
      const u = (0.15 + 0.7 * rnd(b * 3 + 1)) * sweep;
      const over = 0.85 + rnd(b * 5 + 2) * 0.5;            // some bolts stab past the arc
      const ang = a0 + u * arc;
      const r = (G.rMid + Math.sin(u * Math.PI) * G.outer * 0.5) * over;
      const ex = Math.cos(ang) * r, ey = Math.sin(ang) * r;
      // jagged leap from the hand to the strike point (glow + white core)
      for (const [col, lw] of [[`rgba(150,110,255,${0.5 * fade})`, 5], [`rgba(248,242,255,${0.95 * fade})`, 1.6]]) {
        ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(0, 0);
        for (let i = 1; i <= 6; i++) {
          const f = i / 6;
          const j = (i < 6) ? (rnd(b * 17 + i) - 0.5) * 22 * (1 - Math.abs(f - 0.5)) : 0;
          ctx.lineTo(ex * f - Math.sin(ang) * j, ey * f + Math.cos(ang) * j);
        }
        ctx.stroke();
      }
      // strike flash where the bolt lands
      const fr = 5 + rnd(b * 7 + 3) * 5;
      const fg = ctx.createRadialGradient(ex, ey, 0, ex, ey, fr * 2.4);
      fg.addColorStop(0, `rgba(240,232,255,${0.8 * fade})`);
      fg.addColorStop(1, 'rgba(140,90,255,0)');
      ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(ex, ey, fr * 2.4, 0, Math.PI * 2); ctx.fill();
    }
    // the hand crackles as the charge releases
    if (life < 0.4) {
      const f = 1 - life / 0.4;
      const og = ctx.createRadialGradient(0, 0, 0, 0, 0, 18);
      og.addColorStop(0, `rgba(240,232,255,${0.7 * f})`);
      og.addColorStop(1, 'rgba(140,90,255,0)');
      ctx.fillStyle = og; ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();
    }
  },


  // Build a tapered crescent (lens) Path2D: pinched to points at both ends, fat
  // in the middle — the classic anime blade-trail shape. `u0..u1` lets the slash
  // "wipe in" along the arc as it's drawn.
  _crescentPath(a0, arc, rMid, thick, u0, u1) {
    const path = new Path2D(), steps = 24;
    for (let i = 0; i <= steps; i++) {
      const u = u0 + (u1 - u0) * (i / steps), ang = a0 + u * arc;
      const t = Math.sin(u * Math.PI), r = rMid + t * thick * 0.5;
      const x = Math.cos(ang) * r, y = Math.sin(ang) * r;
      i === 0 ? path.moveTo(x, y) : path.lineTo(x, y);
    }
    for (let i = steps; i >= 0; i--) {
      const u = u0 + (u1 - u0) * (i / steps), ang = a0 + u * arc;
      const t = Math.sin(u * Math.PI), r = rMid - t * thick * 0.5;
      path.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
    }
    path.closePath();
    return path;
  },
};
