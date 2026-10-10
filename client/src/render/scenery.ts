import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32, type Track } from '@spidi/shared';
import { assetsReady, getModel, getTexture } from './assets';
import { coastline, type Terrain } from './terrain';

// ------------------------------------------------------------------ procedural fallback geometry

function colored(geo: THREE.BufferGeometry, color: string) {
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

const fallback = {
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
interface Variant {
  model?: string;
  geo?: () => THREE.BufferGeometry;
  /** scale applied to the Kenney model (its units are ~1 m) */
  scale: number;
}

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
};

const lambertCache = new Map<THREE.Material, THREE.MeshLambertMaterial>();
function lambertFrom(m: THREE.Material) {
  let l = lambertCache.get(m);
  if (!l) {
    const s = m as THREE.MeshStandardMaterial;
    const natural = NATURE_COLORS[s.name];
    l = new THREE.MeshLambertMaterial({ color: natural ? new THREE.Color(natural) : s.color, map: s.map ?? null, flatShading: !s.map });
    lambertCache.set(m, l);
  }
  return l;
}

function instanced(variant: Variant, matrices: THREE.Matrix4[]): THREE.Object3D[] {
  if (matrices.length === 0) return [];
  const scaleM = new THREE.Matrix4().makeScale(variant.scale, variant.scale, variant.scale);
  const model = variant.model && assetsReady() ? getModel(variant.model) : undefined;
  const out: THREE.Object3D[] = [];
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
}

/** Scatter objects near the track, rejecting positions on/near the road or failing the filter. */
function scatter(track: Track, terrain: Terrain, variants: Variant[], count: number, seed: number, opts: ScatterOpts) {
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
    if (slope > 4 || !opts.ok(x, y, z)) continue;
    o.position.set(x, y - 0.2, z);
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
  const seed = track.def.seed;
  const rocks: Variant[] = [
    { model: 'rock_largeA', geo: fallback.rock, scale: 5 },
    { model: 'rock_largeB', geo: fallback.rock, scale: 4.5 },
    { model: 'rock_largeC', geo: fallback.rock, scale: 5 },
    { model: 'rock_tallA', geo: fallback.rock, scale: 4 },
  ];

  if (track.def.theme === 'alpine') {
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
    const chalets: Variant[] = [
      { model: 'building-type-a', geo: () => fallback.house('#7a5233', '#4a3a30'), scale: 7.5 },
      { model: 'building-type-k', geo: () => fallback.house('#7a5233', '#4a3a30'), scale: 7.5 },
      { model: 'building-type-c', geo: () => fallback.house('#7a5233', '#4a3a30'), scale: 7.5 },
    ];
    group.add(scatter(track, terrain, chalets, 14, seed + 3, { minDist: 22, maxDist: 70, scale: [0.9, 1.1], ok: (_x, y) => y < 40, square: true }));
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
    // fishing village along the start straight
    const houses: Variant[] = ['a', 'c', 'f', 'k', 'n', 't'].map((t, i) => ({
      model: `building-type-${t}`,
      geo: () => fallback.house(i % 2 ? '#f1ece0' : '#e8d7a8', i % 2 ? '#b5523b' : '#9c4630'),
      scale: 7.5,
    }));
    group.add(scatter(track, terrain, houses, 46, seed + 5, { minDist: 18, maxDist: 70, scale: [0.9, 1.15], ok: land, samples: Math.min(track.n, 320), square: true }));
    group.add(lighthouse(terrain));
  }
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
