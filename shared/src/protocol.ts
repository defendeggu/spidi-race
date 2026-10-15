import type { NetRace, ResultRow, Slot } from './race';
import type { CarState } from './physics';

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
  | { type: 'state'; cars: NetCar[] };

export type ServerMsg =
  | { type: 'welcome'; clientId: string }
  | { type: 'lobby'; hostId: string; phase: 'lobby' | 'race'; settings: LobbySettings; clients: LobbyClient[] }
  | { type: 'start'; trackId: string; laps: number; slots: Slot[]; countdown: number }
  | { type: 'snap'; cars: NetCar[]; race: NetRace }
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
