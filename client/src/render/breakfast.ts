import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WALL_OFFSET, type Track } from '@spidi/shared';
import { getTexture } from './assets';
import { colored, footprint, instanced, scatter, type Variant } from './scenery';
import type { Terrain } from './terrain';
import { floorTileTexture } from './textures';

/**
 * The micro track is built at ~1:100: 1 m in the game is 1 cm on a real kitchen table.
 * Kenney's Food Kit models are all at the same scale, x34 brings them to real size.
 */
const FOOD = 34;
/** table top: track bounds plus this margin (m) */
const TABLE_MARGIN = 46;
const TABLE_THICK = 4;
const TABLE_HEIGHT = 76;

// ------------------------------------------------------------------ procedural fallback geometry (in metres)

const lathe = (profile: number[][], color: string) =>
  colored(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 20), color);
const merge = (...g: THREE.BufferGeometry[]) => mergeGeometries(g)!;

const fallback = {
  bowl: () => merge(
    lathe([[0, 0], [5, 0], [8.5, 3], [9.5, 7], [9, 7.2], [8, 3.4], [4.6, 0.8], [0, 0.8]], '#f4f1ea'),
    colored(new THREE.CylinderGeometry(8.4, 8.4, 0.2, 20).translate(0, 5.6, 0), '#fbf8f0'),
  ),
  saucer: () => lathe([[0, 0], [4, 0], [6, 1.1], [6.2, 1.4], [0, 0.6]], '#f4f1ea'),
  cup: () => merge(
    lathe([[0, 0], [3.4, 0], [4, 5.5], [3.7, 5.6], [0, 4.8]], '#f4f1ea'),
    colored(new THREE.TorusGeometry(1.7, 0.45, 6, 12).translate(5, 3, 0), '#f4f1ea'),
    colored(new THREE.CylinderGeometry(3.5, 3.5, 0.1, 16).translate(0, 4.9, 0), '#4a2c18'),
  ),
  plate: () => lathe([[0, 0], [10, 0], [14.5, 2], [15, 2.4], [0, 1]], '#f7f5ef'),
  board: () => colored(new THREE.BoxGeometry(20, 2, 28).translate(0, 1, 0), '#c99a66'),
  bread: () => colored(new THREE.BoxGeometry(13, 1.4, 12).translate(0, 0.7, 0), '#d9a35a'),
  croissant: () => colored(new THREE.TorusGeometry(5, 2.4, 8, 14, Math.PI * 1.1).rotateX(Math.PI / 2).translate(0, 1.6, 0), '#d69a45'),
  eggcup: () => merge(
    lathe([[0, 0], [2.6, 0], [1.2, 1.6], [2.6, 4.4], [0, 4.4]], '#e8463c'),
    colored(new THREE.SphereGeometry(2.3, 12, 10).scale(1, 1.3, 1).translate(0, 5.6, 0), '#f6ead2'),
  ),
  carton: () => merge(
    colored(new THREE.BoxGeometry(7.8, 17, 7.8).translate(0, 8.5, 0), '#f4f4f4'),
    colored(new THREE.BoxGeometry(7.8, 3, 7.8).translate(0, 18.5, 0), '#3a7fd0'),
  ),
  jar: (color: string) => () => merge(
    colored(new THREE.CylinderGeometry(5, 5, 9, 16).translate(0, 4.5, 0), color),
    colored(new THREE.CylinderGeometry(5.2, 5.2, 1.6, 16).translate(0, 9.8, 0), '#d8cfc0'),
  ),
  fruit: (color: string, r: number) => () => colored(new THREE.SphereGeometry(r, 14, 10).translate(0, r * 0.95, 0), color),
  banana: () => colored(new THREE.TorusGeometry(9, 2, 8, 16, Math.PI * 0.6).rotateX(Math.PI / 2).translate(-6, 2, 0), '#f2d24a'),
  utensil: () => colored(new THREE.BoxGeometry(20, 0.6, 2.4).translate(0, 0.3, 0), '#b8bec6'),
  pancakes: () => colored(new THREE.CylinderGeometry(7.5, 7.5, 4, 18).translate(0, 2, 0), '#d6a050'),
  donut: () => colored(new THREE.TorusGeometry(3, 1.5, 8, 16).rotateX(Math.PI / 2).translate(0, 1.5, 0), '#e88aa8'),
  muffin: () => merge(
    lathe([[0, 0], [3.4, 0], [4.4, 4.5], [0, 4.5]], '#c7a06a'),
    colored(new THREE.SphereGeometry(4.8, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 4.5, 0), '#6b3f22'),
  ),
  glass: () => lathe([[0, 0], [2.6, 0], [2.9, 10], [2.6, 10], [0, 1]], '#f2b04a'),
  flake: () => colored(new THREE.IcosahedronGeometry(0.9, 0).scale(1, 0.25, 0.8).translate(0, 0.35, 0), '#e4ae4a'),
  crumb: () => colored(new THREE.IcosahedronGeometry(0.35, 0).translate(0, 0.25, 0), '#c98a46'),
  sugar: () => colored(new THREE.BoxGeometry(1.4, 1.4, 1.4).translate(0, 0.7, 0), '#fbfbf7'),
};

