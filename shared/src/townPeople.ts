import { mulberry32 } from './math';
import { BLOCK_HALF, BLOCK_INNER, GRID, SIDEWALK, type Block, type TownMap } from './town';

/**
 * Pedestrians of the practice town: women, men and children walking in the parks, on the squares,
 * along the sidewalks (some with a dog or a pram), between the parking lot and the Spidi-Markt and
 * through the cemetery; a few sit on benches. Every route is checked against the town's obstacles,
 * and where someone is follows from the game time alone (like the trains), so nothing has to be
 * stored or sent. They are scenery: cars do not hit them – the client lets them step aside.
 */

export type PersonKind = 'adult' | 'child' | 'dog' | 'pram' | 'sitter';

export interface PersonRoute {
  kind: PersonKind;
  /** index into the people models (0–11: female a, male a, female b, …) */
  model: number;
  pts: { x: number; z: number }[];
  /** closed loop, or there and back (with a pause at both ends) */
  loop: boolean;
  /** pause at the ends of a there-and-back route (s) */
  pause: number;
  speed: number;
  phase: number;
  /** sitters: facing direction */
  heading?: number;
}

export interface PersonPose {
  x: number;
  z: number;
  heading: number;
  moving: boolean;
}

export const PEOPLE_MODEL_COUNT = 12;

function length(pts: { x: number; z: number }[], loop: boolean) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  if (loop) l += Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z);
  return l;
}

/** Point and heading at distance d along the polyline. */
function along(pts: { x: number; z: number }[], loop: boolean, d: number): PersonPose {
  const n = loop ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const l = Math.hypot(b.x - a.x, b.z - a.z);
    if (d <= l || i === n - 1) {
      const f = l > 0 ? Math.min(1, d / l) : 0;
      return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, heading: Math.atan2(b.x - a.x, b.z - a.z), moving: true };
    }
    d -= l;
  }
  return { ...pts[0], heading: 0, moving: false };
}

/** Where a pedestrian is at game time t. */
export function personAt(r: PersonRoute, t: number): PersonPose {
  if (r.kind === 'sitter') return { ...r.pts[0], heading: r.heading ?? 0, moving: false };
  const len = length(r.pts, r.loop);
  if (r.loop) return along(r.pts, true, (((t * r.speed + r.phase) % len) + len) % len);
  // there and back: walk, pause, walk back, pause
  const walk = len / r.speed, cycle = 2 * (walk + r.pause);
  const u = (((t + r.phase / r.speed) % cycle) + cycle) % cycle;
  if (u < walk) return along(r.pts, false, u * r.speed);
  if (u < walk + r.pause) return { ...along(r.pts, false, len), moving: false };
  const back = [...r.pts].reverse();
  if (u < 2 * walk + r.pause) return along(back, false, (u - walk - r.pause) * r.speed);
  return { ...along(back, false, len), moving: false };
}

