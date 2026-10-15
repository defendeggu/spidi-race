import { hitKart, newKartState, SHIELD_TIME, TURBO_TIME, type ItemKind, type KartState } from './kart';
import { clamp, mulberry32, wrapAngle } from './math';
import { forwardSpeed, type CarState } from './physics';
import { WALL_OFFSET, type Track } from './track';

/**
 * Items of a kart race – the "host" logic: item boxes, the item roll, projectiles, mines and hits.
 * Deterministic (seeded), no DOM: the same class can later run on the game server and send its events
 * to the clients. The client only renders the state and reacts to the events.
 */

/** Chance of each item for the leader, the middle of the field and the last kart (percent). */
export const ITEM_WEIGHTS: Record<ItemKind, [number, number, number]> = {
  mine: [40, 15, 5],
  blaster: [35, 25, 10],
  shield: [20, 15, 10],
  homing: [5, 25, 30],
  turbo: [0, 20, 45],
};

export const ROLL_TIME = 1;
export const BOX_RESPAWN = 2;
const BOX_RADIUS = 2.2;
const HIT_RADIUS = 1.7;
const BLASTER_SPEED = 48;
const HOMING_SPEED = 42;
const PROJECTILE_LIFE = 8;
const MAX_BOUNCES = 3;
/** the shooter's own projectile cannot hit it right after firing */
const OWN_GRACE = 0.4;
const MINE_ARM = 0.5;
const MINE_LIFE = 60;

export interface ItemBox {
  x: number;
  y: number;
  z: number;
  /** seconds until it is back (0 = available) */
  respawn: number;
}

export interface Projectile {
  id: number;
  kind: 'blaster' | 'homing';
  owner: string;
  target: string | null;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  idx: number;
  age: number;
  bounces: number;
}

export interface Mine {
  id: number;
  owner: string;
  x: number;
  y: number;
  z: number;
  age: number;
}

export type ItemEvent =
  | { type: 'box'; box: number; car: string }
  | { type: 'granted'; car: string; item: ItemKind }
  | { type: 'use'; car: string; item: ItemKind }
  | { type: 'spawn'; id: number; kind: 'blaster' | 'homing' | 'mine'; owner: string }
  | { type: 'destroy'; id: number; reason: 'hit' | 'wall' | 'timeout' | 'blocked' }
  | { type: 'hit'; victim: string; by: string; item: ItemKind }
  | { type: 'blocked'; victim: string; by: string };

/** Weighted item for race position pos (1 = leader) of n karts. */
export function rollItem(pos: number, n: number, rnd: () => number): ItemKind {
  const f = n > 1 ? (pos - 1) / (n - 1) : 0.5;
  const kinds = Object.keys(ITEM_WEIGHTS) as ItemKind[];
  const w = kinds.map((k) => {
    const [a, b, c] = ITEM_WEIGHTS[k];
    return f < 0.5 ? a + (b - a) * (f / 0.5) : b + (c - b) * ((f - 0.5) / 0.5);
  });
  let r = rnd() * w.reduce((s, v) => s + v, 0);
  for (let i = 0; i < kinds.length; i++) {
    r -= w[i];
    if (r <= 0) return kinds[i];
  }
  return kinds[kinds.length - 1];
}

export class ItemWorld {
  readonly boxes: ItemBox[] = [];
  readonly karts = new Map<string, KartState>();
  readonly projectiles: Projectile[] = [];
  readonly mines: Mine[] = [];
  /** events of the last step(s); the consumer clears the list */
  readonly events: ItemEvent[] = [];
  private pending = new Set<string>();
  private nextId = 1;
  private rnd: () => number;
  /** projectiles are pooled: no garbage while racing */
  private pool: Projectile[] = [];

