import type { CarSpec } from './cars';
import { clamp, mulberry32, wrapAngle } from './math';
import { CIRCLE_R, driveCar, newCarState, updateGearbox, type CarInput, type CarState, type DriveGround } from './physics';
import { SURFACE_PROPS, type Surface } from './track';

/**
 * The open practice town ("Spidi-Stadt"): 1 × 1 km, flat, a grid of two-lane streets every 100 m
 * with right-hand traffic, sidewalks and 9 × 9 blocks. Everything is deterministic so client
 * (rendering) and tests see the same map.
 */

/** the town spans -TOWN_HALF..TOWN_HALF in x and z; a wall surrounds it */
export const TOWN_HALF = 500;
/** distance between parallel streets */
export const GRID = 100;
/** number of streets per axis */
export const LINE_COUNT = 10;
/** half width of a street (two lanes) */
export const ROAD_HW = 5;
/** lateral offset of a lane centre from the street centre (right-hand traffic) */
export const LANE_OFFSET = 2.5;
export const SIDEWALK = 3;
/** half size of a block including its sidewalk */
export const BLOCK_HALF = GRID / 2 - ROAD_HW;
/** half size of the block interior (inside the sidewalk) */
export const BLOCK_INNER = BLOCK_HALF - SIDEWALK;

/** street centre lines (same values for x and z) */
export const LINES = Array.from({ length: LINE_COUNT }, (_, k) => -((LINE_COUNT - 1) * GRID) / 2 + k * GRID);
const OUTER = LINES[LINE_COUNT - 1] + ROAD_HW + SIDEWALK;

export type BlockKind = 'tower' | 'shop' | 'house' | 'park' | 'parking' | 'practice';

export interface Block {
  i: number;
  j: number;
  cx: number;
  cz: number;
  kind: BlockKind;
}

export interface BoxObstacle {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** large boxes (buildings, wall) turn the car along their face, like a guard rail */
  solid: boolean;
}

export interface CircleObstacle {
  x: number;
  z: number;
  r: number;
  kind: 'tree' | 'cone' | 'lamp';
}

/** A marked parking bay. heading points into the bay (the way a car facing the back wall would look). */
export interface ParkingBay {
  x: number;
  z: number;
  heading: number;
  /** a parked car stands here (index into TRAFFIC_MODELS for the client), -1 = free */
  parked: number;
}

export interface Spot {
  x: number;
  z: number;
  heading: number;
}

/** A building with its footprint (already rotated: w along x, d along z). */
export interface Building {
  model: string;
  /** scale of the Kenney model (its units are ~1 m) */
  scale: number;
  x: number;
  z: number;
  /** rotation about y; the model front (+z) faces the street */
  rot: number;
  w: number;
  d: number;
  h: number;
}

/** Kenney model footprints in model units: [name, width (x), depth (z), height]. */
type ModelSize = [string, number, number, number];
const SHOP_MODELS: ModelSize[] = [
  ['building-a', 0.88, 0.94, 1.29], ['building-b', 0.97, 0.94, 1.29], ['building-c', 0.88, 1.09, 0.89],
  ['building-d', 0.84, 0.9, 1.29], ['building-e', 1.64, 1.01, 0.89], ['building-f', 0.84, 1.03, 1.69],
  ['building-g', 0.97, 0.92, 1.69], ['building-h', 0.88, 1.01, 1.29], ['building-i', 1.24, 1.3, 1.68],
  ['building-j', 2.08, 1.34, 1.69], ['building-k', 2.08, 0.94, 1.47],
];
const TOWER_MODELS: ModelSize[] = [
  ['building-skyscraper-a', 1.36, 1.36, 2.88], ['building-skyscraper-b', 1.36, 1.36, 4.48],
  ['building-skyscraper-c', 1.28, 1.39, 4.08], ['building-skyscraper-d', 1.28, 1.39, 5.47],
  ['building-skyscraper-e', 1.29, 1.24, 4.08], ['building-l', 1.37, 1.4, 2.27], ['building-m', 1.24, 1.24, 3.15],
  ['building-n', 2.32, 1.82, 2.48],
];
const HOUSE_MODELS: ModelSize[] = [
  ['building-type-a', 1.3, 1.03, 0.83], ['building-type-c', 1.29, 1.03, 1.03], ['building-type-f', 1.43, 1.41, 1.14],
  ['building-type-k', 0.92, 1.02, 1.15], ['building-type-n', 1.78, 1.38, 1.14], ['building-type-t', 1.31, 1.41, 1.16],
];

