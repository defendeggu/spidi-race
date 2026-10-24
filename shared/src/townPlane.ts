import { TOWN_AIRPORT } from './town';
import { railPath, type MovingBox, type RailPath } from './townRail';

/**
 * The moving aircraft of the practice town, functions of the game time:
 * - the departing one taxis from the taxiway onto the runway, lines up, waits, rolls, lifts off at
 *   about two thirds of the runway and climbs away; as soon as it is gone the next one comes;
 * - another one taxis round and round: south along the taxiway, back north along the edge of the apron.
 */

const A = TOWN_AIRPORT;
/** taxi route and runway in one line: taxiway south, the link onto the runway, then north along it and far beyond */
const ROUTE = railPath([[A.taxiway.x, -300], [A.taxiway.x, A.links[0]], [A.runway.x, A.links[0]], [A.runway.x, 2600]], 18);
const S_LINEUP = ROUTE.length - (2600 - (A.links[0] + 30));
/** lift-off at two thirds of the runway */
const S_LIFT = S_LINEUP + (A.runway.z0 + ((A.runway.z1 - A.runway.z0) * 2) / 3 - (A.links[0] + 30));
const TAXI_SPEED = 9;
const TAXI_ACCEL = 1.2;
const HOLD = 5;
const ROLL_ACCEL = 2.8;
const CLIMB_ACCEL = 1.6;
/** it is gone this far beyond the lift-off point (high above, far away) */
const GONE = 1600;
export const PLANE_LENGTH = 37;
export const PLANE_HALF_WIDTH = 2.1;

const tTaxiUp = TAXI_SPEED / TAXI_ACCEL, dTaxiUp = (TAXI_SPEED * TAXI_SPEED) / (2 * TAXI_ACCEL);
const tTaxi = tTaxiUp * 2 + (S_LINEUP - 2 * dTaxiUp) / TAXI_SPEED;
const tRoll = Math.sqrt((2 * (S_LIFT - S_LINEUP)) / ROLL_ACCEL), vLift = ROLL_ACCEL * tRoll;
const tClimb = (-vLift + Math.sqrt(vLift * vLift + 2 * CLIMB_ACCEL * GONE)) / CLIMB_ACCEL;
export const DEPARTURE_CYCLE = tTaxi + HOLD + tRoll + tClimb;

/** distance along the route at time u of one departure */
function along(u: number) {
  if (u < tTaxi) {
    if (u < tTaxiUp) return (TAXI_ACCEL * u * u) / 2;
    const cruise = tTaxi - 2 * tTaxiUp;
    if (u < tTaxiUp + cruise) return dTaxiUp + TAXI_SPEED * (u - tTaxiUp);
    const w = tTaxi - u;
    return S_LINEUP - (TAXI_ACCEL * w * w) / 2;
  }
  u -= tTaxi;
  if (u < HOLD) return S_LINEUP;
  u -= HOLD;
  if (u < tRoll) return S_LINEUP + (ROLL_ACCEL * u * u) / 2;
  u -= tRoll;
  return S_LIFT + vLift * u + (CLIMB_ACCEL * u * u) / 2;
}

/** Height above the runway after lift-off: a gentle rotation into a 9° climb. */
function height(s: number) {
  const d = s - S_LIFT;
  if (d <= 0) return 0;
  return d < 94 ? (d * d) / 1200 : 7.36 + (d - 94) * 0.158;
}

/**
 * The fuselage points from the tail to the nose, both on the route (like a real aircraft following
 * the taxi line) – a rigid body along the nose's heading would swing its tail far over the grass in a turn.
 */
function followHeading(path: RailPath, s: number, loop = 0) {
  const nose = path.at(s);
  let back = s - PLANE_LENGTH * 0.6;
  if (back < 0) {
    if (!loop) return nose.heading;
    back += loop;
  }
  const tail = path.at(back);
  return Math.atan2(nose.x - tail.x, nose.z - tail.z);
}

export interface PlanePose {
  /** nose position on the ground track and height of the nose gear */
  x: number;
  y: number;
  z: number;
  heading: number;
  /** nose up (rad) */
  pitch: number;
  livery: number;
  /** on the runway or taxiway (cars bump into it) */
  onGround: boolean;
}

export function departureAt(t: number): PlanePose {
  const k = Math.floor(t / DEPARTURE_CYCLE), u = t - k * DEPARTURE_CYCLE;
  const s = along(u);
  const p = ROUTE.at(s);
  const heading = followHeading(ROUTE, s);
  const y = height(s);
  const slope = (height(s + 1) - y);
  // the nose comes up a little before lift-off
  const rotate = Math.max(0, Math.min(1, (s - (S_LIFT - 70)) / 70)) * 0.13;
  const pitch = Math.max(rotate, Math.atan(slope));
  return { x: p.x, y, z: p.z, heading, pitch, livery: (k + 3) % 4, onGround: y < 2.5 };
}

/** The fuselage as an obstacle for cars while the aircraft is on the ground (none once it has lifted off). */
export function planeBoxes(p: PlanePose): MovingBox[] {
  if (!p.onGround) return [];
  const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
  return [{ x: p.x - fx * (PLANE_LENGTH / 2), z: p.z - fz * (PLANE_LENGTH / 2), heading: p.heading, length: PLANE_LENGTH, halfWidth: PLANE_HALF_WIDTH }];
}

/** taxi loop: down the taxiway, round the corner, up the apron edge behind the parked aircraft and back */
const LOOP_X = A.taxiway.x - 27;
const LOOP = railPath([[A.taxiway.x, 100], [A.taxiway.x, -220], [LOOP_X, -220], [LOOP_X, 400], [A.taxiway.x, 400], [A.taxiway.x, 100]], 12);
const LOOP_SPEED = 8;

export function taxiingAt(t: number): PlanePose {
  const s = (((t * LOOP_SPEED) % LOOP.length) + LOOP.length) % LOOP.length;
  const p = LOOP.at(s);
  return { x: p.x, y: 0, z: p.z, heading: followHeading(LOOP, s, LOOP.length), pitch: 0, livery: 1, onGround: true };
}

/** All moving aircraft at game time t. */
export function planesAt(t: number): PlanePose[] {
  return [departureAt(t), taxiingAt(t)];
}
