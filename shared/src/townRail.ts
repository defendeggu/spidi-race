import type { CarSpec } from './cars';
import { CIRCLE_R, type CarState } from './physics';

/**
 * The railway of the practice town: two tracks, both open to cars (no fences), and the timetable of
 * the trains on them. Everything is a function of the game time, so the renderer and the collisions
 * agree without any state.
 *
 * - Track 1 (S-Bahn): out of the south tunnel up the east strip past the old station, along the north
 *   green strip to the airfield and south to the airport station (a terminus with a buffer stop).
 *   The S-Bahn shuttles south tunnel → east station → airport → east station → south tunnel.
 * - Track 2 (freight): the straight line along the east strip between the south and the north
 *   tunnel. The freight train runs back and forth without a break, so a train is always moving.
 */

export interface RailPath {
  length: number;
  /** position and heading at distance s (clamped to the path) */
  at(s: number): { x: number; z: number; heading: number };
  /** sampled every metre (for drawing and the minimap) */
  points: { x: number; z: number; heading: number }[];
}

/** Straight lines with round corners of radius r through the given points (tracks, taxi routes). */
export function railPath(pts: [number, number][], r: number): RailPath {
  const out: { x: number; z: number; heading: number }[] = [];
  const push = (x: number, z: number, heading: number) => out.push({ x, z, heading });
  // build a fine polyline first: straights and arcs
  const fine: [number, number][] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], [cx, cz] = pts[i + 1];
    const d1 = Math.hypot(bx - ax, bz - az), d2 = Math.hypot(cx - bx, cz - bz);
    const u1 = [(bx - ax) / d1, (bz - az) / d1], u2 = [(cx - bx) / d2, (cz - bz) / d2];
    const turn = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])));
    const cut = r * Math.tan(turn / 2);
    const p1: [number, number] = [bx - u1[0] * cut, bz - u1[1] * cut], p2: [number, number] = [bx + u2[0] * cut, bz + u2[1] * cut];
    fine.push(p1);
    // arc from p1 to p2 as a quadratic curve around the corner (close to a circle for 90°)
    for (let k = 1; k < 16; k++) {
      const t = k / 16, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
      fine.push([a * p1[0] + b * bx + c * p2[0], a * p1[1] + b * bz + c * p2[1]]);
    }
    fine.push(p2);
  }
  fine.push(pts[pts.length - 1]);
  // resample every metre
  let carry = 0;
  for (let i = 1; i < fine.length; i++) {
    const [ax, az] = fine[i - 1], [bx, bz] = fine[i];
    const d = Math.hypot(bx - ax, bz - az);
    if (d < 1e-9) continue;
    const h = Math.atan2(bx - ax, bz - az);
    if (out.length === 0) push(ax, az, h);
    let s = 1 - carry;
    while (s <= d) {
      push(ax + ((bx - ax) * s) / d, az + ((bz - az) * s) / d, h);
      s += 1;
    }
    carry = d - (s - 1);
  }
  const length = out.length - 1;
  return {
    length,
    points: out,
    at(s: number) {
      const c = Math.max(0, Math.min(length, s));
      const i = Math.min(length - 1, Math.floor(c)), f = c - i;
      const a = out[i], b = out[i + 1];
      const dh = Math.atan2(Math.sin(b.heading - a.heading), Math.cos(b.heading - a.heading));
      return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, heading: a.heading + dh * f };
    },
  };
}

/** Layout of both tracks, the stations and the tunnel ends. */
export const TOWN_RAIL = {
  /** track 1 (S-Bahn) along the east strip, the north strip and down to the airport */
  trackX: -522,
  /** track 2 (freight) beside it, straight between the tunnels */
  freightX: -538,
  south: -446,
  north: 486,
  /** along the north green strip */
  northZ: 478,
  /** the airport leg runs south at this x and ends at the buffer stop */
  airportX: 488,
  airportEnd: 322,
  /** east station platform (x range) beside track 1, centred on z = 0 */
  platform: [-519.6, -508] as const,
  /** airport station: platform on the town side of the track, z range */
  airportPlatform: { x0: 477.6, x1: 485.6, z0: 330, z1: 440 },
  airportStation: { x: 469, z: 385, w: 10, d: 40 },
  /** asphalt forecourt of the airport station */
  airportForecourt: { x0: 458, x1: 477, z0: 326, z1: 446 },
};

const R = TOWN_RAIL;
export const SBAHN_PATH = railPath([[R.trackX, R.south], [R.trackX, R.northZ], [R.airportX, R.northZ], [R.airportX, R.airportEnd]], 30);
export const FREIGHT_PATH = railPath([[R.freightX, R.south], [R.freightX, R.north]], 30);

