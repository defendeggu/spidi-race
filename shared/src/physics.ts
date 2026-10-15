import type { CarSpec } from './cars';
import { approach, clamp, wrapAngle } from './math';
import { SURFACE_PROPS, WALL_OFFSET, type Track } from './track';

export interface CarInput {
  throttle: number;
  brake: number;
  /** -1 = left, +1 = right */
  steer: number;
  handbrake: boolean;
}

export const NO_INPUT: CarInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };

export interface CarState {
  id: string;
  x: number;
  y: number;
  z: number;
  /** forward = (sin heading, cos heading) in the x/z plane */
  heading: number;
  vx: number;
  vz: number;
  steer: number;
  rpm: number;
  /** 0 = reverse, 1..n */
  gear: number;
  idx: number;
  s: number;
  lat: number;
  skid: number;
  /** impact speed against a wall or car during the last step (for sound) */
  impact: number;
  throttle: number;
  braking: boolean;
  offroad: boolean;
  shiftTimer: number;
  /** vertical speed (m/s); follows the road while on the ground */
  vy: number;
  airborne: boolean;
  /** duration of the current (or, right after landing, the last) flight in seconds */
  airTime: number;
  /** set for one step when the car touches down: impact speed */
  landed: number;
}

export const CAR_HALF_WIDTH = 0.95;
export const CIRCLE_R = 1.05;
export const CIRCLE_OFFSET = 1.2;
const IDLE_RPM = 900;
const MAX_RPM = 7600;

export function createCarState(id: string, track: Track, x: number, z: number, heading: number): CarState {
  const p = track.project(x, z);
  const c = newCarState(id, x, p.y, z, heading);
  c.idx = p.idx;
  c.s = p.s;
  c.lat = p.lat;
  return c;
}

/** A car at rest, not tied to any track (idx/s/lat stay 0). */
export function newCarState(id: string, x: number, y: number, z: number, heading: number): CarState {
  return {
    id, x, y, z, heading, vx: 0, vz: 0, steer: 0, rpm: IDLE_RPM, gear: 1,
    idx: 0, s: 0, lat: 0, skid: 0, impact: 0, throttle: 0, braking: false, offroad: false, shiftTimer: 0,
    vy: 0, airborne: false, airTime: 0, landed: 0,
  };
}

export function forwardSpeed(c: CarState) {
  return c.vx * Math.sin(c.heading) + c.vz * Math.cos(c.heading);
}

function gearTopSpeed(spec: CarSpec, gear: number) {
  return spec.topSpeed * Math.pow(gear / spec.gears, 0.8);
}

/** While the car waits on the grid: engine can be revved but the car does not move. */
export function idleCar(c: CarState, inp: CarInput, dt: number) {
  c.throttle = inp.throttle;
  c.rpm = approach(c.rpm, IDLE_RPM + inp.throttle * 5200, 9000 * dt);
  c.vx = c.vz = c.vy = 0;
  c.skid = 0;
  c.impact = 0;
}

const GRAVITY = 9.81;
/** the ground must fall away this much below the ballistic path before the car takes off */
const TAKEOFF_TOLERANCE = 0.03;

/** Grip factor and rolling drag of the surface for this car (offroad cars suffer only half the penalty). */
function surfaceFor(spec: CarSpec, track: Track, i: number) {
  const sp = SURFACE_PROPS[track.surfaceAt(i)];
  if (spec.class !== 'offroad') return sp;
  return { grip: sp.grip + (1 - sp.grip) * 0.5, drag: sp.drag * 0.5, rough: sp.rough };
}

/** What the car drives on during one step: surface grip/drag, slope and banking along the driving direction. */
export interface DriveGround {
  /** surface grip factor and rolling drag (already adjusted for the car class) */
  grip: number;
  drag: number;
  /** off the paved road (less grip, more drag) */
  offroad: boolean;
  /** extra lateral grip from banking (m/s²) */
  bankGrip: number;
  /** road grade along the driving direction (rise per metre) */
  slope: number;
}

/**
 * Core vehicle dynamics shared by race tracks and the open town: throttle, brakes, lateral grip,
 * yaw and integration of the horizontal position. Returns the new forward speed.
 */
