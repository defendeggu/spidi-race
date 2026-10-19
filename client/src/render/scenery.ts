import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BUILDING_VARIANTS, mulberry32, WALL_OFFSET, type Building, type Track } from '@spidi/shared';
import { assetsReady, getModel, getTexture } from './assets';
import { buildAirportScenery } from './airportScenery';
import { buildingMeshes, variantColors } from './buildingKit';
import { coastline, type Terrain } from './terrain';

// ------------------------------------------------------------------ procedural fallback geometry

export function colored(geo: THREE.BufferGeometry, color: string) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color);
  const arr = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < arr.length; i += 3) {
    arr[i] = c.r;
    arr[i + 1] = c.g;
    arr[i + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return g;
}

export const fallback = {
  pine: () => mergeGeometries([
    colored(new THREE.CylinderGeometry(0.25, 0.35, 2, 5).translate(0, 1, 0), '#5a3e28'),
    colored(new THREE.ConeGeometry(2.4, 4.5, 7).translate(0, 3.8, 0), '#2f5a32'),
    colored(new THREE.ConeGeometry(1.8, 3.6, 7).translate(0, 6.2, 0), '#346636'),
  ])!,
  round: () => mergeGeometries([
    colored(new THREE.CylinderGeometry(0.25, 0.35, 2.4, 5).translate(0, 1.2, 0), '#6b4a2e'),
    colored(new THREE.IcosahedronGeometry(2.2, 0).translate(0, 3.8, 0), '#5c8a35'),
  ])!,
  cypress: () => mergeGeometries([
    colored(new THREE.CylinderGeometry(0.2, 0.25, 1.2, 5).translate(0, 0.6, 0), '#5a3e28'),
    colored(new THREE.ConeGeometry(1.1, 7, 6).translate(0, 4.4, 0), '#3d5e2c'),
  ])!,
  rock: () => colored(new THREE.IcosahedronGeometry(1.6, 0).scale(1.4, 0.8, 1.1), '#8a847b'),
  house: (wall: string, roof: string) => mergeGeometries([
    colored(new THREE.BoxGeometry(6, 4, 8).translate(0, 2, 0), wall),
    colored(new THREE.ConeGeometry(5.6, 2.8, 4).rotateY(Math.PI / 4).scale(1, 1, 1.35).translate(0, 5.4, 0), roof),
  ])!,
};

// ------------------------------------------------------------------ instancing

/** One kind of object: a Kenney model (scaled) or a procedural fallback geometry. */
export interface Variant {
  model?: string;
  geo?: () => THREE.BufferGeometry;
  /** scale applied to the Kenney model (its units are ~1 m) */
  scale: number;
  /** a building of the town kits: drawn with a wall / roof colour per instance like in the practice town */
  kit?: boolean;
  /** footprint radius in metres (for kit houses assembled from parts, which have no single model) */
  radius?: number;
}

/** A town-kit building variant (Kenney house or 'tpl-…' house assembled from parts), coloured per instance. */
export const kitHouse = (model: string, scale: number, wall: string, roof: string, radius?: number): Variant =>
  ({ model, scale, kit: true, radius, geo: () => fallback.house(wall, roof) });

let kitSeed = 0;

/** Kenney's Nature Kit uses pastel/teal colours; map them to natural tones by material name. */
const NATURE_COLORS: Record<string, string> = {
  leafsDark: '#2e5e34',
  leafsGreen: '#4f8a35',
  woodBark: '#6e4a2f',
  woodBarkDark: '#4f3524',
  grass: '#5e8c3a',
  dirt: '#857565',
  stone: '#9b978f',
  _defaultMat: '#8f8a82',
  wood: '#8a5a36',
  woodDark: '#5e3d24',
  woodInner: '#d8b98f',
};

/** In the desert, rocks and cliffs are red sandstone. */
const DESERT_COLORS: Record<string, string> = {
  dirt: '#a8583a',
  stone: '#b8724a',
  grass: '#c98a55',
  _defaultMat: '#a0583a',
  leafsGreen: '#5b7d3a',
};

let colorTheme: 'default' | 'desert' = 'default';

const lambertCache = new Map<string, THREE.MeshLambertMaterial>();
function lambertFrom(m: THREE.Material) {
  const key = `${m.uuid}|${colorTheme}`;
  let l = lambertCache.get(key);
  if (!l) {
    const s = m as THREE.MeshStandardMaterial;
    const natural = (colorTheme === 'desert' ? DESERT_COLORS[s.name] : undefined) ?? NATURE_COLORS[s.name];
    l = new THREE.MeshLambertMaterial({ color: natural ? new THREE.Color(natural) : s.color, map: s.map ?? null, flatShading: !s.map });
    lambertCache.set(key, l);
  }
  return l;
}

export function instanced(variant: Variant, matrices: THREE.Matrix4[]): THREE.Object3D[] {
  if (matrices.length === 0) return [];
  const scaleM = new THREE.Matrix4().makeScale(variant.scale, variant.scale, variant.scale);
  const model = variant.model && assetsReady() ? getModel(variant.model) : undefined;
  const out: THREE.Object3D[] = [];
  if (variant.kit && variant.model && assetsReady()) {
    // the same colour palettes as in the practice town, a different variant for each instance
    const items = matrices.map((m) => ({
      matrix: m.clone().multiply(scaleM),
      ...variantColors({ model: variant.model, variant: kitSeed++ % BUILDING_VARIANTS } as Building),
    }));
    return buildingMeshes(variant.model, items);
  }
  if (model) {
    model.updateMatrixWorld(true);
    model.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const im = new THREE.InstancedMesh(o.geometry, lambertFrom(o.material as THREE.Material), matrices.length);
      const tmp = new THREE.Matrix4();
      matrices.forEach((m, i) => im.setMatrixAt(i, tmp.copy(m).multiply(scaleM).multiply(o.matrixWorld)));
      im.computeBoundingSphere();
      out.push(im);
    });
  } else if (variant.geo) {
    // fallback geometry is already modelled in metres
    const im = new THREE.InstancedMesh(variant.geo(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), matrices.length);
    matrices.forEach((m, i) => im.setMatrixAt(i, m));
    im.computeBoundingSphere();
    out.push(im);
  }
  return out;
}