/** Train cars (length in m, as drawn: Kenney train kit × 3.2) and whether a car is turned around. */
export const TRAIN_SCALE = 3.2;
export const SBAHN_CARS = [2.4, 2.7, 2.7, 2.4].map((l) => l * TRAIN_SCALE);
export const FREIGHT_CARS = [2.6, 2.7, 2.7, 2.7, 2.7, 2.7].map((l) => l * TRAIN_SCALE);
const GAP = 0.4;
const SPEED = 14;
const ACCEL = 1;
const DWELL_EAST = 15;
const DWELL_AIRPORT = 20;
/** the S-Bahn waits this long in the south tunnel before its next round */
const TUNNEL_WAIT = 5;
export const TRAIN_HALF_WIDTH = 1.7;

const trainLength = (cars: number[]) => cars.reduce((s, l) => s + l, 0) + GAP * (cars.length - 1);

/** Driving from one stop to the next: accelerate, cruise, brake. Returns the duration and the distance covered at time u. */
function leg(dist: number, v0 = 0, v1 = 0) {
  const tUp = (SPEED - v0) / ACCEL, dUp = (SPEED * SPEED - v0 * v0) / (2 * ACCEL);
  const tDown = (SPEED - v1) / ACCEL, dDown = (SPEED * SPEED - v1 * v1) / (2 * ACCEL);
  const cruise = Math.max(0, dist - dUp - dDown);
  const duration = tUp + cruise / SPEED + tDown;
  const pos = (u: number) => {
    if (u <= 0) return 0;
    if (u < tUp) return v0 * u + (ACCEL * u * u) / 2;
    if (u < tUp + cruise / SPEED) return dUp + SPEED * (u - tUp);
    if (u < duration) {
      const w = u - tUp - cruise / SPEED;
      return dUp + cruise + SPEED * w - (ACCEL * w * w) / 2;
    }
    return dist;
  };
  return { duration, pos };
}

interface Step {
  duration: number;
  /** tail position along the path at time u into the step */
  tail(u: number): number;
  /** moving towards larger s */
  forward: boolean;
}

/** A timetable: legs and stops one after another, repeated. */
function timetable(steps: Step[]) {
  const total = steps.reduce((s, x) => s + x.duration, 0);
  return (t: number) => {
    let u = ((t % total) + total) % total;
    for (const s of steps) {
      if (u < s.duration) return { tail: s.tail(u), forward: s.forward, moving: !('stop' in s) };
      u -= s.duration;
    }
    const last = steps[steps.length - 1];
    return { tail: last.tail(last.duration), forward: last.forward, moving: false };
  };
}

const move = (from: number, to: number, v0 = 0, v1 = 0): Step => {
  const l = leg(Math.abs(to - from), v0, v1), dir = Math.sign(to - from);
  return { duration: l.duration, tail: (u) => from + dir * l.pos(u), forward: dir > 0 };
};
const stop = (at: number, duration: number, forward: boolean): Step & { stop: true } => ({ duration, tail: () => at, forward, stop: true });

const SBAHN_LEN = trainLength(SBAHN_CARS), FREIGHT_LEN = trainLength(FREIGHT_CARS);
/** S-Bahn tail positions: hidden in the tunnel, at the east station (centred on z = 0), at the buffer stop */
const S_HIDDEN = -SBAHN_LEN - 2, S_EAST = -R.south - SBAHN_LEN / 2, S_AIRPORT = SBAHN_PATH.length - 3 - SBAHN_LEN;
const sbahn = timetable([
  move(S_HIDDEN, S_EAST),
  stop(S_EAST, DWELL_EAST, true),
  move(S_EAST, S_AIRPORT),
  stop(S_AIRPORT, DWELL_AIRPORT, false),
  move(S_AIRPORT, S_EAST),
  stop(S_EAST, DWELL_EAST, false),
  move(S_EAST, S_HIDDEN),
  stop(S_HIDDEN, TUNNEL_WAIT, true),
]);
/** freight: through runs at full speed, one direction after the other; the turn happens inside the tunnels */
const F_SOUTH = -FREIGHT_LEN - 1, F_NORTH = FREIGHT_PATH.length + 1;
const freight = timetable([
  { duration: (F_NORTH - F_SOUTH) / SPEED, tail: (u) => F_SOUTH + SPEED * u, forward: true },
  { duration: (F_NORTH - F_SOUTH) / SPEED, tail: (u) => F_NORTH - SPEED * u, forward: false },
]);

