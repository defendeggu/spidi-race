import * as THREE from 'three';
import {
  BattleBot, BattleSession, battleSpawn, collideCars, createTownCar, forwardSpeed, getCar, HARBOR, idleCar, ItemWorld,
  lerp, lerpAngle, NO_INPUT, stepCarTown, stepKartWith, SURFACE_PROPS, townArena,
  type BattleRow, type CarInput, type CarSpec, type CarState, type ItemEvent, type ItemKind,
} from '@spidi/shared';
import { audio, EngineVoice } from './audio';
import { input, padKindAt, type KeyMap } from './input';
import { ChaseCamera, viewForCar } from './render/cameras';
import { carColor, CarVisual } from './render/carModel';
import { ItemVisuals } from './render/itemVisuals';
import { Particles } from './render/particles';
import { getTownWorld, type TownWorld } from './render/townWorld';
import { renderViewports, type Viewport } from './renderer';
import { TownHud, type TownDot } from './townHud';

const STEP = 1 / 60;
const UP = { x: 0, y: 1, z: 0 };
const BALLOON_COLORS = ['#ff3b3b', '#ffd400', '#3bb0ff', '#4ad66d', '#c070ff', '#ff8a3b'];
const ITEM_NAMES: Record<ItemKind, string> = { blaster: 'Blaster', homing: 'Zielsucher', mine: 'Mine', turbo: 'Turbo', shield: 'Schild' };

export interface BattlePlayerCfg {
  name: string;
  carId: string;
  keymap: KeyMap;
  pad: number;
}

export interface BattleOptions {
  players: BattlePlayerCfg[];
  /** number of bots (0–4) */
  bots: number;
}

export interface BattleResult {
  rows: (BattleRow & { name: string; carId: string; human: boolean })[];
  winner: string | null;
}

interface Kart {
  id: string;
  name: string;
  spec: CarSpec;
  state: CarState;
  prev: { x: number; y: number; z: number; heading: number };
  visual: CarVisual;
  color: string;
  balloons: THREE.Mesh[];
  bot?: BattleBot;
  player?: Player;
  renderHeading: number;
}

interface Player {
  cfg: BattlePlayerCfg;
  kart: Kart;
  cam: ChaseCamera;
  hud: TownHud;
  voice: EngineVoice | null;
  lastInput: CarInput;
  impactCooldown: number;
}

const BOT_NAMES = ['Zorg', 'Blip', 'Quax', 'Nubi'];

/** Kart battle in the practice town: three balloons each, items from boxes on the intersections. */
export class BattleGame {
  private world: TownWorld;
  private karts: Kart[] = [];
  private players: Player[] = [];
  readonly items: ItemWorld;
  readonly session: BattleSession;
  private visuals: ItemVisuals;
  private particles = new Particles();
  private events: ItemEvent[] = [];
  private acc = 0;
  private last = 0;
  private raf = 0;
  private clock = 0;
  private lastBeep = -1;
  private finishTimer = -1;
  paused = false;
  /** HUD containers of this game (one per player) */
  private holders: HTMLElement[] = [];
  onPause: (() => void) | null = null;
  onFinish: ((r: BattleResult) => void) | null = null;

