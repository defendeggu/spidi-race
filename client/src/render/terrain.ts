import * as THREE from 'three';
import { fbm, lerp, mulberry32, smoothstep, WALL_OFFSET, type Track, type TrackTheme } from '@spidi/shared';
import { getTexture, type TextureName } from './assets';

export interface Terrain {
  mesh: THREE.Mesh;
  heightAt(x: number, z: number): number;
  distAt(x: number, z: number): number;
  /** distance from the road centre within which the ground is flattened */
  near: number;
}

/** terrain beyond the track bounds; the breakfast table ends close to the track */
const margin = (track: Track) => (track.def.theme === 'table' ? 60 : 750);
const RES = 230;

export function coastline(x: number) {
  return 395 + 25 * Math.sin(x / 130) + 12 * Math.sin(x / 47);
}

function naturalHeight(track: Track, x: number, z: number, d: number, hRef: number) {
  const seed = track.def.seed;
  switch (track.def.theme) {
    case 'alpine': {
      const n = fbm(x * 0.004, z * 0.004, seed, 5);
      const ridges = 1 - Math.abs(fbm(x * 0.0018, z * 0.0018, seed + 5, 3) * 2 - 1);
      return hRef - 12 + n * (25 + d * 0.75) + ridges * Math.min(d, 400) * 0.35;
    }
    case 'coast': {
      const land = 1 - smoothstep(-35, 25, z - coastline(x));
      const hills = 6 + fbm(x * 0.005, z * 0.005, seed, 4) * 45 + Math.max(0, 120 - z) * 0.12;
      return lerp(-14, hills, land);
    }
    case 'city':
      // flat city ground following the street level, hills only far outside
      return hRef - 0.4 + fbm(x * 0.01, z * 0.01, seed, 2) * 1.2 + Math.max(0, d - 450) * 0.25 * fbm(x * 0.003, z * 0.003, seed + 3, 3);
    case 'speedway':
      return -0.4 + fbm(x * 0.01, z * 0.01, seed, 2) * 0.6 + Math.max(0, d - 600) * 0.2 * fbm(x * 0.002, z * 0.002, seed + 3, 3);
    case 'desert': {
      // canyon: steep red walls close to the track (higher in some places than others), dunes further out
      const wall = 20 + fbm(x * 0.004, z * 0.004, seed + 7, 3) * 70;
      const dunes = fbm(x * 0.008, z * 0.008, seed, 3) * 14;
      return hRef - 2 + smoothstep(8, 45, d) * wall + dunes;
    }
    case 'forest':
      return hRef - 4 + fbm(x * 0.006, z * 0.006, seed, 4) * (10 + Math.min(d, 500) * 0.12);
    case 'table':
      return 0;
  }
}

