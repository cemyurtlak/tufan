// Tamamen sentezlenmiş ses efektleri (Web Audio API) — harici ses dosyası yok.

class GameAudio {
  constructor() { this.ctx = null; this.muted = false; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.7; this.master.connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let last = 0;
    this.brownBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brownBuf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = Math.random() * 2 - 1;
      last = (last + 0.02 * d[i]) / 1.02; b[i] = last * 3.5;
    }

    // Motor uğultusu
    this.engOsc = ctx.createOscillator(); this.engOsc.type = 'sawtooth'; this.engOsc.frequency.value = 50;
    this.engOsc2 = ctx.createOscillator(); this.engOsc2.type = 'square'; this.engOsc2.frequency.value = 75;
    this.engFilt = ctx.createBiquadFilter(); this.engFilt.type = 'lowpass'; this.engFilt.frequency.value = 300;
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.engOsc.connect(this.engFilt); this.engOsc2.connect(this.engFilt);
    this.engFilt.connect(this.engGain); this.engGain.connect(this.master);
    this.engOsc.start(); this.engOsc2.start();

    // İtici tıslaması
    this.thr = this.loopNoise(this.noiseBuf, 'bandpass', 1800, 0.8);
    // Fırlatma gürültüsü
    this.rum = this.loopNoise(this.brownBuf, 'lowpass', 400, 0.7);

    // Ortam tınısı
    this.amb = ctx.createGain(); this.amb.gain.value = 0; this.amb.connect(this.master);
    for (const f of [55, 82.4, 110.3]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = 0.25;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05 + Math.random() * 0.1;
      const lg = ctx.createGain(); lg.gain.value = 0.15; lfo.connect(lg); lg.connect(g.gain); lfo.start();
      o.connect(g); g.connect(this.amb); o.start();
    }
  }

  loopNoise(buf, type, freq, q) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
    return { src, f, g };
  }

  set(param, v, t = 0.08) { if (this.ctx) param.setTargetAtTime(v, this.ctx.currentTime, t); }

  engine(speed, throttle) {
    if (!this.ctx) return;
    this.set(this.engOsc.frequency, 45 + speed * 9 + throttle * 15);
    this.set(this.engOsc2.frequency, 68 + speed * 13);
    this.set(this.engFilt.frequency, 220 + speed * 70 + throttle * 200);
    this.set(this.engGain.gain, 0.025 + throttle * 0.06 + Math.min(speed, 12) * 0.004);
  }
  engineOff() { if (this.ctx) this.set(this.engGain.gain, 0); }
  thrust(on) { if (this.ctx) this.set(this.thr.g.gain, on ? 0.18 : 0, 0.05); }
  rumble(v) { if (this.ctx) { this.set(this.rum.g.gain, v, 0.2); this.set(this.rum.f.frequency, 200 + v * 600, 0.3); } }
  ambient(v) { if (this.ctx) this.set(this.amb.gain, v * 0.05, 1.5); }

  tone(freq, dur = 0.12, type = 'sine', vol = 0.15, delay = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  click() { this.tone(1200, 0.05, 'square', 0.04); }
  chime() { this.tone(660, 0.25, 'sine', 0.12); this.tone(990, 0.4, 'sine', 0.1, 0.12); }
  warn() { this.tone(440, 0.15, 'square', 0.05); this.tone(330, 0.2, 'square', 0.05, 0.18); }
  scanTick() { this.tone(1800 + Math.random() * 400, 0.04, 'sine', 0.03); }

  boom(vol = 0.9) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.brownBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(1800, t); f.frequency.exponentialRampToValueAtTime(60, t + 3);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 4);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t); src.stop(t + 4.2);
  }
  thump(vol = 0.3) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.35);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.7;
    return this.muted;
  }
  silenceLoops() { this.engineOff(); this.thrust(false); this.rumble(0); }
}

export const audio = new GameAudio();