/** Build all pedestrian routes of the town (deterministic). */
export function townPeople(town: TownMap, seed = 4242): PersonRoute[] {
  const rnd = mulberry32(seed);
  const out: PersonRoute[] = [];
  // (pointHit looks into one grid cell: probe around the point too, for obstacles across a cell border)
  const free = (x: number, z: number) => [[0, 0], [0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]].every(([dx, dz]) => !town.pointHit(x + dx, z + dz, 0.8));
  /** every metre of the way is clear of obstacles */
  const clear = (pts: { x: number; z: number }[], loop: boolean) => {
    const n = loop ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const l = Math.hypot(b.x - a.x, b.z - a.z);
      for (let s = 0; s <= l; s += 0.5) if (!free(a.x + ((b.x - a.x) * s) / l, a.z + ((b.z - a.z) * s) / l)) return false;
    }
    return true;
  };
  const model = () => Math.floor(rnd() * PEOPLE_MODEL_COUNT);
  const add = (kind: PersonKind, pts: { x: number; z: number }[], loop: boolean, extra: Partial<PersonRoute> = {}) => {
    const speed = kind === 'child' ? 1.6 + rnd() * 0.6 : kind === 'pram' ? 1.0 + rnd() * 0.2 : 1.1 + rnd() * 0.4;
    out.push({ kind, model: model(), pts, loop, pause: 3 + rnd() * 5, speed, phase: rnd() * 1000, ...extra });
  };
  /** a loop of k random points inside the block (half size h around its centre), retried until clear */
  const wander = (b: Block, h: number, k: number) => {
    for (let tries = 0; tries < 120; tries++) {
      const pts = Array.from({ length: k }, (_, i) => {
        // spread around the centre so the loop does not cross itself much
        const a = (i / k) * Math.PI * 2 + rnd() * 0.8, r = h * (0.35 + rnd() * 0.65);
        return { x: b.cx + Math.cos(a) * r, z: b.cz + Math.sin(a) * r };
      });
      if (pts.every((p) => free(p.x, p.z)) && clear(pts, true)) return pts;
    }
    return null;
  };
  /** one side of a block along its sidewalk (side 0–3), the clear stretch of it around the middle */
  const sidewalk = (b: Block, side: number) => {
    const o = BLOCK_INNER + SIDEWALK / 2;
    const [ax, az] = [[-1, 1], [1, 1], [1, -1], [-1, -1]][side];
    const [bx, bz] = [[1, 1], [1, -1], [-1, -1], [-1, 1]][side];
    const a = { x: b.cx + ax * o, z: b.cz + az * o }, c = { x: b.cx + bx * o, z: b.cz + bz * o };
    // shorten from both ends until the stretch is clear (lamps stand at the corners)
    for (let cut = 6; cut < 30; cut += 4) {
      const f = cut / (2 * o);
      const pts = [{ x: a.x + (c.x - a.x) * f, z: a.z + (c.z - a.z) * f }, { x: c.x + (a.x - c.x) * f, z: c.z + (a.z - c.z) * f }];
      if (clear(pts, false)) return pts;
    }
    return null;
  };

  const blocks = town.blocks;
  // parks: strolling grown-ups, children running around, dog walkers
  for (const b of blocks.filter((x) => x.kind === 'park')) {
    for (const kind of ['adult', 'adult', 'adult', 'child', 'dog'] as PersonKind[]) {
      const pts = wander(b, BLOCK_INNER - 4, 5);
      if (pts) add(kind, pts, true);
    }
  }
  // squares with fountain and benches (the courtyards of the old town and between the towers)
  for (const b of blocks.filter((x) => x.kind === 'plaza' || x.kind === 'towerplaza')) {
    for (const kind of ['adult', 'adult', 'adult', 'child', 'adult', 'pram'] as PersonKind[]) {
      const pts = wander(b, BLOCK_INNER - 6, 4);
      if (pts) add(kind, pts, true);
    }
  }
  // somebody sits on a few of the benches
  const benches = town.props.filter((p) => /bench/.test(p.model) && !p.model.startsWith('sk-'));
  for (const p of benches) {
    if (rnd() < 0.7) out.push({ kind: 'sitter', model: model(), pts: [{ x: p.x, z: p.z }], loop: false, pause: 0, speed: 0, phase: 0, heading: p.rot });
  }
  // gardens of the houses: now and then someone out on the lawn
  for (const b of blocks.filter((x) => x.kind === 'house')) {
    if (rnd() < 0.5) continue;
    const pts = wander(b, BLOCK_INNER - 14, 4);
    if (pts) add(rnd() < 0.4 ? 'child' : 'adult', pts, true);
  }
  // sidewalks: walkers, dog walkers and prams along the blocks of the town, there and back
  const streets = blocks.filter((b) => b.kind !== 'practice' && b.kind !== 'industry' && b.kind !== 'power');
  const sidewalkKinds: PersonKind[] = ['adult', 'dog', 'adult', 'pram', 'adult', 'child', 'adult', 'dog', 'adult', 'pram'];
  for (let k = 0; k < 40 && streets.length; k++) {
    for (let tries = 0; tries < 6; tries++) {
      const pts = sidewalk(streets[Math.floor(rnd() * streets.length)], Math.floor(rnd() * 4));
      if (!pts) continue;
      add(sidewalkKinds[k % sidewalkKinds.length], rnd() < 0.5 ? pts : [...pts].reverse(), false, { pause: 1 + rnd() * 3 });
      break;
    }
  }
  // shoppers: from a parking bay across the street to the Spidi-Markt entrance and back
  for (const m of town.buildings.filter((x) => x.model === 'supermarket')) {
    const fx = Math.sin(m.rot), fz = Math.cos(m.rot);
    const depth = Math.abs(fx) > 0.5 ? m.w : m.d;
    const door = { x: m.x + fx * (depth / 2 + 1.5), z: m.z + fz * (depth / 2 + 1.5) };
    // bays of the parking lot in front (the next block in the entrance direction)
    const lot = town.bays.filter((b) => b.parked < 0 && Math.hypot(b.x - (m.x + fx * GRID), b.z - (m.z + fz * GRID)) < BLOCK_HALF + 25);
    let n = 0;
    for (let tries = 0; tries < 40 && n < 5; tries++) {
      const bay = lot[Math.floor(rnd() * lot.length)];
      if (!bay) break;
      // from a free bay (where the car would be) straight to the door
      const start = { x: bay.x, z: bay.z };
      const pts = [start, { x: door.x + (rnd() - 0.5) * 6, z: door.z + (rnd() - 0.5) * 6 }];
      if (!free(start.x, start.z) || !clear(pts, false)) continue;
      add(rnd() < 0.2 ? 'child' : 'adult', pts, false, { pause: 4 + rnd() * 8 });
      n++;
    }
  }
  // cemetery: along the path in the middle and inside the fence
  for (const b of blocks.filter((x) => x.kind === 'church')) {
    const x0 = b.cx - 36, x1 = b.cx + 36, z0 = b.cz - 38, z1 = b.cz - 8;
    const lane = [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
    for (let k = 0; k < 3; k++) {
      if (clear(lane, true)) add('adult', k % 2 ? lane : [...lane].reverse(), true);
    }
    const middle = [{ x: b.cx + 1, z: b.cz - 44 }, { x: b.cx + 1, z: b.cz - 5 }];
    for (let k = 0; k < 2; k++) if (clear(middle, false)) add('adult', middle, false, { pause: 6 + rnd() * 10 });
  }
  return out;
}
