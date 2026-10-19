import type { CarSpec } from './cars';
import { clamp, mulberry32, wrapAngle } from './math';
import { CIRCLE_R, driveCar, newCarState, stepRocket, updateGearbox, updateVertical, type CarInput, type CarState, type DriveGround } from './physics';
import { SURFACE_PROPS, type Surface } from './track';
import { TOWN_FOOTPRINTS } from './townFootprints';

/**
 * The open practice town ("Spidi-Stadt"): 1 × 1 km, flat, a grid of two-lane streets every 100 m
 * with right-hand traffic, sidewalks and 9 × 9 blocks. Everything is deterministic so client
 * (rendering) and tests see the same map.
 */

/** the old town spans -TOWN_HALF..TOWN_HALF in x and z */
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
/** outer edge of the sidewalk along the outer ring street */
export const OUTER = LINES[LINE_COUNT - 1] + ROAD_HW + SIDEWALK;

/**
 * The drivable town: the old town plus the harbour strip in the south (−z, ending at the quay edge),
 * the railway strip in the east (−x; on the minimap and in the chase view −x is to the right) and the
 * airfield in the west (+x). A wall closes the other sides, the quay edge has no barrier.
 */
export const TOWN_BOUNDS = { minX: -570, maxX: 760, minZ: -540, maxZ: TOWN_HALF };
export const HARBOR = { quayZ: TOWN_BOUNDS.minZ, waterY: -1.6 };
/** railway along the east strip: track, fence towards the town, platform and station forecourt */
export const RAIL = {
  trackX: -522,
  fenceX: -507,
  /** the track runs between two tunnel portals */
  north: 486,
  south: -446,
  platform: [-519.6, -508] as const,
  /** station forecourt (asphalt, parking bays) */
  forecourt: { x0: -505, x1: -OUTER, z0: -70, z1: 70 },
  /** station building between forecourt and platform */
  station: { x: -499, z: 0, w: 16, d: 40 },
};

/** A parked (or waiting) aircraft: nose position and heading, livery 0–3. */
export interface TownPlane {
  x: number;
  z: number;
  heading: number;
  livery: number;
}

/**
 * Airfield along the west edge (+x), built from the parts of the airport tracks: a straight runway
 * along the wall, a parallel taxiway with three links, the apron with the terminal, a cargo hall with
 * a few containers and the tower; landside parking towards the town. Everything is drivable.
 */
export const TOWN_AIRPORT = {
  runway: { x: 720, z0: -450, z1: 470, width: 30 },
  taxiway: { x: 665, z0: -425, z1: 440, width: 16 },
  /** links between taxiway and runway (z) */
  links: [-425, 0, 440],
  apron: { x0: 500, x1: 657, z0: -360, z1: 300 },
  landside: { x0: OUTER, x1: 500, z0: -360, z1: 300 },
  terminal: { x: 515, z: 20, w: 30, d: 160 },
  cargo: { x: 520, z: -300, w: 40, d: 80 },
  tower: { x: 515, z: 190, r: 7 },
  windsock: { x: 748, z: 0 },
  planes: [
    // at the terminal gates, noses towards the building
    { x: 541, z: -35, heading: -Math.PI / 2, livery: 0 },
    { x: 541, z: 20, heading: -Math.PI / 2, livery: 1 },
    { x: 541, z: 75, heading: -Math.PI / 2, livery: 2 },
    // remote stands on the apron, at the cargo hall, on the taxiway and lined up for take-off
    { x: 585, z: 175, heading: -Math.PI / 2, livery: 3 },
    { x: 585, z: 240, heading: -Math.PI / 2, livery: 0 },
    { x: 548, z: -300, heading: -Math.PI / 2, livery: 2 },
    { x: 665, z: 200, heading: Math.PI, livery: 1 },
    { x: 720, z: -410, heading: 0, livery: 3 },
  ] as TownPlane[],
};

/** Plane collision parts in the plane's frame (x = left, z = forward from the nose): boxes [x0, x1, z0, z1, top] and circles [x, z, r]. */
const PLANE_BOXES: [number, number, number, number, number][] = [[-2.1, 2.1, -37, 0, 6.5]];
const PLANE_CIRCLES: [number, number, number][] = [[-6.5, -12.5, 1.3], [6.5, -12.5, 1.3]];

/**
 * A drivable ramp (skate park). The profile runs along +u = (sin rot, cos rot) from (x, z):
 * it rises over `up` metres to `height` (straight, kicker = steepening, quarter = concave like a
 * quarter pipe), stays flat for `top` metres and falls again over `down` metres (0 = sharp edge).
 */
export interface Ramp {
  x: number;
  z: number;
  rot: number;
  width: number;
  height: number;
  up: number;
  top: number;
  down: number;
  curve: 'straight' | 'kicker' | 'quarter';
}

