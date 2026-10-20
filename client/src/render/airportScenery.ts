import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AIRPORT, getTrack, mulberry32, onStrip, WALL_OFFSET, type Area, type Strip, type Track } from '@spidi/shared';
import { assetsReady, getModel, getTexture, type TextureName } from './assets';
import { buildingMeshes, type BuildingInstance } from './buildingKit';
import { colored, fallback, instanced, type Variant } from './scenery';
import type { Terrain } from './terrain';

/**
 * Scenery of the airport, shared by the road race `flughafen` and the kart race `flughafen-kart`:
 * paved runways, taxiways and aprons with their markings and lights, terminal, docks with jet bridges,
 * tower, hangars, the taxiway bridge, parked aircraft, apron vehicles, windsocks, the perimeter fence
 * and trees outside it. Point objects keep clear of the roadways of BOTH tracks (they share the world).
 */

/**
 * Heights of the flat layers: grass (terrain) < paved scenery < markings < the track's own road (0).
 * 10–20 cm apart, so nothing flickers far away; markings under a driven roadway are left out.
 */
const Y_RUNWAY = -0.16, Y_TAXI = -0.17, Y_APRON = -0.18, Y_MARK = -0.13;

/** the taxiway bridge deck: its top is just above the underpass roof of the road race */
export const BRIDGE_DECK = 7.15;

const TRACK_IDS = ['flughafen', 'flughafen-kart'];

/** True if a circle of radius r at (x, z) stays off the roadway (incl. barriers) of both airport tracks. */
export function clearOfTracks(x: number, z: number, r: number) {
  return TRACK_IDS.every((id) => {
    const t = getTrack(id);
    const p = t.project(x, z);
    return Math.abs(p.lat) > p.halfWidth + WALL_OFFSET + r + 1;
  });
}

// ------------------------------------------------------------------ paved ground and markings

/** Flat rectangles collected into one mesh; uv in metres (along / across). */
class Decals {
  private pos: number[] = [];
  private uv: number[] = [];

  /** an oriented rectangle from (x1, z1) to (x2, z2) of the given width at height y */
  strip(x1: number, z1: number, x2: number, z2: number, width: number, y: number) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (len < 1e-6) return;
    const tx = (x2 - x1) / len, tz = (z2 - z1) / len;
    const nx = -tz * (width / 2), nz = tx * (width / 2);
    const a = [x1 + nx, y, z1 + nz], b = [x1 - nx, y, z1 - nz], c = [x2 + nx, y, z2 + nz], d = [x2 - nx, y, z2 - nz];
    // counter-clockwise seen from above
    this.pos.push(...a, ...c, ...b, ...b, ...c, ...d);
    this.uv.push(0, 0, len, 0, 0, width, 0, width, len, 0, len, width);
  }

  area(a: Area, y: number) {
    this.strip(a.x - a.w / 2, a.z, a.x + a.w / 2, a.z, a.d, y);
  }

  mesh(mat: THREE.Material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();
    return new THREE.Mesh(g, mat);
  }
}

function paved(tex: TextureName, metres: number, tint: string, plain: string) {
  const src = getTexture(tex);
  let map: THREE.Texture | null = null;
  if (src) {
    map = src.clone();
    map.needsUpdate = true;
    map.repeat.set(1 / metres, 1 / metres);
  }
  return new THREE.MeshLambertMaterial({ map, color: map ? tint : plain });
}

const markMat = (color: string) => new THREE.MeshLambertMaterial({ color });

/** A marking line along a strip, cut into 5 m pieces; pieces under a driven roadway are left out. */
function markLine(d: Decals, s: Strip, t0: number, t1: number, lat: number, w: number, own: Strip | null) {
  for (let t = t0; t < t1; t += 5) {
    const e = Math.min(t1, t + 5);
    const [ax, az] = along(s, t, lat), [bx, bz] = along(s, e, lat);
    if (!clearOfTracks((ax + bx) / 2, (az + bz) / 2, w / 2) || onOtherRunway(own, (ax + bx) / 2, (az + bz) / 2)) continue;
    d.strip(ax, az, bx, bz, w, Y_MARK);
  }
}

