import type { CarSpec } from './cars';
import { clamp, mulberry32, wrapAngle } from './math';
import { CIRCLE_R, driveCar, newCarState, updateGearbox, type CarInput, type CarState, type DriveGround } from './physics';
import { SURFACE_PROPS, type Surface } from './track';
import { TOWN_FOOTPRINTS } from './townFootprints';

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

export type BlockKind =
  | 'tower' | 'shop' | 'house' | 'park' | 'parking' | 'practice'
  | 'brick' | 'oldtown' | 'industry' | 'power' | 'supermarket' | 'plaza' | 'towerplaza';

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
  /** 'prop': collision of a modelled prop (fountain, chimney …), drawn via TownMap.props */
  kind: 'tree' | 'cone' | 'lamp' | 'prop';
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
  /** colour variant (wall / roof palette) chosen per building */
  variant: number;
}

/** number of colour variants a building can get */
export const BUILDING_VARIANTS = 8;

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
  ['building-type-a', 1.3, 1.03, 0.83], ['building-type-b', 1.83, 1.14, 1.14], ['building-type-c', 1.29, 1.03, 1.03],
  ['building-type-d', 1.76, 1.03, 1.24], ['building-type-e', 1.3, 1.03, 1.14], ['building-type-f', 1.43, 1.41, 1.14],
  ['building-type-g', 1.45, 1.18, 0.77], ['building-type-h', 1.3, 0.92, 0.74], ['building-type-i', 1.29, 1.03, 0.74],
  ['building-type-j', 1.37, 0.92, 1.04], ['building-type-k', 0.92, 1.02, 1.15], ['building-type-l', 1.03, 1.02, 1.05],
  ['building-type-m', 1.43, 1.43, 0.74], ['building-type-n', 1.78, 1.38, 1.14], ['building-type-o', 1.27, 1.03, 1.14],
  ['building-type-p', 1.24, 0.99, 0.92], ['building-type-q', 1.24, 0.89, 0.92], ['building-type-r', 1.03, 1.02, 1.14],
  ['building-type-s', 1.41, 1.09, 1.14], ['building-type-t', 1.31, 1.41, 1.16], ['building-type-u', 1.43, 1.09, 1.14],
];
/** City Kit Industrial halls and factories (prefixed 'ind-'; the client centres the models on their footprint) */
const INDUSTRY_MODELS: ModelSize[] = [
  ['ind-building-a', 2.08, 1.24, 1.47], ['ind-building-b', 2.08, 1.26, 1.47], ['ind-building-c', 1.87, 2.11, 1.25],
  ['ind-building-d', 0.88, 1.42, 1.41], ['ind-building-e', 1.68, 1.29, 1.65], ['ind-building-f', 1.79, 1.28, 1.92],
  ['ind-building-g', 1.68, 1.28, 1.28], ['ind-building-k', 1.3, 0.91, 0.77], ['ind-building-m', 1.32, 1.7, 1.52],
  ['ind-building-p', 1.68, 0.99, 0.71], ['ind-building-q', 2.14, 1.77, 0.88], ['ind-building-r', 2.48, 1.27, 1.39],
  ['ind-building-s', 2.12, 0.92, 0.84], ['ind-building-t', 1.72, 1.39, 1.01],
];
/**
 * Houses the client assembles from kit parts: 'tpl-<kit>-<cells x>x<cells z>x<floors>'. Sizes in cells;
 * the edge style's scale is the size of one cell in metres.
 */
const OLDTOWN_TEMPLATES: ModelSize[] = [
  ['tpl-fantasy-2x2x2', 2, 2, 2.9], ['tpl-fantasy-3x2x2', 3, 2, 2.9], ['tpl-fantasy-2x2x3', 2, 2, 3.9],
  ['tpl-fantasy-3x2x3', 3, 2, 3.9], ['tpl-fantasy-1x2x2', 1, 2, 2.9], ['tpl-fantasy-1x2x3', 1, 2, 3.9],
];
const BRICK_TEMPLATES: ModelSize[] = [
  ['tpl-retro-3x2x3', 3, 2, 3.3], ['tpl-retro-4x2x4', 4, 2, 4.3], ['tpl-retro-3x3x5', 3, 3, 5.3],
  ['tpl-retro-2x2x3', 2, 2, 3.3], ['tpl-retro-4x3x3', 4, 3, 3.3], ['tpl-retro-5x2x4', 5, 2, 4.3],
];
/** Parse a template name into its cell counts. */
export function templateCells(model: string) {
  const m = /^tpl-(\w+)-(\d+)x(\d+)x(\d+)$/.exec(model);
  return m ? { kit: m[1], x: Number(m[2]), z: Number(m[3]), floors: Number(m[4]) } : null;
}