/** Height of a ramp at (x, z), or -1 if the point is not on it. */
export function rampHeight(r: Ramp, x: number, z: number) {
  const fx = Math.sin(r.rot), fz = Math.cos(r.rot);
  const dx = x - r.x, dz = z - r.z;
  const u = dx * fx + dz * fz, v = -dx * fz + dz * fx;
  const len = r.up + r.top + r.down;
  if (u < 0 || u > len || Math.abs(v) > r.width / 2) return -1;
  if (u < r.up) {
    const f = u / r.up;
    if (r.curve === 'straight') return r.height * f;
    if (r.curve === 'kicker') return r.height * f * f;
    // quarter pipe: a circle arc up to 60°
    const sn = f * Math.sin(Math.PI / 3);
    return (r.height * (1 - Math.sqrt(1 - sn * sn))) / (1 - Math.cos(Math.PI / 3));
  }
  if (u <= r.up + r.top || r.down <= 0) return r.height;
  return r.height * (1 - (u - r.up - r.top) / r.down);
}

export type BlockKind =
  | 'tower' | 'shop' | 'house' | 'park' | 'parking' | 'practice'
  | 'brick' | 'oldtown' | 'industry' | 'power' | 'supermarket' | 'plaza' | 'towerplaza' | 'skate' | 'church';

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
  /** height of the obstacle (rail, bench, parked car, building): a car flying higher passes over it */
  top?: number;
}

export interface CircleObstacle {
  x: number;
  z: number;
  r: number;
  /** 'prop': collision of a modelled prop (fountain, chimney …), drawn via TownMap.props */
  kind: 'tree' | 'cone' | 'lamp' | 'prop' | 'bollard';
  /** height, if it differs from the usual one of its kind (posts of a canopy) */
  top?: number;
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

/** a car flying higher than this passes over a parked car */
const PARKED_CAR_TOP = 2;
/** height of the round obstacles: a car jumping higher flies over them (modelled props always block) */
const CIRCLE_TOP: Record<CircleObstacle['kind'], number> = { cone: 0.8, bollard: 1.1, lamp: 7.2, tree: 8, prop: Infinity };

/** ISO shipping containers in metres: [width, length, height] (40 ft and 20 ft). */
export const CONTAINER_40: [number, number, number] = [2.44, 12.19, 2.59];
export const CONTAINER_20: [number, number, number] = [2.44, 6.06, 2.59];
/** articulated lorry with a 40 ft container: [width, length, height] */
export const SEMI_TRUCK: [number, number, number] = [2.55, 16.5, 4];

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
  /** height of the model's base (default 0; ships float on the water) */
  y?: number;
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
  'hXPMBBSsh',
  'AsssssPsh',
  'AAsTTTshh',
  'AFsTZTsph',
  'CPsTTTsRh',
  'hsssssMPh',
  'hhphPIsII',
  'hhhhIIIIK',
];
const PLAN_KIND: Record<string, BlockKind> = {
  h: 'house', s: 'shop', T: 'tower', p: 'park', P: 'parking', X: 'practice',
  B: 'brick', A: 'oldtown', I: 'industry', K: 'power', M: 'supermarket', F: 'plaza', Z: 'towerplaza',
  S: 'skate', R: 'skate', C: 'church',
};
/**
 * Blocks that replaced older ones (plan letter → the old kind): the skate park instead of a park, a
 * second skate park beside the parking lot of the second supermarket and the church instead of houses.
 * They first run the old generator and throw its result away, so the random numbers of all other
 * blocks – and with them the familiar town – stay exactly the same.
 */
const REPLACED: Record<string, BlockKind> = { S: 'park', R: 'house', C: 'house' };

