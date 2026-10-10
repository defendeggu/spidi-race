import * as THREE from 'three';
import { fbm, lerp, mulberry32, smoothstep, WALL_OFFSET, type Track } from '@spidi/shared';

export interface Terrain {
  mesh: THREE.Mesh;
  heightAt(x: number, z: number): number;
  distAt(x: number, z: number): number;
  /** distance from the road centre within which the ground is flattened */
  near: number;
}

const MARGIN = 750;
const RES = 230;

export function coastline(x: number) {
  return 395 + 25 * Math.sin(x / 130) + 12 * Math.sin(x / 47);
}

function naturalHeight(track: Track, x: number, z: number, d: number, hRef: number) {
  const seed = track.def.seed;
  if (track.def.theme === 'alpine') {
    const n = fbm(x * 0.004, z * 0.004, seed, 5);
    const ridges = 1 - Math.abs(fbm(x * 0.0018, z * 0.0018, seed + 5, 3) * 2 - 1);
    return hRef - 12 + n * (25 + d * 0.75) + ridges * Math.min(d, 400) * 0.35;
  }
  const land = 1 - smoothstep(-35, 25, z - coastline(x));
  const hills = 6 + fbm(x * 0.005, z * 0.005, seed, 4) * 45 + Math.max(0, 120 - z) * 0.12;
  return lerp(-14, hills, land);
}

export function buildTerrain(track: Track): Terrain {
  const b = track.bounds;
  const minX = b.minX - MARGIN, minZ = b.minZ - MARGIN;
  const size = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) + MARGIN * 2;
  const step = size / RES;
  const N = RES + 1;
  const heights = new Float32Array(N * N);
  const dists = new Float32Array(N * N);
  const near = track.maxHalfWidth + WALL_OFFSET + 3;
  const n = track.n;
  const { px, pz, py } = track;

  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) {
      const x = minX + ix * step, z = minZ + iz * step;
      // coarse pass
      let best = Infinity;
      for (let i = 0; i < n; i += 8) {
        const dx = px[i] - x, dz = pz[i] - z;
        const d2 = dx * dx + dz * dz;
        if (d2 < best) best = d2;
      }
      const fine = Math.sqrt(best) < 160;
      const stride = fine ? 1 : 8;
      let sw = 0, sh = 0;
      best = Infinity;
      for (let i = 0; i < n; i += stride) {
        const dx = px[i] - x, dz = pz[i] - z;
        const d2 = dx * dx + dz * dz;
        if (d2 < best) best = d2;
        const w = 1 / ((d2 + 25) * (d2 + 25));
        sw += w;
        sh += w * py[i];
      }
      const d = Math.sqrt(best);
      const hRef = sh / sw;
      const t = smoothstep(near, near + 45, d);
      const h = lerp(hRef - 1.3, naturalHeight(track, x, z, d, hRef), t);
      heights[iz * N + ix] = h;
      dists[iz * N + ix] = d;
    }
  }

  const geo = new THREE.PlaneGeometry(size, size, RES, RES);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  // after rotateX(-90°) the plane's rows run from -z to +z, matching our grid layout
  for (let k = 0; k < pos.count; k++) {
    const ix = k % N, iz = Math.floor(k / N);
    pos.setXYZ(k, minX + ix * step, heights[iz * N + ix], minZ + iz * step);
  }
  geo.computeVertexNormals();
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const rand = mulberry32(track.def.seed);
  const c = new THREE.Color();
  const pal = palette(track.def.theme);
  for (let k = 0; k < pos.count; k++) {
    const y = pos.getY(k), x = pos.getX(k), z = pos.getZ(k);
    const slope = 1 - nor.getY(k);
    const d = dists[k];
    const v = fbm(x * 0.02, z * 0.02, 99, 2);
    if (track.def.theme === 'alpine') {
      c.copy(pal.grass).lerp(pal.grass2, v);
      if (slope > 0.28) c.lerp(pal.rock, smoothstep(0.28, 0.45, slope));
      const snowLine = 125 + v * 40;
      if (y > snowLine && slope < 0.55) c.lerp(pal.snow, smoothstep(snowLine, snowLine + 25, y));
    } else {
      c.copy(pal.grass).lerp(pal.grass2, v);
      if (slope > 0.3) c.lerp(pal.rock, smoothstep(0.3, 0.5, slope));
      if (y < 3) c.lerp(pal.sand, smoothstep(3, 0.5, y));
      if (y < -2) c.lerp(pal.seabed, smoothstep(-2, -8, y));
    }
    if (d < near + 4) c.lerp(pal.verge, 1 - smoothstep(near, near + 4, d));
    const jitter = 0.94 + rand() * 0.1;
    colors[k * 3] = c.r * jitter;
    colors[k * 3 + 1] = c.g * jitter;
    colors[k * 3 + 2] = c.b * jitter;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));

  const sample = (arr: Float32Array, x: number, z: number) => {
    const fx = THREE.MathUtils.clamp((x - minX) / step, 0, RES - 0.001);
    const fz = THREE.MathUtils.clamp((z - minZ) / step, 0, RES - 0.001);
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = fx - ix, tz = fz - iz;
    const a = arr[iz * N + ix], b2 = arr[iz * N + ix + 1];
    const c2 = arr[(iz + 1) * N + ix], d2 = arr[(iz + 1) * N + ix + 1];
    return lerp(lerp(a, b2, tx), lerp(c2, d2, tx), tz);
  };
  return { mesh, heightAt: (x, z) => sample(heights, x, z), distAt: (x, z) => sample(dists, x, z), near };
}

function palette(theme: string) {
  const C = (h: string) => new THREE.Color(h);
  return theme === 'alpine'
    ? { grass: C('#4c7a34'), grass2: C('#6b8f3e'), rock: C('#7b756d'), snow: C('#f1f4f7'), verge: C('#6a604c'), sand: C('#c9b98a'), seabed: C('#3b5f6b') }
    : { grass: C('#7d9443'), grass2: C('#a3a457'), rock: C('#a38f70'), snow: C('#ffffff'), verge: C('#8a7d5c'), sand: C('#dcc995'), seabed: C('#4f7d82') };
}
