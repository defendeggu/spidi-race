import { clamp, lerp } from './math';

export type TrackTheme = 'alpine' | 'coast' | 'city' | 'speedway' | 'desert' | 'forest' | 'table';
export type CarClass = 'road' | 'offroad' | 'micro';
export type Surface = 'asphalt' | 'dirt' | 'sand' | 'mud' | 'water';
export const SURFACES: Surface[] = ['asphalt', 'dirt', 'sand', 'mud', 'water'];

/** Grip factor, rolling drag (per m/s) and visual roughness of each surface. */
export const SURFACE_PROPS: Record<Surface, { grip: number; drag: number; rough: number }> = {
  asphalt: { grip: 1, drag: 0, rough: 0 },
  dirt: { grip: 0.8, drag: 0.03, rough: 0.6 },
  sand: { grip: 0.72, drag: 0.07, rough: 0.5 },
  mud: { grip: 0.55, drag: 0.24, rough: 0.9 },
  water: { grip: 0.6, drag: 0.24, rough: 0.4 },
};

/**
 * A jump: at control-point position u the road rises over `up` metres to `height` (parabolic kicker),
 * optionally followed by a `gap` (pit `depth` metres deep, e.g. a riverbed) and a landing slope of `land` metres.
 */
export interface JumpDef {
  u: number;
  up: number;
  height: number;
  gap?: number;
  depth?: number;
  land: number;
}

export interface TrackDef {
  id: string;
  name: string;
  description: string;
  theme: TrackTheme;
  /** default road width in metres */
  width: number;
  /** closed loop of control points: [x, z, height, width?] */
  points: number[][];
  /** avalanche galleries: [fromU, toU, side] with U in control-point units, side = mountain side (-1 left / +1 right) */
  galleries?: number[][];
  defaultLaps: number;
  seed: number;
  /** road banking in corners: slope = -curvature * gain, clamped to ±max (default gain 4, max 0.08) */
  banking?: { gain: number; max: number };
  /** vehicle class allowed on this track (default 'road') */
  class?: CarClass;
  /** default surface (default 'asphalt') and sections with other surfaces: [fromU, toU, surface] */
  surface?: Surface;
  surfaces?: [number, number, Surface][];
  jumps?: JumpDef[];
  /** initial camera: behind the car (default) or bird's-eye view */
  camera?: 'chase' | 'topdown';
}

export interface Projection {
  idx: number;
  t: number;
  s: number;
  /** signed lateral offset, positive = right of the driving direction */
  lat: number;
  y: number;
  halfWidth: number;
  rx: number;
  rz: number;
  tx: number;
  tz: number;
}

export interface TrackPoint {
  x: number;
  y: number;
  z: number;
  heading: number;
  idx: number;
}

/** Distance from road edge to the barrier. */
export const WALL_OFFSET = 1.6;
const SPACING = 2;
const SEARCH_WINDOW = 20;

function centripetal(p0: number[], p1: number[], p2: number[], p3: number[], t: number, out: number[]) {
  const d = (a: number[], b: number[]) => Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])) || 1e-4;
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const tt = lerp(t1, t2, t);
  for (let k = 0; k < 3; k++) {
    const a1 = ((t1 - tt) * p0[k] + (tt - t0) * p1[k]) / (t1 - t0);
    const a2 = ((t2 - tt) * p1[k] + (tt - t1) * p2[k]) / (t2 - t1);
    const a3 = ((t3 - tt) * p2[k] + (tt - t2) * p3[k]) / (t3 - t2);
    const b1 = ((t2 - tt) * a1 + (tt - t0) * a2) / (t2 - t0);
    const b2 = ((t3 - tt) * a2 + (tt - t1) * a3) / (t3 - t1);
    out[k] = ((t2 - tt) * b1 + (tt - t1) * b2) / (t2 - t1);
  }
}

function smoothCircular(a: Float64Array, radius: number, passes: number) {
  const n = a.length;
  const tmp = new Float64Array(n);
  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += a[(i + k + n) % n];
      tmp[i] = sum / (radius * 2 + 1);
    }
    a.set(tmp);
  }
}

/**
 * A closed race track: centripetal Catmull-Rom spline through the control points,
 * resampled at equal arc length (~2 m) in the horizontal plane.
 */