export function driveCar(c: CarState, spec: CarSpec, inp: CarInput, g: DriveGround, dt: number) {
  const steerRate = Math.sign(inp.steer) !== Math.sign(c.steer) || Math.abs(inp.steer) < Math.abs(c.steer) ? 7 : 3.4;
  c.steer = approach(c.steer, inp.steer, steerRate * dt);
  c.throttle = inp.throttle;

  const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
  const rx = -fz, rz = fx;
  let vf = c.vx * fx + c.vz * fz;
  let vl = c.vx * rx + c.vz * rz;

  c.offroad = g.offroad;
  const air = c.airborne;
  // in the air the wheels have no traction
  const thr = air ? 0 : inp.throttle, brk = air ? 0 : inp.brake;
  let a = 0;

  if (thr > 0 && vf > -0.5) {
    const r = Math.max(0, vf) / spec.topSpeed;
    a += spec.accel * thr * Math.max(0, 1 - r * r) * (c.shiftTimer > 0 ? 0.3 : 1);
  }
  if (brk > 0) {
    if (vf > 0.5) a -= spec.brake * brk;
    else if (vf > -14) a -= spec.accel * 0.45 * brk;
  }
  if (thr > 0 && vf < -0.5) a += spec.brake * thr;
  if (inp.handbrake && !air) a -= Math.sign(vf) * 3.5;
  a -= vf * 0.015;
  if (!air) {
    if (Math.abs(vf) > 0.1) a -= Math.sign(vf) * 0.25;
    if (c.offroad) a -= vf * 0.15;
    a -= vf * g.drag;
    // gravity on slopes
    a -= GRAVITY * 0.7 * g.slope;
  }

  const vfOld = vf;
  vf += a * dt;
  if (thr === 0 && brk === 0 && vfOld * vf < 0) vf = 0;
  if (vfOld > 0.5 && vf < 0 && brk > 0) vf = 0;
  c.braking = brk > 0 && vfOld > 0.5;

  // lateral grip
  const gripBase = (spec.grip + g.bankGrip) * (c.offroad ? 0.65 : 1) * g.grip;
  const grip = air ? 0 : gripBase * (inp.handbrake ? 0.3 : 1);
  vl += clamp(-vl * 10, -grip, grip) * dt;
  c.skid = air ? 0 : clamp((Math.abs(vl) - 2) / 6, 0, 1);
  if (brk > 0.8 && vf > 18) c.skid = Math.max(c.skid, 0.35);

  // yaw (bicycle model, limited by available grip)
  const steerMax = spec.steer / (1 + Math.abs(vf) / 22);
  let yawRate = (vf / spec.wheelbase) * Math.tan(c.steer * steerMax);
  const av = Math.max(Math.abs(vf), 1);
  let maxYaw = (gripBase * 1.05) / av + 0.3 * Math.min(1, 15 / av);
  if (inp.handbrake && Math.abs(vf) > 5) {
    yawRate *= 1.6;
    maxYaw *= 1.9;
  }
  yawRate = clamp(yawRate, -maxYaw, maxYaw);
  if (air) yawRate *= 0.15;

  c.vx = fx * vf + rx * vl;
  c.vz = fz * vf + rz * vl;
  c.heading = wrapAngle(c.heading - yawRate * dt);
  c.x += c.vx * dt;
  c.z += c.vz * dt;
  return vf;
}

const trackGround: DriveGround = { grip: 1, drag: 0, offroad: false, bankGrip: 0, slope: 0 };

export function stepCar(c: CarState, spec: CarSpec, inp: CarInput, track: Track, dt: number) {
  const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
  const i = c.idx;
  const surf = surfaceFor(spec, track, i);
  trackGround.grip = surf.grip;
  trackGround.drag = surf.drag;
  trackGround.offroad = Math.abs(c.lat) > track.hw[i] + 0.4;
  trackGround.bankGrip = track.bankGrip(i);
  trackGround.slope = track.grade[i] * (fx * track.tx[i] + fz * track.tz[i]);
  const vf = driveCar(c, spec, inp, trackGround, dt);

  // keep the car between the barriers
  const p = track.project(c.x, c.z, c.idx);
  c.idx = p.idx;
  c.s = p.s;
  c.lat = p.lat;
  c.impact = 0;
  const wall = p.halfWidth + WALL_OFFSET - CAR_HALF_WIDTH;
  if (Math.abs(p.lat) > wall) {
    const sgn = Math.sign(p.lat);
    const pen = p.lat - sgn * wall;
    c.x -= p.rx * pen;
    c.z -= p.rz * pen;
    c.lat = sgn * wall;
    const vn = c.vx * p.rx + c.vz * p.rz;
    if (vn * sgn > 0) {
      c.vx -= p.rx * vn * 1.3;
      c.vz -= p.rz * vn * 1.3;
      const scrape = 1 - Math.min(0.35, Math.abs(vn) * 0.022);
      c.vx *= scrape;
      c.vz *= scrape;
      c.impact = Math.abs(vn);
      // turn the car a bit along the barrier so it does not get stuck
      const fwdAlong = fx * p.tx + fz * p.tz;
      const target = Math.atan2(p.tx, p.tz) + (fwdAlong < 0 ? Math.PI : 0);
      c.heading = wrapAngle(c.heading + wrapAngle(target - c.heading) * Math.min(0.35, Math.abs(vn) * 0.04));
    }
  }
  updateVertical(c, p.y, dt, track.carClass === 'offroad');

  updateGearbox(c, spec, vf, dt);
}