/** True if (x, z) is on a runway other than `own` (markings and lights stop where runways cross). */
const onOtherRunway = (own: Strip | null, x: number, z: number) => AIRPORT.runways.some((r) => r !== own && onStrip(r, x, z, 2));

/** point along a strip: t = metres from its start, lat = metres to the left (+) / right (-) */
function along(s: Strip, t: number, lat: number): [number, number] {
  const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
  const tx = (s.x2 - s.x1) / len, tz = (s.z2 - s.z1) / len;
  return [s.x1 + tx * t - tz * lat, s.z1 + tz * t + tx * lat];
}

export function numberTexture(text: string) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.font = 'bold 150px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 64, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function signTexture(text: string) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1d2b4a';
  g.fillRect(0, 0, 512, 96);
  g.fillStyle = '#f2c230';
  g.fillRect(0, 86, 512, 10);
  g.fillStyle = '#ffffff';
  g.font = 'bold 56px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 46);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function groundAndMarkings(group: THREE.Group) {
  const runway = new Decals(), taxi = new Decals(), apron = new Decals();
  const white = new Decals(), yellow = new Decals();
  // crossing runways lie a few millimetres apart, so their surfaces do not flicker
  AIRPORT.runways.forEach((r, k) => runway.strip(r.x1, r.z1, r.x2, r.z2, r.width, Y_RUNWAY + k * 0.008));
  for (const t of AIRPORT.taxiways) taxi.strip(t.x1, t.z1, t.x2, t.z2, t.width, Y_TAXI);
  for (const a of AIRPORT.aprons) apron.area(a, Y_APRON);
  // apron in front of the terminal between the docks and the taxiway
  group.add(runway.mesh(paved('concrete', 8, '#e4e2dc', '#b4b2ac')));
  group.add(taxi.mesh(paved('asphalt', 7, '#a4a4a4', '#56585b')));
  group.add(apron.mesh(paved('concrete', 6, '#d6d4ce', '#a8a6a0')));

  const numbers: THREE.Object3D[] = [];
  for (const r of AIRPORT.runways) {
    const len = Math.hypot(r.x2 - r.x1, r.z2 - r.z1);
    const mark = (t0: number, t1: number, lat: number, w: number) => markLine(white, r, t0, t1, lat, w, r);
    for (const end of [0, 1]) {
      const at = (t: number) => (end === 0 ? t : len - t);
      // threshold "piano keys"
      for (let k = 0; k < 8; k++) {
        const lat = (k - 3.5) * (r.width / 9);
        mark(at(6), at(36), lat, 1.8);
      }
      // aiming points
      for (const lat of [-10, 10]) mark(at(400), at(450), lat, 9);
      // touchdown zone pairs
      for (const t of [150, 300, 600]) for (const lat of [-8, 8]) mark(at(t), at(t + 22), lat, 3);
    }
    // centre line dashes and edge lines
    for (let t = 120; t + 30 < len - 120; t += 50) mark(t, t + 30, 0, 0.9);
    for (const lat of [-(r.width / 2 - 1), r.width / 2 - 1]) mark(0, len, lat, 0.9);
    // runway numbers (generic designators, read when landing)
    const [n1, n2] = r.name.split('/');
    for (const [text, t, flip] of [[n2, 60, false], [n1, len - 60, true]] as const) {
      const [x, z] = along(r, t, 0);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 18), new THREE.MeshLambertMaterial({ map: numberTexture(text), transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      const holder = new THREE.Group();
      if (!clearOfTracks(x, z, 5)) continue;
      holder.position.set(x, Y_MARK + 0.005, z);
      holder.rotation.y = Math.atan2(r.x2 - r.x1, r.z2 - r.z1) + (flip ? 0 : Math.PI);
      holder.add(m);
      numbers.push(holder);
    }
  }
  for (const t of AIRPORT.taxiways) {
    const len = Math.hypot(t.x2 - t.x1, t.z2 - t.z1);
    markLine(yellow, t, 0, len, 0, 0.3, null);
  }
  group.add(white.mesh(markMat('#f2f2ee')));
  group.add(yellow.mesh(markMat('#e8c22a')));
  numbers.forEach((n) => group.add(n));
}

// ------------------------------------------------------------------ lights

