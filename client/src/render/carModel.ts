import * as THREE from 'three';
import { type CarSpec, type CarState, forwardSpeed, type Track } from '@spidi/shared';
import { blobShadowTexture } from './textures';

interface Section {
  z: number;
  hw: number;
  yb: number;
  yt: number;
  /** half width at the top */
  thw?: number;
}

/** Loft a closed hexagonal cross-section along z. Nose points to +z. */
function loft(sections: Section[]) {
  const ring = (s: Section) => {
    const ym = s.yb + (s.yt - s.yb) * 0.5;
    const thw = s.thw ?? s.hw * 0.82;
    return [
      [-s.hw * 0.92, s.yb, s.z], [s.hw * 0.92, s.yb, s.z], [s.hw, ym, s.z],
      [thw, s.yt, s.z], [-thw, s.yt, s.z], [-s.hw, ym, s.z],
    ];
  };
  const pos: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => pos.push(...a, ...b, ...c);
  const rings = sections.map(ring);
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i], B = rings[i + 1];
    for (let k = 0; k < 6; k++) {
      const k2 = (k + 1) % 6;
      tri(A[k], A[k2], B[k]);
      tri(A[k2], B[k2], B[k]);
    }
  }
  // caps
  const first = rings[0], last = rings[rings.length - 1];
  for (let k = 1; k < 5; k++) {
    tri(first[0], first[k + 1], first[k]);
    tri(last[0], last[k], last[k + 1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

const shadowTex = typeof document !== 'undefined' ? blobShadowTexture() : null;
const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 10).rotateZ(Math.PI / 2);
const rimGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.27, 6).rotateZ(Math.PI / 2);
const wheelMat = new THREE.MeshLambertMaterial({ color: '#1a1a1a', flatShading: true });
const rimMat = new THREE.MeshLambertMaterial({ color: '#b9b9b9', flatShading: true });
const glassMat = new THREE.MeshPhongMaterial({ color: '#18222c', shininess: 120, specular: '#88a', flatShading: true });
const headMat = new THREE.MeshBasicMaterial({ color: '#fff6d8' });

/** Paint colour; duplicates of the same model (variant > 0) get a darker / lighter shade. */
export function carColor(spec: CarSpec, variant = 0) {
  const c = new THREE.Color(spec.color);
  if (variant > 0) {
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    const shades = [-0.2, 0.18, -0.32, 0.28];
    c.setHSL(hsl.h, hsl.s, Math.min(0.85, Math.max(0.12, hsl.l + shades[(variant - 1) % shades.length])));
  }
  return '#' + c.getHexString();
}

export class CarVisual {
  readonly group = new THREE.Group();
  private body = new THREE.Group();
  private wheels: THREE.Group[] = [];
  private tailMat: THREE.MeshLambertMaterial;
  private spin = 0;
  readonly up = new THREE.Vector3(0, 1, 0);
  private tmpUp = { x: 0, y: 1, z: 0 };
  private label?: THREE.Sprite;

  constructor(readonly spec: CarSpec, name?: string, variant = 0) {
    const sh = spec.shape;
    const L = sh.length / 2, W = sh.width / 2, H = sh.height;
    const paint = new THREE.MeshPhongMaterial({ color: carColor(spec, variant), shininess: 60, flatShading: true });
    const accent = new THREE.MeshLambertMaterial({ color: spec.accent, flatShading: true });
    const body = loft([
      { z: -L, hw: W * 0.92, yb: 0.32, yt: H * 0.88 },
      { z: -L + 0.25, hw: W, yb: 0.26, yt: H * 0.97 },
      { z: -L + 1.1, hw: W, yb: 0.22, yt: H },
      { z: 0.5, hw: W, yb: 0.22, yt: H * 0.94 },
      { z: L - 0.7, hw: W * 0.97, yb: 0.22, yt: H * 0.72 },
      { z: L - 0.12, hw: W * 0.9, yb: 0.26, yt: H * 0.55 },
      { z: L, hw: W * 0.78, yb: 0.32, yt: H * 0.46 },
    ]);
    this.body.add(new THREE.Mesh(body, paint));
    const cs = sh.cabinShift, R = sh.roof;
    const cabin = loft([
      { z: cs - 1.35, hw: W * 0.82, yb: H * 0.9, yt: H * 0.95, thw: W * 0.75 },
      { z: cs - 0.75, hw: W * 0.8, yb: H * 0.9, yt: R, thw: W * 0.66 },
      { z: cs + 0.15, hw: W * 0.8, yb: H * 0.88, yt: R + 0.02, thw: W * 0.66 },
      { z: cs + 1.0, hw: W * 0.84, yb: H * 0.82, yt: H * 0.86, thw: W * 0.8 },
    ]);
    this.body.add(new THREE.Mesh(cabin, glassMat));
    // roof panel in paint colour
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W * 1.28, 0.04, 0.85), paint);
    roof.position.set(0, R + 0.01, cs - 0.3);
    this.body.add(roof);
    // stripe / sills
    const sill = new THREE.Mesh(new THREE.BoxGeometry(sh.width + 0.02, 0.12, sh.length * 0.62), accent);
    sill.position.set(0, 0.32, -0.1);
    this.body.add(sill);
    if (sh.spoiler) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(sh.width * 0.95, 0.06, 0.38), accent);
      wing.position.set(0, H + 0.28, -L + 0.25);
      this.body.add(wing);
      for (const s of [-1, 1]) {
        const st = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.12), accent);
        st.position.set(s * W * 0.6, H + 0.12, -L + 0.3);
        this.body.add(st);
      }
    }
    for (const s of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.05), headMat);
      hl.position.set(s * W * 0.62, H * 0.5, L - 0.04);
      hl.rotation.x = -0.5;
      this.body.add(hl);
    }
    this.tailMat = new THREE.MeshLambertMaterial({ color: '#7a0d0d', emissive: '#300000' });
    const tail = new THREE.Mesh(new THREE.BoxGeometry(sh.width * 0.86, 0.12, 0.05), this.tailMat);
    tail.position.set(0, H * 0.72, -L - 0.01);
    this.body.add(tail);

    const wb = spec.wheelbase / 2;
    for (const [x, z] of [[-W + 0.12, wb], [W - 0.12, wb], [-W + 0.12, -wb], [W - 0.12, -wb]]) {
      const holder = new THREE.Group();
      holder.position.set(x, 0.34, z);
      const wheel = new THREE.Group();
      wheel.add(new THREE.Mesh(wheelGeo, wheelMat));
      wheel.add(new THREE.Mesh(rimGeo, rimMat));
      holder.add(wheel);
      this.group.add(holder);
      this.wheels.push(holder);
    }
    this.group.add(this.body);

    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(sh.width + 0.7, sh.length + 0.6),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.04;
    shadow.renderOrder = 1;
    this.group.add(shadow);

    if (name) this.setLabel(name);
  }

  setLabel(name: string) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 48;
    const g = c.getContext('2d')!;
    g.font = 'bold 30px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 6;
    g.strokeStyle = 'rgba(0,0,0,0.7)';
    g.strokeText(name, 128, 24);
    g.fillStyle = '#ffffff';
    g.fillText(name, 128, 24);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true, fog: true }));
    this.label.scale.set(4, 0.75, 1);
    this.label.position.y = 2.4;
    this.group.add(this.label);
  }

  /** Hide own name tag for the player looking through this car's camera. */
  setLabelVisible(v: boolean) {
    if (this.label) this.label.visible = v;
  }

  private basis = new THREE.Matrix4();
  private f3 = new THREE.Vector3();
  private x3 = new THREE.Vector3();

  update(track: Track, x: number, y: number, z: number, heading: number, c: CarState, dt: number) {
    this.group.position.set(x, y, z);
    track.upAt(c.idx, this.tmpUp);
    const k = 1 - Math.exp(-dt * 10);
    this.up.x += (this.tmpUp.x - this.up.x) * k;
    this.up.y += (this.tmpUp.y - this.up.y) * k;
    this.up.z += (this.tmpUp.z - this.up.z) * k;
    this.up.normalize();
    const f = this.f3.set(Math.sin(heading), 0, Math.cos(heading));
    f.addScaledVector(this.up, -f.dot(this.up)).normalize();
    const xa = this.x3.crossVectors(this.up, f);
    this.basis.makeBasis(xa, this.up, f);
    this.group.quaternion.setFromRotationMatrix(this.basis);

    const v = forwardSpeed(c);
    this.spin += (v * dt) / 0.34;
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      w.children[0].rotation.x = this.spin;
      if (i < 2) w.rotation.y = -c.steer * 0.45;
    }
    // body roll & pitch for some life
    this.body.rotation.z = THREE.MathUtils.lerp(this.body.rotation.z, c.steer * Math.min(1, Math.abs(v) / 30) * 0.05, k);
    this.body.rotation.x = THREE.MathUtils.lerp(this.body.rotation.x, c.braking ? 0.025 : c.throttle > 0 && v < 30 ? -0.02 : 0, k);
    this.tailMat.emissive.set(c.braking ? '#ff1a1a' : '#300000');
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh && o.geometry !== wheelGeo && o.geometry !== rimGeo) o.geometry.dispose();
    });
  }
}
