import {
  applyNetBattle, applyNetCar, BATTLE_BOT_NAMES, collideMoving, planeBoxes, planesAt, trainBoxes, ItemMirror, trainsAt, BattleBot, BattleSession, battleSpawn, collideCars,
  createTownCar, forwardSpeed, getCar, HARBOR, idleCar, ItemWorld, lerp, lerpAngle, NO_INPUT, stepCarTown, stepKartWith,
  SURFACE_PROPS, toNetCar, toNetKart, townArena,
  type BattleRow, type CarInput, type CarSpec, type CarState, type ItemEvent, type ItemKind, type NetCar, type ServerMsg, type Slot,
} from '@spidi/shared';
import { audio, EngineVoice } from './audio';
import { input, padKindAt, type KeyMap } from './input';
import type { Net } from './net';
import { ChaseCamera, viewForSpec } from './render/cameras';
import { carColor, CarVisual } from './render/carModel';
import { ItemVisuals } from './render/itemVisuals';
import { Particles } from './render/particles';
import { getTownWorld, type TownWorld } from './render/townWorld';
import { renderViewports, type Viewport } from './renderer';
import { TownHud, type TownDot } from './townHud';

const STEP = 1 / 60;
const UP = { x: 0, y: 1, z: 0 };
/** karts of the others are shown this far in the past (ms), smoothly between two snapshots */
const INTERP_DELAY = 110;
const ITEM_NAMES: Record<ItemKind, string> = { blaster: 'Blaster', homing: 'Zielsucher', mine: 'Mine', turbo: 'Turbo', shield: 'Schild' };

export interface BattlePlayerCfg {
  name: string;
  carId: string;
  keymap: KeyMap;
  pad: number;
  /** network game: the slot this player drives */
  slotId?: string;
}

export interface BattleOptions {
  players: BattlePlayerCfg[];
  /** number of bots (0–4), local games only */
  bots: number;
  /** network game: the server runs bots, items and balloons; this game drives its own karts */
  net?: Net;
  slots?: Slot[];
}

export interface BattleResult {
  /** human: not a bot; mine: driven on this device (highlighted) */
  rows: (BattleRow & { name: string; carId: string; human: boolean; mine: boolean })[];
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
  bot?: BattleBot;
  player?: Player;
  /** network game: driven elsewhere, shown from the snapshots */
  remote: boolean;
  buffer: { t: number; car: NetCar }[];
  /** fell into the harbour (splash shown) */
  wet: boolean;
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

/** Kart battle in the practice town: three balloons each, items from boxes on the intersections. */
export class BattleGame {
  private world: TownWorld;
  private karts: Kart[] = [];
  private players: Player[] = [];

  /** Show a short message to every local player (e.g. "Anna wartet in der Lobby"). */
  notify(text: string, seconds = 4) {
    for (const p of this.players) p.hud.flash(text, seconds);
  }
  readonly items: ItemWorld;
  readonly session: BattleSession;
  private visuals: ItemVisuals;
  private particles = new Particles();
  private events: ItemEvent[] = [];
  private acc = 0;
  private last = 0;
  private raf = 0;
  private clock = 0;
  private stepCount = 0;
  private lastBeep = -1;
  private finishTimer = -1;
  private finished = false;
  private offNet: (() => void) | null = null;
  /** network game: the server's items, own uses shown at once */
  private mirror: ItemMirror | null = null;
  paused = false;
  /** HUD containers of this game (one per player) */
  private holders: HTMLElement[] = [];
  onPause: (() => void) | null = null;
  onFinish: ((r: BattleResult) => void) | null = null;

