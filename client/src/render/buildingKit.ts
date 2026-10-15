import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { templateCells, type Building } from '@spidi/shared';
import { getModel, getTexture } from './assets';

/**
 * Buildings for the practice town: Kenney models (and houses assembled from kit parts) drawn as
 * instanced meshes whose wall and roof colours are chosen per instance. A shader swaps the colours
 * of the wall / roof cells of the kit's palette texture, keeping the shading of each cell.
 */

type Kit = 'suburban' | 'commercial' | 'industrial' | 'fantasy' | 'retro' | 'other';

export function kitOf(model: string): Kit {
  if (model.startsWith('building-type')) return 'suburban';
  if (model.startsWith('ind-')) return 'industrial';
  if (model.startsWith('fan-') || model.startsWith('tpl-fantasy') || model.startsWith('tpl-church')) return 'fantasy';
  if (model.startsWith('ret-') || model.startsWith('tpl-retro')) return 'retro';
  if (model.startsWith('building-') || model.startsWith('low-detail')) return 'commercial';
  return 'other';
}

// ------------------------------------------------------------------ colours

const WALLS = ['#f3e2c0', '#f0b88a', '#b8d0e8', '#d9896a', '#bcd0a8', '#f2d77a', '#f4f4f0', '#e8b8c0'];
const ROOFS = ['#a8452f', '#4f5866', '#3f7a4a', '#7a5236', '#3d6a9a', '#8a3a3a', '#5e5e5e', '#b0703a'];
/** towers: stone and glass tones instead of pastels */
const TOWER_WALLS = ['#d8dde4', '#c9b8a0', '#a8b8c8', '#e0d0c0', '#b0c4b8', '#c8c8d8', '#e8e2d8', '#9fb0c0'];
const INDUSTRY_WALLS = ['#c8c0b0', '#b8a890', '#a8b0b8', '#d0c8b8', '#b0b8a0', '#c09078', '#d8d8d8', '#a0a8b0'];

/** Wall and roof colour of a building (linear colours for the shader). */
export function variantColors(b: Building) {
  const v = b.variant;
  // the church is light stone with a slate roof
  if (b.model.startsWith('tpl-church')) return { wall: new THREE.Color('#e8e2d4'), roof: new THREE.Color('#4f5866') };
  const kit = kitOf(b.model);
  const tower = b.model.startsWith('building-skyscraper') || /^building-[lmn]$/.test(b.model);
  const walls = tower ? TOWER_WALLS : kit === 'industrial' ? INDUSTRY_WALLS : WALLS;
  return { wall: new THREE.Color(walls[v % walls.length]), roof: new THREE.Color(ROOFS[(v * 3 + 1) % ROOFS.length]) };
}

// ------------------------------------------------------------------ palette mask per kit

const COLS = 16, ROWS = 4;

interface KitPalette {
  map: THREE.Texture;
  mask: THREE.DataTexture;
  material: THREE.MeshLambertMaterial;
  /** uv in the middle of a wall / roof cell (for procedural roofs and gables) */
  wallUv: [number, number];
  roofUv: [number, number];
}

const palettes = new Map<Kit, KitPalette | null>();

function srgbToLinear(c: number) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Find the palette cells used for walls (light, unsaturated, on vertical faces) and roofs (coloured,
 * on upward faces) in the kit's models, and build the mask texture: R = wall, G = roof, B = reference brightness.
 */