const V = (model: string, geo: () => THREE.BufferGeometry): Variant => ({ model, geo, scale: FOOD });

const ITEMS = {
  bowl: V('bowl-cereal', fallback.bowl),
  saucer: V('cup-saucer', fallback.saucer),
  cup: V('cup-coffee', fallback.cup),
  mug: V('mug', fallback.cup),
  plate: V('plate', fallback.plate),
  board: V('cutting-board', fallback.board),
  bread: V('bread', fallback.bread),
  croissant: V('croissant', fallback.croissant),
  eggcup: V('egg-cup', fallback.eggcup),
  carton: V('carton', fallback.carton),
  honey: V('honey', fallback.jar('#e0a020')),
  peanut: V('peanut-butter', fallback.jar('#a8662e')),
  knife: V('utensil-knife', fallback.utensil),
  spoon: V('utensil-spoon', fallback.utensil),
  fork: V('utensil-fork', fallback.utensil),
  pancakes: V('pancakes', fallback.pancakes),
  banana: V('banana', fallback.banana),
  apple: V('apple', fallback.fruit('#c8302a', 3.4)),
  orange: V('orange', fallback.fruit('#f08a1c', 2.9)),
  strawberry: V('strawberry', fallback.fruit('#d8263a', 2)),
  salt: V('shaker-salt', fallback.jar('#f4f4f4')),
  donut: V('donut-sprinkles', fallback.donut),
  muffin: V('muffin', fallback.muffin),
  glass: V('glass', fallback.glass),
  waffle: V('waffle', fallback.bread),
};
type Item = keyof typeof ITEMS;

/** [item, x, z, rotation in degrees, height above the table (stacked items)] */
const LAYOUT: [Item, number, number, number, number?][] = [
  // inside the right-hand loop: cereal bowl, milk and juice
  ['bowl', 172, 62, 20],
  ['carton', 176, 104, 30],
  ['glass', 158, 112, 0],
  // between the start straight and the hairpin: breakfast plate, egg, salt
  ['plate', 92, 26, 0],
  ['bread', 92, 26, 15, 1.6],
  ['eggcup', 40, 25, 0],
  ['salt', 132, 30, 0],
  // inside the hairpin: cutting board with croissant
  ['board', 70, 75, 90],
  ['croissant', 66, 75, 70, 2],
  ['strawberry', 104, 75, 0],
  // between the hairpin and the top straight
  ['donut', 60, 114, 30],
  ['strawberry', 150, 118, 40],
  ['strawberry', 158, 124, 200],
  // behind the top section: coffee, honey, peanut butter
  ['saucer', 112, 168, 0],
  ['cup', 112, 168, 210, 1.3],
  ['honey', 64, 166, 0],
  ['peanut', 160, 166, 0],
  ['mug', 20, 164, 120],
  // outside right: fruit
  ['orange', 238, 40, 0],
  ['apple', 240, 78, 0],
  ['banana', 238, 118, 10],
  // in front of the start straight: cutlery
  ['knife', 60, -22, 0],
  ['fork', 108, -22, 0],
  ['spoon', 156, -24, 0],
  ['waffle', 210, -24, 25],
  // outside left: pancakes and muffin
  ['pancakes', -46, 92, 0],
  ['muffin', -44, 40, 0],
];

