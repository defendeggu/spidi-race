import type { NetRace, ResultRow, Slot } from './race';
import type { CarState } from './physics';
import { ITEM_KINDS, SHIELD_TIME, TURBO_TIME, type ItemKind, type KartState } from './kart';
import type { ItemEvent, ItemWorld, Projectile } from './items';
import type { BattleRow, NetBattle } from './battle';

/** Compact car state sent over the network. */
export interface NetCar {
  id: string;
  x: number;
  y: number;
  z: number;
  h: number;
  vx: number;
  vz: number;
  st: number;
  rpm: number;
  g: number;
  sk: number;
  br: boolean;
  vy: number;
  air: boolean;
}

export interface LobbyPlayer {
  name: string;
  carId: string;
}

export interface LobbySettings {
  trackId: string;
  laps: number;
  aiCount: number;
  aiSkill: number;
  /** kart race with items (road and offroad tracks) */
  kart?: boolean;
  /** with kart: battle in the practice town instead of a race (aiCount = bots) */
  battle?: boolean;
}

export interface LobbyClient {
  id: string;
  players: LobbyPlayer[];
}

export const MAX_CARS = 8;
export const DEFAULT_PORT = 8090;

export type ClientMsg =
  | { type: 'join'; players: LobbyPlayer[] }
  | { type: 'settings'; settings: LobbySettings }
  | { type: 'start' }
  /** host only: abort the running race for everyone */
  | { type: 'abort' }
  /** karts: the drift and boost of the own karts go along (the server judges hits and mines with them) */
  | { type: 'state'; cars: NetCar[]; karts?: NetKart[] }
  /** kart races: use the held item of an own kart */
  | { type: 'item'; id: string };

export type ServerMsg =
  | { type: 'welcome'; clientId: string }
  | { type: 'lobby'; hostId: string; phase: 'lobby' | 'race'; settings: LobbySettings; clients: LobbyClient[] }
  | { type: 'start'; trackId: string; laps: number; slots: Slot[]; countdown: number; kart?: boolean; battle?: boolean }
  | { type: 'snap'; cars: NetCar[]; race: NetRace; items?: NetItems }
  /** kart battle: cars, items and balloons */
  | { type: 'bsnap'; cars: NetCar[]; items: NetItems; battle: NetBattle }
  | { type: 'battleEnd'; rows: NetBattleRow[]; winner: string | null }
  | { type: 'aborted'; by: string }
  | { type: 'end'; results: ResultRow[]; /** best-lap leaderboard rank per car id */ ranks: Record<string, number> };

const r2 = (v: number) => Math.round(v * 100) / 100;

export function toNetCar(c: CarState): NetCar {
  return {
    id: c.id, x: r2(c.x), y: r2(c.y), z: r2(c.z), h: Math.round(c.heading * 1000) / 1000,
    vx: r2(c.vx), vz: r2(c.vz), st: r2(c.steer), rpm: Math.round(c.rpm), g: c.gear, sk: r2(c.skid), br: c.braking,
    vy: r2(c.vy), air: c.airborne,
  };
}

const num = (v: unknown, lo: number, hi: number, def = 0) => {
  const n = typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def;
};

/**
 * Clean a car state received from the network: every field gets the right type and a sane range,
 * unknown fields are dropped. Returns null if it is not an object with an id and finite x/z.
 */
export function sanitizeNetCar(v: unknown, maxGear = 8): NetCar | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== 'string' || o.id.length > 64) return null;
  if (typeof o.x !== 'number' || typeof o.z !== 'number' || !Number.isFinite(o.x) || !Number.isFinite(o.z)) return null;
  const W = 1e5;
  return {
    id: o.id,
    x: num(o.x, -W, W), y: num(o.y, -1e3, 1e3), z: num(o.z, -W, W), h: num(o.h, -10, 10),
    vx: num(o.vx, -200, 200), vz: num(o.vz, -200, 200), st: num(o.st, -1, 1), rpm: num(o.rpm, 0, 9000),
    g: Math.round(num(o.g, 0, maxGear, 1)), sk: num(o.sk, 0, 1), br: o.br === true, vy: num(o.vy, -100, 100), air: o.air === true,
  };
}

export function applyNetCar(c: CarState, n: NetCar) {
  c.x = n.x;
  c.y = n.y;
  c.z = n.z;
  c.heading = n.h;
  c.vx = n.vx;
  c.vz = n.vz;
  c.steer = n.st;
  c.rpm = n.rpm;
  c.gear = n.g;
  c.skid = n.sk;
  c.braking = n.br;
  c.vy = n.vy ?? 0;
  c.airborne = !!n.air;
}

