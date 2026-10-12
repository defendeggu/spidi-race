import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  BLOCK_HALF, BLOCK_INNER, getTown, LINE_COUNT, LINES, mulberry32, PARKING_BAY, ROAD_HW, SIDEWALK, TOWN_HALF, TRAFFIC_MODELS,
  type TownMap,
} from '@spidi/shared';
import { getTexture, type TextureName } from './assets';
import { colored, fallback, instanced, towerGeo, type Variant } from './scenery';
import { sky, THEMES } from './world';

export interface TownWorld {
  town: TownMap;
  scene: THREE.Scene;
  /** container for cars, stars and other per-session objects */
  dynamic: THREE.Group;
}

/** Axis-aligned flat rectangles collected into one mesh; uv in metres. */
class Quads {
  private pos: number[] = [];
  private uv: number[] = [];

  add(x0: number, z0: number, x1: number, z1: number, y = 0) {
    const a = [x0, y, z0], b = [x0, y, z1], c = [x1, y, z0], d = [x1, y, z1];
    this.pos.push(...a, ...b, ...c, ...c, ...b, ...d);
    this.uv.push(x0, z0, x0, z1, x1, z0, x1, z0, x0, z1, x1, z1);
  }

  mesh(mat: THREE.Material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();
    return new THREE.Mesh(g, mat);
  }
}

/** Lambert material with a CC0 texture repeating every `metres` (or a plain colour without assets). */
function ground(tex: TextureName, metres: number, tint: string, plain: string) {
  const src = getTexture(tex);
  let map: THREE.Texture | null = null;
  if (src) {
    map = src.clone();
    map.needsUpdate = true;
    map.repeat.set(1 / metres, 1 / metres);
  }
  return new THREE.MeshLambertMaterial({ map, color: map ? tint : plain });
}

const TREES: Variant[] = [
  { model: 'tree_default', geo: fallback.round, scale: 6 },
  { model: 'tree_oak', geo: fallback.round, scale: 6 },
];

function addVariants(group: THREE.Group, variants: Variant[], buckets: THREE.Matrix4[][]) {
  variants.forEach((v, i) => instanced(v, buckets[i]).forEach((m) => group.add(m)));
}

let cached: TownWorld | null = null;

