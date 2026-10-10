import * as THREE from 'three';
import { fbm, lerp, mulberry32, smoothstep, WALL_OFFSET, type Track } from '@spidi/shared';
import { getTexture } from './assets';

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
  const splat = new Float32Array(pos.count * 4);
  const rand = mulberry32(track.def.seed);
  const c = new THREE.Color();
  const textures = splatTextures(track.def.theme);
  // with textures the vertex colours only tint; without, they are the whole look
  const pal = textures ? tintPalette(track.def.theme) : palette(track.def.theme);
  const w = [0, 0, 0, 0];
  /** blend colour and texture weights towards layer `layer` (0 grass, 1 rock, 2 snow/sand, 3 gravel) */
  const mix = (col: THREE.Color, layer: number, t: number) => {
    c.lerp(col, t);
    for (let q = 0; q < 4; q++) w[q] = w[q] * (1 - t) + (q === layer ? t : 0);
  };
  for (let k = 0; k < pos.count; k++) {
    const y = pos.getY(k), x = pos.getX(k), z = pos.getZ(k);
    const slope = 1 - nor.getY(k);
    const d = dists[k];
    const v = fbm(x * 0.02, z * 0.02, 99, 2);
    c.copy(pal.grass).lerp(pal.grass2, v);
    w[0] = 1;
    w[1] = w[2] = w[3] = 0;
    if (track.def.theme === 'alpine') {
      if (slope > 0.28) mix(pal.rock, 1, smoothstep(0.28, 0.45, slope));
      const snowLine = 125 + v * 40;
      if (y > snowLine && slope < 0.55) mix(pal.snow, 2, smoothstep(snowLine, snowLine + 25, y));
    } else {
      if (slope > 0.3) mix(pal.rock, 1, smoothstep(0.3, 0.5, slope));
      if (y < 3) mix(pal.sand, 2, smoothstep(3, 0.5, y));
      if (y < -2) mix(pal.seabed, 2, smoothstep(-2, -8, y));
    }
    if (d < near + 4) mix(pal.verge, 3, 1 - smoothstep(near, near + 4, d));
    const jitter = 0.94 + rand() * 0.1;
    colors[k * 3] = c.r * jitter;
    colors[k * 3 + 1] = c.g * jitter;
    colors[k * 3 + 2] = c.b * jitter;
    splat.set(w, k * 4);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('splat', new THREE.BufferAttribute(splat, 4));
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: !textures });
  if (textures) applySplatShader(material, textures);
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

function palette(theme: string) {
  const C = (h: string) => new THREE.Color(h);
  return theme === 'alpine'
    ? { grass: C('#4c7a34'), grass2: C('#6b8f3e'), rock: C('#7b756d'), snow: C('#f1f4f7'), verge: C('#6a604c'), sand: C('#c9b98a'), seabed: C('#3b5f6b') }
    : { grass: C('#7d9443'), grass2: C('#a3a457'), rock: C('#a38f70'), snow: C('#ffffff'), verge: C('#8a7d5c'), sand: C('#dcc995'), seabed: C('#4f7d82') };
}

/** Vertex tints used on top of the textures. */
function tintPalette(theme: string) {
  const C = (h: string) => new THREE.Color(h);
  return theme === 'alpine'
    ? { grass: C('#e6eecf'), grass2: C('#c7d49a'), rock: C('#e2ddd6'), snow: C('#ffffff'), verge: C('#d8d0c0'), sand: C('#ffffff'), seabed: C('#ffffff') }
    : { grass: C('#f0eac0'), grass2: C('#d6d08f'), rock: C('#f0e0c8'), snow: C('#ffffff'), verge: C('#e8dcc0'), sand: C('#fff8e8'), seabed: C('#6f8f90') };
}

function splatTextures(theme: string) {
  const names = ['grass', 'rock', theme === 'alpine' ? 'snow' : 'sand', 'gravel'] as const;
  const tex = names.map((n) => getTexture(n));
  return tex.every((t) => t) ? (tex as THREE.Texture[]) : null;
}

/** Extend the Lambert material: blend 4 world-projected textures by the per-vertex 'splat' weights. */
function applySplatShader(material: THREE.MeshLambertMaterial, tex: THREE.Texture[]) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.tSplat0 = { value: tex[0] };
    shader.uniforms.tSplat1 = { value: tex[1] };
    shader.uniforms.tSplat2 = { value: tex[2] };
    shader.uniforms.tSplat3 = { value: tex[3] };
    shader.uniforms.uSplatScale = { value: new THREE.Vector4(1 / 7, 1 / 12, 1 / 10, 1 / 4) };
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