/**
 * How buildings line the block edges: model set and scale, front garden (setback) and the gaps
 * between neighbours, wide enough to drive into the gardens and courtyards.
 */
const EDGE_STYLE = {
  shop: { models: SHOP_MODELS, scale: 14, setback: 0, gap: [5, 10], jitter: 0 },
  tower: { models: TOWER_MODELS, scale: 15, setback: 0, gap: [7, 13], jitter: 0.15 },
  house: { models: HOUSE_MODELS, scale: 7.5, setback: 6, gap: [5, 10], jitter: 0 },
  brick: { models: BRICK_TEMPLATES, scale: 4, setback: 0, gap: [4, 8], jitter: 0 },
  oldtown: { models: OLDTOWN_TEMPLATES, scale: 4.5, setback: 2, gap: [3, 7], jitter: 0 },
  plaza: { models: OLDTOWN_TEMPLATES, scale: 4.5, setback: 0, gap: [4, 8], jitter: 0 },
  industry: { models: INDUSTRY_MODELS, scale: 12, setback: 3, gap: [8, 14], jitter: 0 },
} as const;

const CELL = 50;

const BLOCK_PLAN = [
  // one row per block row j (z), one letter per block column i (x)
  'hhhBBBBhh',
  'hXPMBBpsh',
  'AsssssPsh',
  'AAsTTTshh',
  'AFsTZTsph',
  'hPsTTTshh',
  'hsssssMPh',
  'hhphPIsII',
  'hhhhIIIIK',
];
const PLAN_KIND: Record<string, BlockKind> = {
  h: 'house', s: 'shop', T: 'tower', p: 'park', P: 'parking', X: 'practice',
  B: 'brick', A: 'oldtown', I: 'industry', K: 'power', M: 'supermarket', F: 'plaza', Z: 'towerplaza',
};

