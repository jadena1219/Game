// Procedural audio engine — everything is synthesised live through WebAudio and
// drenched in a convolution reverb modelled on a cold stone hall, so the whole
// game shares one cavernous, torch-lit acoustic space. No sample files.
//
// Two halves:
//   • a library of layered SFX (sword, deaths, the plunge, gold, UI...)
//   • a generative dark-ambient score that shifts mood per scene (camp / combat
//     / boss) — a detuned drone bed, slow pad swells, a sparse minor-key motif,
//     and a heartbeat that quickens for bosses.

const MINOR = [0, 2, 3, 5, 7, 8, 10, 12, 14, 15];   // natural-minor scale degrees
const semis = (n) => Math.pow(2, n / 12);
// short, deliberate motifs (scale-degree indices) so the melody feels composed
const MOTIFS = [
  [7, 5, 4, 5], [4, 3, 2], [7, 8, 7, 4], [2, 4, 3, 0], [5, 4, 2, 3], [9, 7, 8, 7, 4],
];

class GameAudio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = (() => { try { return localStorage.getItem('kls_mute') === '1'; } catch (e) { return false; } })();
    this.scene = 'title';
    this.root = 36.71;                 // D1 — the tonic everything hangs off
    this._melT = 0; this._padT = 0; this._beatT = 0; this._beatPhase = 0;
    this._intensity = 0;               // 0 calm .. 1 boss
    this._intensityTarget = 0;
  }

  // Must be called from a user gesture (browser autoplay rules).
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = this.ctx = new Ctx();

    // ---- master chain: buses -> dry + reverb -> limiter -> out ----
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.85;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10; limiter.knee.value = 8; limiter.ratio.value = 12;
    limiter.attack.value = 0.003; limiter.release.value = 0.25;
    this.master.connect(limiter).connect(ctx.destination);

    this.dry = ctx.createGain(); this.dry.gain.value = 0.82;
    this.dry.connect(this.master);
    this.reverb = ctx.createConvolver(); this.reverb.buffer = this._makeIR(3.0, 2.4);
    this.wet = ctx.createGain(); this.wet.gain.value = 0.5;
    this.reverb.connect(this.wet).connect(this.master);

    // sound bus (dry + reverb send) and a separate, duckable music bus
    this.bus = ctx.createGain(); this.bus.gain.value = 1;
    this.busSend = ctx.createGain(); this.busSend.gain.value = 0.5;
    this.bus.connect(this.dry); this.bus.connect(this.busSend).connect(this.reverb);

    this.music = ctx.createGain(); this.music.gain.value = 0.0001;
    this.musicSend = ctx.createGain(); this.musicSend.gain.value = 0.6;
    this.music.connect(this.dry); this.music.connect(this.musicSend).connect(this.reverb);

    // reusable white-noise buffer
    this._noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this._noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    this.ready = true;
    this._buildMusic();
    this.setScene(this.scene);
    // fade the score in
    this.music.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.music.gain.exponentialRampToValueAtTime(this.muted ? 0.0001 : 0.5, ctx.currentTime + 4);
    this._scheduler = setInterval(() => this._tick(), 110);
  }

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem('kls_mute', this.muted ? '1' : '0'); } catch (e) { /* ignore */ }
    if (this.ctx) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.linearRampToValueAtTime(this.muted ? 0 : 0.85, t + 0.2);
    }
    return this.muted;
  }

  // A synthetic stone-hall impulse: stereo, exponentially-decaying filtered noise
  // with a touch of early-reflection shimmer.
  _makeIR(seconds, decay) {
    const ctx = this.ctx, rate = ctx.sampleRate, len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const env = Math.pow(1 - t, decay);
        let s = (Math.random() * 2 - 1) * env;
        lp += (s - lp) * 0.45;               // soften the tail (darker, stony)
        s = lp;
        if (i < rate * 0.03) s *= i / (rate * 0.03);   // tiny pre-delay swell
        d[i] = s;
      }
    }
    return buf;
  }

  // ---------- low-level voice builders ----------
  _now() { return this.ctx.currentTime; }

  _tone(opts) {
    const ctx = this.ctx, t0 = opts.t0 ?? this._now();
    const o = ctx.createOscillator(); o.type = opts.type || 'sine';
    o.frequency.setValueAtTime(opts.f0, t0);
    if (opts.f1 != null) o.frequency[opts.exp ? 'exponentialRampToValueAtTime' : 'linearRampToValueAtTime'](Math.max(1, opts.f1), t0 + opts.dur);
    if (opts.detune) o.detune.value = opts.detune;
    const g = ctx.createGain();
    const a = opts.a ?? 0.005, d = opts.dur, peak = opts.gain ?? 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    let node = o;
    if (opts.filter) {
      const f = ctx.createBiquadFilter(); f.type = opts.filter; f.frequency.value = opts.cutoff || 800;
      if (opts.q) f.Q.value = opts.q;
      o.connect(f); node = f;
    }
    node.connect(g); g.connect(opts.dest || this.bus);
    o.start(t0); o.stop(t0 + d + 0.05);
    return o;
  }

  _noise(opts) {
    const ctx = this.ctx, t0 = opts.t0 ?? this._now();
    const src = ctx.createBufferSource(); src.buffer = this._noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = opts.filter || 'bandpass';
    f.frequency.setValueAtTime(opts.cutoff || 1200, t0);
    if (opts.cutoff1 != null) f.frequency.exponentialRampToValueAtTime(Math.max(40, opts.cutoff1), t0 + opts.dur);
    f.Q.value = opts.q ?? 0.7;
    const g = ctx.createGain();
    const a = opts.a ?? 0.004, peak = opts.gain ?? 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    src.connect(f).connect(g).connect(opts.dest || this.bus);
    src.start(t0); src.stop(t0 + opts.dur + 0.05);
    return src;
  }

  _duck(amount, time) {                 // briefly dip the score under a big hit
    if (!this.music) return;
    const t = this._now(), base = this.muted ? 0.0001 : 0.5;
    this.music.gain.cancelScheduledValues(t);
    this.music.gain.setValueAtTime(Math.max(0.0001, base * (1 - amount)), t);
    this.music.gain.exponentialRampToValueAtTime(Math.max(0.0001, base), t + (time || 0.8));
  }

  // ---------- SFX library ----------
  play(name, opts = {}) {
    if (!this.ready || this.muted) return;
    // throttle the spammy combat sounds so swarm-kills / coin piles don't machine-gun
    const TH = { hit: 28, crit: 28, die_chaser: 45, die_swarmer: 45, die_caster: 45, die_tank: 60, die: 45, gold: 45, hurt: 80,
      hit_ember: 60, hit_frost: 60, hit_storm: 60 };
    if (TH[name]) {
      const now = performance.now(); this._t = this._t || {};
      if (now - (this._t[name] || 0) < TH[name]) return;
      this._t[name] = now;
    }
    const v = opts.vol ?? 1;
    const R = (a, b) => a + Math.random() * (b - a);
    switch (name) {
      case 'swing': {                   // an airy blade whoosh
        this._noise({ filter: 'bandpass', cutoff: R(900, 1300), cutoff1: 380, q: 1.1, dur: 0.22, gain: 0.12 * v });
        this._tone({ type: 'sawtooth', f0: R(420, 520), f1: 160, exp: true, dur: 0.16, gain: 0.05 * v, filter: 'lowpass', cutoff: 1400 });
        break;
      }
      case 'swing_ember': {             // a heavier whoosh that catches fire
        const t = this._now();
        this._noise({ filter: 'bandpass', cutoff: R(700, 1000), cutoff1: 300, q: 1.0, dur: 0.26, gain: 0.13 * v });
        this._tone({ type: 'sawtooth', f0: R(300, 380), f1: 110, exp: true, dur: 0.2, gain: 0.06 * v, filter: 'lowpass', cutoff: 1200 });
        for (let i = 0; i < 3; i++) this._noise({ t0: t + 0.04 + i * 0.05, filter: 'highpass', cutoff: R(2400, 4200), q: 2, dur: 0.03, gain: 0.05 * v });
        break;
      }
      case 'swing_frost': {             // a crisp icy shing
        this._noise({ filter: 'bandpass', cutoff: R(1800, 2400), cutoff1: 700, q: 1.6, dur: 0.2, gain: 0.1 * v });
        this._tone({ type: 'triangle', f0: R(1900, 2200), f1: 900, exp: true, dur: 0.18, gain: 0.06 * v });
        this._tone({ type: 'sine', f0: 2800, dur: 0.12, gain: 0.04 * v });
        break;
      }
      case 'swing_storm': {             // an electric rip
        this._noise({ filter: 'bandpass', cutoff: R(900, 1300), cutoff1: 2600, q: 1.2, dur: 0.18, gain: 0.1 * v });
        this._tone({ type: 'square', f0: R(120, 160), f1: 60, exp: true, dur: 0.14, gain: 0.05 * v, filter: 'bandpass', cutoff: 1800, q: 3 });
        this._tone({ type: 'sawtooth', f0: R(2400, 3200), f1: 800, exp: true, dur: 0.1, gain: 0.045 * v });
        break;
      }
      case 'hit_ember': {               // fire answers the connect
        this._noise({ filter: 'highpass', cutoff: 2600, dur: 0.08, gain: 0.1 * v });
        this._tone({ type: 'square', f0: 220, f1: 90, exp: true, dur: 0.1, gain: 0.06 * v, filter: 'lowpass', cutoff: 1400 });
        break;
      }
      case 'hit_frost': {               // a glassy crack
        const f = R(0.95, 1.06);
        this._tone({ type: 'triangle', f0: 2100 * f, dur: 0.14, gain: 0.07 * v });
        this._tone({ t0: this._now() + 0.02, type: 'triangle', f0: 3150 * f, dur: 0.1, gain: 0.04 * v });
        break;
      }
      case 'hit_storm': {               // a snapping jolt
        this._noise({ filter: 'bandpass', cutoff: R(2800, 3600), q: 4, dur: 0.06, gain: 0.12 * v });
        this._tone({ type: 'square', f0: R(700, 900), f1: 200, exp: true, dur: 0.07, gain: 0.05 * v });
        break;
      }
      case 'hit': {                     // a soft, meaty impact — a dull thud, no metallic shriek
        this._tone({ type: 'sine', f0: 138, f1: 50, exp: true, dur: 0.13, gain: 0.28 * v });
        this._tone({ type: 'triangle', f0: R(210, 260), f1: 90, exp: true, dur: 0.07, gain: 0.05 * v, filter: 'lowpass', cutoff: 1300 });
        this._noise({ filter: 'lowpass', cutoff: 820, cutoff1: 280, dur: 0.05, gain: 0.06 * v });
        break;
      }
      case 'crit': {                    // brighter, with a ringing edge
        this._tone({ type: 'sine', f0: 180, f1: 64, exp: true, dur: 0.18, gain: 0.36 * v });
        this._noise({ filter: 'highpass', cutoff: 2400, q: 0.7, dur: 0.12, gain: 0.22 * v });
        this._tone({ type: 'triangle', f0: 1320, dur: 0.4, gain: 0.12 * v });
        this._tone({ type: 'triangle', f0: 1980, dur: 0.32, gain: 0.07 * v });
        break;
      }
      case 'bosshit': {
        this._tone({ type: 'sine', f0: 110, f1: 44, exp: true, dur: 0.26, gain: 0.4 * v });
        this._noise({ filter: 'lowpass', cutoff: 900, dur: 0.2, gain: 0.2 * v });
        break;
      }
      case 'hurt': {                    // taking a blow — low pained thud
        this._tone({ type: 'sawtooth', f0: 200, f1: 70, exp: true, dur: 0.22, gain: 0.26 * v, filter: 'lowpass', cutoff: 900 });
        this._noise({ filter: 'lowpass', cutoff: 700, cutoff1: 200, dur: 0.18, gain: 0.14 * v });
        break;
      }
      case 'die_chaser': {              // skeleton — a dry bony clatter
        for (let i = 0; i < 4; i++) this._noise({ t0: this._now() + i * 0.045, filter: 'bandpass', cutoff: R(1400, 2600), q: 3, dur: 0.05, gain: 0.1 * v });
        this._tone({ type: 'sine', f0: 90, f1: 50, exp: true, dur: 0.12, gain: 0.12 * v });
        break;
      }
      case 'die_swarmer': {             // imp — a little screech + poof
        this._tone({ type: 'sawtooth', f0: R(700, 900), f1: 180, exp: true, dur: 0.18, gain: 0.12 * v, filter: 'bandpass', cutoff: 1400, q: 2 });
        this._noise({ filter: 'highpass', cutoff: 1200, dur: 0.14, gain: 0.12 * v });
        break;
      }
      case 'die_tank': {                // ogre — a heavy collapse
        this._tone({ type: 'sine', f0: 90, f1: 36, exp: true, dur: 0.4, gain: 0.34 * v });
        this._noise({ filter: 'lowpass', cutoff: 600, cutoff1: 120, dur: 0.4, gain: 0.2 * v });
        break;
      }
      case 'die_caster': {              // mage — an arcane implosion
        this._tone({ type: 'triangle', f0: 1400, f1: 180, exp: true, dur: 0.3, gain: 0.14 * v });
        this._tone({ type: 'sine', f0: 700, f1: 90, exp: true, dur: 0.34, gain: 0.1 * v });
        this._noise({ filter: 'highpass', cutoff: 2000, cutoff1: 400, dur: 0.2, gain: 0.1 * v });
        break;
      }
      case 'die_revenant': {            // a husk unmade — a hollow exhale, almost a voice
        this._tone({ type: 'sawtooth', f0: 300, f1: 60, exp: true, dur: 0.5, gain: 0.12 * v, filter: 'bandpass', cutoff: 800, q: 2 });
        this._tone({ type: 'sine', f0: 100, f1: 40, exp: true, dur: 0.4, gain: 0.2 * v });
        this._noise({ filter: 'bandpass', cutoff: 900, cutoff1: 200, q: 3, dur: 0.6, gain: 0.1 * v });
        break;
      }
      case 'die': {                     // default
        this._tone({ type: 'sine', f0: 120, f1: 50, exp: true, dur: 0.16, gain: 0.18 * v });
        this._noise({ filter: 'bandpass', cutoff: 900, q: 1, dur: 0.14, gain: 0.12 * v });
        break;
      }
      case 'explode': {                 // bomber blast
        this._tone({ type: 'sine', f0: 120, f1: 40, exp: true, dur: 0.45, gain: 0.4 * v });
        this._noise({ filter: 'lowpass', cutoff: 1600, cutoff1: 200, dur: 0.4, gain: 0.3 * v });
        this._duck(0.3, 0.5);
        break;
      }
      case 'gold': {                    // a soft coin chime (two quick bells)
        const f = R(0.98, 1.04);
        this._tone({ type: 'triangle', f0: 1560 * f, dur: 0.22, gain: 0.08 * v });
        this._tone({ t0: this._now() + 0.05, type: 'triangle', f0: 2340 * f, dur: 0.2, gain: 0.05 * v });
        break;
      }
      case 'dash': {
        this._noise({ filter: 'bandpass', cutoff: 500, cutoff1: 1800, q: 0.8, dur: 0.2, gain: 0.12 * v });
        break;
      }
      case 'parry': {                   // a PERFECT dodge — a cold bell as time holds its breath
        const t = this._now();
        this._noise({ filter: 'bandpass', cutoff: 2600, cutoff1: 700, q: 1.4, dur: 0.3, gain: 0.16 * v });
        this._tone({ type: 'triangle', f0: 1760, dur: 0.5, gain: 0.12 * v });
        this._tone({ t0: t + 0.05, type: 'triangle', f0: 2640, dur: 0.45, gain: 0.08 * v });
        this._tone({ type: 'sine', f0: 130, f1: 60, exp: true, dur: 0.18, gain: 0.2 * v });
        this._duck(0.35, 0.6);
        break;
      }
      case 'combo': {                   // streak milestone — a hot rising stinger
        const t = this._now(), tier = opts.tier || 1;
        [0, 7, 12, 12 + 7 * (tier - 1)].forEach((n, i) =>
          this._tone({ t0: t + i * 0.05, type: 'triangle', f0: 392 * semis(n), dur: 0.5, gain: 0.09 * v }));
        this._noise({ filter: 'highpass', cutoff: 2200, dur: 0.2, gain: 0.06 * v });
        break;
      }
      case 'furyready': {               // a rising shimmer cue
        const t = this._now();
        [0, 4, 7, 12].forEach((n, i) => this._tone({ t0: t + i * 0.06, type: 'triangle', f0: 440 * semis(n), dur: 0.7, gain: 0.07 * v }));
        break;
      }
      case 'ultimate': {                // a cataclysmic release
        this._tone({ type: 'sawtooth', f0: 60, f1: 220, exp: true, dur: 0.7, gain: 0.3 * v, filter: 'lowpass', cutoff: 1800 });
        this._noise({ filter: 'bandpass', cutoff: 400, cutoff1: 3000, q: 0.6, dur: 0.6, gain: 0.22 * v });
        this._tone({ type: 'sine', f0: 90, f1: 40, exp: true, dur: 0.8, gain: 0.4 * v });
        this._duck(0.55, 1.2);
        break;
      }
      case 'jump': {                    // the leap into the pit
        this._tone({ type: 'sine', f0: 240, f1: 540, exp: true, dur: 0.3, gain: 0.14 * v, filter: 'lowpass', cutoff: 1600 });
        this._noise({ filter: 'bandpass', cutoff: 600, cutoff1: 1400, q: 0.8, dur: 0.3, gain: 0.06 * v });
        break;
      }
      case 'plunge': {                  // a long, slow fall into darkness + impact far below
        const t = this._now();
        this._tone({ type: 'sawtooth', f0: 300, f1: 32, exp: true, dur: 1.7, gain: 0.17 * v, filter: 'lowpass', cutoff: 1100 });
        this._noise({ filter: 'lowpass', cutoff: 1300, cutoff1: 90, dur: 1.7, gain: 0.15 * v });
        this._tone({ type: 'sine', f0: 70, f1: 44, exp: true, dur: 1.55, gain: 0.12 * v, a: 0.5 });        // a low dread drone through the fall
        this._tone({ t0: t + 1.5, type: 'sine', f0: 80, f1: 30, exp: true, dur: 0.8, gain: 0.4 * v });     // impact at the bottom
        this._duck(0.5, 2.2);
        break;
      }
      case 'bossroar': {                // an entrance growl — dread incarnate
        const t = this._now();
        [55, 55 * semis(1), 82].forEach((f) => this._tone({ type: 'sawtooth', f0: f * 1.6, f1: f, exp: true, dur: 1.6, gain: 0.12 * v, filter: 'lowpass', cutoff: 600 }));
        this._noise({ filter: 'lowpass', cutoff: 300, dur: 1.6, gain: 0.16 * v });
        this._tone({ t0: t, type: 'sine', f0: 60, f1: 30, exp: true, dur: 1.8, gain: 0.34 * v });
        this._duck(0.5, 1.8);
        break;
      }
      case 'fight': {                   // "FIGHT!" — a war-drum hit
        this._tone({ type: 'sine', f0: 140, f1: 50, exp: true, dur: 0.3, gain: 0.34 * v });
        this._noise({ filter: 'lowpass', cutoff: 1000, cutoff1: 300, dur: 0.2, gain: 0.14 * v });
        break;
      }
      case 'clear': {                   // level cleared — a sombre minor resolve
        const t = this._now();
        [0, 3, 7].forEach((n, i) => this._tone({ t0: t + i * 0.08, type: 'triangle', f0: 220 * semis(n), dur: 1.2, gain: 0.1 * v }));
        break;
      }
      case 'win': {
        const t = this._now();
        [0, 4, 7, 12].forEach((n, i) => this._tone({ t0: t + i * 0.12, type: 'triangle', f0: 262 * semis(n), dur: 2.2, gain: 0.12 * v }));
        break;
      }
      case 'lose': {                    // death — a slow descending knell
        this._tone({ type: 'sine', f0: 180, f1: 60, exp: true, dur: 1.6, gain: 0.28 * v });
        this._tone({ type: 'sawtooth', f0: 120, f1: 40, exp: true, dur: 1.8, gain: 0.12 * v, filter: 'lowpass', cutoff: 500 });
        break;
      }
      case 'ui': {
        this._tone({ type: 'sine', f0: 520, dur: 0.06, gain: 0.08 * v, filter: 'lowpass', cutoff: 1800 });
        break;
      }
      case 'buy': {
        this._tone({ type: 'triangle', f0: 880, dur: 0.12, gain: 0.08 * v });
        this._tone({ t0: this._now() + 0.07, type: 'triangle', f0: 1320, dur: 0.18, gain: 0.07 * v });
        break;
      }
      case 'relic': {                   // claiming something powerful
        const t = this._now();
        [0, 5, 7, 12].forEach((n, i) => this._tone({ t0: t + i * 0.07, type: 'triangle', f0: 330 * semis(n), dur: 1.0, gain: 0.09 * v }));
        break;
      }
      case 'whisper': {                 // a breathy, reverberant voice you can't quite make out
        const ctx = this.ctx, t = this._now();
        const src = ctx.createBufferSource(); src.buffer = this._noiseBuf; src.loop = true;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = R(700, 1050); f.Q.value = 5;
        const wob = ctx.createOscillator(); wob.frequency.value = R(5, 9);           // formant wobble → "speech"
        const wobG = ctx.createGain(); wobG.gain.value = R(220, 420);
        wob.connect(wobG).connect(f.frequency); wob.start(t); wob.stop(t + 1.6);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05 * v, t + 0.55);                       // slow breath in
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
        src.connect(f).connect(g); g.connect(this.bus);
        src.start(t); src.stop(t + 1.6);
        this._tone({ type: 'sawtooth', f0: R(92, 124), f1: R(70, 88), dur: 1.3, gain: 0.035 * v, filter: 'lowpass', cutoff: 480, a: 0.4 });
        break;
      }
    }
  }

  // ---------- generative score ----------
  _buildMusic() {
    const ctx = this.ctx, t = ctx.currentTime;
    this._drone = [];
    // a low filter the whole bed breathes through
    this._droneFilter = ctx.createBiquadFilter();
    this._droneFilter.type = 'lowpass'; this._droneFilter.frequency.value = 260; this._droneFilter.Q.value = 0.7;
    this._droneFilter.connect(this.music);
    // slow LFO on the cutoff for life
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05;
    const lfoG = ctx.createGain(); lfoG.gain.value = 90;
    lfo.connect(lfoG).connect(this._droneFilter.frequency); lfo.start();
    this._droneLfo = lfo;
    // drone partials: sub, root, fifth (each two detuned saws)
    const parts = [[this.root / 2, 0.16], [this.root, 0.13], [this.root * 1.4983, 0.08]];
    for (const [f, g] of parts) {
      for (const det of [-6, 7]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
        const og = ctx.createGain(); og.gain.value = g / 2;
        o.connect(og).connect(this._droneFilter); o.start(t);
        this._drone.push({ o, g: og, base: g / 2 });
      }
    }
    // a pure sub-sine for weight
    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = this.root / 2;
    const subG = ctx.createGain(); subG.gain.value = 0.12; sub.connect(subG).connect(this.music); sub.start(t);
    this._sub = subG;
    // a dissonant partial, silent until bosses wake it
    const dis = ctx.createOscillator(); dis.type = 'sawtooth'; dis.frequency.value = this.root * semis(6); // tritone
    const disG = ctx.createGain(); disG.gain.value = 0.0001; dis.connect(disG).connect(this._droneFilter); dis.start(t);
    this._dissonance = disG;
    // a slow growl bed for boss scenes
    const growl = ctx.createOscillator(); growl.type = 'sawtooth'; growl.frequency.value = this.root * 0.75;
    const trem = ctx.createOscillator(); trem.frequency.value = 5.5;
    const tremG = ctx.createGain(); tremG.gain.value = 0.04;
    const growlG = ctx.createGain(); growlG.gain.value = 0.0001;
    const growlF = ctx.createBiquadFilter(); growlF.type = 'lowpass'; growlF.frequency.value = 220;
    trem.connect(tremG).connect(growlG.gain); growl.connect(growlF).connect(growlG).connect(this.music);
    growl.start(t); trem.start(t);
    this._growl = growlG;
  }

  // A single bell/pluck note from the scale, soaked in reverb.
  _note(deg, oct, when, gain, dur) {
    const f = this.root * 4 * semis(MINOR[deg % MINOR.length] + 12 * oct);
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = Math.random() < 0.5 ? 'triangle' : 'sine'; o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    // strong reverb send for the haunting tail
    o.connect(g); g.connect(this.musicSend); g.connect(this.music);
    o.start(when); o.stop(when + dur + 0.05);
  }

  _playMotif(when) {
    const m = MOTIFS[(Math.random() * MOTIFS.length) | 0];
    const oct = Math.random() < 0.4 ? 1 : 0;
    const step = this.scene === 'boss' ? 0.55 : 0.78;
    for (let i = 0; i < m.length; i++) this._note(m[i], oct, when + i * step, 0.085, 2.4);
  }

  _padSwell(when) {
    const ctx = this.ctx;
    const chord = Math.random() < 0.5 ? [0, 3, 7] : [0, 3, 10];   // minor / minor7 colour
    for (const n of chord) {
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.value = this.root * 2 * semis(n + (Math.random() < 0.3 ? 12 : 0));
      o.detune.value = (Math.random() - 0.5) * 10;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(0.05, when + 3);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 9);
      o.connect(g); g.connect(this.musicSend); g.connect(this.music);
      o.start(when); o.stop(when + 9.2);
    }
  }

  _heartbeat(when, gain) {
    // lub-dub: two soft low thumps
    for (const off of [0, 0.22]) {
      const o = this.ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(70, when + off); o.frequency.exponentialRampToValueAtTime(40, when + off + 0.12);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, when + off);
      g.gain.exponentialRampToValueAtTime(gain * (off ? 0.7 : 1), when + off + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, when + off + 0.2);
      o.connect(g).connect(this.music);
      o.start(when + off); o.stop(when + off + 0.25);
    }
  }

  // generative scheduler — fires pads, motifs and heartbeats over time
  _tick() {
    if (!this.ready) return;
    // ease intensity toward its target
    this._intensity += (this._intensityTarget - this._intensity) * 0.06;
    const now = this._now();
    if (now > this._padT) { this._padSwell(now + 0.1); this._padT = now + 9 + Math.random() * 8; }
    if (now > this._melT && this.scene !== 'gameover') {
      this._playMotif(now + 0.1);
      const gap = (this.scene === 'boss') ? 5 : (this.scene === 'camp') ? 8 : 6;
      this._melT = now + gap + Math.random() * gap;
    }
    if (this._intensity > 0.05) {
      const period = 2.0 - 0.9 * this._intensity;        // quickens with intensity
      if (now > this._beatT) { this._heartbeat(now + 0.05, 0.16 * this._intensity); this._beatT = now + period; }
    }
  }

  // ---------- scene / mood ----------
  setScene(name) {
    this.scene = name;
    if (!this.ready) return;
    const t = this._now(), ramp = 1.6;
    const set = (param, val) => { param.cancelScheduledValues(t); param.setValueAtTime(param.value, t); param.linearRampToValueAtTime(val, t + ramp); };
    let cutoff = 260, dis = 0.0001, growl = 0.0001, intensity = 0;
    switch (name) {
      case 'title': cutoff = 300; intensity = 0; break;
      case 'camp': cutoff = 360; intensity = 0; break;     // safe room — warmer, open
      case 'combat': cutoff = 240; intensity = 0.55; break;
      case 'boss': cutoff = 200; dis = 0.05; growl = 0.07; intensity = 1; break;
      case 'gameover': cutoff = 120; intensity = 0; break;
      case 'victory': cutoff = 500; intensity = 0; break;
    }
    if (this._droneFilter) set(this._droneFilter.frequency, cutoff);
    if (this._dissonance) set(this._dissonance.gain, dis);
    if (this._growl) set(this._growl.gain, growl);
    this._intensityTarget = intensity;
    this._melT = Math.min(this._melT, t + 1.5);
  }
}

export const Sound = new GameAudio();