export class Track {
  readonly def: TrackDef;
  readonly n: number;
  readonly ds: number;
  readonly length: number;
  readonly px: Float64Array;
  readonly py: Float64Array;
  readonly pz: Float64Array;
  readonly tx: Float64Array;
  readonly tz: Float64Array;
  readonly rx: Float64Array;
  readonly rz: Float64Array;
  readonly hw: Float64Array;
  readonly curv: Float64Array;
  readonly bank: Float64Array;
  readonly grade: Float64Array;
  readonly gallery: Int8Array;
  /** surface index into SURFACES per sample */
  readonly surface: Uint8Array;
  /** extra height of jumps/pits per sample (already included in py) */
  readonly jumpH: Float64Array;
  readonly u: Float64Array;
  readonly bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, minY: Infinity, maxY: -Infinity };

  constructor(def: TrackDef) {
    this.def = def;
    const P = def.points.map((p) => [p[0], p[1], p[2]]);
    const m = P.length;
    const SUB = 64;
    const dx: number[] = [], dz: number[] = [], dh: number[] = [], du: number[] = [];
    const tmp = [0, 0, 0];
    for (let i = 0; i < m; i++) {
      for (let k = 0; k < SUB; k++) {
        centripetal(P[(i - 1 + m) % m], P[i], P[(i + 1) % m], P[(i + 2) % m], k / SUB, tmp);
        dx.push(tmp[0]);
        dz.push(tmp[1]);
        dh.push(tmp[2]);
        du.push(i + k / SUB);
      }
    }
    const D = dx.length;
    const cum = new Float64Array(D + 1);
    for (let j = 0; j < D; j++) {
      const k = (j + 1) % D;
      cum[j + 1] = cum[j] + Math.hypot(dx[k] - dx[j], dz[k] - dz[j]);
    }
    this.length = cum[D];
    const n = (this.n = Math.round(this.length / SPACING));
    this.ds = this.length / n;

    const alloc = () => new Float64Array(n);
    this.px = alloc(); this.py = alloc(); this.pz = alloc();
    this.tx = alloc(); this.tz = alloc(); this.rx = alloc(); this.rz = alloc();
    this.hw = alloc(); this.curv = alloc(); this.bank = alloc(); this.grade = alloc();
    this.gallery = new Int8Array(n);
    this.surface = new Uint8Array(n);
    this.jumpH = alloc();
    const u = (this.u = alloc());

    let seg = 0;
    for (let j = 0; j < n; j++) {
      const s = j * this.ds;
      while (cum[seg + 1] < s) seg++;
      const f = (s - cum[seg]) / (cum[seg + 1] - cum[seg] || 1);
      const a = seg, b = (seg + 1) % D;
      this.px[j] = lerp(dx[a], dx[b], f);
      this.pz[j] = lerp(dz[a], dz[b], f);
      this.py[j] = lerp(dh[a], dh[b], f);
      u[j] = lerp(du[a], b === 0 ? m : du[b], f);
    }

    for (let j = 0; j < n; j++) {
      const i0 = Math.floor(u[j]) % m;
      const w0 = def.points[i0][3] ?? def.width;
      const w1 = def.points[(i0 + 1) % m][3] ?? def.width;
      this.hw[j] = lerp(w0, w1, u[j] - Math.floor(u[j])) / 2;
      for (const g of def.galleries ?? []) if (u[j] >= g[0] && u[j] <= g[1]) this.gallery[j] = g[2] >= 0 ? 1 : -1;
      this.surface[j] = SURFACES.indexOf(def.surface ?? 'asphalt');
      for (const [a, b, sf] of def.surfaces ?? []) if (u[j] >= a && u[j] <= b) this.surface[j] = SURFACES.indexOf(sf);
    }
    smoothCircular(this.py, 2, 3);
    // jumps are added after smoothing so the kicker lip stays sharp
    for (const jd of def.jumps ?? []) {
      let start = 0;
      while (start < n - 1 && u[start] < jd.u) start++;
      const gap = jd.gap ?? 0, depth = jd.depth ?? 0;
      const total = jd.up + gap + jd.land;
      for (let k = 0; k * this.ds <= total; k++) {
        const d = k * this.ds;
        let h: number;
        if (d <= jd.up) h = jd.height * (d / jd.up) ** 2;
        else if (d <= jd.up + gap) h = -depth;
        else h = jd.height * 0.7 * (1 + Math.cos(Math.PI * Math.min(1, (d - jd.up - gap) / jd.land))) / 2;
        this.jumpH[(start + k) % n] += h;
      }
    }
    for (let j = 0; j < n; j++) this.py[j] += this.jumpH[j];
    smoothCircular(this.hw, 3, 2);

    for (let j = 0; j < n; j++) {
      const a = (j - 1 + n) % n, b = (j + 1) % n;
      const tx = this.px[b] - this.px[a], tz = this.pz[b] - this.pz[a];
      const l = Math.hypot(tx, tz) || 1;
      this.tx[j] = tx / l;
      this.tz[j] = tz / l;
      this.rx[j] = -this.tz[j];
      this.rz[j] = this.tx[j];
      this.grade[j] = (this.py[b] - this.py[a]) / (2 * this.ds);
    }
    for (let j = 0; j < n; j++) {
      const a = (j - 1 + n) % n, b = (j + 1) % n;
      this.curv[j] = ((this.tx[b] - this.tx[a]) * this.rx[j] + (this.tz[b] - this.tz[a]) * this.rz[j]) / (2 * this.ds);
    }
    smoothCircular(this.curv, 3, 2);
    const bk = def.banking ?? { gain: 4, max: 0.08 };
    for (let j = 0; j < n; j++) this.bank[j] = clamp(-this.curv[j] * bk.gain, -bk.max, bk.max);
    smoothCircular(this.bank, 4, 2);

    const bd = this.bounds;
    for (let j = 0; j < n; j++) {
      bd.minX = Math.min(bd.minX, this.px[j]); bd.maxX = Math.max(bd.maxX, this.px[j]);
      bd.minZ = Math.min(bd.minZ, this.pz[j]); bd.maxZ = Math.max(bd.maxZ, this.pz[j]);
      bd.minY = Math.min(bd.minY, this.py[j]); bd.maxY = Math.max(bd.maxY, this.py[j]);
    }
  }

  surfaceAt(i: number): Surface {
    return SURFACES[this.surface[i]];
  }

  get carClass(): CarClass {
    return this.def.class ?? 'road';
  }

  /** Extra lateral grip (m/s²) from the road's banking at sample i. */
  bankGrip(i: number) {
    return 9.81 * Math.abs(this.bank[i]) * 0.9;
  }

  get maxHalfWidth() {
    let m = 0;
    for (let j = 0; j < this.n; j++) m = Math.max(m, this.hw[j]);
    return m;
  }

  /** Project a world position onto the track. With a hint index only nearby segments are searched. */
  project(x: number, z: number, hint = -1): Projection {
    const n = this.n;
    const count = hint < 0 ? n : SEARCH_WINDOW * 2 + 1;
    const start = hint < 0 ? 0 : hint - SEARCH_WINDOW;
    let best = 0, bestT = 0, bestD = Infinity;
    for (let k = 0; k < count; k++) {
      const i = (((start + k) % n) + n) % n;
      const j = i + 1 === n ? 0 : i + 1;
      const ax = this.px[i], az = this.pz[i];
      const bx = this.px[j] - ax, bz = this.pz[j] - az;
      const t = clamp(((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz), 0, 1);
      const cx = ax + bx * t - x, cz = az + bz * t - z;
      const d = cx * cx + cz * cz;
      if (d < bestD) {
        bestD = d;
        best = i;
        bestT = t;
      }
    }
    return this.frame(best, bestT, x, z);
  }

  private frame(i: number, t: number, x: number, z: number): Projection {
    const j = i + 1 === this.n ? 0 : i + 1;
    const cx = lerp(this.px[i], this.px[j], t), cz = lerp(this.pz[i], this.pz[j], t);
    let rx = lerp(this.rx[i], this.rx[j], t), rz = lerp(this.rz[i], this.rz[j], t);
    const l = Math.hypot(rx, rz) || 1;
    rx /= l;
    rz /= l;
    const lat = (x - cx) * rx + (z - cz) * rz;
    return {
      idx: i,
      t,
      s: (i + t) * this.ds,
      lat,
      y: lerp(this.py[i], this.py[j], t) + lat * lerp(this.bank[i], this.bank[j], t),
      halfWidth: lerp(this.hw[i], this.hw[j], t),
      rx,
      rz,
      tx: rz,
      tz: -rx,
    };
  }

  /** World position at arc length s and lateral offset lat. */
  pointAt(s: number, lat = 0): TrackPoint {
    const L = this.length;
    s = ((s % L) + L) % L;
    const f = s / this.ds;
    const i = Math.floor(f) % this.n;
    const t = f - Math.floor(f);
    const j = i + 1 === this.n ? 0 : i + 1;
    const rx = lerp(this.rx[i], this.rx[j], t), rz = lerp(this.rz[i], this.rz[j], t);
    const x = lerp(this.px[i], this.px[j], t) + rx * lat;
    const z = lerp(this.pz[i], this.pz[j], t) + rz * lat;
    const y = lerp(this.py[i], this.py[j], t) + lat * lerp(this.bank[i], this.bank[j], t);
    return { x, y, z, heading: Math.atan2(lerp(this.tx[i], this.tx[j], t), lerp(this.tz[i], this.tz[j], t)), idx: i };
  }

  /** Surface normal of the (banked, sloped) road at sample i. */
  upAt(i: number, out: { x: number; y: number; z: number }) {
    const ax = this.rx[i], ay = this.bank[i], az = this.rz[i];
    const bx = this.tx[i], by = this.grade[i], bz = this.tz[i];
    const x = ay * bz - az * by, y = az * bx - ax * bz, z = ax * by - ay * bx;
    const l = Math.hypot(x, y, z) || 1;
    out.x = x / l;
    out.y = y / l;
    out.z = z / l;
    return out;
  }
}

/** Starting grid position for slot k (0 = pole). */
export function gridPosition(track: Track, slot: number) {
  const row = Math.floor(slot / 2);
  const side = slot % 2 === 0 ? -1 : 1;
  const s = -12 - row * 9 - (slot % 2) * 3;
  const p = track.pointAt(s, side * track.hw[0] * 0.45);
  return { ...p, s };
}
