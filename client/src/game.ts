import * as THREE from 'three';
import {
  AIDriver, applyNetCar, collideCars, createCarState, forwardSpeed, getCar, getTrack, gridPosition, idleCar,
  lerp, lerpAngle, NO_INPUT, Race, stepCar, toNetCar,
  type CarSpec, type CarState, type NetCar, type ResultRow, type ServerMsg, type Slot, type Track,
} from '@spidi/shared';
import { audio, EngineVoice } from './audio';
import { Hud, type MapDot } from './hud';
import { input, type KeyMap } from './input';
import type { Net } from './net';
import { ChaseCamera } from './render/cameras';
import { carColor, CarVisual } from './render/carModel';
import { getWorld, type World } from './render/world';
import { renderViewports, type Viewport } from './renderer';

const STEP = 1 / 60;
const INTERP_DELAY = 110;

export interface LocalPlayerCfg {
  slotId: string;
  keymap: KeyMap;
  pad: number;
}

export interface GameOptions {
  trackId: string;
  laps: number;
  slots: Slot[];
  locals: LocalPlayerCfg[];
  countdown: number;
  aiSkill: number;
  net?: Net;
}

interface GameCar {
  slot: Slot;
  spec: CarSpec;
  state: CarState;
  prev: { x: number; y: number; z: number; heading: number };
  visual: CarVisual;
  color: string;
  ai?: AIDriver;
  simulated: boolean;
  buffer: { t: number; car: NetCar }[];
  renderHeading: number;
}

interface LocalPlayer {
  car: GameCar;
  cfg: LocalPlayerCfg;
  cam: ChaseCamera;
  hud: Hud;
  voice: EngineVoice | null;
  wrongWay: number;
  impactCooldown: number;
}

export class Game {
  readonly track: Track;
  readonly race: Race;
  private world: World;
  private cars: GameCar[] = [];
  private players: LocalPlayer[] = [];
  private acc = 0;
  private last = 0;
  private raf = 0;
  private stepCount = 0;
  private lastBeep = -1;
  private finishedNotified = false;
  private offNet: (() => void) | null = null;
  paused = false;
  onFinish: ((results: ResultRow[]) => void) | null = null;
  onPause: (() => void) | null = null;

  constructor(private hudLayer: HTMLElement, private opts: GameOptions) {
    this.track = getTrack(opts.trackId);
    this.world = getWorld(opts.trackId);
    this.race = new Race(this.track, opts.laps, opts.slots, opts.countdown);
    const myId = opts.net?.clientId;
    // humans keep the original paint, duplicates of the same model get a variant
    const variant = new Map<string, number>();
    const seen = new Map<string, number>();
    for (const slot of [...opts.slots].sort((a, b) => Number(a.isAI) - Number(b.isAI))) {
      const dup = seen.get(slot.carId) ?? 0;
      seen.set(slot.carId, dup + 1);
      variant.set(slot.id, dup);
    }

    for (const slot of opts.slots) {
      const spec = getCar(slot.carId);
      const hue = variant.get(slot.id) ?? 0;
      const g = gridPosition(this.track, slot.grid);
      const state = createCarState(slot.id, this.track, g.x, g.z, g.heading);
      const simulated = !opts.net || (slot.ownerId === myId && !slot.isAI);
      const visual = new CarVisual(spec, slot.name, hue);
      this.world.dynamic.add(visual.group);
      this.cars.push({
        slot, spec, state, visual, simulated, buffer: [], color: carColor(spec, hue), renderHeading: state.heading,
        prev: { x: state.x, y: state.y, z: state.z, heading: state.heading },
        ai: simulated && slot.isAI ? new AIDriver(slot.grid + 1, opts.aiSkill - 0.06 + ((slot.grid * 37) % 7) * 0.012) : undefined,
      });
    }

    const split = opts.locals.length > 1;
    opts.locals.forEach((cfg, k) => {
      const car = this.cars.find((c) => c.slot.id === cfg.slotId)!;
      const holder = document.createElement('div');
      holder.className = 'hud-view';
      holder.style.top = split ? `${k * 50}%` : '0';
      holder.style.height = split ? '50%' : '100%';
      hudLayer.appendChild(holder);
      const hud = new Hud(holder, this.track, cfg.slotId, split);
      const voice = audio.ctx ? new EngineVoice(split ? (k === 0 ? -0.45 : 0.45) : 0, split ? 0.75 : 1) : null;
      this.players.push({ car, cfg, cam: new ChaseCamera(), hud, voice, wrongWay: 0, impactCooldown: 0 });
    });

    if (opts.net) {
      this.offNet = opts.net.on((m) => this.onNet(m));
    }
  }

