import { clamp, mulberry32, wrapAngle } from './math';
import type { ItemWorld } from './items';
import { forwardSpeed, type CarInput, type CarState } from './physics';
import { GRID, LINE_COUNT, LINES, type Spot, type TownMap } from './town';

/**
 * Kart battle in the practice town: every kart has three balloons, each hit costs one, falling into
 * the harbour costs all of them. The last kart with balloons wins – or, after three minutes, the one
 * with the most balloons.
 */

export const BATTLE_BALLOONS = 3;
export const BATTLE_SECONDS = 180;
const COUNTDOWN = 3;

export type BattlePhase = 'countdown' | 'running' | 'finished';

export interface BattleRow {
  id: string;
  balloons: number;
  /** 1 = winner; karts with the same number of balloons share a place */
  place: number;
  hitsGiven: number;
}

/**
 * Start positions: intersections around the town centre, facing the middle – ones without an item box
 * (the boxes stand on intersections with an even index sum).
 */
export function battleSpawn(k: number): Spot {
  const nodes = [[2, 3], [7, 6], [2, 7], [7, 2], [4, 5], [5, 4]];
  const [a, b] = nodes[k % nodes.length];
  const x = LINES[a], z = LINES[b];
  return { x, z, heading: Math.atan2(-x, -z) };
}

export class BattleSession {
  phase: BattlePhase = 'countdown';
  countdown = COUNTDOWN;
  time = 0;
  readonly balloons = new Map<string, number>();
  /** ids in the order they were eliminated */
  readonly out: string[] = [];

  constructor(readonly ids: string[]) {
    for (const id of ids) this.balloons.set(id, BATTLE_BALLOONS);
  }

  get remaining() {
    return Math.max(0, BATTLE_SECONDS - this.time);
  }

  alive(id: string) {
    return (this.balloons.get(id) ?? 0) > 0;
  }

  /** A kart was hit: one balloon less. Returns true if it is out now. */
  hit(id: string) {
    if (this.phase !== 'running' || !this.alive(id)) return false;
    const n = this.balloons.get(id)! - 1;
    this.balloons.set(id, n);
    if (n <= 0) this.out.push(id);
    this.checkEnd();
    return n <= 0;
  }

  /** Fell into the water: all balloons gone. */
  eliminate(id: string) {
    if (!this.alive(id)) return;
    this.balloons.set(id, 0);
    this.out.push(id);
    this.checkEnd();
  }

  step(dt: number) {
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.countdown = 0;
        this.phase = 'running';
      }
      return;
    }
    if (this.phase !== 'running') return;
    this.time += dt;
    if (this.time >= BATTLE_SECONDS) {
      this.time = BATTLE_SECONDS;
      this.phase = 'finished';
    }
  }

  private checkEnd() {
    if (this.ids.filter((id) => this.alive(id)).length <= 1) this.phase = 'finished';
  }

  /** Ranking: most balloons first, then who lasted longer. */
  ranking(hitsGiven: (id: string) => number = () => 0): BattleRow[] {
    const order = [...this.ids].sort((a, b) => {
      const d = this.balloons.get(b)! - this.balloons.get(a)!;
      if (d) return d;
      return this.out.indexOf(b) - this.out.indexOf(a);
    });
    let place = 0, last = -1;
    return order.map((id, i) => {
      const n = this.balloons.get(id)!;
      // alive karts with equal balloons share a place, eliminated karts are ranked by elimination
      if (n !== last || n === 0) place = i + 1;
      last = n;
      return { id, balloons: n, place, hitsGiven: hitsGiven(id) };
    });
  }

  /** The winner's id, or null for a draw. */
  winner() {
    const r = this.ranking();
    return r.length > 1 && r[1].place === 1 ? null : r[0].id;
  }
}

/**
 * Bot for the kart battle: drives along the street grid (Manhattan route over the intersections) to the
 * nearest item box while it has nothing, otherwise hunts the nearest opponent and fires when it has a
 * shot. Backs up when stuck.
 */
export class BattleBot {
  private route: { x: number; z: number }[] = [];
  private replan = 0;
  private stuck = 0;
  private reverse = 0;
  private held = 0;
  /** reaction time before using a new item (varies per bot and item) */
  private delay = 0.6;
  private rnd: () => number;

  constructor(seed: number) {
    this.rnd = mulberry32(seed * 977 + 3);
  }

