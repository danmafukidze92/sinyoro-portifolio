/**
 * Procedural twin-turbo V8 exhaust (tuned E63-S character), built with Web Audio:
 *  - cross-plane V8 burble: a custom periodic wave on the 4-stroke cycle frequency
 *    (rpm / 120), heavy on the 4th order (firing) with uneven half-orders for the lope
 *  - exhaust resonance + drive that opens up with throttle (valved sports exhaust)
 *  - turbo spool whistle and blow-off "pssh" when you lift
 *  - over-run pops and crackles, gear shifts with ignition-cut "brap"
 * No samples, so nothing to download and no licensing.
 */

const IDLE = 820;
const REDLINE = 7000;
// km/h top speed of each gear (arcade): 7 gears like the MCT 9G squeezed into the play area
const GEAR_TOP = [0, 40, 68, 96, 124, 152, 180, 215];

export class V8Engine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.rpm = IDLE;
    this.gear = 1;
    this.boost = 0;
    this.lastThrottle = 0;
    this.overrun = 0;
    this.popCooldown = 0;
    this.shiftTimer = 0;
    this.onPop = null; // callback(strength) for exhaust flames
  }

  get started() { return !!this.ctx; }

  /** Must be called from a user gesture (click / key). */
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());

    // master chain
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 5;
    comp.attack.value = 0.004; comp.release.value = 0.18;
    this.master.connect(comp).connect(ctx.destination);

    // ---- engine core: two slightly detuned oscillators (left/right bank)
    const wave = this.makeV8Wave(ctx);
    this.oscA = ctx.createOscillator(); this.oscA.setPeriodicWave(wave);
    this.oscB = ctx.createOscillator(); this.oscB.setPeriodicWave(wave);
    this.oscB.detune.value = 9;

    // amplitude lope (uneven firing) — LFO on cycle frequency
    this.lope = ctx.createOscillator(); this.lope.type = 'triangle';
    const lopeDepth = ctx.createGain(); lopeDepth.gain.value = 0.28;
    this.coreGain = ctx.createGain(); this.coreGain.gain.value = 0.7;
    this.lope.connect(lopeDepth).connect(this.coreGain.gain);

    const mix = ctx.createGain(); mix.gain.value = 0.5;
    this.oscA.connect(mix); this.oscB.connect(mix);

    this.shaper = ctx.createWaveShaper();
    this.shaper.curve = this.makeDrive(2.2);
    this.shaper.oversample = '2x';

    this.lowpass = ctx.createBiquadFilter(); this.lowpass.type = 'lowpass'; this.lowpass.Q.value = 0.9;
    this.body = ctx.createBiquadFilter(); this.body.type = 'peaking';
    this.body.frequency.value = 110; this.body.Q.value = 1.1; this.body.gain.value = 9;
    this.rasp = ctx.createBiquadFilter(); this.rasp.type = 'peaking';
    this.rasp.frequency.value = 900; this.rasp.Q.value = 1.4; this.rasp.gain.value = 0;

    this.engineGain = ctx.createGain(); this.engineGain.gain.value = 0.0;
    mix.connect(this.shaper).connect(this.coreGain).connect(this.lowpass)
      .connect(this.body).connect(this.rasp).connect(this.engineGain).connect(this.master);

    // ---- exhaust roar noise, band-passed around firing harmonics
    this.noiseBuffer = this.makeNoise(ctx, 2);
    const roar = ctx.createBufferSource(); roar.buffer = this.noiseBuffer; roar.loop = true;
    this.roarFilter = ctx.createBiquadFilter(); this.roarFilter.type = 'bandpass'; this.roarFilter.Q.value = 0.9;
    this.roarGain = ctx.createGain(); this.roarGain.gain.value = 0;
    roar.connect(this.roarFilter).connect(this.roarGain).connect(this.master);

    // ---- turbo whistle (two turbos, slightly apart) + intake hiss
    this.turboA = ctx.createOscillator(); this.turboA.type = 'sine';
    this.turboB = ctx.createOscillator(); this.turboB.type = 'sine';
    this.turboGain = ctx.createGain(); this.turboGain.gain.value = 0;
    this.turboA.connect(this.turboGain); this.turboB.connect(this.turboGain);
    this.turboGain.connect(this.master);
    const hiss = ctx.createBufferSource(); hiss.buffer = this.noiseBuffer; hiss.loop = true;
    const hissHp = ctx.createBiquadFilter(); hissHp.type = 'highpass'; hissHp.frequency.value = 4200;
    this.hissGain = ctx.createGain(); this.hissGain.gain.value = 0;
    hiss.connect(hissHp).connect(this.hissGain).connect(this.master);

    const t = ctx.currentTime;
    for (const n of [this.oscA, this.oscB, this.lope, roar, this.turboA, this.turboB, hiss]) n.start(t);
    // starter → idle flare
    this.rpm = 2600;
    this.engineGain.gain.setTargetAtTime(0.9, t, 0.15);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
  }

  makeV8Wave(ctx) {
    // harmonic amplitudes on the cycle frequency (index = order × 2 of crank)
    const amps = { 1: 0.22, 2: 0.5, 3: 0.32, 4: 1.0, 5: 0.28, 6: 0.36, 7: 0.16, 8: 0.62, 9: 0.12, 10: 0.18, 11: 0.08, 12: 0.34, 14: 0.12, 16: 0.22, 20: 0.08, 24: 0.06 };
    const n = 26;
    const real = new Float32Array(n), imag = new Float32Array(n);
    for (let i = 1; i < n; i++) {
      imag[i] = amps[i] || 0.015;
      real[i] = (amps[i] || 0) * 0.25 * Math.sin(i * 1.7); // phase smear for a rougher waveform
    }
    return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  }

  makeDrive(k) {
    const n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    return curve;
  }

  makeNoise(ctx, seconds) {
    const len = ctx.sampleRate * seconds;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.04 * white) / 1.04; // brownish
      d[i] = white * 0.5 + last * 3.0;
    }
    return b;
  }

  /** Short noise burst: pops, crackles, blow-off. */
  burst({ when = 0, dur = 0.05, freq = 1200, q = 0.8, gain = 0.6, type = 'bandpass', sweepTo = null }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  /** Low thump that goes with a pop. */
  thump(when = 0, gain = 0.5) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.12);
  }

  pop(strength = 1) {
    this.burst({ dur: 0.03 + Math.random() * 0.05, freq: 700 + Math.random() * 1600, q: 0.6, gain: 0.35 * strength + Math.random() * 0.25 });
    if (Math.random() < 0.6) this.thump(0, 0.35 * strength);
    if (this.onPop) this.onPop(strength);
  }

  blowOff() {
    this.burst({ dur: 0.38, freq: 3200, sweepTo: 700, q: 2.2, gain: 0.32 * this.boost + 0.08 });
    this.burst({ when: 0.05, dur: 0.22, freq: 5200, type: 'highpass', q: 0.4, gain: 0.08 });
  }

  /**
   * @param dt seconds
   * @param throttle 0..1
   * @param speedKmh absolute road speed
   */
  update(dt, throttle, speedKmh) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;

    // ---- gearbox + rpm model
    const prevGear = this.gear;
    if (speedKmh < 2) this.gear = 1;
    else {
      while (this.gear < 7 && speedKmh > GEAR_TOP[this.gear] * 0.97) this.gear++;
      while (this.gear > 1 && speedKmh < GEAR_TOP[this.gear - 1] * 0.72) this.gear--;
    }
    const lo = GEAR_TOP[this.gear - 1] * 0.6, hi = GEAR_TOP[this.gear];
    let target = IDLE + Math.max(0, (speedKmh - lo) / (hi - lo)) * (REDLINE - IDLE) * 0.95;
    if (speedKmh < 3) target = IDLE + throttle * (REDLINE - IDLE) * 0.85; // free revving at standstill
    target = Math.min(REDLINE, Math.max(IDLE, target));

    if (this.gear > prevGear && throttle > 0.3) {
      // upshift under load: ignition-cut "brap"
      this.shiftTimer = 0.09;
      this.pop(0.9);
      this.burst({ when: 0.03, dur: 0.05, freq: 900, gain: 0.4 });
    }
    if (this.shiftTimer > 0) this.shiftTimer -= dt;

    const rate = target > this.rpm ? (throttle > 0 ? 9 : 4) : 5.5;
    this.rpm += (target - this.rpm) * Math.min(1, dt * rate);
    // idle lumpiness
    const lumpy = this.rpm < 1400 ? (Math.random() - 0.5) * 50 : 0;
    const rpm = this.rpm + lumpy;

    // ---- turbo boost (spools with load, lags)
    const boostTarget = throttle * Math.min(1, Math.max(0, (rpm - 1800) / 2600));
    this.boost += (boostTarget - this.boost) * Math.min(1, dt * (boostTarget > this.boost ? 2.2 : 6));

    // ---- lift-off events
    const lifted = this.lastThrottle > 0.5 && throttle < 0.15;
    if (lifted && this.boost > 0.35) this.blowOff();
    if (lifted && this.rpm > 2400) this.overrun = 1.6;
    this.lastThrottle = throttle;

    if (this.overrun > 0) {
      this.overrun -= dt;
      this.popCooldown -= dt;
      if (throttle < 0.1 && this.rpm > 1700 && this.popCooldown <= 0) {
        const intensity = Math.min(1, this.overrun / 1.6) * (this.rpm / REDLINE);
        if (Math.random() < 0.55 + intensity * 0.4) this.pop(0.5 + intensity);
        this.popCooldown = 0.03 + Math.random() * 0.12;
      }
    }

    // ---- apply to the audio graph
    const cycle = rpm / 120;           // 4-stroke cycle frequency
    const firing = (rpm / 60) * 4;     // V8 firing frequency
    const load = throttle * 0.75 + this.boost * 0.25;
    const cut = this.shiftTimer > 0 ? 0.25 : 1;

    this.oscA.frequency.setTargetAtTime(cycle, t, 0.02);
    this.oscB.frequency.setTargetAtTime(cycle * 1.004, t, 0.02);
    this.lope.frequency.setTargetAtTime(cycle * 0.5, t, 0.05);
    this.lowpass.frequency.setTargetAtTime(260 + rpm * 0.32 + load * 2600, t, 0.04);
    this.body.frequency.setTargetAtTime(Math.min(220, 80 + firing * 0.12), t, 0.05);
    this.rasp.gain.setTargetAtTime(load * 7 + (rpm / REDLINE) * 3, t, 0.05);
    this.engineGain.gain.setTargetAtTime((0.55 + load * 0.55 + (rpm / REDLINE) * 0.25) * cut, t, 0.03);

    this.roarFilter.frequency.setTargetAtTime(Math.min(2400, firing * 1.6), t, 0.04);
    this.roarGain.gain.setTargetAtTime((0.04 + load * 0.22) * (0.35 + rpm / REDLINE) * cut, t, 0.04);

    const spool = 1400 + this.boost * 4600 + rpm * 0.22;
    this.turboA.frequency.setTargetAtTime(spool, t, 0.08);
    this.turboB.frequency.setTargetAtTime(spool * 1.07, t, 0.08);
    this.turboGain.gain.setTargetAtTime(this.boost * this.boost * 0.035, t, 0.08);
    this.hissGain.gain.setTargetAtTime(this.boost * 0.05, t, 0.1);
  }

  get display() {
    return { rpm: Math.round(this.rpm), gear: this.gear, boost: this.boost };
  }
}