function kitPalette(kit: Kit, sample: string[]): KitPalette | null {
  if (palettes.has(kit)) return palettes.get(kit)!;
  let map: THREE.Texture | null = null;
  const vert = new Float64Array(COLS * ROWS), up = new Float64Array(COLS * ROWS);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (const name of sample) {
    const model = getModel(name);
    if (!model) continue;
    model.updateMatrixWorld(true);
    model.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const mat = o.material as THREE.MeshStandardMaterial;
      if (!mat.map) return;
      map ??= mat.map;
      const g = o.geometry, pos = g.attributes.position, uv = g.attributes.uv;
      if (!uv) return;
      const idx = g.index;
      const count = idx ? idx.count : pos.count;
      for (let t = 0; t < count; t += 3) {
        const i0 = idx ? idx.getX(t) : t, i1 = idx ? idx.getX(t + 1) : t + 1, i2 = idx ? idx.getX(t + 2) : t + 2;
        a.fromBufferAttribute(pos, i0).applyMatrix4(o.matrixWorld);
        b.fromBufferAttribute(pos, i1).applyMatrix4(o.matrixWorld);
        c.fromBufferAttribute(pos, i2).applyMatrix4(o.matrixWorld);
        n.crossVectors(b.clone().sub(a), c.clone().sub(a));
        const area = n.length();
        if (area < 1e-9) continue;
        n.divideScalar(area);
        const u = (uv.getX(i0) + uv.getX(i1) + uv.getX(i2)) / 3, v = (uv.getY(i0) + uv.getY(i1) + uv.getY(i2)) / 3;
        const cell = Math.min(ROWS - 1, Math.max(0, Math.floor(v * ROWS))) * COLS + Math.min(COLS - 1, Math.max(0, Math.floor(u * COLS)));
        if (Math.abs(n.y) < 0.3) vert[cell] += area;
        else if (n.y > 0.5) up[cell] += area;
      }
    });
  }
  const img = (map as THREE.Texture | null)?.image as HTMLImageElement | ImageBitmap | undefined;
  if (!map || !img) {
    palettes.set(kit, null);
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const g2 = canvas.getContext('2d')!;
  g2.drawImage(img as CanvasImageSource, 0, 0);
  const px = g2.getImageData(0, 0, canvas.width, canvas.height);
  const cellRgb = (k: number) => {
    const x = Math.floor(((k % COLS) + 0.5) * (canvas.width / COLS)), y = Math.floor((Math.floor(k / COLS) + 0.5) * (canvas.height / ROWS));
    const i = (y * canvas.width + x) * 4;
    return [px.data[i] / 255, px.data[i + 1] / 255, px.data[i + 2] / 255];
  };
  const hsl = (k: number) => {
    const [r, gg, bb] = cellRgb(k);
    const o = { h: 0, s: 0, l: 0 };
    new THREE.Color().setRGB(r, gg, bb, THREE.SRGBColorSpace).getHSL(o, THREE.SRGBColorSpace);
    return o;
  };
  const maxVert = Math.max(...vert), maxUp = Math.max(...up);
  const data = new Uint8Array(COLS * ROWS * 4);
  let wallCell = -1, roofCell = -1;
  for (let k = 0; k < COLS * ROWS; k++) {
    const h = hsl(k);
    const wall = vert[k] > maxVert * 0.12 && h.s < 0.3 && h.l > 0.55;
    const roof = !wall && up[k] > maxUp * 0.12 && h.s > 0.22;
    const [r, gg, bb] = cellRgb(k);
    const lum = 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(gg) + 0.0722 * srgbToLinear(bb);
    data.set([wall ? 255 : 0, roof ? 255 : 0, Math.round(Math.min(1, lum) * 255), 255], k * 4);
    if (wall && (wallCell < 0 || vert[k] > vert[wallCell])) wallCell = k;
    if (roof && (roofCell < 0 || up[k] > up[roofCell])) roofCell = k;
  }
  const mask = new THREE.DataTexture(data, COLS, ROWS, THREE.RGBAFormat);
  mask.magFilter = mask.minFilter = THREE.NearestFilter;
  mask.needsUpdate = true;
  const cellUv = (k: number, fallbackK: number): [number, number] => {
    const kk = k >= 0 ? k : fallbackK;
    return [((kk % COLS) + 0.5) / COLS, (Math.floor(kk / COLS) + 0.5) / ROWS];
  };
  const material = recolorMaterial(map, mask);
  const pal: KitPalette = { map, mask, material, wallUv: cellUv(wallCell, 0), roofUv: cellUv(roofCell, 0) };
  // procedural roofs need a roof cell even if the kit has none: mark the chosen cell as roof
  if (roofCell < 0) {
    const k = Math.floor(pal.roofUv[1] * ROWS) * COLS + Math.floor(pal.roofUv[0] * COLS);
    data[k * 4 + 1] = 255;
    mask.needsUpdate = true;
  }
  palettes.set(kit, pal);
  return pal;
}

