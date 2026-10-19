import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TOWN_AIRPORT, type TownMap } from '@spidi/shared';
import { LIVERIES, numberTexture, planeGeometries, signTexture, stretched, towerGeometry, windsockGeometry } from './airportScenery';
import { assetsReady } from './assets';
import { buildingMeshes } from './buildingKit';
import { colored } from './scenery';
import { ground, Quads } from './townWorld';

/**
 * The airfield in the west strip of the practice town (layout in TOWN_AIRPORT), drawn with the parts of
 * the airport tracks: paved runway, taxiway and apron with markings, terminal with jet bridges, cargo
 * hall, tower, windsock and the aircraft (whose collision boxes come from the town map).
 */

/** models drawn here instead of by the generic building renderer */
export const TOWN_AIRPORT_MODELS = new Set(['airport-terminal', 'airport-cargo', 'airport-tower', 'plane', 'windsock']);

// heights of the flat layers (above the grass at 0, below the markings)
const Y_LAND = 0.01, Y_APRON = 0.012, Y_TAXI = 0.014, Y_RUNWAY = 0.018, Y_MARK = 0.024;

const overlay = (m: THREE.MeshLambertMaterial) => {
  m.polygonOffset = true;
  m.polygonOffsetFactor = -1;
  m.polygonOffsetUnits = -2;
  return m;
};

