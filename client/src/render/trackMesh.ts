import * as THREE from 'three';
import { mulberry32, onRunwayStrip, WALL_OFFSET, type Track, type TrackTheme } from '@spidi/shared';
import { getTexture, type TextureName } from './assets';
import { bannerTexture, checkerTexture, chevronTexture } from './textures';

type Profile = (i: number) => number[][]; // [lat, dy][]
type Colorer = (i: number, k: number) => THREE.Color;

/**
 * Builds a ribbon along the track. profile(i) gives the cross-section at sample i as [lat, dy] pairs;
 * each quad between samples i and i+1 / points k and k+1 gets color(i, k).
 */
function strip(track: Track, profile: Profile, color: Colorer, include: (i: number) => boolean = () => true) {
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const { n, px, py, pz, rx, rz, bank, ds } = track;
  const pt = (i: number, lat: number, dy: number) => [px[i] + rx[i] * lat, py[i] + bank[i] * lat + dy, pz[i] + rz[i] * lat];
  // texture coordinates in metres: across = lateral offset + height (so walls are not stretched), along = arc length
  const tc = (i: number, p: number[]) => [p[0] + p[1], i * ds];
  for (let i = 0; i < n; i++) {
    if (!include(i)) continue;
    const j = (i + 1) % n;
    const A = profile(i), B = profile(j);
    for (let k = 0; k < A.length - 1; k++) {
      const a = pt(i, A[k][0], A[k][1]);
      const b = pt(i, A[k + 1][0], A[k + 1][1]);
      const c = pt(j, B[k][0], B[k][1]);
      const d = pt(j, B[k + 1][0], B[k + 1][1]);
      pos.push(...a, ...b, ...c, ...b, ...d, ...c);
      uv.push(...tc(i, A[k]), ...tc(i, A[k + 1]), ...tc(i + 1, B[k]), ...tc(i, A[k + 1]), ...tc(i + 1, B[k + 1]), ...tc(i + 1, B[k]));
      const cl = color(i, k);
      for (let v = 0; v < 6; v++) col.push(cl.r, cl.g, cl.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Vertex-coloured material, optionally textured with a CC0 texture repeating every `metres`. */
function surface(tex: TextureName | null, metres: number, double = false) {
  const src = tex ? getTexture(tex) : undefined;
  let map: THREE.Texture | null = null;
  if (src) {
    map = src.clone();
    map.needsUpdate = true;
    map.repeat.set(1 / metres, 1 / metres);
  }
  return new THREE.MeshLambertMaterial({ vertexColors: true, map, side: double ? THREE.DoubleSide : THREE.FrontSide });
}

/** Places an object at track sample i with lateral offset, facing along the track (or against with flip). */
function placeAt(track: Track, obj: THREE.Object3D, i: number, lat: number, dy: number, rotY = 0) {
  obj.position.set(
    track.px[i] + track.rx[i] * lat,
    track.py[i] + track.bank[i] * lat + dy,
    track.pz[i] + track.rz[i] * lat,
  );
  obj.rotation.y = Math.atan2(track.tx[i], track.tz[i]) + rotY;
}

interface TrackStyle {
  /** asphalt tint with texture / flat colour without */
  asphalt: [string, string];
  /** centre marking; 'edges' = only the two edge lines */
  centre: 'dashed-white' | 'dashed-yellow' | 'lanes' | 'edges' | 'taxiway' | 'none';
  shoulder: [string, string];
  curbs: 'redwhite' | 'kerb' | 'none';
  barrier: 'guardrail' | 'stonewall' | 'jersey' | 'safer' | 'fence' | 'berm' | 'straw';
  verge: [string, string];
  vergeTex: TextureName;
  chevrons: boolean;
  /** texture of the driving surface and the shoulders */
  roadTex?: TextureName;
  shoulderTex?: TextureName;
  galleryTex?: TextureName;
  /** a second road surface where `where` holds (airport: concrete on the runway) */
  altRoad?: { tex: TextureName; tint: [string, string]; where: (t: Track, i: number) => boolean };
  /** galleries are bridges: open on both sides, pillars left and right (airport taxiway bridge) */
  bridge?: boolean;
}

/** airport: samples on one of the runways */
const onRunway = (t: Track, i: number) => onRunwayStrip(t.px[i], t.pz[i]);

const STYLES: Record<TrackTheme, TrackStyle> = {
  alpine: { asphalt: ['#9a9a9a', '#46484b'], centre: 'dashed-white', shoulder: ['#b8b0a0', '#6f685a'], curbs: 'redwhite', barrier: 'guardrail', verge: ['#9fb07a', '#5a6a3a'], vergeTex: 'grass', chevrons: true },
  coast: { asphalt: ['#a8a5a0', '#4a4a4d'], centre: 'dashed-yellow', shoulder: ['#d8ccb0', '#9b8d6c'], curbs: 'redwhite', barrier: 'stonewall', verge: ['#c8c088', '#8a8a55'], vergeTex: 'grass', chevrons: true },
  city: { asphalt: ['#8e8e8e', '#3e3f42'], centre: 'dashed-white', shoulder: ['#d0d0d0', '#8a8a88'], curbs: 'kerb', barrier: 'jersey', verge: ['#d4d4d4', '#8a8a88'], vergeTex: 'concrete', chevrons: false },
  speedway: { asphalt: ['#8a8a8a', '#3a3b3e'], centre: 'lanes', shoulder: ['#909090', '#4a4a4d'], curbs: 'none', barrier: 'safer', verge: ['#b8c8a0', '#5f8a3c'], vergeTex: 'grass', chevrons: false },
  desert: {
    asphalt: ['#f4e4d4', '#b98a5e'], centre: 'none', shoulder: ['#f0dccb', '#a8754a'], curbs: 'none', barrier: 'berm', verge: ['#f0d8c0', '#b0603a'],
    vergeTex: 'dune', chevrons: true, roadTex: 'desertdirt', shoulderTex: 'dune', galleryTex: 'redrock',
  },
  forest: {
    asphalt: ['#e6dccc', '#6b5236'], centre: 'none', shoulder: ['#e0d8c8', '#5e4a32'], curbs: 'none', barrier: 'fence', verge: ['#e0e8d0', '#4a5e32'],
    vergeTex: 'forestfloor', chevrons: true, roadTex: 'dirt', shoulderTex: 'forestfloor',
  },
  // airport: asphalt taxiways with a yellow centre line, concrete on the runway, low concrete barriers
  airport: {
    asphalt: ['#9c9c9c', '#46484b'], centre: 'taxiway', shoulder: ['#c8c8c4', '#8a8a88'], curbs: 'none', barrier: 'jersey',
    verge: ['#dce8c0', '#6f9a46'], vergeTex: 'grass', chevrons: true, shoulderTex: 'concrete',
    altRoad: { tex: 'concrete', tint: ['#e2e0da', '#a8a6a0'], where: onRunway }, bridge: true,
  },
  // micro track: a darker lane on the wooden table, edged with icing lines and drinking straws
  table: {
    asphalt: ['#b98d62', '#8a6440'], centre: 'edges', shoulder: ['#f2d6b0', '#b88a5a'], curbs: 'none', barrier: 'straw', verge: ['#f2d6b0', '#b88a5a'],
    vergeTex: 'wood', chevrons: false, roadTex: 'wood', shoulderTex: 'wood',
  },
};

export function buildTrackMesh(track: Track): THREE.Group {
  const group = new THREE.Group();
  const style = STYLES[track.def.theme];
  const rand = mulberry32(track.def.seed + 3);
  const C = (h: string) => new THREE.Color(h);
  const vc = new THREE.MeshLambertMaterial({ vertexColors: true });
  const vcDouble = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const hw = track.hw;
  const textured = !!getTexture('asphalt');
  const pick = (pair: [string, string]) => C(textured ? pair[0] : pair[1]);
  const W = WALL_OFFSET;

  // road surface (vertex colours act as tint / variation on top of the texture)
  const asphalt = pick(style.asphalt);
  // kickers and landing ramps are packed darker so they stand out when approaching
  const roadShades = Array.from({ length: track.n }, (_, i) =>
    asphalt.clone().multiplyScalar((0.94 + rand() * 0.08) * (track.jumpH[i] > 0.15 ? 0.72 : 1)));
  const alt = style.altRoad;
  const road = strip(track, (i) => [[-hw[i], 0], [0, 0], [hw[i], 0]], (i) => roadShades[i], alt ? (i) => !alt.where(track, i) : undefined);
  group.add(new THREE.Mesh(road, surface(style.roadTex ?? 'asphalt', style.roadTex === 'wood' ? 40 : style.roadTex ? 5 : 7)));
  if (alt) {
    const tint = pick(alt.tint);
    group.add(new THREE.Mesh(
      strip(track, (i) => [[-hw[i], 0], [0, 0], [hw[i], 0]], () => tint.clone().multiplyScalar(0.96 + rand() * 0.06), (i) => alt.where(track, i)),
      surface(alt.tex, 6),
    ));
  }
  addSurfacePatches(track, group);

  // markings
  const white = C('#e9e9e2');
  const yellow = C('#e8c22a');
  const line = (lat: (i: number) => number, width: number, color: THREE.Color, dashed: boolean) =>
    group.add(new THREE.Mesh(
      strip(track, (i) => [[lat(i) - width / 2, 0.025], [lat(i) + width / 2, 0.025]], () => color, dashed ? (i) => Math.floor(i / 3) % 2 === 0 : undefined),
      vc,
    ));
  if (style.centre === 'dashed-white' || style.centre === 'dashed-yellow') line(() => 0, 0.24, style.centre === 'dashed-white' ? white : yellow, true);
  if (style.centre === 'lanes') for (const f of [-1 / 3, 1 / 3]) line((i) => hw[i] * 2 * f, 0.2, white, true);
  if (style.centre === 'taxiway') {
    // solid yellow taxiway centre line, on the runway the dashed white runway centre line
    const runway = style.altRoad?.where ?? (() => false);
    group.add(new THREE.Mesh(strip(track, () => [[-0.15, 0.025], [0.15, 0.025]], () => yellow, (i) => !runway(track, i)), vc));
    group.add(new THREE.Mesh(strip(track, () => [[-0.45, 0.025], [0.45, 0.025]], () => white, (i) => runway(track, i) && Math.floor(i / 6) % 3 !== 2), vc));
  }
  if (style.centre !== 'none') {
    line((i) => -hw[i] + 0.45, 0.2, white, false);
    line((i) => hw[i] - 0.45, 0.2, style.centre === 'lanes' || style.centre === 'taxiway' ? yellow : white, false);
  }

  // shoulders, curbs in corners (racing) or grey kerbstones (city)
  const shoulder = pick(style.shoulder);
  const red = C('#c4262e'), curbWhite = C('#f0f0f0'), kerb = C(textured ? '#e4e4e4' : '#a8a8a8');
  const inCorner = (i: number) => Math.abs(track.curv[i]) > 0.012;
  for (const side of [-1, 1]) {
    group.add(new THREE.Mesh(
      strip(track, (i) => (side < 0 ? [[-hw[i] - W, 0], [-hw[i], 0.01]] : [[hw[i], 0.01], [hw[i] + W, 0]]), () => shoulder),
      surface(style.shoulderTex ?? (style.curbs === 'none' ? 'asphalt' : 'gravel'), style.shoulderTex === 'wood' ? 40 : style.curbs === 'none' && !style.shoulderTex ? 7 : 3),
    ));
    const curbProfile = (i: number) => (side < 0 ? [[-hw[i] - 0.9, 0.03], [-hw[i], 0.03]] : [[hw[i], 0.03], [hw[i] + 0.9, 0.03]]);
    if (style.curbs === 'redwhite') group.add(new THREE.Mesh(strip(track, curbProfile, (i) => (i % 2 ? red : curbWhite), inCorner), vc));
    if (style.curbs === 'kerb') {
      group.add(new THREE.Mesh(strip(track, (i) => (side < 0 ? [[-hw[i] - 0.3, 0.12], [-hw[i], 0.12]] : [[hw[i], 0.12], [hw[i] + 0.3, 0.12]]), () => kerb), surface('concrete', 2)));
    }
  }

  // barriers + skirts down to the terrain (deeper where the road is banked)
  const verge = pick(style.verge);
  const outerSide = -Math.sign(track.curv.reduce((a, b) => a + b, 0)) || 1;
  for (const side of [-1, 1]) {
    const L = (i: number) => side * (hw[i] + W);
    const wall = (height: number, thick: number, tint: [string, string], metres: number) => {
      const t = C(textured ? tint[0] : tint[1]);
      const top = t.clone().multiplyScalar(1.08);
      group.add(new THREE.Mesh(
        strip(track, (i) => [[L(i), 0], [L(i), height], [L(i) + side * thick, height], [L(i) + side * thick, 0]], (_i, k) => (k === 1 ? top : t)),
        surface('concrete', metres, true),
      ));
    };
    switch (style.barrier) {
      case 'guardrail':
        group.add(new THREE.Mesh(strip(track, (i) => [[L(i), 0.5], [L(i), 0.85]], () => C('#b8bfc6')), vcDouble));
        break;
      case 'stonewall':
        wall(0.9, 0.5, ['#f2e6cc', '#d9cdb0'], 2.5);
        break;
      case 'jersey':
        wall(1.0, 0.6, ['#e8e8e6', '#b5b5b2'], 2.5);
        break;
      case 'fence': {
        // wooden rails; posts are added below
        const wood = C(textured ? '#9a6a42' : '#7a5232');
        group.add(new THREE.Mesh(strip(track, (i) => [[L(i), 0.45], [L(i), 0.6]], () => wood), vcDouble));
        group.add(new THREE.Mesh(strip(track, (i) => [[L(i), 0.9], [L(i), 1.05]], () => wood), vcDouble));
        break;
      }
      case 'berm':
        // low sand berm; rocks along it come from the scenery
        group.add(new THREE.Mesh(strip(track, (i) => [[L(i) - side * 0.3, 0], [L(i) + side * 0.6, 0.7], [L(i) + side * 1.6, 0]], () => verge), surface(style.vergeTex, 4, true)));
        break;
      case 'straw': {
        // a drinking straw lying on the table: round cross-section, white stripes, colour changes every ~70 m
        const r = 0.42, segs = 8;
        const colours = ['#e0242b', '#1f8fd6', '#2fa84a', '#f2b81c'].map(C);
        const stripe = C('#fafafa');
        const sectionLen = Math.round(70 / track.ds);
        const tone = Math.floor(rand() * colours.length);
        group.add(new THREE.Mesh(
          strip(track, (i) => Array.from({ length: segs + 1 }, (_, k) => {
            const a = (k / segs) * Math.PI * 2;
            return [L(i) + side * (r + Math.cos(a) * r), r + Math.sin(a) * r];
          }), (i) => (Math.floor((i * track.ds) / 1.4) % 2 ? stripe : colours[(tone + Math.floor(i / sectionLen) + (side > 0 ? 2 : 0)) % colours.length])),
          new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 60, specular: '#555555', side: THREE.DoubleSide }),
        ));
        break;
      }
      case 'safer':
        wall(1.3, 0.5, ['#f6f6f6', '#d8d8d8'], 3);
        if (side === outerSide) {
          // catch fence above the outer wall
          const fence = new THREE.MeshLambertMaterial({ color: '#c8ccd0', transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
          group.add(new THREE.Mesh(strip(track, (i) => [[L(i) + side * 0.25, 1.3], [L(i) + side * 0.25, 5.5]], () => C('#ffffff')), fence));
        }
        break;
    }
    // deeper where the road is banked or raised by a jump
    const drop = (i: number) => 2.2 + Math.abs(track.bank[i]) * 14 + Math.max(0, track.jumpH[i]) * 1.5;
    if (style.barrier === 'straw') {
      // the lane lies flat on the table: no embankment
    } else if (track.def.theme === 'airport') {
      // flat airfield: only a short concrete edge down to the paved scenery below the road level
      group.add(new THREE.Mesh(strip(track, (i) => [[L(i), 0], [L(i) + side * 1.2, -0.25]], () => shoulder), surface('concrete', 3, true)));
    } else if (style.barrier === 'jersey') {
      // city: raised sidewalk behind the barrier, then down to the ground
      group.add(new THREE.Mesh(strip(track, (i) => [[L(i), 0.15], [L(i) + side * 5, 0.15]], () => verge), surface('concrete', 3, true)));
      group.add(new THREE.Mesh(strip(track, (i) => [[L(i) + side * 5, 0.15], [L(i) + side * 6, -drop(i)]], () => verge), surface('concrete', 3, true)));
    } else {
      group.add(new THREE.Mesh(strip(track, (i) => [[L(i), 0], [L(i) + side * 3.5, -drop(i)]], () => verge), surface(style.vergeTex, 4, true)));
    }
  }

  // guardrail / fence posts
  const postEvery = style.barrier === 'guardrail' || style.barrier === 'fence' ? 2 : style.barrier === 'safer' ? 3 : 0;
  if (postEvery) {
    const tall = style.barrier === 'safer';
    const wooden = style.barrier === 'fence';
    const postGeo = wooden ? new THREE.BoxGeometry(0.18, 1.2, 0.18) : new THREE.BoxGeometry(0.14, tall ? 5.5 : 0.9, 0.14);
    const postColor = wooden ? '#6e4a2c' : tall ? '#9aa0a6' : '#8d949a';
    const posts = new THREE.InstancedMesh(postGeo, new THREE.MeshLambertMaterial({ color: postColor }), Math.ceil(track.n / postEvery) * 2);
    const o = new THREE.Object3D();
    let k = 0;
    for (let i = 0; i < track.n; i += postEvery)
      for (const side of [-1, 1]) {
        if (tall && side !== outerSide) continue;
        placeAt(track, o, i, side * (hw[i] + W + (tall ? 0.25 : 0.1)), tall ? 2.75 : wooden ? 0.6 : 0.45);
        o.updateMatrix();
        posts.setMatrixAt(k++, o.matrix);
      }
    posts.count = k;
    group.add(posts);
  }

  addGalleries(track, group);
  addStartLine(track, group);
  if (style.chevrons) addChevrons(track, group);
  if (track.def.theme === 'speedway') addGrandstands(track, group, outerSide);
  return group;
}

/** Mud, sand and water sections (and the creek at the bottom of jump pits in the forest). */
function addSurfacePatches(track: Track, group: THREE.Group) {
  const hw = track.hw;
  const white = new THREE.Color('#ffffff');
  const patch = (tex: TextureName, metres: number, dy: number, include: (i: number) => boolean, tint = white) => {
    if (!Array.from({ length: track.n }, (_, i) => include(i)).some(Boolean)) return;
    group.add(new THREE.Mesh(strip(track, (i) => [[-hw[i] - 0.6, dy], [0, dy], [hw[i] + 0.6, dy]], () => tint, include), surface(tex, metres)));
  };
  patch('mud', 4, 0.03, (i) => track.surfaceAt(i) === 'mud', new THREE.Color('#9a8a78'));
  patch('dune', 6, 0.03, (i) => track.surfaceAt(i) === 'sand');
  const forest = track.def.theme === 'forest';
  const isWater = (i: number) => track.surfaceAt(i) === 'water' || (forest && track.jumpH[i] < -1);
  if (Array.from({ length: track.n }, (_, i) => isWater(i)).some(Boolean)) {
    const water = new THREE.MeshPhongMaterial({ color: '#3d6f8a', shininess: 80, specular: '#a8d0e8', transparent: true, opacity: 0.8 });
    const W = WALL_OFFSET + 3;
    group.add(new THREE.Mesh(strip(track, (i) => [[-hw[i] - W, 0.25], [hw[i] + W, 0.25]], () => white, isWater), water));
  }
}

function addGalleries(track: Track, group: THREE.Group) {
  const has = (i: number) => track.gallery[i] !== 0;
  if (!Array.from(track.gallery).some((g) => g !== 0)) return;
  const hw = track.hw;
  const tex = STYLES[track.def.theme].galleryTex ?? 'concrete';
  const textured = !!getTexture(tex);
  // a bridge is open at the sides: its underside gets more light than a gallery's
  const open = !!STYLES[track.def.theme].bridge;
  const concrete = new THREE.Color(textured ? '#e8e4dc' : '#aaa59b');
  const under = new THREE.Color(open ? (textured ? '#f4f0e8' : '#b4b0a8') : textured ? '#9a968e' : '#6e6a63');
  const mat = surface(tex, 4, true);
  const R = (i: number) => hw[i] + WALL_OFFSET + 1.4;
  const H = 6.4;
  group.add(new THREE.Mesh(strip(track, (i) => [[-R(i), H + 0.7], [R(i), H + 0.7]], () => concrete, has), mat));
  group.add(new THREE.Mesh(strip(track, (i) => [[R(i), H], [-R(i), H]], () => under, has), mat));
  group.add(new THREE.Mesh(strip(track, (i) => [[-R(i), H], [-R(i), H + 0.7]], () => concrete, has), mat));
  group.add(new THREE.Mesh(strip(track, (i) => [[R(i), H], [R(i), H + 0.7]], () => concrete, has), mat));
  const bridge = !!STYLES[track.def.theme].bridge;
  if (!bridge) {
    // mountain-side wall
    // side of the gallery at sample i; the quad after the last gallery sample reuses its neighbour's side
    const sideAt = (i: number) => track.gallery[i] || track.gallery[(i - 1 + track.n) % track.n] || track.gallery[(i + 1) % track.n];
    group.add(new THREE.Mesh(strip(track, (i) => [[sideAt(i) * (R(i) - 0.4), 0], [sideAt(i) * (R(i) - 0.4), H]], () => under, has), mat));
  }
  // valley-side pillars (a bridge stands on pillars on both sides)
  const pillarGeo = new THREE.BoxGeometry(0.9, H, 0.9);
  const pillarMat = new THREE.MeshLambertMaterial({ color: textured ? '#d8d4cc' : '#a29d93', map: getTexture('concrete') ?? null });
  for (let i = 0; i < track.n; i += 4) {
    if (!has(i)) continue;
    for (const side of bridge ? [-1, 1] : [-track.gallery[i]]) {
      const p = new THREE.Mesh(pillarGeo, pillarMat);
      placeAt(track, p, i, side * (R(i) - 0.4), H / 2);
      group.add(p);
    }
  }
}

/** Stepped grandstands with a crowd along the start/finish straight (outside of the oval). */
function addGrandstands(track: Track, group: THREE.Group, side: number) {
  const from = Math.round(40 / track.ds), to = Math.round(820 / track.ds);
  const inRange = (i: number) => i >= from && i < to;
  const rows = 14, depth = 1.1, rise = 0.65, base = 2.2;
  const start = (i: number) => track.hw[i] + WALL_OFFSET + 3;
  const profile = (i: number) => {
    const L = start(i);
    const pts: number[][] = [[L, 0], [L, base]];
    for (let r = 0; r < rows; r++) {
      pts.push([L + r * depth + depth, base + r * rise]);
      pts.push([L + r * depth + depth, base + (r + 1) * rise]);
    }
    pts.push([L + rows * depth + 0.01, 0]);
    return pts.map(([lat, dy]) => [lat * side, dy]);
  };
  const crowd = ['#d13b3b', '#3b6fd1', '#f2c230', '#f4f4f4', '#2f9a4a', '#e07a2e', '#7a3bd1', '#222222'].map((c) => new THREE.Color(c));
  const concrete = new THREE.Color('#b4b4b0');
  const rand = mulberry32(track.def.seed + 17);
  const seats = Array.from({ length: track.n * 2 * rows + 8 }, () => crowd[Math.floor(rand() * crowd.length)]);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  group.add(new THREE.Mesh(strip(track, profile, (i, k) => (k > 0 && k < rows * 2 + 1 ? seats[(i * rows * 2 + k) % seats.length] : concrete), inRange), mat));
  // roof on posts
  const roofH = base + rows * rise + 5;
  const roofMat = new THREE.MeshLambertMaterial({ color: '#e4e6e8', emissive: '#3a3c40', side: THREE.DoubleSide });
  group.add(new THREE.Mesh(
    strip(track, (i) => [[side * (start(i) - 1), roofH], [side * (start(i) + rows * depth + 1), roofH + 1.5]], () => new THREE.Color('#ffffff'), inRange),
    roofMat,
  ));
  const postGeo = new THREE.BoxGeometry(0.4, roofH, 0.4);
  const postMat = new THREE.MeshLambertMaterial({ color: '#8a9096' });
  for (let i = from; i < to; i += Math.round(24 / track.ds)) {
    const p = new THREE.Mesh(postGeo, postMat);
    placeAt(track, p, i, side * (start(i) + rows * depth + 0.5), roofH / 2);
    group.add(p);
  }
}

function addStartLine(track: Track, group: THREE.Group) {
  const hw = track.hw[0];
  const line = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, 2.4), new THREE.MeshLambertMaterial({ map: checkerTexture() }));
  line.rotation.x = -Math.PI / 2;
  const holder = new THREE.Group();
  placeAt(track, holder, 0, 0, 0.03);
  holder.add(line);
  group.add(holder);

  const gantry = new THREE.Group();
  const span = (hw + WALL_OFFSET + 0.8) * 2;
  const pillarMat = new THREE.MeshLambertMaterial({ color: '#d8d8d8' });
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7.5, 0.6), pillarMat);
    p.position.set(side * span / 2, 3.75, 0);
    gantry.add(p);
  }
  const tex = bannerTexture('SPIDI RACE', track.def.name.toUpperCase());
  const bannerMat = new THREE.MeshLambertMaterial({ map: tex });
  const edgeMat = new THREE.MeshLambertMaterial({ color: '#0b1236' });
  const banner = new THREE.Mesh(new THREE.BoxGeometry(span, 1.6, 0.4), [edgeMat, edgeMat, edgeMat, edgeMat, bannerMat, bannerMat]);
  banner.position.y = 6.9;
  gantry.add(banner);
  placeAt(track, gantry, 0, 0, 0);
  group.add(gantry);
}