export function getTownWorld(): TownWorld {
  if (cached) return cached;
  const town = getTown();
  const theme = THEMES.city;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(theme.horizon);
  scene.fog = new THREE.Fog(theme.fog, 250, theme.fogFar);
  scene.add(sky(theme.skyTop, theme.horizon));
  scene.add(new THREE.HemisphereLight('#dfefff', theme.ground, 1.4));
  const sun = new THREE.DirectionalLight(theme.sun, 2.2);
  sun.position.set(-300, 500, -200);
  scene.add(sun);
  const rnd = mulberry32(town.seed + 11);

  // ---------------------------------------------------------------- ground: streets, sidewalks, block interiors
  const ext = LINES[LINE_COUNT - 1] + ROAD_HW;
  const road = new Quads(), walk = new Quads(), grass = new Quads(), paved = new Quads(), lot = new Quads();
  for (const L of LINES) {
    road.add(-ext, L - ROAD_HW, ext, L + ROAD_HW);
    road.add(L - ROAD_HW, -ext, L + ROAD_HW, ext);
  }
  const outer = ext + SIDEWALK;
  walk.add(-outer, ext, outer, outer);
  walk.add(-outer, -outer, outer, -ext);
  walk.add(ext, -ext, outer, ext);
  walk.add(-outer, -ext, -ext, ext);
  const far = TOWN_HALF + 400;
  grass.add(-far, outer, far, far);
  grass.add(-far, -far, far, -outer);
  grass.add(outer, -outer, far, outer);
  grass.add(-far, -outer, -outer, outer);
  const H = BLOCK_HALF, I = BLOCK_INNER;
  for (const b of town.blocks) {
    const { cx, cz } = b;
    walk.add(cx - H, cz - H, cx + H, cz - I);
    walk.add(cx - H, cz + I, cx + H, cz + H);
    walk.add(cx - H, cz - I, cx - I, cz + I);
    walk.add(cx + I, cz - I, cx + H, cz + I);
    const q = b.kind === 'house' || b.kind === 'park' ? grass : b.kind === 'parking' || b.kind === 'practice' ? lot : paved;
    q.add(cx - I, cz - I, cx + I, cz + I);
  }
  scene.add(road.mesh(ground('asphalt', 7, '#9a9a9a', '#55575a')));
  scene.add(lot.mesh(ground('asphalt', 7, '#b4b4b4', '#66686b')));
  scene.add(walk.mesh(ground('concrete', 4, '#e0dcd4', '#b9b4aa')));
  scene.add(paved.mesh(ground('concrete', 6, '#a8a49c', '#8f8b84')));
  scene.add(grass.mesh(ground('grass', 6, '#b8d49a', '#5f8a3c')));

  // ---------------------------------------------------------------- markings
  const marks = new Quads(), yellow = new Quads();
  const MY = 0.02;
  const ZEBRA = [ROAD_HW + 1, ROAD_HW + 4];
  for (const L of LINES) {
    for (let k = 0; k < LINE_COUNT - 1; k++) {
      // dashed centre line between two intersections
      for (let a = LINES[k] + ZEBRA[1] + 2; a + 3 < LINES[k + 1] - ZEBRA[1] - 2; a += 6) {
        marks.add(a, L - 0.08, a + 3, L + 0.08, MY);
        marks.add(L - 0.08, a, L + 0.08, a + 3, MY);
      }
    }
    for (const M of LINES) {
      // zebra crossings on every arm of the intersection (L, M)
      for (const dir of [-1, 1]) {
        const n0 = L + dir * ZEBRA[0], n1 = L + dir * ZEBRA[1];
        const m0 = M + dir * ZEBRA[0], m1 = M + dir * ZEBRA[1];
        for (let s = -ROAD_HW + 0.6; s < ROAD_HW - 0.5; s += 1.1) {
          if (Math.abs(n1) <= ext) marks.add(Math.min(n0, n1), M + s, Math.max(n0, n1), M + s + 0.55, MY);
          if (Math.abs(m1) <= ext) marks.add(L + s, Math.min(m0, m1), L + s + 0.55, Math.max(m0, m1), MY);
        }
      }
    }
  }
  // parking bays: separating lines and a line at the back of each bay
  for (const bay of town.bays) {
    // bays point along x or z; f = into the bay, r = across
    const fx = Math.round(Math.sin(bay.heading)), fz = Math.round(Math.cos(bay.heading));
    const rx = fz, rz = fx;
    const hw = PARKING_BAY.width / 2, hl = PARKING_BAY.length / 2;
    const rect = (cx: number, cz: number, ex: number, ez: number) => marks.add(cx - ex, cz - ez, cx + ex, cz + ez, MY);
    for (const sd of [-1, 1]) {
      rect(bay.x + rx * sd * hw, bay.z + rz * sd * hw, Math.abs(rx) * 0.06 + Math.abs(fx) * hl, Math.abs(rz) * 0.06 + Math.abs(fz) * hl);
    }
    rect(bay.x + fx * hl, bay.z + fz * hl, Math.abs(rx) * hw + Math.abs(fx) * 0.06, Math.abs(rz) * hw + Math.abs(fz) * 0.06);
  }
  // practice square: yellow start box and a painted circle around the cone ring
  const p = town.practice;
  const s0 = town.spawn(0), s1 = town.spawn(1);
  for (const sp of [s0, s1]) {
    yellow.add(sp.x - 3, sp.z - 1.6, sp.x + 3, sp.z - 1.45, MY);
    yellow.add(sp.x - 3, sp.z + 1.45, sp.x + 3, sp.z + 1.6, MY);
  }
  for (let k = 0; k < 72; k += 2) {
    const a = (k / 72) * Math.PI * 2;
    const x = p.cx + Math.cos(a) * 18, z = p.cz + 22 + Math.sin(a) * 18;
    yellow.add(x - 0.4, z - 0.4, x + 0.4, z + 0.4, MY);
  }
  const markMat = (color: string) => new THREE.MeshLambertMaterial({ color, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  scene.add(marks.mesh(markMat('#eeeeea')));
  scene.add(yellow.mesh(markMat('#f0c420')));

  // ---------------------------------------------------------------- buildings and trees
  const city = new THREE.Group();
  const trees = TREES.map(() => [] as THREE.Matrix4[]);
  const fences: THREE.BufferGeometry[] = [];
  const o = new THREE.Object3D();
  for (const c of town.circles) {
    if (c.kind !== 'tree') continue;
    o.position.set(c.x, 0, c.z);
    o.rotation.set(0, rnd() * Math.PI * 2, 0);
    o.scale.setScalar(0.85 + rnd() * 0.35);
    o.updateMatrix();
    trees[Math.floor(rnd() * TREES.length)].push(o.matrix.clone());
  }
  o.scale.setScalar(1);
  // one instanced variant per model; without assets a box of the building's size stands in
  const byModel = new Map<string, { v: Variant; m: THREE.Matrix4[] }>();
  for (const b of town.buildings) {
    let e = byModel.get(b.model);
    if (!e) {
      const turned = Math.abs(Math.sin(b.rot)) > 0.5;
      const w = turned ? b.d : b.w, d = turned ? b.w : b.d, h = b.h;
      const color = ['#b9b2a6', '#9fa8b3', '#d9c9b0', '#c9d4dc'][byModel.size % 4];
      const geo = b.model.startsWith('building-type')
        ? () => mergeGeometries([
          colored(new THREE.BoxGeometry(w, h * 0.65, d).translate(0, h * 0.325, 0), color),
          colored(new THREE.ConeGeometry(Math.hypot(w, d) / 2, h * 0.35, 4).rotateY(Math.PI / 4).scale(w / Math.hypot(w, d), 1, d / Math.hypot(w, d)).translate(0, h * 0.825, 0), '#8a4b38'),
        ])!
        : () => colored(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), color);
      byModel.set(b.model, (e = { v: { model: b.model, geo, scale: b.scale }, m: [] }));
    }
    o.position.set(b.x, 0, b.z);
    o.rotation.set(0, b.rot, 0);
    o.updateMatrix();
    e.m.push(o.matrix.clone());
  }
  for (const { v, m } of byModel.values()) instanced(v, m).forEach((x) => city.add(x));
  addVariants(city, TREES, trees);
  addVariants(city, TREES, trees);

  // the wall around the town and a skyline behind it
  const W = TOWN_HALF, WT = 4, WH = 3;
  fences.push(
    colored(new THREE.BoxGeometry(2 * W + 2 * WT, WH, WT).translate(0, WH / 2, W + WT / 2), '#b8b2a6'),
    colored(new THREE.BoxGeometry(2 * W + 2 * WT, WH, WT).translate(0, WH / 2, -W - WT / 2), '#b8b2a6'),
    colored(new THREE.BoxGeometry(WT, WH, 2 * W).translate(W + WT / 2, WH / 2, 0), '#b8b2a6'),
    colored(new THREE.BoxGeometry(WT, WH, 2 * W).translate(-W - WT / 2, WH / 2, 0), '#b8b2a6'),
  );
  city.add(new THREE.Mesh(mergeGeometries(fences)!, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  const skyline: Variant[] = 'acfhl'.split('').map((c, i) => ({ model: `low-detail-building-${c}`, geo: towerGeo(40 + i * 6, '#8d97a3'), scale: 26 }));
  const sky2 = skyline.map(() => [] as THREE.Matrix4[]);
  for (let k = 0; k < 90; k++) {
    const a = rnd() * Math.PI * 2, r = W + 80 + rnd() * 250;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (Math.max(Math.abs(x), Math.abs(z)) < W + 60) continue;
    o.position.set(x, 0, z);
    o.rotation.set(0, rnd() * Math.PI * 2, 0);
    o.scale.setScalar(0.8 + rnd() * 0.6);
    o.updateMatrix();
    sky2[Math.floor(rnd() * skyline.length)].push(o.matrix.clone());
  }
  o.scale.setScalar(1);
  addVariants(city, skyline, sky2);

  // ---------------------------------------------------------------- street furniture: lamps, cones, parked cars
  const pole = mergeGeometries([
    colored(new THREE.CylinderGeometry(0.12, 0.16, 7, 6).translate(0, 3.5, 0), '#3d4248'),
    colored(new THREE.BoxGeometry(0.15, 0.15, 2.4).translate(0, 7, 1.1), '#3d4248'),
    colored(new THREE.BoxGeometry(0.5, 0.15, 0.9).translate(0, 6.9, 2.1), '#fff4cc'),
  ])!;
  const cone = mergeGeometries([
    colored(new THREE.BoxGeometry(0.7, 0.06, 0.7).translate(0, 0.03, 0), '#222222'),
    colored(new THREE.ConeGeometry(0.3, 0.3, 10).translate(0, 0.21, 0), '#ff6a13'),
    colored(new THREE.CylinderGeometry(0.15, 0.22, 0.18, 10).translate(0, 0.45, 0), '#f4f4f4'),
    colored(new THREE.ConeGeometry(0.15, 0.25, 10).translate(0, 0.66, 0), '#ff6a13'),
  ])!;
  const lamps: THREE.Matrix4[] = [], cones: THREE.Matrix4[] = [];
  for (const c of town.circles) {
    if (c.kind === 'tree') continue;
    const b = town.blockAt(c.x, c.z);
    o.position.set(c.x, 0, c.z);
    // lamp arms point over the corner of the street
    o.rotation.set(0, c.kind === 'lamp' && b ? Math.atan2(Math.sign(c.x - b.cx), Math.sign(c.z - b.cz)) : 0, 0);
    o.updateMatrix();
    (c.kind === 'lamp' ? lamps : cones).push(o.matrix.clone());
  }
  instanced({ geo: () => pole, scale: 1 }, lamps).forEach((m) => city.add(m));
  instanced({ geo: () => cone, scale: 1 }, cones).forEach((m) => city.add(m));
  const parkedVariants: Variant[] = TRAFFIC_MODELS.map((m) => ({
    model: m,
    geo: () => mergeGeometries([
      colored(new THREE.BoxGeometry(2, 0.8, 4.4).translate(0, 0.65, 0), ['#c8102e', '#2f6fd0', '#e0e0e0', '#3f8a3a'][m.length % 4]),
      colored(new THREE.BoxGeometry(1.7, 0.6, 2.2).translate(0, 1.35, -0.2), '#2a3440'),
    ])!,
    scale: 1.65,
  }));
  const parked = parkedVariants.map(() => [] as THREE.Matrix4[]);
  for (const bay of town.bays) {
    if (bay.parked < 0) continue;
    o.position.set(bay.x, 0, bay.z);
    o.rotation.set(0, bay.heading, 0);
    o.updateMatrix();
    parked[bay.parked % parkedVariants.length].push(o.matrix.clone());
  }
  addVariants(city, parkedVariants, parked);
  scene.add(city);

  const dynamic = new THREE.Group();
  scene.add(dynamic);
  cached = { town, scene, dynamic };
  return cached;
}
