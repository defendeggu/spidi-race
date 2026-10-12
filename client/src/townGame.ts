import * as THREE from 'three';
import {
  collideCars, createTownCar, forwardSpeed, getCar, lerp, lerpAngle, NO_INPUT, PARKING_BAY, SURFACE_PROPS, stepCarTown,
  TaskTracker, Traffic,
  type CarInput, type CarSpec, type CarState, type TownTask, type TrafficCar,
} from '@spidi/shared';
import { audio, EngineVoice } from './audio';
import { input, padConnected, type KeyMap } from './input';
import { ChaseCamera, TOPDOWN_MODE } from './render/cameras';
import { carColor, CarVisual } from './render/carModel';
import { getTownWorld, type TownWorld } from './render/townWorld';
import { renderViewports, type Viewport } from './renderer';
import { TownHud, type TownDot } from './townHud';

const STEP = 1 / 60;
const UP = { x: 0, y: 1, z: 0 };
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
}

interface Prev {
  x: number;
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
  paused = false;
  onPause: (() => void) | null = null;

  constructor(private hudLayer: HTMLElement, private opts: TownOptions) {
    this.world = getTownWorld();
    const town = this.world.town;
    const split = opts.players.length > 1;
    opts.players.forEach((cfg, k) => {
      const spec = getCar(cfg.carId);
      const state = createTownCar(`p${k + 1}`, town.spawn(k));
      const visual = new CarVisual(spec);
      this.world.dynamic.add(visual.group);
      const holder = document.createElement('div');
      holder.className = 'hud-view';
      holder.style.top = split ? `${k * 50}%` : '0';
      holder.style.height = split ? '50%' : '100%';
      hudLayer.appendChild(holder);
      const goal = opts.task === 'parking' ? parkingGoal(GOAL_COLORS[k]) : starGoal(GOAL_COLORS[k]);
      goal.visible = false;
      this.world.dynamic.add(goal);
      const pitch = spec.id === 'feuerwehr' ? 0.8 : 1;
      this.players.push({
        cfg, spec, state, visual, color: carColor(spec), renderHeading: state.heading,
        prev: { x: state.x, z: state.z, heading: state.heading },
        cam: new ChaseCamera(0, spec.shape.length / 2 + 0.3, Math.max(1, spec.shape.length / 4.5)),
        hud: new TownHud(holder, town, opts.task, cfg.keymap, split),
        voice: audio.ctx ? new EngineVoice(split ? (k === 0 ? -0.45 : 0.45) : 0, split ? 0.75 : 1, pitch) : null,
        tasks: new TaskTracker(town, opts.task, Math.floor(Math.random() * 1e9)),
        goal, lastInput: NO_INPUT, impactCooldown: 0,
      });
    });
    for (const p of this.players) this.nextGoal(p);

    this.traffic = new Traffic(opts.traffic, Math.floor(Math.random() * 1e9), [0, 1].map((k) => town.spawn(k)));
    const base = getCar('familie');
    for (const car of this.traffic.cars) {
      const spec: CarSpec = { ...base, id: car.state.id, model: car.model, keepPaint: true, shape: { ...base.shape, length: car.model === 'delivery' ? 4.9 : 4.4 } };
      const visual = new CarVisual(spec);
      this.world.dynamic.add(visual.group);
      this.trafficVisuals.push({ car, visual, prev: { x: car.state.x, z: car.state.z, heading: car.state.heading } });
    }
  }

  start() {
    this.last = performance.now();
    input.clearPressed();
    const frame = (now: number) => {
      this.raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(frame);
  }

  /** Put all players back onto the practice square. */
  resetCars() {
    const town = this.world.town;
    this.players.forEach((p, k) => {
      const s = createTownCar(p.state.id, town.spawn(k));
      Object.assign(p.state, s);
      p.prev = { x: s.x, z: s.z, heading: s.heading };
    });
  }

  private nextGoal(p: TownPlayer) {
    p.tasks.next(p.state, this.players.filter((o) => o !== p).map((o) => o.tasks.target));
    const t = p.tasks.target;
    p.goal.visible = !!t;
    if (t) {
      p.goal.position.set(t.x, 0, t.z);
      p.goal.rotation.y = this.opts.task === 'parking' ? t.heading : 0;
    }
  }

  private frame(dt: number) {
    const padPause = this.players.map((p) => input.consumePad(p.cfg.pad, 'pause')).some(Boolean);
    if (input.consume(['Escape']) || padPause) this.onPause?.();
    if (input.consume(['KeyM'])) {
      const m = audio.toggleMute();
      for (const p of this.players) p.hud.flash(m ? 'Ton aus' : 'Ton an', 1);
    }
    if (input.consume(['KeyH'])) for (const p of this.players) p.hud.toggleHelp();
    for (const p of this.players) {
      if (input.consume(p.cfg.keymap.camera) || input.consumePad(p.cfg.pad, 'camera')) {
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
      p.prev.z = s.z;
      p.prev.heading = s.heading;
      p.lastInput = input.carInput(p.cfg.keymap, p.cfg.pad);
      stepCarTown(s, p.spec, p.lastInput, town, dt);
    }
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
    for (const p of this.players) {
      if (!p.tasks.update(p.state, dt)) continue;
      p.tasks.count++;
      const word = PRAISE[p.tasks.count % PRAISE.length];
      p.hud.flash(this.opts.task === 'stars' ? `★ ${word}` : `Super geparkt! ${word}`, 2);
      audio.beep(660, 0.12);
      setTimeout(() => audio.beep(990, 0.25), 120);
      this.nextGoal(p);
    }
  }

  private render(alpha: number, dt: number) {
    const town = this.world.town;
    const split = this.players.length > 1;
    const pos = new THREE.Vector3();
    for (const p of this.players) {
      const s = p.state;
      p.renderHeading = lerpAngle(p.prev.heading, s.heading, alpha);
      const rough = SURFACE_PROPS[town.surfaceAt(s.x, s.z)].rough;
      p.visual.update(lerp(p.prev.x, s.x, alpha), 0, lerp(p.prev.z, s.z, alpha), p.renderHeading, s, dt, UP, rough);
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
        myDots.push({ x: t.x, z: t.z, color: GOAL_COLORS[k], kind: 'target' });
      }
      p.hud.update(v, s.gear, p.tasks.count, arrow, dist, p.tasks.parkProgress, p.lastInput, padConnected(p.cfg.pad), myDots, dt);

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
    for (const t of this.trafficVisuals) t.visual.dispose();
    this.hudLayer.innerHTML = '';
  }
}
