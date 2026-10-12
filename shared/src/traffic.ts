import { TRAFFIC_MODELS } from './cars';
import { approach, mulberry32 } from './math';
import { newCarState, type CarState } from './physics';
import { GRID, LANE_OFFSET, LINE_COUNT, LINES } from './town';

/**
 * Slow town traffic: kinematic cars (no physics) drive along the street grid on the right lane,
 * wait for a free intersection, turn at random and keep their distance to everything ahead –
 * including the players. They never push: players bounce off them (infinite mass).
 */

const DX = [1, 0, -1, 0];
const DZ = [0, 1, 0, -1];
/** right of direction k (forward (sin h, cos h), right (-cos h, sin h)) */
const right = (k: number) => (k + 1) % 4;
const left = (k: number) => (k + 3) % 4;

/** where cars stop in front of an intersection (distance from its centre) */
const STOP = 8;
const CRUISE = 8.3;
const TURN_SPEED = 4;
const THROUGH_SPEED = 6.5;
/** centre-to-centre distance kept to the car ahead */
const GAP = 7.5;
const LOOK = 30;

interface Piece {
  pts: number[][];
  /** cumulative length at each point */
  cum: number[];
  len: number;
  /** intersection node this piece crosses (turn pieces only) */
  node: number;
}

export interface TrafficCar {
  state: CarState;
  model: string;
  /** intersection node index the car is heading for and the direction it arrives in */
  a: number;
  b: number;
  dir: number;
  /** next direction chosen at node b */
  next: number;
  piece: Piece;
  turning: boolean;
  dist: number;
  speed: number;
  /** total distance driven (for tests) */
  odometer: number;
}

const node = (a: number, b: number) => b * LINE_COUNT + a;

function makePiece(pts: number[][], nodeIdx = -1): Piece {
  const cum = [0];
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  return { pts, cum, len: cum[cum.length - 1], node: nodeIdx };
}

function lanePoint(nx: number, nz: number, k: number, along: number) {
  const r = right(k);
  return [nx + DX[k] * along + DX[r] * LANE_OFFSET, nz + DZ[k] * along + DZ[r] * LANE_OFFSET];
}

/** Lane from node (a, b) in direction k up to the stop line of the next node. */
function straightPiece(a: number, b: number, k: number) {
  const x = LINES[a], z = LINES[b];
  return makePiece([lanePoint(x, z, k, STOP), lanePoint(x, z, k, GRID - STOP)]);
}

/** Through the intersection at node (a, b), arriving in direction k, leaving in direction k2. */
function turnPiece(a: number, b: number, k: number, k2: number) {
  const x = LINES[a], z = LINES[b];
  const p0 = lanePoint(x, z, k, -STOP);
  const p1 = lanePoint(x, z, k2, STOP);
  if (k === k2) return makePiece([p0, p1], node(a, b));
  // quadratic Bézier with the control point where both lanes meet
  const t = (p1[0] - p0[0]) * DX[k] + (p1[1] - p0[1]) * DZ[k];
  const c = [p0[0] + DX[k] * t, p0[1] + DZ[k] * t];
  const pts: number[][] = [];
  for (let s = 0; s <= 10; s++) {
    const u = s / 10, w0 = (1 - u) * (1 - u), w1 = 2 * u * (1 - u), w2 = u * u;
    pts.push([w0 * p0[0] + w1 * c[0] + w2 * p1[0], w0 * p0[1] + w1 * c[1] + w2 * p1[1]]);
  }
  return makePiece(pts, node(a, b));
}

function inGrid(a: number, b: number) {
  return a >= 0 && b >= 0 && a < LINE_COUNT && b < LINE_COUNT;
}

export interface Obstacle {
  x: number;
  z: number;
}

export class Traffic {
  readonly cars: TrafficCar[] = [];
  /** intersection node → id of the traffic car crossing it */
  private holder = new Map<number, string>();
  private rnd: () => number;

  constructor(count: number, seed = 99, avoid: Obstacle[] = []) {
    this.rnd = mulberry32(seed);
    let tries = 0;
    while (this.cars.length < count && tries++ < count * 50) {
      const a = Math.floor(this.rnd() * LINE_COUNT), b = Math.floor(this.rnd() * LINE_COUNT), k = Math.floor(this.rnd() * 4);
      if (!inGrid(a + DX[k], b + DZ[k])) continue;
      const piece = straightPiece(a, b, k);
      const dist = 5 + this.rnd() * (piece.len - 20);
      const [x, z] = this.pointAt(piece, dist);
      if (this.cars.some((c) => Math.hypot(c.state.x - x, c.state.z - z) < 15)) continue;
      if (avoid.some((o) => Math.hypot(o.x - x, o.z - z) < 30)) continue;
      const id = `traffic${this.cars.length}`;
      const car: TrafficCar = {
        state: newCarState(id, x, 0, z, Math.atan2(DX[k], DZ[k])),
        model: TRAFFIC_MODELS[Math.floor(this.rnd() * TRAFFIC_MODELS.length)],
        a: a + DX[k], b: b + DZ[k], dir: k, next: k, piece, turning: false, dist, speed: CRUISE * 0.6, odometer: 0,
      };
      car.next = this.chooseNext(car);
      this.cars.push(car);
    }
  }

