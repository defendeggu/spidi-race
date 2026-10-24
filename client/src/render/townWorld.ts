import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  BLOCK_HALF, BLOCK_INNER, getTown, HARBOR, LINE_COUNT, LINES, mulberry32, PARKING_BAY, RAIL, rampHeight, ROAD_HW, SIDEWALK,
  FREIGHT_PATH, OFFROAD_PARK, PARKED_MODELS, railPath, SBAHN_PATH, TOWN_BOUNDS, TOWN_HALF, TOWN_RAIL,
  type RailPath, type Ramp, type TownMap,
} from '@spidi/shared';
import { assetsReady, getModel, getTexture, type TextureName } from './assets';
import { TownPeople } from './townPeople';
import { buildingMeshes, variantColors, type BuildingInstance } from './buildingKit';
import { colored, fallback, instanced, towerGeo, type Variant } from './scenery';
import { buildTownAirport, TOWN_AIRPORT_MODELS } from './townAirport';
import { TownLife } from './townLife';
import { sky, THEMES } from './world';

export interface TownWorld {
  town: TownMap;
  scene: THREE.Scene;
  /** container for cars, stars and other per-session objects */
  dynamic: THREE.Group;
  /** moving trains and boats (purely visual), updated with the game time */
  life: TownLife;
  /** pedestrians, updated with the game time and the players' cars */
  people: TownPeople;
}

/**
 * Concrete body of a drivable ramp, built from the same height profile the physics uses: top surface,
 * side walls and the back wall where the profile ends in an edge.
 */
function rampGeometry(r: Ramp) {
  const len = r.up + r.top + r.down, n = 24;
  const fx = Math.sin(r.rot), fz = Math.cos(r.rot), hw = r.width / 2;
  const P = (u: number, v: number, h: number) => [r.x + fx * u - fz * v, h, r.z + fz * u + fx * v];
  const us: number[] = [];
  for (let k = 0; k <= n; k++) us.push((k / n) * len);
  const h = (u: number) => Math.max(0, rampHeight(r, r.x + fx * Math.min(u, len - 1e-6), r.z + fz * Math.min(u, len - 1e-6)));
  const pos: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => pos.push(...a, ...b, ...c, ...c, ...b, ...d);
  for (let k = 0; k < n; k++) {
    const u0 = us[k], u1 = us[k + 1], h0 = h(u0), h1 = h(u1);
    quad(P(u0, -hw, h0), P(u0, hw, h0), P(u1, -hw, h1), P(u1, hw, h1));
    // side walls
    quad(P(u0, -hw, 0), P(u0, -hw, h0), P(u1, -hw, 0), P(u1, -hw, h1));
    quad(P(u0, hw, h0), P(u0, hw, 0), P(u1, hw, h1), P(u1, hw, 0));
  }
  const hEnd = h(len);
  if (hEnd > 0.01) quad(P(len, -hw, hEnd), P(len, hw, hEnd), P(len, -hw, 0), P(len, hw, 0));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Axis-aligned flat rectangles collected into one mesh; uv in metres. */
export class Quads {
  private pos: number[] = [];
  private uv: number[] = [];

  add(x0: number, z0: number, x1: number, z1: number, y = 0) {
    const a = [x0, y, z0], b = [x0, y, z1], c = [x1, y, z0], d = [x1, y, z1];
    this.pos.push(...a, ...b, ...c, ...c, ...b, ...d);
    this.uv.push(x0, z0, x0, z1, x1, z0, x1, z0, x0, z1, x1, z1);
  }

  /** A band of half width hw along a sampled line (curves included); uv in world metres like add(). */
  strip(pts: { x: number; z: number; heading: number }[], hw: number, y = 0) {
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i];
      const side = (o: { x: number; z: number; heading: number }, k: number): [number, number] => [o.x + Math.cos(o.heading) * hw * k, o.z - Math.sin(o.heading) * hw * k];
      const [ax, az] = side(p, 1), [bx, bz] = side(p, -1), [cx, cz] = side(q, 1), [dx, dz] = side(q, -1);
      // counter-clockwise seen from above (the faces point up)
      this.pos.push(ax, y, az, bx, y, bz, cx, y, cz, bx, y, bz, dx, y, dz, cx, y, cz);
      this.uv.push(ax, az, bx, bz, cx, cz, bx, bz, dx, dz, cx, cz);
    }
  }

  mesh(mat: THREE.Material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();
    return new THREE.Mesh(g, mat);
  }
}