function lights(group: THREE.Group) {
  const o = new THREE.Object3D();
  const sets: Record<string, THREE.Matrix4[]> = { white: [], blue: [], green: [] };
  let own: Strip | null = null;
  const put = (set: string, x: number, z: number) => {
    if (!clearOfTracks(x, z, 0.3) || onOtherRunway(own, x, z)) return;
    o.position.set(x, 0.18, z);
    o.updateMatrix();
    sets[set].push(o.matrix.clone());
  };
  for (const r of AIRPORT.runways) {
    own = r;
    const len = Math.hypot(r.x2 - r.x1, r.z2 - r.z1);
    for (let t = 0; t <= len; t += 60) for (const lat of [-(r.width / 2 + 1.5), r.width / 2 + 1.5]) put('white', ...along(r, t, lat));
    for (const t of [0, len]) for (let lat = -r.width / 2; lat <= r.width / 2; lat += 4) put('green', ...along(r, t, lat));
  }
  own = null;
  for (const tw of AIRPORT.taxiways) {
    const len = Math.hypot(tw.x2 - tw.x1, tw.z2 - tw.z1);
    for (let t = 15; t < len; t += 30) for (const lat of [-(tw.width / 2 + 0.8), tw.width / 2 + 0.8]) put('blue', ...along(tw, t, lat));
  }
  const geo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
  for (const [name, color] of [['white', '#fffbe6'], ['blue', '#3a7bff'], ['green', '#3aff7a']] as const) {
    const list = sets[name];
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color }), list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m));
    im.computeBoundingSphere();
    group.add(im);
  }
}

// ------------------------------------------------------------------ buildings

/** Model size (model units) and the matrix that stretches it to w × h × d metres at (x, z). */
export function stretched(model: string, x: number, z: number, w: number, d: number, h: number, rot: number, y = 0) {
  const src = getModel(model)!;
  const box = new THREE.Box3().setFromObject(src);
  const size = box.getSize(new THREE.Vector3());
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot),
    new THREE.Vector3(w / size.x, h / size.y, d / size.z),
  );
}

const WALLS = ['#e8e4dc', '#d8dde4', '#f0e6d2', '#c9d4dc'];
const ROOFS = ['#6a7078', '#7a5236', '#4f5866', '#5e5e5e'];

/** Kenney buildings (hangars, landside offices) with their palette recoloured. */
function kitBuildings(group: THREE.Group) {
  const byModel = new Map<string, BuildingInstance[]>();
  const add = (model: string, m: THREE.Matrix4, k: number) => {
    const list = byModel.get(model) ?? byModel.set(model, []).get(model)!;
    list.push({ matrix: m, wall: new THREE.Color(WALLS[k % WALLS.length]), roof: new THREE.Color(ROOFS[k % ROOFS.length]) });
  };
  const boxes: { m: THREE.Matrix4; color: string }[] = [];
  const hangarModels = ['ind-building-q', 'ind-building-c'];
  AIRPORT.hangars.forEach((h, k) => {
    // w and d are world x and z: a hall turned sideways gets them swapped in model space
    const side = Math.abs(Math.sin(h.facing)) > 0.5;
    if (assetsReady()) add(hangarModels[k % 2], stretched(hangarModels[k % 2], h.x, h.z, side ? h.d : h.w, side ? h.w : h.d, 22, h.facing), k);
    else boxes.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(h.x, 0, h.z), new THREE.Quaternion(), new THREE.Vector3(h.w, 22, h.d)), color: '#b8bcc2' });
  });
  // landside offices and car park buildings in a row behind the terminal (south of it)
  const offices = ['building-e', 'building-k', 'building-j', 'building-i'];
  const t = AIRPORT.terminal;
  for (let k = 0; k < Math.floor((t.w - 20) / 75) + 1; k++) {
    const x = t.x - t.w / 2 + 30 + k * 75, z = t.z - t.d / 2 - 70;
    const model = offices[k % offices.length];
    if (assetsReady()) add(model, stretched(model, x, z, 50, 40, 18 + (k % 3) * 8, Math.PI), k);
    else boxes.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), new THREE.Vector3(50, 20, 40)), color: '#c9c4ba' });
  }
  // containers on the cargo apron, in stacks of one or two
  const cargo = AIRPORT.aprons[AIRPORT.aprons.length - 1];
  const rand = mulberry32(99);
  const containers: BuildingInstance[] = [];
  for (let row = 0; row < 3; row++) {
    for (let k = 0; k < 6; k++) {
      if (rand() < 0.25) continue;
      const x = cargo.x + cargo.w / 2 - 22 - row * 5, z = cargo.z - cargo.d / 2 + 20 + k * 14;
      for (let lv = 0; lv < 1 + Math.floor(rand() * 2); lv++) {
        const m = new THREE.Matrix4().compose(new THREE.Vector3(x, lv * 2.6, z), new THREE.Quaternion(), new THREE.Vector3(2.44, 2.59, 12.19));
        const c = new THREE.Color(['#b8342c', '#2f5f9e', '#3f7f4a', '#d8862a', '#8a8f96', '#c8a020'][Math.floor(rand() * 6)]);
        containers.push({ matrix: m, wall: c, roof: c });
      }
    }
  }
  if (assetsReady()) byModel.set('container', containers);
  else containers.forEach((c) => boxes.push({ m: c.matrix, color: `#${c.wall.getHexString()}` }));
  for (const [model, items] of byModel) buildingMeshes(model, items).forEach((m) => group.add(m));
  if (boxes.length) {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshLambertMaterial(), boxes.length);
    boxes.forEach((b, i) => {
      im.setMatrixAt(i, b.m);
      im.setColorAt(i, new THREE.Color(b.color));
    });
    group.add(im);
  }
}