interface ScatterOpts {
  minDist: number;
  maxDist: number;
  scale: [number, number];
  ok: (x: number, y: number, z: number) => boolean;
  /** only use the first n track samples (e.g. the village along the start straight) */
  samples?: number;
  /** rotate in 90° steps only (buildings) */
  square?: boolean;
  /** max height difference over 3 m (default 4) */
  maxSlope?: number;
}

/** Scatter objects near the track, rejecting positions on/near the road or failing the filter. */
export function scatter(track: Track, terrain: Terrain, variants: Variant[], count: number, seed: number, opts: ScatterOpts) {
  const rand = mulberry32(seed);
  const buckets: THREE.Matrix4[][] = variants.map(() => []);
  const o = new THREE.Object3D();
  const n = opts.samples ?? track.n;
  let k = 0;
  for (let tries = 0; tries < count * 12 && k < count; tries++) {
    const i = Math.floor(rand() * n);
    const side = rand() < 0.5 ? -1 : 1;
    const off = opts.minDist + Math.pow(rand(), 1.6) * (opts.maxDist - opts.minDist);
    const x = track.px[i] + track.rx[i] * side * off + (rand() - 0.5) * 20;
    const z = track.pz[i] + track.rz[i] * side * off + (rand() - 0.5) * 20;
    if (terrain.distAt(x, z) < Math.max(opts.minDist, terrain.near + 4)) continue;
    const y = terrain.heightAt(x, z);
    const slope = Math.abs(terrain.heightAt(x + 3, z) - y) + Math.abs(terrain.heightAt(x, z + 3) - y);
    if (slope > (opts.maxSlope ?? 4) || !opts.ok(x, y, z)) continue;
    // sink objects on slopes so they never float above the (coarser) terrain mesh
    o.position.set(x, y - 0.2 - slope * 0.6, z);
    o.rotation.set(0, opts.square ? Math.floor(rand() * 4) * (Math.PI / 2) + Math.atan2(track.tx[i], track.tz[i]) : rand() * Math.PI * 2, 0);
    o.scale.setScalar(opts.scale[0] + rand() * (opts.scale[1] - opts.scale[0]));
    o.updateMatrix();
    buckets[Math.floor(rand() * variants.length)].push(o.matrix.clone());
    k++;
  }
  const group = new THREE.Group();
  variants.forEach((v, i) => instanced(v, buckets[i]).forEach((m) => group.add(m)));
  return group;
}

