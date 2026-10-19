import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Lightweight Aventador-inspired wedge body, facing +Z. */
export function buildAventador(color: string, tail: THREE.Material) {
  const body = new THREE.Group();
  const paint = new THREE.MeshPhongMaterial({ color, shininess: 110, specular: '#cfbda8', side: THREE.DoubleSide });
  const carbon = new THREE.MeshPhongMaterial({ color: '#121619', shininess: 45, side: THREE.DoubleSide });
  const glass = new THREE.MeshPhongMaterial({ color: '#152a35', shininess: 160, specular: '#abc9dc', side: THREE.DoubleSide });
  const tyreMat = new THREE.MeshPhongMaterial({ color: '#18191b', shininess: 12 });
  const alloy = new THREE.MeshPhongMaterial({ color: '#424b52', shininess: 130 });
  const metal = new THREE.MeshPhongMaterial({ color: '#929ca3', shininess: 100 });
  const red = new THREE.MeshPhongMaterial({ color: '#c91d19', shininess: 50 });
  const led = new THREE.MeshBasicMaterial({ color: '#effaff' });
  const gold = new THREE.MeshPhongMaterial({ color: '#d7af54', shininess: 100, side: THREE.DoubleSide });
  const materials = [paint, carbon, glass, tyreMat, alloy, metal, red, led, gold];
  const add = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, parent = body) => {
    const m = new THREE.Mesh(geometry, material);
    m.name = name; m.position.set(x, y, z); parent.add(m); return m;
  };
  const box = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material = paint) =>
    add(name, new RoundedBoxGeometry(w, h, d, 2, Math.min(0.035, w / 4, h / 4, d / 4)), mat, x, y, z);
  const face = (name: string, points: number[][], mat: THREE.Material = paint) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    const indices: number[] = [];
    for (let i = 1; i < points.length - 1; i++) indices.push(0, i, i + 1);
    geo.setIndex(indices); geo.computeVertexNormals(); return add(name, geo, mat);
  };
  const line = (name: string, points: number[][], mat: THREE.Material, radius = 0.012) => {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    return add(name, new THREE.TubeGeometry(curve, points.length * 5, radius, 6, false), mat);
  };
  // Continuous side silhouette: low nose, high rear haunches and wheel tunnels.
  const outline = new THREE.Shape();
  outline.moveTo(-2.32, 0.27); outline.lineTo(-1.75, 0.27);
  outline.absarc(-1.35, 0.35, 0.405, Math.PI, 0, true);
  outline.lineTo(0.945, 0.35); outline.absarc(1.35, 0.35, 0.405, Math.PI, 0, true);
  outline.lineTo(2.35, 0.28); outline.lineTo(2.38, 0.49);
  outline.quadraticCurveTo(2.25, 0.59, 1.75, 0.72);
  outline.lineTo(1.35, 0.79); outline.lineTo(0.7, 0.77); outline.lineTo(-0.7, 0.82);
  outline.quadraticCurveTo(-1.35, 0.96, -1.8, 0.87); outline.lineTo(-2.32, 0.76); outline.closePath();
  const shell = new THREE.ExtrudeGeometry(outline, {depth:1.88, bevelEnabled:true, bevelSize:0.025, bevelThickness:0.035, bevelSegments:3, curveSegments:20});
  shell.rotateY(-Math.PI / 2); shell.translate(0.94, 0, 0);
  const p = shell.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    const width = z > 1.7 ? 1 - (z - 1.7) * 0.18 : z < -0.8 ? 1.035 : 0.99;
    p.setX(i, p.getX(i) * width);
  }
  shell.computeVertexNormals(); add('sculpted-body', shell, paint);
  // A low trapezoid greenhouse; the coloured pillars frame inset glazing.
  face('windscreen-frame', [[-0.85,0.79,0.99],[0.85,0.79,0.99],[0.66,1.18,0.16],[-0.66,1.18,0.16]]);
  face('windscreen', [[-0.77,0.825,0.94],[0.77,0.825,0.94],[0.61,1.16,0.22],[-0.61,1.16,0.22]], glass);
  face('roof', [[-0.66,1.18,0.16],[0.66,1.18,0.16],[0.67,1.17,-0.81],[-0.67,1.17,-0.81]]);
  face('rear-glass-frame', [[-0.67,1.17,-0.81],[0.67,1.17,-0.81],[0.82,0.87,-1.35],[-0.82,0.87,-1.35]]);
  face('rear-glass', [[-0.58,1.143,-0.87],[0.58,1.143,-0.87],[0.69,0.90,-1.30],[-0.69,0.90,-1.30]], glass);
  for (const s of [-1, 1]) {
    face('cabin-side', [[s*0.85,0.79,0.99],[s*0.66,1.18,0.16],[s*0.67,1.17,-0.81],[s*0.87,0.84,-1.24]]);
    face('side-window', [[s*0.827,0.83,0.83],[s*0.686,1.14,0.13],[s*0.696,1.13,-0.69],[s*0.842,0.87,-1.08]], glass);
    face('side-intake', [[s*1.015,0.78,-0.67],[s*1.02,0.80,-1.04],[s*0.985,0.39,-0.85],[s*0.985,0.39,-0.25]], carbon);
    face('intake-blade', [[s*1.035,0.80,-1.02],[s*1.04,0.78,-0.89],[s*1.01,0.39,-0.51],[s*0.99,0.39,-0.85]]);
    line('door-seam', [[s*0.97,0.77,0.73],[s*0.975,0.45,0.58],[s*0.975,0.35,-0.31]], carbon, 0.004);
    box('flush-door-handle',0.018,0.025,0.16,s*0.978,0.77,-0.38,carbon);
    box('side-skirt',0.16,0.075,1.87,s*0.98,0.25,-0.04,carbon);
    line('mirror-stalk', [[s*0.80,0.88,0.66],[s*1.00,0.94,0.63]],carbon,0.025);
    box('mirror',0.22,0.09,0.29,s*1.09,0.96,0.61,carbon);
    box('mirror-glass',0.17,0.065,0.015,s*1.09,0.96,0.458,metal);
    // Lights lie on the sloping bonnet, with a three-branch LED signature.
    face('headlight-pocket', [[s*0.49,0.685,2.03],[s*0.85,0.665,2.05],[s*0.88,0.802,1.55],[s*0.67,0.808,1.49]],carbon);
    const center = [s*0.72,0.755,1.80];
    line('y-led', [[s*0.60,0.70,1.99],center,[s*0.83,0.795,1.63]],led,0.014);
    line('y-led-branch', [center,[s*0.70,0.804,1.58]],led,0.014);
    face('front-intake', [[s*0.36,0.30,2.425],[s*0.87,0.30,2.39],[s*0.82,0.49,2.41],[s*0.49,0.49,2.445]],carbon);
    for (let i = 0; i < 4; i++) box('front-intake-fin',0.014,0.13,0.04,s*(0.49+i*0.085),0.39,2.408,alloy);
    face('rear-light-housing', [[s*0.23,0.73,-2.354],[s*0.93,0.73,-2.354],[s*0.93,0.59,-2.354],[s*0.23,0.59,-2.354]],carbon);
    for (let i = 0; i < 3; i++) {
      const x = s*(0.36+i*0.21);
      line('rear-y-light', [[x-s*0.065,0.70,-2.365],[x,0.655,-2.365],[x+s*0.065,0.70,-2.365]],tail,0.012);
      line('rear-y-light-stem', [[x,0.655,-2.365],[x,0.615,-2.365]],tail,0.012);
    }
    line('bonnet-fold', [[s*0.12,0.58,2.27],[s*0.39,0.705,1.64],[s*0.48,0.79,1.01]],paint,0.009);
  }
  face('front-splitter', [[-0.90,0.235,2.39],[0.90,0.235,2.39],[0.99,0.235,1.95],[-0.99,0.235,1.95]],carbon);
  box('center-nose-inlet',0.42,0.08,0.035,0,0.34,2.417,carbon);
  face('nose-badge', [[-0.035,0.605,2.18],[0.035,0.605,2.18],[0.025,0.592,2.24],[0,0.586,2.27],[-0.025,0.592,2.24]],gold);
  box('engine-cover',1.15,0.045,0.64,0,0.92,-1.69,carbon);
  for (let i = 0; i < 5; i++) box('engine-louvre',1.08,0.025,0.055,0,0.953,-1.42-i*0.12,alloy);
  box('rear-grille',1.75,0.12,0.035,0,0.51,-2.354,carbon);
  box('diffuser',1.72,0.16,0.30,0,0.29,-2.27,carbon);
  for (const x of [-0.72,-0.43,0.43,0.72]) box('diffuser-fin',0.025,0.19,0.40,x,0.26,-2.27,carbon);
  box('exhaust-surround',0.47,0.15,0.13,0,0.40,-2.40,metal);
  box('exhaust-outlet',0.39,0.105,0.02,0,0.40,-2.475,carbon);
  box('rear-lip',1.78,0.045,0.16,0,0.80,-2.27,paint);
  const wheels: THREE.Group[] = [];
  for (const [x,z] of [[0.91,1.35],[-0.91,1.35],[0.95,-1.35],[-0.95,-1.35]]) {
    const holder = new THREE.Group(); holder.position.set(x,0.35,z);
    const wheel = new THREE.Group(); holder.add(wheel); wheels.push(holder);
    const tyre = add('low-profile-tyre',new THREE.TorusGeometry(0.275,0.075,12,48),tyreMat,0,0,0,wheel);
    tyre.rotation.y = Math.PI/2;
    const outside = Math.sign(x)*0.092;
    add('brake-disc',new THREE.CylinderGeometry(0.22,0.22,0.025,32).rotateZ(Math.PI/2),metal,outside*0.6,0,0,wheel);
    // The caliper stays fixed to the wheel holder instead of rotating with the rim.
    add('brake-caliper',new THREE.BoxGeometry(0.05,0.15,0.065),red,outside*0.8,0,0.19,holder);
    const rim = add('rim-lip',new THREE.TorusGeometry(0.25,0.012,8,40),alloy,outside,0,0,wheel); rim.rotation.y=Math.PI/2;
    for (let i=0;i<5;i++) for (const offset of [-0.10,0.10]) {
      const a=i*Math.PI*2/5+offset;
      const spoke=add('split-spoke',new THREE.BoxGeometry(0.026,0.20,0.019),alloy,outside,Math.cos(a)*0.14,Math.sin(a)*0.14,wheel);
      spoke.rotation.x=a;
    }
    add('wheel-hub',new THREE.CylinderGeometry(0.055,0.055,0.035,20).rotateZ(Math.PI/2),alloy,outside,0,0,wheel);
  }
  return { body, materials, wheels, height:1.20, wheelRadius:0.35 };
}