export class TownMap {
  readonly blocks: Block[] = [];
  readonly boxes: BoxObstacle[] = [];
  readonly circles: CircleObstacle[] = [];
  readonly bays: ParkingBay[] = [];
  readonly buildings: Building[] = [];
  /** drivable ramps (skate park) */
  readonly ramps: Ramp[] = [];
  private rampBox = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
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
    const later: Block[] = [];
    for (let j = 0; j < LINE_COUNT - 1; j++) {
      for (let i = 0; i < LINE_COUNT - 1; i++) {
        const letter = BLOCK_PLAN[j][i];
        const kind = PLAN_KIND[letter];
        const b: Block = { i, j, cx: LINES[i] + GRID / 2, cz: LINES[j] + GRID / 2, kind };
        this.blocks.push(b);
        const was = REPLACED[letter];
        if (was) {
          this.discard(() => this.buildBlock({ ...b, kind: was }, rnd));
          later.push(b);
        } else this.buildBlock(b, rnd);
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
    // the wall around the town (the harbour ends at the quay edge); trees on the grass strips
    // no wall along the quay: the harbour ends in the water
    const { minX, maxX, minZ, maxZ } = TOWN_BOUNDS, T = 4;
    this.boxes.push(
      { minX: minX - T, maxX: maxX + T, minZ: maxZ, maxZ: maxZ + T, solid: true },
      { minX: maxX, maxX: maxX + T, minZ, maxZ, solid: true },
      { minX: minX - T, maxX: minX, minZ, maxZ, solid: true },
    );
    const W = TOWN_HALF;
    for (let k = 0; k < 160; k++) {
      const along = (rnd() * 2 - 1) * (W - 8);
      const inset = W - 6 - rnd() * 22;
      const side = k % 4;
      const x = side === 0 ? along : side === 1 ? along : side === 2 ? inset : -inset;
      const z = side === 0 ? inset : side === 1 ? -inset : along;
      // the south (harbour), east (railway) and west (airfield) strips are laid out separately
      if (side !== 0) continue;
      if (this.circles.some((c) => c.kind === 'tree' && Math.hypot(c.x - x, c.z - z) < 7)) continue;
      this.circles.push({ x, z, r: 0.6, kind: 'tree' });
    }

    // new areas with their own random numbers (after everything else, see REPLACED)
    const xr = mulberry32(seed + 77);
    for (const b of later) {
      if (b.kind === 'skate') this.skatePark(b, xr);
      else if (b.kind === 'church') this.churchYard(b, xr);
    }
    this.harbour(xr);
    this.railway(xr);
    this.airfield(mulberry32(seed + 99));

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
            if (parked >= 0) this.boxes.push({ minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz, solid: false, top: PARKED_CAR_TOP });
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
    const w = (turned ? m[2] : m[1]) * scale, d = (turned ? m[1] : m[2]) * scale, top = m[3] * scale;
    this.buildings.push({ model: m[0], scale, x, z, rot, w, d, h: top, variant: Math.floor(this.vrnd() * BUILDING_VARIANTS) });
    const fp = TOWN_FOOTPRINTS[m[0]];
    if (!fp) {
      // the collision box is a little smaller than the model (roofs and balconies stick out)
      const ix = Math.max(0.5, w / 2 - 0.3), iz = Math.max(0.5, d / 2 - 0.3);
      this.boxes.push({ minX: x - ix, maxX: x + ix, minZ: z - iz, maxZ: z + iz, solid: true, top });
      return;
    }
    // measured walls only: cars can drive under canopies and eaves; their posts are small obstacles
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const toWorld = (mx: number, mz: number): [number, number] => [x + (mx * cos + mz * sin) * scale, z + (-mx * sin + mz * cos) * scale];
    const [x0, x1, z0, z1] = fp.box;
    const corners = [toWorld(x0, z0), toWorld(x1, z0), toWorld(x0, z1), toWorld(x1, z1)];
    const xs = corners.map((c) => c[0]), zs = corners.map((c) => c[1]);
    const inset = 0.1;
    this.boxes.push({ minX: Math.min(...xs) + inset, maxX: Math.max(...xs) - inset, minZ: Math.min(...zs) + inset, maxZ: Math.max(...zs) - inset, solid: true, top });
    for (const [px, pz, r] of fp.posts ?? []) {
      const [wx, wz] = toWorld(px, pz);
      if (!this.circles.some((c) => Math.hypot(c.x - wx, c.z - wz) < 0.3)) this.circles.push({ x: wx, z: wz, r: Math.max(0.25, r * scale), kind: 'prop', top });
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
    // obstacles of known height can be jumped over
    const top = size?.[2];
    if (shape === 'box') this.boxes.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, solid: w > 6 || d > 6, top });
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
      for (let k = 0; k < 8; k++) {
        const x = cx + (rnd() * 2 - 1) * 16, z = cz + (rnd() * 2 - 1) * 16;
        const rot = rnd() < 0.5 ? 0 : Math.PI / 2;
        const tank = rnd() < 0.3;
        const size: [number, number, number] = tank ? [12, 13, 8] : CONTAINER_40;
        const r = Math.max(size[0], size[1]) / 2 + 1.5;
        if (!this.propsFree(x, z, r)) continue;
        if (tank) this.addProp('ind-detail-tank-large', 8, x, z, rot, 'box', 0, size);
        else {
          // (the old model choice: keeps the random numbers – and the rest of the town – unchanged)
          rnd();
          // shipping containers in real size (the kit's model is far too wide), some stacked two high
          this.containerStack(x, z, rot, k % 3 === 0 ? 2 : 1, CONTAINER_40);
        }
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

  /** Run a generator and throw away everything it added (keeps the random number streams in step). */
  private discard(fn: () => void) {
    const n = [this.buildings.length, this.props.length, this.boxes.length, this.circles.length, this.bays.length, this.starSpots.length];
    fn();
    this.buildings.length = n[0];
    this.props.length = n[1];
    this.boxes.length = n[2];
    this.circles.length = n[3];
    this.bays.length = n[4];
    this.starSpots.length = n[5];
  }

  private addRamp(r: Ramp) {
    this.ramps.push(r);
    const len = r.up + r.top + r.down, fx = Math.sin(r.rot), fz = Math.cos(r.rot);
    for (const [u, v] of [[0, -1], [0, 1], [len, -1], [len, 1]]) {
      const x = r.x + fx * u - fz * v * (r.width / 2), z = r.z + fz * u + fx * v * (r.width / 2);
      const b = this.rampBox;
      b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x);
      b.minZ = Math.min(b.minZ, z); b.maxZ = Math.max(b.maxZ, z);
    }
  }

  /** True over the harbour basin (beyond the quay edge). */
  inWater(x: number, z: number) {
    return z < HARBOR.quayZ - 0.2 && x > TOWN_BOUNDS.minX - 400 && x < TOWN_BOUNDS.maxX + 400;
  }

  /** Ground height at (x, z): 0 except on the ramps of the skate park. */
  heightAt(x: number, z: number) {
    const b = this.rampBox;
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return 0;
    let h = 0;
    for (const r of this.ramps) h = Math.max(h, rampHeight(r, x, z));
    return h;
  }

  /**
   * Skate park: a fun box in the middle, a jump line (kicker, gap, landing), a half pipe and a quarter
   * pipe, plus rails, grind boxes, benches and a few skaters. All ramps are drivable.
   */
  private skatePark(b: Block, rnd: () => number) {
    const { cx, cz } = b;
    const ramp = (dx: number, dz: number, rot: number, width: number, height: number, up: number, top: number, down: number, curve: Ramp['curve']) =>
      this.addRamp({ x: cx + dx, z: cz + dz, rot, width, height, up, top, down, curve });
    ramp(-10, -11, 0, 10, 1.6, 7, 8, 7, 'straight');
    ramp(-30, -36, 0, 8, 1.5, 6, 0, 0, 'kicker');
    ramp(-30, -14, 0, 8, 1.5, 4, 6, 12, 'straight');
    ramp(28, 6, 0, 20, 3, 6, 1, 0, 'quarter');
    ramp(28, -6, Math.PI, 20, 3, 6, 1, 0, 'quarter');
    ramp(-8, 30, 0, 24, 2.5, 6, 1, 0, 'quarter');
    // rails and grind boxes are obstacles
    this.addProp('sk-rail-high', 6, cx + 8, cz - 26, 0, 'box', 0, [0.7, 6, 2.7]);
    this.addProp('sk-rail-low', 6, cx + 2, cz + 20, Math.PI / 2, 'box', 0, [0.7, 6, 1.5]);
    this.addProp('sk-obstacle-box', 4, cx + 30, cz - 30, 0, 'box', 0, [4, 4, 0.85]);
    this.addProp('sk-obstacle-box-grind', 4, cx + 12, cz + 34, Math.PI / 2, 'box', 0, [2, 4, 0.85]);
    for (const [dx, dz, rot] of [[-38, 0, Math.PI / 2], [38, 26, -Math.PI / 2], [0, -39, 0], [20, 39, Math.PI]]) {
      this.addProp('sk-benches', 3, cx + dx, cz + dz, rot, 'box', 0, [3, 3.3, 2]);
    }
    this.addProp('sk-pallet', 4, cx + 22, cz - 30, 0.3, 'box', 0, [2, 2, 0.6]);
    this.starSpots.push({ x: cx - 10, z: cz, heading: 0 }, { x: cx - 30, z: cz - 6, heading: 0 }, { x: cx + 28, z: cz, heading: Math.PI / 2 });
  }

  /**
   * Church with its tower towards the street and a quiet cemetery behind it: iron fence with two
   * gates, rows of graves, crypts, pines, lanterns and benches.
   */
  private churchYard(b: Block, rnd: () => number) {
    const { cx, cz } = b;
    this.addBuilding(['tpl-church-4x8x3', 4, 8, 7], 4.5, cx, cz + 16, 0);
    // cemetery: z from cz-40 to cz-6, fence with a gate on the north and south side
    const x0 = cx - 38, x1 = cx + 38, z0 = cz - 40, z1 = cz - 6, gate = 4;
    const seg = 2.2;
    const fence = (ax: number, az: number, bx: number, bz: number) => {
      const len = Math.hypot(bx - ax, bz - az), rot = Math.atan2(bx - ax, bz - az) + Math.PI / 2;
      const n = Math.max(1, Math.round(len / seg));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        this.addProp('gy-iron-fence', seg, ax + (bx - ax) * t, az + (bz - az) * t, rot, 'none', 0, [seg, 0.3, 1.9]);
      }
      const hx = Math.max(0.2, Math.abs(bx - ax) / 2), hz = Math.max(0.2, Math.abs(bz - az) / 2);
      this.boxes.push({ minX: (ax + bx) / 2 - hx, maxX: (ax + bx) / 2 + hx, minZ: (az + bz) / 2 - hz, maxZ: (az + bz) / 2 + hz, solid: true });
    };
    for (const z of [z0, z1]) {
      fence(x0, z, cx - gate, z);
      fence(cx + gate, z, x1, z);
      for (const sx of [-1, 1]) this.addProp('gy-iron-fence-border-column', 2.2, cx + sx * gate, z, 0, 'circle', 0.35);
    }
    fence(x0, z0, x0, z1);
    fence(x1, z0, x1, z1);
    // graves in rows, the path along x = cx stays free
    const stones = ['gy-gravestone-cross', 'gy-gravestone-round', 'gy-gravestone-bevel', 'gy-gravestone-wide', 'gy-gravestone-roof', 'gy-gravestone-decorative'];
    for (let gx = x0 + 5; gx <= x1 - 4; gx += 5) {
      if (Math.abs(gx - cx) < 6) continue;
      for (let gz = z0 + 6; gz <= z1 - 5; gz += 7) {
        if (rnd() < 0.15) continue;
        this.addProp(rnd() < 0.5 ? 'gy-grave' : 'gy-grave-border', 2.2, gx, gz, 0, 'none', 0, [1.6, 2.9, 0.2]);
        this.addProp(stones[Math.floor(rnd() * stones.length)], 2.2, gx, gz + 1.9, 0, 'box', 0, [1.1, 0.6, 1.3]);
      }
    }
    this.addProp('gy-crypt-small', 4, x0 + 6, z0 + 5, 0, 'box', 0, [5.4, 5.6, 4]);
    this.addProp('gy-crypt-small', 4, x1 - 6, z0 + 5, 0, 'box', 0, [5.4, 5.6, 4]);
    this.addProp('gy-pillar-obelisk', 3, cx - 5.5, cz - 23, 0, 'circle', 0.6);
    for (const [px, pz] of [[x0 + 2.5, z1 - 2.5], [x1 - 2.5, z1 - 2.5], [x0 + 2.5, cz - 23], [x1 - 2.5, cz - 23]]) {
      this.addProp(rnd() < 0.5 ? 'gy-pine' : 'gy-pine-crooked', 4, px, pz, rnd() * Math.PI * 2, 'circle', 0.8);
    }
    for (const pz of [z0 + 8, cz - 16, z1 - 4]) {
      for (const sx of [-1, 1]) this.addProp('gy-lightpost-single', 2.5, cx + sx * 3.5, pz, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 'circle', 0.25);
    }
    for (const sx of [-1, 1]) this.addProp('gy-bench', 2.5, cx + sx * 4, cz - 30, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 'box', 0, [1.2, 2, 1.3]);
    // trees beside the church
    for (let k = 0; k < 8; k++) {
      const sx = k % 2 ? 1 : -1, x = cx + sx * (16 + rnd() * 20), z = cz + rnd() * 34;
      if (this.buildingsFree(x, z, 4) && this.propsFree(x, z, 4)) this.circles.push({ x, z, r: 0.6, kind: 'tree' });
    }
    this.starSpots.push({ x: cx, z: cz - 14, heading: 0 }, { x: cx + 14, z: cz + 38, heading: Math.PI / 2 });
  }