export function buildTerrain(track: Track): Terrain {
  const b = track.bounds;
  const MARGIN = margin(track);
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
      let sw = 0, sh = 0, bestIdx = 0;
      best = Infinity;
      for (let i = 0; i < n; i += stride) {
        const dx = px[i] - x, dz = pz[i] - z;
        const d2 = dx * dx + dz * dz;
        if (d2 < best) {
          best = d2;
          bestIdx = i;
        }
        const w = 1 / ((d2 + 25) * (d2 + 25));
        sw += w;
        sh += w * py[i];
      }
      const d = Math.sqrt(best);
      const hRef = sh / sw;
      const t = smoothstep(near, near + 45, d);
      const below = hRef - 1.3 - Math.abs(track.bank[bestIdx]) * near;
      // the table top is perfectly flat, the road lies directly on it
      const h = track.def.theme === 'table' ? 0 : lerp(below, naturalHeight(track, x, z, d, hRef), t);
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
  const splat = new Float32Array(pos.count * 4);
  const rand = mulberry32(track.def.seed);
  const c = new THREE.Color();
  const textures = splatTextures(THEMES[track.def.theme].textures);
  // with textures the vertex colours only tint; without, they are the whole look
  const theme = THEMES[track.def.theme];
  const pal = textures ? theme.tint : theme.flat;
  const w = [0, 0, 0, 0];
  /** blend colour and texture weights towards layer `layer` (see THEMES[..].textures) */
  const mix = (col: THREE.Color, layer: number, t: number) => {
    c.lerp(col, t);
    for (let q = 0; q < 4; q++) w[q] = w[q] * (1 - t) + (q === layer ? t : 0);
  };
  for (let k = 0; k < pos.count; k++) {
    const y = pos.getY(k), x = pos.getX(k), z = pos.getZ(k);
    const slope = 1 - nor.getY(k);
    const d = dists[k];
    const v = fbm(x * 0.02, z * 0.02, 99, 2);
    c.copy(pal.base).lerp(pal.base2, v);
    w[0] = 1;
    w[1] = w[2] = w[3] = 0;
    switch (track.def.theme) {
      case 'alpine': {
        if (slope > 0.28) mix(pal.l1, 1, smoothstep(0.28, 0.45, slope));
        const snowLine = 125 + v * 40;
        if (y > snowLine && slope < 0.55) mix(pal.l2, 2, smoothstep(snowLine, snowLine + 25, y));
        break;
      }
      case 'coast':
        if (slope > 0.3) mix(pal.l1, 1, smoothstep(0.3, 0.5, slope));
        if (y < 3) mix(pal.l2, 2, smoothstep(3, 0.5, y));
        if (y < -2) mix(pal.deep, 2, smoothstep(-2, -8, y));
        break;
      case 'city': {
        const park = fbm(x * 0.006, z * 0.006, track.def.seed + 11, 3);
        if (park > 0.58) mix(pal.l1, 1, smoothstep(0.58, 0.64, park));
        if (slope > 0.3) mix(pal.l2, 2, smoothstep(0.3, 0.5, slope));
        break;
      }
      case 'desert':
        if (slope > 0.22) mix(pal.l1, 1, smoothstep(0.22, 0.4, slope));
        if (v > 0.6) mix(pal.l2, 2, smoothstep(0.6, 0.7, v) * 0.7);
        break;
      case 'forest': {
        const clearing = fbm(x * 0.01, z * 0.01, track.def.seed + 13, 2);
        if (clearing > 0.55) mix(pal.l1, 1, smoothstep(0.55, 0.65, clearing));
        if (slope > 0.32) mix(pal.l2, 2, smoothstep(0.32, 0.5, slope));
        break;
      }
      case 'speedway':
        // mowing stripes on the infield, asphalt apron along the track
        c.copy(Math.sin((x + z) * 0.06) > 0 ? pal.base : pal.base2);
        if (d < near + 16) mix(pal.verge, 3, 1 - smoothstep(near + 10, near + 16, d));
        break;
    }
    const jitter = 0.94 + rand() * 0.1;
    colors[k * 3] = c.r * jitter;
    colors[k * 3 + 1] = c.g * jitter;
    colors[k * 3 + 2] = c.b * jitter;
    splat.set(w, k * 4);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('splat', new THREE.BufferAttribute(splat, 4));
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: !textures });
  if (textures) applySplatShader(material, textures, THEMES[track.def.theme].scale);
  const mesh = new THREE.Mesh(geo, material);

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

type Palette = Record<'base' | 'base2' | 'l1' | 'l2' | 'deep' | 'verge', THREE.Color>;
const P = (o: Record<keyof Palette, string>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, new THREE.Color(v)])) as Palette;

/**
 * Per theme: the 4 splat textures (layer 0 = base ground, 3 = verge next to the road), their repeat
 * in metres, the vertex tints used on top of the textures and the flat colours of the fallback.
 */