export function buildScenery(track: Track, terrain: Terrain): THREE.Group {
  const group = new THREE.Group();
  colorTheme = track.def.theme === 'desert' ? 'desert' : 'default';
  const seed = track.def.seed;
  kitSeed = seed;
  const rocks: Variant[] = [
    { model: 'rock_largeA', geo: fallback.rock, scale: 5 },
    { model: 'rock_largeB', geo: fallback.rock, scale: 4.5 },
    { model: 'rock_largeC', geo: fallback.rock, scale: 5 },
    { model: 'rock_tallA', geo: fallback.rock, scale: 4 },
  ];

  if (track.def.theme === 'desert') {
    group.add(desertScenery(track, terrain, rocks));
  } else if (track.def.theme === 'forest') {
    group.add(forestScenery(track, terrain));
  } else if (track.def.theme === 'city') {
    group.add(cityScenery(track, terrain));
  } else if (track.def.theme === 'speedway') {
    group.add(speedwayScenery(track, terrain));
  } else if (track.def.theme === 'airport') {
    group.add(buildAirportScenery(track, terrain));
  } else if (track.def.theme === 'alpine') {
    const pines: Variant[] = [
      { model: 'tree_pineTallA', geo: fallback.pine, scale: 7.5 },
      { model: 'tree_pineTallB', geo: fallback.pine, scale: 6.5 },
      { model: 'tree_pineDefaultA', geo: fallback.pine, scale: 7 },
      { model: 'tree_pineRoundA', geo: fallback.pine, scale: 7 },
      { model: 'tree_pineSmallA', geo: fallback.pine, scale: 7 },
    ];
    group.add(scatter(track, terrain, pines, 1800, seed + 1, { minDist: 14, maxDist: 320, scale: [0.8, 1.4], ok: (_x, y) => y < 115 }));
    group.add(scatter(track, terrain, rocks.concat({ model: 'stone_tallA', geo: fallback.rock, scale: 4 }), 300, seed + 2, {
      minDist: 14, maxDist: 220, scale: [0.6, 1.8], ok: () => true,
    }));
    group.add(scatter(track, terrain, [{ model: 'plant_bushLarge', geo: fallback.round, scale: 7 }], 300, seed + 7, {
      minDist: 13, maxDist: 80, scale: [0.7, 1.3], ok: (_x, y) => y < 100,
    }));
    // leafy trees down in the valley
    group.add(scatter(track, terrain, [
      { model: 'tree_default', geo: fallback.round, scale: 7 },
      { model: 'tree_oak', geo: fallback.round, scale: 7 },
      { model: 'tree_fat', geo: fallback.round, scale: 7 },
    ], 260, seed + 8, { minDist: 14, maxDist: 200, scale: [0.8, 1.3], ok: (_x, y) => y < 25 }));
    // colourful chalets and farmhouses on the lower slopes
    const chalets: Variant[] = ['a', 'c', 'e', 'g', 'k', 'o', 'r', 'u'].map((t) => kitHouse(`building-type-${t}`, 7.5, '#7a5233', '#4a3a30'));
    group.add(scatter(track, terrain, chalets, 34, seed + 3, { minDist: 22, maxDist: 90, scale: [0.9, 1.1], ok: (_x, y) => y < 45, square: true, maxSlope: 2.5 }));
    // a half-timbered village along the start straight
    const village: Variant[] = ['2x2x2', '3x2x2', '2x2x3', '3x2x3'].map((c) => kitHouse(`tpl-fantasy-${c}`, 4.5, '#e8dcc0', '#8a3a3a', 8));
    group.add(scatter(track, terrain, village, 18, seed + 9, { minDist: 20, maxDist: 55, scale: [1, 1], ok: (_x, y) => y < 12, square: true, samples: Math.min(track.n, 140), maxSlope: 2 }));
  } else {
    const land = (x: number, y: number, z: number) => y > 2.5 && z < coastline(x) - 15;
    const trees: Variant[] = [
      { model: 'tree_oak', geo: fallback.round, scale: 7 },
      { model: 'tree_default', geo: fallback.round, scale: 6.5 },
      { model: 'tree_fat', geo: fallback.round, scale: 7 },
      { model: 'tree_thin', geo: fallback.cypress, scale: 7 },
    ];
    group.add(scatter(track, terrain, trees, 1100, seed + 1, { minDist: 14, maxDist: 260, scale: [0.8, 1.4], ok: land }));
    const palms: Variant[] = [
      { model: 'tree_palmTall', geo: fallback.cypress, scale: 8 },
      { model: 'tree_palmBend', geo: fallback.cypress, scale: 8 },
    ];
    group.add(scatter(track, terrain, palms, 260, seed + 2, {
      minDist: 13, maxDist: 160, scale: [0.8, 1.3], ok: (x, y, z) => y > 1.5 && z > coastline(x) - 120 && z < coastline(x) - 8,
    }));
    group.add(scatter(track, terrain, rocks, 220, seed + 4, { minDist: 14, maxDist: 160, scale: [0.6, 2], ok: (_x, y) => y > -1 }));
    group.add(scatter(track, terrain, [{ model: 'plant_bushLarge', geo: fallback.round, scale: 7 }], 250, seed + 8, {
      minDist: 13, maxDist: 80, scale: [0.7, 1.3], ok: land,
    }));
    // colourful fishing village along the start straight: all house types and a few old-town houses
    const houses: Variant[] = 'abcdefghijklmnopqrstu'.split('').map((t, i) =>
      kitHouse(`building-type-${t}`, 7.5, i % 2 ? '#f1ece0' : '#e8d7a8', i % 2 ? '#b5523b' : '#9c4630'));
    houses.push(...['2x2x2', '3x2x2', '2x2x3'].map((c) => kitHouse(`tpl-fantasy-${c}`, 4.5, '#f1ece0', '#b5523b', 8)));
    group.add(scatter(track, terrain, houses, 70, seed + 5, { minDist: 18, maxDist: 80, scale: [0.9, 1.15], ok: land, samples: Math.min(track.n, 320), square: true }));
    group.add(lighthouse(terrain));
    group.add(boats(track, terrain, seed + 6));
  }
  return group;
}

