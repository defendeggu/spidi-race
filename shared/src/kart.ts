import type { CarSpec } from './cars';
import { clamp } from './math';
import { forwardSpeed, stepCar, type CarInput, type CarState } from './physics';
import type { Track } from './track';

export type ItemKind = 'blaster' | 'homing' | 'mine' | 'turbo' | 'shield';
export const ITEM_KINDS: ItemKind[] = ['blaster', 'homing', 'mine', 'turbo', 'shield'];

/** Drift charge needed for boost level 1 / 2 / 3 (s) and the boost each level gives (s). */
export const DRIFT_LEVELS = [0.6, 1.2, 2];
export const DRIFT_BOOST = [0, 0.5, 0.9, 1.4];
export const TURBO_TIME = 1.5;
export const SPIN_TIME = 1.5;
/** after a spin-out the kart cannot be hit again for this long */
export const INVULN_TIME = 1;
export const SHIELD_TIME = 5;
/** a hop at the start of a drift: mines underneath do not count */
export const HOP_TIME = 0.3;

/** Everything a kart carries in addition to the car state. */
export interface KartState {
  id: string;
  item: ItemKind | null;
  /** item roulette running (s left); the item is decided when it ends */
  rolling: number;
  rollItem: ItemKind | null;
  boost: number;
  spin: number;
  invuln: number;
  shield: number;
  /** drift direction (-1 / +1) or 0, and how long the drift has been held */
  drift: number;
  driftTime: number;
  hop: number;
  /** statistics */
  hitsGiven: number;
  hitsTaken: number;
}

export function newKartState(id: string): KartState {
  return {
    id, item: null, rolling: 0, rollItem: null, boost: 0, spin: 0, invuln: 0, shield: 0, drift: 0, driftTime: 0, hop: 0,
    hitsGiven: 0, hitsTaken: 0,
  };
}

export function driftLevel(ks: KartState) {
  let l = 0;
  while (l < DRIFT_LEVELS.length && ks.driftTime >= DRIFT_LEVELS[l]) l++;
  return l;
}

/**
 * One physics step of a kart: the normal car physics with kart rules on top.
 * - Drift: handbrake + steering above 8 m/s. Unlike a car's handbrake it does not spin the kart; it
 *   tightens the line and charges a boost (3 levels) that fires when the handbrake is released.
 * - Boost (drift, turbo item): more top speed and acceleration, full throttle.
 * - Spin-out after a hit: no control, one full turn, speed drops.
 */
export function stepKart(c: CarState, spec: CarSpec, inp: CarInput, track: Track, dt: number, ks: KartState) {
  stepKartWith(c, spec, inp, dt, ks, (s, i) => stepCar(c, s, i, track, dt));
}

/** The kart rules on top of any car physics step (race track or town). */
export function stepKartWith(c: CarState, spec: CarSpec, inp: CarInput, dt: number, ks: KartState, move: (spec: CarSpec, inp: CarInput) => void) {
  ks.invuln = Math.max(0, ks.invuln - dt);
  ks.shield = Math.max(0, ks.shield - dt);
  ks.hop = Math.max(0, ks.hop - dt);
  const vf = forwardSpeed(c);

  if (ks.spin > 0) {
    ks.spin = Math.max(0, ks.spin - dt);
    ks.drift = 0;
    ks.driftTime = 0;
    ks.boost = 0;
    move(spec, { throttle: 0, brake: 0.3, steer: 0, handbrake: false });
    // one full turn over the spin time; the speed bleeds off
    c.heading += ((Math.PI * 2) / SPIN_TIME) * dt;
    const k = Math.exp(-2.5 * dt);
    c.vx *= k;
    c.vz *= k;
    return;
  }

  const steering = Math.abs(inp.steer) > 0.3;
  if (inp.handbrake && steering && vf > 8 && !c.airborne) {
    if (ks.drift === 0) {
      ks.drift = Math.sign(inp.steer);
      ks.driftTime = 0;
      ks.hop = HOP_TIME;
    }
    ks.driftTime += dt;
  } else if (ks.drift !== 0) {
    // release: boost by drift level
    ks.boost = Math.max(ks.boost, DRIFT_BOOST[driftLevel(ks)]);
    ks.drift = 0;
    ks.driftTime = 0;
  }

  let s = spec;
  let i = inp;
  if (ks.drift !== 0) {
    // a controlled slide: tighter turning towards the drift side, a bit less grip, no handbrake spin
    const steer = clamp(ks.drift * 0.55 + inp.steer * 0.6, -1, 1);
    s = { ...s, grip: s.grip * 0.9, steer: s.steer * 1.35 };
    i = { ...inp, handbrake: false, steer };
  }
  if (ks.boost > 0) {
    ks.boost = Math.max(0, ks.boost - dt);
    s = { ...s, topSpeed: s.topSpeed * 1.3, accel: s.accel * 1.8 };
    i = { ...i, throttle: 1, brake: 0 };
  }
  move(s, i);
}

/**
 * The timers of a kart that is driven elsewhere: the game server keeps them for karts simulated by
 * their clients, so that hits, shields and the immunity after a spin-out are judged correctly.
 */
export function tickKartTimers(ks: KartState, dt: number) {
  ks.invuln = Math.max(0, ks.invuln - dt);
  ks.shield = Math.max(0, ks.shield - dt);
  ks.hop = Math.max(0, ks.hop - dt);
  ks.spin = Math.max(0, ks.spin - dt);
}

/** A hit by a projectile or a mine: spin-out unless the kart is protected. Returns what happened. */
export function hitKart(ks: KartState): 'hit' | 'blocked' | 'immune' {
  if (ks.spin > 0 || ks.invuln > 0) return 'immune';
  if (ks.shield > 0) {
    ks.shield = 0;
    ks.invuln = 0.5;
    return 'blocked';
  }
  ks.spin = SPIN_TIME;
  ks.invuln = SPIN_TIME + INVULN_TIME;
  ks.boost = 0;
  ks.drift = 0;
  ks.driftTime = 0;
  ks.hitsTaken++;
  return 'hit';
}