/** The tower: base, shaft, glass cab, roof and antenna (vertex-coloured parts, 52 m high incl. antenna). */
export function towerGeometry(tx: number, tz: number, base = 16) {
  return [
    colored(new THREE.BoxGeometry(base, 6, base).translate(tx, 3, tz), '#d4d0c8'),
    colored(new THREE.CylinderGeometry(3.2, 3.8, 36, 10).translate(tx, 24, tz), '#ece8e0'),
    colored(new THREE.CylinderGeometry(7.5, 5.5, 5, 8).translate(tx, 44.5, tz), '#35546e'),
    colored(new THREE.CylinderGeometry(8.2, 8.2, 0.9, 8).translate(tx, 47.4, tz), '#d8d8d8'),
    colored(new THREE.CylinderGeometry(0.15, 0.15, 9, 5).translate(tx, 52.3, tz), '#c62f2f'),
  ];
}

/** Terminal, docks (piers with glass bands) and the tower – procedural, one mesh. */
function terminalDocksTower(group: THREE.Group) {
  const parts: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) =>
    parts.push(colored(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color));
  const t = AIRPORT.terminal;
  box(t.w, 16, t.d, t.x, 8, t.z, '#dcd8d0');
  box(t.w + 2, 1.2, t.d + 2, t.x, 16.6, t.z, '#9aa0a6');
  // glass front towards the apron (north)
  box(t.w - 20, 7, 0.4, t.x, 8, t.z + t.d / 2 + 0.2, '#2f4a63');
  for (const d of AIRPORT.docks) {
    box(d.w, 11, d.d, d.x, 5.5, d.z, '#e4e0d8');
    box(d.w + 1, 0.8, d.d + 1, d.x, 11.4, d.z, '#8a9096');
    // glass bands on both long sides
    if (d.d > d.w) for (const s of [-1, 1]) box(0.3, 3.5, d.d - 10, d.x + s * (d.w / 2 + 0.15), 7, d.z, '#2f4a63');
    else for (const s of [-1, 1]) box(d.w - 10, 3.5, 0.3, d.x, 7, d.z + s * (d.d / 2 + 0.15), '#2f4a63');
  }
  parts.push(...towerGeometry(AIRPORT.tower.x, AIRPORT.tower.z));
  group.add(new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));

  // generic signs
  const sign = (text: string, w: number, h: number, x: number, y: number, z: number, rot: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: signTexture(text) }));
    m.position.set(x, y, z);
    m.rotation.y = rot;
    group.add(m);
  };
  // on the terminal roof edge between the two piers, facing the apron
  sign('Flughafen', 60, 11, t.x, 22, t.z + t.d / 2 + 0.5, 0);
  const cargo = AIRPORT.hangars[AIRPORT.hangars.length - 1];
  sign('Fracht', 30, 6, cargo.x - cargo.w / 2 - 0.6, 18, cargo.z, -Math.PI / 2);
  for (const d of AIRPORT.docks) {
    // piers: on the head end, away from the terminal
    if (d.d > d.w) sign(d.name, 26, 5, d.x, 14.5, d.z + d.d / 2 + 0.5, 0);
    else sign(d.name, 26, 5, d.x + d.w / 2 + 0.5, 14.5, d.z, Math.PI / 2);
  }
}