/** Lambert material that replaces the wall / roof palette cells with per-instance colours. */
function recolorMaterial(map: THREE.Texture, mask: THREE.DataTexture) {
  // double sided: the procedural roofs and gables do not care about winding
  const m = new THREE.MeshLambertMaterial({ map, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.paletteMask = { value: mask };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 iWall;\nattribute vec3 iRoof;\nvarying vec3 vWall;\nvarying vec3 vRoof;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWall = iWall;\nvRoof = iRoof;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D paletteMask;\nvarying vec3 vWall;\nvarying vec3 vRoof;')
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          vec4 sampledDiffuseColor = texture2D( map, vMapUv );
          vec4 pm = texture2D( paletteMask, vMapUv );
          float lum = dot( sampledDiffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
          float f = clamp( lum / max( 0.02, pm.b ), 0.0, 1.5 );
          vec3 col = sampledDiffuseColor.rgb;
          col = mix( col, vWall * f, step( 0.5, pm.r ) );
          col = mix( col, vRoof * f, step( 0.5, pm.g ) );
          diffuseColor *= vec4( col, sampledDiffuseColor.a );
        #endif`,
      );
  };
  m.customProgramCacheKey = () => 'palette-recolor';
  return m;
}

// ------------------------------------------------------------------ parts of a building

interface Part {
  geometry: THREE.BufferGeometry;
  /** source material (decides how the part is drawn) */
  material: THREE.Material;
  /** apply the wall tint as instance colour (retro painted walls, procedural walls) */
  tint?: 'wall' | 'roof';
}

const plainCache = new Map<THREE.Material, THREE.MeshLambertMaterial>();
function plainLambert(m: THREE.Material) {
  let l = plainCache.get(m);
  if (!l) {
    const s = m as THREE.MeshStandardMaterial;
    // alpha-blended kit textures (e.g. window frames) are cut out instead: no sorting artefacts between buildings
    const cutout = s.transparent && s.opacity >= 1;
    l = new THREE.MeshLambertMaterial({
      color: s.color, map: s.map ?? null, transparent: s.transparent && !cutout, opacity: s.opacity,
      alphaTest: cutout ? 0.5 : s.alphaTest, side: s.side,
    });
    plainCache.set(m, l);
  }
  return l;
}

/** All meshes of a Kenney model, transformed into one geometry per material, centred on its footprint. */
function modelParts(name: string, place = new THREE.Matrix4(), centre = true): Part[] {
  const model = getModel(name);
  if (!model) return [];
  model.updateMatrixWorld(true);
  const shift = new THREE.Matrix4();
  if (centre) {
    const box = new THREE.Box3().setFromObject(model);
    shift.makeTranslation(-(box.min.x + box.max.x) / 2, 0, -(box.min.z + box.max.z) / 2);
  }
  const parts: Part[] = [];
  model.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(place, shift).multiply(o.matrixWorld));
    parts.push({ geometry: g, material: o.material as THREE.Material });
  });
  return parts;
}

/** Merge parts that share a material. */
function mergeParts(parts: Part[]): Part[] {
  const by = new Map<THREE.Material, Part[]>();
  for (const p of parts) {
    const k = by.get(p.material) ?? [];
    k.push(p);
    by.set(p.material, k);
  }
  const out: Part[] = [];
  for (const [material, list] of by) {
    const geos = list.map((p) => {
      const g = p.geometry.index ? p.geometry.toNonIndexed() : p.geometry;
      for (const key of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(key)) g.deleteAttribute(key);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      return g;
    });
    out.push({ geometry: mergeGeometries(geos)!, material, tint: list[0].tint });
  }
  return out;
}

/** A geometry whose every vertex uses the same uv (one palette cell). */
function withUv(g: THREE.BufferGeometry, uv: [number, number]) {
  const ng = g.index ? g.toNonIndexed() : g;
  const arr = new Float32Array(ng.attributes.position.count * 2);
  for (let i = 0; i < arr.length; i += 2) {
    arr[i] = uv[0];
    arr[i + 1] = uv[1];
  }
  ng.setAttribute('uv', new THREE.BufferAttribute(arr, 2));
  ng.computeVertexNormals();
  return ng;
}