  /** A stack of shipping containers (size [w, l, h]); one box for the whole stack collides. */
  private containerStack(x: number, z: number, rot: number, levels: number, size: [number, number, number]) {
    for (let l = 0; l < levels; l++) {
      this.addProp('container', 1, x, z, rot, l === 0 ? 'box' : 'none', 0, size);
      this.props[this.props.length - 1].y = l * size[2];
    }
    this.boxes[this.boxes.length - 1].top = levels * size[2];
  }

  /**
   * Harbour along the south edge: warehouses, container yards with stacks up to three high, lorries,
   * parking and ships moored in the water. The quay edge has no barrier – a car that drives over it
   * falls into the water.
   */
  private harbour(rnd: () => number) {
    const Q = HARBOR.quayZ;
    // ships and boats in the water
    const moor = (model: string, scale: number, x: number, len: number, wid: number, rot = Math.PI / 2) => {
      this.addProp(model, scale, x, Q - 2 - wid / 2, rot, 'none', 0, [wid, len, len * 0.3]);
      // the hull sits a bit below the water line
      this.props[this.props.length - 1].y = HARBOR.waterY - 0.6 - len * 0.02;
    };
    moor('wc-ship-cargo-a', 5, -170, 53, 19.6);
    moor('wc-ship-cargo-b', 5, 170, 53, 19.6, -Math.PI / 2);
    moor('wc-boat-tug-a', 4, 30, 14, 7.1);
    moor('wc-boat-tug-a', 4, 60, 14, 7.1, -Math.PI / 2);
    ['wc-boat-fishing-small', 'wc-boat-house-a', 'wc-boat-fishing-small', 'wc-boat-house-b', 'wc-boat-sail-a', 'wc-boat-row-small']
      .forEach((m, k) => moor(m, 3, -460 + k * 16, 13, 6));
    ['wc-boat-sail-b', 'wc-boat-house-a', 'wc-boat-speed-a', 'wc-boat-fishing-small'].forEach((m, k) => moor(m, 3, 330 + k * 18, 13, 6, -Math.PI / 2));
    for (let k = 0; k < 6; k++) {
      this.addProp(k % 2 ? 'wc-buoy-flag' : 'wc-buoy', 3, -400 + k * 160, Q - 70 - rnd() * 20, 0, 'none', 0, [2.8, 2.8, 5]);
      this.props[this.props.length - 1].y = HARBOR.waterY;
    }
    // warehouses
    this.addBuilding(['ind-building-r', 2.48, 1.27, 1.39], 12, -30, -505, 0);
    this.addBuilding(['ind-building-q', 2.14, 1.77, 0.88], 12, 60, -505, 0);
    this.addBuilding(['ind-building-a', 2.08, 1.24, 1.47], 12, -150, -508, 0);
    this.addBuilding(['ind-building-c', 1.87, 2.11, 1.25], 12, -360, -510, 0);
    // container yards (east and west): three rows of containers with lanes between rows and blocks
    const rows = [-478, -500, -522];
    const yard = (x0: number, x1: number) => {
      let col = 0;
      for (let x = x0; x <= x1; x += 4, col++) {
        // a 12 m lane after every 6 columns
        if (col % 7 === 6) {
          x += 8;
          continue;
        }
        for (const z of rows) {
          if (rnd() < 0.12) continue;
          const levels = 1 + Math.floor(rnd() * 3);
          this.containerStack(x, z, 0, levels, rnd() < 0.25 ? CONTAINER_20 : CONTAINER_40);
        }
      }
    };
    yard(150, 480);
    yard(-560, -400);
    // lorries: waiting in front of the warehouses and in the yard lanes
    const lorry = (x: number, z: number, rot: number) => this.addProp('semi-truck', 1, x, z, rot, 'box', 0, SEMI_TRUCK);
    for (let k = 0; k < 4; k++) lorry(-120 + k * 22, -476, Math.PI / 2);
    lorry(250, -489, Math.PI / 2);
    lorry(400, -511, -Math.PI / 2);
    lorry(-480, -489, -Math.PI / 2);
    lorry(90, -530, Math.PI / 2);
    for (const [x, z] of [[-5, -478], [110, -480], [-205, -520]]) {
      this.addProp(rnd() < 0.5 ? 'wc-cargo-pile-a' : 'wc-cargo-pile-b', 5, x, z, 0, 'box', 0, [13.5, 14.5, 6]);
    }
    // parking bays in the west part, facing the water
    for (let k = 0; k < 16; k++) {
      const x = -330 + k * PARKING_BAY.width, z = -480;
      const parked = rnd() < 0.3 ? Math.floor(rnd() * 7) : -1;
      this.bays.push({ x, z, heading: Math.PI, parked });
      if (parked >= 0) this.boxes.push({ minX: x - 1.2, maxX: x + 1.2, minZ: z - 2.3, maxZ: z + 2.3, solid: false, top: PARKED_CAR_TOP });
    }
    this.starSpots.push(
      { x: -250, z: -510, heading: Math.PI / 2 }, { x: 120, z: -462, heading: Math.PI / 2 },
      { x: 320, z: -489, heading: Math.PI / 2 }, { x: -470, z: -511, heading: Math.PI / 2 },
    );
  }