  update(c: CarState, town: TownMap, items: ItemWorld, cars: CarState[], alive: (id: string) => boolean, dt: number): { input: CarInput; use: boolean } {
    const ks = items.kart(c.id);
    const vf = forwardSpeed(c);
    const others = cars.filter((o) => o !== c && alive(o.id));

    // where to: an item box (empty slot) or the nearest opponent
    this.replan -= dt;
    if (this.replan <= 0 || this.route.length === 0) {
      this.replan = 1;
      let target: { x: number; z: number } | null = null;
      if (!ks.item && ks.rolling === 0) {
        let best = Infinity;
        for (const b of items.boxes) {
          if (b.respawn > 0) continue;
          const d = Math.abs(b.x - c.x) + Math.abs(b.z - c.z);
          if (d < best) {
            best = d;
            target = b;
          }
        }
      }
      if (!target) {
        let best = Infinity;
        for (const o of others) {
          const d = Math.hypot(o.x - c.x, o.z - c.z);
          if (d < best) {
            best = d;
            target = o;
          }
        }
      }
      this.route = target ? this.plan(c, target) : [];
    }
    while (this.route.length > 1 && Math.hypot(this.route[0].x - c.x, this.route[0].z - c.z) < 9) this.route.shift();
    const wp = this.route[0] ?? { x: c.x, z: c.z };

    // steering and speed towards the waypoint, slower before a turn
    const err = wrapAngle(Math.atan2(wp.x - c.x, wp.z - c.z) - c.heading);
    let steer = clamp(-err * 2.2, -1, 1);
    const dist = Math.hypot(wp.x - c.x, wp.z - c.z);
    let vTarget = 30;
    if (this.route.length > 1) {
      const n = this.route[1];
      const turn = Math.abs(wrapAngle(Math.atan2(n.x - wp.x, n.z - wp.z) - Math.atan2(wp.x - c.x, wp.z - c.z)));
      if (turn > 0.6 && dist < 30) vTarget = 11;
    }
    if (Math.abs(err) > 0.8) vTarget = Math.min(vTarget, 9);
    let throttle = vf < vTarget ? 1 : 0, brake = vf > vTarget + 3 ? 0.7 : 0;

    // stuck against a wall: back up for a second
    if (this.reverse > 0) {
      this.reverse -= dt;
      steer = -steer;
      throttle = 0;
      brake = 1;
    } else if (Math.abs(vf) < 1.5 && ks.spin === 0) {
      this.stuck += dt;
      if (this.stuck > 1.2) {
        this.stuck = 0;
        this.reverse = 1;
      }
    } else this.stuck = 0;

    // items
    let use = false;
    if (ks.item) {
      this.held += dt;
      const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
      let cone = false, behind = false, near = Infinity;
      for (const o of others) {
        const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz);
        near = Math.min(near, d);
        const along = dx * fx + dz * fz, side = Math.abs(-dx * fz + dz * fx);
        if (along > 0 && along < 50 && side < Math.max(2, along * 0.15)) cone = true;
        if (along < 0 && d < 15) behind = true;
      }
      const wait = this.held > this.delay;
      switch (ks.item) {
        case 'blaster': use = wait && cone; break;
        case 'homing': use = wait && near < 70; break;
        case 'mine': use = wait && (behind || this.held > 8); break;
        case 'turbo': use = wait && dist > 40 && Math.abs(err) < 0.2; break;
        case 'shield': use = wait && near < 30; break;
      }
      if (this.held > 15) use = true;
      if (use) {
        this.held = 0;
        this.delay = 0.4 + this.rnd() * 1.2;
      }
    } else this.held = 0;
    return { input: { throttle, brake, steer, handbrake: false }, use };
  }

  /** Waypoints: the nearest intersection, then along the grid (x first, then z) to the target. */
  private plan(c: CarState, t: { x: number; z: number }) {
    const node = (v: number) => clamp(Math.round((v - LINES[0]) / GRID), 0, LINE_COUNT - 1);
    let ax = node(c.x), az = node(c.z);
    const bx = node(t.x), bz = node(t.z);
    const pts: { x: number; z: number }[] = [{ x: LINES[ax], z: LINES[az] }];
    while (ax !== bx) {
      ax += Math.sign(bx - ax);
      pts.push({ x: LINES[ax], z: LINES[az] });
    }
    while (az !== bz) {
      az += Math.sign(bz - az);
      pts.push({ x: LINES[ax], z: LINES[az] });
    }
    pts.push({ x: t.x, z: t.z });
    // skip the first node if we are already past it towards the second
    if (pts.length > 2) {
      const [p0, p1] = pts;
      const toNext = Math.hypot(p1.x - c.x, p1.z - c.z), segment = Math.hypot(p1.x - p0.x, p1.z - p0.z);
      if (toNext < segment) pts.shift();
    }
    return pts;
  }
}