export interface TrainCarPose {
  x: number;
  z: number;
  /** heading of the car body along the track */
  heading: number;
  length: number;
  /** inside a tunnel (not drawn, no collisions) */
  hidden: boolean;
}

export interface TrainPose {
  id: 'sbahn' | 'freight';
  moving: boolean;
  cars: TrainCarPose[];
}

/** Where both trains are at game time t (seconds). */
export function trainsAt(t: number): TrainPose[] {
  const place = (id: TrainPose['id'], path: RailPath, cars: number[], st: { tail: number; forward: boolean; moving: boolean }, tunnelEnd: boolean): TrainPose => {
    // the leading car (cab, locomotive) is at the front in the direction of travel
    const order = st.forward ? [...cars].reverse() : cars;
    let s = st.tail;
    const poses = order.map((len) => {
      const c = s + len / 2;
      s += len + GAP;
      const p = path.at(c);
      const hidden = c < 0 || (tunnelEnd && c > path.length);
      return { x: p.x, z: p.z, heading: p.heading + (st.forward ? 0 : Math.PI), length: len, hidden };
    });
    return { id, moving: st.moving, cars: st.forward ? poses.reverse() : poses };
  };
  return [place('sbahn', SBAHN_PATH, SBAHN_CARS, sbahn(t), false), place('freight', FREIGHT_PATH, FREIGHT_CARS, freight(t), true)];
}

/** A moving obstacle seen from above: a box along a heading (train car, aircraft fuselage). */
export interface MovingBox {
  x: number;
  z: number;
  heading: number;
  length: number;
  halfWidth: number;
}

/** The train cars outside the tunnels as moving boxes. */
export function trainBoxes(trains: TrainPose[]): MovingBox[] {
  return trains.flatMap((tr) => tr.cars.filter((c) => !c.hidden).map((c) => ({ x: c.x, z: c.z, heading: c.heading, length: c.length, halfWidth: TRAIN_HALF_WIDTH })));
}

/** Push a car out of the train cars; see collideMoving. */
export function collideTrains(c: CarState, spec: CarSpec, trains: TrainPose[]): number {
  return collideMoving(c, spec, trainBoxes(trains));
}

/**
 * Push a car out of moving boxes (two circles per car, like the obstacles of the town). Trains and
 * aircraft do not give way: the car is pushed aside and bounces off. Returns the impact speed.
 */
export function collideMoving(c: CarState, spec: CarSpec, boxes: MovingBox[]): number {
  if (c.y > 4.5) return 0;
  const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
  const off = Math.max(1.2, spec.shape.length / 2 - CIRCLE_R);
  let impact = 0;
  for (const b of boxes) {
    // cheap reject
    if (Math.abs(b.x - c.x) > b.length && Math.abs(b.z - c.z) > b.length) continue;
    const ax = Math.sin(b.heading), az = Math.cos(b.heading);
    const hl = b.length / 2, hw = b.halfWidth;
    for (const side of [1, -1]) {
      const px = c.x + fx * off * side, pz = c.z + fz * off * side;
      const dx = px - b.x, dz = pz - b.z;
      const along = dx * ax + dz * az, across = dx * az - dz * ax;
      const qa = Math.max(-hl, Math.min(hl, along)), qc = Math.max(-hw, Math.min(hw, across));
      let na: number, nc: number, pen: number;
      if (Math.abs(along) < hl && Math.abs(across) < hw) {
        // inside: out through the nearer long side (or an end)
        const toSide = hw - Math.abs(across), toEnd = hl - Math.abs(along);
        if (toSide < toEnd) [na, nc, pen] = [0, Math.sign(across) || 1, toSide + CIRCLE_R];
        else [na, nc, pen] = [Math.sign(along) || 1, 0, toEnd + CIRCLE_R];
      } else {
        const ea = along - qa, ec = across - qc, d = Math.hypot(ea, ec);
        if (d >= CIRCLE_R || d < 1e-9) continue;
        [na, nc, pen] = [ea / d, ec / d, CIRCLE_R - d];
      }
      // back to world: along = (ax, az), across = (az, -ax)
      const nx = na * ax + nc * az, nz = na * az - nc * ax;
      c.x += nx * pen;
      c.z += nz * pen;
      const vn = c.vx * nx + c.vz * nz;
      if (vn < 0) {
        c.vx -= nx * vn * 1.4;
        c.vz -= nz * vn * 1.4;
        impact = Math.max(impact, -vn);
      }
    }
  }
  return impact;
}