/** Gable roof over a w × d rectangle (ridge along x), with gable triangles. */
function gableRoof(w: number, d: number, h: number, over: number) {
  const x0 = -w / 2 - over, x1 = w / 2 + over, z0 = -d / 2 - over, z1 = d / 2 + over;
  const slope = [
    // south and north slope
    x0, 0, z1, x1, 0, z1, x0, h, 0, x1, 0, z1, x1, h, 0, x0, h, 0,
    x1, 0, z0, x0, 0, z0, x1, h, 0, x0, 0, z0, x0, h, 0, x1, h, 0,
  ];
  const gable = [
    -w / 2, 0, -d / 2, -w / 2, 0, d / 2, -w / 2, h * (d / 2) / (d / 2 + over), 0,
    w / 2, 0, d / 2, w / 2, 0, -d / 2, w / 2, h * (d / 2) / (d / 2 + over), 0,
  ];
  const mk = (a: number[]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3));
    return g;
  };
  return { slope: mk(slope), gable: mk(gable) };
}

const templateCache = new Map<string, Part[]>();

/** Half-timbered old town house from Fantasy Town Kit walls with a procedural gable roof. */
function fantasyHouse(name: string, cx: number, cz: number, floors: number): Part[] {
  const pal = kitPalette('fantasy', ['fan-wall', 'fan-wall-wood', 'fan-roof', 'fan-wall-window-shutters']);
  const parts: Part[] = [];
  const hash = [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const marker = kitMarker('fantasy');
  const place = (piece: string, x: number, y: number, z: number, rot: number) => {
    q.setFromAxisAngle(up, rot);
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
    // everything textured with the kit palette is merged into one part
    for (const p of modelParts(piece, m.clone(), false)) parts.push((p.material as THREE.MeshStandardMaterial).map ? { ...p, material: marker } : p);
  };
  const sides = [
    { n: [0, 1], rot: -Math.PI / 2 },
    { n: [0, -1], rot: Math.PI / 2 },
    { n: [1, 0], rot: 0 },
    { n: [-1, 0], rot: Math.PI },
  ];
  for (let f = 0; f < floors; f++) {
    for (const s of sides) {
      const along = s.n[0] === 0 ? cx : cz;
      for (let k = 0; k < along; k++) {
        const x = s.n[0] === 0 ? -cx / 2 + 0.5 + k : (s.n[0] * (cx - 1)) / 2;
        const z = s.n[0] === 0 ? (s.n[1] * (cz - 1)) / 2 : -cz / 2 + 0.5 + k;
        const front = s.n[1] === 1;
        let piece: string;
        if (f === 0) {
          if (front && k === Math.floor(cx / 2)) piece = hash % 2 ? 'fan-wall-door' : 'fan-wall-doorway-round';
          else piece = (k + hash) % 3 === 0 ? 'fan-wall' : (k + hash) % 3 === 1 ? 'fan-wall-window-shutters' : 'fan-wall-window-glass';
        } else {
          const r = (k + f + hash) % 4;
          piece = r === 0 ? 'fan-wall-wood-detail-cross' : r === 1 ? 'fan-wall-wood-window-glass' : 'fan-wall-wood-window-shutters';
        }
        place(piece, x, f, z, s.rot);
      }
    }
  }
  if (pal) {
    const roof = gableRoof(cx, cz, 0.9, 0.15);
    parts.push({ geometry: withUv(roof.slope, pal.roofUv).translate(0, floors, 0), material: marker });
    parts.push({ geometry: withUv(roof.gable, pal.wallUv).translate(0, floors, 0), material: marker });
  }
  place('fan-chimney', cx / 2 - 0.9, floors - 0.2, 0, 0);
  return parts;
}

/**
 * Church from Fantasy Town Kit stone walls: a nave of cx × (cz − 2) cells with round-arched windows and
 * a gable roof along its length, and a 2 × 2 tower of twice the height at the front (+z) with a portal,
 * a pyramid spire and a cross.
 */
function churchHouse(cx: number, cz: number, floors: number): Part[] {
  const pal = kitPalette('fantasy', ['fan-wall', 'fan-wall-wood', 'fan-roof', 'fan-wall-window-shutters']);
  const parts: Part[] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const marker = kitMarker('fantasy');
  const place = (piece: string, x: number, y: number, z: number, rot: number) => {
    q.setFromAxisAngle(up, rot);
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
    for (const p of modelParts(piece, m.clone(), false)) parts.push((p.material as THREE.MeshStandardMaterial).map ? { ...p, material: marker } : p);
  };
  /** walls around a w × d rectangle centred at (ox, oz); piece(side, k, floor) picks the module */
  const walls = (w: number, d: number, ox: number, oz: number, levels: number, piece: (front: boolean, k: number, f: number) => string) => {
    const sides = [
      { n: [0, 1], rot: -Math.PI / 2 },
      { n: [0, -1], rot: Math.PI / 2 },
      { n: [1, 0], rot: 0 },
      { n: [-1, 0], rot: Math.PI },
    ];
    for (let f = 0; f < levels; f++) {
      for (const s of sides) {
        const along = s.n[0] === 0 ? w : d;
        for (let k = 0; k < along; k++) {
          const x = s.n[0] === 0 ? -w / 2 + 0.5 + k : (s.n[0] * (w - 1)) / 2;
          const z = s.n[0] === 0 ? (s.n[1] * (d - 1)) / 2 : -d / 2 + 0.5 + k;
          place(piece(s.n[1] === 1, k, f), ox + x, f, oz + z, s.rot);
        }
      }
    }
  };
  const naveD = cz - 2, naveZ = -1;
  walls(cx, naveD, 0, naveZ, floors, (_front, k, f) => (f === 1 && k % 2 === 0 ? 'fan-wall-window-round' : f === 0 && k % 3 === 1 ? 'fan-wall-arch' : 'fan-wall'));
  const towerFloors = floors * 2, towerZ = cz / 2 - 1;
  walls(2, 2, 0, towerZ, towerFloors, (front, k, f) =>
    f === 0 && front ? (k === 0 ? 'fan-wall-doorway-round' : 'fan-wall') : f % 2 === 1 && f > 1 ? 'fan-wall-window-round' : 'fan-wall');
  if (pal) {
    const roof = gableRoof(naveD, cx, 1.8, 0.15);
    const rot = (g: THREE.BufferGeometry) => g.rotateY(Math.PI / 2).translate(0, floors, naveZ);
    parts.push({ geometry: withUv(rot(roof.slope), pal.roofUv), material: marker });
    parts.push({ geometry: withUv(rot(roof.gable), pal.wallUv), material: marker });
    const spire = new THREE.ConeGeometry(1.5, 3.6, 4).rotateY(Math.PI / 4).translate(0, towerFloors + 1.8, towerZ);
    parts.push({ geometry: withUv(spire, pal.roofUv), material: marker });
  }
  const cross = mergeGeometries([
    new THREE.BoxGeometry(0.08, 0.9, 0.08).translate(0, towerFloors + 3.95, towerZ),
    new THREE.BoxGeometry(0.5, 0.08, 0.08).translate(0, towerFloors + 4.1, towerZ),
  ])!;
  parts.push({ geometry: cross, material: mats().gold });
  return parts;
}

/** Tunnel portal: a stone block (unit size, scaled per instance) – the dark opening is drawn by the town. */
function portalUnit(): Part[] {
  return [{ geometry: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), material: mats().stone }];
}

