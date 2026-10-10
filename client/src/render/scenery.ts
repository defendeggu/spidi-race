import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32, type Track } from '@spidi/shared';
import { coastline, type Terrain } from './terrain';

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

function pineGeometry() {
  return mergeGeometries([
    colored(new THREE.CylinderGeometry(0.25, 0.35, 2, 5).translate(0, 1, 0), '#5a3e28'),
    colored(new THREE.ConeGeometry(2.4, 4.5, 7).translate(0, 3.8, 0), '#2f5a32'),
    colored(new THREE.ConeGeometry(1.8, 3.6, 7).translate(0, 6.2, 0), '#346636'),
  ])!;
}

function roundTreeGeometry() {
  return mergeGeometries([
    colored(new THREE.CylinderGeometry(0.25, 0.35, 2.4, 5).translate(0, 1.2, 0), '#6b4a2e'),
    colored(new THREE.IcosahedronGeometry(2.2, 0).translate(0, 3.8, 0), '#5c8a35'),
  ])!;
}

function cypressGeometry() {
  return mergeGeometries([
    colored(new THREE.CylinderGeometry(0.2, 0.25, 1.2, 5).translate(0, 0.6, 0), '#5a3e28'),
    colored(new THREE.ConeGeometry(1.1, 7, 6).translate(0, 4.4, 0), '#3d5e2c'),
  ])!;
}

function houseGeometry(wall: string, roof: string) {
  return mergeGeometries([
    colored(new THREE.BoxGeometry(6, 4, 8).translate(0, 2, 0), wall),
    colored(new THREE.ConeGeometry(5.6, 2.8, 4).rotateY(Math.PI / 4).scale(1, 1, 1.35).translate(0, 5.4, 0), roof),
  ])!;
}

/** Scatter instances near the track, rejecting positions that are on/near the road or fail the filter. */
function scatter(
  track: Track, terrain: Terrain, geo: THREE.BufferGeometry, count: number, seed: number,
  opts: { minDist: number; maxDist: number; scale: [number, number]; ok: (x: number, y: number, z: number) => boolean },
) {
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), count);
  const rand = mulberry32(seed);
  const o = new THREE.Object3D();
  let k = 0;
  for (let tries = 0; tries < count * 12 && k < count; tries++) {
    const i = Math.floor(rand() * track.n);
    const side = rand() < 0.5 ? -1 : 1;
    const off = opts.minDist + Math.pow(rand(), 1.6) * (opts.maxDist - opts.minDist);
    const x = track.px[i] + track.rx[i] * side * off + (rand() - 0.5) * 20;
    const z = track.pz[i] + track.rz[i] * side * off + (rand() - 0.5) * 20;
    if (terrain.distAt(x, z) < Math.max(opts.minDist, terrain.near + 4)) continue;
    const y = terrain.heightAt(x, z);
    const slope = Math.abs(terrain.heightAt(x + 3, z) - y) + Math.abs(terrain.heightAt(x, z + 3) - y);
    if (slope > 4 || !opts.ok(x, y, z)) continue;
    const s = opts.scale[0] + rand() * (opts.scale[1] - opts.scale[0]);
    o.position.set(x, y - 0.3, z);
    o.rotation.set(0, rand() * Math.PI * 2, 0);
    o.scale.setScalar(s);
    o.updateMatrix();
    mesh.setMatrixAt(k++, o.matrix);
  }
  mesh.count = k;
  return mesh;
}

export function buildScenery(track: Track, terrain: Terrain): THREE.Group {
  const group = new THREE.Group();
  const seed = track.def.seed;
  const rockGeo = colored(new THREE.IcosahedronGeometry(1.6, 0).scale(1.4, 0.8, 1.1), '#8a847b');

  if (track.def.theme === 'alpine') {
    group.add(scatter(track, terrain, pineGeometry(), 1600, seed + 1, {
      minDist: 14, maxDist: 320, scale: [0.8, 1.6], ok: (_x, y) => y < 115,
    }));
    group.add(scatter(track, terrain, rockGeo, 260, seed + 2, { minDist: 14, maxDist: 200, scale: [0.6, 2.2], ok: () => true }));
    const chalet = houseGeometry('#7a5233', '#4a3a30');
    group.add(scatter(track, terrain, chalet, 14, seed + 3, { minDist: 22, maxDist: 70, scale: [0.9, 1.2], ok: (_x, y) => y < 40 }));
  } else {
    const land = (x: number, y: number, z: number) => y > 2.5 && z < coastline(x) - 15;
    group.add(scatter(track, terrain, roundTreeGeometry(), 700, seed + 1, { minDist: 14, maxDist: 260, scale: [0.8, 1.5], ok: land }));
    group.add(scatter(track, terrain, cypressGeometry(), 500, seed + 2, { minDist: 14, maxDist: 220, scale: [0.8, 1.4], ok: land }));
    group.add(scatter(track, terrain, rockGeo, 200, seed + 4, { minDist: 14, maxDist: 160, scale: [0.6, 2.5], ok: (_x, y) => y > -1 }));
    // fishing village along the start straight
    const villageTrack = { ...track, n: Math.min(track.n, 320) } as Track;
    group.add(scatter(villageTrack, terrain, houseGeometry('#f1ece0', '#b5523b'), 26, seed + 5, {
      minDist: 18, maxDist: 60, scale: [0.9, 1.3], ok: land,
    }));
    group.add(scatter(villageTrack, terrain, houseGeometry('#e8d7a8', '#9c4630'), 18, seed + 6, {
      minDist: 18, maxDist: 70, scale: [0.9, 1.2], ok: land,
    }));
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
  g.position.set(x, terrain.heightAt(x, z) - 0.5, z);
  return g;
}