/** Footprint radius (m) of a variant at scale 1 of the placement matrix. */
export function footprint(v: Variant) {
  if (v.radius) return v.radius;
  const model = v.model && assetsReady() ? getModel(v.model) : undefined;
  const box = new THREE.Box3();
  if (model) {
    box.setFromObject(model);
    return (Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2) * v.scale;
  }
  const g = v.geo!();
  g.computeBoundingBox();
  return Math.max(g.boundingBox!.max.x - g.boundingBox!.min.x, g.boundingBox!.max.z - g.boundingBox!.min.z) / 2;
}

/**
 * Rows of buildings facing the road at a given distance from its edge. Rejects spots that would
 * overlap the road (other parts of the circuit) or previously placed buildings.
 */
function buildingRows(
  track: Track, terrain: Terrain, variants: Variant[], placed: { x: number; z: number; r: number }[],
  opts: { gap: number; spacing: number; seed: number; jitter: number },
) {
  const rand = mulberry32(opts.seed);
  const radii = variants.map(footprint);
  const buckets: THREE.Matrix4[][] = variants.map(() => []);
  const o = new THREE.Object3D();
  const roadEdge = track.maxHalfWidth + WALL_OFFSET + 5;
  const stepN = Math.max(1, Math.round(opts.spacing / track.ds));
  for (let i = 0; i < track.n; i += stepN) {
    for (const side of [-1, 1]) {
      const vi = Math.floor(rand() * variants.length);
      const r = radii[vi];
      const off = roadEdge + opts.gap + r + rand() * opts.jitter;
      const x = track.px[i] + track.rx[i] * side * off;
      const z = track.pz[i] + track.rz[i] * side * off;
      if (terrain.distAt(x, z) < roadEdge + r * 0.8) continue;
      if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + r + 1.5)) continue;
      placed.push({ x, z, r });
      // building front (+z of the model) faces the road
      o.position.set(x, terrain.heightAt(x, z) - 0.3, z);
      o.rotation.set(0, Math.atan2(-side * track.rx[i], -side * track.rz[i]), 0);
      o.scale.setScalar(1);
      o.updateMatrix();
      buckets[vi].push(o.matrix.clone());
    }
  }
  const group = new THREE.Group();
  variants.forEach((v, i) => instanced(v, buckets[i]).forEach((m) => group.add(m)));
  return group;
}

export const towerGeo = (h: number, color: string) => () =>
  mergeGeometries([
    colored(new THREE.BoxGeometry(14, h, 14).translate(0, h / 2, 0), color),
    colored(new THREE.BoxGeometry(14.4, 0.8, 14.4).translate(0, h, 0), '#555a60'),
  ])!;

