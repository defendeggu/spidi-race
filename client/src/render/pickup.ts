import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Double-cab Hilux-inspired pickup. All dimensions are metres; +Z is forward. */
export function buildPickup(color: string, tail: THREE.Material) {
  const body = new THREE.Group();
  const paint = new THREE.MeshPhongMaterial({ color, shininess: 95, specular: '#cbd3da' });
  const black = new THREE.MeshPhongMaterial({ color: '#11161a', shininess: 35 });
  const rubber = new THREE.MeshPhongMaterial({ color: '#16191b', shininess: 8 });
  const steel = new THREE.MeshPhongMaterial({ color: '#242a2e', shininess: 100 });
  const silver = new THREE.MeshPhongMaterial({ color: '#abb5bc', shininess: 120 });
  const glass = new THREE.MeshPhongMaterial({ color: '#233e4b', specular: '#bdddeb', shininess: 150, side: THREE.DoubleSide });
  const lamp = new THREE.MeshPhongMaterial({ color: '#e2e9e9', emissive: '#333b3f', shininess: 150 });
  const materials = [paint, black, rubber, steel, silver, glass, lamp];
  const mesh = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, parent = body) => {
    const m = new THREE.Mesh(geometry, material);
    m.name = name; m.position.set(x, y, z); parent.add(m); return m;
  };
  const box = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material = paint, r = 0.055) =>
    mesh(name, new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 3, h / 3, d / 3)), mat, x, y, z);
  const line = (name: string, points: number[][], mat = black, radius = 0.007) =>
    mesh(name, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), points.length * 6, radius, 6, false), mat);
  // Bevelled longitudinal panels with actual semicircular wheel openings.
  for (const side of [-1, 1]) {
    const panel = new THREE.Shape();
    panel.moveTo(-2.57, 0.60); panel.lineTo(-2.12, 0.60);
    panel.absarc(-1.55, 0.48, 0.57, Math.PI, 0, true);
    panel.lineTo(1.045, 0.48); panel.absarc(1.60, 0.48, 0.555, Math.PI, 0, true);
    panel.lineTo(2.57, 0.62); panel.quadraticCurveTo(2.67, 0.67, 2.58, 1.10);
    panel.quadraticCurveTo(2.48, 1.30, 2.26, 1.33);
    panel.lineTo(1.14, 1.39); panel.lineTo(-0.76, 1.34); panel.lineTo(-2.52, 1.32);
    panel.quadraticCurveTo(-2.64, 1.22, -2.57, 0.60);
    const geo = new THREE.ExtrudeGeometry(panel, { depth: 0.14, bevelEnabled: true, bevelSize: 0.045, bevelThickness: 0.045, bevelSegments: 4, curveSegments: 20 });
    geo.rotateY(-Math.PI / 2);
    mesh('sculpted-side-panel', geo, paint, side > 0 ? 1.0 : -0.86);
    for (const z of [-1.55, 1.60]) {
      const points = Array.from({ length: 29 }, (_, i) => {
        const a = Math.PI * i / 28;
        return [side * 1.015, 0.48 + Math.sin(a) * 0.575, z + Math.cos(a) * 0.575];
      });
      line('flared-wheel-arch', points, paint, 0.045);
    }
    box('running-board', 0.18, 0.085, 2.07, side * 1.02, 0.46, -0.04, black);
    for (const z of [-0.84, 0.22]) {
      line('door-seam', [[side * 1.048, 0.65, z], [side * 1.048, 0.95, z], [side * 1.04, 1.32, z]], black, 0.004);
      box('door-handle-recess', 0.025, 0.065, 0.22, side * 1.047, 1.23, z + 0.17, silver);
      box('door-handle', 0.042, 0.035, 0.20, side * 1.065, 1.245, z + 0.17);
    }
    box('mirror-stalk', 0.16, 0.07, 0.12, side * 0.99, 1.43, 1.02, black);
    box('mirror-shell', 0.25, 0.20, 0.35, side * 1.11, 1.51, 1.01, black, 0.085);
    box('mirror-glass', 0.20, 0.135, 0.012, side * 1.12, 1.52, 0.832, silver);
    box('rear-lamp', 0.20, 0.38, 0.09, side * 0.86, 1.08, -2.59, tail);
    box('reverse-lamp', 0.18, 0.08, 0.02, side * 0.86, 1.07, -2.642, lamp);
    box('mudflap', 0.26, 0.26, 0.04, side * 0.91, 0.37, -2.12, rubber);
  }
  // A sloped, tapered cabin shell gives the roof and pillars a continuous contour.
  const cabinProfile = new THREE.Shape();
  cabinProfile.moveTo(-0.89, 1.29); cabinProfile.lineTo(1.36, 1.31);
  cabinProfile.lineTo(0.66, 1.93); cabinProfile.quadraticCurveTo(0.58, 2.01, 0.42, 2.01);
  cabinProfile.lineTo(-0.62, 1.99); cabinProfile.quadraticCurveTo(-0.76, 1.97, -0.79, 1.83);
  cabinProfile.closePath();
  const cabinGeo = new THREE.ExtrudeGeometry(cabinProfile, { depth: 1.79, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.035, bevelSegments: 4, curveSegments: 12 });
  cabinGeo.rotateY(-Math.PI / 2); cabinGeo.translate(0.895, 0, 0);
  const cp = cabinGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) cp.setX(i, cp.getX(i) * (1 - Math.max(0, cp.getY(i) - 1.3) * 0.14));
  cabinGeo.computeVertexNormals(); mesh('double-cab', cabinGeo, paint);
  const window = (name: string, vertices: number[][]) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flat(), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]); geo.computeVertexNormals(); mesh(name, geo, glass);
  };
  for (const s of [-1, 1]) {
    const point = (z: number, y: number) => [s * (0.94 - (y - 1.3) * 0.13), y, z];
    window('front-door-window', [point(0.27, 1.42), point(1.17, 1.42), point(0.60, 1.92), point(0.27, 1.92)]);
    window('rear-door-window', [point(-0.71, 1.42), point(0.15, 1.42), point(0.15, 1.92), point(-0.62, 1.90)]);
    line('b-pillar', [point(0.21, 1.44), point(0.21, 1.90)], black, 0.028);
  }
  window('windscreen', [[-0.83, 1.42, 1.29], [0.83, 1.42, 1.29], [0.76, 1.93, 0.72], [-0.76, 1.93, 0.72]]);
  window('rear-window', [[0.80, 1.44, -0.9], [-0.80, 1.44, -0.9], [-0.74, 1.86, -0.827], [0.74, 1.86, -0.827]]);
  const hood = box('bonnet', 1.82, 0.13, 1.21, 0, 1.34, 1.91, paint, 0.06);
  hood.rotation.x = 0.055;
  for (const s of [-1, 1]) {
    line('bonnet-crease', [[s * 0.60, 1.411, 1.35], [s * 0.64, 1.397, 1.95], [s * 0.71, 1.365, 2.43]], paint, 0.012);
    line('wiper', [[s * 0.12, 1.46, 1.265], [s * 0.65, 1.47, 1.255]], black, 0.012);
  }
  // An open bed with an inset ribbed liner, wheel tubs and separate tailgate.
  box('bed-floor', 1.72, 0.12, 1.61, 0, 0.88, -1.71, black);
  box('bed-front', 1.76, 0.46, 0.10, 0, 1.10, -0.96);
  box('tailgate', 1.76, 0.52, 0.14, 0, 1.07, -2.55);
  for (const s of [-1, 1]) {
    box('bed-rail-cap', 0.16, 0.04, 1.65, s * 0.94, 1.36, -1.73, black);
    box('bed-wheel-tub', 0.28, 0.25, 0.85, s * 0.72, 1.01, -1.55, black, 0.08);
    box('inner-bed-wall', 0.035, 0.40, 1.50, s * 0.85, 1.12, -1.72, black);
  }
  for (let x = -0.6; x <= 0.6; x += 0.12) box('bed-rib', 0.022, 0.015, 1.42, x, 0.948, -1.72, steel);
  box('tailgate-handle', 0.29, 0.08, 0.025, 0, 1.24, -2.632, black);
  box('rear-bumper', 1.91, 0.16, 0.22, 0, 0.68, -2.60, silver);
  // Broad black trapezoid grille, framed by swept rectangular lamp clusters.
  box('front-bumper', 1.96, 0.33, 0.29, 0, 0.74, 2.47, paint, 0.10);
  const grilleShape = new THREE.Shape();
  grilleShape.moveTo(-0.56, 1.35); grilleShape.lineTo(0.56, 1.35); grilleShape.lineTo(0.66, 1.09);
  grilleShape.quadraticCurveTo(0.69, 0.91, 0.48, 0.86); grilleShape.lineTo(-0.48, 0.86);
  grilleShape.quadraticCurveTo(-0.69, 0.91, -0.66, 1.09); grilleShape.closePath();
  mesh('grille-surround', new THREE.ExtrudeGeometry(grilleShape, {depth:0.035, bevelEnabled:true, bevelThickness:0.015, bevelSize:0.025, bevelSegments:3}), black, 0, 0, 2.61);
  for (const y of [0.95, 1.04, 1.14, 1.24]) box('grille-slat', 1.05, 0.025, 0.03, 0, y, 2.675, steel);
  for (const s of [-1, 1]) {
    box('headlight-housing', 0.45, 0.22, 0.09, s * 0.77, 1.24, 2.57, silver);
    for (const dx of [-0.11, 0.11]) {
      const lens = mesh('projector-lens', new THREE.CylinderGeometry(0.075, 0.06, 0.03, 24), lamp, s * 0.77 + dx, 1.25, 2.627);
      lens.rotation.x = Math.PI / 2;
    }
    box('headlight-brow', 0.47, 0.035, 0.06, s * 0.77, 1.36, 2.60, black);
    box('fog-trim', 0.10, 0.26, 0.05, s * 0.81, 0.86, 2.63, black);
    box('fog-recess', 0.23, 0.09, 0.055, s * 0.75, 0.75, 2.64, black);
    box('fog-lamp', 0.11, 0.04, 0.025, s * 0.73, 0.76, 2.677, lamp);
  }
  box('skid-plate', 1.13, 0.12, 0.12, 0, 0.60, 2.56, silver);
  box('front-plate', 0.47, 0.11, 0.025, 0, 0.74, 2.635, black);
  const emblem = (rx: number, ry: number, x: number, y: number) => {
    const ring = mesh('toyota-emblem', new THREE.TorusGeometry(1, 0.065, 6, 32), silver, x, y, 2.715);
    ring.scale.set(rx, ry, 0.12);
  };
  emblem(0.115, 0.078, 0, 1.22); emblem(0.043, 0.073, 0, 1.22); emblem(0.092, 0.029, 0, 1.25);
  const wheels: THREE.Group[] = [];
  for (const [x, z] of [[0.95, 1.6], [-0.95, 1.6], [0.95, -1.55], [-0.95, -1.55]]) {
    const holder = new THREE.Group(); holder.position.set(x, 0.43, z);
    const wheel = new THREE.Group(); holder.add(wheel); wheels.push(holder);
    const tyre = mesh('all-terrain-tyre', new THREE.TorusGeometry(0.31, 0.12, 16, 48), rubber, 0, 0, 0, wheel);
    tyre.rotation.y = Math.PI / 2;
    for (let i = 0; i < 40; i++) {
      const a = i * Math.PI / 20;
      const tread = mesh('tread-block', new THREE.BoxGeometry(0.16, 0.015, 0.032), rubber, 0, Math.cos(a) * 0.425, Math.sin(a) * 0.425, wheel);
      tread.rotation.x = a;
    }
    const outside = Math.sign(x) * 0.13;
    mesh('steel-wheel', new THREE.CylinderGeometry(0.245, 0.245, 0.035, 40).rotateZ(Math.PI / 2), steel, outside, 0, 0, wheel);
    const lip = mesh('rim-lip', new THREE.TorusGeometry(0.238, 0.012, 8, 40), steel, outside * 1.15, 0, 0, wheel); lip.rotation.y = Math.PI / 2;
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 5;
      mesh('rim-vent', new THREE.CylinderGeometry(0.026, 0.026, 0.008, 12).rotateZ(Math.PI / 2), black, outside * 1.18, Math.cos(a) * 0.18, Math.sin(a) * 0.18, wheel);
    }
    mesh('hub', new THREE.CylinderGeometry(0.085, 0.085, 0.065, 24).rotateZ(Math.PI / 2), steel, outside * 1.18, 0, 0, wheel);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      mesh('lug-nut', new THREE.CylinderGeometry(0.012, 0.012, 0.015, 6).rotateZ(Math.PI / 2), silver, outside * 1.40, Math.cos(a) * 0.11, Math.sin(a) * 0.11, wheel);
    }
  }
  return { body, materials, wheels, height: 2.05, wheelRadius: 0.43 };
}
