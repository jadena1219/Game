// Frame compositor + the Bladelight system (light pools, darkness, grade).
// Split from game.js — method bodies are verbatim; attached to Game.prototype in core.js.

export const renderMethods = {

  // torches active right now (camp room vs arena)
  get _torches() { return (this.state === 'camp' && this.camp) ? this.camp.torches : (this.braziers || []); },


  _render() {
    const ctx = this.ctx;
    const title = this.state === 'title';
    const camx = this.cam.x, camy = this.cam.y + (this.camDrop || 0);

    // The title is the knight's camp at the pit mouth — a walkable menu.
    if (title) { this._renderTitleCamp(ctx); return; }

    // Cold open: the intro is a screen-space torch-lit corridor, drawn outside
    // the normal world pipeline so the cut into Level 1 is seamless.
    if (this.state === 'intro') {
      ctx.clearRect(0, 0, this.vw, this.vh);
      this._drawTunnelScene(ctx);
      this._drawIntroCut(ctx);        // the dark blinking shut as he steps through
      this._drawTransition(ctx);
      return;
    }

    if (this.state === 'prologue') { this._renderPrologue(ctx); return; }
    if (this.state === 'shrine') { this._renderShrine(ctx); return; }

    ctx.clearRect(0, 0, this.vw, this.vh);
    // zoom-punch: big kills/crits/perfect dodges shove the camera in for a beat.
    // Wraps the world AND the lighting overlays so they stay registered.
    const zp = 1 + 0.05 * Math.min(1, this.zoom || 0) + (this._comboZoomS || 0);
    const zoomed = zp > 1.001;
    if (zoomed) {
      ctx.save();
      ctx.translate(this.vw / 2, this.vh / 2); ctx.scale(zp, zp); ctx.translate(-this.vw / 2, -this.vh / 2);
    }
    ctx.save();
    if (this.shake > 0) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }
    // void beyond the arena (only visible if shake nudges past the wall)
    ctx.fillStyle = this.voidColor || '#070510';
    ctx.fillRect(-30, -30, this.vw + 60, this.vh + 60);

    // ===== world space =====
    ctx.save();
    ctx.translate(-camx, -camy);

    // baked arena, or the small camp room — one blit
    if (this.state === 'camp' && this.campBg) ctx.drawImage(this.campBg, this.cam.x, this.cam.y);
    else if (this.bg) ctx.drawImage(this.bg, 0, 0);
    this._drawDecals(ctx);                // the floor remembers the fight
    this._drawWater(ctx);                 // the Crypt's standing water LIVES
    this._drawBrazierFlames(ctx);
    for (const pk of this.pickups) this._drawPickup(ctx, pk);

    for (const fx of this.effects) if (fx.kind === 'ghost') this._drawGhost(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'dashstreak') this._drawDashStreak(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'swing') this._drawSwing(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'lavafield') this._drawLavaField(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'fissure') this._drawFissure(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'firetrail') this._drawFireTrail(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'spawnmark') this._drawSpawnMark(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'puff') this._drawPuff(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'death') this._drawDeathFx(ctx, fx);

    if (this.state === 'camp') this._drawCampFloor(ctx);   // door + table (on the floor)

    // depth-sort enemies + hero (+ sorcerer) by feet-y
    const drawList = [...this.enemies];
    if (!title && this.player) drawList.push(this.player);
    if (this.state === 'camp') drawList.push({ sorcerer: true, x: this.camp.sorcerer.x, y: this.camp.sorcerer.y });
    drawList.sort((a, b) => a.y - b.y);
    // contact shadows first — a soft pool under every figure grounds it in the
    // floor (flat sprites read as cutouts under directional light without this)
    ctx.save(); ctx.fillStyle = '#03020a';
    for (const ent of drawList) {
      if (ent.rising != null && ent.rising < 1) continue;   // still emerging from the floor
      const r = ent.r || 12;
      ctx.globalAlpha = 0.30;
      ctx.beginPath(); ctx.ellipse(ent.x, ent.y + 2, r * 1.15, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.18;
      ctx.beginPath(); ctx.ellipse(ent.x, ent.y + 2, r * 1.6, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore(); ctx.globalAlpha = 1;
    for (const ent of drawList) {
      if (ent === this.player) this._drawPlayer(ctx);
      else if (ent.sorcerer) this._drawSorcerer(ctx, ent);
      else this._drawEnemy(ctx, ent);
    }
    if (this.state === 'camp') this._drawCampLabels(ctx);

    for (const pr of this.projectiles) this._drawProjectile(ctx, pr);
    for (const fb of this.allyProjectiles) this._drawFireball(ctx, fb);
    for (const fx of this.effects) this._drawAbilityFx(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'erupt') this._drawErupt(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'firewave') this._drawFireWave(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'firepillar') this._drawFirePillar(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'frostnova') this._drawFrostNova(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'thunderstorm') this._drawStormOverlay(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'megabolt') this._drawMegabolt(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'gib') this._drawGib(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'mote') this._drawMote(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'slash') this._drawSlashMark(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'hitring') this._drawHitRing(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'spark') this._drawSpark(ctx, fx);
    for (const fx of this.effects) if (fx.kind === 'dmg') this._drawDamage(ctx, fx);

    this._drawEmbers(ctx);          // death/title/victory embers (world space)
    ctx.restore();                  // ===== end world space =====
    ctx.restore();                  // end shake

    this._drawDarkness(ctx);        // dungeon shadow with torch-lit pools
    ctx.save(); ctx.translate(-this.cam.x, -this.cam.y);
    this._drawLights(ctx);          // additive light cores, on top of the dark
    ctx.restore();

    this._drawAtmos(ctx);           // biome weather (screen overlay)
    this._drawGrade(ctx);           // biome colour grade (screen overlay)
    this._drawDread(ctx);           // depth/low-HP dread vignette pressing in
    this._drawIntroCut(ctx);        // iris opening back up inside Level 1
    this._drawInterludeFade(ctx);   // black fading out of a Demon Lord taunt into the camp
    this._drawDeathOverlay(ctx);    // desaturate + "YOU FELL" during dying/gameover lead-in
    this._drawVictory(ctx);         // golden celebration during the 'won' sequence
    if (zoomed) ctx.restore();      // end zoom-punch (HUD/banners stay unscaled)

    // full-screen flash (ultimate)
    if (this.flashScreen > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.6, this.flashScreen * 2);
      ctx.fillStyle = this.flashCol || '#fff7d6';
      ctx.fillRect(0, 0, this.vw, this.vh);
      ctx.restore();
    }

    // LOW HP: the world itself bleeds at the edges, throbbing like a heart —
    // a double-thump (lub-dub) that quickens as the bar empties
    if (this.state === 'playing' && this.player && !this.player.dead) {
      const hpf = this.player.hp / this.player.maxHP;
      if (hpf <= 0.32) {
        const sev = 1 - hpf / 0.32;                       // 0 at 32% … 1 at empty
        const bpm = 3.6 + sev * 2.6, ph = this.time * bpm;
        const thump = Math.pow(Math.max(0, Math.sin(ph)), 8) + 0.6 * Math.pow(Math.max(0, Math.sin(ph - 0.55)), 8);
        const a = (0.2 + sev * 0.24) * (0.55 + 0.45 * thump);
        const W = this.vw, H = this.vh;
        ctx.save();
        const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * (0.34 - 0.05 * thump), W / 2, H / 2, Math.max(W, H) * 0.66);
        vg.addColorStop(0, 'rgba(120,8,10,0)');
        vg.addColorStop(1, `rgba(150,10,12,${a.toFixed(3)})`);
        ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    }

    // the one active banner (screen-space; the queue feeds it one at a time)
    if (this.activeBanner) {
      const fx = this.activeBanner;
      const prog = fx.t / fx.dur;
      const a = prog < 0.15 ? prog / 0.15 : 1 - (prog - 0.15) / 0.85;
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      let size = 30 + prog * 14;
      ctx.font = `bold ${size}px "Silkscreen", sans-serif`;
      const maxW = this.vw * 0.92, tw = ctx.measureText(fx.text).width;
      if (tw > maxW) { size = Math.floor(size * maxW / tw); ctx.font = `bold ${size}px "Silkscreen", sans-serif`; }
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.strokeText(fx.text, this.vw / 2, this.vh * 0.22);
      ctx.fillStyle = '#ffdd6a';
      ctx.fillText(fx.text, this.vw / 2, this.vh * 0.22);
      ctx.restore();
    }

    this._drawSweep(ctx);          // "LEVEL CLEARED" banner sweep
    this._drawCountdownIntro(ctx); // level/boss intro + 3..2..1..FIGHT
    if (!this.cutscene) this._drawHUD(ctx);
    if (!this.cutscene) this._drawStragglerPing(ctx);   // edge chevrons to the last foes
    this._drawBossBar(ctx);        // big top-of-screen boss health bar
    if (!this.cutscene && (this.state === 'playing' || (this.state === 'camp' && !this.shopOpen))) this.input.draw(ctx);
    if (!this.cutscene) this._drawFuryButton(ctx);     // floating "unleash fury" button above the hero
    if (this.state === 'camp') this._drawCampToast(ctx);   // event outcome flavour
    if (this.state === 'camp') this._drawCampWhisper(ctx);  // intrusive voice in the safe room
    if (!this.cutscene) this._drawNamedToast(ctx);  // "<Name> — bears a relic" / "Claimed: …"
    this._drawCutscene(ctx);       // boss-entrance letterbox + name reveal
    this._drawInterlude(ctx);      // Demon Lord taunt: blacks out the whole screen + red typewriter
    this._drawPlunge(ctx);         // plunge-into-darkness descent overlay
    this._drawTransition(ctx);     // slash-wipe on the very top
  },


  _drawLights(ctx) {
    // additive warm glow — gradients are cached per (radius,colour) and reused
    // via translate so we don't allocate dozens of gradients every frame.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const cache = this._glowCache || (this._glowCache = new Map());
    const glow = (x, y, r, col, a) => {
      const rr = Math.round(r), key = rr + '|' + col;
      let grd = cache.get(key);
      if (!grd) {
        grd = ctx.createRadialGradient(0, 0, 0, 0, 0, rr);
        grd.addColorStop(0, col); grd.addColorStop(1, 'rgba(0,0,0,0)');
        cache.set(key, grd);
      }
      ctx.globalAlpha = a; ctx.fillStyle = grd;
      ctx.translate(x, y); ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.fill(); ctx.translate(-x, -y);
    };
    for (const bz of this._torches) {
      if (!this._inView(bz.x, bz.y)) continue;
      // a layered, candle-like flicker rather than a single clean sine
      const fl = 0.74 + 0.16 * Math.sin(this.titleT * 11 + bz.x) + 0.1 * Math.sin(this.titleT * 27 + bz.x * 1.7);
      glow(bz.x, bz.y - 6, 130 + 10 * Math.sin(this.titleT * 17 + bz.x), bz.lava ? '#ff7a2a' : (bz.torch || '#ffb24a'), 0.6 * fl);
    }
    if (this.player) {
      const L = this._bladeLight(), p = this.player;
      glow(p.x, p.y - 14, Math.round(L.r * 0.55), L.col, L.glowA);
      // motes drifting in the blade-light — deterministic (time+index), no allocs
      if (this.state === 'playing') {
        ctx.fillStyle = L.col;
        for (let i = 0; i < 12; i++) {
          const ph = ((this.time * (0.16 + (i % 4) * 0.05)) + i * 0.318) % 1;
          const ang = i * 2.4 + this.time * (i % 2 ? 0.21 : -0.17);
          const rr2 = L.r * (0.18 + 0.4 * ((i * 0.618) % 1));
          const mx = p.x + Math.cos(ang) * rr2, my = p.y - 16 + Math.sin(ang) * rr2 * 0.6 - ph * 26;
          ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.5;
          ctx.fillRect(mx | 0, my | 0, 2, 2);
        }
        ctx.globalAlpha = 1;
      }
    }
    for (const pr of this.projectiles) glow(pr.x, pr.y, 38, pr.boss ? '#ff7a2a' : '#b06bff', 0.55);
    for (const fb of this.allyProjectiles) glow(fb.x, fb.y, 42, '#ff8a3a', 0.65);
    ctx.restore();
  },


  // BLADELIGHT — the sword is the last light in the world. Its colour, reach and
  // character follow the chosen blade and the knight's state: it breathes like
  // fire, holds hard like frost, or pulses like a caged storm; it swells with the
  // kill-streak, flares mid-swing, and gutters when he's nearly done. Memoized
  // per frame (this.time only advances once per update).
  _bladeLight() {
    if (this._lightT === this.time && this._lightMemo) return this._lightMemo;
    this._lightT = this.time;
    const p = this.player, t = this.time;
    let L;
    if (!p) L = { r: 205, col: '#cfe6ff', hard: false, glowA: 0.16 };
    else {
      let r = 265, col = '#ffd9a0', hard = false, glowA = 0.26;
      if (p.blade === 'ember') {        // warm firelight that breathes
        col = '#ff9a4a';
        r *= 1 + 0.05 * Math.sin(t * 11) + 0.03 * Math.sin(t * 27 + 1.7);
      } else if (p.blade === 'frost') { // pale, steady, hard-edged cold
        col = '#bfe2ff'; hard = true; r *= 1.06; glowA = 0.2;
      } else if (p.blade === 'storm') { // a caged tempest, slowly pulsing
        col = '#c9b8ff';
        r *= 1 + 0.07 * Math.sin(t * 4.4);
      }
      // THE STREAK FEEDS THE LIGHT — this is the game's core bargain, writ in
      // photons: every kill on the chain pushes the darkness back further…
      r += Math.min(110, (this.combo || 0) * 4);
      // …each combo TIER detonates a surge of light…
      if (this._lightSurgeT > 0) r *= 1 + 0.38 * (this._lightSurgeT / 0.9);
      // …and a broken streak lets the dark RUSH BACK IN for a beat
      if (this._lightDipT > 0) r *= 1 - 0.28 * (this._lightDipT / 0.8);
      if (p.swingTimer > 0) r *= 1.12;                       // the swing flares
      if (p.hp < p.maxHP * 0.3 && !p.dead) {                 // near death, it gutters
        r *= 0.72 + 0.06 * Math.sin(t * 9) + 0.03 * Math.sin(t * 23);
        glowA *= 0.8;
      }
      L = { r, col, hard, glowA };
    }
    return this._lightMemo = L;
  },


  // How lit a world point is (0 = swallowed by the dark, 1 = fully seen):
  // the blade-light first, then the braziers. Boss halls are always lit —
  // the Lord keeps the light the realm lost.
  _litAt(x, y) {
    if (!this.biome || !this.biome.dark || this.bossKind || this.state !== 'playing') return 1;
    let best = 0;
    const p = this.player;
    if (p) {
      const L = this._bladeLight();
      const d = Math.hypot(x - p.x, y - (p.y - 8));
      best = 1 - Math.max(0, d - L.r * 0.5) / (L.r * 0.55);
    }
    for (const bz of this._torches) {
      const d = Math.hypot(x - bz.x, y - (bz.y - 6));
      const v = 1 - Math.max(0, d - 95) / 125;
      if (v > best) best = v;
    }
    return Math.max(0, Math.min(1, best));
  },


  // Dungeon darkness: overlay shadow over everything, then cut light "pools" out
  // of it at the torches, the hero and any spell flashes. This is the vibe.
  _drawDarkness(ctx) {
    const b = this.biome; if (!b || !b.dark) return;
    if (this.state === 'won') return;      // the victory is bathed in golden light
    if (this.flashScreen > 0.02) return;   // the ultimate floods the room with light
    const darkLevel = this.state === 'camp' ? Math.min(b.dark, 0.34)
      : this.bossKind ? Math.min(b.dark, 0.32)               // boss halls are LIT — the inversion
      : Math.min(b.dark * 0.8, 0.68);   // combat: mood at the edges, never a void —
                                        // the floor must stay readable on a phone
    const S = 0.5;                          // half-res shadow buffer (soft, cheap)
    const sw = Math.max(1, Math.round(this.vw * S)), sh = Math.max(1, Math.round(this.vh * S));
    let sc = this.shadowCanvas, g = this.shadowCtx;
    if (!sc || sc.width !== sw || sc.height !== sh) {
      sc = this.shadowCanvas = document.createElement('canvas');
      sc.width = sw; sc.height = sh;
      g = this.shadowCtx = sc.getContext('2d');
      this._holeCache = new Map();   // gradients are tied to this ctx
    }
    const cache = this._holeCache || (this._holeCache = new Map());
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, sw, sh);
    g.fillStyle = `rgba(4,3,9,${darkLevel})`;
    g.fillRect(0, 0, sw, sh);
    g.globalCompositeOperation = 'destination-out';
    // cached light "holes": one gradient per rounded radius + edge profile,
    // reused via translate. `hard` = frost's crisp cone vs. the soft fire feather.
    // `soft` pools (torches) only PARTIALLY cut the dark with a long feather, so
    // neighbouring pools blend into ambience instead of stamping bright circles.
    const hole = (wx, wy, r, hard = false, soft = false) => {
      const sx = (wx - this.cam.x) * S, sy = (wy - this.cam.y) * S, rr = Math.round(r * S);
      if (sx < -rr || sx > sw + rr || sy < -rr || sy > sh + rr) return;
      const key = rr + (hard ? '|h' : soft ? '|s' : '');
      let grd = cache.get(key);
      if (!grd) {
        grd = g.createRadialGradient(0, 0, rr * (hard ? 0.55 : soft ? 0.1 : 0.22), 0, 0, rr);
        grd.addColorStop(0, `rgba(0,0,0,${soft ? 0.8 : 1})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
        cache.set(key, grd);
      }
      g.fillStyle = grd;
      g.translate(sx, sy); g.beginPath(); g.arc(0, 0, rr, 0, Math.PI * 2); g.fill(); g.translate(-sx, -sy);
    };
    // torches are set dressing, not the protagonist: their pools stay smaller
    // than the blade's, so the eye follows the HERO's light through the dark
    for (const bz of this._torches) hole(bz.x, bz.y - 6, 168 + 7 * Math.sin(this.titleT * 17 + bz.x), false, true);
    // the BLADE carries the light — reach/breath/edge follow blade + state
    const L = this._bladeLight();
    const hx = this.player ? this.player.x : this.world.w / 2;
    const hy = this.player ? this.player.y - 8 : this.world.h / 2 + this.vh * 0.16;
    hole(hx, hy, L.r, L.hard);
    for (const fb of this.allyProjectiles) hole(fb.x, fb.y, 90);
    for (const pr of this.projectiles) hole(pr.x, pr.y, 52);
    for (const pk of this.pickups) hole(pk.x, pk.y, 30);   // loot glints in the dark
    if (this.state === 'camp' && this.camp) {              // door + sorcerer + shrine light the room
      hole(this.camp.door.x, this.camp.door.y - 6, 120);
      hole(this.camp.sorcerer.x, this.camp.sorcerer.y - 12, 110);
      if (this.camp.shrine && !this.camp.eventUsed) hole(this.camp.shrine.x, this.camp.shrine.y - 8, 110);
    }
    for (const fx of this.effects) {
      if (fx.kind === 'boom' || fx.kind === 'ult') hole(fx.x, fx.y, Math.round((fx.r || 80) * 1.1));
      else if (fx.kind === 'lavafield') hole(fx.x, fx.y, fx.r * 1.15);
      else if (fx.kind === 'firetrail') hole(fx.x, fx.y, 52);
      else if (fx.kind === 'firepillar') hole(fx.x, fx.y, 120);
      else if (fx.kind === 'firewave') {
        // the wave carries its own ring of light across the dark
        const wr = fx.t * fx.speed;
        for (let i = 0; i < 10; i++) {
          const a2 = (i / 10) * Math.PI * 2;
          hole(fx.x + Math.cos(a2) * wr, fx.y + Math.sin(a2) * wr, 110);
        }
      }
      else if (fx.kind === 'bolt' && fx.pts) hole(fx.pts[fx.pts.length - 1].x, fx.pts[fx.pts.length - 1].y, 70);
      else if (fx.kind === 'fissure' && fx.t > fx.warn * 0.6) {
        for (let i = 1; i < fx.pts.length; i += 2) hole(fx.pts[i].x, fx.pts[i].y, 54);
      }
    }
    // foes that carry their own light: the burning, and bosses mid-telegraph
    // (a windup you can't see is a cheap death, not a dark one)
    for (const e of this.enemies) {
      if (e.burnT > 0) hole(e.x, e.y - 10, 64);
      else if (e.state === 'windup' || e.state === 'special' || e.state === 'charging' || e.state === 'enrage') hole(e.x, e.y - 10, e.r * 3.2);
    }
    g.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.imageSmoothingEnabled = true;
    ctx.drawImage(sc, 0, 0, this.vw, this.vh);
    ctx.restore();
  },


  _drawAtmos(ctx) {
    if (!this.atmos || !this.atmos.length) return;
    ctx.save();
    for (const a of this.atmos) {
      const fade = a.life < 0.4 ? a.life / 0.4 : (a.life > a.dur - 0.6 ? (a.dur - a.life) / 0.6 : 1);
      ctx.globalAlpha = Math.max(0, Math.min(1, fade)) * (a.flick ?? 1) * 0.9;
      ctx.fillStyle = a.col;
      if (a.type === 'leaves') {
        ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.spin + this.titleT * 2);
        ctx.fillRect(-a.r, -a.r * 0.5, a.r * 2, a.r); ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  },


  _drawGrade(ctx) {
    if (!this.biome) return;
    ctx.save();
    ctx.fillStyle = this.biome.grade;
    ctx.fillRect(0, 0, this.vw, this.vh);
    ctx.restore();
  },


  // ---- Phase 2 draw helpers ----
  _drawEmbers(ctx) {
    if (!this.embers.length) return;
    ctx.save();
    for (const e of this.embers) {
      const a = Math.min(1, e.life < 0.3 ? e.life / 0.3 : 1 - e.life / e.dur) * (e.flick ?? 1);
      ctx.globalAlpha = Math.max(0, a) * 0.9;
      ctx.fillStyle = e.hue;
      ctx.fillRect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2);
    }
    ctx.restore();
  },


  _drawBrazierFlames(ctx) {
    for (const bz of this._torches) {
      if (!this._inView(bz.x, bz.y)) continue;
      const f = this.titleT * 12 + bz.x;
      const h = 12 + Math.sin(f) * 3 + Math.sin(f * 2.3) * 2;
      // flame body
      ctx.save();
      const cy = bz.y - 4;
      const g1 = ctx.createRadialGradient(bz.x, cy - h * 0.3, 1, bz.x, cy, h);
      if (bz.lava) { g1.addColorStop(0, '#fff2b0'); g1.addColorStop(0.5, '#ff5a1e'); g1.addColorStop(1, 'rgba(150,20,0,0)'); }
      else {
        // soulfire takes the biome's hue — teal flames in the drowned halls,
        // violet in the vault — so the hall and its light agree
        const mid = bz.torch || '#ff9a2a';
        g1.addColorStop(0, '#fff2c0'); g1.addColorStop(0.55, mid); g1.addColorStop(1, this._rgba(mid, 0));
      }
      ctx.fillStyle = g1;
      ctx.beginPath();
      ctx.moveTo(bz.x - 6, cy + 2);
      ctx.quadraticCurveTo(bz.x - 5, cy - h * 0.6, bz.x, cy - h);
      ctx.quadraticCurveTo(bz.x + 5, cy - h * 0.6, bz.x + 6, cy + 2);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  },
};