/** Food and tableware on the table, placed by hand around the track (items that would touch the lane are skipped). */
export function breakfastScenery(track: Track, terrain: Terrain): THREE.Group {
  const group = new THREE.Group();
  const buckets = new Map<Item, THREE.Matrix4[]>();
  const placed: { x: number; z: number; r: number }[] = [];
  const clear = track.maxHalfWidth + WALL_OFFSET + 1.5;
  const o = new THREE.Object3D();
  for (const [item, x, z, rot, y = 0] of LAYOUT) {
    const r = footprint(ITEMS[item]);
    // stacked items sit on another one that was already checked
    if (y === 0) {
      if (terrain.distAt(x, z) < clear + r * 0.85) continue;
      placed.push({ x, z, r });
    }
    o.position.set(x, y, z);
    o.rotation.set(0, THREE.MathUtils.degToRad(rot), 0);
    o.updateMatrix();
    if (!buckets.has(item)) buckets.set(item, []);
    buckets.get(item)!.push(o.matrix.clone());
  }
  for (const [item, m] of buckets) instanced(ITEMS[item], m).forEach((obj) => group.add(obj));

  // spilled cornflakes, crumbs and sugar cubes (not on top of the tableware)
  const free = (x: number, _y: number, z: number) => !placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + 1);
  const seed = track.def.seed;
  group.add(scatter(track, terrain, [{ geo: fallback.flake, scale: 1 }], 220, seed + 1, { minDist: 12, maxDist: 34, scale: [0.7, 1.4], ok: free }));
  group.add(scatter(track, terrain, [{ geo: fallback.crumb, scale: 1 }], 260, seed + 2, { minDist: 12, maxDist: 40, scale: [0.6, 1.6], ok: free }));
  group.add(scatter(track, terrain, [{ geo: fallback.sugar, scale: 1 }], 24, seed + 3, { minDist: 13, maxDist: 30, scale: [0.9, 1.1], ok: free }));
  return group;
}

/** The kitchen around the track: wooden table top with legs, tiled floor and walls far away. */
export function kitchenRoom(track: Track): THREE.Group {
  const group = new THREE.Group();
  const b = track.bounds;
  const minX = b.minX - TABLE_MARGIN, maxX = b.maxX + TABLE_MARGIN;
  const minZ = b.minZ - TABLE_MARGIN, maxZ = b.maxZ + TABLE_MARGIN;
  const w = maxX - minX, d = maxZ - minZ;
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;

  // table top (slightly below the lane so they do not z-fight)
  const woodSrc = getTexture('wood');
  const woodMat = (repeatX: number, repeatY: number) => {
    let map: THREE.Texture | null = null;
    if (woodSrc) {
      map = woodSrc.clone();
      map.needsUpdate = true;
      map.repeat.set(repeatX, repeatY);
    }
    return new THREE.MeshLambertMaterial({ color: woodSrc ? '#f2d6b0' : '#b88a5a', map });
  };
  const top = new THREE.Mesh(new THREE.BoxGeometry(w, TABLE_THICK, d), [
    woodMat(d / 40, 0.1), woodMat(d / 40, 0.1), woodMat(w / 40, d / 40), woodMat(w / 40, d / 40), woodMat(w / 40, 0.1), woodMat(w / 40, 0.1),
  ]);
  top.position.set(cx, -0.03 - TABLE_THICK / 2, cz);
  group.add(top);

  const legMat = woodMat(0.3, 2);
  const legGeo = new THREE.BoxGeometry(8, TABLE_HEIGHT, 8);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(cx + sx * (w / 2 - 12), -TABLE_HEIGHT / 2 - TABLE_THICK, cz + sz * (d / 2 - 12));
      group.add(leg);
    }

  // tiled floor: 30 cm tiles = 30 m
  const floorSize = 2400;
  const tiles = floorTileTexture();
  tiles.repeat.set(floorSize / 60, floorSize / 60);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(floorSize, floorSize), new THREE.MeshLambertMaterial({ map: tiles }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, -TABLE_HEIGHT - TABLE_THICK, cz);
  group.add(floor);

  // walls of the kitchen (2.6 m high), a window and a kitchen counter along the back wall
  const floorY = -TABLE_HEIGHT - TABLE_THICK;
  const roomX = 1100, roomZ = 900, wallH = 260;
  const wallMat = new THREE.MeshLambertMaterial({ color: '#efe2c8' });
  const walls: [number, number, number, number][] = [
    [cx, cz - roomZ / 2, roomX, 6], [cx, cz + roomZ / 2, roomX, 6], [cx - roomX / 2, cz, 6, roomZ], [cx + roomX / 2, cz, 6, roomZ],
  ];
  for (const [x, z, sx, sz] of walls) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, wallH, sz), wallMat);
    wall.position.set(x, floorY + wallH / 2, z);
    group.add(wall);
  }
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(240, 130), new THREE.MeshBasicMaterial({ color: '#cfe6f7' }));
  pane.position.set(cx, floorY + 150, cz + roomZ / 2 - 4);
  pane.rotation.y = Math.PI;
  group.add(pane);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(roomX - 20, 90, 60), new THREE.MeshLambertMaterial({ color: '#5f7d8c' }));
  counter.position.set(cx, floorY + 45, cz + roomZ / 2 - 36);
  group.add(counter);
  const counterTop = new THREE.Mesh(new THREE.BoxGeometry(roomX - 16, 4, 64), new THREE.MeshLambertMaterial({ color: '#d8d4cc' }));
  counterTop.position.set(cx, floorY + 92, cz + roomZ / 2 - 36);
  group.add(counterTop);
  return group;
}