const retroMats = new Map<string, THREE.Material>();
/**
 * One material per retro texture name, so all parts with the same texture merge. Each kit file maps
 * into the texture atlas with its own uv transform (KHR_texture_transform); that transform is baked
 * into the part's uvs first (bakeUvTransform), so the shared material uses the untransformed texture.
 */
function retroMat(m: THREE.Material) {
  let r = retroMats.get(m.name);
  if (!r) {
    const src = m as THREE.MeshStandardMaterial;
    r = src.clone();
    const map = src.map?.clone();
    if (map) {
      map.offset.set(0, 0);
      map.repeat.set(1, 1);
      map.rotation = 0;
      map.center.set(0, 0);
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.needsUpdate = true;
      (r as THREE.MeshStandardMaterial).map = map;
    }
    retroMats.set(m.name, r);
  }
  return r;
}

function bakeUvTransform(g: THREE.BufferGeometry, map: THREE.Texture | null | undefined) {
  const uv = g.attributes.uv;
  if (!map || !uv) return;
  map.updateMatrix();
  const v = new THREE.Vector3();
  for (let i = 0; i < uv.count; i++) {
    v.set(uv.getX(i), uv.getY(i), 1).applyMatrix3(map.matrix);
    uv.setXY(i, v.x, v.y);
  }
  uv.needsUpdate = true;
}