  /**
   * Railway along the east strip: a fenced track between two tunnel portals, a brick station with a
   * forecourt and parking, trees on the grass.
   */
  private railway(rnd: () => number) {
    const R = RAIL, { minX, maxZ } = TOWN_BOUNDS;
    const st = R.station;
    // station building closes the fence between forecourt and platform
    this.addBuilding(['tpl-retro-10x4x3', 10, 4, 3.3], 4, st.x, st.z, Math.PI / 2);
    const fence = (z0: number, z1: number) => this.addProp('fence', 1, R.fenceX, (z0 + z1) / 2, Math.PI / 2, 'box', 0, [z1 - z0, 0.3, 2.2]);
    fence(R.south, st.z - st.d / 2);
    fence(st.z + st.d / 2, R.north);
    // tunnel portals close the track corridor at both ends
    const portal = (z0: number, z1: number) =>
      this.addProp('tunnel-portal', 1, (minX + R.fenceX) / 2, (z0 + z1) / 2, 0, 'box', 0, [R.fenceX - minX, z1 - z0, 9]);
    portal(R.north, maxZ);
    portal(R.south - 16, R.south);
    // parking bays on the forecourt, facing the station
    const f = R.forecourt;
    for (let z = f.z0 + 6; z <= f.z1 - 6; z += PARKING_BAY.width) {
      if (Math.abs(z) < 9) continue;
      const parked = rnd() < 0.3 ? Math.floor(rnd() * 7) : -1;
      this.bays.push({ x: -476, z, heading: -Math.PI / 2, parked });
      if (parked >= 0) this.boxes.push({ minX: -478.3, maxX: -473.7, minZ: z - 1.2, maxZ: z + 1.2, solid: false, top: PARKED_CAR_TOP });
    }
    this.starSpots.push({ x: -485, z: 0, heading: 0 }, { x: -470, z: 250, heading: 0 }, { x: -470, z: -250, heading: 0 });
    // trees behind the track and on the grass between the town and the fence
    for (let k = 0; k < 140; k++) {
      const behind = k % 2 === 0;
      const x = behind ? minX + 4 + rnd() * (R.trackX - 10 - minX - 4) : R.fenceX + 4 + rnd() * (-OUTER - 4 - R.fenceX - 4);
      const z = R.south + rnd() * (R.north - R.south);
      if (!behind && z > f.z0 - 6 && z < f.z1 + 6) continue;
      if (this.circles.some((c) => c.kind === 'tree' && Math.hypot(c.x - x, c.z - z) < 8)) continue;
      this.circles.push({ x, z, r: 0.6, kind: 'tree' });
    }
  }