function cityScenery(track: Track, terrain: Terrain) {
  const group = new THREE.Group();
  const seed = track.def.seed;
  const placed: { x: number; z: number; r: number }[] = [];
  // shops and brick houses in the colours of the practice town
  const shops: Variant[] = [
    ...'abcdefghijk'.split('').map((c, i) => ({
      model: `building-${c}`, geo: towerGeo(14 + (i % 4) * 5, i % 2 ? '#b9b2a6' : '#9fa8b3'), scale: 14, kit: true,
    })),
    ...['3x2x3', '4x2x4', '2x2x3', '5x2x4'].map((c) => {
      const [w, d] = c.split('x').map(Number);
      return kitHouse(`tpl-retro-${c}`, 4, '#b8654a', '#5e5e5e', (Math.max(w, d) * 4) / 2 + 1);
    }),
  ];
  const towers: Variant[] = [
    ...'abcde'.split('').map((c, i) => ({ model: `building-skyscraper-${c}`, geo: towerGeo(50 + i * 12, '#7f93a8'), scale: 15, kit: true })),
    ...'lmn'.split('').map((c) => ({ model: `building-${c}`, geo: towerGeo(36, '#a39c90'), scale: 14, kit: true })),
  ];
  const background: Variant[] = 'acfhl'.split('').map((c, i) => ({ model: `low-detail-building-${c}`, geo: towerGeo(40 + i * 6, '#8d97a3'), scale: 26, kit: true }));
  group.add(buildingRows(track, terrain, shops, placed, { gap: 1, spacing: 16, seed: seed + 1, jitter: 2 }));
  group.add(buildingRows(track, terrain, towers, placed, { gap: 26, spacing: 26, seed: seed + 2, jitter: 8 }));
  group.add(buildingRows(track, terrain, background, placed, { gap: 60, spacing: 34, seed: seed + 3, jitter: 40 }));
  group.add(buildingRows(track, terrain, background, placed, { gap: 120, spacing: 40, seed: seed + 4, jitter: 80 }));
  // a few trees on the sidewalks and in parks
  group.add(scatter(track, terrain, [
    { model: 'tree_default', geo: fallback.round, scale: 6 },
    { model: 'tree_oak', geo: fallback.round, scale: 6 },
    { model: 'tree_fat', geo: fallback.round, scale: 6 },
    { model: 'tree_thin', geo: fallback.cypress, scale: 6 },
    { model: 'plant_bushLarge', geo: fallback.round, scale: 5 },
  ], 220, seed + 5, {
    minDist: 13, maxDist: 60, scale: [0.8, 1.1], ok: (x, _y, z) => !placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + 3),
  }));
  group.add(streetLamps(track));
  return group;
}

/** Street lamps on both sides of the road every ~30 m. */
function streetLamps(track: Track) {
  const pole = mergeGeometries([
    colored(new THREE.CylinderGeometry(0.12, 0.16, 8, 6).translate(0, 4, 0), '#3d4248'),
    colored(new THREE.BoxGeometry(0.15, 0.15, 2.2).translate(0, 8, 1.0), '#3d4248'),
  ])!;
  const lampGeo = new THREE.BoxGeometry(0.5, 0.15, 0.9).translate(0, 7.88, 1.9);
  const every = Math.round(30 / track.ds);
  const count = Math.ceil(track.n / every) * 2;
  const poles = new THREE.InstancedMesh(pole, new THREE.MeshLambertMaterial({ vertexColors: true }), count);
  const lamps = new THREE.InstancedMesh(lampGeo, new THREE.MeshBasicMaterial({ color: '#fff4cc' }), count);
  const o = new THREE.Object3D();
  let k = 0;
  for (let i = 0; i < track.n; i += every) {
    if (track.gallery[i]) continue;
    for (const side of [-1, 1]) {
      const lat = side * (track.hw[i] + WALL_OFFSET + 1.4);
      o.position.set(track.px[i] + track.rx[i] * lat, track.py[i] + track.bank[i] * lat + 0.15, track.pz[i] + track.rz[i] * lat);
      // arm points over the road
      o.rotation.set(0, Math.atan2(-side * track.rx[i], -side * track.rz[i]), 0);
      o.updateMatrix();
      poles.setMatrixAt(k, o.matrix);
      lamps.setMatrixAt(k++, o.matrix);
    }
  }
  poles.count = lamps.count = k;
  const g = new THREE.Group();
  g.add(poles, lamps);
  return g;
}