  constructor(hudLayer: HTMLElement, readonly opts: BattleOptions) {
    this.world = getTownWorld();
    const town = this.world.town;
    const split = opts.players.length > 1;
    const net = opts.net;
    let entries: { id: string; name: string; carId: string; cfg?: BattlePlayerCfg; spawn: number }[];
    if (net && opts.slots) {
      entries = opts.slots.map((s) => ({ id: s.id, name: s.name, carId: s.carId, cfg: opts.players.find((p) => p.slotId === s.id), spawn: s.grid }));
    } else {
      const bots = Math.max(0, Math.min(BATTLE_BOT_NAMES.length, opts.bots));
      const kartPool = ['kart-oobi', 'kart-oodi', 'kart-ooli', 'kart-oopi', 'kart-oozi'];
      // bots prefer the karts nobody else drives, so everybody can be told apart
      const taken = new Set(opts.players.map((p) => p.carId));
      const botKarts = [...kartPool.filter((k) => !taken.has(k)), ...kartPool.filter((k) => taken.has(k))];
      entries = [
        ...opts.players.map((p, k) => ({ id: `p${k + 1}`, name: p.name, carId: p.carId, cfg: p })),
        ...Array.from({ length: bots }, (_, k) => ({ id: `bot${k}`, name: BATTLE_BOT_NAMES[k], carId: botKarts[k % botKarts.length], cfg: undefined })),
      ].map((e, k) => ({ ...e, spawn: k }));
    }
    for (const e of entries) {
      const spec = getCar(e.carId);
      const state = createTownCar(e.id, battleSpawn(e.spawn));
      const visual = new CarVisual(spec, e.cfg ? undefined : e.name);
      this.world.dynamic.add(visual.group);
      const kart: Kart = {
        id: e.id, name: e.name, spec, state, visual, color: carColor(spec),
        prev: { x: state.x, y: state.y, z: state.z, heading: state.heading }, renderHeading: state.heading,
        bot: e.cfg || net ? undefined : new BattleBot(e.spawn + 1),
        remote: !!net && !e.cfg, buffer: [], wet: false,
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
          cam: new ChaseCamera(0, viewForSpec(spec, visual.height, true)),
          hud: new TownHud(holder, town, 'free', false, e.cfg.keymap, split, 'KART-BATTLE'),
          voice: audio.ctx ? new EngineVoice(split ? (pk === 0 ? -0.45 : 0.45) : 0, split ? 0.75 : 1, 1.35) : null,
          lastInput: NO_INPUT, impactCooldown: 0,
        };
        kart.player = player;
        this.players.push(player);
      }
    }
    const ids = this.karts.map((k) => k.id);
    this.session = new BattleSession(ids);
    // online the item world is only a mirror of the server's: it is never stepped here
    this.items = new ItemWorld(townArena(town), ids, Math.floor(Math.random() * 1e9));
    this.visuals = new ItemVisuals(this.world.dynamic, this.items, new Map(this.karts.map((k) => [k.id, k.visual])), this.particles);
    this.world.dynamic.add(this.particles.points);
    if (net) {
      this.mirror = new ItemMirror(this.items);
      this.offNet = net.on((m) => this.onNet(m));
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
    if (m.type === 'bsnap') {
      const now = performance.now();
      for (const nc of m.cars) {
        const k = this.karts.find((x) => x.id === nc.id);
        if (!k?.remote) continue;
        k.buffer.push({ t: now, car: nc });
        if (k.buffer.length > 40) k.buffer.shift();
      }
      // karts of players that left
      for (const k of [...this.karts]) {
        if (m.cars.some((c) => c.id === k.id)) continue;
        k.visual.dispose();
        this.karts.splice(this.karts.indexOf(k), 1);
      }
      applyNetBattle(this.session, m.battle);
      const own = new Set(this.players.map((p) => p.kart.id));
      const r = this.mirror!.apply(m.items, own, INTERP_DELAY / 1000);
      for (const [local, id] of r.adopt) this.visuals.adopt(local, id);
      for (const e of r.events) {
        if (e.type === 'hit') this.lostBalloon(e.victim);
        this.events.push(e);
      }
    } else if (m.type === 'battleEnd') {
      const me = this.opts.net?.clientId;
      this.finish({
        rows: m.rows.map((r) => ({ ...r, human: !r.isAI, mine: r.ownerId === me })),
        winner: m.winner,
      });
    }
  }

  private finish(r: BattleResult) {
    if (this.finished) return;
    this.finished = true;
    this.onFinish?.(r);
  }

  private frame(dt: number, now: number) {
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
      if (input.consume(p.cfg.keymap.camera) || input.consumePad(p.cfg.pad, 'camera') || (touch && input.consumeTouch('camera'))) {
        p.cam.cycle();
        p.hud.showCameraMode(p.cam.mode);
      }
      const fire = input.consume(p.cfg.keymap.item) || input.consumePad(p.cfg.pad, 'item') || (touch && input.consumeTouch('item'));
      if (fire && !this.paused && this.session.phase === 'running' && this.session.alive(p.kart.id)) {
        if (this.opts.net && this.mirror) {
          // shown at once, the server confirms it
          const ev = this.mirror.use(p.kart.id, p.kart.state);
          if (ev.length) {
            this.events.push(...ev);
            this.opts.net.send({ type: 'item', id: p.kart.id });
          }
        } else this.items.use(p.kart.id);
      }
    }
    // the network game goes on during the pause
    const sim = !this.paused || !!this.opts.net;
    if (sim) {
      this.acc += dt;
      while (this.acc >= STEP) {
        this.fixedStep(STEP);
        this.acc -= STEP;
      }
    }
    if (this.opts.net) {
      this.updateRemote(now);
      // shots fly on between the server's snapshots
      this.events.push(...this.mirror!.update(dt));
    }
    this.render(sim ? this.acc / STEP : 1, dt);
  }