  constructor(private track: Track, ids: string[], seed = 1) {
    this.rnd = mulberry32(seed);
    for (const id of ids) this.karts.set(id, newKartState(id));
    // rows of four boxes across the road at 20 %, 55 % and 85 % of the lap
    for (const f of [0.2, 0.55, 0.85]) {
      const s = track.length * f;
      const i = Math.floor(s / track.ds) % track.n;
      for (const lat of [-0.6, -0.2, 0.2, 0.6]) {
        const p = track.pointAt(s, lat * track.hw[i]);
        this.boxes.push({ x: p.x, y: p.y, z: p.z, respawn: 0 });
      }
    }
  }

  kart(id: string) {
    return this.karts.get(id)!;
  }

  /** Request to use the held item (applied in the next step). */
  use(id: string) {
    const ks = this.karts.get(id);
    if (ks?.item && ks.spin === 0) this.pending.add(id);
  }

  /**
   * Advance by dt. cars: all karts; position(id): race position (1 = leader);
   * ahead(id): the kart directly in front in the race (target for homing projectiles), or null.
   */
  step(dt: number, cars: CarState[], position: (id: string) => number, ahead: (id: string) => string | null) {
    const n = cars.length;
    const byId = new Map(cars.map((c) => [c.id, c]));

    // item boxes
    for (const b of this.boxes) b.respawn = Math.max(0, b.respawn - dt);
    for (const c of cars) {
      const ks = this.karts.get(c.id);
      if (!ks) continue;
      if (ks.rolling > 0) {
        ks.rolling -= dt;
        if (ks.rolling <= 0) {
          ks.rolling = 0;
          ks.item = ks.rollItem;
          ks.rollItem = null;
          this.events.push({ type: 'granted', car: c.id, item: ks.item! });
        }
      }
      this.boxes.forEach((b, i) => {
        if (b.respawn > 0) return;
        if (Math.hypot(b.x - c.x, b.z - c.z) > BOX_RADIUS || Math.abs(b.y - c.y) > 3) return;
        b.respawn = BOX_RESPAWN;
        this.events.push({ type: 'box', box: i, car: c.id });
        // only karts with an empty slot get something
        if (!ks.item && ks.rolling === 0) {
          ks.rolling = ROLL_TIME;
          ks.rollItem = rollItem(position(c.id), n, this.rnd);
        }
      });
    }

    // items used this step
    for (const id of this.pending) this.fire(id, byId.get(id), ahead(id));
    this.pending.clear();

    // projectiles
    for (let k = this.projectiles.length - 1; k >= 0; k--) {
      const p = this.projectiles[k];
      p.age += dt;
      if (p.kind === 'homing') this.steer(p, byId, dt);
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      const pr = this.track.project(p.x, p.z, p.idx);
      p.idx = pr.idx;
      p.y = pr.y + 0.6;
      // bounce off the barriers
      const wall = pr.halfWidth + WALL_OFFSET - 0.4;
      if (Math.abs(pr.lat) > wall) {
        const sgn = Math.sign(pr.lat);
        p.x -= pr.rx * (pr.lat - sgn * wall);
        p.z -= pr.rz * (pr.lat - sgn * wall);
        const vn = p.vx * pr.rx + p.vz * pr.rz;
        if (vn * sgn > 0) {
          p.vx -= 2 * vn * pr.rx;
          p.vz -= 2 * vn * pr.rz;
          if (++p.bounces > MAX_BOUNCES) {
            this.remove(k, 'wall');
            continue;
          }
        }
      }
      if (p.age > PROJECTILE_LIFE) {
        this.remove(k, 'timeout');
        continue;
      }
      for (const c of cars) {
        if (c.id === p.owner && p.age < OWN_GRACE) continue;
        if (Math.hypot(c.x - p.x, c.z - p.z) > HIT_RADIUS || Math.abs(c.y + 0.6 - p.y) > 2.5) continue;
        const res = this.hit(c.id, p.owner, p.kind);
        if (res === 'immune') continue;
        this.remove(k, res === 'blocked' ? 'blocked' : 'hit');
        break;
      }
    }

    // mines
    for (let k = this.mines.length - 1; k >= 0; k--) {
      const m = this.mines[k];
      m.age += dt;
      if (m.age > MINE_LIFE) {
        this.mines.splice(k, 1);
        this.events.push({ type: 'destroy', id: m.id, reason: 'timeout' });
        continue;
      }
      if (m.age < MINE_ARM) continue;
      for (const c of cars) {
        const ks = this.karts.get(c.id);
        if (!ks || ks.hop > 0 || c.airborne) continue;
        if (Math.hypot(c.x - m.x, c.z - m.z) > HIT_RADIUS || Math.abs(c.y - m.y) > 2) continue;
        const res = this.hit(c.id, m.owner, 'mine');
        if (res === 'immune') continue;
        this.mines.splice(k, 1);
        this.events.push({ type: 'destroy', id: m.id, reason: res === 'blocked' ? 'blocked' : 'hit' });
        break;
      }
    }
  }