function speedwayScenery(track: Track, terrain: Terrain) {
  const group = new THREE.Group();
  const seed = track.def.seed;
  const trees: Variant[] = [
    { model: 'tree_default', geo: fallback.round, scale: 7 },
    { model: 'tree_oak', geo: fallback.round, scale: 7 },
    { model: 'tree_fat', geo: fallback.round, scale: 7 },
    { model: 'tree_thin', geo: fallback.cypress, scale: 7 },
    { model: 'tree_pineRoundA', geo: fallback.pine, scale: 7 },
    { model: 'tree_pineTallA', geo: fallback.pine, scale: 7 },
  ];
  // the paddock in the infield behind the start/finish straight stays free
  const paddock = (x: number, z: number) => Math.abs(x) < 360 && z < 0 && z > -230;
  group.add(scatter(track, terrain, trees, 900, seed + 1, { minDist: 70, maxDist: 450, scale: [0.9, 1.4], ok: (x, _y, z) => !paddock(x, z) }));
  group.add(speedwayPaddock(terrain, seed + 2));
  // floodlight towers around the outside of the oval
  const outer = -Math.sign(track.curv.reduce((a, b) => a + b, 0)) || 1;
  const towerGeo2 = mergeGeometries([
    colored(new THREE.CylinderGeometry(0.4, 0.7, 34, 6).translate(0, 17, 0), '#8a9096'),
    colored(new THREE.BoxGeometry(6, 3, 0.6).translate(0, 34, 0), '#3d4248'),
  ])!;
  const every = Math.round(160 / track.ds);
  const towers = new THREE.InstancedMesh(towerGeo2, new THREE.MeshLambertMaterial({ vertexColors: true }), Math.ceil(track.n / every));
  const lights = new THREE.InstancedMesh(new THREE.BoxGeometry(5.4, 2.4, 0.2).translate(0, 34, -0.35), new THREE.MeshBasicMaterial({ color: '#fffbe6' }), Math.ceil(track.n / every));
  const o = new THREE.Object3D();
  let k = 0;
  for (let i = 0; i < track.n; i += every) {
    const lat = outer * (track.hw[i] + WALL_OFFSET + 34);
    const x = track.px[i] + track.rx[i] * lat, z = track.pz[i] + track.rz[i] * lat;
    o.position.set(x, terrain.heightAt(x, z), z);
    o.rotation.set(0, Math.atan2(-outer * track.rx[i], -outer * track.rz[i]) + Math.PI, 0);
    o.updateMatrix();
    towers.setMatrixAt(k, o.matrix);
    lights.setMatrixAt(k++, o.matrix);
  }
  towers.count = lights.count = k;
  group.add(towers, lights);
  return group;
}

/** Infield paddock: team garages, transporters in team colours, containers and the race control tower. */
function speedwayPaddock(terrain: Terrain, seed: number) {
  const rand = mulberry32(seed);
  const group = new THREE.Group();
  const o = new THREE.Object3D();
  const place = (x: number, z: number, rot: number, s = 1) => {
    o.position.set(x, terrain.heightAt(x, z) - 0.1, z);
    o.rotation.set(0, rot, 0);
    o.scale.setScalar(s);
    o.updateMatrix();
    return o.matrix.clone();
  };
  // garages facing the pit lane (+z)
  const garages: Variant[] = ['ind-building-p', 'ind-building-k', 'ind-building-s'].map((m) => ({ model: m, geo: towerGeo(8, '#c9c4ba'), scale: 12, kit: true }));
  const gb = garages.map(() => [] as THREE.Matrix4[]);
  for (let k = 0; k < 10; k++) gb[k % garages.length].push(place(-300 + k * 64, -60, 0));
  garages.forEach((v, i) => instanced(v, gb[i]).forEach((m) => group.add(m)));
  // transporters in two rows behind the garages, containers in between
  const trucks: THREE.Matrix4[] = [], boxes: THREE.Matrix4[] = [];
  for (let k = 0; k < 14; k++) trucks.push(place(-290 + k * 44, -115 - (k % 2) * 30, Math.PI / 2));
  for (let k = 0; k < 10; k++) if (rand() < 0.8) boxes.push(new THREE.Matrix4().compose(new THREE.Vector3(-270 + k * 60, terrain.heightAt(-270 + k * 60, -180) - 0.1, -180), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), new THREE.Vector3(2.44, 2.59, 12.19)));
  if (assetsReady()) {
    const colour = (k: number) => variantColors({ model: 'semi-truck', variant: k } as Building);
    buildingMeshes('semi-truck', trucks.map((matrix, k) => ({ matrix, ...colour(k) }))).forEach((m) => group.add(m));
    buildingMeshes('container', boxes.map((matrix, k) => ({ matrix, ...colour(k * 3 + 1) }))).forEach((m) => group.add(m));
  } else {
    instanced({ geo: () => colored(new THREE.BoxGeometry(2.5, 4, 16.5).translate(0, 2, 0), '#c8202a'), scale: 1 }, trucks).forEach((m) => group.add(m));
  }
  // race control: a small tower at the start/finish line
  const ctrl = mergeGeometries([
    colored(new THREE.BoxGeometry(10, 12, 10).translate(0, 6, 0), '#e8e4dc'),
    colored(new THREE.BoxGeometry(12, 4, 12).translate(0, 14, 0), '#35546e'),
    colored(new THREE.BoxGeometry(13, 0.6, 13).translate(0, 16.3, 0), '#c8202a'),
  ])!;
  const tower = new THREE.Mesh(ctrl, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  tower.position.set(-450, terrain.heightAt(-450, -40) - 0.1, -40);
  group.add(tower);
  return group;
}

