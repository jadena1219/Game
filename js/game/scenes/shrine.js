// The Shrine of Blades: walk up, take a sword, the room turns elemental.
// Split from game.js — method bodies are verbatim; attached to Game.prototype in core.js.
import { Assets } from '../../assets.js';
import { Sound } from '../../audio.js';
import { biomeForLevel } from '../../biomes.js';
import { bladeById } from '../../blades.js';
import { metaBonuses } from '../../meta.js';
import { Player } from '../../player.js';
import { drawSprite, pickFrame } from '../../sprite.js';

export const shrineMethods = {

  // ---------- The Shrine of Blades: the run-opening sword choice ----------
  startShrine() {
    if (this.state !== 'title') return;
    this.heroId = 'knight';
    this.biome = biomeForLevel(1);
    this._buildShrineRoom();
    const mb = this.metaB = metaBonuses(this.meta);
    this.player = new Player(this.world.w / 2, this.world.h / 2, 'knight', mb);
    this.player.blade = null;                            // weaponless until he takes one up
    const W = this.vw, H = this.vh, sy = H * 0.42;
    this.cam.x = 0; this.cam.y = 0;                      // screen-sized chamber at the origin
    // he FALLS into the chamber (continuing the leap into the pit): the drop
    // plays out as the plunge-black clears, landing where he used to just stand
    this.player.x = W / 2; this.player.y = H * 0.30; this.player.faceLeft = false;
    this.bounds = { minX: 40, minY: H * 0.52, maxX: W - 40, maxY: H - 46 };
    this.shrine = { t: 0, chosen: null, drawT: 0, fired: false, near: null, promptFor: undefined,
      amb: 0, ambId: null, flash: 0, lightT: 0,            // scenery-morph state (volcano/blizzard/storm)
      drop: { t: 0, dur: 0.55, y0: H * 0.30, y1: H * 0.82 },
      swords: [ { id: 'ember', x: W * 0.26, y: sy }, { id: 'frost', x: W * 0.5, y: sy - 10 }, { id: 'storm', x: W * 0.74, y: sy } ] };
    this.state = 'shrine';
    Sound.setScene('camp');
    this.ui.swipeTitleAway();
  },


  _buildShrineRoom() {
    const W = this.vw, H = this.vh, b = this.biome;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, b.ground[0]); grd.addColorStop(1, b.ground[1]);
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    if (b.detail) b.detail(g, W, H);
    const rg = g.createRadialGradient(W / 2, H * 0.42, 10, W / 2, H * 0.42, Math.max(W, H) * 0.42);
    rg.addColorStop(0, 'rgba(120,90,170,0.16)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, W, H);
    this._campTorchScreen = [[52, 84], [W - 52, 84]];
    for (const [tx, ty] of this._campTorchScreen) this._bakeBrazierPost(g, tx, ty);
    this._bakeWalls(g, b, W, H);
    const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.26, W / 2, H / 2, Math.max(W, H) * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.64)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    this.shrineBg = c;
  },


  _updateShrine(dt) {
    const sh = this.shrine, p = this.player; sh.t += dt;
    // the fall resolves: he drops out of the dark and lands hard
    if (sh.drop) {
      const d = sh.drop; d.t += dt;
      const k = Math.min(1, d.t / d.dur);
      p.y = d.y0 + (d.y1 - d.y0) * k * k;                // accelerating fall
      p.moving = true;
      if (k >= 1) {
        sh.drop = null; p.moving = false;
        this.shake = Math.max(this.shake, 7);
        this._puff(p.x - 8, p.y, '#4a4350', 3, 6, { r0: 3, r1: 12, dur: 0.4 });
        this._puff(p.x + 8, p.y, '#4a4350', 3, 6, { r0: 3, r1: 12, dur: 0.4 });
        Sound.play('hit', { vol: 0.5 });
      }
      this._updateProjAndFx(dt);
      return;
    }
    if (sh.chosen) {                                     // the chosen blade flies to his hand, then we descend
      sh.amb = Math.min(1, sh.amb + dt * 3);             // its element surges as you take it up
      this._shrineWeather(sh, dt);
      sh.drawT += dt;
      if (sh.drawT >= 0.9 && !sh.fired) { sh.fired = true; this._slashWipe(() => this.start('knight')); }
      return;
    }
    this.input.poll();
    const mv = this.input.move, ml = Math.hypot(mv.x, mv.y);
    if (ml > 0.08) { const spd = p.moveSpeed; p.x += (mv.x / ml) * spd * Math.min(1, ml) * dt; p.y += (mv.y / ml) * spd * Math.min(1, ml) * dt; p.fx = mv.x / ml; p.fy = mv.y / ml; p.faceLeft = p.fx < 0; p.moving = true; } else p.moving = false;
    const b = this.bounds; p.x = Math.max(b.minX, Math.min(b.maxX, p.x)); p.y = Math.max(b.minY, Math.min(b.maxY, p.y));
    let near = null, nd = 80; for (const s of sh.swords) { const d = Math.hypot(p.x - s.x, p.y - (s.y + 20)); if (d < nd) { nd = d; near = s; } }
    sh.near = near;
    const id = near && near.id, was = sh.promptFor && sh.promptFor.id;
    if (id !== was) { sh.promptFor = near; this.ui.setShrinePrompt(near); }
    // the chamber morphs into whichever element you stand before, and melts back
    const target = near ? near.id : null;
    if (sh.ambId === target) sh.amb += ((target ? 1 : 0) - sh.amb) * Math.min(1, dt * 5);
    else { sh.amb -= sh.amb * Math.min(1, dt * 6); if (sh.amb < 0.04) { sh.amb = 0; sh.ambId = target; } }
    this._shrineWeather(sh, dt);
    this._updateProjAndFx(dt);             // landing dust etc. animate out
  },


  _shrineWeather(sh, dt) {
    if (sh.ambId === 'storm' && sh.amb > 0.3) {
      sh.lightT -= dt;
      if (sh.lightT <= 0) { sh.lightT = 0.5 + Math.random() * 1.5; sh.flash = 1; sh.boltX = Math.random() * this.vw; }
    }
    if (sh.flash > 0) sh.flash = Math.max(0, sh.flash - dt * 5);
  },


  chooseShrineBlade(id) {
    if (!this.shrine || this.shrine.chosen) return;
    this.shrine.chosen = id; this.shrine.drawT = 0; this.shrine.fired = false;
    this.setBlade(id);
    this.ui.setShrinePrompt(null);
    Sound.play('relic'); Sound.play('furyready');
    this.flashScreen = Math.max(this.flashScreen, 0.3);
    this.shake = Math.max(this.shake, 6);
  },


  // ---------- The Shrine of Blades render ----------
  _renderShrine(ctx) {
    const W = this.vw, H = this.vh, sh = this.shrine, p = this.player;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    ctx.fillStyle = this.voidColor || '#070510'; ctx.fillRect(-30, -30, W + 60, H + 60);
    if (this.shrineBg) ctx.drawImage(this.shrineBg, 0, 0);
    this._drawShrineMystique(ctx, false);   // cold high light + ground fog (under everything)
    // each blade stands in its own shaft of falling element-light
    for (const s of sh.swords) this._drawShrineShaft(ctx, s);
    for (const s of sh.swords) this._drawPedestal(ctx, s.x, s.y + 46, bladeById(s.id).color);
    // depth-sort the knight among the swords
    const list = sh.swords.map((s) => ({ s, y: s.y })); list.push({ player: true, y: p.y });
    list.sort((a, b) => a.y - b.y);
    for (const it of list) {
      if (it.player) drawSprite(ctx, p.sprite, pickFrame(p, this.time), p.x, p.y, p.faceLeft, 1);
      else this._drawShrineSword(ctx, it.s);
    }
    for (const fx of this.effects) if (fx.kind === 'puff') this._drawPuff(ctx, fx);   // landing dust
    ctx.restore();
    this._drawShrineMystique(ctx, true);    // spirit wisps + the breathing dark (over the scene)
    this._drawShrineAmbiance(ctx, sh);   // volcano / blizzard / storm weather, faded by proximity
    // labels + title (screen space; cam is at the origin so world == screen)
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (!sh.chosen) {
      ctx.globalAlpha = Math.min(1, sh.t * 1.5);
      ctx.font = 'bold 15px "Silkscreen", sans-serif'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText('TAKE UP A BLADE', W / 2, H * 0.12); ctx.fillStyle = '#e9c84a'; ctx.fillText('TAKE UP A BLADE', W / 2, H * 0.12);
      ctx.globalAlpha = 1;
      for (const s of sh.swords) {
        const bd = bladeById(s.id), isNear = sh.near === s;
        ctx.font = `bold ${isNear ? 13 : 11}px "Silkscreen", sans-serif`;
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(bd.name, s.x, s.y + 64); ctx.fillStyle = bd.color; ctx.fillText(bd.name, s.x, s.y + 64);
      }
      const n = sh.near;
      if (n) {                                            // the near blade explains itself
        const bd = bladeById(n.id);
        ctx.font = '11px "Silkscreen", sans-serif';
        for (const [li, line] of this._wrapText(bd.sig, 34).entries()) {
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
          ctx.strokeText(line, W / 2, H * 0.88 + li * 16); ctx.fillStyle = '#e7dcf2'; ctx.fillText(line, W / 2, H * 0.88 + li * 16);
        }
      }
    }
    ctx.restore();
    if (this.state === 'shrine' && !sh.chosen) this.input.draw(ctx, true);   // walking only — no sword yet
    if (this.flashScreen > 0) { ctx.save(); ctx.globalAlpha = Math.min(0.6, this.flashScreen * 2); ctx.fillStyle = '#fff7e0'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
    this._drawPlunge(ctx);               // the fall from the title camp resolves here
    this._drawTransition(ctx);
  },


  // The Shrine of Blades is a haunted place: a cold light falls from somewhere
  // far above, fog creeps along the floor, and the dead drift up to watch the
  // choosing. Two layers: under the pedestals (ray + fog), over the scene
  // (wisps + a breathing edge-dark).
  _drawShrineMystique(ctx, over) {
    const W = this.vw, H = this.vh, t = this.time;
    ctx.save();
    if (!over) {
      ctx.globalCompositeOperation = 'lighter';
      const ray = ctx.createLinearGradient(0, 0, 0, H * 0.75);
      ray.addColorStop(0, 'rgba(150,170,220,0.10)'); ray.addColorStop(1, 'rgba(150,170,220,0)');
      ctx.fillStyle = ray;
      ctx.beginPath();
      ctx.moveTo(W * 0.30, 0); ctx.lineTo(W * 0.70, 0);
      ctx.lineTo(W * 0.86, H * 0.75); ctx.lineTo(W * 0.14, H * 0.75);
      ctx.closePath(); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 3; i++) {                      // fog banks creeping across the floor
        const fy2 = H * (0.62 + i * 0.13);
        const fx2 = ((t * (7 + i * 5) + i * 240) % (W + 360)) - 180;
        ctx.fillStyle = `rgba(140,150,200,${0.045 + i * 0.012})`;
        ctx.beginPath(); ctx.ellipse(fx2, fy2, 190, 26 + i * 8, 0, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 9; i++) {                      // the dead, drifting up to watch
        const ph = (t * 0.12 + i * 0.111) % 1;
        const wx = ((i * 167.7) % W) + Math.sin(t * 0.8 + i * 2.2) * 24;
        const wy = H * (1.02 - ph);
        const a = Math.sin(ph * Math.PI) * (0.22 + (i % 3) * 0.05) * (0.6 + 0.4 * Math.sin(t * 3 + i * 1.7));
        ctx.globalAlpha = Math.max(0, a);
        ctx.fillStyle = i % 3 ? '#9fb6e8' : '#cfe0ff';
        ctx.fillRect(wx | 0, wy | 0, 2, 2);
        ctx.globalAlpha *= 0.4; ctx.fillRect(wx | 0, (wy + 3) | 0, 1, 3);
      }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      const v = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.25, W / 2, H * 0.5, Math.max(W, H) * 0.7);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, `rgba(2,2,10,${0.34 + 0.05 * Math.sin(t * 0.7)})`);
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore(); ctx.globalAlpha = 1;
  },


  // The room transforms into the element of whichever blade you stand before.
  _drawShrineAmbiance(ctx, sh) {
    const amb = sh.amb; if (amb <= 0.01 || !sh.ambId) return;
    const W = this.vw, H = this.vh, t = this.time;
    ctx.save();
    if (sh.ambId === 'ember') {                                  // VOLCANO
      const g = ctx.createLinearGradient(0, H, 0, 0);
      g.addColorStop(0, `rgba(255,70,15,${0.42 * amb})`); g.addColorStop(0.45, `rgba(180,40,10,${0.16 * amb})`); g.addColorStop(1, `rgba(40,6,0,${0.1 * amb})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      // molten cracks crawling across the floor
      for (let i = 0; i < 7; i++) {
        const x = (i * 137.3) % (W - 60) + 20, y = H * 0.55 + (i * 53) % (H * 0.38), pulse = 0.5 + 0.5 * Math.sin(t * 3 + i);
        ctx.strokeStyle = `rgba(255,${(120 + 90 * pulse) | 0},30,${0.55 * amb})`; ctx.lineWidth = 2 + pulse;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 16, y + 7); ctx.lineTo(x + 30, y + 1); ctx.lineTo(x + 52, y + 11); ctx.lineTo(x + 70, y + 4); ctx.stroke();
      }
      // flame columns roaring up the side walls
      for (const sx of [16, W - 16]) for (let i = 0; i < 7; i++) {
        const fl = 0.5 + 0.5 * Math.sin(t * 8 + i * 1.3 + sx); const fy = H - i * 26 - fl * 18;
        ctx.globalAlpha = amb * (0.6 - i * 0.06); ctx.fillStyle = i % 2 ? '#ff7a2a' : '#ffce5a';
        ctx.fillRect(sx - 5 + Math.sin(t * 6 + i) * 3, fy, 8, 14);
      }
      // a storm of rising embers
      for (let i = 0; i < 60; i++) {
        const ph = (t * 0.5 + i * 0.0137) % 1, x = (i * 73.7) % W + Math.sin(t * 2 + i) * 9, y = H - ph * H * 1.05;
        ctx.globalAlpha = amb * (1 - ph) * 0.9; ctx.fillStyle = i % 2 ? '#ffb02a' : '#ff5a1e'; ctx.fillRect(x | 0, y | 0, 2, 2 + (i % 2));
      }
      // drifting ash
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 26; i++) {
        const ph = (t * 0.18 + i * 0.05) % 1, x = ((i * 91.3) + t * 14) % W, y = ph * H;
        ctx.globalAlpha = amb * 0.4; ctx.fillStyle = '#3a2a24'; ctx.fillRect(x | 0, y | 0, 2, 2);
      }
    } else if (sh.ambId === 'frost') {                           // BLIZZARD
      // a blizzard at NIGHT: a thin cold cast and dark frozen edges — the room
      // stays a dungeon, and the white lives in the driving snow itself
      ctx.fillStyle = `rgba(140,190,235,${0.09 * amb})`; ctx.fillRect(0, 0, W, H);
      const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.15, W / 2, H / 2, Math.max(W, H) * 0.7);
      v.addColorStop(0, 'rgba(10,20,40,0)'); v.addColorStop(1, `rgba(12,26,52,${0.5 * amb})`);
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
      // drifting fog bands
      for (let i = 0; i < 3; i++) {
        const fy = (H * 0.3 + i * H * 0.25), fx = ((t * (18 + i * 8)) % (W + 200)) - 100;
        ctx.fillStyle = `rgba(220,238,255,${0.06 * amb})`; ctx.beginPath(); ctx.ellipse(fx, fy, 160, 30, 0, 0, Math.PI * 2); ctx.fill();
      }
      // frost crusting the floor
      ctx.fillStyle = `rgba(220,245,255,${0.14 * amb})`;
      for (let i = 0; i < 7; i++) { const x = (i * 131) % W; ctx.beginPath(); ctx.ellipse(x, H - 18 - (i % 2) * 16, 34, 9, 0, 0, Math.PI * 2); ctx.fill(); }
      // driving snow — two layers, near flakes bigger & faster
      for (let i = 0; i < 110; i++) {
        const sp = (i % 4) + 1, x = ((i * 53.3) + t * 80 * sp) % (W + 40) - 20 + Math.sin(t * 1.4 + i) * 8, y = ((i * 71.1) + t * 150 * sp) % (H + 40) - 20;
        ctx.globalAlpha = amb * (0.5 + sp * 0.12); ctx.fillStyle = '#f2ffff'; ctx.fillRect(x | 0, y | 0, sp, sp);
      }
    } else if (sh.ambId === 'storm') {                           // TEMPEST
      ctx.fillStyle = `rgba(16,10,40,${0.46 * amb})`; ctx.fillRect(0, 0, W, H);
      // two rain layers
      ctx.strokeStyle = `rgba(170,160,230,${0.45 * amb})`; ctx.lineWidth = 1;
      for (let i = 0; i < 70; i++) { const x = ((i * 61.7) + t * 130) % (W + 60) - 30, y = ((i * 47.3) + t * 540) % (H + 60) - 30; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 6, y + 16); ctx.stroke(); }
      ctx.strokeStyle = `rgba(200,190,255,${0.55 * amb})`; ctx.lineWidth = 2;
      for (let i = 0; i < 36; i++) { const x = ((i * 97.1) + t * 200) % (W + 80) - 40, y = ((i * 59.7) + t * 760) % (H + 80) - 40; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 9, y + 22); ctx.stroke(); }
      // rain spattering the floor
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 16; i++) { const x = ((i * 113 + ((t * 3) | 0) * 37) % W), a2 = (Math.sin(t * 20 + i) > 0.6) ? 0.5 : 0; ctx.globalAlpha = amb * a2; ctx.fillStyle = '#b9aaff'; ctx.fillRect(x, H - 22, 3, 1); }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      if (sh.flash > 0) {
        ctx.fillStyle = `rgba(175,140,255,${0.55 * sh.flash * amb})`; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = `rgba(235,218,255,${sh.flash * amb})`; ctx.lineWidth = 2 + 2 * sh.flash;
        let bx = sh.boltX || W * 0.5, by = 0; ctx.beginPath(); ctx.moveTo(bx, by);
        for (let s = 0; s < 7; s++) { bx += ((s * 97 + (sh.boltX | 0)) % 80 - 40) * 0.8; by += H / 7; ctx.lineTo(bx, by); }
        ctx.stroke();
        // a couple of forks
        ctx.lineWidth = 1.5; for (let f = 0; f < 2; f++) { let fx = sh.boltX + (f ? 30 : -30), fy = H * 0.4; ctx.beginPath(); ctx.moveTo(fx, fy); for (let s = 0; s < 3; s++) { fx += (f ? 14 : -14); fy += H * 0.12; ctx.lineTo(fx, fy); } ctx.stroke(); }
      }
    }
    ctx.restore(); ctx.globalAlpha = 1;
  },


  // A god-ray falling from the dark onto each pedestal, in the blade's colour.
  _drawShrineShaft(ctx, s) {
    const bd = bladeById(s.id), t = this.time;
    const flick = 0.85 + 0.15 * Math.sin(t * 2.1 + s.x * 0.13);
    const topW = 13, botW = 38, by = s.y + 52;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(0, 0, 0, by);
    g.addColorStop(0, this._rgba(bd.color, 0.16 * flick));
    g.addColorStop(0.7, this._rgba(bd.color, 0.07 * flick));
    g.addColorStop(1, this._rgba(bd.color, 0.02));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(s.x - topW, 0); ctx.lineTo(s.x + topW, 0);
    ctx.lineTo(s.x + botW, by); ctx.lineTo(s.x - botW, by);
    ctx.closePath(); ctx.fill();
    // the pool of light where the ray lands
    const pg = ctx.createRadialGradient(s.x, by, 4, s.x, by, 56);
    pg.addColorStop(0, this._rgba(bd.color, 0.22 * flick)); pg.addColorStop(1, this._rgba(bd.color, 0));
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.ellipse(s.x, by, 56, 22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },


  _drawPedestal(ctx, x, y, col = '#9a6ce0') {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(x, y + 7, 24, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#322d42'; ctx.fillRect(x - 17, y - 7, 34, 13);
    ctx.fillStyle = '#473f5c'; ctx.fillRect(x - 17, y - 7, 34, 3);
    ctx.fillStyle = '#221d30'; ctx.fillRect(x - 13, y + 6, 26, 7);
    // a band of living runes in the blade's colour, breathing
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 2.4 + x * 0.11);
    ctx.globalAlpha = 0.55 + 0.4 * pulse;
    ctx.fillStyle = col;
    for (let i = 0; i < 4; i++) ctx.fillRect(x - 12 + i * 7, y - 2, 3, 2);
    ctx.globalAlpha = 1;
    ctx.restore();
  },


  _drawShrineSword(ctx, s) {
    const sh = this.shrine, bd = bladeById(s.id), sword = Assets.bladeSwords && Assets.bladeSwords[s.id];
    const t = this.time;
    let cx = s.x, cy = s.y, alpha = 1, scale = 1.35, glowR = 44;
    if (sh.chosen) {
      if (s.id === sh.chosen) { const k = Math.min(1, sh.drawT / 0.9); cx = s.x + (this.player.x - s.x) * k; cy = (s.y) + (this.player.y - 24 - s.y) * k; scale = 1.35 - 0.55 * k; glowR = 44 + 70 * k * (1 - k); }
      else { alpha = Math.max(0, 1 - sh.drawT * 2.6); }
    }
    if (alpha <= 0) return;
    const bob = (sh.chosen === s.id) ? 0 : Math.sin(t * 1.5 + s.x * 0.05) * 4;
    const sway = Math.sin(t * 1.1 + s.x * 0.07) * 0.08;
    cy += bob;
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.5 + 0.5 * Math.sin(t * 3 + s.x);
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, glowR);
    g.addColorStop(0, this._rgba(bd.color, 0.45 + 0.2 * pulse)); g.addColorStop(1, this._rgba(bd.color, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, glowR, 0, Math.PI * 2); ctx.fill();
    // rising/falling element motes
    for (let i = 0; i < 6; i++) {
      const ph = (t * 0.5 + i * 0.17 + s.x * 0.1) % 1;
      const px = cx + Math.sin(t * 1.4 + i * 2) * 18;
      const py = s.id === 'frost' ? cy - 34 + ph * 66 : cy + 32 - ph * 66;
      ctx.globalAlpha = alpha * (1 - ph) * 0.85; ctx.fillStyle = ph < 0.5 ? '#ffffff' : bd.color;
      ctx.fillRect(Math.round(px), Math.round(py), 2, 2);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = alpha;
    if (sword) {
      const w = 30 * scale, h = 104 * scale;
      ctx.translate(cx, cy); ctx.rotate(sway); ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sword, -w / 2, -h / 2, w, h);
    }
    ctx.restore(); ctx.globalAlpha = 1;
  },
};