/** Retro Urban apartment / shop house from flat facade panels with a flat roof. */
function retroHouse(name: string, cx: number, cz: number, floors: number): Part[] {
  const parts: Part[] = [];
  const hash = [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 11);
  const style = hash % 3; // 0 brick lines, 1 painted, 2 metal
  const plain = ['ret-wall-a-flat', 'ret-wall-a-flat-painted', 'ret-wall-b-flat'][style];
  const window = style === 2 ? 'ret-wall-b-flat-window' : 'ret-wall-a-flat-window';
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const place = (piece: string, x: number, y: number, z: number, rot: number) => {
    q.setFromAxisAngle(up, rot);
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
    for (const p of modelParts(piece, m.clone(), false)) {
      bakeUvTransform(p.geometry, (p.material as THREE.MeshStandardMaterial).map);
      const mat = retroMat(p.material as THREE.Material);
      parts.push({ ...p, material: mat, tint: mat.name === 'wall' ? 'wall' : undefined });
    }
  };
  // the retro facade panels face -z (their normals point there), so each side is turned by 180°
  const sides = [
    { n: [0, 1], rot: Math.PI },
    { n: [0, -1], rot: 0 },
    { n: [1, 0], rot: -Math.PI / 2 },
    { n: [-1, 0], rot: Math.PI / 2 },
  ];
  for (let f = 0; f < floors; f++) {
    for (const s of sides) {
      const count = s.n[0] === 0 ? cx : cz;
      for (let k = 0; k < count; k++) {
        const x = s.n[0] === 0 ? -cx / 2 + 0.5 + k : (s.n[0] * cx) / 2;
        const z = s.n[0] === 0 ? (s.n[1] * cz) / 2 : -cz / 2 + 0.5 + k;
        const front = s.n[1] === 1;
        let piece = (k + f) % 2 === 0 || count === 1 ? window : plain;
        if (f === 0 && front) piece = k === 0 && cx > 2 ? 'ret-wall-a-flat-garage' : 'ret-wall-a-flat-window';
        place(piece, x, f, z, s.rot);
        if (f === 0 && front && k > 0) place('ret-detail-awning-wide', x, 0.78, z + 0.15, Math.PI);
      }
    }
  }
  // flat roof with a parapet
  const roofMat = roofConcrete();
  const slab = new THREE.BoxGeometry(cx + 0.1, 0.12, cz + 0.1).translate(0, floors + 0.06, 0);
  const rim = mergeGeometries([
    new THREE.BoxGeometry(cx + 0.2, 0.3, 0.1).translate(0, floors + 0.15, cz / 2 + 0.05),
    new THREE.BoxGeometry(cx + 0.2, 0.3, 0.1).translate(0, floors + 0.15, -cz / 2 - 0.05),
    new THREE.BoxGeometry(0.1, 0.3, cz + 0.2).translate(cx / 2 + 0.05, floors + 0.15, 0),
    new THREE.BoxGeometry(0.1, 0.3, cz + 0.2).translate(-cx / 2 - 0.05, floors + 0.15, 0),
  ])!;
  parts.push({ geometry: slab, material: roofMat, tint: 'roof' }, { geometry: rim, material: roofMat });
  return parts;
}

let roofConcreteMat: THREE.MeshLambertMaterial | null = null;
function roofConcrete() {
  if (!roofConcreteMat) {
    roofConcreteMat = new THREE.MeshLambertMaterial({ color: '#b8b4ac' });
    roofConcreteMat.userData.keep = true;
  }
  return roofConcreteMat;
}