/** A line of the battle result. */
export interface NetBattleRow extends BattleRow {
  name: string;
  carId: string;
  isAI: boolean;
  ownerId: string;
}

// ---------------------------------------------------------------- kart races over the network

/** Item state of one kart. Clients send only the driving part (bo, dr, dt, hp) for their own karts. */
export interface NetKart {
  id: string;
  it: ItemKind | null;
  /** the items behind it */
  q: ItemKind[];
  /** item roulette: seconds left */
  ro: number;
  sp: number;
  sh: number;
  inv: number;
  bo: number;
  dr: number;
  dt: number;
  hp: number;
  hg: number;
  ht: number;
}

/** Everything of the items the clients need to show: karts, shots [id, kind, x, y, z, vx, vz, owner], mines, boxes away, events. */
export interface NetItems {
  k: NetKart[];
  p: [number, 'blaster' | 'homing', number, number, number, number, number, string][];
  m: [number, number, number, number][];
  /** indices of the boxes that are not there right now */
  b: number[];
  ev: ItemEvent[];
}

export function toNetKart(ks: KartState): NetKart {
  return {
    id: ks.id, it: ks.item, q: [...ks.stock], ro: r2(ks.rolling), sp: r2(ks.spin), sh: r2(ks.shield), inv: r2(ks.invuln),
    bo: r2(ks.boost), dr: ks.drift, dt: r2(ks.driftTime), hp: r2(ks.hop), hg: ks.hitsGiven, ht: ks.hitsTaken,
  };
}

export function toNetItems(w: ItemWorld, events: ItemEvent[]): NetItems {
  return {
    k: [...w.karts.values()].map(toNetKart),
    p: w.projectiles.map((p) => [p.id, p.kind, r2(p.x), r2(p.y), r2(p.z), r2(p.vx), r2(p.vz), p.owner]),
    m: w.mines.map((m) => [m.id, r2(m.x), r2(m.y), r2(m.z)]),
    b: w.boxes.flatMap((b, i) => (b.respawn > 0 ? [i] : [])),
    ev: events,
  };
}

/**
 * Server side: take the driving part of a client's kart (drift, boost, the hop that clears mines).
 * The item, shield, spin-out and immunity stay the server's.
 */
export function applyKartDrive(ks: KartState, v: unknown) {
  if (!v || typeof v !== 'object') return;
  const o = v as Record<string, unknown>;
  ks.boost = num(o.bo, 0, 3);
  ks.drift = Math.sign(num(o.dr, -1, 1));
  ks.driftTime = num(o.dt, 0, 30);
  ks.hop = num(o.hp, 0, 0.3);
}

/**
 * Client side: show the server's item state. own: karts this client drives – they keep their drift and
 * boost, take a spin-out when the server says they were hit and a boost when their turbo fired.
 * delay (s): the others' shots are drawn that much in the past, like their interpolated cars; own shots
 * are drawn where they are, like the own karts.
 */
export function applyNetItems(w: ItemWorld, n: NetItems, own: Set<string>, delay = 0) {
  for (const k of n.k) {
    const ks = w.karts.get(k.id);
    if (!ks) continue;
    ks.item = k.it && ITEM_KINDS.includes(k.it) ? k.it : null;
    ks.stock = Array.isArray(k.q) ? k.q.filter((q) => ITEM_KINDS.includes(q)) : [];
    ks.rolling = k.ro;
    ks.shield = k.sh;
    ks.invuln = k.inv;
    ks.hitsGiven = k.hg;
    ks.hitsTaken = k.ht;
    if (own.has(k.id)) {
      if (k.sp > ks.spin + 0.1) {
        ks.spin = k.sp;
        ks.boost = 0;
        ks.drift = 0;
        ks.driftTime = 0;
      }
    } else {
      ks.spin = k.sp;
      ks.boost = k.bo;
      ks.drift = k.dr;
      ks.driftTime = k.dt;
      ks.hop = k.hp;
    }
  }
  for (const e of n.ev) {
    if (e.type === 'use' && e.item === 'turbo' && own.has(e.car)) {
      const ks = w.karts.get(e.car);
      if (ks) ks.boost = Math.max(ks.boost, TURBO_TIME);
    }
  }
  w.projectiles.length = 0;
  for (const [id, kind, x, y, z, vx, vz, owner = ''] of n.p) {
    const d = own.has(owner) ? 0 : delay;
    const p: Projectile = { id, kind, owner, target: null, x: x - vx * d, y, z: z - vz * d, vx, vz, idx: 0, age: 0, bounces: 0 };
    w.projectiles.push(p);
  }
  w.mines.length = 0;
  for (const [id, x, y, z] of n.m) w.mines.push({ id, owner: '', x, y, z, age: 1 });
  const away = new Set(n.b);
  w.boxes.forEach((b, i) => (b.respawn = away.has(i) ? 1 : 0));
}