  private fixedStep(dt: number) {
    const town = this.world.town;
    const se = this.session;
    const net = this.opts.net;
    if (!net) se.step(dt);
    const alive = this.karts.filter((k) => se.alive(k.id));
    const states = alive.map((k) => k.state);
    for (const k of this.karts) {
      if (k.remote) continue;
      const s = k.state;
      k.prev.x = s.x;
      k.prev.y = s.y;
      k.prev.z = s.z;
      k.prev.heading = s.heading;
      let inp = NO_INPUT;
      if (k.player && !this.paused) inp = k.player.lastInput = input.carInput(k.player.cfg.keymap, k.player.cfg.pad);
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
      // into the harbour: all balloons gone (online the server decides, from the height we report)
      if (!net && s.y < HARBOR.waterY && se.alive(k.id)) se.eliminate(k.id);
    }
    if (net) {
      if (++this.stepCount % 2 === 0) {
        const mine = this.players.map((p) => p.kart);
        net.send({ type: 'state', cars: mine.map((k) => toNetCar(k.state)), karts: mine.map((k) => toNetKart(this.items.kart(k.id))) });
      }
    }
    // the trains on the open tracks and the departing aircraft push the own karts aside
    const movers = [...trainBoxes(trainsAt(this.clock)), ...planesAt(this.clock).flatMap(planeBoxes)];
    for (const k of this.karts) if (!k.remote) k.state.impact = Math.max(k.state.impact, collideMoving(k.state, k.spec, movers));
    if (se.phase !== 'running') return;
    for (let a = 0; a < alive.length; a++) {
      for (let b = a + 1; b < alive.length; b++) {
        const x = alive[a], y = alive[b];
        if (x.remote && y.remote) continue;
        collideCars(x.state, y.state, x.remote ? Infinity : x.spec.mass, y.remote ? Infinity : y.spec.mass);
      }
    }
    if (net) return;
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
        se.hit(e.victim);
        this.lostBalloon(e.victim);
      }
      this.events.push(e);
    }
    this.items.events.length = 0;
  }

  /** Interpolate the karts driven elsewhere (other devices, the server's bots). */
  private updateRemote(now: number) {
    const t = now - INTERP_DELAY;
    for (const k of this.karts) {
      if (!k.remote || k.buffer.length === 0) continue;
      const buf = k.buffer;
      let a = buf[0], b = buf[0];
      for (let i = buf.length - 1; i >= 0; i--) {
        if (buf[i].t <= t) {
          a = buf[i];
          b = buf[Math.min(i + 1, buf.length - 1)];
          break;
        }
      }
      const s = k.state;
      applyNetCar(s, a.car);
      if (b !== a) {
        const f = Math.min(1, (t - a.t) / (b.t - a.t));
        s.x = lerp(a.car.x, b.car.x, f);
        s.y = lerp(a.car.y, b.car.y, f);
        s.z = lerp(a.car.z, b.car.z, f);
        s.heading = lerpAngle(a.car.h, b.car.h, f);
      }
      k.prev.x = s.x;
      k.prev.y = s.y;
      k.prev.z = s.z;
      k.prev.heading = s.heading;
    }
  }

  /** A hit cost a balloon: a little white puff above the driver (the balloons are shown in the HUD). */
  private lostBalloon(id: string) {
    const k = this.karts.find((x) => x.id === id);
    if (!k) return;
    const p = k.visual.group.position.clone();
    p.y += k.visual.height + 1;
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.emit(p.x, p.y, p.z, Math.cos(a) * 3, Math.random() * 3, Math.sin(a) * 3, '#ffffff', 0.5, 0.5, 2);
    }
    audio.beep(1700, 0.05, 0.2);
    if (!this.session.alive(id)) k.player?.hud.flash('Ausgeschieden!', 2.5);
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
    this.world.people.update(this.clock, dt, this.karts.filter((k) => !k.remote).map((k) => k.state));
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
      if (s.y < HARBOR.waterY && !k.wet) {
        k.wet = true;
        this.splash(s.x, s.z);
        k.player?.hud.flash('PLATSCH! Ausgeschieden', 2.5);
      }
      k.renderHeading = lerpAngle(k.prev.heading, s.heading, alpha);
      k.visual.group.visible = se.alive(k.id) || s.y > HARBOR.waterY - 3;
      k.visual.update(lerp(k.prev.x, s.x, alpha), lerp(k.prev.y, s.y, alpha), lerp(k.prev.z, s.z, alpha), k.renderHeading, s, dt, UP,
        SURFACE_PROPS[this.world.town.surfaceAt(s.x, s.z)].rough);
    }
    this.handleEvents();
    this.visuals.update(dt);
    this.particles.update(dt);
    // the battle ends by hits, by falling into the water or by time (online the server says when)
    if (se.phase === 'finished' && this.finishTimer < 0) {
      this.finishTimer = 2.5;
      audio.beep(880, 0.6);
    }
    if (this.finishTimer > 0 && !this.opts.net) {
      this.finishTimer -= dt;
      if (this.finishTimer <= 0) this.finish(this.result());
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
      return { ...r, name: k.name, carId: k.spec.id, human: !k.bot, mine: !!k.player };
    });
    return { rows, winner: this.session.winner() };
  }

  setEngineVolume(v: number) {
    for (const p of this.players) p.voice?.setVolume(v);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.offNet?.();
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