/** Objects placed along both road edges (every `spacing` metres, just outside the barrier line). */
function edgeObjects(track: Track, terrain: Terrain, variants: Variant[], spacing: number, seed: number, offset: number, scale: [number, number]) {
  const rand = mulberry32(seed);
  const buckets: THREE.Matrix4[][] = variants.map(() => []);
  const o = new THREE.Object3D();
  const every = Math.max(1, Math.round(spacing / track.ds));
  for (let i = 0; i < track.n; i += every) {
    if (track.gallery[i]) continue;
    for (const side of [-1, 1]) {
      if (rand() < 0.25) continue;
      const lat = side * (track.hw[i] + WALL_OFFSET + offset + rand() * 1.5);
      const x = track.px[i] + track.rx[i] * lat, z = track.pz[i] + track.rz[i] * lat;
      const y = Math.max(terrain.heightAt(x, z), track.py[i] + track.bank[i] * lat - 1);
      o.position.set(x, y - 0.2, z);
      o.rotation.set(0, rand() * Math.PI * 2, 0);
      o.scale.setScalar(scale[0] + rand() * (scale[1] - scale[0]));
      o.updateMatrix();
      buckets[Math.floor(rand() * variants.length)].push(o.matrix.clone());
    }
  }
  const group = new THREE.Group();
  variants.forEach((v, i) => instanced(v, buckets[i]).forEach((m) => group.add(m)));
  return group;
}

function desertScenery(track: Track, terrain: Terrain, rocks: Variant[]) {
  const group = new THREE.Group();
  const seed = track.def.seed;
  const cacti: Variant[] = [
    { model: 'cactus_tall', geo: fallback.cypress, scale: 6 },
    { model: 'cactus_short', geo: fallback.cypress, scale: 6 },
  ];
  group.add(scatter(track, terrain, cacti, 500, seed + 1, { minDist: 13, maxDist: 160, scale: [0.7, 1.4], ok: () => true }));
  group.add(scatter(track, terrain, rocks, 500, seed + 2, { minDist: 13, maxDist: 260, scale: [0.8, 1.8], ok: () => true, maxSlope: 1.5 }));
  group.add(scatter(track, terrain, [{ model: 'cliff_large_rock', geo: fallback.rock, scale: 9 }], 90, seed + 3, {
    minDist: 30, maxDist: 300, scale: [0.7, 1.4], ok: () => true, maxSlope: 2.5,
  }));
  group.add(scatter(track, terrain, [{ model: 'tree_palmTall', geo: fallback.cypress, scale: 8 }], 30, seed + 4, {
    minDist: 16, maxDist: 60, scale: [0.8, 1.2], ok: () => true,
  }));
  // rocks lining the berms mark the edge of the piste
  group.add(edgeObjects(track, terrain, rocks.slice(0, 3), 7, seed + 5, 0.8, [0.35, 0.7]));
  return group;
}

function forestScenery(track: Track, terrain: Terrain) {
  const group = new THREE.Group();
  const seed = track.def.seed;
  const trees: Variant[] = [
    { model: 'tree_pineTallA', geo: fallback.pine, scale: 8 },
    { model: 'tree_pineTallB', geo: fallback.pine, scale: 7 },
    { model: 'tree_pineDefaultA', geo: fallback.pine, scale: 7.5 },
    { model: 'tree_oak', geo: fallback.round, scale: 7 },
    { model: 'tree_default', geo: fallback.round, scale: 7 },
  ];
  group.add(scatter(track, terrain, trees, 3600, seed + 1, { minDist: 12, maxDist: 240, scale: [0.8, 1.5], ok: () => true }));
  const deadwood: Variant[] = [
    { model: 'log', geo: fallback.rock, scale: 6 },
    { model: 'log_large', geo: fallback.rock, scale: 4 },
    { model: 'log_stack', geo: fallback.rock, scale: 5 },
    { model: 'stump_old', geo: fallback.rock, scale: 5 },
    { model: 'stump_round', geo: fallback.rock, scale: 5 },
  ];
  group.add(scatter(track, terrain, deadwood, 260, seed + 2, { minDist: 12, maxDist: 45, scale: [0.8, 1.3], ok: () => true }));
  group.add(scatter(track, terrain, [
    { model: 'mushroom_redGroup', geo: fallback.rock, scale: 5 },
    { model: 'mushroom_tanGroup', geo: fallback.rock, scale: 5 },
    { model: 'plant_bushLarge', geo: fallback.round, scale: 7 },
  ], 400, seed + 3, { minDist: 12, maxDist: 40, scale: [0.7, 1.3], ok: () => true }));
  // a camp near the start
  group.add(scatter({ ...track, n: Math.min(track.n, 120) } as Track, terrain, [
    { model: 'tent_detailedOpen', geo: () => fallback.house('#c84a3a', '#c84a3a'), scale: 7 },
    { model: 'campfire_logs', geo: fallback.rock, scale: 6 },
  ], 6, seed + 4, { minDist: 16, maxDist: 30, scale: [0.9, 1.1], ok: () => true }));
  return group;
}