const markers = new Map<Kit, THREE.Material>();
/** Placeholder material meaning "draw with the kit's recolour material". */
function kitMarker(kit: Kit) {
  let m = markers.get(kit);
  if (!m) markers.set(kit, (m = new THREE.MeshBasicMaterial({ name: `kit:${kit}` })));
  return m;
}

// ------------------------------------------------------------------ procedural specials

function signTexture(text: string) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#c8202a';
  g.fillRect(0, 0, 1024, 128);
  g.fillStyle = '#ffd200';
  g.font = 'italic 900 86px "Arial Black", Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 512, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let specialMats: Record<string, THREE.Material> | null = null;
function mats() {
  if (specialMats) return specialMats;
  const concrete = getTexture('concrete');
  let wallMap: THREE.Texture | null = null;
  if (concrete) {
    wallMap = concrete.clone();
    wallMap.needsUpdate = true;
    wallMap.repeat.set(8, 2);
  }
  specialMats = {
    wall: new THREE.MeshLambertMaterial({ color: '#ece6da', map: wallMap }),
    glass: new THREE.MeshPhongMaterial({ color: '#2c4a63', shininess: 90, specular: '#9fc4e0' }),
    red: new THREE.MeshLambertMaterial({ color: '#c8202a' }),
    sign: new THREE.MeshBasicMaterial({ map: signTexture('SPIDI MARKT') }),
    metal: new THREE.MeshLambertMaterial({ color: '#8a9096' }),
    green: new THREE.MeshLambertMaterial({ color: '#3f8a3a' }),
    fence: new THREE.MeshLambertMaterial({ color: '#6f767c', transparent: true, opacity: 0.85 }),
    gold: new THREE.MeshLambertMaterial({ color: '#d8b040', emissive: '#3a2a00' }),
    stone: new THREE.MeshLambertMaterial({ color: '#8f8a80', map: wallMap }),
  };
  for (const m of Object.values(specialMats)) m.userData.keep = true;
  return specialMats;
}

/** Supermarket hall 48 × 30 × 8 m, entrance on the +z side. */
function supermarket(): Part[] {
  const m = mats();
  const W = 48, D = 30, H = 8;
  return [
    { geometry: new THREE.BoxGeometry(W, H, D).translate(0, H / 2, 0), material: m.wall },
    { geometry: new THREE.BoxGeometry(W + 0.4, 0.7, D + 0.4).translate(0, H + 0.1, 0), material: m.red },
    { geometry: new THREE.BoxGeometry(36, 4.2, 0.3).translate(0, 2.4, D / 2 + 0.05), material: m.glass },
    { geometry: new THREE.BoxGeometry(14, 0.5, 5).translate(0, 4.7, D / 2 + 2.5), material: m.red },
    {
      geometry: mergeGeometries([
        new THREE.BoxGeometry(0.3, 4.6, 0.3).translate(-6.5, 2.3, D / 2 + 4.7),
        new THREE.BoxGeometry(0.3, 4.6, 0.3).translate(6.5, 2.3, D / 2 + 4.7),
      ])!,
      material: m.metal,
    },
    { geometry: new THREE.PlaneGeometry(24, 3).translate(0, 6.5, D / 2 + 0.2), material: m.sign },
    // a second sign on the roof edge facing the back
    { geometry: new THREE.PlaneGeometry(16, 2).rotateY(Math.PI).translate(0, 6.6, -D / 2 - 0.2), material: m.sign },
  ];
}

/** Trolley shelter 7 × 2.6 m with a few trolleys. */
function cartShelter(): Part[] {
  const m = mats();
  const posts: THREE.BufferGeometry[] = [];
  for (const x of [-3.3, 3.3]) for (const z of [-1.1, 1.1]) posts.push(new THREE.BoxGeometry(0.12, 2.3, 0.12).translate(x, 1.15, z));
  const trolleys: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 6; k++) trolleys.push(new THREE.BoxGeometry(0.6, 0.6, 0.9).translate(-2.6 + k * 0.95, 0.65, 0));
  return [
    { geometry: new THREE.BoxGeometry(7.2, 0.12, 2.8).translate(0, 2.35, 0), material: m.green },
    { geometry: new THREE.BoxGeometry(7, 1.2, 0.08).translate(0, 1.2, -1.25), material: m.glass },
    { geometry: mergeGeometries(posts)!, material: m.metal },
    { geometry: mergeGeometries(trolleys)!, material: m.metal },
  ];
}

