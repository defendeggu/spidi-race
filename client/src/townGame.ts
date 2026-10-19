import * as THREE from 'three';
import { updateRocketHud } from './rocketHud';
import {
  collideCars, createTownCar, formatTime, forwardSpeed, getCar, HARBOR, idleCar, lerp, lerpAngle, NO_INPUT, PARKING_BAY, SURFACE_PROPS,
  stepCarTown, TownSession, Traffic,
  type CarInput, type CarSpec, type CarState, type TaskTracker, type TownMap, type TownResult, type TownTask, type TrafficCar,
} from '@spidi/shared';
import { audio, EngineVoice } from './audio';
import { townSpec } from './cheats';
import { input, padKindAt, type KeyMap } from './input';
import { ChaseCamera, TOPDOWN_MODE, viewForSpec } from './render/cameras';
import { Particles } from './render/particles';
import { carColor, CarVisual } from './render/carModel';
import { getTownWorld, type TownWorld } from './render/townWorld';
import { renderViewports, type Viewport } from './renderer';
import { TownHud, type TownDot } from './townHud';

const STEP = 1 / 60;
const UP = { x: 0, y: 1, z: 0 };
const normal = { x: 0, y: 1, z: 0 };

/** Surface normal of the town ground (tilted on the skate park ramps). */
function groundNormal(town: TownMap, x: number, z: number) {
  const e = 0.6;
  const hx = town.heightAt(x + e, z) - town.heightAt(x - e, z), hz = town.heightAt(x, z + e) - town.heightAt(x, z - e);
  if (hx === 0 && hz === 0) return UP;
  const l = Math.hypot(hx, 2 * e, hz);
  normal.x = -hx / l;
  normal.y = (2 * e) / l;
  normal.z = -hz / l;
  return normal;
}
const GOAL_COLORS = ['#ffd400', '#36d1ff'];
const PRAISE = ['Super!', 'Toll gemacht!', 'Klasse!', 'Prima!', 'Weiter so!'];

export interface TownPlayerCfg {
  name: string;
  carId: string;
  keymap: KeyMap;
  /** n-th connected gamepad */
  pad: number;
}

export interface TownOptions {
  players: TownPlayerCfg[];
  task: TownTask;
  /** number of traffic cars */
  traffic: number;
  /** solo: number of goals until the run ends */
  goals: number;
}

interface Prev {
  x: number;
  y: number;
  z: number;
  heading: number;
}

interface TownPlayer {
  cfg: TownPlayerCfg;
  spec: CarSpec;
  state: CarState;
  prev: Prev;
  visual: CarVisual;
  color: string;
  renderHeading: number;
  cam: ChaseCamera;
  hud: TownHud;
  voice: EngineVoice | null;
  tasks: TaskTracker;
  goal: THREE.Group;
  lastInput: CarInput;
  impactCooldown: number;
}

interface TrafficVisual {
  car: TrafficCar;
  visual: CarVisual;
  prev: Prev;
}

/** A star on a light beam that can be seen from far away. */
function starGoal(color: string) {
  const shape = new THREE.Shape();
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + Math.PI / 2;
    const r = k % 2 ? 0.55 : 1.3;
    if (k === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.Group();
  const star = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: false }).translate(0, 0, -0.175),
    new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.6 }),
  );
  star.position.y = 2.4;
  star.name = 'spin';
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.7, 70, 12, 1, true).translate(0, 35, 0),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
  );
  g.add(star, beam);
  return g;
}

/** A glowing frame around the target parking bay. */
function parkingGoal(color: string) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
  const hw = PARKING_BAY.width / 2 - 0.2, hl = PARKING_BAY.length / 2 - 0.2, t = 0.25;
  for (const [w, l, x, z] of [[2 * hw, t, 0, hl], [2 * hw, t, 0, -hl], [t, 2 * hl, hw, 0], [t, 2 * hl, -hw, 0]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, l), mat);
    m.position.set(x, 0.06, z);
    g.add(m);
  }
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(2 * hw, 2 * hl).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false }));
  fill.position.y = 0.04;
  fill.name = 'pulse';
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.4, 14, 10, 1, true).translate(0, 7, 0),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
  );
  g.add(fill, beam);
  return g;
}

/** Free driving in the practice town: 1–2 players, optional stars / parking goals and slow traffic. */
export class TownGame {
  private world: TownWorld;
  private players: TownPlayer[] = [];
  private traffic: Traffic;
  private trafficVisuals: TrafficVisual[] = [];
  private acc = 0;
  private last = 0;
  private raf = 0;
  private time = 0;
  /** real time since the start (also while paused the trains and boats keep moving) */
  private clock = 0;
  private particles = new Particles();
  /** players that drove into the water */
  private sunk = new Set<number>();
  private lastBeep = -1;
  private finishTimer = -1;
  readonly session: TownSession;
  /** a cheat changed a car: such runs stay out of the leaderboard */
  cheated = false;
  paused = false;
  /** HUD containers of this game (one per player) */
  private holders: HTMLElement[] = [];
  onPause: (() => void) | null = null;
  /** called a moment after a solo run or duel has ended */
  onFinish: ((result: TownResult) => void) | null = null;