  /** Airfield in the west strip (see TOWN_AIRPORT): buildings, aircraft, containers, parking and stars. */
  private airfield(rnd: () => number) {
    const A = TOWN_AIRPORT;
    const t = A.terminal, c = A.cargo;
    this.addBuilding(['airport-terminal', t.w, t.d, 16], 1, t.x, t.z, 0);
    this.addBuilding(['airport-cargo', c.w, c.d, 14], 1, c.x, c.z, 0);
    this.addProp('airport-tower', 1, A.tower.x, A.tower.z, 0, 'circle', A.tower.r, [2 * A.tower.r, 2 * A.tower.r, 44]);
    this.addProp('windsock', 1, A.windsock.x, A.windsock.z, 0, 'circle', 0.3, [0.6, 0.6, 6]);
    for (const p of A.planes) {
      const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
      // plane frame → world: left = (fz, -fx)
      const world = (lx: number, lz: number): [number, number] => [p.x + fz * lx + fx * lz, p.z - fx * lx + fz * lz];
      for (const [x0, x1, z0, z1, top] of PLANE_BOXES) {
        const [ax, az] = world(x0, z0), [bx, bz] = world(x1, z1);
        this.boxes.push({ minX: Math.min(ax, bx), maxX: Math.max(ax, bx), minZ: Math.min(az, bz), maxZ: Math.max(az, bz), solid: true, top });
      }
      for (const [lx, lz, r] of PLANE_CIRCLES) {
        const [x, z] = world(lx, lz);
        this.circles.push({ x, z, r, kind: 'prop', top: 3 });
      }
      // the renderer draws it from this prop (w, d = the footprint without wings)
      const turned = Math.abs(fx) > 0.5;
      this.props.push({ model: 'plane', scale: 1, x: p.x - fx * 18.5, z: p.z - fz * 18.5, rot: p.heading, w: turned ? 37 : 4.2, d: turned ? 4.2 : 37, h: 6.5, variant: p.livery });
    }
    // a few containers beside the cargo hall
    for (const [x, z, levels] of [[562, -350, 2], [562, -347, 1], [576, -350, 1], [562, -253, 1], [576, -253, 2]]) {
      this.containerStack(x, z, Math.PI / 2, levels, CONTAINER_40);
    }
    // landside parking towards the town, facing the terminal
    for (let z = A.landside.z0 + 8; z <= A.landside.z1 - 8; z += PARKING_BAY.width) {
      // access lanes to the apron stay free
      if (Math.abs(z - 120) < 10 || Math.abs(z + 130) < 10) continue;
      const parked = rnd() < 0.3 ? Math.floor(rnd() * 7) : -1;
      this.bays.push({ x: 476, z, heading: Math.PI / 2, parked });
      if (parked >= 0) this.boxes.push({ minX: 473.7, maxX: 478.3, minZ: z - 1.2, maxZ: z + 1.2, solid: false, top: PARKED_CAR_TOP });
    }
    this.starSpots.push(
      { x: A.runway.x, z: -150, heading: 0 }, { x: A.runway.x, z: 300, heading: 0 }, { x: A.taxiway.x, z: -200, heading: 0 },
      { x: 610, z: -100, heading: 0 }, { x: 600, z: -300, heading: 0 }, { x: 490, z: 120, heading: Math.PI / 2 },
    );
    // trees on the grass between taxiway and runway and along the north wall
    for (let k = 0; k < 40; k++) {
      const x = A.taxiway.x + 14 + rnd() * (A.runway.x - A.runway.width / 2 - A.taxiway.x - 24);
      const z = A.taxiway.z0 + rnd() * (A.taxiway.z1 - A.taxiway.z0);
      if (A.links.some((l) => Math.abs(z - l) < 18)) continue;
      if (this.circles.some((o) => o.kind === 'tree' && Math.hypot(o.x - x, o.z - z) < 9)) continue;
      this.circles.push({ x, z, r: 0.6, kind: 'tree' });
    }
  }

