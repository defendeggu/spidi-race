import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Lightweight T6 California-inspired body, in metres, with its nose along +Z. */
export function buildCamper(color: string, tail: THREE.Material) {
  const body = new THREE.Group();
  const paint = new THREE.MeshPhongMaterial({ color, shininess: 85, specular: '#879097' });
  const trim = new THREE.MeshPhongMaterial({ color: '#161b20', shininess: 25 });
  const glass = new THREE.MeshPhongMaterial({ color: '#152937', shininess: 130, specular: '#93b2c6' });
  const chrome = new THREE.MeshPhongMaterial({ color: '#b5bec5', shininess: 120 });
  const lights = new THREE.MeshBasicMaterial({ color: '#eef5ff' });
  const materials = [paint, trim, glass, chrome, lights];
  const box = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(0.065, w * 0.2, h * 0.2, d * 0.2)), mat);
    mesh.name = name;
    mesh.position.set(x, y, z);
    body.add(mesh);
    return mesh;
  };
  // Extrude a continuous side silhouette with real wheel cutouts and a swept nose.
  const profile = new THREE.Shape();
  profile.moveTo(-2.38, 0.46);
  profile.lineTo(-1.91, 0.46);
  profile.absarc(-1.5, 0.40, 0.415, Math.PI, 0, true);
  profile.lineTo(1.085, 0.40);
  profile.absarc(1.5, 0.40, 0.415, Math.PI, 0, true);
  profile.lineTo(2.36, 0.46);
  profile.quadraticCurveTo(2.46, 0.48, 2.43, 0.82);
  profile.lineTo(2.36, 1.19);
  profile.quadraticCurveTo(2.32, 1.28, 1.93, 1.30);
  profile.lineTo(1.57, 1.83);
  profile.quadraticCurveTo(1.51, 1.94, 1.35, 1.94);
  profile.lineTo(-2.22, 1.94);
  profile.quadraticCurveTo(-2.38, 1.94, -2.39, 1.75);
  profile.lineTo(-2.43, 0.62);
  profile.quadraticCurveTo(-2.43, 0.48, -2.38, 0.46);
  const shell = new THREE.ExtrudeGeometry(profile, { depth: 1.8, steps: 1, curveSegments: 16, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.035, bevelSegments: 3 });
  // Shape coordinates are longitudinal/vertical; taper the cabin towards its roof.
  const positions = shell.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const z = positions.getX(i), y = positions.getY(i);
    const taper = 1 - Math.max(0, y - 1.2) * 0.065;
    positions.setXYZ(i, (positions.getZ(i) - 0.9) * taper, y, z);
  }
  // Swapping X and Z reverses handedness; reverse the non-indexed triangle winding.
  for (let i = 0; i < positions.count; i += 3) {
    const b = new THREE.Vector3().fromBufferAttribute(positions, i + 1);
    const c = new THREE.Vector3().fromBufferAttribute(positions, i + 2);
    positions.setXYZ(i + 1, c.x, c.y, c.z);
    positions.setXYZ(i + 2, b.x, b.y, b.z);
  }
  shell.computeVertexNormals();
  body.add(new THREE.Mesh(shell, paint));
  const seam = (name: string, points: THREE.Vector3[], material = trim, radius = 0.006) => {
    const curve = new THREE.CatmullRomCurve3(points);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, points.length * 4), radius, 5, false), material);
    mesh.name = name;
    body.add(mesh);
  };
  // Sloped front glazing joins the long roof to the short bonnet.
  const windscreen = box('windscreen', 1.64, 0.67, 0.035, 0, 1.59, 1.79, glass);
  windscreen.rotation.x = -0.596;
  for (const side of [-1, 1]) {
    const sideWindow = (name: string, points: number[][]) => {
      const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
      const geometry = new THREE.ShapeGeometry(shape);
      const p = geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const z = p.getX(i), y = p.getY(i);
        p.setXYZ(i, side * (0.957 - Math.max(0, y - 1.2) * 0.062), y, z);
      }
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, glass);
      mesh.name = name;
      body.add(mesh);
    };
    glass.side = THREE.DoubleSide;
    sideWindow('front-side-window', [[0.57, 1.34], [1.80, 1.34], [1.49, 1.83], [0.57, 1.83]]);
    sideWindow('sliding-door-window', [[-0.87, 1.34], [0.47, 1.34], [0.47, 1.83], [-0.87, 1.83]]);
    sideWindow('rear-side-window', [[-2.27, 1.34], [-0.97, 1.34], [-0.97, 1.83], [-2.23, 1.83]]);
    for (const z of [-1.5, 1.5]) {
      const points = Array.from({ length: 25 }, (_, i) => {
        const angle = Math.PI * i / 24;
        return new THREE.Vector3(side * 0.957, 0.40 + Math.sin(angle) * 0.43, z + Math.cos(angle) * 0.43);
      });
      seam('wheel-arch-lip', points, paint, 0.022);
    }
    for (const z of [-0.91, 0.52, 1.91]) seam('door-gap', [new THREE.Vector3(side * 0.955, 0.85, z), new THREE.Vector3(side * 0.955, 1.17, z), new THREE.Vector3(side * 0.949, 1.3, z)]);
    seam('body-crease', [new THREE.Vector3(side * 0.955, 1.14, -2.28), new THREE.Vector3(side * 0.965, 1.14, 0), new THREE.Vector3(side * 0.955, 1.14, 1.9)], paint, 0.012);
    box('side-sill', 0.07, 0.065, 2.1, side * 0.94, 0.45, 0, trim);
    box('door-handle', 0.04, 0.055, 0.22, side * 0.967, 1.19, 0.58, chrome);
    box('sliding-door-handle', 0.04, 0.055, 0.23, side * 0.967, 1.19, 0.23, chrome);
    box('sliding-door-rail', 0.025, 0.025, 1.6, side * 0.96, 1.26, -1.15, trim);
    box('mirror-arm', 0.19, 0.06, 0.07, side * 1.0, 1.35, 1.42, trim);
    box('mirror', 0.18, 0.22, 0.3, side * 1.09, 1.43, 1.42, paint);
    box('headlight-housing', 0.55, 0.21, 0.07, side * 0.61, 1.045, 2.455, trim);
    for (const offset of [-0.12, 0.12]) {
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.025, 20), chrome);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(side * 0.61 + offset, 1.065, 2.50);
      body.add(lens);
    }
    box('daylight-strip', 0.46, 0.025, 0.025, side * 0.61, 0.975, 2.50, lights);
    box('fog-light-recess', 0.25, 0.13, 0.06, side * 0.71, 0.64, 2.49, trim);
    box('fog-light', 0.14, 0.055, 0.025, side * 0.71, 0.64, 2.527, lights);
    box('tail-light', 0.2, 0.42, 0.04, side * 0.79, 1.11, -2.445, tail);
    box('reverse-light', 0.18, 0.055, 0.025, side * 0.79, 1.05, -2.471, lights);
  }
  const bonnet = box('bonnet', 1.77, 0.045, 0.49, 0, 1.29, 2.13, paint);
  bonnet.rotation.x = 0.09;
  box('rear-window', 1.62, 0.49, 0.035, 0, 1.59, -2.446, glass);
  box('rear-wiper', 0.52, 0.025, 0.025, 0.12, 1.38, -2.472, trim);
  box('tailgate-handle', 0.3, 0.045, 0.035, 0, 1.16, -2.475, chrome);
  box('high-brake-light', 0.48, 0.045, 0.035, 0, 1.89, -2.43, tail);
  for (const z of [-2.487, 2.49]) {
    box('plate-frame', 0.55, 0.14, 0.025, 0, 0.74, z, trim);
    box('number-plate', 0.49, 0.105, 0.028, 0, 0.74, z + Math.sign(z) * 0.017, lights);
  }
  for (const x of [-0.42, 0.32]) {
    const wiper = box('windscreen-wiper', 0.55, 0.025, 0.025, x, 1.36, 1.94, trim);
    wiper.rotation.z = -0.08;
  }
  box('roof-seal', 1.87, 0.035, 4.01, 0, 1.915, -0.4, trim);
  box('closed-pop-top', 1.85, 0.105, 4.02, 0, 1.985, -0.4, paint);
  box('awning-case', 0.12, 0.12, 3.25, -0.98, 1.91, -0.4, trim);
  box('front-grille', 0.85, 0.23, 0.035, 0, 1.02, 2.445, trim);
  for (const y of [0.96, 1.05]) box('grille-bar', 0.86, 0.022, 0.02, 0, y, 2.47, chrome);
  for (const z of [-2.45, 2.45]) box('bumper', 1.86, 0.19, 0.1, 0, 0.61, z, trim);
  box('lower-grille', 1.15, 0.12, 0.04, 0, 0.76, 2.445, trim);
  // A geometric VW monogram avoids textures and remains crisp at close range.
  const badge = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.012, 6, 24), chrome);
  badge.position.set(0, 1.04, 2.49);
  body.add(badge);
  const stroke = (ax: number, ay: number, bx: number, by: number) => {
    const line = box('badge-stroke', 0.012, Math.hypot(bx - ax, by - ay), 0.014, (ax + bx) / 2, 1.04 + (ay + by) / 2, 2.495, chrome);
    line.rotation.z = -Math.atan2(bx - ax, by - ay);
  };
  stroke(-0.04, 0.06, 0, 0); stroke(0, 0, 0.04, 0.06);
  stroke(-0.065, 0.015, -0.035, -0.06); stroke(-0.035, -0.06, 0, -0.01);
  stroke(0, -0.01, 0.035, -0.06); stroke(0.035, -0.06, 0.065, 0.015);
  return { body, materials, height: 2.04 };
}