export class TownMap {
  readonly blocks: Block[] = [];
  readonly boxes: BoxObstacle[] = [];
  readonly circles: CircleObstacle[] = [];
  readonly bays: ParkingBay[] = [];
  readonly buildings: Building[] = [];
  /** non-building objects with a model (fountains, chimneys, containers, stalls, fences …) */
  readonly props: Building[] = [];
  private lots = 0;
  private industryBlocks = 0;
  private vrnd = mulberry32(7);
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
      case 'house':
      case 'brick':
      case 'oldtown':
      case 'industry': {
        this.blockEdges(b, rnd);
        if (b.kind === 'tower') this.addBuilding(TOWER_MODELS[Math.floor(rnd() * 5)], 13 + rnd() * 4, cx, cz, Math.floor(rnd() * 4) * (Math.PI / 2));
        else if (b.kind === 'industry') this.industryYard(b, rnd);
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
      case 'supermarket':
        this.supermarket(b, rnd);
        break;
      case 'power':
        this.powerPlant(b);
        break;
      case 'plaza': {
        // old town square: houses around it, a fountain and market stalls in the middle
        this.blockEdges(b, rnd);
        this.addProp('fan-fountain-round-detail', 6, cx, cz, 0, 'circle', 6.3);
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + 0.3;
          this.addProp(k % 2 ? 'fan-stall-red' : 'fan-stall-green', 4, cx + Math.cos(a) * 17, cz + Math.sin(a) * 17, -a + Math.PI / 2, 'box', 2.1);
        }
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
          this.addProp('fan-lantern', 3, cx + Math.cos(a) * 10, cz + Math.sin(a) * 10, 0, 'circle', 0.35);
        }
        this.starSpots.push({ x: cx + 10, z: cz, heading: 0 });
        break;
      }
      case 'towerplaza': {
        // paved square between the towers: fountain, benches and a ring of trees
        this.addProp('fan-fountain-round-detail', 7, cx, cz, 0, 'circle', 7.3);
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2;
          this.circles.push({ x: cx + Math.cos(a) * 26, z: cz + Math.sin(a) * 26, r: 0.6, kind: 'tree' });
        }
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
          this.addProp('ret-detail-bench', 3.5, cx + Math.cos(a) * 14, cz + Math.sin(a) * 14, -a - Math.PI / 2, 'box', 1.1);
        }
        this.starSpots.push({ x: cx + 18, z: cz, heading: 0 });
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
        // towers vary in size; capped so the row never gets deeper than planned for the corners
        const scale = Math.min(st.scale * (1 + (rnd() * 2 - 1) * st.jitter), maxDepth / m[2]);
        const w = m[1] * scale, d = m[2] * scale;
        if (cursor + w > end) break;
        const along = cursor + w / 2;
        const front = I - st.setback - d / 2;
        // along runs in x for north/south rows and in z for east/west rows
        this.addBuilding(m, scale, b.cx + (s.fx !== 0 ? s.fx * front : along), b.cz + (s.fx !== 0 ? along : s.fz * front), s.rot);
        cursor += w + st.gap[0] + rnd() * (st.gap[1] - st.gap[0]);
      }
    }
  }

  private addBuilding(m: ModelSize, scale: number, x: number, z: number, rot: number) {
    const turned = Math.abs(Math.sin(rot)) > 0.5;
    const w = (turned ? m[2] : m[1]) * scale, d = (turned ? m[1] : m[2]) * scale;
    this.buildings.push({ model: m[0], scale, x, z, rot, w, d, h: m[3] * scale, variant: Math.floor(this.vrnd() * BUILDING_VARIANTS) });
    const fp = TOWN_FOOTPRINTS[m[0]];
    if (!fp) {
      // the collision box is a little smaller than the model (roofs and balconies stick out)
      const ix = Math.max(0.5, w / 2 - 0.3), iz = Math.max(0.5, d / 2 - 0.3);
      this.boxes.push({ minX: x - ix, maxX: x + ix, minZ: z - iz, maxZ: z + iz, solid: true });
      return;
    }
    // measured walls only: cars can drive under canopies and eaves; their posts are small obstacles
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const toWorld = (mx: number, mz: number): [number, number] => [x + (mx * cos + mz * sin) * scale, z + (-mx * sin + mz * cos) * scale];
    const [x0, x1, z0, z1] = fp.box;
    const corners = [toWorld(x0, z0), toWorld(x1, z0), toWorld(x0, z1), toWorld(x1, z1)];
    const xs = corners.map((c) => c[0]), zs = corners.map((c) => c[1]);
    const inset = 0.1;
    this.boxes.push({ minX: Math.min(...xs) + inset, maxX: Math.max(...xs) - inset, minZ: Math.min(...zs) + inset, maxZ: Math.max(...zs) - inset, solid: true });
    for (const [px, pz, r] of fp.posts ?? []) {
      const [wx, wz] = toWorld(px, pz);
      if (!this.circles.some((c) => Math.hypot(c.x - wx, c.z - wz) < 0.3)) this.circles.push({ x: wx, z: wz, r: Math.max(0.25, r * scale), kind: 'prop' });
    }
  }

  /**
   * A prop with a model; collision as a box (half size `r`, rotated to the axes) or a circle of radius r.
   * size: [w, d, h] for box props whose footprint differs from a square.
   */
  private addProp(model: string, scale: number, x: number, z: number, rot: number, shape: 'box' | 'circle' | 'none', r: number, size?: [number, number, number]) {
    const turned = Math.abs(Math.sin(rot)) > 0.5;
    const w = size ? (turned ? size[1] : size[0]) : r * 2, d = size ? (turned ? size[0] : size[1]) : r * 2;
    this.props.push({ model, scale, x, z, rot, w, d, h: size?.[2] ?? r * 2, variant: Math.floor(this.vrnd() * BUILDING_VARIANTS) });
    if (shape === 'circle') this.circles.push({ x, z, r, kind: 'prop' });
    if (shape === 'box') this.boxes.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, solid: w > 6 || d > 6 });
  }

  private propsFree(x: number, z: number, r: number) {
    return this.buildingsFree(x, z, r) && this.props.every((p) => Math.abs(x - p.x) > p.w / 2 + r || Math.abs(z - p.z) > p.d / 2 + r);
  }

  /** Neighbouring block of the given kind (direction as unit vector), if any. */
  private neighbour(b: Block, kind: BlockKind) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const row = BLOCK_PLAN[b.j + dz];
      if (row && PLAN_KIND[row[b.i + dx]] === kind) return { dx, dz };
    }
    return null;
  }

  /**
   * A supermarket hall whose entrance faces the street towards the neighbouring parking lot,
   * with a forecourt, a trolley shelter and some small trees.
   */
  private supermarket(b: Block, rnd: () => number) {
    const dir = this.neighbour(b, 'parking') ?? { dx: 0, dz: 1 };
    const W = 48, D = 30, H = 8, I = BLOCK_INNER;
    const rot = Math.atan2(dir.dx, dir.dz);
    // front face 12 m behind the sidewalk (forecourt), the hall pushed towards the back
    const off = I - 12 - D / 2;
    const x = b.cx + dir.dx * off, z = b.cz + dir.dz * off;
    this.addBuilding(['supermarket', W, D, H], 1, x, z, rot);
    // trolley shelter beside the entrance
    const px = -dir.dz, pz = dir.dx;
    const sx = x + dir.dx * (D / 2 + 4) + px * (W / 2 - 4), sz = z + dir.dz * (D / 2 + 4) + pz * (W / 2 - 4);
    this.addProp('cart-shelter', 1, sx, sz, rot, 'box', 0, [7, 2.6, 2.6]);
    for (const k of [-1, 1]) {
      const tx = x + dir.dx * (D / 2 + 7) + px * k * (W / 2 + 3), tz = z + dir.dz * (D / 2 + 7) + pz * k * (W / 2 + 3);
      if (this.propsFree(tx, tz, 2)) this.circles.push({ x: tx, z: tz, r: 0.6, kind: 'tree' });
    }
    // trees along the back
    for (let k = 0; k < 6; k++) {
      const a = (rnd() * 2 - 1) * (W / 2);
      const tx = b.cx - dir.dx * (I - 4) + px * a, tz = b.cz - dir.dz * (I - 4) + pz * a;
      if (this.propsFree(tx, tz, 3)) this.circles.push({ x: tx, z: tz, r: 0.6, kind: 'tree' });
    }
    this.starSpots.push({ x: x + dir.dx * (D / 2 + 6) - px * 8, z: z + dir.dz * (D / 2 + 6) - pz * 8, heading: rot });
  }

  /** Inside an industry block: water tower, wind turbine or a yard with containers and tanks. */
  private industryYard(b: Block, rnd: () => number) {
    const { cx, cz } = b;
    const n = this.industryBlocks++;
    if (n === 0) this.addProp('ind-water-tower', 12, cx, cz, 0, 'circle', 5.5);
    else if (n === 2) this.addProp('ind-windmill', 12, cx, cz, rnd() * Math.PI * 2, 'circle', 2.2);
    else {
      // container stacks and tanks on the yard
      const containers = ['ind-shipping-container-a', 'ind-shipping-container-b', 'ind-shipping-container-c'];
      for (let k = 0; k < 8; k++) {
        const x = cx + (rnd() * 2 - 1) * 16, z = cz + (rnd() * 2 - 1) * 16;
        const rot = rnd() < 0.5 ? 0 : Math.PI / 2;
        const tank = rnd() < 0.3;
        const size: [number, number, number] = tank ? [12, 13, 8] : [5.6, 12.3, 5.2];
        const r = Math.max(size[0], size[1]) / 2 + 1.5;
        if (!this.propsFree(x, z, r)) continue;
        this.addProp(tank ? 'ind-detail-tank-large' : containers[Math.floor(rnd() * 3)], tank ? 8 : 4, x, z, rot, 'box', 0, size);
      }
    }
    if (this.propsFree(cx + 20, cz + 20, 3)) this.starSpots.push({ x: cx + 20, z: cz + 20, heading: 0 });
  }

  /** Power plant: machine hall, two big and one slim chimney, tanks and a fence with two gates. */
  private powerPlant(b: Block) {
    const { cx, cz } = b;
    const I = BLOCK_INNER;
    this.addBuilding(['ind-building-l', 2.08, 1.87, 1.92], 13, cx - 10, cz - 4, 0);
    this.addProp('ind-chimney-large', 11, cx + 24, cz - 18, 0, 'circle', 6);
    this.addProp('ind-chimney-large', 11, cx + 24, cz + 2, 0, 'circle', 6);
    this.addProp('ind-chimney-medium', 16, cx + 26, cz + 22, 0, 'circle', 3.6);
    this.addProp('ind-detail-tank-large', 7, cx - 22, cz + 28, 0, 'box', 0, [10.5, 11.6, 6.7]);
    this.addProp('ind-detail-tank-large', 7, cx - 6, cz + 28, 0, 'box', 0, [10.5, 11.6, 6.7]);
    // fence along the block edge with a gate in the middle of the north and south side
    const F = I - 1, gate = 8;
    for (const sz of [-1, 1]) {
      for (const [a0, a1] of [[-F, -gate], [gate, F]]) {
        this.addProp('fence', 1, cx + (a0 + a1) / 2, cz + sz * F, 0, 'box', 0, [a1 - a0, 0.3, 2.2]);
      }
    }
    for (const sx of [-1, 1]) this.addProp('fence', 1, cx + sx * F, cz, Math.PI / 2, 'box', 0, [2 * F, 0.3, 2.2]);
    this.starSpots.push({ x: cx + 5, z: cz + 30, heading: 0 });
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