// ------------------------------------------------------------------ taxiway bridge

function taxiwayBridge(group: THREE.Group) {
  const b = AIRPORT.bridge;
  const parts: THREE.BufferGeometry[] = [];
  const top = BRIDGE_DECK;
  // deck across the service road, ramps down to the taxiway on both ends
  parts.push(colored(new THREE.BoxGeometry(b.length, 0.9, b.width).translate(0, top - 0.45, 0), '#9a9c9e'));
  for (const s of [-1, 1]) {
    const ramp = new THREE.BoxGeometry(80, top, b.width).translate(0, top / 2, 0);
    const pos = ramp.attributes.position;
    // the far end of the ramp comes down to the ground
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0.1 && pos.getX(i) * s > 0) pos.setY(i, 0.05);
    ramp.computeVertexNormals();
    parts.push(colored(ramp.translate(s * (b.length / 2 + 40), 0, 0), '#9a9c9e'));
    // railings along the deck
    parts.push(colored(new THREE.BoxGeometry(b.length, 1.1, 0.3).translate(0, top + 0.55, s * (b.width / 2 - 0.2)), '#d8dce0'));
  }
  // yellow centre line on top and piers outside the road
  parts.push(colored(new THREE.BoxGeometry(b.length + 160, 0.05, 0.4).translate(0, top + 0.03, 0), '#e8c22a'));
  for (const x of [-48, -30, 30, 48]) for (const z of [-14, 14]) parts.push(colored(new THREE.BoxGeometry(1.4, top - 0.9, 1.4).translate(x, (top - 0.9) / 2, z), '#b4b0a8'));
  const mesh = new THREE.Mesh(mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  mesh.position.set(b.x, 0, b.z);
  mesh.rotation.y = b.heading - Math.PI / 2;
  group.add(mesh);
}

// ------------------------------------------------------------------ aircraft

/** Swept box: vertices are moved back (−z) the further they are from the centre line (wings, tail). */
function swept(g: THREE.BufferGeometry, perX: number, perY = 0, yFrom = 0) {
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) - Math.abs(pos.getX(i)) * perX - Math.max(0, pos.getY(i) - yFrom) * perY);
  g.computeVertexNormals();
  return g;
}

/** A stylised airliner, nose at the origin pointing +z, ~37 m long, 34 m span. body = neutral parts, livery = tinted per instance. */
export function planeGeometries() {
  const body = mergeGeometries([
    colored(new THREE.ConeGeometry(2, 5, 12).rotateX(Math.PI / 2).translate(0, 3.2, -2.5), '#f2f4f6'),
    colored(new THREE.CylinderGeometry(2, 2, 26, 12).rotateX(Math.PI / 2).translate(0, 3.2, -18), '#f2f4f6'),
    colored(new THREE.ConeGeometry(2, 6, 12).rotateX(-Math.PI / 2).translate(0, 3.6, -34), '#f2f4f6'),
    colored(swept(new THREE.BoxGeometry(34, 0.45, 5).translate(0, 2.4, -16), 0.35), '#c8ccd2'),
    colored(swept(new THREE.BoxGeometry(12, 0.3, 3).translate(0, 4.2, -33), 0.4), '#c8ccd2'),
    ...[-6.5, 6.5].map((x) => colored(new THREE.CylinderGeometry(1.1, 1.1, 4.2, 10).rotateX(Math.PI / 2).translate(x, 1.7, -12.5), '#d4d8dc')),
    colored(new THREE.BoxGeometry(0.4, 1.4, 0.4).translate(0, 0.7, -4.5), '#333333'),
    ...[-3, 3].map((x) => colored(new THREE.BoxGeometry(0.6, 1.4, 1.2).translate(x, 0.7, -18), '#333333')),
    // cockpit windows
    colored(new THREE.BoxGeometry(3.2, 0.6, 1.4).translate(0, 4.1, -3.4), '#1e2a36'),
  ].map((g) => (g.index ? g.toNonIndexed() : g)))!;
  const livery = mergeGeometries([
    colored(swept(new THREE.BoxGeometry(0.45, 6, 4.5).translate(0, 7.6, -33), 0, 0.55, 4.6), '#ffffff'),
    colored(new THREE.BoxGeometry(4.1, 0.6, 24).translate(0, 3.5, -18), '#ffffff'),
  ].map((g) => (g.index ? g.toNonIndexed() : g)))!;
  return { body, livery };
}

