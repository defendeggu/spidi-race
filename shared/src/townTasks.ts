import { mulberry32, wrapAngle } from './math';
import type { CarState } from './physics';
import type { TownMap } from './town';

export type TownTask = 'free' | 'stars' | 'parking';

export const STAR_RADIUS = 4;
/** parking: allowed offset across / along the bay, angle (either direction) and time standing still */
export const PARK_TOLERANCE = { across: 0.9, along: 1.5, angle: 0.35, hold: 1 };

export interface TaskTarget {
  x: number;
  z: number;
  heading: number;
  /** index into town.bays for the parking task */
  bay: number;
}

/**
 * One player's practice task: drive to a star, or park in a highlighted bay. When the goal is reached
 * the counter goes up and the next goal appears. Players never get the same goal at the same time.
 */
export class TaskTracker {
  target: TaskTarget | null = null;
  count = 0;
  /** 0..1 while the car stands correctly in the bay */
  parkProgress = 0;
  private rnd: () => number;

  constructor(private town: TownMap, readonly task: TownTask, seed: number) {
    this.rnd = mulberry32(seed);
  }

  /** Pick the next goal near the car, avoiding goals of the other players. */
  next(c: CarState, taken: (TaskTarget | null)[]) {
    this.parkProgress = 0;
    if (this.task === 'free') {
      this.target = null;
      return;
    }
    const busy = (x: number, z: number) => taken.some((t) => t && Math.hypot(t.x - x, t.z - z) < 1);
    if (this.task === 'stars') {
      // not too close, not too far: 80–350 m away
      const spots = this.town.starSpots.filter((s) => {
        const d = Math.hypot(s.x - c.x, s.z - c.z);
        return d > 80 && d < 350 && !busy(s.x, s.z);
      });
      const pool = spots.length > 0 ? spots : this.town.starSpots;
      const s = pool[Math.floor(this.rnd() * pool.length)];
      this.target = { x: s.x, z: s.z, heading: s.heading, bay: -1 };
      return;
    }
    const free = this.town.bays.map((b, i) => ({ b, i })).filter(({ b }) => b.parked < 0 && !busy(b.x, b.z));
    // usually on another parking lot, so the drive there is part of the exercise
    const here = this.town.blockAt(c.x, c.z);
    const elsewhere = free.filter(({ b }) => this.town.blockAt(b.x, b.z) !== here);
    const pool = elsewhere.length > 0 && this.rnd() < 0.8 ? elsewhere : free;
    const pick = pool[Math.floor(this.rnd() * pool.length)];
    this.target = { x: pick.b.x, z: pick.b.z, heading: pick.b.heading, bay: pick.i };
  }

  /** Returns true when the current goal was reached in this step. */
  update(c: CarState, dt: number): boolean {
    const t = this.target;
    if (!t) return false;
    const dx = c.x - t.x, dz = c.z - t.z;
    if (this.task === 'stars') return Math.hypot(dx, dz) < STAR_RADIUS;
    const fx = Math.sin(t.heading), fz = Math.cos(t.heading);
    const along = Math.abs(dx * fx + dz * fz), across = Math.abs(-dx * fz + dz * fx);
    const da = Math.abs(wrapAngle(c.heading - t.heading));
    const angle = Math.min(da, Math.PI - da);
    const still = Math.hypot(c.vx, c.vz) < 0.5;
    if (along < PARK_TOLERANCE.along && across < PARK_TOLERANCE.across && angle < PARK_TOLERANCE.angle && still) {
      this.parkProgress = Math.min(1, this.parkProgress + dt / PARK_TOLERANCE.hold);
    } else {
      this.parkProgress = 0;
    }
    return this.parkProgress >= 1;
  }
}