/**
 * How buildings line the block edges: model set and scale, front garden (setback) and the gaps
 * between neighbours, wide enough to drive into the gardens and courtyards.
 */
const EDGE_STYLE = {
  shop: { models: SHOP_MODELS, scale: 14, setback: 0, gap: [5, 10] },
  tower: { models: TOWER_MODELS, scale: 15, setback: 0, gap: [7, 13] },
  house: { models: HOUSE_MODELS, scale: 7.5, setback: 6, gap: [5, 10] },
} as const;

const CELL = 50;

const BLOCK_PLAN = [
  // one row per block row j (z), one letter per block column i (x)
  'hhhhhhhhh',
  'hXPshhpsh',
  'hsssssPsh',
  'hhsTTTshh',
  'hpsTpTsph',
  'hPsTTTshh',
  'hssssssPh',
  'hhphPhshh',
  'hhhhhhhhh',
];
const PLAN_KIND: Record<string, BlockKind> = { h: 'house', s: 'shop', T: 'tower', p: 'park', P: 'parking', X: 'practice' };

export class TownMap {
  readonly blocks: Block[] = [];
  readonly boxes: BoxObstacle[] = [];
  readonly circles: CircleObstacle[] = [];
  readonly bays: ParkingBay[] = [];
  readonly buildings: Building[] = [];
  private lots = 0;
  /** places where stars can appear */
  readonly starSpots: Spot[] = [];
  private grid = new Map<number, { boxes: BoxObstacle[]; circles: CircleObstacle[] }>();

  constructor(readonly seed = 2024) {
    const rnd = mulberry32(seed);
    for (let j = 0; j < LINE_COUNT - 1; j++) {
      for (let i = 0; i < LINE_COUNT - 1; i++) {
        const kind = PLAN_KIND[BLOCK_PLAN[j][i]];
        const b: Block = { i, j, cx: LINES[i] + GRID / 2, cz: LINES[j] + GRID / 2, kind };
        this.blocks.push(b);
        this.buildBlock(b, rnd);
      }
    }
    // street lamps at the block corners, on the sidewalk
    const lampOff = BLOCK_INNER + 1;
    for (const b of this.blocks) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.circles.push({ x: b.cx + sx * lampOff, z: b.cz + sz * lampOff, r: 0.25, kind: 'lamp' });
    }
    // stars: middle of every street section (on the lane) and in parks / squares
    for (let a = 0; a < LINE_COUNT; a++) {
      for (let k = 0; k < LINE_COUNT - 1; k++) {
        const mid = LINES[k] + GRID / 2;
        this.starSpots.push({ x: LINES[a], z: mid, heading: 0 }, { x: mid, z: LINES[a], heading: Math.PI / 2 });
      }
    }
    // the wall around the town; trees on the grass strip in front of it
    const W = TOWN_HALF, T = 4;
    this.boxes.push(
      { minX: -W - T, maxX: W + T, minZ: W, maxZ: W + T, solid: true },
      { minX: -W - T, maxX: W + T, minZ: -W - T, maxZ: -W, solid: true },
      { minX: W, maxX: W + T, minZ: -W, maxZ: W, solid: true },
      { minX: -W - T, maxX: -W, minZ: -W, maxZ: W, solid: true },
    );
    for (let k = 0; k < 160; k++) {
      const along = (rnd() * 2 - 1) * (W - 8);
      const inset = W - 6 - rnd() * 22;
      const side = k % 4;
      const x = side === 0 ? along : side === 1 ? along : side === 2 ? inset : -inset;
      const z = side === 0 ? inset : side === 1 ? -inset : along;
      if (this.circles.some((c) => c.kind === 'tree' && Math.hypot(c.x - x, c.z - z) < 7)) continue;
      this.circles.push({ x, z, r: 0.6, kind: 'tree' });
    }