export const LIVERIES = ['#c8202a', '#1f5fb8', '#2f8a4a', '#e07a1a'];

/** A departure: lined up at (x, z), take-off run along `heading`, then climbing away; repeats every `period` s. */
export interface Departure {
  x: number;
  z: number;
  heading: number;
  livery: string;
  /** seconds into the cycle at load time (so several departures do not start together) */
  offset: number;
}

const WAIT = 15, ROLL = 450, VR = 75, PERIOD = 100, CLIMB = Math.tan((9 * Math.PI) / 180);

/** Position along the departure path after t seconds of the cycle: distance, height and nose-up angle (or null = gone). */
export function departureAt(t: number): { d: number; y: number; pitch: number } | null {
  const accel = (VR * VR) / (2 * ROLL), tRoll = VR / accel;
  if (t < WAIT) return { d: 0, y: 0, pitch: 0 };
  if (t < WAIT + tRoll) return { d: 0.5 * accel * (t - WAIT) ** 2, y: 0, pitch: 0 };
  const air = t - WAIT - tRoll;
  if (air > 60) return null;
  const d = ROLL + VR * air;
  // rotate within 3 s
  return { d, y: (d - ROLL) * CLIMB * Math.min(1, air / 3), pitch: Math.atan(CLIMB) * Math.min(1, air / 3) };
}

/** Aircraft that take off again and again (animated in onBeforeRender, so nothing has to call them). */
export function departures(group: THREE.Group, list: Departure[]) {
  const { body, livery } = planeGeometries();
  const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const start = performance.now() / 1000;
  const yAxis = new THREE.Vector3(0, 1, 0), xAxis = new THREE.Vector3(1, 0, 0);
  for (const dep of list) {
    const q = new THREE.Quaternion(), qp = new THREE.Quaternion(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    const fx = Math.sin(dep.heading), fz = Math.cos(dep.heading);
    const place = (m: THREE.Object3D) => {
      const t = (performance.now() / 1000 - start + dep.offset) % PERIOD;
      const p = departureAt(t);
      // gone: far below the ground until the next cycle
      if (!p) pos.set(dep.x, -500, dep.z);
      else pos.set(dep.x + fx * p.d, p.y, dep.z + fz * p.d);
      q.setFromAxisAngle(yAxis, dep.heading).multiply(qp.setFromAxisAngle(xAxis, -(p?.pitch ?? 0)));
      m.matrixWorld.compose(pos, q, one);
    };
    for (const [geo, mat] of [[body, bodyMat], [livery, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, color: dep.livery })]] as const) {
      const m = new THREE.Mesh(geo, mat);
      m.matrixAutoUpdate = false;
      m.matrixWorldAutoUpdate = false;
      m.frustumCulled = false;
      m.onBeforeRender = () => place(m);
      group.add(m);
    }
  }
}