/** Fishing boats, sailing boats and buoys on the sea off the coast. */
function boats(track: Track, terrain: Terrain, seed: number) {
  const rand = mulberry32(seed);
  const variants: Variant[] = [
    { model: 'wc-boat-fishing-small', geo: () => colored(new THREE.BoxGeometry(3, 1.5, 9).translate(0, 0.5, 0), '#c8402a'), scale: 3 },
    { model: 'wc-boat-sail-a', geo: () => colored(new THREE.BoxGeometry(3, 1.2, 8).translate(0, 0.5, 0), '#f2f2f2'), scale: 3 },
    { model: 'wc-boat-sail-b', geo: () => colored(new THREE.BoxGeometry(3, 1.2, 8).translate(0, 0.5, 0), '#f2f2f2'), scale: 3 },
    { model: 'wc-boat-speed-a', geo: () => colored(new THREE.BoxGeometry(2.5, 1, 7).translate(0, 0.5, 0), '#2f6fd0'), scale: 3 },
    { model: 'wc-boat-row-small', geo: () => colored(new THREE.BoxGeometry(1.6, 0.6, 4).translate(0, 0.3, 0), '#8a5a36'), scale: 3 },
    { model: 'wc-buoy', geo: () => colored(new THREE.CylinderGeometry(0.8, 0.8, 1.5, 8), '#e8501a'), scale: 3 },
    { model: 'wc-buoy-flag', geo: () => colored(new THREE.CylinderGeometry(0.8, 0.8, 1.5, 8), '#e8c22a'), scale: 3 },
  ];
  const buckets: THREE.Matrix4[][] = variants.map(() => []);
  const o = new THREE.Object3D();
  const b = track.bounds;
  for (let k = 0, tries = 0; k < 36 && tries < 400; tries++) {
    const x = b.minX - 150 + rand() * (b.maxX - b.minX + 300);
    const z = coastline(x) + 25 + Math.pow(rand(), 1.5) * 260;
    // out on the water, off the road near the shore
    if (terrain.heightAt(x, z) > -1.5 || terrain.distAt(x, z) < 40) continue;
    o.position.set(x, -0.35, z);
    o.rotation.set(0, rand() * Math.PI * 2, 0);
    o.updateMatrix();
    buckets[Math.floor(rand() * variants.length)].push(o.matrix.clone());
    k++;
  }
  const group = new THREE.Group();
  variants.forEach((v, i) => instanced(v, buckets[i]).forEach((m) => group.add(m)));
  return group;
}

function lighthouse(terrain: Terrain) {
  const g = new THREE.Group();
  const x = 430, z = coastline(430) - 22;
  const tower = mergeGeometries([
    colored(new THREE.CylinderGeometry(2.2, 3, 6, 10).translate(0, 3, 0), '#f4f4f4'),
    colored(new THREE.CylinderGeometry(1.9, 2.2, 6, 10).translate(0, 9, 0), '#c62f2f'),
    colored(new THREE.CylinderGeometry(1.6, 1.9, 6, 10).translate(0, 15, 0), '#f4f4f4'),
    colored(new THREE.CylinderGeometry(1.9, 1.9, 0.5, 10).translate(0, 18.2, 0), '#333333'),
    colored(new THREE.ConeGeometry(1.8, 2, 10).translate(0, 21.5, 0), '#c62f2f'),
  ])!;
  g.add(new THREE.Mesh(tower, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 2.2, 10), new THREE.MeshBasicMaterial({ color: '#fff4c2' }));
  lamp.position.y = 19.6;
  g.add(lamp);
  const rockTex = getTexture('rock');
  if (rockTex) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(5, 7, 3, 12), new THREE.MeshLambertMaterial({ map: rockTex }));
    base.position.y = 0.5;
    g.add(base);
  }
  g.position.set(x, terrain.heightAt(x, z) - 0.5, z);
  return g;
}