/** Fence segment of 1 × 1 × 1 m (scaled per instance to length, thickness and height). */
function fenceUnit(): Part[] {
  return [{ geometry: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), material: mats().fence }];
}

function partsFor(model: string): Part[] {
  let parts = templateCache.get(model);
  if (parts) return parts;
  const tpl = templateCells(model);
  if (tpl) {
    parts = mergeParts(tpl.kit === 'fantasy' ? fantasyHouse(model, tpl.x, tpl.z, tpl.floors)
      : tpl.kit === 'church' ? churchHouse(tpl.x, tpl.z, tpl.floors) : retroHouse(model, tpl.x, tpl.z, tpl.floors));
  }
  else if (model === 'supermarket') parts = supermarket();
  else if (model === 'cart-shelter') parts = cartShelter();
  else if (model === 'fence') parts = fenceUnit();
  else if (model === 'tunnel-portal') parts = portalUnit();
  else parts = mergeParts(modelParts(model));
  templateCache.set(model, parts);
  return parts;
}

// ------------------------------------------------------------------ instancing

const TAR = new THREE.Color('#5a5650');

export interface BuildingInstance {
  matrix: THREE.Matrix4;
  wall: THREE.Color;
  roof: THREE.Color;
}

const PALETTE_SAMPLES: Record<string, string[]> = {
  suburban: ['building-type-a', 'building-type-b', 'building-type-c', 'building-type-f', 'building-type-n', 'building-type-t'],
  commercial: ['building-a', 'building-b', 'building-e', 'building-skyscraper-a', 'building-skyscraper-b', 'building-l'],
  industrial: ['ind-building-a', 'ind-building-c', 'ind-building-e', 'ind-building-r', 'ind-building-t'],
  fantasy: ['fan-wall', 'fan-wall-wood', 'fan-roof', 'fan-wall-window-shutters'],
};

/** Instanced meshes for all instances of one model; each instance gets its own wall and roof colour. */
export function buildingMeshes(model: string, items: BuildingInstance[]): THREE.Object3D[] {
  if (items.length === 0) return [];
  const kit = kitOf(model);
  const pal = PALETTE_SAMPLES[kit] ? kitPalette(kit, PALETTE_SAMPLES[kit]) : null;
  const out: THREE.Object3D[] = [];
  for (const part of partsFor(model)) {
    const src = part.material as THREE.MeshStandardMaterial;
    const usesPalette = !!pal && (src.name === `kit:${kit}` || !!src.map);
    const geo = part.geometry.clone();
    let material: THREE.Material;
    if (usesPalette) {
      material = pal!.material;
      const wall = new Float32Array(items.length * 3), roof = new Float32Array(items.length * 3);
      items.forEach((it, i) => {
        wall.set([it.wall.r, it.wall.g, it.wall.b], i * 3);
        roof.set([it.roof.r, it.roof.g, it.roof.b], i * 3);
      });
      geo.setAttribute('iWall', new THREE.InstancedBufferAttribute(wall, 3));
      geo.setAttribute('iRoof', new THREE.InstancedBufferAttribute(roof, 3));
    } else {
      // our own materials are used as they are; kit materials (some are unlit) get normal lighting
      material = src.userData.keep ? src : plainLambert(src);
    }
    const im = new THREE.InstancedMesh(geo, material, items.length);
    items.forEach((it, i) => {
      im.setMatrixAt(i, it.matrix);
      // flat roofs: dark tar with a hint of the roof colour
      if (!usesPalette && part.tint) im.setColorAt(i, part.tint === 'wall' ? it.wall : TAR.clone().lerp(it.roof, 0.25));
    });
    im.computeBoundingSphere();
    out.push(im);
  }
  return out;
}