  private chooseNext(c: TrafficCar) {
    const options = [c.dir, c.dir, left(c.dir), right(c.dir)].filter((k) => inGrid(c.a + DX[k], c.b + DZ[k]));
    if (options.length === 0) return (c.dir + 2) % 4;
    return options[Math.floor(this.rnd() * options.length)];
  }

  private pointAt(p: Piece, d: number) {
    let k = 1;
    while (k < p.pts.length - 1 && p.cum[k] < d) k++;
    const seg = p.cum[k] - p.cum[k - 1] || 1;
    const t = Math.min(1, Math.max(0, (d - p.cum[k - 1]) / seg));
    const A = p.pts[k - 1], B = p.pts[k];
    return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, (B[0] - A[0]) / seg, (B[1] - A[1]) / seg];
  }

  /** Free gap to the nearest car or player ahead in the same lane (Infinity if none). */
  private gapAhead(c: TrafficCar, others: Obstacle[]) {
    const s = c.state;
    // in an intersection only cars on the exit lane count, otherwise two cars could wait for each other
    let fx = Math.sin(s.heading), fz = Math.cos(s.heading), ox = s.x, oz = s.z, extra = 0;
    if (c.turning) {
      const end = c.piece.pts[c.piece.pts.length - 1];
      fx = DX[c.next];
      fz = DZ[c.next];
      ox = end[0];
      oz = end[1];
      extra = c.piece.len - c.dist;
    }
    let gap = Infinity;
    const consider = (x: number, z: number, isPlayer: boolean) => {
      // players inside the intersection are looked for in the driving direction, too
      const useOwn = c.turning && isPlayer;
      const bx = useOwn ? s.x : ox, bz = useOwn ? s.z : oz;
      const ax = useOwn ? Math.sin(s.heading) : fx, az = useOwn ? Math.cos(s.heading) : fz;
      const dx = x - bx, dz = z - bz;
      const ahead = dx * ax + dz * az;
      const lat = -dx * az + dz * ax;
      const add = useOwn ? 0 : extra;
      // on the exit lane, cars still waiting behind the intersection do not count
      if (!useOwn && c.turning && ahead < -2) return;
      if (ahead + add <= 0.5 || ahead > LOOK || Math.abs(lat) > 2.6) return;
      gap = Math.min(gap, ahead + add - GAP);
    };
    for (const o of this.cars) if (o !== c) consider(o.state.x, o.state.z, false);
    for (const o of others) consider(o.x, o.z, true);
    return gap;
  }

  /** Advance all traffic cars; `players` are positions of the human cars. */
  step(dt: number, players: Obstacle[]) {
    for (const c of this.cars) {
      let target = c.turning ? (c.dir === c.next ? THROUGH_SPEED : TURN_SPEED) : CRUISE;
      const gap = this.gapAhead(c, players);
      if (!c.turning) {
        const remaining = c.piece.len - c.dist;
        const n = node(c.a, c.b);
        // only the first car of the queue may reserve the intersection
        if (remaining < 14 && gap >= remaining && !this.holder.has(n)) this.holder.set(n, c.state.id);
        const mine = this.holder.get(n) === c.state.id;
        const slow = c.next === c.dir ? THROUGH_SPEED : TURN_SPEED;
        // brake towards the stop line, or to turning speed if the intersection is ours
        target = Math.min(target, mine ? Math.sqrt(slow * slow + 4 * remaining) : Math.sqrt(5 * Math.max(0, remaining - 0.3)));
      }
      if (gap < Infinity) target = Math.min(target, Math.sqrt(6 * Math.max(0, gap)));
      c.speed = target < c.speed ? approach(c.speed, target, 7 * dt) : approach(c.speed, target, 1.6 * dt);
      if (target === 0 && c.speed < 0.3) c.speed = 0;

      let d = c.dist + c.speed * dt;
      c.odometer += c.speed * dt;
      if (d >= c.piece.len) {
        d -= c.piece.len;
        if (!c.turning) {
          if (this.holder.get(node(c.a, c.b)) !== c.state.id) d = c.piece.len;
          else {
            c.piece = turnPiece(c.a, c.b, c.dir, c.next);
            c.turning = true;
          }
        } else {
          this.holder.delete(c.piece.node);
          c.dir = c.next;
          c.piece = straightPiece(c.a, c.b, c.dir);
          c.a += DX[c.dir];
          c.b += DZ[c.dir];
          c.turning = false;
          c.next = this.chooseNext(c);
        }
      }
      c.dist = Math.min(d, c.piece.len);
      const [x, z, tx, tz] = this.pointAt(c.piece, c.dist);
      const s = c.state;
      s.x = x;
      s.z = z;
      s.heading = Math.atan2(tx, tz);
      s.vx = tx * c.speed;
      s.vz = tz * c.speed;
      s.steer = 0;
      s.braking = target < c.speed - 0.5;
    }
  }
}