  constructor(hudLayer: HTMLElement, readonly opts: BattleOptions) {
    this.world = getTownWorld();
    const town = this.world.town;
    const split = opts.players.length > 1;
    const bots = Math.max(0, Math.min(4, opts.bots));
    const kartPool = ['kart-oobi', 'kart-oodi', 'kart-ooli', 'kart-oopi', 'kart-oozi'];
    // bots prefer the karts nobody else drives, so everybody can be told apart
    const taken = new Set(opts.players.map((p) => p.carId));
    const botKarts = [...kartPool.filter((k) => !taken.has(k)), ...kartPool.filter((k) => taken.has(k))];
    const entries = [
      ...opts.players.map((p, k) => ({ id: `p${k + 1}`, name: p.name, carId: p.carId, cfg: p })),
      ...Array.from({ length: bots }, (_, k) => ({ id: `bot${k}`, name: BOT_NAMES[k], carId: botKarts[k % botKarts.length], cfg: undefined })),
    ];
    entries.forEach((e, k) => {
      const spec = getCar(e.carId);
      const state = createTownCar(e.id, battleSpawn(k));
      const visual = new CarVisual(spec, e.cfg ? undefined : e.name);
      this.world.dynamic.add(visual.group);
      const kart: Kart = {
        id: e.id, name: e.name, spec, state, visual, color: carColor(spec), balloons: this.makeBalloons(visual, k),
        prev: { x: state.x, y: state.y, z: state.z, heading: state.heading }, renderHeading: state.heading,
        bot: e.cfg ? undefined : new BattleBot(k + 1),
      };
      this.karts.push(kart);
      if (e.cfg) {
        const holder = document.createElement('div');
        holder.className = 'hud-view';
        const pk = this.players.length;
        holder.style.top = split ? `${pk * 50}%` : '0';
        holder.style.height = split ? '50%' : '100%';
        hudLayer.appendChild(holder);
        this.holders.push(holder);
        const player: Player = {
          cfg: e.cfg, kart,
          cam: new ChaseCamera(0, viewForCar(spec.shape.length, visual.height)),
          hud: new TownHud(holder, town, 'free', false, e.cfg.keymap, split, 'KART-BATTLE'),
          voice: audio.ctx ? new EngineVoice(split ? (pk === 0 ? -0.45 : 0.45) : 0, split ? 0.75 : 1, 1.35) : null,
          lastInput: NO_INPUT, impactCooldown: 0,
        };
        kart.player = player;
        this.players.push(player);
      }
    });
    const ids = this.karts.map((k) => k.id);
    this.session = new BattleSession(ids);
    this.items = new ItemWorld(townArena(town), ids, Math.floor(Math.random() * 1e9));
    this.visuals = new ItemVisuals(this.world.dynamic, this.items, new Map(this.karts.map((k) => [k.id, k.visual])), this.particles);
    this.world.dynamic.add(this.particles.points);
  }