    for (const o of this.boxes) this.insert(o.minX, o.maxX, o.minZ, o.maxZ, (c) => c.boxes.push(o));
    for (const o of this.circles) this.insert(o.x - o.r, o.x + o.r, o.z - o.r, o.z + o.r, (c) => c.circles.push(o));
  }

  private buildBlock(b: Block, rnd: () => number) {
    const { cx, cz } = b;
    const I = BLOCK_INNER;
    switch (b.kind) {
      case 'tower':
      case 'shop':
      case 'house': {
        this.blockEdges(b, rnd);
        if (b.kind === 'tower') this.addBuilding(TOWER_MODELS[Math.floor(rnd() * 5)], 15, cx, cz, Math.floor(rnd() * 4) * (Math.PI / 2));
        else if (this.buildingsFree(cx, cz, 8)) this.starSpots.push({ x: cx, z: cz, heading: 0 });
        if (b.kind === 'house') {
          // trees in the back gardens
          for (let k = 0; k < 12; k++) {
            const x = cx + (rnd() * 2 - 1) * 26, z = cz + (rnd() * 2 - 1) * 26;
            if (Math.hypot(x - cx, z - cz) < 10 || !this.buildingsFree(x, z, 4)) continue;
            if (this.circles.some((c) => Math.hypot(c.x - x, c.z - z) < 10)) continue;
            this.circles.push({ x, z, r: 0.6, kind: 'tree' });
          }
        }
        break;
      }
      case 'park': {
        this.starSpots.push({ x: cx, z: cz, heading: 0 });
        for (let k = 0; k < 60; k++) {
          const x = cx + (rnd() * 2 - 1) * (I - 3), z = cz + (rnd() * 2 - 1) * (I - 3);
          // keep a meadow in the middle and paths along the axes free
          if (Math.hypot(x - cx, z - cz) < 14 || Math.abs(x - cx) < 4 || Math.abs(z - cz) < 4) continue;
          if (this.circles.some((c) => Math.hypot(c.x - x, c.z - z) < 9)) continue;
          this.circles.push({ x, z, r: 0.6, kind: 'tree' });
        }
        break;
      }
      case 'parking': {
        // four rows of bays with aisles in between; every other lot is turned by 90°
        const turned = this.lots++ % 2 === 1;
        const rows = [-29, -11, 11, 29];
        rows.forEach((r, ri) => {
          const heading = (ri % 2 === 0 ? Math.PI : 0) + (turned ? Math.PI / 2 : 0);
          for (let k = 0; k < 14; k++) {
            const a = (k - 6.5) * PARKING_BAY.width;
            const x = cx + (turned ? r : a), z = cz + (turned ? a : r);
            const parked = rnd() < 0.35 ? Math.floor(rnd() * 7) : -1;
            this.bays.push({ x, z, heading, parked });
            const hx = turned ? 2.3 : 1.2, hz = turned ? 1.2 : 2.3;
            if (parked >= 0) this.boxes.push({ minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz, solid: false });
          }
        });
        this.starSpots.push({ x: cx, z: cz, heading: Math.PI / 2 });
        break;
      }
      case 'practice': {
        // slalom line and a circle of cones on an empty square
        for (let k = 0; k < 6; k++) this.circles.push({ x: cx - 25 + k * 10, z: cz - 8, r: 0.35, kind: 'cone' });
        for (let k = 0; k < 14; k++) {
          const a = (k / 14) * Math.PI * 2;
          this.circles.push({ x: cx + Math.cos(a) * 13, z: cz + 22 + Math.sin(a) * 13, r: 0.35, kind: 'cone' });
        }
        this.starSpots.push({ x: cx + 28, z: cz + 22, heading: 0 });
        break;
      }
    }
  }

  /**
   * Buildings side by side along the four block edges, fronts facing the street, with gaps to drive
   * through. East/west rows stop short of the corners so they do not collide with north/south rows.
   */
  private blockEdges(b: Block, rnd: () => number) {
    const st = EDGE_STYLE[b.kind as keyof typeof EDGE_STYLE];
    const I = BLOCK_INNER;
    const maxDepth = Math.max(...st.models.map((m) => m[2])) * st.scale;
    const sides = [
      { rot: 0, fx: 0, fz: 1 },
      { rot: Math.PI, fx: 0, fz: -1 },
      { rot: Math.PI / 2, fx: 1, fz: 0 },
      { rot: -Math.PI / 2, fx: -1, fz: 0 },
    ];
    for (const s of sides) {
      const end = I - (s.fx !== 0 ? st.setback + maxDepth + st.gap[0] : 0);
      let cursor = -end + rnd() * 3;
      for (let guard = 0; guard < 20; guard++) {
        const m = st.models[Math.floor(rnd() * st.models.length)];
        const w = m[1] * st.scale, d = m[2] * st.scale;
        if (cursor + w > end) break;
        const along = cursor + w / 2;
        const front = I - st.setback - d / 2;
        // along runs in x for north/south rows and in z for east/west rows
        this.addBuilding(m, st.scale, b.cx + (s.fx !== 0 ? s.fx * front : along), b.cz + (s.fx !== 0 ? along : s.fz * front), s.rot);
        cursor += w + st.gap[0] + rnd() * (st.gap[1] - st.gap[0]);
      }
    }
  }

  private addBuilding(m: ModelSize, scale: number, x: number, z: number, rot: number) {
    const turned = Math.abs(Math.sin(rot)) > 0.5;
    const w = (turned ? m[2] : m[1]) * scale, d = (turned ? m[1] : m[2]) * scale;
    this.buildings.push({ model: m[0], scale, x, z, rot, w, d, h: m[3] * scale });
    // the collision box is a little smaller than the model (roofs and balconies stick out)
    const ix = Math.max(0.5, w / 2 - 0.3), iz = Math.max(0.5, d / 2 - 0.3);
    this.boxes.push({ minX: x - ix, maxX: x + ix, minZ: z - iz, maxZ: z + iz, solid: true });
  }

  private buildingsFree(x: number, z: number, r: number) {
    return this.buildings.every((b) => Math.abs(x - b.x) > b.w / 2 + r || Math.abs(z - b.z) > b.d / 2 + r);
  }

  private insert(minX: number, maxX: number, minZ: number, maxZ: number, add: (c: { boxes: BoxObstacle[]; circles: CircleObstacle[] }) => void) {
    for (let gx = Math.floor(minX / CELL); gx <= Math.floor(maxX / CELL); gx++) {
      for (let gz = Math.floor(minZ / CELL); gz <= Math.floor(maxZ / CELL); gz++) {
        const key = gx * 1000 + gz;
        let c = this.grid.get(key);
        if (!c) this.grid.set(key, (c = { boxes: [], circles: [] }));
        add(c);
      }
    }
  }

  private cell(x: number, z: number) {
    return this.grid.get(Math.floor(x / CELL) * 1000 + Math.floor(z / CELL));
  }

  get practice() {
    return this.blocks.find((b) => b.kind === 'practice')!;
  }

  /** Start positions on the practice square, facing east (+x). */
  spawn(k: number): Spot {
    const p = this.practice;
    return { x: p.cx - 30, z: p.cz - 32 + k * 7, heading: Math.PI / 2 };
  }

  /**
   * Duel start positions in opposite corners of the town, on the right lane of the outer street
   * (point-symmetric, so neither player has an advantage).
   */
  duelSpawn(k: number): Spot {
    const e = LINES[LINE_COUNT - 1], start = e - 30;
    return k === 0
      ? { x: -e - LANE_OFFSET, z: -start, heading: 0 }
      : { x: e + LANE_OFFSET, z: start, heading: Math.PI };
  }

  blockAt(x: number, z: number): Block | undefined {
    const i = Math.floor((x - LINES[0]) / GRID), j = Math.floor((z - LINES[0]) / GRID);
    if (i < 0 || j < 0 || i >= LINE_COUNT - 1 || j >= LINE_COUNT - 1) return undefined;
    return this.blocks[j * (LINE_COUNT - 1) + i];
  }

  /** Distance from (x, z) to the nearest street centre line (either axis). */
  roadDistance(x: number, z: number) {
    const near = (v: number) => {
      const k = clamp(Math.round((v - LINES[0]) / GRID), 0, LINE_COUNT - 1);
      return Math.abs(v - LINES[k]);
    };
    // outside the outer streets only the outer street itself counts
    const inX = Math.abs(z) <= LINES[LINE_COUNT - 1] + ROAD_HW, inZ = Math.abs(x) <= LINES[LINE_COUNT - 1] + ROAD_HW;
    return Math.min(inX ? near(x) : Infinity, inZ ? near(z) : Infinity);
  }

  surfaceAt(x: number, z: number): Surface {
    if (this.roadDistance(x, z) <= ROAD_HW + SIDEWALK) return 'asphalt';
    if (Math.abs(x) > OUTER || Math.abs(z) > OUTER) return 'dirt';
    const b = this.blockAt(x, z);
    // lawns in parks and gardens
    return b && (b.kind === 'park' || b.kind === 'house') ? 'dirt' : 'asphalt';
  }

  /** True if a circle of radius r at (x, z) touches no obstacle. */
  isFree(x: number, z: number, r: number) {
    for (const o of this.boxes) {
      const qx = clamp(x, o.minX, o.maxX), qz = clamp(z, o.minZ, o.maxZ);
      if (Math.hypot(x - qx, z - qz) < r) return false;
    }
    for (const o of this.circles) if (Math.hypot(x - o.x, z - o.z) < r + o.r) return false;
    return true;
  }

  /**
   * Push the car out of buildings, trees, cones, lamps and the wall (two circles per car, like car-vs-car).
   * The car bounces off and scrapes along like at a guard rail. Returns the impact speed.
   */
  collide(c: CarState, spec: CarSpec): number {
    const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
    const off = Math.max(1.2, spec.shape.length / 2 - CIRCLE_R);
    let impact = 0;
    for (const side of [1, -1]) {
      for (let iter = 0; iter < 2; iter++) {
        const px = c.x + fx * off * side, pz = c.z + fz * off * side;
        const cell = this.cell(px, pz);
        let hit = false;
        // look at the neighbouring cells too: the circle can reach over a cell border
        const cells = [cell];
        for (const [dx, dz] of [[-CIRCLE_R, 0], [CIRCLE_R, 0], [0, -CIRCLE_R], [0, CIRCLE_R]]) {
          const n = this.cell(px + dx, pz + dz);
          if (n && !cells.includes(n)) cells.push(n);
        }
        for (const cl of cells) {
          if (!cl) continue;
          for (const o of cl.boxes) {
            const cpx = c.x + fx * off * side, cpz = c.z + fz * off * side;
            let nx: number, nz: number, pen: number;
            if (cpx > o.minX && cpx < o.maxX && cpz > o.minZ && cpz < o.maxZ) {
              // centre inside: leave through the nearest face
              const d = [cpx - o.minX, o.maxX - cpx, cpz - o.minZ, o.maxZ - cpz];
              const m = d.indexOf(Math.min(...d));
              nx = m === 0 ? -1 : m === 1 ? 1 : 0;
              nz = m === 2 ? -1 : m === 3 ? 1 : 0;
              pen = d[m] + CIRCLE_R;
            } else {
              const qx = clamp(cpx, o.minX, o.maxX), qz = clamp(cpz, o.minZ, o.maxZ);
              const dd = Math.hypot(cpx - qx, cpz - qz);
              if (dd >= CIRCLE_R || dd < 1e-9) continue;
              nx = (cpx - qx) / dd;
              nz = (cpz - qz) / dd;
              pen = CIRCLE_R - dd;
            }
            impact = Math.max(impact, this.resolve(c, nx, nz, pen, o.solid));
            hit = true;
          }
          for (const o of cl.circles) {
            const cpx = c.x + fx * off * side, cpz = c.z + fz * off * side;
            const dx = cpx - o.x, dz = cpz - o.z;
            const dd = Math.hypot(dx, dz);
            const min = CIRCLE_R + o.r;
            if (dd >= min) continue;
            const nx = dd > 1e-9 ? dx / dd : 1, nz = dd > 1e-9 ? dz / dd : 0;
            impact = Math.max(impact, this.resolve(c, nx, nz, min - dd, false));
            hit = true;
          }
        }
        if (!hit) break;
      }
    }
    return impact;
  }

  private resolve(c: CarState, nx: number, nz: number, pen: number, solid: boolean) {
    c.x += nx * pen;
    c.z += nz * pen;
    const vn = c.vx * nx + c.vz * nz;
    if (vn >= 0) return 0;
    c.vx -= nx * vn * 1.3;
    c.vz -= nz * vn * 1.3;
    const scrape = 1 - Math.min(0.35, Math.abs(vn) * 0.022);
    c.vx *= scrape;
    c.vz *= scrape;
    if (solid) {
      // turn the car a bit along the wall so it does not get stuck
      const tx = -nz, tz = nx;
      const fwdAlong = Math.sin(c.heading) * tx + Math.cos(c.heading) * tz;
      const target = Math.atan2(tx, tz) + (fwdAlong < 0 ? Math.PI : 0);
      c.heading = wrapAngle(c.heading + wrapAngle(target - c.heading) * Math.min(0.35, Math.abs(vn) * 0.04));
    }
    return -vn;
  }
}

export const PARKING_BAY = { width: 3.6, length: 6 };

let town: TownMap | null = null;

export function getTown(): TownMap {
  return (town ??= new TownMap());
}

/** A car standing at rest in the town. */
export function createTownCar(id: string, spot: Spot) {
  return newCarState(id, spot.x, 0, spot.z, spot.heading);
}

const townGround: DriveGround = { grip: 1, drag: 0, offroad: false, bankGrip: 0, slope: 0 };

/** One physics step in the flat town: same driving model as on the tracks, buildings instead of barriers. */
export function stepCarTown(c: CarState, spec: CarSpec, inp: CarInput, map: TownMap, dt: number) {
  const sp = SURFACE_PROPS[map.surfaceAt(c.x, c.z)];
  townGround.grip = sp.grip;
  townGround.drag = sp.drag;
  const vf = driveCar(c, spec, inp, townGround, dt);
  c.impact = map.collide(c, spec);
  c.y = 0;
  c.vy = 0;
  c.landed = 0;
  updateGearbox(c, spec, vf, dt);
}