  private hit(victim: string, by: string, item: ItemKind) {
    const ks = this.karts.get(victim)!;
    const res = hitKart(ks);
    if (res === 'hit') {
      this.events.push({ type: 'hit', victim, by, item });
      const shooter = this.karts.get(by);
      if (shooter && by !== victim) shooter.hitsGiven++;
    } else if (res === 'blocked') this.events.push({ type: 'blocked', victim, by });
    return res;
  }

  private fire(id: string, c: CarState | undefined, target: string | null) {
    const ks = this.karts.get(id);
    if (!ks?.item || !c) return;
    const item = ks.item;
    ks.item = null;
    this.events.push({ type: 'use', car: id, item });
    const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
    if (item === 'turbo') ks.boost = Math.max(ks.boost, TURBO_TIME);
    else if (item === 'shield') ks.shield = SHIELD_TIME;
    else if (item === 'mine') {
      const m: Mine = { id: this.nextId++, owner: id, x: c.x - fx * 3, y: c.y, z: c.z - fz * 3, age: 0 };
      this.mines.push(m);
      this.events.push({ type: 'spawn', id: m.id, kind: 'mine', owner: id });
    } else {
      const speed = (item === 'blaster' ? BLASTER_SPEED : HOMING_SPEED) + Math.max(0, forwardSpeed(c));
      const p = this.pool.pop() ?? ({} as Projectile);
      Object.assign(p, {
        id: this.nextId++, kind: item, owner: id, target: item === 'homing' ? target : null,
        x: c.x + fx * 2.5, y: c.y + 0.6, z: c.z + fz * 2.5, vx: fx * speed, vz: fz * speed, idx: c.idx, age: 0, bounces: 0,
      });
      this.projectiles.push(p);
      this.events.push({ type: 'spawn', id: p.id, kind: item, owner: id });
    }
  }

  /** Homing: turn towards the target if it is near, otherwise follow the road ahead. */
  private steer(p: Projectile, byId: Map<string, CarState>, dt: number) {
    const t = p.target ? byId.get(p.target) : undefined;
    let ax: number, az: number;
    if (t && Math.hypot(t.x - p.x, t.z - p.z) < 45) {
      ax = t.x;
      az = t.z;
    } else {
      const pr = this.track.project(p.x, p.z, p.idx);
      const ahead = this.track.pointAt(pr.s + 20, 0);
      ax = ahead.x;
      az = ahead.z;
    }
    const speed = Math.hypot(p.vx, p.vz);
    const h = Math.atan2(p.vx, p.vz);
    const want = Math.atan2(ax - p.x, az - p.z);
    const nh = h + clamp(wrapAngle(want - h), -3 * dt, 3 * dt);
    p.vx = Math.sin(nh) * speed;
    p.vz = Math.cos(nh) * speed;
  }

  private remove(k: number, reason: 'hit' | 'wall' | 'timeout' | 'blocked') {
    const [p] = this.projectiles.splice(k, 1);
    this.events.push({ type: 'destroy', id: p.id, reason });
    this.pool.push(p);
  }
}
