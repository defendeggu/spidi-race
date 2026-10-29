import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Diamond tread plate, tiled on the bonnet and wings (shared by every Roki). */
let treadPlate: THREE.Texture | undefined;
function treadPlateTexture() {
  if (treadPlate) return treadPlate;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#c4c9cc'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#8f979c'; g.lineWidth = 5; g.lineCap = 'round';
  for (const [x, y, d] of [[16, 16, 1], [48, 48, 1], [48, 16, -1], [16, 48, -1]]) {
    g.beginPath(); g.moveTo(x - 7, y - 7 * d); g.lineTo(x + 7, y + 7 * d); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(5, 5);
  return (treadPlate = t);
}

/** The owner's web address, lettered on the high roof. */
let letters: THREE.Texture | undefined;
function letteringTexture() {
  if (letters) return letters;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#c42026'; g.font = '64px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('rotekiste.ch', 256, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return (letters = t);
}

/**
 * Roki: lifted long-wheelbase station-wagon off-roader with a white high roof, snorkel, A-bar with
 * winch, lamp guards, tread plates, black steel wheels and a black spare wheel on the rear door.
 * All dimensions are metres; +Z is forward, +X is the left-hand side.
 */
export function buildRoki(color: string, tail: THREE.Material) {
  const body = new THREE.Group();
  // Raised suspension: the whole shell sits higher above the axles.
  const LIFT = 0.18;
  const shell = new THREE.Group(); shell.position.y = LIFT; body.add(shell);
  const canvas = typeof document !== 'undefined';
  const paint = new THREE.MeshPhongMaterial({ color, shininess: 80, specular: '#d8c8c8' });
  const roof = new THREE.MeshPhongMaterial({ color: '#f1efe6', shininess: 60, specular: '#ffffff' });
  const black = new THREE.MeshPhongMaterial({ color: '#15181a', shininess: 25 });
  const rubber = new THREE.MeshPhongMaterial({ color: '#141617', shininess: 8 });
  const rim = new THREE.MeshPhongMaterial({ color: '#1c1f21', shininess: 70 });
  const darkRim = new THREE.MeshPhongMaterial({ color: '#23272a', shininess: 60 });
  const silver = new THREE.MeshPhongMaterial({ color: '#aab3b9', shininess: 120 });
  const chrome = new THREE.MeshPhongMaterial({ color: '#dfe5e8', specular: '#ffffff', shininess: 200 });
  const winchGrey = new THREE.MeshPhongMaterial({ color: '#4a5560', shininess: 60 });
  const plate = new THREE.MeshPhongMaterial({ color: '#d4d8da', shininess: 110, specular: '#ffffff', map: canvas ? treadPlateTexture() : null });
  const glass = new THREE.MeshPhongMaterial({ color: '#22394a', specular: '#bdddeb', shininess: 150, side: THREE.DoubleSide });
  const lamp = new THREE.MeshPhongMaterial({ color: '#e8eeee', emissive: '#3a4246', shininess: 150 });
  const amber = new THREE.MeshPhongMaterial({ color: '#f08a12', emissive: '#4a2200', shininess: 120 });
  const lettering = new THREE.MeshBasicMaterial({ map: canvas ? letteringTexture() : null, transparent: true, depthWrite: false });
  const materials = [paint, roof, black, rubber, rim, darkRim, silver, chrome, winchGrey, plate, glass, lamp, amber, lettering];
  const mesh = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = shell) => {
    const m = new THREE.Mesh(geometry, material);
    m.name = name; m.position.set(x, y, z); parent.add(m); return m;
  };
  const box = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material = paint, r = 0.03) =>
    mesh(name, new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 3, h / 3, d / 3)), mat, x, y, z);
  /** A round part facing forwards or backwards. */
  const disc = (name: string, r: number, depth: number, mat: THREE.Material, x: number, y: number, z: number) =>
    mesh(name, new THREE.CylinderGeometry(r, r, depth, 28).rotateX(Math.PI / 2), mat, x, y, z);
  const tube = (name: string, points: number[][], r: number, mat = black) =>
    mesh(name, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.1), points.length * 10, r, 10, false), mat);
  const quad = (name: string, vertices: number[][], mat = glass) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flat(), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]); geo.computeVertexNormals(); return mesh(name, geo, mat);
  };
  /** A side-view profile (x = along the car, y = up) extruded across the car. */
  const across = (shape: THREE.Shape, depth: number, x: number, bevel = 0.025) => {
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 24 });
    return geo.rotateY(-Math.PI / 2).translate(x, 0, 0);
  };

  const FRONT_AXLE = 1.25, REAR_AXLE = -1.55, ARCH = 0.54, SILL = 0.5;
  /** windscreen raked back by 8° */
  const RAKE = Math.tan(8 * Math.PI / 180);
  const pillarZ = (z: number, y: number) => z - (y - 1.24) * RAKE;
  const FRONT = 2.05, REAR = -2.2, WAIST = 1.24, HW = 0.86;
  /** Angular wheel opening: steep sides, a flat top. */
  const archPoints = (z: number, r: number) => [
    [z - r, SILL], [z - r * 0.82, SILL + r * 0.72], [z - r * 0.5, SILL + r], [z + r * 0.5, SILL + r], [z + r * 0.82, SILL + r * 0.72], [z + r, SILL],
  ];
  // Lower body: one slab from the flat front panel to the rear door.
  const lower = new THREE.Shape();
  lower.moveTo(REAR, SILL);
  for (const z of [REAR_AXLE, FRONT_AXLE]) for (const [u, v] of archPoints(z, ARCH)) lower.lineTo(u, v);
  lower.lineTo(FRONT, SILL); lower.lineTo(FRONT, WAIST); lower.lineTo(REAR, WAIST); lower.closePath();
  mesh('lower-body', across(lower, HW * 2, HW), paint);
  for (const z of [FRONT_AXLE, REAR_AXLE]) {
    box('wheel-well', 1.2, 0.44, ARCH * 1.8, 0, 0.8, z, black);
    // Wide, flat black arch extensions following the opening.
    const outer = archPoints(z, ARCH + 0.11), inner = archPoints(z, ARCH).reverse();
    const flare = new THREE.Shape();
    flare.moveTo(outer[0][0], outer[0][1]);
    for (const [u, v] of [...outer.slice(1), ...inner]) flare.lineTo(u, v);
    flare.closePath();
    for (const s of [-1, 1]) mesh('arch-flare', across(flare, 0.09, s > 0 ? HW + 0.1 : -HW - 0.01, 0.015), black);
    for (const s of [-1, 1]) box('mudflap', 0.3, 0.36, 0.02, s * 0.8, 0.2, z - ARCH - 0.08, rubber, 0.01);
  }
  box('chassis', 0.92, 0.16, 4.1, 0, 0.42, -0.1, black);
  // Raised bonnet between flat wings, all three covered with tread plate.
  box('bonnet', 1.12, 0.07, 1.06, 0, WAIST + 0.025, 1.5, paint, 0.025);
  box('bonnet-plate', 0.86, 0.012, 0.86, 0, WAIST + 0.065, 1.52, plate, 0.004);
  for (const s of [-1, 1]) box('wing-plate', 0.24, 0.012, 0.86, s * 0.72, WAIST + 0.03, 1.55, plate, 0.004);
  for (const s of [-1, 1]) {
    box('rock-slider', 0.14, 0.1, 1.72, s * (HW - 0.01), SILL - 0.04, -0.15, black);
    box('mirror-arm', 0.2, 0.04, 0.04, s * 0.98, 1.4, 0.84, black, 0.015);
    box('mirror', 0.06, 0.3, 0.2, s * 1.08, 1.5, 0.84, black, 0.03);
    box('side-repeater', 0.02, 0.05, 0.08, s * (HW + 0.03), 1.1, 1.88, amber, 0.01);
  }
  box('wing-vent', 0.02, 0.14, 0.3, HW + 0.025, 1.1, 1.62, black, 0.01);
  mesh('antenna', new THREE.CylinderGeometry(0.006, 0.01, 0.8, 6), black, 0.78, WAIST + 0.4, 1.02);
  // Snorkel on the right wing, up the windscreen pillar to a round mushroom head.
  tube('snorkel', [
    [-HW + 0.02, 1.08, 1.3], [-HW - 0.07, 1.1, 1.18], [-HW - 0.08, 1.2, 1.04],
    [-HW - 0.06, 1.6, pillarZ(0.99, 1.6)], [-HW - 0.04, 2.05, pillarZ(0.97, 2.05)],
  ], 0.055);
  const head = [-HW - 0.04, 2.12, pillarZ(0.97, 2.12)] as const;
  mesh('snorkel-head', new THREE.CylinderGeometry(0.1, 0.09, 0.16, 20), black, ...head);
  mesh('snorkel-cap', new THREE.CylinderGeometry(0.105, 0.105, 0.05, 20), darkRim, head[0], head[1] + 0.09, head[2]);
  for (const y of [1.45, 1.8]) box('snorkel-bracket', 0.08, 0.03, 0.05, -HW - 0.01, y, pillarZ(0.96, y), black, 0.01);

  // Cabin: slightly drawn-in sides up to the roof, flat raked windscreen.
  const TOP = 1.9, TOP_HW = 0.79, CAB_FRONT = 0.95;
  const section = new THREE.Shape();
  section.moveTo(-HW, WAIST); section.lineTo(HW, WAIST); section.lineTo(TOP_HW, TOP); section.lineTo(-TOP_HW, TOP); section.closePath();
  const cabin = new THREE.ExtrudeGeometry(section, { depth: CAB_FRONT - REAR - 0.04, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 });
  cabin.translate(0, 0, REAR + 0.02);
  const cp = cabin.attributes.position;
  for (let i = 0; i < cp.count; i++) if (cp.getZ(i) > CAB_FRONT - 0.1) cp.setZ(i, pillarZ(cp.getZ(i), cp.getY(i)));
  cabin.computeVertexNormals();
  mesh('cabin', cabin, paint);
  const sideX = (y: number) => HW - (y - WAIST) * (HW - TOP_HW) / (TOP - WAIST) + 0.028;
  for (const s of [-1, 1]) {
    const p = (z: number, y: number) => [s * sideX(y), y, z];
    quad('front-door-window', [p(0.02, 1.4), p(pillarZ(0.84, 1.4), 1.4), p(pillarZ(0.84, 1.82), 1.82), p(0.02, 1.82)]);
    quad('rear-door-window', [p(-0.84, 1.4), p(-0.14, 1.4), p(-0.14, 1.82), p(-0.84, 1.82)]);
    quad('rear-side-window', [p(-2.06, 1.4), p(-1.05, 1.4), p(-1.05, 1.82), p(-2.06, 1.82)]);
    const seam = (z: number, y0: number, y1: number) =>
      quad('door-seam', [[s * (HW + 0.03), y0, z - 0.006], [s * (HW + 0.03), y0, z + 0.006], [s * (HW + 0.03), y1, z + 0.006], [s * (HW + 0.03), y1, z - 0.006]], black);
    seam(0.58, 0.56, WAIST);
    for (const z of [-0.06, -0.92]) {
      seam(z, 0.56, WAIST);
      quad('door-seam', [p(z - 0.006, WAIST), p(z + 0.006, WAIST), p(z + 0.006, TOP - 0.02), p(z - 0.006, TOP - 0.02)], black);
    }
    // Hinges on the front edge of each door, handles at the back.
    for (const z of [0.56, -0.08]) for (const y of [0.78, 1.12]) box('door-hinge', 0.03, 0.07, 0.06, s * (HW + 0.035), y, z - 0.03, black, 0.01);
    for (const z of [0.0, -0.86]) box('door-handle', 0.03, 0.04, 0.16, s * (HW + 0.035), 1.08, z + 0.06, black, 0.012);
    // Waist crease below the big rear side window.
    box('waist-crease', 0.015, 0.02, 1.2, s * (HW + 0.03), 1.18, -1.58, paint, 0.006);
  }
  box('fuel-flap', 0.02, 0.16, 0.12, -HW - 0.03, 1.02, -2.0, black, 0.02);
  const screen = (y: number) => pillarZ(CAB_FRONT + 0.03, y);
  quad('windscreen', [[-0.74, 1.33, screen(1.33)], [0.74, 1.33, screen(1.33)], [0.7, 1.83, screen(1.83)], [-0.7, 1.83, screen(1.83)]]);
  box('windscreen-centre-bar', 0.04, 0.5, 0.02, 0, 1.58, screen(1.58) + 0.005, black, 0.01).rotation.x = -Math.atan(RAKE);
  for (const s of [-1, 1]) {
    const wiper = mesh('wiper', new THREE.BoxGeometry(0.55, 0.018, 0.02), black, s * 0.32, 1.38, screen(1.38) + 0.02);
    wiper.rotation.z = s * 0.25;
  }

  // White high roof: rounded front, flat top, a skylight, lettering on the sides and back.
  // Its front continues the windscreen line at the same angle (the profile is inset by the bevel).
  const HIGH = 0.23, BEVEL = 0.05, roofHW = TOP_HW + 0.05, roofFront = pillarZ(CAB_FRONT, TOP);
  const high = new THREE.Shape();
  high.moveTo(REAR + BEVEL - 0.03, TOP - 0.02); high.lineTo(pillarZ(CAB_FRONT - BEVEL, TOP - 0.02), TOP - 0.02);
  high.lineTo(pillarZ(CAB_FRONT - BEVEL, TOP + HIGH - BEVEL), TOP + HIGH - BEVEL); high.lineTo(REAR + BEVEL - 0.03, TOP + HIGH - BEVEL);
  high.closePath();
  mesh('high-roof', across(high, roofHW * 2 - 2 * BEVEL, roofHW - BEVEL, BEVEL), roof);
  box('skylight', 0.6, 0.03, 0.42, 0, TOP + HIGH, roofFront - 0.75, glass, 0.01);
  box('roof-trim', roofHW * 2 + 0.02, 0.025, roofFront - REAR + 0.1, 0, TOP - 0.01, (roofFront + REAR) / 2, black, 0.01);
  const label = (x: number, z: number, ry: number) => {
    const m = mesh('lettering', new THREE.PlaneGeometry(0.7, 0.13), lettering, x, TOP + 0.145, z);
    m.rotation.y = ry;
  };
  label(roofHW + 0.006, -0.25, Math.PI / 2);
  label(-roofHW - 0.006, -0.25, -Math.PI / 2);
  const rearFace = REAR - 0.03 - 0.006;
  const rl = mesh('lettering', new THREE.PlaneGeometry(0.65, 0.12), lettering, -0.4, TOP + 0.09, rearFace);
  rl.rotation.y = Math.PI;
  // Rolled-up awning along the left-hand side, sand ladders over the left rear side window.
  mesh('awning', new THREE.CylinderGeometry(0.075, 0.075, 2.6, 16).rotateX(Math.PI / 2), roof, roofHW + 0.07, TOP, -0.65);
  for (const y of [1.52, 1.72]) {
    box('sand-ladder', 0.03, 0.17, 0.98, sideX(y) + 0.03, y, -1.55, silver, 0.01);
    for (let i = 0; i < 8; i++) box('sand-ladder-stud', 0.02, 0.1, 0.05, sideX(y) + 0.05, y, -1.98 + i * 0.123, darkRim, 0.008);
  }

  // Front: grille and round lamps behind black lamp guards, steel bumper with winch and an A-bar with spotlights.
  box('grille', 1.1, 0.42, 0.04, 0, 1.0, FRONT + 0.02, darkRim, 0.015);
  for (let y = 0.84; y <= 1.17; y += 0.065) box('grille-slat', 1.02, 0.022, 0.03, 0, y, FRONT + 0.045, black, 0.006);
  for (const s of [-1, 1]) {
    disc('headlamp-bezel', 0.13, 0.05, black, s * 0.71, 1.02, FRONT + 0.02);
    disc('headlamp', 0.1, 0.04, lamp, s * 0.71, 1.02, FRONT + 0.04);
    disc('indicator', 0.04, 0.03, amber, s * 0.66, 0.79, FRONT + 0.04);
    disc('side-lamp', 0.035, 0.03, lamp, s * 0.77, 0.79, FRONT + 0.04);
    const gz = FRONT + 0.12, gx = s * 0.71;
    for (const [w, h, x, y] of [[0.36, 0.03, gx, 1.22], [0.36, 0.03, gx, 0.7], [0.03, 0.55, gx - 0.17, 0.96], [0.03, 0.55, gx + 0.17, 0.96]]) box('lamp-guard-frame', w, h, 0.03, x, y, gz, black, 0.01);
    for (let y = 0.76; y < 1.2; y += 0.065) box('lamp-guard-bar', 0.33, 0.012, 0.012, gx, y, gz, black, 0.004);
  }
  box('steel-bumper', 1.9, 0.26, 0.28, 0, 0.56, FRONT + 0.12, black, 0.02);
  box('front-plate', 0.5, 0.11, 0.02, -0.62, 0.76, FRONT + 0.15, roof, 0.008);
  box('winch', 0.56, 0.18, 0.22, 0, 0.78, FRONT + 0.16, winchGrey, 0.04);
  mesh('winch-drum', new THREE.CylinderGeometry(0.07, 0.07, 0.3, 16).rotateZ(Math.PI / 2), silver, 0, 0.74, FRONT + 0.28);
  box('fairlead', 0.3, 0.09, 0.03, 0, 0.6, FRONT + 0.275, chrome, 0.03);
  tube('a-bar', [[-0.36, 0.68, FRONT + 0.26], [-0.36, 1.0, FRONT + 0.3], [-0.3, 1.1, FRONT + 0.3], [0.3, 1.1, FRONT + 0.3], [0.36, 1.0, FRONT + 0.3], [0.36, 0.68, FRONT + 0.26]], 0.04);
  for (const s of [-1, 1]) {
    box('spotlight-mount', 0.03, 0.1, 0.03, s * 0.19, 1.04, FRONT + 0.3, black, 0.01);
    disc('spotlight', 0.1, 0.1, chrome, s * 0.19, 0.95, FRONT + 0.32);
    disc('spotlight-lens', 0.085, 0.02, lamp, s * 0.19, 0.95, FRONT + 0.375);
    box('tow-eye', 0.06, 0.06, 0.1, s * 0.6, 0.48, FRONT + 0.27, black, 0.01);
  }

  // Rear: three windows, ladder on the left up to the roof edge, small round lamps low in the corners, black spare wheel.
  const rearPane = (name: string, x0: number, x1: number, y0: number, y1: number) =>
    quad(name, [[x1, y0, REAR - 0.035], [x0, y0, REAR - 0.035], [x0, y1, REAR - 0.035], [x1, y1, REAR - 0.035]]);
  rearPane('rear-window', -0.4, 0.4, 1.4, 1.82);
  for (const s of [-1, 1]) rearPane('rear-corner-window', s > 0 ? 0.55 : -0.75, s > 0 ? 0.75 : -0.55, 1.46, 1.8);
  for (const s of [-1, 1]) {
    disc('rear-indicator', 0.045, 0.04, amber, s * 0.74, 0.98, REAR - 0.02);
    disc('tail-lamp', 0.05, 0.04, tail, s * 0.74, 0.86, REAR - 0.02);
    disc(s > 0 ? 'rear-fog-lamp' : 'reverse-lamp', 0.045, 0.04, s > 0 ? tail : lamp, s * 0.74, 0.75, REAR - 0.02);
    box('door-hinge', 0.04, 0.1, 0.05, -0.8, s > 0 ? 1.55 : 0.85, REAR - 0.02, black, 0.01);
  }
  for (const x of [0.62, 0.82]) tube('ladder-rail', [[x, 0.62, REAR - 0.02], [x, 0.66, REAR - 0.12], [x, TOP - 0.14, REAR - 0.12], [x, TOP - 0.08, REAR - 0.02]], 0.018);
  for (let y = 0.8; y < TOP - 0.16; y += 0.24) mesh('ladder-rung', new THREE.CylinderGeometry(0.014, 0.014, 0.2, 8).rotateZ(Math.PI / 2), black, 0.72, y, REAR - 0.12);
  box('rear-door-handle', 0.14, 0.04, 0.03, 0.45, 1.3, REAR - 0.03, black, 0.01);
  box('rear-crossmember', 1.86, 0.2, 0.2, 0, 0.47, REAR - 0.07, black, 0.02);
  box('tow-hitch', 0.14, 0.12, 0.26, 0, 0.36, REAR - 0.22, black, 0.02);
  mesh('tow-ball', new THREE.SphereGeometry(0.045, 12, 8), silver, 0, 0.45, REAR - 0.33);
  mesh('exhaust', new THREE.CylinderGeometry(0.035, 0.035, 0.3, 12).rotateX(Math.PI / 2), darkRim, 0.55, 0.32, REAR - 0.05);
  box('spare-bracket', 0.3, 0.3, 0.1, 0, 1.0, REAR - 0.05, black, 0.02);

  // Chunky mud tyres on black steel wheels (and the same as the spare).
  const R = 0.47;
  const buildWheel = (wheel: THREE.Object3D, outside: number) => {
    const tyre = mesh('mud-tyre', new THREE.TorusGeometry(0.33, 0.135, 16, 48), rubber, 0, 0, 0, wheel);
    tyre.rotation.y = Math.PI / 2;
    for (let i = 0; i < 36; i++) {
      const a = i * Math.PI / 18;
      const lug = mesh('tread-block', new THREE.BoxGeometry(0.2, 0.03, 0.055), rubber, 0, Math.cos(a) * (R - 0.012), Math.sin(a) * (R - 0.012), wheel);
      lug.rotation.x = a;
      lug.position.x = i % 2 ? 0.03 : -0.03;
    }
    mesh('steel-wheel', new THREE.CylinderGeometry(0.24, 0.24, 0.04, 36).rotateZ(Math.PI / 2), rim, outside, 0, 0, wheel);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + 0.2;
      mesh('rim-hole', new THREE.CylinderGeometry(0.025, 0.025, 0.01, 12).rotateZ(Math.PI / 2), rubber, outside * 1.2, Math.cos(a) * 0.17, Math.sin(a) * 0.17, wheel);
    }
    mesh('hub', new THREE.CylinderGeometry(0.075, 0.075, 0.07, 20).rotateZ(Math.PI / 2), darkRim, outside * 1.2, 0, 0, wheel);
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5;
      mesh('lug-nut', new THREE.CylinderGeometry(0.012, 0.012, 0.015, 6).rotateZ(Math.PI / 2), darkRim, outside * 1.45, Math.cos(a) * 0.1, Math.sin(a) * 0.1, wheel);
    }
  };
  const spare = new THREE.Group(); spare.name = 'spare-wheel';
  spare.position.set(0, 1.04, REAR - 0.25); spare.rotation.y = Math.PI / 2; shell.add(spare);
  buildWheel(spare, 0.14);
  // The solid axles show under the lifted body.
  for (const z of [FRONT_AXLE, REAR_AXLE]) {
    mesh('axle', new THREE.CylinderGeometry(0.05, 0.05, 1.4, 12).rotateZ(Math.PI / 2), black, 0, R, z, body);
    mesh('differential', new THREE.SphereGeometry(0.15, 16, 12), black, 0.12, R, z, body).scale.set(1, 0.9, 0.8);
    for (const s of [-1, 1]) {
      const shock = mesh('shock-absorber', new THREE.CylinderGeometry(0.035, 0.035, 0.42, 10), darkRim, s * 0.52, R + 0.27, z + 0.12, body);
      shock.rotation.x = 0.15;
      mesh('coil-spring', new THREE.CylinderGeometry(0.09, 0.09, 0.3, 14, 1, true), black, s * 0.5, R + 0.24, z - 0.12, body);
    }
  }
  const wheels: THREE.Group[] = [];
  for (const [x, z] of [[0.82, FRONT_AXLE], [-0.82, FRONT_AXLE], [0.82, REAR_AXLE], [-0.82, REAR_AXLE]]) {
    const holder = new THREE.Group(); holder.position.set(x, R, z);
    const wheel = new THREE.Group(); holder.add(wheel); wheels.push(holder);
    buildWheel(wheel, Math.sign(x) * 0.14);
  }
  return { body, materials, wheels, height: TOP + HIGH + LIFT, wheelRadius: R };
}
