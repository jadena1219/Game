// The between-floor camp: sorcerer, events, the descent pit (torn-pit painters shared with the title live here).
// Split from game.js — method bodies are verbatim; attached to Game.prototype in core.js.
import { RELICS, recompute, rollStock } from '../../abilities.js';
import { Sound } from '../../audio.js';
import { BLADE_MILESTONES, bladeById } from '../../blades.js';
import { pickEvent } from '../../events.js';
import { drawSprite } from '../../sprite.js';
import { LORD_REACTIONS } from '../data.js';

export const campMethods = {

  // ---- the camp: an in-world safe room with a sorcerer to trade with and a
  // glowing door to descend through ----
  openCamp() {
    Sound.setScene('camp');
    this.shopStock = rollStock(this.player, this.shopSlots || 4);
    // rerolls open cheap and climb steeply: early wallets can afford ONE second
    // opinion, while late-game gold can't just spin the wheel forever
    this.rerollCost = 6;
    this.shopOpen = false;
    this.enemies = []; this.projectiles = []; this.allyProjectiles = []; this.pickups = [];
    this.effects = [];                      // clear leftover swing arcs / damage numbers / death fx
    this.decals = [];                       // the camp floor is swept clean
    this.hitStop = 0; this.timeScale = 1;
    this.descentJump = null; this.plunge = null; this.camDrop = 0; this.descentSink = 0;
    this.watchers = []; this.campWhisper = null;
    this._watchT = 3.5 + Math.random() * 3; this._whisperT = 4 + Math.random() * 4;
    this._buildCampRoom();
    // a small, contained room centred in the world; the camera stays put
    const ox = Math.round(this.world.w / 2 - this.vw / 2);
    const oy = Math.round(this.world.h / 2 - this.vh / 2);
    this.cam.x = ox; this.cam.y = oy;
    this.player.x = ox + this.vw * 0.5; this.player.y = oy + this.vh * 0.30;
    this.player.dashTimer = 0; this.player.swingTimer = 0; this.player.invuln = 0;
    this.forceElite = 0;                    // reset any pending event-ambush
    const b = this.biome;
    // A fork in the dark is the signature of the descent, so it almost always
    // opens — but never the same one twice running (pickEvent skips the recent),
    // and never two blank camps in a row (pity). Variety keeps it special; the
    // reliability lets the player build a run around the gambles.
    const forced = (this._campsSinceEvent || 0) >= 1;
    const event = (forced || Math.random() < 0.82) ? pickEvent(this) : null;
    this._campsSinceEvent = event ? 0 : (this._campsSinceEvent || 0) + 1;
    if (event) this._eventsRecent = [event.id, ...(this._eventsRecent || [])].slice(0, 3);
    this.camp = {
      sorcerer: { x: ox + this.vw * 0.74, y: oy + this.vh * 0.42 },
      door: { x: ox + this.vw * 0.5, y: oy + this.vh - 120 },  // a hole in the floor — room to walk all around it
      shrine: event ? { x: ox + this.vw * 0.26, y: oy + this.vh * 0.46 } : null,
      event, eventUsed: false,
      torches: this._campTorchScreen.map(([x, y]) => ({ x: ox + x, y: oy + y, lava: !!b.lava, torch: b.torch })),
      prompt: null, t: 0,
    };
    // keep the player inside the little room — floor now extends below the pit so
    // you can circle it completely (down to just above the bottom wall)
    this.bounds = { minX: ox + 46, minY: oy + 50, maxX: ox + this.vw - 46, maxY: oy + this.vh - 40 };
    this.state = 'camp';
    this.ui.showScreen(null);
    this.ui.setCampPrompt(null);
    // the Living Blade hungers — offer an evolution at floors 5 / 10 / 15
    const tier = this.player.bladeTier || 0;
    if (this.player.blade && tier < 3 && this.level >= BLADE_MILESTONES[tier]) {
      this._bladeEvolveDue = tier;
      this.ui.showBladeEvolve(this, bladeById(this.player.blade), tier);
    } else { this._bladeEvolveDue = null; }
  },


  // pick one of the two evolution options offered for the current tier
  chooseBladeEvolve(idx) {
    const tier = this._bladeEvolveDue;
    if (tier == null) { this.ui.hideEvent(); return; }
    const blade = bladeById(this.player.blade);
    const opt = blade.tiers[tier][idx];
    this.player.bladeUp.add(opt.id);
    this.player.bladeTier = tier + 1;
    this._bladeEvolveDue = null;
    Sound.play('relic');
    this.ui.hideEvent();
    this.campToast = { text: `${blade.name} awakens: ${opt.name}.`, t: 0, dur: 4.2 };
  },


  // chosen at the title before a run
  setBlade(id) { this.bladeId = id; if (this.player) this.player.blade = id; },


  // Bake a small, screen-sized stone room for the camp (walls + torches + a rug).
  _buildCampRoom() {
    const W = this.vw, H = this.vh, b = this.biome;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, b.ground[0]); grd.addColorStop(1, b.ground[1]);
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    if (b.detail) b.detail(g, W, H);
    // a circular trade rug in the middle-right (toward the sorcerer)
    g.save();
    const rg = g.createRadialGradient(W * 0.5, H * 0.5, 10, W * 0.5, H * 0.5, H * 0.34);
    rg.addColorStop(0, 'rgba(120,90,40,0.18)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, W, H); g.restore();
    // torch posts at the four inner corners
    this._campTorchScreen = [[52, 78], [W - 52, 78], [52, H - 96], [W - 52, H - 96]];
    for (const [tx, ty] of this._campTorchScreen) this._bakeBrazierPost(g, tx, ty);
    this._bakeWalls(g, b, W, H);
    const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    this.campBg = c;
  },


  _updateCamp(dt) {
    if (this.transition && this.transition.t < this.transition.half) return;
    this.camp.t += dt;
    if (this.descentJump) return this._updateDescentJump(dt);   // leaping into the pit
    if (this.shopOpen) return;                 // frozen while the shop panel is open
    this.input.poll();
    const p = this.player;
    p.update(dt, this.input, this);
    // the descent pit is solid — you can stand at its rim, but not on the mouth
    {
      const d = this.camp.door, erx = 84, ery = 48, ecx = d.x, ecy = d.y;
      const nx = (p.x - ecx) / erx, ny = (p.y - ecy) / ery, dl = Math.hypot(nx, ny);
      if (dl < 1 && dl > 1e-4) { p.x = ecx + (nx / dl) * erx; p.y = ecy + (ny / dl) * ery; }
    }
    this._dashTrail(p, dt);                     // dash trail in the camp too
    this._updateProjAndFx(dt);                 // animate & clear any practice-swing arcs
    const c = this.camp;
    const sd = Math.hypot(p.x - c.sorcerer.x, p.y - c.sorcerer.y);
    const dd = Math.hypot(p.x - c.door.x, p.y - c.door.y);
    const shrineLive = c.shrine && !c.eventUsed;
    const ss = shrineLive ? Math.hypot(p.x - c.shrine.x, p.y - c.shrine.y) : Infinity;
    let prompt = null;
    if (sd < 70) prompt = 'sorcerer';
    else if (ss < 66) prompt = 'shrine';
    else if (dd < 72) prompt = 'door';
    if (prompt !== c.prompt) { c.prompt = prompt; this.ui.setCampPrompt(prompt); }
  },


  // The knight physically leaps from wherever he stands into the pit; when he
  // lands in the mouth the world plunges into darkness (the existing transition).
  _updateDescentJump(dt) {
    const j = this.descentJump; j.t += dt;
    const p = this.player, raw = Math.min(1, j.t / j.dur);
    const HOP = 0.62;                               // first part arcs to the mouth...
    if (raw <= HOP) {
      const prog = raw / HOP;
      p.x = j.x0 + (j.tx - j.x0) * prog;
      const by = j.y0 + (j.ty - j.y0) * prog;
      p.y = by - j.h * Math.sin(prog * Math.PI);    // parabolic hop
      this.descentSink = 0;
    } else {
      // ...the rest drops STRAIGHT down into the dark and fades, so the plunge
      // takes over from an empty pit (no frozen frame of the knight on the rim).
      const s = (raw - HOP) / (1 - HOP);
      p.x = j.tx; p.y = j.ty + s * 24;
      this.descentSink = s;
    }
    p.moving = false; p.attackAnim = 0; p.swingTimer = 0; p.dashTimer = 0;
    if (j.tx < j.x0 - 1) p.faceLeft = true; else if (j.tx > j.x0 + 1) p.faceLeft = false;
    this._updateProjAndFx(dt);
    if (raw >= 1) { this.descentJump = null; this.descend(); }
  },


  // called by the floating prompt button / shop panel
  campTrade() { if (this.state === 'camp') { this.shopOpen = true; this.ui.setCampPrompt(null); this.ui.showShop(this); } },

  campDescend() {
    if (this.state !== 'camp' || this.descentJump || this.plunge) return;
    this.ui.setCampPrompt(null); this.ui.hideShop();
    const d = this.camp.door, p = this.player;
    this._puff(p.x, p.y, '#4a4350', 2, 4, { r0: 2, r1: 9, dur: 0.3 });   // takeoff dust
    Sound.play('jump');
    this.descentSink = 0;
    this.descentJump = { t: 0, dur: 0.72, x0: p.x, y0: p.y, tx: d.x, ty: d.y - 2, h: 50 };
  },

  closeShop() { this.shopOpen = false; this.ui.hideShop(); },


  // ---- dungeon event (the third path) ----
  campInspect() {
    if (this.state !== 'camp' || !this.camp.event || this.camp.eventUsed) return;
    this.shopOpen = true; this.ui.setCampPrompt(null);
    this.ui.showEvent(this, this.camp.event);
  },

  // Pick a choice: apply it, close the panel immediately (no Continue step —
  // the second choice IS the "leave it" option), and float the outcome as a toast.
  resolveEvent(idx) {
    const ev = this.camp.event;
    const res = ev.choices[idx].apply(this);
    this.camp.eventUsed = true; this.camp.prompt = null;
    this.shopOpen = false;
    this.ui.hideEvent(); this.ui.setCampPrompt(null);
    this.campToast = { text: res, t: 0, dur: 4.2 };
    // THE LORD WAS WATCHING: choices with his fingerprints on them earn a
    // personal word at the next interlude — he remembers what you did
    const key = ev.id + ':' + idx;
    const line = LORD_REACTIONS[key];
    if (line) (this._lordQueue || (this._lordQueue = [])).push(line);
  },


  buyWare(ware) {
    if (!ware || ware.sold || this.gold < ware.cost) return false;
    const p = this.player;
    this.gold -= ware.cost;
    if (ware.kind === 'forge') {
      const before = p.maxHP;
      p.forge[ware.id] = (p.forge[ware.id] || 0) + 1;
      recompute(p);
      if (ware.id === 'armor') p.hp += p.maxHP - before;   // new armor heals the gained HP
    } else {
      p.relics.add(ware.id);
      recompute(p);
      p.hp = Math.min(p.hp, p.maxHP);          // a cursed relic may have lowered max HP
    }
    ware.sold = true;
    return true;
  },


  rerollShop() {
    if (this.gold < this.rerollCost) return false;
    this.gold -= this.rerollCost;
    this.rerollCost += 8;
    this.shopStock = rollStock(this.player, this.shopSlots || 4);
    return true;
  },


  // Cursed shrine: gamble gold for a chance at a random relic.
  gambleShrine() {
    const cost = 30;
    if (this.gold < cost) return { ok: false };
    this.gold -= cost;
    const p = this.player;
    const locked = p.lockedRelics || new Set();
    const unowned = RELICS.filter((r) => !p.relics.has(r.id) && !locked.has(r.id));
    const r = Math.random();
    if (r < 0.6 && unowned.length) {
      const relic = unowned[(Math.random() * unowned.length) | 0];
      p.relics.add(relic.id); recompute(p);
      return { ok: true, kind: 'relic', name: relic.name, icon: relic.icon };
    }
    if (r < 0.85) { this.gold += 12; this.totalGold += 12; return { ok: true, kind: 'gold', amount: 12 }; }
    return { ok: true, kind: 'nothing' };
  },


  _drawCampFloor(ctx) {
    const t = this.camp.t;
    this._drawDescentPit(ctx, this.camp.door, t);

    // the sorcerer's table
    const s = this.camp.sorcerer, tx = s.x, ty = s.y + 20;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(tx, ty + 8, 30, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a3320'; ctx.fillRect(tx - 26, ty - 4, 52, 12);       // top
    ctx.fillStyle = '#33230f'; ctx.fillRect(tx - 26, ty + 4, 52, 4);
    ctx.fillStyle = '#3a2818'; ctx.fillRect(tx - 22, ty + 8, 4, 12); ctx.fillRect(tx + 18, ty + 8, 4, 12); // legs
    // wares on the table: candle + potions
    ctx.fillStyle = '#caa54a'; ctx.fillRect(tx - 20, ty - 9, 3, 5);
    const fl = 0.6 + 0.4 * Math.sin(t * 9);
    ctx.fillStyle = `rgba(255,180,80,${fl})`; ctx.fillRect(tx - 19, ty - 12, 1, 3);
    ctx.fillStyle = '#7fe0a0'; ctx.fillRect(tx - 4, ty - 9, 4, 5);          // green potion
    ctx.fillStyle = '#e06a9a'; ctx.fillRect(tx + 10, ty - 8, 4, 4);        // pink potion
    ctx.restore();

    // the event shrine (the third path)
    if (this.camp.shrine && !this.camp.eventUsed) this._drawShrine(ctx, this.camp.shrine, this.camp.event);
  },


  _drawShrine(ctx, sh, ev) {
    const t = this.camp.t, pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
    const col = ev.color || '#b06bff';
    const x = sh.x, y = sh.y;
    ctx.save();
    // ground glow
    const g = ctx.createRadialGradient(x, y - 6, 3, x, y - 6, 56);
    g.addColorStop(0, this._rgba(col, 0.4 + 0.25 * pulse)); g.addColorStop(1, this._rgba(col, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - 6, 56, 0, Math.PI * 2); ctx.fill();
    // shadow + stone plinth
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y + 12, 22, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a3446'; ctx.fillRect(x - 16, y + 2, 32, 12);        // base
    ctx.fillStyle = '#4a4458'; ctx.fillRect(x - 13, y - 10, 26, 14);       // pillar
    ctx.fillStyle = '#2a2636'; ctx.fillRect(x - 13, y + 2, 26, 2);
    // a floating rune-stone / sigil bobbing above
    const ry = y - 24 + Math.sin(t * 2) * 2.5;
    ctx.fillStyle = this._rgba(col, 0.9);
    ctx.save(); ctx.translate(x, ry); ctx.rotate(t * 0.6);
    ctx.fillRect(-7, -7, 14, 14);
    ctx.fillStyle = '#100a18'; ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();
    // its glow
    const og = ctx.createRadialGradient(x, ry, 0, x, ry, 16 + pulse * 4);
    og.addColorStop(0, this._rgba(col, 0.7)); og.addColorStop(1, this._rgba(col, 0));
    ctx.fillStyle = og; ctx.beginPath(); ctx.arc(x, ry, 16 + pulse * 4, 0, Math.PI * 2); ctx.fill();
    // rising motes
    for (let i = 0; i < 3; i++) {
      const my = y - ((t * 22 + i * 16) % 44);
      ctx.fillStyle = this._rgba(col, 0.6 * pulse);
      ctx.fillRect(x - 10 + ((i * 7 + t * 9) % 20), my, 2, 2);
    }
    ctx.restore();
  },


  _drawSorcerer(ctx, s) {
    const t = this.camp.t;
    // grounded like everyone else (he hovers in spirit, not in fact)
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(s.x, s.y + 5, 14, 4.8, 0, 0, Math.PI * 2); ctx.fill();
    // arcane aura
    ctx.save();
    const aur = ctx.createRadialGradient(s.x, s.y - 14, 2, s.x, s.y - 14, 40);
    aur.addColorStop(0, `rgba(150,110,230,${0.3 + 0.1 * Math.sin(t * 2)})`);
    aur.addColorStop(1, 'rgba(120,80,200,0)');
    ctx.fillStyle = aur; ctx.beginPath(); ctx.arc(s.x, s.y - 14, 40, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    const frame = (t % 1.4) < 0.7 ? 'idle' : 'walkA';
    drawSprite(ctx, 'sorcerer', frame, s.x, s.y - Math.sin(t * 2) * 1.5, true, 1.5);
    // floating orb above his hand
    const ox = s.x - 12, oy = s.y - 22 + Math.sin(t * 3) * 2;
    ctx.save();
    const og = ctx.createRadialGradient(ox, oy, 0, ox, oy, 7);
    og.addColorStop(0, '#e9d8ff'); og.addColorStop(0.6, '#9a6ce0'); og.addColorStop(1, 'rgba(120,80,200,0)');
    ctx.fillStyle = og; ctx.beginPath(); ctx.arc(ox, oy, 7, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },


  _drawCampLabels(ctx) {
    const t = this.camp.t, c = this.camp;
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const label = (text, x, y, col, glow) => {
      ctx.font = 'bold 13px "Silkscreen", sans-serif';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(text, x, y); ctx.fillStyle = col; ctx.fillText(text, x, y);
    };
    const bob = Math.sin(t * 2.5) * 2;
    label('The Sorcerer', c.sorcerer.x, c.sorcerer.y - 94 + bob, '#9af0ff');
    label('Descend ▾', c.door.x, c.door.y - 72 + bob, '#ffb487');
    if (c.shrine && !c.eventUsed) label('? ? ?', c.shrine.x, c.shrine.y - 52 + bob, c.event.color || '#c8a8ff');
    ctx.restore();
  },


  // ---- camp room props ----
  // A deterministic torn-mouth rim (16 jagged points) for a pit centred at (cx,cy).
  _pitRim(cx, cy) {
    const rim = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const hsh = Math.sin(i * 12.9898 + 4.13) * 43758.5453;
      const j = hsh - Math.floor(hsh);
      rim.push([cx + Math.cos(a) * (80 + j * 18 - 9), cy + Math.sin(a) * (42 + ((j * 7) % 1) * 10 - 5)]);
    }
    return rim;
  },


  // THE PIT — one pit for the whole game: a torn mouth ripped in the stone (no
  // doorway), a broken-soil lip with cracks radiating out, a black throat
  // falling to a deep ember glow that swells as you near, and sparks rising.
  // Drawn entirely at frame time so the camp and the title camp look identical.
  _drawTornPit(ctx, cx, cy, t, near, rim) {
    rim = rim || this._pitRim(cx, cy);
    const trace = () => { ctx.beginPath(); rim.forEach(([x2, y2], i) => (i ? ctx.lineTo(x2, y2) : ctx.moveTo(x2, y2))); ctx.closePath(); };
    ctx.save();
    ctx.lineJoin = 'round';
    // broken-soil lip
    trace(); ctx.lineWidth = 16; ctx.strokeStyle = '#171221'; ctx.stroke();
    ctx.lineWidth = 6; ctx.strokeStyle = '#241c30'; ctx.stroke();
    // cracks radiating into the floor
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.4;
      const x0 = cx + Math.cos(a) * 86, y0 = cy + Math.sin(a) * 48;
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + Math.cos(a) * 16 + 4, y0 + Math.sin(a) * 10 - 3);
      ctx.lineTo(x0 + Math.cos(a) * 30 - 3, y0 + Math.sin(a) * 19 + 2);
      ctx.stroke();
    }
    // the black throat, falling to embers — gradients cached origin-relative
    // (per-frame gradient creation was a Chrome jank source)
    ctx.translate(cx, cy);
    const traceR = (dy = 0) => {
      ctx.beginPath();
      rim.forEach(([x2, y2], i) => (i ? ctx.lineTo(x2 - cx, y2 - cy + dy) : ctx.moveTo(x2 - cx, y2 - cy + dy)));
      ctx.closePath();
    };
    traceR();
    ctx.fillStyle = this._tGrad('pit_vg', () => {
      const gg = ctx.createLinearGradient(0, -48, 0, 44);
      gg.addColorStop(0, '#020108'); gg.addColorStop(0.55, '#0a0306'); gg.addColorStop(1, '#2e0c06');
      return gg;
    });
    ctx.fill();
    ctx.clip();
    // THE LONG DESCENT: peer in and the shaft falls away — ledge after ledge,
    // each ring tinted by the act it belongs to, down and down to a point of
    // dark where two red eyes wait. (Strata breathe; the eyes blink.)
    {
      const ACTS = ['#6b6276', '#2a6a6e', '#5a4a3a', '#4a2a7a', '#6a1a24', '#2a3a6e'];
      const breathe = Math.sin(t * 0.8) * 1.5;
      for (let i = 0; i < 6; i++) {
        const f2 = (i + 1) / 7;
        const rx2 = 64 * (1 - f2 * 0.82) + breathe * (1 - f2);
        const ry2 = 30 * (1 - f2 * 0.82);
        const dy2 = 4 + f2 * 26;
        ctx.globalAlpha = (0.20 - i * 0.024) * (0.6 + 0.4 * near);
        ctx.strokeStyle = ACTS[i]; ctx.lineWidth = 2.5 - i * 0.25;
        ctx.beginPath(); ctx.ellipse(0, dy2, rx2, ry2, 0, 0, Math.PI * 2); ctx.stroke();
      }
      // the eyes at the bottom of everything — they blink, and they see you
      const blink = ((t + 1.7) % 4.6) > 0.18;
      if (blink) {
        ctx.globalAlpha = 0.35 + 0.6 * near;
        ctx.fillStyle = '#ff2a16';
        ctx.fillRect(-4, 28, 2, 2); ctx.fillRect(2, 28, 2, 2);
        ctx.globalAlpha *= 0.4;
        ctx.fillRect(-5, 27, 4, 4); ctx.fillRect(1, 27, 4, 4);
      }
      ctx.globalAlpha = 1;
    }
    // a ledge of stone catching light just inside the rim — the depth read
    ctx.strokeStyle = 'rgba(200,190,230,0.10)'; ctx.lineWidth = 2;
    traceR(-5); ctx.stroke();
    // the ember glow far below, swelling as you draw near (alpha-driven)
    ctx.globalAlpha = 0.26 + 0.22 * near + 0.07 * Math.sin(t * 2.4);
    ctx.fillStyle = this._tGrad('pit_eg', () => {
      const gg = ctx.createRadialGradient(0, 30, 2, 0, 30, 66);
      gg.addColorStop(0, 'rgba(255,110,40,1)'); gg.addColorStop(1, 'rgba(120,30,8,0)');
      return gg;
    });
    ctx.fillRect(-84, -30, 168, 84);
    // sparks rising out of the throat
    for (let i = 0; i < 8; i++) {
      const ph = (t * 0.4 + i * 0.125) % 1;
      const ex = Math.sin(t * 1.3 + i * 2.4) * (34 - ph * 12);
      const ey = 26 - ph * 60;
      ctx.globalAlpha = (1 - ph) * (0.4 + 0.6 * near);
      ctx.fillStyle = i % 2 ? '#ff9a4a' : '#ffd36b';
      ctx.fillRect(ex, ey, 2, 2);
    }
    ctx.restore(); ctx.globalAlpha = 1;
  },


  _drawDescentPit(ctx, d, t) {
    const p = this.player || (this.state === 'title' ? this.titleKnight : null);
    const near = p ? Math.max(0, 1 - Math.hypot(p.x - d.x, p.y - d.y) / 180) : 0;
    this._drawTornPit(ctx, d.x, d.y, t, near);
  },
};
