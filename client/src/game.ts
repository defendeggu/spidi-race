import * as THREE from 'three';
import {
  AIDriver, applyNetCar, collideCars, ItemMirror, createCarState, forwardSpeed, getCar, getTrack, gridPosition, idleCar,
  ItemWorld, KartBrain, lerp, lerpAngle, NO_INPUT, Race, stepCar, stepKart, SURFACE_PROPS, toNetCar, toNetKart,
  type ItemEvent, type ItemKind, type Surface,
  type CarSpec, type CarState, type NetCar, type ResultRow, type ServerMsg, type Slot, type Track,
} from '@spidi/shared';
import { audio, EngineVoice } from './audio';
import { Hud, type MapDot } from './hud';
import { input, type KeyMap } from './input';
import type { Net } from './net';
import { ChaseCamera, TOPDOWN_MODE, viewForCar } from './render/cameras';
import { ItemVisuals } from './render/itemVisuals';
import { Particles } from './render/particles';
import { carColor, CarVisual } from './render/carModel';
import { getWorld, type World } from './render/world';
import { renderViewports, type Viewport } from './renderer';

const STEP = 1 / 60;

function dustColor(surface: Surface) {
  return { asphalt: '#bbbbbb', dirt: '#a88866', sand: '#d9b88a', mud: '#4a3a2a', water: '#d8ecf4' }[surface];
}
const INTERP_DELAY = 110;

export interface LocalPlayerCfg {
  slotId: string;
  keymap: KeyMap;
  /** n-th connected gamepad (not the raw Gamepad.index) */
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
  /** kart race with items (online: the server runs the items, this game shows them) */
  kart?: boolean;
}

const ITEM_NAMES: Record<ItemKind, string> = { blaster: 'Blaster', homing: 'Zielsucher', mine: 'Mine', turbo: 'Turbo', shield: 'Schild' };

interface GameCar {
  slot: Slot;
  spec: CarSpec;
  state: CarState;
  prev: { x: number; y: number; z: number; heading: number };
  visual: CarVisual;
  color: string;
  ai?: AIDriver;
  brain?: KartBrain;
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
  /** HUD containers of this game (one per player) */
  private holders: HTMLElement[] = [];
  private particles = new Particles();
  /** landings during the last fixed steps (for HUD, sound and dust) */
  private landings: { car: GameCar; airTime: number; hit: number }[] = [];
  /** kart races: items, projectiles and their visuals */
  readonly items: ItemWorld | null = null;
  private itemVisuals: ItemVisuals | null = null;
  private itemEvents: ItemEvent[] = [];
  /** network game: the server's items, own uses shown at once */
  private mirror: ItemMirror | null = null;
  /** ranks: best-lap leaderboard rank per car id (online races are recorded by the server) */
  onFinish: ((results: ResultRow[], ranks?: Record<string, number>) => void) | null = null;
  onPause: (() => void) | null = null;

