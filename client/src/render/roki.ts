import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * Roki: lifted, boxy long-wheelbase station-wagon off-roader with a white roof, a snorkel, black
 * wheels and a black spare wheel on the rear door. All dimensions are metres; +Z is forward.
 */
export function buildRoki(color: string, tail: THREE.Material) {
  const body = new THREE.Group();
  // Raised suspension: the whole shell sits higher above the axles.
  const LIFT = 0.18;
  const shell = new THREE.Group(); shell.position.y = LIFT; body.add(shell);
  const paint = new THREE.MeshPhongMaterial({ color, shininess: 80, specular: '#d8c8c8' });
  const roof = new THREE.MeshPhongMaterial({ color: '#f3f3ee', shininess: 70, specular: '#ffffff' });
  const black = new THREE.MeshPhongMaterial({ color: '#15181a', shininess: 25 });
  const rubber = new THREE.MeshPhongMaterial({ color: '#141617', shininess: 8 });
  const rim = new THREE.MeshPhongMaterial({ color: '#1c1f21', shininess: 70 });
  const darkRim = new THREE.MeshPhongMaterial({ color: '#23272a', shininess: 60 });
  const silver = new THREE.MeshPhongMaterial({ color: '#aab3b9', shininess: 120 });
  const glass = new THREE.MeshPhongMaterial({ color: '#22394a', specular: '#bdddeb', shininess: 150, side: THREE.DoubleSide });
  const lamp = new THREE.MeshPhongMaterial({ color: '#e8eeee', emissive: '#3a4246', shininess: 150 });
  const amber = new THREE.MeshPhongMaterial({ color: '#f08a12', emissive: '#4a2200', shininess: 120 });
  const materials = [paint, roof, black, rubber, rim, darkRim, silver, glass, lamp, amber];
  const mesh = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = shell) => {
    const m = new THREE.Mesh(geometry, material);
    m.name = name; m.position.set(x, y, z); parent.add(m); return m;
  };
  const box = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material = paint, r = 0.03) =>
    mesh(name, new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 3, h / 3, d / 3)), mat, x, y, z);
  const disc = (name: string, r: number, depth: number, mat: THREE.Material, x: number, y: number, z: number) =>
    mesh(name, new THREE.CylinderGeometry(r, r, depth, 28).rotateX(Math.PI / 2), mat, x, y, z);
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
  // Lower body: one slab from the flat front panel to the rear door, with square-topped wheel openings.
  const lower = new THREE.Shape();
  lower.moveTo(REAR, SILL); lower.lineTo(REAR_AXLE - ARCH, SILL);
  lower.absarc(REAR_AXLE, SILL, ARCH, Math.PI, 0, true);
  lower.lineTo(FRONT_AXLE - ARCH, SILL);
  lower.absarc(FRONT_AXLE, SILL, ARCH, Math.PI, 0, true);
  lower.lineTo(FRONT, SILL); lower.lineTo(FRONT, WAIST); lower.lineTo(REAR, WAIST); lower.closePath();
  mesh('lower-body', across(lower, HW * 2, HW), paint);
  for (const z of [FRONT_AXLE, REAR_AXLE]) {
    box('wheel-well', 1.2, 0.44, ARCH * 1.8, 0, 0.8, z, black);
    // Wide, flat black arch extensions.
    const flare = new THREE.Shape();
    flare.absarc(z, SILL, ARCH + 0.1, Math.PI, 0, true);
    flare.lineTo(z + ARCH, SILL);
    flare.absarc(z, SILL, ARCH, 0, Math.PI, false);
    flare.closePath();
    for (const s of [-1, 1]) mesh('arch-flare', across(flare, 0.09, s > 0 ? HW + 0.1 : -HW - 0.01, 0.015), black);
  }
  box('chassis', 0.92, 0.16, 4.1, 0, 0.42, -0.1, black);
  // Flat wings either side of a slightly raised bonnet.
  box('bonnet', 1.12, 0.07, 1.06, 0, WAIST + 0.025, 1.5, paint, 0.025);
  for (const s of [-1, 1]) {
    box('sill', 0.14, 0.09, 1.72, s * (HW - 0.02), SILL - 0.04, -0.15, black);
    box('mirror-arm', 0.18, 0.04, 0.04, s * 0.97, 1.42, 0.84, black, 0.015);
    box('mirror', 0.06, 0.22, 0.17, s * 1.06, 1.5, 0.84, black, 0.03);
  }
  // Snorkel on the right wing, up the windscreen pillar to an intake above the roof line.
  const snorkel = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-HW + 0.02, 1.08, 1.3), new THREE.Vector3(-HW - 0.07, 1.1, 1.18), new THREE.Vector3(-HW - 0.08, 1.2, 1.04),
    new THREE.Vector3(-HW - 0.06, 1.6, pillarZ(0.99, 1.6)), new THREE.Vector3(-HW - 0.04, 2.02, pillarZ(0.97, 2.02)),
  ], false, 'catmullrom', 0.2);
  mesh('snorkel', new THREE.TubeGeometry(snorkel, 32, 0.05, 12, false), black);
  box('snorkel-head', 0.13, 0.13, 0.2, -HW - 0.04, 2.06, pillarZ(1.0, 2.02), black, 0.04);
  box('snorkel-intake', 0.1, 0.08, 0.02, -HW - 0.04, 2.06, pillarZ(1.105, 2.02), darkRim, 0.01);
  for (const y of [1.45, 1.8]) box('snorkel-bracket', 0.08, 0.03, 0.05, -HW - 0.01, y, pillarZ(0.96, y), black, 0.01);
  box('wing-vent', 0.02, 0.14, 0.3, HW + 0.025, 1.1, 1.62, black, 0.01);

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
    for (const z of [0.0, -0.86]) box('door-handle', 0.03, 0.04, 0.16, s * (sideX(1.32) + 0.005), 1.32, z + 0.06, silver, 0.012);
  }
  const screen = (y: number) => pillarZ(CAB_FRONT + 0.03, y);
  quad('windscreen', [[-0.74, 1.33, screen(1.33)], [0.74, 1.33, screen(1.33)], [0.7, 1.83, screen(1.83)], [-0.7, 1.83, screen(1.83)]]);
  box('windscreen-centre-bar', 0.04, 0.5, 0.02, 0, 1.58, screen(1.58) + 0.005, black, 0.01).rotation.x = -Math.atan(RAKE);
  for (const s of [-1, 1]) {
    const wiper = mesh('wiper', new THREE.BoxGeometry(0.55, 0.018, 0.02), black, s * 0.32, 1.38, screen(1.38) + 0.02);
    wiper.rotation.z = s * 0.25;
  }
  // White roof with the little roof-edge windows at the back.
  const roofFront = pillarZ(CAB_FRONT, TOP) + 0.04;
  box('roof', TOP_HW * 2 + 0.1, 0.1, roofFront - REAR + 0.04, 0, TOP + 0.04, (roofFront + REAR - 0.04) / 2, roof, 0.04);
  for (const s of [-1, 1]) {
    for (const z of [-0.6, -1.35]) {
      const pane = box('roof-edge-window', 0.02, 0.07, 0.6, s * (TOP_HW + 0.045), TOP + 0.03, z, glass, 0.008);
      pane.rotation.z = s * -0.5;
    }
  }

  // Front: black grille panel between round headlamps, black bumper.
  box('grille', 1.1, 0.42, 0.04, 0, 1.0, FRONT + 0.02, darkRim, 0.015);
  for (let y = 0.84; y <= 1.17; y += 0.065) box('grille-slat', 1.02, 0.022, 0.03, 0, y, FRONT + 0.045, black, 0.006);
  for (const s of [-1, 1]) {
    disc('headlamp-bezel', 0.13, 0.05, black, s * 0.71, 1.02, FRONT + 0.02);
    disc('headlamp', 0.1, 0.04, lamp, s * 0.71, 1.02, FRONT + 0.04);
    disc('indicator', 0.04, 0.03, amber, s * 0.66, 0.79, FRONT + 0.04);
    disc('side-lamp', 0.035, 0.03, lamp, s * 0.77, 0.79, FRONT + 0.04);
    box('tow-eye', 0.06, 0.06, 0.1, s * 0.42, 0.42, FRONT + 0.12, black, 0.01);
  }
  box('front-bumper', 1.84, 0.2, 0.22, 0, 0.53, FRONT + 0.1, black, 0.02);
  box('front-plate', 0.5, 0.11, 0.02, 0, 0.53, FRONT + 0.22, roof, 0.008);

  // Rear: window in the side-hinged door, light clusters low in the corners, black spare wheel.
  // Three rear windows: a big one in the door, a small one either side.
  const rearPane = (name: string, x0: number, x1: number, y0: number, y1: number) =>
    quad(name, [[x1, y0, REAR - 0.035], [x0, y0, REAR - 0.035], [x0, y1, REAR - 0.035], [x1, y1, REAR - 0.035]]);
  rearPane('rear-window', -0.4, 0.4, 1.4, 1.82);
  for (const s of [-1, 1]) rearPane('rear-corner-window', s > 0 ? 0.55 : -0.75, s > 0 ? 0.75 : -0.55, 1.46, 1.8);
  for (const s of [-1, 1]) {
    box('tail-lamp', 0.12, 0.11, 0.04, s * 0.74, 0.86, REAR - 0.02, tail, 0.01);
    box('rear-indicator', 0.12, 0.08, 0.04, s * 0.74, 0.96, REAR - 0.02, amber, 0.01);
    box('reverse-lamp', 0.12, 0.07, 0.04, s * 0.74, 0.75, REAR - 0.02, lamp, 0.01);
    box('door-hinge', 0.04, 0.1, 0.05, -0.8, s > 0 ? 1.55 : 0.85, REAR - 0.02, black, 0.01);
  }
  box('rear-door-handle', 0.14, 0.04, 0.03, 0.55, 1.3, REAR - 0.03, silver, 0.01);
  box('rear-bumper', 1.7, 0.14, 0.18, 0, 0.5, REAR - 0.06, black, 0.02);
  box('tow-hitch', 0.1, 0.1, 0.22, 0, 0.44, REAR - 0.2, black, 0.02);
  box('spare-bracket', 0.3, 0.3, 0.1, 0, 1.0, REAR - 0.05, black, 0.02);
  const spare = new THREE.Group(); spare.name = 'spare-wheel'; spare.position.set(0, 0.98, REAR - 0.23); shell.add(spare);
  mesh('spare-tyre', new THREE.TorusGeometry(0.29, 0.12, 14, 40), rubber, 0, 0, 0, spare);
  mesh('spare-rim', new THREE.CylinderGeometry(0.21, 0.21, 0.13, 32).rotateX(Math.PI / 2), darkRim, 0, 0, 0, spare);
  mesh('spare-hub', new THREE.CylinderGeometry(0.07, 0.07, 0.15, 20).rotateX(Math.PI / 2), black, 0, 0, -0.01, spare);
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    mesh('spare-nut', new THREE.CylinderGeometry(0.014, 0.014, 0.16, 6).rotateX(Math.PI / 2), silver, Math.cos(a) * 0.11, Math.sin(a) * 0.11, -0.01, spare);
  }
  for (let i = 0; i < 30; i++) {
    const a = i * Math.PI / 15;
    const lug = mesh('spare-tread', new THREE.BoxGeometry(0.04, 0.03, 0.19), rubber, Math.cos(a) * 0.405, Math.sin(a) * 0.405, 0, spare);
    lug.rotation.z = a;
  }

  // Chunky all-terrain tyres on black steel wheels, with the solid axles showing under the lifted body.
  const R = 0.47;
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
    const tyre = mesh('all-terrain-tyre', new THREE.TorusGeometry(0.33, 0.135, 16, 48), rubber, 0, 0, 0, wheel);
    tyre.rotation.y = Math.PI / 2;
    for (let i = 0; i < 36; i++) {
      const a = i * Math.PI / 18;
      const tread = mesh('tread-block', new THREE.BoxGeometry(0.26, 0.035, 0.05), rubber, 0, Math.cos(a) * (R - 0.01), Math.sin(a) * (R - 0.01), wheel);
      tread.rotation.x = a;
    }
    const outside = Math.sign(x) * 0.14;
    mesh('steel-wheel', new THREE.CylinderGeometry(0.24, 0.24, 0.04, 36).rotateZ(Math.PI / 2), rim, outside, 0, 0, wheel);
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5 + 0.3;
      mesh('rim-hole', new THREE.CylinderGeometry(0.03, 0.03, 0.01, 12).rotateZ(Math.PI / 2), rubber, outside * 1.2, Math.cos(a) * 0.17, Math.sin(a) * 0.17, wheel);
    }
    mesh('hub', new THREE.CylinderGeometry(0.075, 0.075, 0.07, 20).rotateZ(Math.PI / 2), darkRim, outside * 1.2, 0, 0, wheel);
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5;
      mesh('lug-nut', new THREE.CylinderGeometry(0.012, 0.012, 0.015, 6).rotateZ(Math.PI / 2), silver, outside * 1.45, Math.cos(a) * 0.1, Math.sin(a) * 0.1, wheel);
    }
  }
  return { body, materials, wheels, height: 2.0 + LIFT, wheelRadius: R };
}