function paving(group: THREE.Group) {
  const A = TOWN_AIRPORT, r = A.runway, t = A.taxiway;
  const land = new Quads(), apron = new Quads(), taxi = new Quads(), runway = new Quads();
  land.add(A.landside.x0, A.landside.z0, A.landside.x1, A.landside.z1, Y_LAND);
  apron.add(A.apron.x0, A.apron.z0, A.apron.x1, A.apron.z1, Y_APRON);
  taxi.add(t.x - t.width / 2, t.z0 - t.width / 2, t.x + t.width / 2, t.z1 + t.width / 2, Y_TAXI);
  for (const l of A.links) taxi.add(t.x, l - t.width / 2, r.x, l + t.width / 2, Y_TAXI);
  runway.add(r.x - r.width / 2, r.z0, r.x + r.width / 2, r.z1, Y_RUNWAY);
  group.add(land.mesh(overlay(ground('asphalt', 7, '#b4b4b4', '#66686b'))));
  group.add(apron.mesh(overlay(ground('concrete', 6, '#d6d4ce', '#a8a6a0'))));
  group.add(taxi.mesh(overlay(ground('asphalt', 7, '#a4a4a4', '#56585b'))));
  group.add(runway.mesh(overlay(ground('concrete', 8, '#e4e2dc', '#b4b2ac'))));

  // markings: threshold bars, centre dashes and edge lines on the runway, yellow taxi lines, stand lines
  const white = new Quads(), yellow = new Quads();
  const len = r.z1 - r.z0;
  for (const end of [0, 1]) {
    const at = (d: number) => (end === 0 ? r.z0 + d : r.z1 - d);
    for (let k = 0; k < 6; k++) {
      const x = r.x + (k - 2.5) * (r.width / 7);
      const [z0, z1] = [at(6), at(30)].sort((a, b) => a - b);
      white.add(x - 0.9, z0, x + 0.9, z1, Y_MARK);
    }
    for (const lat of [-6, 6]) {
      const [z0, z1] = [at(150), at(185)].sort((a, b) => a - b);
      white.add(r.x + lat - 2.5, z0, r.x + lat + 2.5, z1, Y_MARK);
    }
  }
  for (let d = 60; d + 20 < len - 60; d += 40) white.add(r.x - 0.45, r.z0 + d, r.x + 0.45, r.z0 + d + 20, Y_MARK);
  for (const lat of [-(r.width / 2 - 1), r.width / 2 - 1]) white.add(r.x + lat - 0.4, r.z0, r.x + lat + 0.4, r.z1, Y_MARK);
  yellow.add(t.x - 0.15, t.z0, t.x + 0.15, t.z1, Y_MARK);
  for (const l of A.links) yellow.add(t.x, l - 0.15, r.x - r.width / 2, l + 0.15, Y_MARK);
  // lead-in lines to the stands at the terminal and on the apron
  for (const p of A.planes) {
    if (Math.abs(Math.sin(p.heading)) < 0.5) continue;
    yellow.add(p.x - 2, p.z - 0.15, t.x - t.width / 2, p.z + 0.15, Y_MARK);
  }
  const markMat = (color: string) => new THREE.MeshLambertMaterial({ color, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  group.add(white.mesh(markMat('#f2f2ee')));
  group.add(yellow.mesh(markMat('#e8c22a')));
  // runway numbers: the runway runs north–south
  for (const [text, z, rot] of [['36', r.z0 + 50, Math.PI], ['18', r.z1 - 50, 0]] as const) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(8, 16), new THREE.MeshLambertMaterial({ map: numberTexture(text), transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    const holder = new THREE.Group();
    holder.position.set(r.x, Y_MARK + 0.004, z);
    holder.rotation.y = rot;
    holder.add(m);
    group.add(holder);
  }
  // edge lights
  const o = new THREE.Object3D();
  const lights: THREE.Matrix4[] = [];
  for (let z = r.z0; z <= r.z1; z += 50) {
    for (const lat of [-(r.width / 2 + 1.2), r.width / 2 + 1.2]) {
      o.position.set(r.x + lat, 0.18, z);
      o.updateMatrix();
      lights.push(o.matrix.clone());
    }
  }
  const lm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), new THREE.MeshBasicMaterial({ color: '#fffbe6' }), lights.length);
  lights.forEach((m, i) => lm.setMatrixAt(i, m));
  group.add(lm);
}

function buildings(group: THREE.Group) {
  const A = TOWN_AIRPORT, t = A.terminal, c = A.cargo;
  const parts: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) =>
    parts.push(colored(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color));
  // terminal: hall with a glass front towards the apron (+x) and the entrance towards the town (-x)
  box(t.w, 16, t.d, t.x, 8, t.z, '#dcd8d0');
  box(t.w + 2, 1.2, t.d + 2, t.x, 16.6, t.z, '#9aa0a6');
  box(0.4, 8, t.d - 16, t.x + t.w / 2 + 0.2, 8, t.z, '#2f4a63');
  box(0.4, 5, 40, t.x - t.w / 2 - 0.2, 3.5, t.z, '#2f4a63');
  // window bands on the town side and at both ends
  for (const y of [9.5, 13]) {
    box(0.3, 1.8, t.d - 10, t.x - t.w / 2 - 0.15, y, t.z, '#3a5570');
    for (const s of [-1, 1]) box(t.w - 6, 1.8, 0.3, t.x, y, t.z + s * (t.d / 2 + 0.15), '#3a5570');
  }
  // entrance canopy on the town side
  box(8, 0.5, 46, t.x - t.w / 2 - 4, 6.2, t.z, '#9aa0a6');
  for (const dz of [-21, 21]) box(0.4, 6, 0.4, t.x - t.w / 2 - 7.5, 3, t.z + dz, '#5d6670');
  // jet bridges from the glass front to the left door of each plane at the terminal
  for (const p of A.planes) {
    if (Math.abs(p.x - (t.x + t.w / 2)) > 15 || Math.abs(p.z - t.z) > t.d / 2) continue;
    const x0 = t.x + t.w / 2, x1 = p.x + 5;
    box(x1 - x0, 2.8, 2.6, (x0 + x1) / 2, 4.6, p.z + 3.4, '#c4c8cc');
    box(0.5, 3.2, 0.5, x1 - 1, 1.6, p.z + 3.4, '#555a60');
  }
  parts.push(...towerGeometry(A.tower.x, A.tower.z, 2 * A.tower.r));
  if (!assetsReady()) box(c.w, 14, c.d, c.x, 7, c.z, '#b8bcc2');
  group.add(new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  // cargo hall: the hangar of the airport tracks, its doors towards the apron
  if (assetsReady()) {
    const m = stretched('ind-building-q', c.x, c.z, c.d, c.w, 14, Math.PI / 2);
    buildingMeshes('ind-building-q', [{ matrix: m, wall: new THREE.Color('#d8dde4'), roof: new THREE.Color('#5e5e5e') }]).forEach((x) => group.add(x));
  }
  const sign = (text: string, w: number, h: number, x: number, y: number, z: number, rot: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: signTexture(text) }));
    m.position.set(x, y, z);
    m.rotation.y = rot;
    group.add(m);
  };
  sign('Flughafen', 40, 7.5, t.x - t.w / 2 - 0.5, 12, t.z, -Math.PI / 2);
  sign('Flughafen', 40, 7.5, t.x + t.w / 2 + 0.5, 13.5, t.z, Math.PI / 2);
  sign('Fracht', 24, 4.5, c.x + c.w / 2 + 0.6, 16.5, c.z, Math.PI / 2);
  const sock = new THREE.Mesh(windsockGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  sock.position.set(A.windsock.x, 0, A.windsock.z);
  group.add(sock);
}

function planes(group: THREE.Group, town: TownMap) {
  const { body, livery } = planeGeometries();
  const list = town.props.filter((p) => p.model === 'plane');
  const a = new THREE.InstancedMesh(body, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), list.length);
  const l = new THREE.InstancedMesh(livery, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), list.length);
  const yAxis = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  list.forEach((p, i) => {
    // the prop sits in the middle of the fuselage, the geometry has its nose at the origin
    const fx = Math.sin(p.rot), fz = Math.cos(p.rot);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(p.x + fx * 18.5, 0, p.z + fz * 18.5), new THREE.Quaternion().setFromAxisAngle(yAxis, p.rot), one);
    a.setMatrixAt(i, m);
    l.setMatrixAt(i, m);
    l.setColorAt(i, new THREE.Color(LIVERIES[p.variant % LIVERIES.length]));
  });
  a.computeBoundingSphere();
  l.computeBoundingSphere();
  group.add(a, l);
}

export function buildTownAirport(town: TownMap): THREE.Group {
  const group = new THREE.Group();
  paving(group);
  buildings(group);
  planes(group, town);
  return group;
}