function addChevrons(track: Track, group: THREE.Group) {
  const tex = chevronTexture();
  const right = new THREE.MeshLambertMaterial({ map: tex });
  const texL = tex.clone();
  texL.wrapS = THREE.RepeatWrapping;
  texL.repeat.x = -1;
  texL.offset.x = 1;
  const left = new THREE.MeshLambertMaterial({ map: texL });
  const board = new THREE.PlaneGeometry(1.5, 1.1);
  const postGeo = new THREE.BoxGeometry(0.1, 1.2, 0.1);
  const postMat = new THREE.MeshLambertMaterial({ color: '#555' });
  let last = -100;
  for (let i = 0; i < track.n; i++) {
    const k = track.curv[i];
    if (Math.abs(k) < 0.02 || i - last < 6 || track.gallery[i] !== 0) continue;
    last = i;
    const outer = -Math.sign(k);
    const sign = new THREE.Group();
    const b = new THREE.Mesh(board, k > 0 ? right : left);
    b.position.y = 1.65;
    sign.add(b);
    const p = new THREE.Mesh(postGeo, postMat);
    p.position.y = 0.6;
    sign.add(p);
    placeAt(track, sign, i, outer * (track.hw[i] + WALL_OFFSET + 0.6), 0, Math.PI);
    group.add(sign);
  }
}