  constructor(hudLayer: HTMLElement, readonly opts: TownOptions) {
    this.world = getTownWorld();
    const town = this.world.town;
    const split = opts.players.length > 1;
    this.session = new TownSession(town, opts.task, opts.players.length, opts.goals, Math.floor(Math.random() * 1e9));
    const duel = this.session.mode === 'duel';
    opts.players.forEach((cfg, k) => {
      const spec = townSpec(getCar(cfg.carId));
      if (spec !== getCar(cfg.carId)) this.cheated = true;
      const state = createTownCar(`p${k + 1}`, this.session.spawn(k));
      const visual = new CarVisual(spec);
      this.world.dynamic.add(visual.group);
      const holder = document.createElement('div');
      holder.className = 'hud-view';
      holder.style.top = split ? `${k * 50}%` : '0';
      holder.style.height = split ? '50%' : '100%';
      hudLayer.appendChild(holder);
      this.holders.push(holder);
      // in a duel both chase the same (gold) goal, so only one is drawn
      const color = duel ? GOAL_COLORS[0] : GOAL_COLORS[k];
      const goal = opts.task === 'parking' ? parkingGoal(color) : starGoal(color);
      goal.visible = false;
      goal.userData.hidden = duel && k > 0;
      this.world.dynamic.add(goal);
      const pitch = spec.id === 'feuerwehr' ? 0.8 : 1;
      this.players.push({
        cfg, spec, state, visual, color: carColor(spec), renderHeading: state.heading,
        prev: { x: state.x, y: state.y, z: state.z, heading: state.heading },
        cam: new ChaseCamera(0, viewForSpec(spec, visual.height, true)),
        hud: new TownHud(holder, town, opts.task, duel, cfg.keymap, split),
        voice: audio.ctx ? new EngineVoice(split ? (k === 0 ? -0.45 : 0.45) : 0, split ? 0.75 : 1, pitch) : null,
        tasks: this.session.trackers[k],
        goal, lastInput: NO_INPUT, impactCooldown: 0,
      });
    });
    this.world.dynamic.add(this.particles.points);
    this.session.begin(this.players.map((p) => p.state));
    this.showGoals();

    this.traffic = new Traffic(opts.traffic, Math.floor(Math.random() * 1e9), [0, 1].map((k) => this.session.spawn(k)));
    const base = getCar('familie');
    for (const car of this.traffic.cars) {
      const spec: CarSpec = { ...base, id: car.state.id, model: car.model, keepPaint: true, shape: { ...base.shape, length: car.model === 'delivery' ? 4.9 : 4.4 } };
      const visual = new CarVisual(spec);
      this.world.dynamic.add(visual.group);
      this.trafficVisuals.push({ car, visual, prev: { x: car.state.x, y: 0, z: car.state.z, heading: car.state.heading } });
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
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(frame);
  }

  /** Put all players back to their start positions (the clock keeps running). */
  resetCars() {
    this.players.forEach((p, k) => {
      const s = createTownCar(p.state.id, this.session.spawn(k));
      Object.assign(p.state, s);
      p.prev = { x: s.x, y: s.y, z: s.z, heading: s.heading };
    });
  }

  /** Move the goal markers to the current targets. */
  private showGoals() {
    for (const p of this.players) {
      const t = p.tasks.target;
      p.goal.visible = !!t && !p.goal.userData.hidden && this.session.phase !== 'finished';
      if (t) {
        // stars on a ramp (skate park fun box) float above the ramp
        p.goal.position.set(t.x, this.opts.task === 'stars' ? this.world.town.heightAt(t.x, t.z) : 0, t.z);
        p.goal.rotation.y = this.opts.task === 'parking' ? t.heading : 0;
      }
    }
  }

  private frame(dt: number) {
    this.clock += dt;
    const padPause = this.players.map((p) => input.consumePad(p.cfg.pad, 'pause')).some(Boolean);
    if (input.consume(['Escape']) || padPause || input.consumeTouch('pause')) this.onPause?.();
    if (input.consume(['KeyM'])) {
      const m = audio.toggleMute();
      for (const p of this.players) p.hud.flash(m ? 'Ton aus' : 'Ton an', 1);
    }
    if (input.consume(['KeyH'])) for (const p of this.players) p.hud.toggleHelp();
    for (const p of this.players) {
      if (input.consume(p.cfg.keymap.camera) || input.consumePad(p.cfg.pad, 'camera') || (p.cfg.pad === 0 && input.consumeTouch('camera'))) {
        p.cam.cycle();
        p.hud.showCameraMode(p.cam.mode);
      }
    }
    if (!this.paused) {
      this.acc += dt;
      while (this.acc >= STEP) {
        this.fixedStep(STEP);
        this.acc -= STEP;
      }
    }
    this.render(this.paused ? 1 : this.acc / STEP, dt);
  }

  private fixedStep(dt: number) {
    const town = this.world.town;
    this.time += dt;
    for (const p of this.players) {
      const s = p.state;
      p.prev.x = s.x;
      p.prev.y = s.y;
      p.prev.z = s.z;
      p.prev.heading = s.heading;
      p.lastInput = input.carInput(p.cfg.keymap, p.cfg.pad);
      const phase = this.session.phase;
      // engines can be revved during the countdown; after the end the cars roll to a stop
      if (phase === 'countdown') idleCar(s, p.lastInput, dt);
      else stepCarTown(s, p.spec, phase === 'finished' ? { ...NO_INPUT, handbrake: true } : p.lastInput, town, dt);
    }
    this.players.forEach((p, k) => {
      if (p.state.y > HARBOR.waterY || this.sunk.has(k)) return;
      // splash: the run is over for this player
      this.sunk.add(k);
      this.splash(p.state.x, p.state.z);
      p.hud.flash('PLATSCH! Ins Wasser gefallen', 2.5);
      const wasRunning = this.session.phase !== 'finished';
      this.session.knockOut(k);
      if (wasRunning) this.finishTimer = 2.5;
    });
    for (const t of this.trafficVisuals) {
      t.prev.x = t.car.state.x;
      t.prev.z = t.car.state.z;
      t.prev.heading = t.car.state.heading;
    }
    this.traffic.step(dt, this.players.map((p) => p.state));
    // players bounce off each other and off the traffic, which never gets pushed
    for (let i = 0; i < this.players.length; i++) {
      const a = this.players[i];
      for (let j = i + 1; j < this.players.length; j++) collideCars(a.state, this.players[j].state, a.spec.mass, this.players[j].spec.mass);
      for (const t of this.traffic.cars) collideCars(a.state, t.state, a.spec.mass, Infinity);
    }
    const wasRunning = this.session.phase === 'running';
    const scored = this.session.step(dt, this.players.map((p) => p.state));
    for (const k of scored) {
      const p = this.players[k];
      const word = PRAISE[this.session.scores[k] % PRAISE.length];
      p.hud.flash(this.opts.task === 'stars' ? `★ ${word}` : `Super geparkt! ${word}`, 2);
      if (this.session.mode === 'duel') {
        for (const o of this.players) if (o !== p) o.hud.flash(`${p.cfg.name} war schneller!`, 2);
      }
      audio.beep(660, 0.12);
      setTimeout(() => audio.beep(990, 0.25), 120);
    }
    if (scored.length) this.showGoals();
    if (wasRunning && this.session.phase === 'finished') {
      this.showGoals();
      this.finishTimer = 2.5;
      audio.beep(880, 0.6);
    }
    if (this.finishTimer > 0) {
      this.finishTimer -= dt;
      if (this.finishTimer <= 0) this.onFinish?.(this.session.result());
    }
  }

  /** Water fountain where a car hits the water. */
  private splash(x: number, z: number) {
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 6;
      this.particles.emit(x + Math.cos(a) * r * 0.3, HARBOR.waterY + 0.2, z + Math.sin(a) * r * 0.3,
        Math.cos(a) * r, 6 + Math.random() * 8, Math.sin(a) * r, i % 3 ? '#d8f0ff' : '#ffffff', 1.4, 1.4, 12);
    }
    audio.crash(6);
    audio.sweep(700, 120, 0.6, 0.12);
  }

