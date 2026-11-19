// Sound, all synthesized: engine hum, sirens, gunshots, jingles, and three
// in-car radio stations that play generative music. No audio files.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenPhase = 0;
    this.rotorOsc = null;
    this.rotorGain = null;
    this.radioStation = 'VELA 101';
    this.stationIndex = 0;
    this.nextNoteTime = 0;
    this.step = 0;
    this.noiseBuf = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      // Engine: detuned saws through a lowpass.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 60;
      const engineFilter = this.ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 500;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(engineFilter);
      engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
      // Siren: a square wave that alternates tone.
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'square';
      this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      // Heli rotor: a low chopping thump, silent until a heli is overhead.
      this.rotorOsc = this.ctx.createOscillator();
      this.rotorOsc.type = 'sawtooth';
      this.rotorOsc.frequency.value = 82;
      const rotorFilter = this.ctx.createBiquadFilter();
      rotorFilter.type = 'lowpass';
      rotorFilter.frequency.value = 220;
      this.rotorGain = this.ctx.createGain();
      this.rotorGain.gain.value = 0;
      this.rotorOsc.connect(rotorFilter);
      rotorFilter.connect(this.rotorGain);
      this.rotorGain.connect(this.master);
      this.rotorOsc.start();
      // Shared noise buffer for shots and thuds.
      const len = this.ctx.sampleRate * 0.2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.nextNoteTime = this.ctx.currentTime + 0.1;
    } catch (e) {
      this.ctx = null;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  setEngine(speed01, inCar) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 160, t, 0.08);
    this.engineGain.gain.setTargetAtTime(inCar ? 0.035 + speed01 * 0.05 : 0, t, 0.1);
  }

  setSiren(dist) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const near = Math.max(0, 1 - dist / 160);
    this.sirenGain.gain.setTargetAtTime(near * 0.05, t, 0.2);
  }

  setRotor(on) {
    if (!this.ctx || !this.rotorGain) return;
    const t = this.ctx.currentTime;
    this.rotorGain.gain.setTargetAtTime(on ? 0.035 : 0, t, 0.3);
  }

  blip(freq, dur, type, vol, when) {
    if (!this.ctx) return;
    const t = when || this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  noise(dur, vol, filterFreq) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq || 1200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  shot() {
    this.noise(0.14, 0.5, 2500);
    this.blip(160, 0.1, 'square', 0.25);
  }

  punch() {
    this.blip(90, 0.12, 'sine', 0.4);
    this.noise(0.08, 0.2, 500);
  }

  thud() {
    this.blip(55, 0.25, 'sine', 0.45);
    this.noise(0.15, 0.25, 400);
  }

  pickup() {
    this.blip(660, 0.12, 'sine', 0.25);
    this.blip(880, 0.2, 'sine', 0.25, this.ctx ? this.ctx.currentTime + 0.09 : 0);
  }

  missionComplete() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [523, 659, 784, 1046].forEach((f, i) => this.blip(f, 0.25, 'triangle', 0.22, t + i * 0.11));
  }

  alarm() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.blip(880, 0.14, 'square', 0.15, t);
    this.blip(660, 0.14, 'square', 0.15, t + 0.16);
  }

  click() {
    this.blip(1200, 0.05, 'square', 0.12);
  }

  cycleRadio() {
    this.stationIndex = (this.stationIndex + 1) % STATIONS.length;
    this.radioStation = STATIONS[this.stationIndex].name;
    this.step = 0;
    return this.radioStation;
  }

  // Generative radio: chord pads, a bass line and a plucked arpeggio,
  // scheduled a little ahead of time. Three stations, three moods.
  updateRadio(dt, inCar) {
    if (!this.ctx || this.muted) return;
    const st = STATIONS[this.stationIndex];
    const spb = 60 / st.bpm / 2; // eighth notes
    while (this.nextNoteTime < this.ctx.currentTime + 0.25) {
      const t = this.nextNoteTime;
      const bar = Math.floor(this.step / 8) % st.chords.length;
      const chord = st.chords[bar];
      const inBar = this.step % 8;
      if (inCar) {
        if (inBar === 0) {
          for (const f of chord) {
            const osc = this.ctx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.value = f;
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.045, t + 0.4);
            g.gain.linearRampToValueAtTime(0.0001, t + spb * 8);
            osc.connect(g);
            g.connect(this.master);
            osc.start(t);
            osc.stop(t + spb * 8 + 0.1);
          }
        }
        if (inBar % 2 === 0) {
          this.blip(chord[0] / 2, spb * 1.8, 'sine', 0.12, t);
        }
        if (st.arp[inBar] !== null) {
          this.blip(chord[st.arp[inBar]] * 2, spb * 0.9, 'square', 0.035, t);
        }
      } else if (inBar === 0 && this.step % 32 === 0) {
        // On foot: a slow ambient pad, barely there.
        for (const f of chord) {
          const osc = this.ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = f / 2;
          const g = this.ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.02, t + 1);
          g.gain.linearRampToValueAtTime(0.0001, t + 8);
          osc.connect(g);
          g.connect(this.master);
          osc.start(t);
          osc.stop(t + 8.1);
        }
      }
      this.step += 1;
      this.nextNoteTime += spb;
    }
    // Siren two-tone.
    if (this.sirenGain) {
      this.sirenPhase += dt;
      if (this.sirenPhase > 0.45) {
        this.sirenPhase = 0;
        this.sirenOsc.frequency.value = this.sirenOsc.frequency.value > 800 ? 700 : 950;
      }
    }
  }
}

const AM = [220, 261.63, 329.63];
const F = [174.61, 220, 261.63];
const C = [261.63, 329.63, 392];
const G = [196, 246.94, 293.66];
const CM7 = [261.63, 329.63, 392, 493.88];
const AM7 = [220, 261.63, 329.63, 392];
const FM7 = [174.61, 220, 261.63, 329.63];
const G7 = [196, 246.94, 293.66, 349.23];

const STATIONS = [
  {
    name: 'VELA 101 — Sunset Drive',
    bpm: 96,
    chords: [AM, F, C, G],
    arp: [0, null, 1, null, 2, null, 1, null],
  },
  {
    name: 'RADIO MAR 88 — Cumbia Nights',
    bpm: 122,
    chords: [AM, AM, F, G],
    arp: [0, 2, 1, 2, 0, 2, 1, 0],
  },
  {
    name: 'VELA CLASSICS — Golden Oldies',
    bpm: 72,
    chords: [CM7, AM7, FM7, G7],
    arp: [0, null, null, 1, null, 2, null, 3],
  },
];