/** a use the server has not confirmed within this time (s) was refused (e.g. the kart was hit) */
const PREDICT_TIMEOUT = 1;

/**
 * Client side of the items in a network game: the server's state, plus the own uses shown at once.
 * Pressing "item" fires the shot (or drops the mine, raises the shield …) right away; when the server's
 * confirmation arrives, its shot takes over the predicted one (the visuals keep the object, see
 * `adopt`), and the use is not shown a second time.
 */
export class ItemMirror {
  private pending: { car: string; item: ItemKind; local: number | null; age: number }[] = [];
  /** confirmed uses waiting for the server's shot / mine: car → local id */
  private awaiting = new Map<string, number>();

  constructor(readonly world: ItemWorld) {}

  /** The player used the item of an own kart: returns the events to show (none if there was no item). */
  use(id: string, c: CarState): ItemEvent[] {
    const p = this.world.predict(id, c);
    if (!p) return [];
    this.pending.push({ car: id, ...p, age: 0 });
    return this.world.events.splice(0);
  }

  /** Between snapshots: shots fly on; predictions the server never confirmed disappear. */
  update(dt: number): ItemEvent[] {
    for (const p of this.world.projectiles) {
      p.x += p.vx * dt;
      p.z += p.vz * dt;
    }
    const events: ItemEvent[] = [];
    for (let k = this.pending.length - 1; k >= 0; k--) {
      const p = this.pending[k];
      p.age += dt;
      if (p.age < PREDICT_TIMEOUT) continue;
      this.pending.splice(k, 1);
      if (p.local !== null) {
        this.dropLocal(p.local);
        events.push({ type: 'destroy', id: p.local, reason: 'timeout' });
      }
    }
    return events;
  }

  /**
   * A snapshot from the server. Returns the events to show and the shots / mines whose predicted
   * object the server's one takes over ([local id, server id]).
   */
  apply(n: NetItems, own: Set<string>, delay = 0): { events: ItemEvent[]; adopt: [number, number][] } {
    const w = this.world;
    const keepShots = w.projectiles.filter((p) => p.id < 0);
    const keepMines = w.mines.filter((m) => m.id < 0);
    applyNetItems(w, n, own, delay);
    const events: ItemEvent[] = [];
    const adopt: [number, number][] = [];
    for (const e of n.ev) {
      if (e.type === 'use' && own.has(e.car)) {
        const k = this.pending.findIndex((p) => p.car === e.car && p.item === e.item);
        if (k >= 0) {
          const [p] = this.pending.splice(k, 1);
          if (p.local !== null) this.awaiting.set(p.car, p.local);
          continue; // already shown
        }
      }
      if (e.type === 'spawn' && this.awaiting.has(e.owner)) {
        const local = this.awaiting.get(e.owner)!;
        this.awaiting.delete(e.owner);
        adopt.push([local, e.id]);
        const i = keepShots.findIndex((p) => p.id === local);
        if (i >= 0) keepShots.splice(i, 1);
        const j = keepMines.findIndex((m) => m.id === local);
        if (j >= 0) keepMines.splice(j, 1);
        continue;
      }
      events.push(e);
    }
    // predictions still waiting for the server: keep them, and keep the item out of the slot
    w.projectiles.push(...keepShots);
    w.mines.push(...keepMines);
    for (const p of this.pending) {
      const ks = w.karts.get(p.car);
      if (!ks) continue;
      if (ks.item === p.item) ks.item = ks.stock.shift() ?? null;
      if (p.item === 'shield') ks.shield = Math.max(ks.shield, SHIELD_TIME - p.age);
    }
    return { events, adopt };
  }

  private dropLocal(id: number) {
    const w = this.world;
    const i = w.projectiles.findIndex((p) => p.id === id);
    if (i >= 0) w.projectiles.splice(i, 1);
    const j = w.mines.findIndex((m) => m.id === id);
    if (j >= 0) w.mines.splice(j, 1);
  }
}