  /** Counter, clock and big centre text for player k. */
  private status(k: number) {
    const se = this.session;
    let count = '', time = '', center = '';
    const sym = this.opts.task === 'stars' ? '★' : 'P';
    if (se.mode === 'solo') {
      count = `${sym} ${se.scores[0]} / ${se.goals}`;
      time = formatTime(Math.max(0.0001, se.time));
    } else if (se.mode === 'duel') {
      const other = 1 - k;
      count = `${sym} ${se.scores[k]} : ${se.scores[other]}`;
      const r = Math.ceil(se.remaining);
      time = `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
    }
    if (se.phase === 'countdown') center = String(Math.ceil(se.countdown));
    else if (se.mode !== 'free' && se.time < 1) center = 'LOS!';
    else if (se.phase === 'finished') {
      const res = se.result();
      if (res.fell >= 0 && (se.mode !== 'duel' || res.fell === k)) center = 'PLATSCH!';
      else if (se.mode === 'free') center = '';
      else center = se.mode === 'solo' ? 'GESCHAFFT!' : res.winner < 0 ? 'UNENTSCHIEDEN' : res.winner === k ? 'GEWONNEN!' : 'ZEIT UM!';
    }
    return { count, time, center };
  }

  private render(alpha: number, dt: number) {
    const town = this.world.town;
    this.world.life.update(this.clock);
    this.particles.update(dt);
    // countdown beeps like at the start of a race
    const se = this.session;
    if (se.phase === 'countdown') {
      const n = Math.ceil(se.countdown);
      if (n !== this.lastBeep) {
        this.lastBeep = n;
        audio.beep(440, 0.25);
      }
    } else if (this.lastBeep > 0) {
      this.lastBeep = 0;
      audio.beep(880, 0.6);
    }
    const split = this.players.length > 1;
    const pos = new THREE.Vector3();
    for (const p of this.players) {
      const s = p.state;
      p.renderHeading = lerpAngle(p.prev.heading, s.heading, alpha);
      const rough = SURFACE_PROPS[town.surfaceAt(s.x, s.z)].rough;
      p.visual.update(lerp(p.prev.x, s.x, alpha), lerp(p.prev.y, s.y, alpha), lerp(p.prev.z, s.z, alpha), p.renderHeading, s, dt, groundNormal(town, s.x, s.z), rough);
      const spin = p.goal.getObjectByName('spin');
      if (spin) spin.rotation.y += dt * 2;
      const pulse = p.goal.getObjectByName('pulse') as THREE.Mesh | undefined;
      if (pulse) (pulse.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.1 * Math.sin(this.time * 5) + 0.4 * p.tasks.parkProgress;
    }
    for (const t of this.trafficVisuals) {
      const s = t.car.state;
      t.visual.update(lerp(t.prev.x, s.x, alpha), 0, lerp(t.prev.z, s.z, alpha), lerpAngle(t.prev.heading, s.heading, alpha), s, dt, UP, 0);
    }

    const trafficDots: TownDot[] = this.trafficVisuals.map((t) => ({ x: t.car.state.x, z: t.car.state.z, color: '#555', kind: 'traffic' }));
    const views: Viewport[] = [];
    this.players.forEach((p, k) => {
      const s = p.state;
      const v = forwardSpeed(s);
      pos.copy(p.visual.group.position);
      p.cam.update(pos, p.renderHeading, p.visual.up, v, dt);
      views.push({ camera: p.cam.camera, rect: split ? [0, k * 0.5, 1, 0.5] : [0, 0, 1, 1] });

      const t = p.tasks.target;
      let arrow: number | null = null, dist = 0;
      const myDots: TownDot[] = [
        ...trafficDots,
        ...this.players.map((o): TownDot => ({ x: o.state.x, z: o.state.z, color: o.color, kind: o === p ? 'self' : 'player' })),
      ];
      if (t) {
        const dx = t.x - s.x, dz = t.z - s.z;
        dist = Math.hypot(dx, dz);
        if (p.cam.mode === TOPDOWN_MODE) arrow = Math.atan2(-dx, dz);
        else {
          const h = p.renderHeading;
          arrow = Math.atan2(-dx * Math.cos(h) + dz * Math.sin(h), dx * Math.sin(h) + dz * Math.cos(h));
        }
        myDots.push({ x: t.x, z: t.z, color: this.session.mode === 'duel' ? GOAL_COLORS[0] : GOAL_COLORS[k], kind: 'target' });
      }
      if (this.session.phase === 'finished') arrow = null;
      p.hud.update(v, s.gear, this.status(k), arrow, dist, p.tasks.parkProgress, p.lastInput, padKindAt(p.cfg.pad), myDots, dt);
      updateRocketHud(p.hud.root, p.spec, s, p.cfg.keymap, k === 0);

      p.voice?.update(s.rpm, s.throttle, s.skid * Math.min(1, Math.abs(v) / 8), 0);
      p.impactCooldown -= dt;
      if (s.impact > 3 && p.impactCooldown <= 0) {
        audio.crash(s.impact, split ? (k === 0 ? -0.45 : 0.45) : 0);
        p.impactCooldown = 0.25;
      }
    });
    renderViewports(this.world.scene, views);
  }

  /** Mute engines while paused. */
  setEngineVolume(v: number) {
    for (const p of this.players) p.voice?.setVolume(v);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    for (const p of this.players) {
      p.visual.dispose();
      p.hud.dispose();
      p.voice?.dispose();
      p.goal.removeFromParent();
    }
    this.particles.dispose();
    for (const t of this.trafficVisuals) t.visual.dispose();
    // only our own HUD: a new game may already have added its HUD (restart, "again")
    for (const h of this.holders) h.remove();
  }
}