const THEMES: Record<TrackTheme, { textures: TextureName[]; scale: number[]; tint: Palette; flat: Palette }> = {
  alpine: {
    textures: ['grass', 'rock', 'snow', 'gravel'],
    scale: [7, 12, 10, 4],
    tint: P({ base: '#e6eecf', base2: '#c7d49a', l1: '#e2ddd6', l2: '#ffffff', deep: '#ffffff', verge: '#d8d0c0' }),
    flat: P({ base: '#4c7a34', base2: '#6b8f3e', l1: '#7b756d', l2: '#f1f4f7', deep: '#3b5f6b', verge: '#6a604c' }),
  },
  coast: {
    textures: ['grass', 'rock', 'sand', 'gravel'],
    scale: [7, 12, 10, 4],
    tint: P({ base: '#f0eac0', base2: '#d6d08f', l1: '#f0e0c8', l2: '#fff8e8', deep: '#6f8f90', verge: '#e8dcc0' }),
    flat: P({ base: '#7d9443', base2: '#a3a457', l1: '#a38f70', l2: '#dcc995', deep: '#4f7d82', verge: '#8a7d5c' }),
  },
  city: {
    textures: ['concrete', 'grass', 'rock', 'gravel'],
    scale: [6, 7, 12, 4],
    tint: P({ base: '#d8d8d8', base2: '#bdbdbd', l1: '#dfe8c8', l2: '#e0dcd6', deep: '#ffffff', verge: '#c8c4bc' }),
    flat: P({ base: '#8d8d8a', base2: '#7d7d7a', l1: '#5d8a3a', l2: '#7b756d', deep: '#555555', verge: '#6e6a63' }),
  },
  desert: {
    textures: ['dune', 'redrock', 'desertdirt', 'desertdirt'],
    scale: [9, 14, 6, 5],
    tint: P({ base: '#fff0e0', base2: '#f0d8c0', l1: '#ffe6d8', l2: '#ffffff', deep: '#ffffff', verge: '#f2e2d0' }),
    flat: P({ base: '#d9a06a', base2: '#c98c58', l1: '#b0603a', l2: '#c08a5a', deep: '#555555', verge: '#a8754a' }),
  },
  forest: {
    textures: ['forestfloor', 'grass', 'rock', 'dirt'],
    scale: [6, 7, 12, 5],
    tint: P({ base: '#e0e8d0', base2: '#c8d4b0', l1: '#e6eecf', l2: '#e2ddd6', deep: '#ffffff', verge: '#e8dccc' }),
    flat: P({ base: '#4a5e32', base2: '#56693a', l1: '#5d8a3a', l2: '#7b756d', deep: '#555555', verge: '#6b5236' }),
  },
  table: {
    // not drawn (the table top comes from breakfast.ts), only used as height/distance field
    textures: ['wood', 'wood', 'wood', 'wood'],
    scale: [40, 40, 40, 40],
    tint: P({ base: '#f2d6b0', base2: '#e8c8a0', l1: '#f2d6b0', l2: '#f2d6b0', deep: '#f2d6b0', verge: '#f2d6b0' }),
    flat: P({ base: '#b88a5a', base2: '#a87a4f', l1: '#b88a5a', l2: '#b88a5a', deep: '#b88a5a', verge: '#b88a5a' }),
  },
  speedway: {
    textures: ['grass', 'rock', 'sand', 'asphalt'],
    scale: [6, 12, 10, 7],
    tint: P({ base: '#e8f2c8', base2: '#c8dca0', l1: '#e2ddd6', l2: '#fff8e8', deep: '#ffffff', verge: '#b0b0b0' }),
    flat: P({ base: '#5f9a3c', base2: '#4f8a32', l1: '#7b756d', l2: '#dcc995', deep: '#555555', verge: '#4a4a4d' }),
  },
};

function splatTextures(names: TextureName[]) {
  const tex = names.map((n) => getTexture(n));
  return tex.every((t) => t) ? (tex as THREE.Texture[]) : null;
}

/** Extend the Lambert material: blend 4 world-projected textures by the per-vertex 'splat' weights. */
function applySplatShader(material: THREE.MeshLambertMaterial, tex: THREE.Texture[], metres: number[]) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.tSplat0 = { value: tex[0] };
    shader.uniforms.tSplat1 = { value: tex[1] };
    shader.uniforms.tSplat2 = { value: tex[2] };
    shader.uniforms.tSplat3 = { value: tex[3] };
    shader.uniforms.uSplatScale = { value: new THREE.Vector4(...metres.map((m) => 1 / m)) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 splat;\nvarying vec4 vSplat;\nvarying vec2 vWorldXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat;\nvWorldXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D tSplat0; uniform sampler2D tSplat1; uniform sampler2D tSplat2; uniform sampler2D tSplat3;
        uniform vec4 uSplatScale;
        varying vec4 vSplat; varying vec2 vWorldXZ;
        // two scales per layer hide the tiling
        vec3 layer(sampler2D t, float s) { return mix(texture2D(t, vWorldXZ * s).rgb, texture2D(t, vWorldXZ * s * 0.23).rgb, 0.45); }`,
      )
      .replace(
        '#include <map_fragment>',
        `vec4 sw = vSplat / max(0.0001, vSplat.x + vSplat.y + vSplat.z + vSplat.w);
        vec3 splatColor = layer(tSplat0, uSplatScale.x) * sw.x + layer(tSplat1, uSplatScale.y) * sw.y
          + layer(tSplat2, uSplatScale.z) * sw.z + layer(tSplat3, uSplatScale.w) * sw.w;
        diffuseColor.rgb *= splatColor;`,
      );
  };
}