  start() {
    this.last = performance.now();
    input.clearPressed();
    const frame = (now: number) => {
      this.raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.frame(dt, now);
    };
    this.raf = requestAnimationFrame(frame);
  }

  private onNet(m: ServerMsg) {
    if (m.type === 'snap') {
      const now = performance.now();
      for (const nc of m.cars) {
        const c = this.cars.find((k) => k.slot.id === nc.id);
        if (!c || c.simulated) continue;
        c.buffer.push({ t: now, car: nc });
        if (c.buffer.length > 40) c.buffer.shift();
      }
      this.race.applyNet(m.race);
      // drop cars of players that left
      for (const c of [...this.cars]) {
        if (!m.race.entries.some((e) => e.id === c.slot.id)) {
          c.visual.dispose();
          this.cars.splice(this.cars.indexOf(c), 1);
        }
      }
    } else if (m.type === 'end') {
      this.finish(m.results);
    }
  }

  private finish(results: ResultRow[]) {
    if (this.finishedNotified) return;
    this.finishedNotified = true;
    this.onFinish?.(results);
  }

  private frame(dt: number, now: number) {
    if (input.consume(['Escape'])) this.onPause?.();
    if (input.consume(['KeyM'])) {
      const m = audio.toggleMute();
      for (const p of this.players) p.hud.flash(m ? 'Ton aus' : 'Ton an', 1);
    }
    for (const p of this.players) {
      if (input.consume(p.cfg.keymap.camera)) {
        p.cam.cycle();
        p.hud.showCameraMode(p.cam.mode);
      }
    }

    const sim = !(this.paused && !this.opts.net);
    if (sim) {
      this.acc += dt;
      while (this.acc >= STEP) {
        this.fixedStep(STEP);
        this.acc -= STEP;
      }
    }
    this.updateRemote(now);
    this.render(sim ? this.acc / STEP : 1, dt);

    if (!this.opts.net && this.race.phase === 'finished') this.finish(this.race.results());
  }

  private fixedStep(dt: number) {
    const race = this.race;
    const started = race.started;
    const states = this.cars.map((c) => c.state);
    for (const c of this.cars) {
      if (!c.simulated) continue;
      const s = c.state;
      c.prev.x = s.x;
      c.prev.y = s.y;
      c.prev.z = s.z;
      c.prev.heading = s.heading;
      const player = this.players.find((p) => p.car === c);
      const entry = race.entry(c.slot.id);
      let inp = NO_INPUT;
      if (player && !entry?.finished && !this.paused) inp = input.carInput(player.cfg.keymap, player.cfg.pad);
      else if (c.ai || entry?.finished) {
        c.ai ??= new AIDriver(c.slot.grid + 99, 0.85);
        inp = started ? c.ai.update(s, c.spec, this.track, dt, states) : NO_INPUT;
      }
      if (!started) idleCar(s, inp, dt);
      else stepCar(s, c.spec, inp, this.track, dt);
    }
    if (started) {
      for (let i = 0; i < this.cars.length; i++) {
        for (let j = i + 1; j < this.cars.length; j++) {
          const a = this.cars[i], b = this.cars[j];
          if (!a.simulated && !b.simulated) continue;
          collideCars(a.state, b.state, a.simulated ? a.spec.mass : Infinity, b.simulated ? b.spec.mass : Infinity);
        }
      }
    }
    if (!this.opts.net) {
      race.update(dt, (id) => this.cars.find((c) => c.slot.id === id)?.state.s);
    } else if (++this.stepCount % 2 === 0) {
      this.opts.net.send({ type: 'state', cars: this.cars.filter((c) => c.simulated).map((c) => toNetCar(c.state)) });
    }
  }