/** Ground following, take-off over crests and kickers, flight and landing. */
export function updateVertical(c: CarState, ground: number, dt: number, canFly: boolean) {
  c.landed = 0;
  if (c.airborne) {
    c.vy -= GRAVITY * dt;
    c.y += c.vy * dt;
    c.airTime += dt;
    if (c.y <= ground) {
      const hit = -c.vy;
      c.y = ground;
      c.vy = 0;
      c.airborne = false;
      c.landed = Math.max(0.1, hit);
      if (hit > 6) {
        // hard landing costs some speed
        const loss = Math.max(0.8, 1 - (hit - 6) * 0.015);
        c.vx *= loss;
        c.vz *= loss;
        c.impact = Math.max(c.impact, hit * 0.6);
      }
    }
    return;
  }
  const ballistic = c.y + c.vy * dt - 0.5 * GRAVITY * dt * dt;
  // only offroad tracks let cars fly; road tracks keep the original glued-to-the-road feel
  if (canFly && ground < ballistic - TAKEOFF_TOLERANCE) {
    c.airborne = true;
    c.airTime = 0;
    c.y = ballistic;
    c.vy -= GRAVITY * dt;
    return;
  }
  if (ground - c.y > 0.6) {
    // ran into a step (e.g. the far wall of a pit after a short jump)
    c.vx *= 0.5;
    c.vz *= 0.5;
    c.impact = Math.max(c.impact, 8);
  }
  // stick to the road; clamp vertical speed so that sudden steps do not launch the car
  c.vy = clamp((ground - c.y) / dt, -40, 40);
  c.y = ground;
}

export function updateGearbox(c: CarState, spec: CarSpec, vf: number, dt: number) {
  if (c.shiftTimer > 0) c.shiftTimer -= dt;
  let target: number;
  if (c.airborne) {
    // free-revving wheels in the air
    c.rpm = approach(c.rpm, Math.min(MAX_RPM, c.rpm + c.throttle * 3000), 6000 * dt);
    return;
  }
  if (vf < -0.5) {
    c.gear = 0;
    target = IDLE_RPM + (Math.abs(vf) / gearTopSpeed(spec, 1)) * 6500;
  } else {
    if (c.gear < 1) c.gear = 1;
    const rpmFor = (g: number) => IDLE_RPM + (vf / gearTopSpeed(spec, g)) * 6500;
    if (rpmFor(c.gear) > 7300 && c.gear < spec.gears) {
      c.gear++;
      c.shiftTimer = 0.18;
    } else if (c.gear > 1 && rpmFor(c.gear) < 3300) {
      c.gear--;
    }
    target = rpmFor(c.gear);
    if (vf < 3) target = Math.max(target, IDLE_RPM + c.throttle * 3000);
  }
  c.rpm = approach(c.rpm, Math.min(target, MAX_RPM), 14000 * dt);
}

/**
 * Car-vs-car collision using two circles per car. A car with mass Infinity is not moved
 * (used for remote cars that are simulated elsewhere). Returns the impact speed.
 */
export function collideCars(a: CarState, b: CarState, massA: number, massB: number): number {
  const dxc = b.x - a.x, dzc = b.z - a.z;
  if (dxc * dxc + dzc * dzc > 36) return 0;
  const wa = massA === Infinity ? 0 : 1 / massA;
  const wb = massB === Infinity ? 0 : 1 / massB;
  if (wa + wb === 0) return 0;
  const afx = Math.sin(a.heading) * CIRCLE_OFFSET, afz = Math.cos(a.heading) * CIRCLE_OFFSET;
  const bfx = Math.sin(b.heading) * CIRCLE_OFFSET, bfz = Math.cos(b.heading) * CIRCLE_OFFSET;
  let impact = 0;
  for (let ia = -1; ia <= 1; ia += 2) {
    for (let ib = -1; ib <= 1; ib += 2) {
      const ax = a.x + afx * ia, az = a.z + afz * ia;
      const bx = b.x + bfx * ib, bz = b.z + bfz * ib;
      let nx = bx - ax, nz = bz - az;
      const d = Math.hypot(nx, nz);
      if (d >= CIRCLE_R * 2 || d < 1e-6) continue;
      nx /= d;
      nz /= d;
      const pen = CIRCLE_R * 2 - d;
      const sa = wa / (wa + wb), sb = wb / (wa + wb);
      a.x -= nx * pen * sa;
      a.z -= nz * pen * sa;
      b.x += nx * pen * sb;
      b.z += nz * pen * sb;
      const vrel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (vrel < 0) {
        const j = (-(1 + 0.3) * vrel) / (wa + wb);
        a.vx -= nx * j * wa;
        a.vz -= nz * j * wa;
        b.vx += nx * j * wb;
        b.vz += nz * j * wb;
        impact = Math.max(impact, -vrel);
      }
    }
  }
  if (impact > 0) {
    a.impact = Math.max(a.impact, impact);
    b.impact = Math.max(b.impact, impact);
  }
  return impact;
}