  constructor(hudLayer: HTMLElement, private opts: GameOptions) {
    this.track = getTrack(opts.trackId);
    this.world = getWorld(opts.trackId);
    this.race = new Race(this.track, opts.laps, opts.slots, opts.countdown);
    this.world.dynamic.add(this.particles.points);
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
        brain: opts.kart && simulated && slot.isAI ? new KartBrain(slot.grid + 1) : undefined,
      });
    }
    if (opts.kart) {
      // online the item world is only a mirror of the server's: it is never stepped here
      this.items = new ItemWorld(this.track, opts.slots.map((s) => s.id), Math.floor(Math.random() * 1e9));
      if (opts.net) this.mirror = new ItemMirror(this.items);
      this.itemVisuals = new ItemVisuals(this.world.dynamic, this.items, new Map(this.cars.map((c) => [c.slot.id, c.visual])), this.particles);
    }

    const split = opts.locals.length > 1;
    opts.locals.forEach((cfg, k) => {
      const car = this.cars.find((c) => c.slot.id === cfg.slotId)!;
      const holder = document.createElement('div');
      holder.className = 'hud-view';
      holder.style.top = split ? `${k * 50}%` : '0';
      holder.style.height = split ? '50%' : '100%';
      hudLayer.appendChild(holder);
      this.holders.push(holder);
      const hud = new Hud(holder, this.track, cfg.slotId, split);
      const pitch = car.spec.class === 'micro' ? 1.7 : car.spec.class === 'kart' ? 1.35 : 1;
      const voice = audio.ctx ? new EngineVoice(split ? (k === 0 ? -0.45 : 0.45) : 0, split ? 0.75 : 1, pitch) : null;
      // karts: the driver's big helmet would block the normal chase view
      const view = car.spec.class === 'kart' ? viewForCar(car.spec.shape.length, car.visual.height) : {};
      this.players.push({ car, cfg, cam: new ChaseCamera(this.track.def.camera === 'topdown' ? TOPDOWN_MODE : 0, view), hud, voice, wrongWay: 0, impactCooldown: 0 });
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
      // never negative: the first animation frame time can lie before performance.now()
      const dt = Math.max(0, Math.min(0.1, (now - this.last) / 1000));
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
      if (m.items && this.mirror) {
        const own = new Set(this.cars.filter((c) => c.simulated).map((c) => c.slot.id));
        const r = this.mirror.apply(m.items, own, INTERP_DELAY / 1000);
        for (const [local, id] of r.adopt) this.itemVisuals?.adopt(local, id);
        this.itemEvents.push(...r.events);
      }
      // drop cars of players that left
      for (const c of [...this.cars]) {
        if (!m.race.entries.some((e) => e.id === c.slot.id)) {
          c.visual.dispose();
          this.cars.splice(this.cars.indexOf(c), 1);
        }
      }
    } else if (m.type === 'end') {
      this.finish(m.results, m.ranks);
    }
  }

  private finish(results: ResultRow[], ranks?: Record<string, number>) {
    if (this.finishedNotified) return;
    this.finishedNotified = true;
    this.onFinish?.(results, ranks);
  }

  private frame(dt: number, now: number) {
    const padPause = this.players.map((p) => input.consumePad(p.cfg.pad, 'pause')).some(Boolean);
    if (input.consume(['Escape']) || padPause || input.consumeTouch('pause')) this.onPause?.();
    if (input.consume(['KeyM'])) {
      const m = audio.toggleMute();
      for (const p of this.players) p.hud.flash(m ? 'Ton aus' : 'Ton an', 1);
    }
    for (const p of this.players) {
      const touch = p.cfg.pad === 0;
      // in kart races Y / △ fires, the camera moves to Back / Select or d-pad up
      if (input.consume(p.cfg.keymap.camera) || input.consumePad(p.cfg.pad, this.items ? 'altCamera' : 'camera') || (touch && input.consumeTouch('camera'))) {
        p.cam.cycle();
        p.hud.showCameraMode(p.cam.mode);
      }
      if (this.items) {
        const fire = input.consume(p.cfg.keymap.item) || input.consumePad(p.cfg.pad, 'item') || (touch && input.consumeTouch('item'));
        const entry = this.race.entry(p.car.slot.id);
        if (fire && this.race.started && !entry?.finished && !this.paused) {
          if (this.opts.net && this.mirror) {
            // shown at once, the server confirms it
            const ev = this.mirror.use(p.car.slot.id, p.car.state);
            if (ev.length) {
              this.itemEvents.push(...ev);
              this.opts.net.send({ type: 'item', id: p.car.slot.id });
            }
          } else this.items.use(p.car.slot.id);
        }
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
    // online shots fly on between the server's snapshots
    if (this.mirror) this.itemEvents.push(...this.mirror.update(dt));
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
        if (started && this.items && c.brain && !entry?.finished) {
          const d = c.brain.update(s, inp, this.track, this.items, states, dt);
          inp = d.input;
          if (d.use) this.items.use(c.slot.id);
        }
      }
      if (!started) idleCar(s, inp, dt);
      else {
        const air = s.airTime;
        if (this.items) stepKart(s, c.spec, inp, this.track, dt, this.items.kart(c.slot.id));
        else stepCar(s, c.spec, inp, this.track, dt);
        if (s.landed > 0) this.landings.push({ car: c, airTime: air, hit: s.landed });
      }
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
    if (started && this.items && !this.opts.net) {
      const pos = (id: string) => race.entry(id)?.position ?? 1;
      const ahead = (id: string) => race.entries.find((e) => e.position === pos(id) - 1)?.id ?? null;
      this.items.step(dt, states, pos, ahead);
      this.itemEvents.push(...this.items.events);
      this.items.events.length = 0;
    }
    if (!this.opts.net) {
      race.update(dt, (id) => this.cars.find((c) => c.slot.id === id)?.state.s);
    } else if (++this.stepCount % 2 === 0) {
      const mine = this.cars.filter((c) => c.simulated);
      const items = this.items;
      this.opts.net.send({
        type: 'state', cars: mine.map((c) => toNetCar(c.state)),
        karts: items ? mine.map((c) => toNetKart(items.kart(c.slot.id))) : undefined,
      });
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
    const up = { x: 0, y: 1, z: 0 };
    for (const c of this.cars) {
      const s = c.state, p = c.prev;
      c.renderHeading = lerpAngle(p.heading, s.heading, alpha);
      this.track.upAt(s.idx, up);
      const rough = SURFACE_PROPS[this.track.surfaceAt(s.idx)].rough;
      c.visual.update(lerp(p.x, s.x, alpha), lerp(p.y, s.y, alpha), lerp(p.z, s.z, alpha), c.renderHeading, s, dt, up, rough);
      this.emitDust(c, dt);
    }
    for (const l of this.landings) {
      const s = l.car.state;
      for (let k = 0; k < Math.min(30, l.hit * 3); k++) {
        const a = Math.random() * Math.PI * 2;
        this.particles.emit(s.x, s.y + 0.3, s.z, Math.cos(a) * 4, 1 + Math.random() * 2, Math.sin(a) * 4, dustColor(this.track.surfaceAt(s.idx)), 1.6, 1.4, 1);
      }
      const pl = this.players.find((p) => p.car === l.car);
      if (pl && l.airTime > 0.8) pl.hud.flash(`SPRUNG! ${l.airTime.toFixed(1).replace('.', ',')} s`, 1.5);
    }
    this.landings.length = 0;
    this.handleItemEvents();
    this.itemVisuals?.update(dt);
    this.particles.update(dt);

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
    const shots: MapDot[] = this.items?.projectiles.map((p) => ({ x: p.x, z: p.z, color: '#ff3030', self: false, small: true })) ?? [];
    this.players.forEach((pl, k) => {
      const c = pl.car, s = c.state;
      const v = forwardSpeed(s);
      tmp.copy(c.visual.group.position);
      pl.cam.update(tmp, c.renderHeading, c.visual.up, v, dt);
      views.push({ camera: pl.cam.camera, rect: split ? [0, k * 0.5, 1, 0.5] : [0, 0, 1, 1] });

      const along = Math.sin(s.heading) * this.track.tx[s.idx] + Math.cos(s.heading) * this.track.tz[s.idx];
      pl.wrongWay = along < -0.2 && this.race.started ? pl.wrongWay + dt : 0;
      const myDots = [...dots.map((d, i) => ({ ...d, self: this.cars[i] === c })), ...shots];
      pl.hud.update(this.race, v, s.gear, s.rpm, myDots, pl.wrongWay > 1.2, dt, this.items?.kart(c.slot.id));

      const rough = s.airborne ? 0 : SURFACE_PROPS[this.track.surfaceAt(s.idx)].rough;
      pl.voice?.update(s.rpm, s.throttle, s.skid * Math.min(1, Math.abs(v) / 8), rough * Math.min(1, Math.abs(v) / 25));
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

  /** Sounds, messages and camera shake for what happened with the items. */
  private handleItemEvents() {
    const name = (id: string) => this.cars.find((c) => c.slot.id === id)?.slot.name ?? '?';
    const player = (id: string) => this.players.find((p) => p.car.slot.id === id);
    for (const e of this.itemEvents) {
      this.itemVisuals?.handle(e);
      if (e.type === 'box' && player(e.car)) {
        audio.beep(990, 0.06, 0.15);
        setTimeout(() => audio.beep(1320, 0.08, 0.15), 60);
      } else if (e.type === 'use') {
        if (e.item === 'turbo') audio.sweep(300, 900, 0.5);
        else if (e.item === 'shield') audio.sweep(500, 1200, 0.3);
        else if (player(e.car)) audio.beep(e.item === 'mine' ? 180 : 260, 0.1, 0.2);
      } else if (e.type === 'hit') {
        audio.crash(10);
        const v = player(e.victim);
        if (v) {
          v.hud.flash(e.by === e.victim ? 'Eigene Falle!' : `Getroffen von ${name(e.by)}!`, 1.8);
          v.cam.shake = 0.6;
        }
        const sh = player(e.by);
        if (sh && e.by !== e.victim) sh.hud.flash(`Treffer: ${name(e.victim)} (${ITEM_NAMES[e.item]})`, 1.8);
      } else if (e.type === 'blocked') {
        audio.beep(1500, 0.12, 0.15);
        player(e.victim)?.hud.flash('Der Schild hält!', 1.2);
      }
    }
    this.itemEvents.length = 0;
  }

  /** Mute engines while paused / in results. */
  setEngineVolume(v: number) {
    for (const p of this.players) p.voice?.setVolume(v);
  }

  /** Dust, mud or spray behind cars driving on loose surfaces. */
  private emitDust(c: GameCar, dt: number) {
    const s = c.state;
    if (s.airborne) return;
    const surface = this.track.surfaceAt(s.idx);
    if (surface === 'asphalt') return;
    const v = Math.abs(forwardSpeed(s));
    if (v < 6) return;
    const rate = Math.min(40, v * 0.8) * (surface === 'water' || surface === 'mud' ? 1.4 : 1);
    let n = rate * dt;
    const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
    while (n > 0) {
      if (n < 1 && Math.random() > n) break;
      n -= 1;
      const side = (Math.random() - 0.5) * 2;
      const x = s.x - fx * 2 + fz * side, z = s.z - fz * 2 - fx * side;
      const heavy = surface === 'mud' || surface === 'water';
      this.particles.emit(
        x, s.y + 0.3, z,
        -fx * v * 0.15 + (Math.random() - 0.5) * 2, heavy ? 2 + Math.random() * 3 : 0.6 + Math.random(), -fz * v * 0.15 + (Math.random() - 0.5) * 2,
        dustColor(surface), heavy ? 0.7 : 1.4, heavy ? 0.8 : 1.8, heavy ? 9 : 0.4,
      );
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.particles.dispose();
    this.offNet?.();
    this.itemVisuals?.dispose();
    for (const c of this.cars) c.visual.dispose();
    for (const p of this.players) {
      p.hud.dispose();
      p.voice?.dispose();
    }
    // only our own HUD: a new game may already have added its HUD (restart, "again")
    for (const h of this.holders) h.remove();
  }
}
