// Touch + keyboard input. Left half = move joystick (springs up where you
// press), bottom-right = swing button. Keyboard (WASD/arrows + Space/J) mirrors
// it for desktop testing.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.move = { x: 0, y: 0 };     // normalized direction * magnitude (0..1)
    this.swingHeld = false;
    this.dashQueued = false;        // set on double-tap (move side) / Shift; consumed by player
    this._lastMoveTap = 0;          // timestamp of last move-side tap (for double-tap)

    // joystick visual state
    this.stick = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.btn = { active: false, id: null, x: 0, y: 0, r: 64 };
    // floating Fury button (positioned by the game above the hero when charged)
    this.furyBtn = { x: 0, y: 0, r: 0, visible: false };
    this.furyTapped = false;        // set on tap; consumed by the game

    this.keys = new Set();
    this._bind();
  }

  layout(w, h) {
    // swing button anchored bottom-right
    const r = Math.max(52, Math.min(78, w * 0.11));
    this.btn.r = r;
    this.btn.x = w - r - 26;
    this.btn.y = h - r - 30;
    this.maxStick = Math.max(46, Math.min(70, w * 0.1));
  }

  _inButton(x, y) {
    const dx = x - this.btn.x, dy = y - this.btn.y;
    return dx * dx + dy * dy <= this.btn.r * this.btn.r * 1.6;
  }

  _bind() {
    const c = this.canvas;
    const rect = () => c.getBoundingClientRect();

    const onDown = (id, x, y) => {
      // Fury button takes priority when it's showing
      if (this.furyBtn.visible) {
        const fx = x - this.furyBtn.x, fy = y - this.furyBtn.y;
        if (fx * fx + fy * fy <= this.furyBtn.r * this.furyBtn.r * 1.5) { this.furyTapped = true; return; }
      }
      if (this._inButton(x, y)) {
        this.btn.active = true; this.btn.id = id; this.swingHeld = true;
      } else {
        // move side: detect a quick double-tap to dash (works even while holding
        // the joystick, since the 2nd finger lands here too)
        const now = performance.now() / 1000;
        if (now - this._lastMoveTap < 0.32) { this.dashQueued = true; this._lastMoveTap = 0; }
        else this._lastMoveTap = now;
        if (!this.stick.active) {
          this.stick.active = true; this.stick.id = id;
          this.stick.ox = this.stick.x = x; this.stick.oy = this.stick.y = y;
          this._updateMove();
        }
      }
    };
    const onMove = (id, x, y) => {
      if (this.stick.active && this.stick.id === id) {
        this.stick.x = x; this.stick.y = y; this._updateMove();
      }
    };
    const onUp = (id) => {
      if (this.stick.id === id) {
        this.stick.active = false; this.stick.id = null;
        this.move.x = 0; this.move.y = 0;
      }
      if (this.btn.id === id) {
        this.btn.active = false; this.btn.id = null; this.swingHeld = false;
      }
    };

    c.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const r = rect();
      for (const t of e.changedTouches) onDown(t.identifier, t.clientX - r.left, t.clientY - r.top);
    }, { passive: false });
    c.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const r = rect();
      for (const t of e.changedTouches) onMove(t.identifier, t.clientX - r.left, t.clientY - r.top);
    }, { passive: false });
    const end = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) onUp(t.identifier);
    };
    c.addEventListener('touchend', end, { passive: false });
    c.addEventListener('touchcancel', end, { passive: false });

    // Mouse (desktop): left button drag = joystick, but if pressed on button = swing
    c.addEventListener('mousedown', (e) => {
      const r = rect(); onDown('mouse', e.clientX - r.left, e.clientY - r.top);
    });
    window.addEventListener('mousemove', (e) => {
      const r = rect(); onMove('mouse', e.clientX - r.left, e.clientY - r.top);
    });
    window.addEventListener('mouseup', () => onUp('mouse'));

    // Keyboard
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'shift' && !e.repeat) this.dashQueued = true;   // dodge on desktop
      if ((k === 'q' || k === 'e' || k === 'f') && !e.repeat) this.furyTapped = true; // ultimate
      this.keys.add(k);
      if ([' ', 'j', 'k'].includes(k)) this.swingHeld = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
      if ([' ', 'j', 'k'].includes(e.key.toLowerCase()) && !this.btn.active) this.swingHeld = false;
    });
  }

  _updateMove() {
    let dx = this.stick.x - this.stick.ox;
    let dy = this.stick.y - this.stick.oy;
    const len = Math.hypot(dx, dy);
    const max = this.maxStick;
    if (len > max) { dx = dx / len * max; dy = dy / len * max; }
    // clamp visual knob
    this.stick.x = this.stick.ox + dx;
    this.stick.y = this.stick.oy + dy;
    const mag = Math.min(1, len / max);
    if (len > 4) {
      this.move.x = (dx / (len || 1)) * mag;
      this.move.y = (dy / (len || 1)) * mag;
    } else {
      this.move.x = 0; this.move.y = 0;
    }
  }

  // Fold keyboard into the move vector each frame.
  poll() {
    let kx = 0, ky = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) kx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) kx += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) ky -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) ky += 1;
    if (kx || ky) {
      const l = Math.hypot(kx, ky);
      this.move.x = kx / l; this.move.y = ky / l;
    }
    return this.move;
  }

  draw(ctx) {
    // joystick
    if (this.stick.active) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#cfc6e6';
      ctx.beginPath(); ctx.arc(this.stick.ox, this.stick.oy, this.maxStick, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(220,210,245,0.55)';
      ctx.beginPath(); ctx.arc(this.stick.x, this.stick.y, this.maxStick * 0.45, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // swing button
    ctx.save();
    ctx.globalAlpha = this.btn.active ? 0.85 : 0.5;
    const grd = ctx.createRadialGradient(this.btn.x, this.btn.y, 4, this.btn.x, this.btn.y, this.btn.r);
    grd.addColorStop(0, '#ffe9a0');
    grd.addColorStop(1, '#b5841d');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(this.btn.x, this.btn.y, this.btn.r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#6b5212';
    ctx.stroke();
    // little sword glyph
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#2a1d06'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    const r = this.btn.r;
    ctx.beginPath();
    ctx.moveTo(this.btn.x - r * 0.3, this.btn.y + r * 0.32);
    ctx.lineTo(this.btn.x + r * 0.34, this.btn.y - r * 0.34);
    ctx.stroke();
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(this.btn.x - r * 0.42, this.btn.y + r * 0.18);
    ctx.lineTo(this.btn.x - r * 0.18, this.btn.y + r * 0.42);
    ctx.stroke();
    ctx.restore();
  }
}
