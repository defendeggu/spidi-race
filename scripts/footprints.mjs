#!/usr/bin/env node
/**
 * Measures the "ground footprint" of the practice-town building models: the x/z extent of every
 * triangle that reaches into the band just above the ground (walls, posts), ignoring canopies,
 * eaves and floor slabs. The result (in model units, relative to the model's bounding-box centre,
 * which is where the client places it) is written to shared/src/townFootprints.ts and used for the
 * collision boxes, so cars can drive under canopies.
 *
 * Run after `npm run assets`: node scripts/footprints.mjs
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CC0 = join(ROOT, 'client/public/cc0');
/** height band (model units) that counts as "in the way of a car" */
const BAND = [0.02, 0.12];
/** faces narrower than this (model units) belong to posts, not walls */
const POST = 0.12;

const SETS = [
  { dir: 'buildings', prefix: '', match: /^building-type-/ },
  { dir: 'city', prefix: '', match: /^building-/ },
  { dir: 'industrial', prefix: 'ind-', match: /^building-/ },
];

function readGlb(file) {
  const d = readFileSync(file);
  const jsonLen = d.readUInt32LE(12);
  const json = JSON.parse(d.subarray(20, 20 + jsonLen).toString('utf8'));
  const binLen = d.readUInt32LE(20 + jsonLen);
  const bin = d.subarray(28 + jsonLen, 28 + jsonLen + binLen);
  return { json, bin };
}

function mat4FromNode(n) {
  if (n.matrix) return n.matrix;
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return [
    (1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0,
    2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0,
    2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}

function apply(m, p) {
  return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
}

function triangles({ json, bin }) {
  const tris = [];
  const visit = (ni, parent) => {
    const n = json.nodes[ni];
    const m = mul(parent, mat4FromNode(n));
    if (n.mesh !== undefined) {
      for (const prim of json.meshes[n.mesh].primitives) {
        const acc = json.accessors[prim.attributes.POSITION];
        const bv = json.bufferViews[acc.bufferView];
        const off = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0), stride = bv.byteStride ?? 12;
        const pos = [];
        for (let i = 0; i < acc.count; i++) pos.push(apply(m, [0, 1, 2].map((k) => bin.readFloatLE(off + i * stride + k * 4))));
        let idx = [...pos.keys()];
        if (prim.indices !== undefined) {
          const ia = json.accessors[prim.indices], ib = json.bufferViews[ia.bufferView];
          const io = (ib.byteOffset ?? 0) + (ia.byteOffset ?? 0);
          const size = ia.componentType === 5125 ? 4 : 2;
          idx = [];
          for (let i = 0; i < ia.count; i++) idx.push(size === 4 ? bin.readUInt32LE(io + i * 4) : bin.readUInt16LE(io + i * 2));
        }
        for (let i = 0; i < idx.length; i += 3) tris.push([pos[idx[i]], pos[idx[i + 1]], pos[idx[i + 2]]]);
      }
    }
    for (const c of n.children ?? []) visit(c, m);
  };
  const ident = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const r of json.scenes[json.scene ?? 0].nodes) visit(r, ident);
  return tris;
}

const out = {};
for (const set of SETS) {
  for (const f of readdirSync(join(CC0, set.dir)).filter((f) => f.endsWith('.glb') && set.match.test(f)).sort()) {
    const tris = triangles(readGlb(join(CC0, set.dir, f)));
    let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
    let fx0 = Infinity, fx1 = -Infinity, fz0 = Infinity, fz1 = -Infinity;
    const posts = new Map();
    for (const t of tris) {
      const ys = t.map((p) => p[1]);
      for (const p of t) {
        bx0 = Math.min(bx0, p[0]); bx1 = Math.max(bx1, p[0]); bz0 = Math.min(bz0, p[2]); bz1 = Math.max(bz1, p[2]);
      }
      if (Math.min(...ys) < BAND[1] && Math.max(...ys) > BAND[0]) {
        const xs = t.map((p) => p[0]), zs = t.map((p) => p[2]);
        const wide = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
        if (wide < POST) {
          // a post: group its faces by position
          const px = (Math.min(...xs) + Math.max(...xs)) / 2, pz = (Math.min(...zs) + Math.max(...zs)) / 2;
          const key = `${Math.round(px * 10)},${Math.round(pz * 10)}`;
          const e = posts.get(key) ?? { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
          e.x0 = Math.min(e.x0, ...xs); e.x1 = Math.max(e.x1, ...xs); e.z0 = Math.min(e.z0, ...zs); e.z1 = Math.max(e.z1, ...zs);
          posts.set(key, e);
          continue;
        }
        for (const p of t) {
          fx0 = Math.min(fx0, p[0]); fx1 = Math.max(fx1, p[0]); fz0 = Math.min(fz0, p[2]); fz1 = Math.max(fz1, p[2]);
        }
      }
    }
    if (!Number.isFinite(fx0)) continue;
    const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
    const r = (v) => Math.round(v * 100) / 100;
    // posts outside the wall footprint become small round obstacles: [x, z, radius]
    const outside = [...posts.values()].filter((e) => e.x1 < fx0 || e.x0 > fx1 || e.z1 < fz0 || e.z0 > fz1);
    const postList = outside.map((e) => [r((e.x0 + e.x1) / 2 - cx), r((e.z0 + e.z1) / 2 - cz), r(Math.max(0.02, Math.max(e.x1 - e.x0, e.z1 - e.z0) / 2))]);
    out[set.prefix + f.slice(0, -4)] = { box: [r(fx0 - cx), r(fx1 - cx), r(fz0 - cz), r(fz1 - cz)], posts: postList };
  }
}

const lines = Object.entries(out).map(([k, v]) =>
  `  '${k}': { box: [${v.box.join(', ')}]${v.posts.length ? `, posts: [${v.posts.map((p) => `[${p.join(', ')}]`).join(', ')}]` : ''} },`);
writeFileSync(
  join(ROOT, 'shared/src/townFootprints.ts'),
  `/**
 * Generated by scripts/footprints.mjs – do not edit by hand.
 * Ground footprint of each town building model in model units, relative to the centre of the model's
 * bounding box: box = [minX, maxX, minZ, maxZ] of the walls near the ground, posts = [x, z, radius] of
 * thin posts outside it (e.g. holding a canopy). Canopies and eaves do not block cars.
 */
export const TOWN_FOOTPRINTS: Record<string, { box: [number, number, number, number]; posts?: [number, number, number][] }> = {
${lines.join('\n')}
};
`,
);
console.log(`${lines.length} Fussabdrücke geschrieben`);