function aircraft(group: THREE.Group) {
  const { body, livery } = planeGeometries();
  const b = AIRPORT.bridge;
  const mats = AIRPORT.planes.map((p) => {
    const onBridge = Math.abs(p.x - b.x) < b.length / 2 && Math.abs(p.z - b.z) < b.width / 2;
    return new THREE.Matrix4().compose(
      new THREE.Vector3(p.x, onBridge ? BRIDGE_DECK : 0, p.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.heading),
      new THREE.Vector3(1, 1, 1),
    );
  });
  const a = new THREE.InstancedMesh(body, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), mats.length);
  const l = new THREE.InstancedMesh(livery, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), mats.length);
  mats.forEach((m, i) => {
    a.setMatrixAt(i, m);
    l.setMatrixAt(i, m);
    l.setColorAt(i, new THREE.Color(LIVERIES[AIRPORT.planes[i].livery % LIVERIES.length]));
  });
  a.computeBoundingSphere();
  l.computeBoundingSphere();
  group.add(a, l);

  // jet bridges from the docks to the front door of each plane parked at a dock
  const jet: THREE.BufferGeometry[] = [];
  for (const p of AIRPORT.planes) {
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    const nearDock = AIRPORT.docks.some((d) => Math.abs(p.x + fx * 6 - d.x) <= d.w / 2 + 1 && Math.abs(p.z + fz * 6 - d.z) <= d.d / 2 + 1);
    if (!nearDock) continue;
    // left side door 5 m behind the nose, the bridge runs forward to the pier
    const lx = fz, lz = -fx;
    const door = [p.x - fx * 5 + lx * 2.6, p.z - fz * 5 + lz * 2.6];
    const g = new THREE.BoxGeometry(2.6, 2.8, 12).translate(0, 4.6, 6);
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(door[0], 0, door[1]), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.heading), new THREE.Vector3(1, 1, 1)));
    jet.push(colored(g, '#c4c8cc'));
    jet.push(colored(new THREE.BoxGeometry(0.5, 3.2, 0.5).translate(door[0] + fx * 2, 1.6, door[1] + fz * 2), '#555a60'));
  }
  if (jet.length) group.add(new THREE.Mesh(mergeGeometries(jet)!, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
}

// ------------------------------------------------------------------ apron vehicles, windsocks, fence, trees

function apronVehicles(group: THREE.Group, rand: () => number) {
  const variants: Variant[] = [
    { model: 'van', geo: () => colored(new THREE.BoxGeometry(2, 2.2, 5).translate(0, 1.1, 0), '#f2f2f2'), scale: 1.9 },
    { model: 'delivery', geo: () => colored(new THREE.BoxGeometry(2.2, 2.6, 6).translate(0, 1.3, 0), '#e8c22a'), scale: 1.9 },
  ];
  const buckets: THREE.Matrix4[][] = variants.map(() => []);
  const o = new THREE.Object3D();
  for (const p of AIRPORT.planes) {
    for (let k = 0; k < 2; k++) {
      const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
      const side = k === 0 ? 1 : -1;
      const x = p.x - fx * (10 + rand() * 14) + fz * side * (9 + rand() * 4);
      const z = p.z - fz * (10 + rand() * 14) - fx * side * (9 + rand() * 4);
      if (!clearOfTracks(x, z, 4)) continue;
      o.position.set(x, 0, z);
      o.rotation.set(0, p.heading + (rand() - 0.5) * 1.2, 0);
      o.updateMatrix();
      buckets[Math.floor(rand() * variants.length)].push(o.matrix.clone());
    }
  }
  variants.forEach((v, i) => instanced(v, buckets[i]).forEach((m) => group.add(m)));
}

/** Pole with an orange sock blowing towards +x. */
export const windsockGeometry = () => mergeGeometries([
  colored(new THREE.CylinderGeometry(0.12, 0.15, 6, 6).translate(0, 3, 0), '#d8d8d8'),
  colored(new THREE.ConeGeometry(0.65, 3.6, 8).rotateZ(Math.PI / 2).translate(1.9, 5.6, 0), '#ff6a13'),
])!;

function windsocks(group: THREE.Group) {
  const geo = windsockGeometry();
  const list = AIRPORT.windsocks.filter((w) => clearOfTracks(w.x, w.z, 2.5));
  const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), list.length);
  // the wind blows from the west
  list.forEach((w, i) => im.setMatrixAt(i, new THREE.Matrix4().makeTranslation(w.x, 0, w.z)));
  group.add(im);
}