  /** Three balloons on strings above the driver. */
  private makeBalloons(visual: CarVisual, k: number) {
    const color = BALLOON_COLORS[k % BALLOON_COLORS.length];
    const mat = new THREE.MeshPhongMaterial({ color, shininess: 80 });
    const geo = new THREE.SphereGeometry(0.42, 14, 10).scale(1, 1.2, 1);
    const string = new THREE.LineBasicMaterial({ color: '#dddddd' });
    return [-0.55, 0, 0.55].map((dx) => {
      const b = new THREE.Mesh(geo, mat);
      b.position.set(dx, visual.height + 1.4 + (dx === 0 ? 0.25 : 0), -0.6);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(-dx, -1.3, 0.4)]), string);
      b.add(line);
      visual.group.add(b);
      return b;
    });
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
      const touch = p.cfg.pad === 0;
      if (input.consume(p.cfg.keymap.camera) || input.consumePad(p.cfg.pad, 'altCamera') || (touch && input.consumeTouch('camera'))) {
        p.cam.cycle();
        p.hud.showCameraMode(p.cam.mode);
      }
      const fire = input.consume(p.cfg.keymap.item) || input.consumePad(p.cfg.pad, 'item') || (touch && input.consumeTouch('item'));
      if (fire && !this.paused && this.session.phase === 'running' && this.session.alive(p.kart.id)) this.items.use(p.kart.id);
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
    const se = this.session;
    se.step(dt);
    const alive = this.karts.filter((k) => se.alive(k.id));
    const states = alive.map((k) => k.state);
    for (const k of this.karts) {
      const s = k.state;
      k.prev.x = s.x;
      k.prev.y = s.y;
      k.prev.z = s.z;
      k.prev.heading = s.heading;
      let inp = NO_INPUT;
      if (k.player) inp = k.player.lastInput = input.carInput(k.player.cfg.keymap, k.player.cfg.pad);
      if (se.phase === 'countdown') {
        idleCar(s, inp, dt);
        continue;
      }
      if (!se.alive(k.id) || se.phase === 'finished') inp = { ...NO_INPUT, handbrake: true };
      else if (k.bot) {
        const d = k.bot.update(s, town, this.items, states, (id) => se.alive(id), dt);
        inp = d.input;
        if (d.use) this.items.use(k.id);
      }
      stepKartWith(s, k.spec, inp, dt, this.items.kart(k.id), (spec, i) => stepCarTown(s, spec, i, town, dt));
      // into the harbour: all balloons gone
      if (s.y < HARBOR.waterY && se.alive(k.id)) {
        this.splash(s.x, s.z);
        se.eliminate(k.id);
        k.player?.hud.flash('PLATSCH! Ausgeschieden', 2.5);
        this.popAll(k);
      }
    }
    if (se.phase !== 'running') return;
    for (let a = 0; a < alive.length; a++) for (let b = a + 1; b < alive.length; b++) collideCars(alive[a].state, alive[b].state, alive[a].spec.mass, alive[b].spec.mass);
    // item roll by balloons: fewer balloons, better items
    const rank = (id: string) => 1 + alive.filter((o) => (se.balloons.get(o.id) ?? 0) > (se.balloons.get(id) ?? 0)).length;
    const nearest = (id: string) => {
      const me = this.karts.find((k) => k.id === id)!.state;
      let best: string | null = null, bd = Infinity;
      for (const o of alive) {
        if (o.id === id) continue;
        const d = Math.hypot(o.state.x - me.x, o.state.z - me.z);
        if (d < bd) {
          bd = d;
          best = o.id;
        }
      }
      return best;
    };
    this.items.step(dt, states, rank, nearest);
    for (const e of this.items.events) {
      if (e.type === 'hit') {
        const out = se.hit(e.victim);
        const k = this.karts.find((x) => x.id === e.victim)!;
        this.pop(k);
        if (out) k.player?.hud.flash('Ausgeschieden!', 2.5);
      }
      this.events.push(e);
    }
    this.items.events.length = 0;
  }

  private pop(k: Kart) {
    const b = k.balloons.pop();
    if (!b) return;
    const p = new THREE.Vector3();
    b.getWorldPosition(p);
    b.removeFromParent();
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.emit(p.x, p.y, p.z, Math.cos(a) * 3, Math.random() * 3, Math.sin(a) * 3, '#ffffff', 0.5, 0.5, 2);
    }
    audio.beep(1700, 0.05, 0.2);
  }

  private popAll(k: Kart) {
    while (k.balloons.length) this.pop(k);
  }

  private splash(x: number, z: number) {
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 6;
      this.particles.emit(x, HARBOR.waterY + 0.2, z, Math.cos(a) * r, 6 + Math.random() * 8, Math.sin(a) * r, i % 3 ? '#d8f0ff' : '#ffffff', 1.4, 1.4, 12);
    }
    audio.crash(6);
  }

  private handleEvents() {
    const name = (id: string) => this.karts.find((k) => k.id === id)?.name ?? '?';
    const player = (id: string) => this.players.find((p) => p.kart.id === id);
    for (const e of this.events) {
      this.visuals.handle(e);
      if (e.type === 'box' && player(e.car)) audio.beep(990, 0.06, 0.15);
      else if (e.type === 'use' && (e.item === 'turbo' || e.item === 'shield')) audio.sweep(400, 1100, 0.4);
      else if (e.type === 'hit') {
        audio.crash(10);
        const v = player(e.victim);
        if (v) {
          v.hud.flash(e.by === e.victim ? 'Eigene Falle!' : `Getroffen von ${name(e.by)}!`, 1.8);
          v.cam.shake = 0.6;
        }
        const sh = player(e.by);
        if (sh && e.by !== e.victim) sh.hud.flash(`Treffer: ${name(e.victim)} (${ITEM_NAMES[e.item]})`, 1.8);
      } else if (e.type === 'blocked') player(e.victim)?.hud.flash('Der Schild hält!', 1.2);
    }
    this.events.length = 0;
  }

  private render(alpha: number, dt: number) {
    const se = this.session;
    this.world.life.update(this.clock);
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
    for (const k of this.karts) {
      const s = k.state;
      k.renderHeading = lerpAngle(k.prev.heading, s.heading, alpha);
      k.visual.group.visible = se.alive(k.id) || s.y > HARBOR.waterY - 3;
      k.visual.update(lerp(k.prev.x, s.x, alpha), lerp(k.prev.y, s.y, alpha), lerp(k.prev.z, s.z, alpha), k.renderHeading, s, dt, UP,
        SURFACE_PROPS[this.world.town.surfaceAt(s.x, s.z)].rough);
      k.balloons.forEach((b, i) => (b.position.x = (i - 1) * 0.55 + Math.sin(this.clock * 2 + i) * 0.08));
    }
    this.handleEvents();
    this.visuals.update(dt);
    this.particles.update(dt);
    // the battle ends by hits, by falling into the water or by time
    if (se.phase === 'finished' && this.finishTimer < 0) {
      this.finishTimer = 2.5;
      audio.beep(880, 0.6);
    }
    if (this.finishTimer > 0) {
      this.finishTimer -= dt;
      if (this.finishTimer <= 0) this.onFinish?.(this.result());
    }

    const split = this.players.length > 1;
    const views: Viewport[] = [];
    const rows = this.karts.map((k) => ({ name: k.name, color: k.color, balloons: se.balloons.get(k.id) ?? 0, me: false }));
    const r = Math.ceil(se.remaining);
    const clock = `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
    const winner = se.phase === 'finished' ? se.winner() : null;
    this.players.forEach((p, k) => {
      const s = p.kart.state;
      const v = forwardSpeed(s);
      p.cam.update(p.kart.visual.group.position.clone(), p.kart.renderHeading, p.kart.visual.up, v, dt);
      views.push({ camera: p.cam.camera, rect: split ? [0, k * 0.5, 1, 0.5] : [0, 0, 1, 1] });
      const mine = se.balloons.get(p.kart.id) ?? 0;
      let center = '';
      if (se.phase === 'countdown') center = String(Math.ceil(se.countdown));
      else if (se.time < 1) center = 'LOS!';
      else if (se.phase === 'finished') center = winner === p.kart.id ? 'GEWONNEN!' : winner === null ? 'UNENTSCHIEDEN' : 'VORBEI!';
      else if (!mine) center = 'AUSGESCHIEDEN';
      const dots: TownDot[] = this.karts.filter((o) => se.alive(o.id)).map((o) => ({ x: o.state.x, z: o.state.z, color: o.color, kind: o === p.kart ? 'self' : 'player' }));
      p.hud.update(v, s.gear, { count: mine ? '🎈'.repeat(mine) : '✗', time: clock, center }, null, 0, 0, p.lastInput, padKindAt(p.cfg.pad), dots, dt);
      p.hud.updateBattle(this.items.kart(p.kart.id), rows.map((row, i) => ({ ...row, me: this.karts[i] === p.kart })), dt);
      p.voice?.update(s.rpm, s.throttle, s.skid * Math.min(1, Math.abs(v) / 8), 0);
      p.impactCooldown -= dt;
      if (s.impact > 3 && p.impactCooldown <= 0) {
        audio.crash(s.impact, split ? (k === 0 ? -0.45 : 0.45) : 0);
        p.impactCooldown = 0.25;
      }
    });
    renderViewports(this.world.scene, views);
  }

  result(): BattleResult {
    const rows = this.session.ranking((id) => this.items.kart(id).hitsGiven).map((r) => {
      const k = this.karts.find((x) => x.id === r.id)!;
      return { ...r, name: k.name, carId: k.spec.id, human: !!k.player };
    });
    return { rows, winner: this.session.winner() };
  }

  setEngineVolume(v: number) {
    for (const p of this.players) p.voice?.setVolume(v);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.visuals.dispose();
    this.particles.dispose();
    for (const k of this.karts) k.visual.dispose();
    for (const p of this.players) {
      p.hud.dispose();
      p.voice?.dispose();
    }
    // only our own HUD: a new game may already have added its HUD (restart, "again")
    for (const h of this.holders) h.remove();
  }
}