/** Lambert material with a CC0 texture repeating every `metres` (or a plain colour without assets). */
/** Points along a track every metre, extended straight beyond its ends (into the tunnels). */
function railPoints(path: RailPath, before: number, after: number) {
  const out: { x: number; z: number; heading: number }[] = [];
  for (let s = before; s <= path.length + after; s += 1) {
    const c = Math.max(0, Math.min(path.length, s)), p = path.at(c), d = s - c;
    out.push({ x: p.x + Math.sin(p.heading) * d, z: p.z + Math.cos(p.heading) * d, heading: p.heading });
  }
  return out;
}

export function ground(tex: TextureName, metres: number, tint: string, plain: string) {
  const src = getTexture(tex);
  let map: THREE.Texture | null = null;
  if (src) {
    map = src.clone();
    map.needsUpdate = true;
    map.repeat.set(1 / metres, 1 / metres);
  }
  return new THREE.MeshLambertMaterial({ map, color: map ? tint : plain });
}

const TREES: Variant[] = [
  { model: 'tree_default', geo: fallback.round, scale: 6 },
  { model: 'tree_oak', geo: fallback.round, scale: 6 },
];

function addVariants(group: THREE.Group, variants: Variant[], buckets: THREE.Matrix4[][]) {
  variants.forEach((v, i) => instanced(v, buckets[i]).forEach((m) => group.add(m)));
}

let cached: TownWorld | null = null;

