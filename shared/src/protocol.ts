import type { NetRace, ResultRow, Slot } from './race';
import type { CarState } from './physics';
import { ITEM_KINDS, TURBO_TIME, type ItemKind, type KartState } from './kart';
import type { ItemEvent, ItemWorld, Projectile } from './items';

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
  | { type: 'start'; trackId: string; laps: number; slots: Slot[]; countdown: number; kart?: boolean }
  | { type: 'snap'; cars: NetCar[]; race: NetRace; items?: NetItems }
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

// ---------------------------------------------------------------- kart races over the network

/** Item state of one kart. Clients send only the driving part (bo, dr, dt, hp) for their own karts. */
export interface NetKart {
  id: string;
  it: ItemKind | null;
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

/** Everything of the items the clients need to show: karts, shots [id, kind, x, y, z, vx, vz], mines, boxes away, events. */
export interface NetItems {
  k: NetKart[];
  p: [number, 'blaster' | 'homing', number, number, number, number, number][];
  m: [number, number, number, number][];
  /** indices of the boxes that are not there right now */
  b: number[];
  ev: ItemEvent[];
}

export function toNetKart(ks: KartState): NetKart {
  return {
    id: ks.id, it: ks.item, ro: r2(ks.rolling), sp: r2(ks.spin), sh: r2(ks.shield), inv: r2(ks.invuln),
    bo: r2(ks.boost), dr: ks.drift, dt: r2(ks.driftTime), hp: r2(ks.hop), hg: ks.hitsGiven, ht: ks.hitsTaken,
  };
}

export function toNetItems(w: ItemWorld, events: ItemEvent[]): NetItems {
  return {
    k: [...w.karts.values()].map(toNetKart),
    p: w.projectiles.map((p) => [p.id, p.kind, r2(p.x), r2(p.y), r2(p.z), r2(p.vx), r2(p.vz)]),
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
 * delay (s): shots are drawn that much in the past, like the interpolated cars of the others.
 */
export function applyNetItems(w: ItemWorld, n: NetItems, own: Set<string>, delay = 0) {
  for (const k of n.k) {
    const ks = w.karts.get(k.id);
    if (!ks) continue;
    ks.item = k.it && ITEM_KINDS.includes(k.it) ? k.it : null;
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
  for (const [id, kind, x, y, z, vx, vz] of n.p) {
    const p: Projectile = { id, kind, owner: '', target: null, x: x - vx * delay, y, z: z - vz * delay, vx, vz, idx: 0, age: 0, bounces: 0 };
    w.projectiles.push(p);
  }
  w.mines.length = 0;
  for (const [id, x, y, z] of n.m) w.mines.push({ id, owner: '', x, y, z, age: 1 });
  const away = new Set(n.b);
  w.boxes.forEach((b, i) => (b.respawn = away.has(i) ? 1 : 0));
}
