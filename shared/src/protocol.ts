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
}