  /** True on the paved parts of the airfield (runway, taxiway, links, apron, landside). */
  onAirfieldPaving(x: number, z: number) {
    const A = TOWN_AIRPORT, r = A.runway, t = A.taxiway;
    const inRect = (o: { x0: number; x1: number; z0: number; z1: number }) => x >= o.x0 && x <= o.x1 && z >= o.z0 && z <= o.z1;
    if (Math.abs(x - r.x) <= r.width / 2 && z >= r.z0 && z <= r.z1) return true;
    if (Math.abs(x - t.x) <= t.width / 2 && z >= t.z0 - t.width / 2 && z <= t.z1 + t.width / 2) return true;
    if (x >= t.x && x <= r.x && A.links.some((l) => Math.abs(z - l) <= t.width / 2)) return true;
    return inRect(A.apron) || inRect(A.landside);
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
    // harbour apron and station forecourt are paved, the rest outside the old town is grass
    if (z < -OUTER) return 'asphalt';
    const f = RAIL.forecourt;
    if (x < -OUTER) return x >= f.x0 && z >= f.z0 && z <= f.z1 ? 'asphalt' : 'dirt';
    if (x > OUTER && z <= OUTER) return this.onAirfieldPaving(x, z) ? 'asphalt' : 'dirt';
    if (Math.abs(x) > OUTER || Math.abs(z) > OUTER) return 'dirt';
    const b = this.blockAt(x, z);
    if (b?.kind === 'church') return Math.abs(x - b.cx) < 4 || z > b.cz + 33 ? 'asphalt' : 'dirt';
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
   * A small circle (e.g. a projectile) at (x, z) against all obstacles: the push-out direction and
   * depth of the deepest overlap, or null if it is free.
   */
  pointHit(x: number, z: number, r: number): { nx: number; nz: number; pen: number } | null {
    let best: { nx: number; nz: number; pen: number } | null = null;
    const cell = this.cell(x, z);
    if (!cell) return null;
    for (const o of cell.boxes) {
      let nx: number, nz: number, pen: number;
      if (x > o.minX && x < o.maxX && z > o.minZ && z < o.maxZ) {
        const d = [x - o.minX, o.maxX - x, z - o.minZ, o.maxZ - z];
        const m = d.indexOf(Math.min(...d));
        nx = m === 0 ? -1 : m === 1 ? 1 : 0;
        nz = m === 2 ? -1 : m === 3 ? 1 : 0;
        pen = d[m] + r;
      } else {
        const qx = clamp(x, o.minX, o.maxX), qz = clamp(z, o.minZ, o.maxZ);
        const dd = Math.hypot(x - qx, z - qz);
        if (dd >= r || dd < 1e-9) continue;
        nx = (x - qx) / dd;
        nz = (z - qz) / dd;
        pen = r - dd;
      }
      if (!best || pen > best.pen) best = { nx, nz, pen };
    }
    for (const o of cell.circles) {
      const dx = x - o.x, dz = z - o.z, dd = Math.hypot(dx, dz);
      if (dd >= r + o.r) continue;
      const pen = r + o.r - dd;
      if (!best || pen > best.pen) best = { nx: dd > 1e-9 ? dx / dd : 1, nz: dd > 1e-9 ? dz / dd : 0, pen };
    }
    return best;
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
            // flying over a low obstacle: no contact
            if (o.top !== undefined && c.y > o.top) continue;
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
            if (c.y > (o.top ?? CIRCLE_TOP[o.kind])) continue;
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

/** a ramp face higher than this above the car (m) is a wall, lower edges are driven over or landed on */
const RAMP_STEP = 0.7;

/**
 * Does the way from (ax, az) to (bx, bz) run into the face of a ramp? A face, not a slope: the height
 * jumps by more than half a metre within 15 cm (the ramps are at most 60° steep).
 */
function crossesFace(map: TownMap, ax: number, az: number, bx: number, bz: number) {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.15));
  let h = map.heightAt(ax, az);
  for (let i = 1; i <= n; i++) {
    const t = i / n, hn = map.heightAt(ax + (bx - ax) * t, az + (bz - az) * t);
    if (hn - h > 0.5) return true;
    h = hn;
  }
  return false;
}

const townGround: DriveGround = { grip: 1, drag: 0, offroad: false, bankGrip: 0, slope: 0 };

/**
 * One physics step in the town: same driving model as on the tracks, buildings instead of barriers.
 * The ground is flat except for the skate park ramps, where cars climb, jump and land.
 */
export function stepCarTown(c: CarState, spec: CarSpec, inp: CarInput, map: TownMap, dt: number) {
  stepRocket(c, spec, inp, dt, !map.inWater(c.x, c.z));
  const px = c.x, pz = c.z;
  const sp = SURFACE_PROPS[map.surfaceAt(c.x, c.z)];
  townGround.grip = sp.grip;
  townGround.drag = sp.drag;
  const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
  townGround.slope = (map.heightAt(c.x + fx * 0.6, c.z + fz * 0.6) - map.heightAt(c.x - fx * 0.6, c.z - fz * 0.6)) / 1.2;
  const vf = driveCar(c, spec, inp, townGround, dt);
  c.impact = map.collide(c, spec);
  // the side or back face of a ramp is a wall: bounce off instead of being lifted onto the top
  const g = map.heightAt(c.x, c.z);
  const moved = Math.hypot(c.x - px, c.z - pz);
  if (g - c.y > RAMP_STEP && moved > 1e-6 && crossesFace(map, px, pz, c.x, c.z)) {
    const e = 0.4;
    let nx = map.heightAt(c.x - e, c.z) - map.heightAt(c.x + e, c.z), nz = map.heightAt(c.x, c.z - e) - map.heightAt(c.x, c.z + e);
    const n = Math.hypot(nx, nz);
    if (n > 1e-6) {
      nx /= n;
      nz /= n;
    } else {
      // no clear face (a corner): straight back
      nx = (px - c.x) / moved;
      nz = (pz - c.z) / moved;
    }
    c.x = px;
    c.z = pz;
    const vn = c.vx * nx + c.vz * nz;
    if (vn < 0) {
      c.vx -= nx * vn * 1.3;
      c.vz -= nz * vn * 1.3;
      c.impact = Math.max(c.impact, -vn);
    }
  }
  // beyond the quay edge there is no ground: the car falls into the water
  updateVertical(c, map.inWater(c.x, c.z) ? -100 : map.heightAt(c.x, c.z), dt, true);
  updateGearbox(c, spec, vf, dt);
}