export function getTownWorld(): TownWorld {
  if (cached) return cached;
  const town = getTown();
  const theme = THEMES.city;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(theme.horizon);
  scene.fog = new THREE.Fog(theme.fog, 250, theme.fogFar);
  scene.add(sky(theme.skyTop, theme.horizon));
  scene.add(new THREE.HemisphereLight('#dfefff', theme.ground, 1.4));
  const sun = new THREE.DirectionalLight(theme.sun, 2.2);
  sun.position.set(-300, 500, -200);
  scene.add(sun);
  const rnd = mulberry32(town.seed + 11);

  // ---------------------------------------------------------------- ground: streets, sidewalks, block interiors
  const ext = LINES[LINE_COUNT - 1] + ROAD_HW;
  const road = new Quads(), walk = new Quads(), grass = new Quads(), paved = new Quads(), lot = new Quads(), cobble = new Quads();
  for (const L of LINES) {
    road.add(-ext, L - ROAD_HW, ext, L + ROAD_HW);
    road.add(L - ROAD_HW, -ext, L + ROAD_HW, ext);
  }
  const outer = ext + SIDEWALK;
  walk.add(-outer, ext, outer, outer);
  walk.add(-outer, -outer, outer, -ext);
  walk.add(ext, -ext, outer, ext);
  walk.add(-outer, -ext, -ext, ext);
  const far = TOWN_BOUNDS.maxX + 600;
  const { minX, maxX, maxZ } = TOWN_BOUNDS, Q = HARBOR.quayZ;
  grass.add(-far, outer, far, far);
  grass.add(outer, -outer, far, outer);
  grass.add(-far, -outer, -outer, outer);
  // harbour apron down to the quay; beyond it only water
  lot.add(minX, Q, maxX, -outer);
  grass.add(-far, Q, minX, -outer);
  grass.add(maxX, Q, far, -outer);
  const H = BLOCK_HALF, I = BLOCK_INNER;
  for (const b of town.blocks) {
    const { cx, cz } = b;
    walk.add(cx - H, cz - H, cx + H, cz - I);
    walk.add(cx - H, cz + I, cx + H, cz + H);
    walk.add(cx - H, cz - I, cx - I, cz + I);
    walk.add(cx + I, cz - I, cx + H, cz + I);
    if (b.kind === 'emergency') {
      // aprons in front of the fire and the police station, a lawn in between
      lot.add(cx - I, cz + 12, cx + I, cz + I);
      lot.add(cx - I, cz - I, cx + I, cz - 12);
      grass.add(cx - I, cz - 12, cx + I, cz + 12);
      continue;
    }
    if (b.kind === 'church') {
      // lawn with a paved path to the gates and a forecourt in front of the church
      grass.add(cx - I, cz - I, cx - 4, cz + 33);
      grass.add(cx + 4, cz - I, cx + I, cz + 33);
      paved.add(cx - 4, cz - I, cx + 4, cz + 33);
      paved.add(cx - I, cz + 33, cx + I, cz + I);
      continue;
    }
    const area = b.kind === 'house' || b.kind === 'park' ? grass
      : ['parking', 'practice', 'supermarket', 'industry', 'power'].includes(b.kind) ? lot
        : b.kind === 'oldtown' || b.kind === 'plaza' ? cobble : paved;
    area.add(cx - I, cz - I, cx + I, cz + I);
  }
  scene.add(road.mesh(ground('asphalt', 7, '#9a9a9a', '#55575a')));
  scene.add(lot.mesh(ground('asphalt', 7, '#b4b4b4', '#66686b')));
  scene.add(walk.mesh(ground('concrete', 4, '#e0dcd4', '#b9b4aa')));
  scene.add(paved.mesh(ground('concrete', 6, '#a8a49c', '#8f8b84')));
  scene.add(cobble.mesh(ground('gravel', 3, '#d8c4a8', '#a8957a')));
  scene.add(grass.mesh(ground('grass', 6, '#b8d49a', '#5f8a3c')));

  // ---------------------------------------------------------------- harbour water and quay, railway strip
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(2 * far, far).rotateX(-Math.PI / 2).translate(0, HARBOR.waterY, Q - far / 2),
    new THREE.MeshPhongMaterial({ color: '#2c7fae', shininess: 90, specular: '#9fd3ff', transparent: true, opacity: 0.92 }),
  );
  scene.add(water);
  const quay: THREE.BufferGeometry[] = [
    // quay wall down to the water and a yellow-black edge
    colored(new THREE.BoxGeometry(maxX - minX, 6, 1).translate((minX + maxX) / 2, -3, Q - 0.5), '#8a857c'),
    colored(new THREE.BoxGeometry(maxX - minX, 0.25, 0.5).translate((minX + maxX) / 2, 0.12, Q + 0.25), '#e0b820'),
  ];
  // overlays on the grass: station forecourt, track ballast, platform with canopy
  const over = new Quads(), ballast = new Quads();
  const f = RAIL.forecourt;
  over.add(f.x0, f.z0, f.x1, f.z1, 0.01);
  const af = TOWN_RAIL.airportForecourt;
  over.add(af.x0, af.z0, af.x1, af.z1, 0.01);
  const tracks = [railPoints(SBAHN_PATH, -16, 0), railPoints(FREIGHT_PATH, -16, 14)];
  for (const pts of tracks) ballast.strip(pts, 3, 0.012);
  const overlay = (m: THREE.MeshLambertMaterial) => {
    m.polygonOffset = true;
    m.polygonOffsetFactor = -1;
    m.polygonOffsetUnits = -2;
    return m;
  };
  scene.add(over.mesh(overlay(ground('asphalt', 7, '#b4b4b4', '#66686b'))));
  scene.add(ballast.mesh(overlay(ground('gravel', 3, '#9a948a', '#7a756c'))));
  const [p0, p1] = RAIL.platform, pz = 60;
  quay.push(colored(new THREE.BoxGeometry(p1 - p0, 0.9, 2 * pz).translate((p0 + p1) / 2, 0.45, 0), '#c9c4ba'));
  quay.push(colored(new THREE.BoxGeometry(0.3, 0.02, 2 * pz).translate(p0 + 0.4, 0.91, 0), '#f0c420'));
  quay.push(colored(new THREE.BoxGeometry(p1 - p0 + 1, 0.25, 2 * pz - 20).translate((p0 + p1) / 2, 4.6, 0), '#5d6670'));
  for (let z = -pz + 12; z <= pz - 12; z += 12) quay.push(colored(new THREE.BoxGeometry(0.2, 3.7, 0.2).translate((p0 + p1) / 2 + 1, 2.75, z), '#5d6670'));
  // airport station: platform with canopy at the terminus, buffer stop at the end of the track
  const ap = TOWN_RAIL.airportPlatform, apz = (ap.z0 + ap.z1) / 2, apl = ap.z1 - ap.z0;
  quay.push(colored(new THREE.BoxGeometry(ap.x1 - ap.x0, 0.9, apl).translate((ap.x0 + ap.x1) / 2, 0.45, apz), '#c9c4ba'));
  // yellow line along the edge towards the track
  const edge = Math.abs(ap.x0 - TOWN_RAIL.airportX) < Math.abs(ap.x1 - TOWN_RAIL.airportX) ? ap.x0 + 0.4 : ap.x1 - 0.4;
  quay.push(colored(new THREE.BoxGeometry(0.3, 0.02, apl).translate(edge, 0.91, apz), '#f0c420'));
  quay.push(colored(new THREE.BoxGeometry(ap.x1 - ap.x0 + 1, 0.25, apl - 20).translate((ap.x0 + ap.x1) / 2, 4.6, apz), '#5d6670'));
  for (let z = ap.z0 + 12; z <= ap.z1 - 12; z += 12) quay.push(colored(new THREE.BoxGeometry(0.2, 3.7, 0.2).translate((ap.x0 + ap.x1) / 2 - 1, 2.75, z), '#5d6670'));
  const end = SBAHN_PATH.at(SBAHN_PATH.length);
  quay.push(colored(new THREE.BoxGeometry(3.2, 1.2, 0.8).translate(end.x, 0.6, end.z - 0.6), '#c23a2a'));
  quay.push(colored(new THREE.BoxGeometry(3.4, 0.25, 0.3).translate(end.x, 1.0, end.z - 0.1), '#f0f0f0'));
  // rails (short straight pieces along the curves) and sleepers
  const sleeper = colored(new THREE.BoxGeometry(2.6, 0.12, 0.35).translate(0, 0.08, 0), '#6b5642');
  const sleepers: THREE.Matrix4[] = [];
  const up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  for (const pts of tracks) {
    for (let i = 0; i + 3 < pts.length; i += 3) {
      const a = pts[i], b = pts[i + 3], len = Math.hypot(b.x - a.x, b.z - a.z), h = Math.atan2(b.x - a.x, b.z - a.z);
      for (const dx of [-0.8, 0.8]) {
        const mx = (a.x + b.x) / 2 + Math.cos(h) * dx, mz = (a.z + b.z) / 2 - Math.sin(h) * dx;
        quay.push(colored(new THREE.BoxGeometry(0.12, 0.16, len + 0.05).rotateY(h).translate(mx, 0.2, mz), '#7a7d82'));
      }
    }
    for (let i = 0; i < pts.length; i += 1.2) {
      const p = pts[Math.floor(i)];
      sleepers.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0, p.z), new THREE.Quaternion().setFromAxisAngle(up, p.heading), one));
    }
  }
  instanced({ geo: () => sleeper, scale: 1 }, sleepers).forEach((m) => scene.add(m));
  // dark tunnel openings in the portals: both tracks in the south, the freight track in the north
  for (const [x, z, dir] of [[TOWN_RAIL.trackX, RAIL.south, 1], [TOWN_RAIL.freightX, RAIL.south, 1], [TOWN_RAIL.freightX, RAIL.north, -1]] as const) {
    quay.push(colored(new THREE.BoxGeometry(5.2, 6, 0.2).translate(x, 3, z + dir * 0.15), '#121212'));
  }
  scene.add(new THREE.Mesh(mergeGeometries(quay)!, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  // skate park ramps (concrete) and the jumps of the offroad park (earth)
  const inPark = (r: Ramp) => r.x > OFFROAD_PARK.area.x0 - 10;
  for (const [ramps, color] of [[town.ramps.filter((r) => !inPark(r)), '#c9c6bf'], [town.ramps.filter(inPark), '#9a6a44']] as const) {
    if (ramps.length) scene.add(new THREE.Mesh(mergeGeometries(ramps.map(rampGeometry))!, new THREE.MeshLambertMaterial({ color, flatShading: true })));
  }
  // offroad park: the loop in desert dirt with sand and mud stretches, a water hole
  const course = railPoints(railPath(OFFROAD_PARK.loop, 10), 0, 0);
  const stretch = (surface: string) => course.filter((_, i) => OFFROAD_PARK.surfaces.some(([a, b, s]) => s === surface && i >= a && i <= b + 1));
  const dirtTrack = new Quads(), sandTrack = new Quads(), mudTrack = new Quads();
  dirtTrack.strip(course, OFFROAD_PARK.width / 2, 0.014);
  for (const [q, surface] of [[sandTrack, 'sand'], [mudTrack, 'mud']] as const) {
    // a stretch is a run of consecutive points; draw them slightly above the dirt
    const pts = stretch(surface);
    let run: typeof pts = [];
    for (let i = 0; i < pts.length; i++) {
      run.push(pts[i]);
      const next = pts[i + 1];
      if (!next || Math.hypot(next.x - pts[i].x, next.z - pts[i].z) > 1.5) {
        q.strip(run, OFFROAD_PARK.width / 2, 0.016);
        run = [];
      }
    }
  }
  scene.add(dirtTrack.mesh(overlay(ground('desertdirt', 6, '#c89a70', '#9a6e4a'))));
  scene.add(sandTrack.mesh(overlay(ground('sand', 5, '#e2c896', '#c8a870'))));
  scene.add(mudTrack.mesh(overlay(ground('mud', 4, '#7a6048', '#4a3a2a'))));
  const W = OFFROAD_PARK.water;
  const pond = new THREE.Mesh(new THREE.CircleGeometry(W.r, 28).rotateX(-Math.PI / 2).translate(W.x, 0.03, W.z),
    new THREE.MeshPhongMaterial({ color: '#4a7a8c', shininess: 80, specular: '#9fd3ff', transparent: true, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
  scene.add(pond);

  // ---------------------------------------------------------------- markings
  const marks = new Quads(), yellow = new Quads();
  const MY = 0.02;
  const ZEBRA = [ROAD_HW + 1, ROAD_HW + 4];
  for (const L of LINES) {
    for (let k = 0; k < LINE_COUNT - 1; k++) {
      // dashed centre line between two intersections
      for (let a = LINES[k] + ZEBRA[1] + 2; a + 3 < LINES[k + 1] - ZEBRA[1] - 2; a += 6) {
        marks.add(a, L - 0.08, a + 3, L + 0.08, MY);
        marks.add(L - 0.08, a, L + 0.08, a + 3, MY);
      }
    }
    for (const M of LINES) {
      // zebra crossings on every arm of the intersection (L, M)
      for (const dir of [-1, 1]) {
        const n0 = L + dir * ZEBRA[0], n1 = L + dir * ZEBRA[1];
        const m0 = M + dir * ZEBRA[0], m1 = M + dir * ZEBRA[1];
        for (let s = -ROAD_HW + 0.6; s < ROAD_HW - 0.5; s += 1.1) {
          if (Math.abs(n1) <= ext) marks.add(Math.min(n0, n1), M + s, Math.max(n0, n1), M + s + 0.55, MY);
          if (Math.abs(m1) <= ext) marks.add(L + s, Math.min(m0, m1), L + s + 0.55, Math.max(m0, m1), MY);
        }
      }
    }
  }
  // zebra crossing over the airport access lane, where the travellers walk between station and terminal
  const ap2 = TOWN_RAIL.airportPlatform;
  for (let z = 110.6; z < 129.5; z += 1.1) marks.add(ap2.x0 - 0.5, z, ap2.x1 + 0.5, z + 0.55, MY);
  // parking bays: separating lines and a line at the back of each bay
  for (const bay of town.bays) {
    // bays point along x or z; f = into the bay, r = across
    const fx = Math.round(Math.sin(bay.heading)), fz = Math.round(Math.cos(bay.heading));
    const rx = fz, rz = fx;
    const hw = PARKING_BAY.width / 2, hl = PARKING_BAY.length / 2;
    const rect = (cx: number, cz: number, ex: number, ez: number) => marks.add(cx - ex, cz - ez, cx + ex, cz + ez, MY);
    for (const sd of [-1, 1]) {
      rect(bay.x + rx * sd * hw, bay.z + rz * sd * hw, Math.abs(rx) * 0.06 + Math.abs(fx) * hl, Math.abs(rz) * 0.06 + Math.abs(fz) * hl);
    }
    rect(bay.x + fx * hl, bay.z + fz * hl, Math.abs(rx) * hw + Math.abs(fx) * 0.06, Math.abs(rz) * hw + Math.abs(fz) * 0.06);
  }
  // practice square: yellow start box and a painted circle around the cone ring
  const p = town.practice;
  const s0 = town.spawn(0), s1 = town.spawn(1);
  for (const sp of [s0, s1]) {
    yellow.add(sp.x - 3, sp.z - 1.6, sp.x + 3, sp.z - 1.45, MY);
    yellow.add(sp.x - 3, sp.z + 1.45, sp.x + 3, sp.z + 1.6, MY);
  }
  for (let k = 0; k < 72; k += 2) {
    const a = (k / 72) * Math.PI * 2;
    const x = p.cx + Math.cos(a) * 18, z = p.cz + 22 + Math.sin(a) * 18;
    yellow.add(x - 0.4, z - 0.4, x + 0.4, z + 0.4, MY);
  }
  const markMat = (color: string) => new THREE.MeshLambertMaterial({ color, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  scene.add(marks.mesh(markMat('#eeeeea')));
  scene.add(yellow.mesh(markMat('#f0c420')));

  // ---------------------------------------------------------------- buildings and trees
  const city = new THREE.Group();
  const trees = TREES.map(() => [] as THREE.Matrix4[]);
  const fences: THREE.BufferGeometry[] = [];
  const o = new THREE.Object3D();
  for (const c of town.circles) {
    if (c.kind !== 'tree') continue;
    o.position.set(c.x, 0, c.z);
    o.rotation.set(0, rnd() * Math.PI * 2, 0);
    o.scale.setScalar(0.85 + rnd() * 0.35);
    o.updateMatrix();
    trees[Math.floor(rnd() * TREES.length)].push(o.matrix.clone());
  }
  o.scale.setScalar(1);
  // buildings and props: one instanced mesh per model and material, colours per instance
  const byModel = new Map<string, BuildingInstance[]>();
  const fallbackBoxes: BuildingInstance[] = [];
  const q = new THREE.Quaternion(), yAxis = new THREE.Vector3(0, 1, 0);
  const windmills: typeof town.props = [];
  for (const b of [...town.buildings, ...town.props]) {
    // terminal, tower, aircraft … of the airfield are drawn by buildTownAirport
    if (TOWN_AIRPORT_MODELS.has(b.model)) continue;
    // the wind turbine is drawn separately so its rotor can turn
    if (b.model === 'ind-windmill' && assetsReady()) {
      windmills.push(b);
      continue;
    }
    const colors = variantColors(b);
    q.setFromAxisAngle(yAxis, b.rot);
    const turned = Math.abs(Math.sin(b.rot)) > 0.5;
    const unit = b.model === 'fence' || b.model === 'tunnel-portal' || b.model === 'container';
    if (unit || !assetsReady()) {
      // fence segments and portals (and everything without assets): a box of the footprint, scaled per instance
      const w = turned ? b.d : b.w, d = turned ? b.w : b.d;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(b.x, b.y ?? 0, b.z), q, new THREE.Vector3(w, b.h, d));
      if (unit && assetsReady()) (byModel.get(b.model) ?? byModel.set(b.model, []).get(b.model)!).push({ matrix: m, ...colors });
      else fallbackBoxes.push({ matrix: m, ...colors });
      continue;
    }
    const m = new THREE.Matrix4().compose(new THREE.Vector3(b.x, b.y ?? 0, b.z), q, new THREE.Vector3(b.scale, b.scale, b.scale));
    (byModel.get(b.model) ?? byModel.set(b.model, []).get(b.model)!).push({ matrix: m, ...colors });
  }
  for (const [model, items] of byModel) buildingMeshes(model, items).forEach((x) => city.add(x));
  if (fallbackBoxes.length) {
    const box = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshLambertMaterial(), fallbackBoxes.length);
    fallbackBoxes.forEach((it, i) => {
      box.setMatrixAt(i, it.matrix);
      box.setColorAt(i, it.wall);
    });
    city.add(box);
  }
  addVariants(city, TREES, trees);
  city.add(buildTownAirport(town));

  // the wall around the town and a skyline behind it
  const WT = 4, WH = 3, wallZ = maxZ - Q;
  fences.push(
    colored(new THREE.BoxGeometry(maxX - minX + 2 * WT, WH, WT).translate((minX + maxX) / 2, WH / 2, maxZ + WT / 2), '#b8b2a6'),
    colored(new THREE.BoxGeometry(WT, WH, wallZ).translate(maxX + WT / 2, WH / 2, (maxZ + Q) / 2), '#b8b2a6'),
    colored(new THREE.BoxGeometry(WT, WH, wallZ).translate(minX - WT / 2, WH / 2, (maxZ + Q) / 2), '#b8b2a6'),
  );
  city.add(new THREE.Mesh(mergeGeometries(fences)!, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  const skyline: Variant[] = 'acfhl'.split('').map((c, i) => ({ model: `low-detail-building-${c}`, geo: towerGeo(40 + i * 6, '#8d97a3'), scale: 26 }));
  const sky2 = skyline.map(() => [] as THREE.Matrix4[]);
  for (let k = 0; k < 90; k++) {
    const a = rnd() * Math.PI * 2, r = TOWN_HALF + 80 + rnd() * 250;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    // around the town, but not in the harbour basin
    if (x > minX - 60 && x < maxX + 60 && z > Q - 60 && z < maxZ + 60) continue;
    if (z < Q + 40) continue;
    o.position.set(x, 0, z);
    o.rotation.set(0, rnd() * Math.PI * 2, 0);
    o.scale.setScalar(0.8 + rnd() * 0.6);
    o.updateMatrix();
    sky2[Math.floor(rnd() * skyline.length)].push(o.matrix.clone());
  }
  o.scale.setScalar(1);
  addVariants(city, skyline, sky2);

  // ---------------------------------------------------------------- street furniture: lamps, cones, parked cars
  const pole = mergeGeometries([
    colored(new THREE.CylinderGeometry(0.12, 0.16, 7, 6).translate(0, 3.5, 0), '#3d4248'),
    colored(new THREE.BoxGeometry(0.15, 0.15, 2.4).translate(0, 7, 1.1), '#3d4248'),
    colored(new THREE.BoxGeometry(0.5, 0.15, 0.9).translate(0, 6.9, 2.1), '#fff4cc'),
  ])!;
  const cone = mergeGeometries([
    colored(new THREE.BoxGeometry(0.7, 0.06, 0.7).translate(0, 0.03, 0), '#222222'),
    colored(new THREE.ConeGeometry(0.3, 0.3, 10).translate(0, 0.21, 0), '#ff6a13'),
    colored(new THREE.CylinderGeometry(0.15, 0.22, 0.18, 10).translate(0, 0.45, 0), '#f4f4f4'),
    colored(new THREE.ConeGeometry(0.15, 0.25, 10).translate(0, 0.66, 0), '#ff6a13'),
  ])!;
  const bollard = mergeGeometries([
    colored(new THREE.CylinderGeometry(0.3, 0.35, 0.7, 10).translate(0, 0.35, 0), '#2f3236'),
    colored(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 10).translate(0, 0.76, 0), '#2f3236'),
  ])!;
  const lamps: THREE.Matrix4[] = [], cones: THREE.Matrix4[] = [], bollards: THREE.Matrix4[] = [];
  for (const c of town.circles) {
    if (c.kind === 'tree' || c.kind === 'prop') continue;
    if (c.kind === 'bollard') {
      bollards.push(new THREE.Matrix4().makeTranslation(c.x, 0, c.z));
      continue;
    }
    const b = town.blockAt(c.x, c.z);
    o.position.set(c.x, 0, c.z);
    // lamp arms point over the corner of the street
    o.rotation.set(0, c.kind === 'lamp' && b ? Math.atan2(Math.sign(c.x - b.cx), Math.sign(c.z - b.cz)) : 0, 0);
    o.updateMatrix();
    (c.kind === 'lamp' ? lamps : cones).push(o.matrix.clone());
  }
  instanced({ geo: () => pole, scale: 1 }, lamps).forEach((m) => city.add(m));
  instanced({ geo: () => cone, scale: 1 }, cones).forEach((m) => city.add(m));
  instanced({ geo: () => bollard, scale: 1 }, bollards).forEach((m) => city.add(m));
  const parkedVariants: Variant[] = PARKED_MODELS.map((m) => ({
    model: m,
    geo: () => mergeGeometries([
      colored(new THREE.BoxGeometry(2, 0.8, 4.4).translate(0, 0.65, 0), ['#c8102e', '#2f6fd0', '#e0e0e0', '#3f8a3a'][m.length % 4]),
      colored(new THREE.BoxGeometry(1.7, 0.6, 2.2).translate(0, 1.35, -0.2), '#2a3440'),
    ])!,
    scale: 1.65,
  }));
  const parked = parkedVariants.map(() => [] as THREE.Matrix4[]);
  for (const bay of town.bays) {
    if (bay.parked < 0) continue;
    o.position.set(bay.x, 0, bay.z);
    o.rotation.set(0, bay.heading, 0);
    o.updateMatrix();
    parked[bay.parked % parkedVariants.length].push(o.matrix.clone());
  }
  addVariants(city, parkedVariants, parked);
  scene.add(city);

  const dynamic = new THREE.Group();
  scene.add(dynamic);
  const life = new TownLife();
  scene.add(life.group);
  for (const w of windmills) life.addWindmill(w.model, w.scale, w.x, w.z, w.rot);
  // steam from the cooling towers of the power plant
  const tower = assetsReady() ? getModel('ind-chimney-large') : undefined;
  const towerSize = tower ? new THREE.Box3().setFromObject(tower).getSize(new THREE.Vector3()) : new THREE.Vector3(1, 3.6, 1);
  for (const p of town.props.filter((x) => x.model === 'ind-chimney-large')) {
    life.addSteam(p.x, p.z, towerSize.y * p.scale, (Math.max(towerSize.x, towerSize.z) * p.scale) / 2);
  }
  const people = new TownPeople(town);
  scene.add(people.group);
  cached = { town, scene, dynamic, life, people };
  return cached;
}
