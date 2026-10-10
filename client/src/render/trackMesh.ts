import * as THREE from 'three';
import { mulberry32, WALL_OFFSET, type Track } from '@spidi/shared';
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

export function buildTrackMesh(track: Track): THREE.Group {
  const group = new THREE.Group();
  const alpine = track.def.theme === 'alpine';
  const rand = mulberry32(track.def.seed + 3);
  const C = (h: string) => new THREE.Color(h);
  const vc = new THREE.MeshLambertMaterial({ vertexColors: true });
  const vcDouble = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const hw = track.hw;


  const textured = !!getTexture('asphalt');
  const W = WALL_OFFSET;

  // road surface (vertex colours act as tint / variation on top of the texture)
  const asphalt = textured ? C(alpine ? '#9a9a9a' : '#a8a5a0') : C(alpine ? '#46484b' : '#4a4a4d');
  const roadShades = Array.from({ length: track.n }, () => asphalt.clone().multiplyScalar(0.94 + rand() * 0.08));
  const road = strip(track, (i) => [[-hw[i], 0], [0, 0], [hw[i], 0]], (i) => roadShades[i]);
  group.add(new THREE.Mesh(road, surface('asphalt', 7)));

  // markings
  const white = C('#e9e9e2');
  const yellow = C('#e8c22a');
  const center = alpine ? white : yellow;
  group.add(new THREE.Mesh(strip(track, () => [[-0.12, 0.025], [0.12, 0.025]], () => center, (i) => Math.floor(i / 3) % 2 === 0), vc));
  group.add(new THREE.Mesh(strip(track, (i) => [[-hw[i] + 0.35, 0.025], [-hw[i] + 0.55, 0.025]], () => white), vc));
  group.add(new THREE.Mesh(strip(track, (i) => [[hw[i] - 0.55, 0.025], [hw[i] - 0.35, 0.025]], () => white), vc));

  // gravel shoulders, red/white curbs on top of them in corners
  const shoulder = textured ? C(alpine ? '#b8b0a0' : '#d8ccb0') : C(alpine ? '#6f685a' : '#9b8d6c');
  const red = C('#c4262e'), curbWhite = C('#f0f0f0');
  const inCorner = (i: number) => Math.abs(track.curv[i]) > 0.012;
  for (const side of [-1, 1]) {
    group.add(new THREE.Mesh(strip(track, (i) => (side < 0 ? [[-hw[i] - W, 0], [-hw[i], 0.01]] : [[hw[i], 0.01], [hw[i] + W, 0]]), () => shoulder), surface('gravel', 3)));
    group.add(new THREE.Mesh(strip(track, (i) => (side < 0 ? [[-hw[i] - 0.9, 0.03], [-hw[i], 0.03]] : [[hw[i], 0.03], [hw[i] + 0.9, 0.03]]), (i) => (i % 2 ? red : curbWhite), inCorner), vc));
  }

  // barriers + skirts down to the terrain
  const verge = textured ? C(alpine ? '#9fb07a' : '#c8c088') : C(alpine ? '#5a6a3a' : '#8a8a55');
  for (const side of [-1, 1]) {
    const L = (i: number) => side * (hw[i] + W);
    if (alpine) {
      group.add(new THREE.Mesh(strip(track, (i) => [[L(i), 0.5], [L(i), 0.85]], () => C('#b8bfc6')), vcDouble));
    } else {
      const wallTint = textured ? [C('#f2e6cc'), C('#e0d0b0')] : [C('#d9cdb0'), C('#c2b391')];
      group.add(new THREE.Mesh(
        strip(track, (i) => [[L(i), 0], [L(i), 0.9], [L(i) + side * 0.5, 0.9], [L(i) + side * 0.5, 0]], (_i, k) => (k === 1 ? wallTint[0] : wallTint[1])),
        surface('concrete', 2.5, true),
      ));
    }
    group.add(new THREE.Mesh(strip(track, (i) => [[L(i), 0], [L(i) + side * 3.5, -2.2]], () => verge), surface('grass', 4, true)));
  }

  // guardrail posts
  if (alpine) {
    const postGeo = new THREE.BoxGeometry(0.14, 0.9, 0.14);
    const count = Math.ceil(track.n / 2) * 2;
    const posts = new THREE.InstancedMesh(postGeo, new THREE.MeshLambertMaterial({ color: '#8d949a' }), count);
    const o = new THREE.Object3D();
    let k = 0;
    for (let i = 0; i < track.n; i += 2)
      for (const side of [-1, 1]) {
        placeAt(track, o, i, side * (hw[i] + W + 0.1), 0.45);
        o.updateMatrix();
        posts.setMatrixAt(k++, o.matrix);
      }
    posts.count = k;
    group.add(posts);
  }

  addGalleries(track, group);
  addStartLine(track, group);
  addChevrons(track, group);
  return group;
}

function addGalleries(track: Track, group: THREE.Group) {
  const has = (i: number) => track.gallery[i] !== 0;
  if (!Array.from(track.gallery).some((g) => g !== 0)) return;
  const hw = track.hw;
  const textured = !!getTexture('concrete');
  const concrete = new THREE.Color(textured ? '#e8e4dc' : '#aaa59b'), under = new THREE.Color(textured ? '#9a968e' : '#6e6a63');
  const mat = surface('concrete', 4, true);
  const R = (i: number) => hw[i] + WALL_OFFSET + 1.4;
  const H = 6.4;
  group.add(new THREE.Mesh(strip(track, (i) => [[-R(i), H + 0.7], [R(i), H + 0.7]], () => concrete, has), mat));
  group.add(new THREE.Mesh(strip(track, (i) => [[R(i), H], [-R(i), H]], () => under, has), mat));
  group.add(new THREE.Mesh(strip(track, (i) => [[-R(i), H], [-R(i), H + 0.7]], () => concrete, has), mat));
  group.add(new THREE.Mesh(strip(track, (i) => [[R(i), H], [R(i), H + 0.7]], () => concrete, has), mat));
  // mountain-side wall
  group.add(new THREE.Mesh(strip(track, (i) => [[track.gallery[i] * (R(i) - 0.4), 0], [track.gallery[i] * (R(i) - 0.4), H]], () => under, has), mat));
  // valley-side pillars
  const pillarGeo = new THREE.BoxGeometry(0.9, H, 0.9);
  const pillarMat = new THREE.MeshLambertMaterial({ color: textured ? '#d8d4cc' : '#a29d93', map: getTexture('concrete') ?? null });
  for (let i = 0; i < track.n; i += 4) {
    if (!has(i)) continue;
    const p = new THREE.Mesh(pillarGeo, pillarMat);
    placeAt(track, p, i, -track.gallery[i] * (R(i) - 0.4), H / 2);
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