function fence(group: THREE.Group) {
  const b = AIRPORT.bounds;
  const corners: [number, number][] = [[b.minX, b.minZ], [b.maxX, b.minZ], [b.maxX, b.maxZ], [b.minX, b.maxZ]];
  const posts: THREE.Matrix4[] = [];
  const pos: number[] = [];
  for (let k = 0; k < 4; k++) {
    const [x1, z1] = corners[k], [x2, z2] = corners[(k + 1) % 4];
    const len = Math.hypot(x2 - x1, z2 - z1);
    for (let t = 0; t < len; t += 8) posts.push(new THREE.Matrix4().makeTranslation(x1 + ((x2 - x1) * t) / len, 1.3, z1 + ((z2 - z1) * t) / len));
    // a vertical mesh panel
    pos.push(x1, 0, z1, x2, 0, z2, x1, 2.5, z1, x1, 2.5, z1, x2, 0, z2, x2, 2.5, z2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  group.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#b8bec4', transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })));
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), new THREE.MeshLambertMaterial({ color: '#8a9096' }), posts.length);
  posts.forEach((m, i) => im.setMatrixAt(i, m));
  group.add(im);
}

function trees(group: THREE.Group, rand: () => number) {
  const variants: Variant[] = [
    { model: 'tree_default', geo: fallback.round, scale: 7 },
    { model: 'tree_oak', geo: fallback.round, scale: 7 },
    { model: 'tree_pineRoundA', geo: fallback.pine, scale: 7 },
    { model: 'plant_bushLarge', geo: fallback.round, scale: 7 },
  ];
  const buckets: THREE.Matrix4[][] = variants.map(() => []);
  const b = AIRPORT.bounds;
  const o = new THREE.Object3D();
  for (let c = 0; c < 70; c++) {
    // a cluster somewhere in the ring outside the fence
    const side = Math.floor(rand() * 4);
    const out = 25 + rand() * 300;
    const cx = side === 0 ? b.minX - out : side === 1 ? b.maxX + out : b.minX + rand() * (b.maxX - b.minX);
    const cz = side === 2 ? b.minZ - out : side === 3 ? b.maxZ + out : b.minZ + rand() * (b.maxZ - b.minZ);
    const n = 5 + Math.floor(rand() * 9);
    for (let k = 0; k < n; k++) {
      const x = cx + (rand() - 0.5) * 50, z = cz + (rand() - 0.5) * 50;
      if (x > b.minX - 8 && x < b.maxX + 8 && z > b.minZ - 8 && z < b.maxZ + 8) continue;
      o.position.set(x, -0.1, z);
      o.rotation.set(0, rand() * Math.PI * 2, 0);
      o.scale.setScalar(0.8 + rand() * 0.6);
      o.updateMatrix();
      buckets[Math.floor(rand() * variants.length)].push(o.matrix.clone());
    }
  }
  variants.forEach((v, i) => instanced(v, buckets[i]).forEach((m) => group.add(m)));
}

/** Scenery of the airport (shared by the road race and the kart race). */
export function buildAirportScenery(track: Track, _terrain: Terrain): THREE.Group {
  const group = new THREE.Group();
  // the same seed for both tracks: identical airport in both races
  const rand = mulberry32(4711);
  groundAndMarkings(group);
  lights(group);
  kitBuildings(group);
  terminalDocksTower(group);
  taxiwayBridge(group);
  aircraft(group);
  const [r16, r10, r14] = AIRPORT.runways;
  // lined up 3 % into the runway, from its end (x2, z2) when `reverse`
  const lineUp = (r: Strip, reverse: boolean, livery: number, offset: number): Departure => {
    const f = reverse ? 0.97 : 0.03;
    const heading = Math.atan2(r.x2 - r.x1, r.z2 - r.z1) + (reverse ? Math.PI : 0);
    return { x: r.x1 + (r.x2 - r.x1) * f, z: r.z1 + (r.z2 - r.z1) * f, heading, livery: LIVERIES[livery], offset };
  };
  // only where the take-off run stays off the race's roadway: the road race drives on 14/32 and crosses
  // 10/28, so it sees departures on 34 climbing over it; the kart race (south of 10/28) those on 28 and 14
  departures(group, track.def.id === 'flughafen' ? [lineUp(r16, false, 1, 0)] : [lineUp(r10, true, 1, 0), lineUp(r14, false, 0, 50)]);
  apronVehicles(group, rand);
  windsocks(group);
  fence(group);
  trees(group, rand);
  return group;
}
