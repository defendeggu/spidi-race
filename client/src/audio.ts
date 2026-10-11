/** Synthesised sounds via WebAudio – no sample files needed. */
class AudioSystem {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;

  /** Must be called from a user gesture. */
  unlock() {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.6;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.6;
    return this.muted;
  }

  noiseSource() {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    return src;
  }

  beep(freq: number, dur: number, vol = 0.25) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(ctx.currentTime + dur);
  }

  crash(intensity: number, pan = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const src = this.noiseSource();
    src.loop = false;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500 + intensity * 120;
    const g = ctx.createGain();
    const v = Math.min(0.9, 0.15 + intensity * 0.05);
    g.gain.setValueAtTime(v, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(f).connect(g).connect(p).connect(this.master);
    src.start(ctx.currentTime, Math.random());
    src.stop(ctx.currentTime + 0.4);
  }
}

export const audio = new AudioSystem();

/** Engine + tyre noise for one car. */
export class EngineVoice {
  private oscA: OscillatorNode;
  private oscB: OscillatorNode;
  private filter: BiquadFilterNode;
  private gain: GainNode;
  private skidGain: GainNode;
  private skidSrc: AudioBufferSourceNode;
  private gravelGain: GainNode;
  private gravelSrc: AudioBufferSourceNode;
  private out: GainNode;

  constructor(pan = 0, volume = 1) {
    const ctx = audio.ctx!;
    this.out = ctx.createGain();
    this.out.gain.value = volume;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    this.out.connect(panner).connect(audio.master!);

    this.oscA = ctx.createOscillator();
    this.oscA.type = 'sawtooth';
    this.oscB = ctx.createOscillator();
    this.oscB.type = 'square';
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 2;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    const mixB = ctx.createGain();
    mixB.gain.value = 0.5;
    this.oscA.connect(this.filter);
    this.oscB.connect(mixB).connect(this.filter);
    this.filter.connect(this.gain).connect(this.out);
    this.oscA.start();
    this.oscB.start();

    this.skidSrc = audio.noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1700;
    bp.Q.value = 1.3;
    this.skidGain = ctx.createGain();
    this.skidGain.gain.value = 0;
    this.skidSrc.connect(bp).connect(this.skidGain).connect(this.out);
    this.skidSrc.start();

    // rumble of loose gravel / sand under the tyres
    this.gravelSrc = audio.noiseSource();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    this.gravelGain = ctx.createGain();
    this.gravelGain.gain.value = 0;
    this.gravelSrc.connect(lp).connect(this.gravelGain).connect(this.out);
    this.gravelSrc.start(0, Math.random());
  }

  update(rpm: number, throttle: number, skid: number, gravel = 0) {
    const ctx = audio.ctx!;
    const t = ctx.currentTime;
    const f = 28 + (rpm / 60) * 2.6;
    this.oscA.frequency.setTargetAtTime(f, t, 0.03);
    this.oscB.frequency.setTargetAtTime(f * 0.501, t, 0.03);
    this.filter.frequency.setTargetAtTime(350 + rpm * 0.22 + throttle * 500, t, 0.05);
    this.gain.gain.setTargetAtTime(0.07 + throttle * 0.07 + (rpm / 8000) * 0.04, t, 0.05);
    this.skidGain.gain.setTargetAtTime(skid * 0.22, t, 0.05);
    this.gravelGain.gain.setTargetAtTime(gravel * 0.35, t, 0.08);
  }

  setVolume(v: number) {
    this.out.gain.setTargetAtTime(v, audio.ctx!.currentTime, 0.1);
  }

  dispose() {
    this.oscA.stop();
    this.oscB.stop();
    this.skidSrc.stop();
    this.gravelSrc.stop();
    this.out.disconnect();
  }
}