  /** Interpolate cars simulated elsewhere (other clients, server AI). */
  private updateRemote(now: number) {
    const t = now - INTERP_DELAY;
    for (const c of this.cars) {
      if (c.simulated || c.buffer.length === 0) continue;
      const buf = c.buffer;
      let a = buf[0], b = buf[0];
      for (let i = buf.length - 1; i >= 0; i--) {
        if (buf[i].t <= t) {
          a = buf[i];
          b = buf[Math.min(i + 1, buf.length - 1)];
          break;
        }
      }
      const s = c.state;
      applyNetCar(s, a.car);
      if (b !== a) {
        const k = Math.min(1, (t - a.t) / (b.t - a.t));
        s.x = lerp(a.car.x, b.car.x, k);
        s.y = lerp(a.car.y, b.car.y, k);
        s.z = lerp(a.car.z, b.car.z, k);
        s.heading = lerpAngle(a.car.h, b.car.h, k);
      }
      const p = this.track.project(s.x, s.z, s.idx);
      s.idx = p.idx;
      s.s = p.s;
      c.prev.x = s.x;
      c.prev.y = s.y;
      c.prev.z = s.z;
      c.prev.heading = s.heading;
    }
  }

  private render(alpha: number, dt: number) {
    const tmp = new THREE.Vector3();
    for (const c of this.cars) {
      const s = c.state, p = c.prev;
      c.renderHeading = lerpAngle(p.heading, s.heading, alpha);
      c.visual.update(this.track, lerp(p.x, s.x, alpha), lerp(p.y, s.y, alpha), lerp(p.z, s.z, alpha), c.renderHeading, s, dt);
    }

    // countdown beeps
    if (this.race.phase === 'countdown' && this.race.countdown <= 3) {
      const n = Math.ceil(this.race.countdown);
      if (n !== this.lastBeep) {
        this.lastBeep = n;
        audio.beep(440, 0.25);
      }
    } else if (this.race.started && this.lastBeep > 0) {
      this.lastBeep = 0;
      audio.beep(880, 0.6);
    }

    const views: Viewport[] = [];
    const split = this.players.length > 1;
    const dots: MapDot[] = this.cars.map((c) => ({ x: c.state.x, z: c.state.z, color: c.color, self: false }));
    this.players.forEach((pl, k) => {
      const c = pl.car, s = c.state;
      const v = forwardSpeed(s);
      tmp.copy(c.visual.group.position);
      pl.cam.update(tmp, c.renderHeading, c.visual.up, v, dt);
      views.push({ camera: pl.cam.camera, rect: split ? [0, k * 0.5, 1, 0.5] : [0, 0, 1, 1] });

      const along = Math.sin(s.heading) * this.track.tx[s.idx] + Math.cos(s.heading) * this.track.tz[s.idx];
      pl.wrongWay = along < -0.2 && this.race.started ? pl.wrongWay + dt : 0;
      const myDots = dots.map((d, i) => ({ ...d, self: this.cars[i] === c }));
      pl.hud.update(this.race, v, s.gear, s.rpm, myDots, pl.wrongWay > 1.2, dt);

      pl.voice?.update(s.rpm, s.throttle, s.skid * Math.min(1, Math.abs(v) / 8));
      pl.impactCooldown -= dt;
      if (s.impact > 3 && pl.impactCooldown <= 0) {
        audio.crash(s.impact, split ? (k === 0 ? -0.45 : 0.45) : 0);
        pl.impactCooldown = 0.25;
      }
    });
    // own name tag is hidden for the player looking through that car
    for (const c of this.cars) c.visual.setLabelVisible(!this.players.some((p) => p.car === c) && !c.slot.isAI);
    renderViewports(this.world.scene, views);
  }

  /** Mute engines while paused / in results. */
  setEngineVolume(v: number) {
    for (const p of this.players) p.voice?.setVolume(v);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.offNet?.();
    for (const c of this.cars) c.visual.dispose();
    for (const p of this.players) {
      p.hud.dispose();
      p.voice?.dispose();
    }
    this.hudLayer.innerHTML = '';
  }
}
