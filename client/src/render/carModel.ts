import * as THREE from 'three';
import { type CarSpec, type CarState, forwardSpeed } from '@spidi/shared';
import { assetsReady, carColormapImage, getModel } from './assets';
import { blobShadowTexture } from './textures';
import { buildCamper } from './camper';

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

// ------------------------------------------------------------------ paint for Kenney models

const COLS = 16, ROWS = 4;
let paletteData: ImageData | null = null;

function palette() {
  if (paletteData) return paletteData;
  const img = carColormapImage()!;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  paletteData = g.getImageData(0, 0, c.width, c.height);
  return paletteData;
}

function rgbAt(d: ImageData, x: number, y: number) {
  const i = (Math.min(d.height - 1, Math.max(0, Math.floor(y))) * d.width + Math.min(d.width - 1, Math.max(0, Math.floor(x)))) * 4;
  return [d.data[i] / 255, d.data[i + 1] / 255, d.data[i + 2] / 255];
}

function hsl(rgb: number[]) {
  const c = new THREE.Color(rgb[0], rgb[1], rgb[2]);
  const o = { h: 0, s: 0, l: 0 };
  c.getHSL(o);
  return o;
}

/** Palette cells (in the shared colormap) that make up the car's paint, found by triangle area. */
const paintCellCache = new Map<string, number[]>();
function paintCells(model: string, body: THREE.Object3D) {
  const cached = paintCellCache.get(model);
  if (cached) return cached;
  const d = palette();
  const area = new Float64Array(COLS * ROWS);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  body.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const pos = o.geometry.attributes.position, uv = o.geometry.attributes.uv;
    if (!uv) return;
    const idx = o.geometry.index;
    const count = idx ? idx.count : pos.count;
    for (let t = 0; t < count; t += 3) {
      const i0 = idx ? idx.getX(t) : t, i1 = idx ? idx.getX(t + 1) : t + 1, i2 = idx ? idx.getX(t + 2) : t + 2;
      a.fromBufferAttribute(pos, i0);
      b.fromBufferAttribute(pos, i1);
      c.fromBufferAttribute(pos, i2);
      const ar = b.clone().sub(a).cross(c.clone().sub(a)).length();
      const u = (uv.getX(i0) + uv.getX(i1) + uv.getX(i2)) / 3, v = (uv.getY(i0) + uv.getY(i1) + uv.getY(i2)) / 3;
      const cx = Math.min(COLS - 1, Math.floor(u * COLS)), cy = Math.min(ROWS - 1, Math.floor(v * ROWS));
      area[cy * COLS + cx] += ar;
    }
  });
  const cellColor = (k: number) => hsl(rgbAt(d, ((k % COLS) + 0.5) * (d.width / COLS), (Math.floor(k / COLS) + 0.5) * (d.height / ROWS)));
  let best = -1;
  for (let k = 0; k < area.length; k++) {
    const h = cellColor(k);
    if (h.s < 0.3 || h.l < 0.2 || h.l > 0.85) continue;
    if (best < 0 || area[k] > area[best]) best = k;
  }
  const cells: number[] = [];
  if (best >= 0) {
    const hb = cellColor(best);
    for (let k = 0; k < area.length; k++) {
      if (area[k] <= 0) continue;
      const h = cellColor(k);
      const dh = Math.min(Math.abs(h.h - hb.h), 1 - Math.abs(h.h - hb.h));
      if (h.s > 0.3 && dh < 0.06) cells.push(k);
    }
  }
  paintCellCache.set(model, cells);
  return cells;
}

const paintTexCache = new Map<string, THREE.Texture>();
function paintTexture(model: string, body: THREE.Object3D, color: string) {
  const key = `${model}|${color}`;
  const hit = paintTexCache.get(key);
  if (hit) return hit;
  const d = palette();
  const out = new ImageData(new Uint8ClampedArray(d.data), d.width, d.height);
  const target = new THREE.Color(color);
  // the texture is sampled in sRGB; recolour in sRGB space too
  const tr = Math.pow(target.r, 1 / 2.2), tg = Math.pow(target.g, 1 / 2.2), tb = Math.pow(target.b, 1 / 2.2);
  const cw = d.width / COLS, ch = d.height / ROWS;
  const lum = (r: number, g: number, b: number) => 0.3 * r + 0.59 * g + 0.11 * b;
  for (const k of paintCells(model, body)) {
    const x0 = Math.round((k % COLS) * cw), y0 = Math.round(Math.floor(k / COLS) * ch);
    const mid = rgbAt(d, x0 + cw / 2, y0 + ch / 2);
    const ref = Math.max(0.05, lum(mid[0], mid[1], mid[2]));
    for (let y = y0; y < y0 + ch; y++)
      for (let x = x0; x < x0 + cw; x++) {
        const i = (y * d.width + x) * 4;
        const f = lum(d.data[i], d.data[i + 1], d.data[i + 2]) / 255 / ref;
        out.data[i] = Math.min(255, tr * f * 255);
        out.data[i + 1] = Math.min(255, tg * f * 255);
        out.data[i + 2] = Math.min(255, tb * f * 255);
      }
  }
  const c = document.createElement('canvas');
  c.width = d.width;
  c.height = d.height;
  c.getContext('2d')!.putImageData(out, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  paintTexCache.set(key, tex);
  return tex;
}

// ------------------------------------------------------------------ kart driver

const visorMat = new THREE.MeshPhongMaterial({ color: '#0d1422', specular: '#8fb4ff', shininess: 140 });
const suitMat = new THREE.MeshLambertMaterial({ color: '#2a3140' });
const gloveMat = new THREE.MeshLambertMaterial({ color: '#f2f2f2' });
const wheelRimMat = new THREE.MeshLambertMaterial({ color: '#1c1c1c' });
const stripeMat = new THREE.MeshPhongMaterial({ color: '#ffffff', shininess: 90 });
const helmetMats = new Map<string, THREE.Material>();

/**
 * A kart driver: racing suit, arms on the steering wheel and a helmet in the kart's colour with a white
 * stripe and a dark visor. u = the kart model's unit (1 u ≈ the kart's width), seat = bottom of the seat.
 */
function kartDriver(color: string, u: number, seat: THREE.Vector3) {
  const g = new THREE.Group();
  g.position.copy(seat);
  let helmetMat = helmetMats.get(color);
  if (!helmetMat) helmetMats.set(color, (helmetMat = new THREE.MeshPhongMaterial({ color, specular: '#ffffff', shininess: 90 })));

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x * u, y * u, z * u);
    m.rotation.set(rx, ry, rz);
    g.add(m);
    return m;
  };
  // body, leaning back a little
  add(new THREE.CapsuleGeometry(0.15 * u, 0.2 * u, 4, 10), suitMat, 0, 0.3, -0.02, -0.25);
  // arms from the shoulders to the steering wheel
  for (const sx of [-1, 1]) {
    const sh = new THREE.Vector3(sx * 0.17, 0.42, 0.02), hand = new THREE.Vector3(sx * 0.09, 0.3, 0.3);
    const mid = sh.clone().add(hand).multiplyScalar(0.5), dir = hand.clone().sub(sh);
    const arm = add(new THREE.CapsuleGeometry(0.05 * u, dir.length() * u * 0.8, 3, 8), suitMat, mid.x, mid.y, mid.z);
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    add(new THREE.SphereGeometry(0.055 * u, 8, 6), gloveMat, hand.x, hand.y, hand.z);
  }
  add(new THREE.TorusGeometry(0.1 * u, 0.018 * u, 6, 16), wheelRimMat, 0, 0.3, 0.32, -0.9);
  // helmet: round shell, white stripe over the top, visor at the front
  const r = 0.17;
  const head = new THREE.Group();
  head.position.set(0, 0.66 * u, 0.02 * u);
  g.add(head);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(r * u, 20, 14), helmetMat);
  shell.scale.set(1, 0.95, 1.08);
  head.add(shell);
  // a white stripe from the forehead over the top to the neck
  for (const ry of [Math.PI / 2, -Math.PI / 2]) {
    const stripe = new THREE.Mesh(new THREE.SphereGeometry(r * u * 1.01, 20, 10, -0.18, 0.36, 0, Math.PI * (ry > 0 ? 0.34 : 0.6)), stripeMat);
    stripe.rotation.y = ry;
    stripe.scale.copy(shell.scale);
    head.add(stripe);
  }
  const visor = new THREE.Mesh(new THREE.SphereGeometry(r * u * 1.03, 20, 10, Math.PI * 0.18, Math.PI * 0.64, Math.PI * 0.36, Math.PI * 0.24), visorMat);
  visor.scale.copy(shell.scale);
  head.add(visor);
  // chin guard in the suit colour
  const chin = new THREE.Mesh(new THREE.SphereGeometry(r * u * 0.75, 12, 8, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), suitMat);
  chin.position.y = -0.05 * u;
  head.add(chin);
  return g;
}

// ------------------------------------------------------------------ car visual

export class CarVisual {
  readonly group = new THREE.Group();
  private body = new THREE.Group();
  /** wheel holders: front-left, front-right, back-left, back-right; children[0] spins */
  private wheels: THREE.Object3D[] = [];
  private wheelRadius = 0.34;
  private tailMat: THREE.MeshLambertMaterial;
  private spin = 0;
  readonly up = new THREE.Vector3(0, 1, 0);
  /** height of the roof above the ground (m), for the camera */
  height: number;
  private tmpUp = { x: 0, y: 1, z: 0 };
  private label?: THREE.Sprite;
  private ownedMaterials: THREE.Material[] = [];

  constructor(readonly spec: CarSpec, name?: string, variant = 0) {
    this.tailMat = new THREE.MeshLambertMaterial({ color: '#7a0d0d', emissive: '#300000' });
    this.ownedMaterials.push(this.tailMat);
    this.height = spec.shape.roof;
    const color = carColor(spec, variant);
    const model = assetsReady() ? getModel(spec.model) : undefined;
    if (spec.model === 'vw-t6-california') this.buildCalifornia(color);
    else if (model) this.buildFromModel(model, color);
    else this.buildProcedural(color);
    this.group.add(this.body);

    const sh = spec.shape;
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

  /** Kenney Car Kit model: scaled to the spec length, paint recoloured, wheels animated. */
  private buildFromModel(src: THREE.Group, color: string) {
    const root = src.clone(true);
    const box = new THREE.Box3().setFromObject(root);
    const s = this.spec.shape.length / (box.max.z - box.min.z);
    this.height = (box.max.y - box.min.y) * s;
    const scaled = new THREE.Group();
    scaled.scale.setScalar(s);
    this.body.add(scaled);

    // karts: the Kenney driver is a huge pale bubble; a smaller driver of our own takes the seat
    const seat = this.spec.class === 'kart' ? root.getObjectByName('character') : undefined;
    if (seat) {
      const sb = new THREE.Box3().setFromObject(seat);
      seat.removeFromParent();
      this.body.add(kartDriver(color, s, new THREE.Vector3(0, sb.min.y * s, ((sb.min.z + sb.max.z) / 2) * s)));
    }
    const bodyParts = root.children.filter((o) => !o.name.startsWith('wheel'));
    const paint = new THREE.Group();
    bodyParts.forEach((o) => paint.add(o));
    const srcBody = bodyParts.find((o) => o instanceof THREE.Mesh) as THREE.Mesh | undefined;
    const original = (srcBody?.material as THREE.MeshStandardMaterial | undefined)?.map ?? null;
    // taxi, police and fire engine keep their livery
    const map = this.spec.keepPaint && original ? original : paintTexture(this.spec.model, paint, color);
    const mat = new THREE.MeshLambertMaterial({ map });
    this.ownedMaterials.push(mat);
    paint.traverse((o) => {
      if (o instanceof THREE.Mesh) o.material = mat;
    });
    scaled.add(paint);

    const order = ['wheel-front-left', 'wheel-front-right', 'wheel-back-left', 'wheel-back-right'];
    const srcWheel = root.children.find((o) => o.name.startsWith('wheel')) as THREE.Mesh | undefined;
    const srcMat = srcWheel?.material as THREE.MeshStandardMaterial | undefined;
    const wheelMatModel = new THREE.MeshLambertMaterial({ map: srcMat?.map ?? null });
    this.ownedMaterials.push(wheelMatModel);
    for (const name of order) {
      const node = root.children.find((o) => o.name === name);
      if (!node) continue;
      const holder = new THREE.Group();
      holder.position.copy(node.position).multiplyScalar(s);
      holder.scale.setScalar(s);
      const spinner = new THREE.Group();
      node.position.set(0, 0, 0);
      node.traverse((o) => {
        if (o instanceof THREE.Mesh) o.material = wheelMatModel;
      });
      spinner.add(node);
      holder.add(spinner);
      this.group.add(holder);
      this.wheels.push(holder);
      this.wheelRadius = 0.3 * s;
    }

    // brake light strip at the rear of the body
    const bb = new THREE.Box3().setFromObject(scaled);
    const tail = new THREE.Mesh(new THREE.BoxGeometry((bb.max.x - bb.min.x) * 0.6, 0.08, 0.04), this.tailMat);
    tail.position.set(0, bb.min.y + (bb.max.y - bb.min.y) * 0.45, bb.min.z - 0.01);
    this.body.add(tail);
  }

  private buildProcedural(color: string) {
    const spec = this.spec;
    const sh = spec.shape;
    const L = sh.length / 2, W = sh.width / 2, H = sh.height;
    const paint = new THREE.MeshPhongMaterial({ color, shininess: 60, flatShading: true });
    const accent = new THREE.MeshLambertMaterial({ color: spec.accent, flatShading: true });
    this.ownedMaterials.push(paint, accent);
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
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W * 1.28, 0.04, 0.85), paint);
    roof.position.set(0, R + 0.01, cs - 0.3);
    this.body.add(roof);
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
    const tail = new THREE.Mesh(new THREE.BoxGeometry(sh.width * 0.86, 0.12, 0.05), this.tailMat);
    tail.position.set(0, H * 0.72, -L - 0.01);
    this.body.add(tail);

    const wb = spec.wheelbase / 2;
    for (const [x, z] of [[W - 0.12, wb], [-W + 0.12, wb], [W - 0.12, -wb], [-W + 0.12, -wb]]) {
      const holder = new THREE.Group();
      holder.position.set(x, 0.34, z);
      const wheel = new THREE.Group();
      wheel.add(new THREE.Mesh(wheelGeo, wheelMat));
      wheel.add(new THREE.Mesh(rimGeo, rimMat));
      holder.add(wheel);
      this.group.add(holder);
      this.wheels.push(holder);
    }
  }

  private buildCalifornia(color: string) {
    const camper = buildCamper(color, this.tailMat);
    this.body.add(camper.body);
    this.ownedMaterials.push(...camper.materials);
    this.height = camper.height;
    const wb = this.spec.wheelbase / 2;
    const tyreMaterial = new THREE.MeshPhongMaterial({ color: '#17191b', shininess: 12 });
    const alloyMaterial = new THREE.MeshPhongMaterial({ color: '#bac0c5', shininess: 110 });
    const brakeMaterial = new THREE.MeshPhongMaterial({ color: '#41464a', shininess: 40 });
    this.ownedMaterials.push(tyreMaterial, alloyMaterial, brakeMaterial);
    for (const [x, z] of [[0.86, wb], [-0.86, wb], [0.86, -wb], [-0.86, -wb]]) {
      const holder = new THREE.Group();
      holder.position.set(x, this.wheelRadius, z);
      const wheel = new THREE.Group();
      const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.255, 0.085, 12, 40), tyreMaterial);
      tyre.rotation.y = Math.PI / 2;
      tyre.scale.z = 1.45;
      wheel.add(tyre);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.16, 32).rotateZ(Math.PI / 2), brakeMaterial);
      wheel.add(disc);
      const outside = Math.sign(x) * 0.125;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.215, 0.016, 8, 40), alloyMaterial);
      rim.rotation.y = Math.PI / 2;
      rim.position.x = outside;
      wheel.add(rim);
      for (let i = 0; i < 10; i++) {
        const angle = i * Math.PI / 5;
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.155, 0.025), alloyMaterial);
        spoke.rotation.x = angle;
        spoke.position.set(outside, Math.cos(angle) * 0.12, Math.sin(angle) * 0.12);
        wheel.add(spoke);
      }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.035, 24).rotateZ(Math.PI / 2), alloyMaterial);
      hub.position.x = outside;
      wheel.add(hub);
      holder.add(wheel);
      this.group.add(holder);
      this.wheels.push(holder);
    }
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
    this.label.position.y = 2.6;
    this.group.add(this.label);
  }

  /** Hide own name tag for the player looking through this car's camera. */
  setLabelVisible(v: boolean) {
    if (this.label) this.label.visible = v;
  }

  private basis = new THREE.Matrix4();
  private f3 = new THREE.Vector3();
  private x3 = new THREE.Vector3();

  private suspY = 0;
  private suspV = 0;
  private roughPhase = Math.random() * 10;
  private wheelBaseY: number[] = [];

  /** `up` is the ground normal under the car, `rough` the roughness of its surface (0..1). */
  update(x: number, y: number, z: number, heading: number, c: CarState, dt: number, up: { x: number; y: number; z: number }, rough: number) {
    this.group.position.set(x, y, z);
    let k = 1 - Math.exp(-dt * 10);
    if (c.airborne) {
      // in the air the car follows its flight path
      const sp = Math.hypot(c.vx, c.vy, c.vz) || 1;
      const dx = c.vx / sp, dy = c.vy / sp, dz = c.vz / sp;
      const rx = -Math.cos(heading), rz = Math.sin(heading);
      // up = right × direction
      this.tmpUp.x = -rz * dy;
      this.tmpUp.y = rz * dx - rx * dz;
      this.tmpUp.z = rx * dy;
      k = 1 - Math.exp(-dt * 3);
    } else {
      this.tmpUp.x = up.x;
      this.tmpUp.y = up.y;
      this.tmpUp.z = up.z;
    }
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
    this.spin += (v * dt) / this.wheelRadius;
    // suspension: damped spring kicked by landings, plus jitter on rough surfaces
    const travel = this.spec.suspension;
    if (c.landed > 0) this.suspV -= Math.min(c.landed, 15) * travel * 0.9;
    this.suspV += (-160 * this.suspY - 14 * this.suspV) * dt;
    this.suspY = THREE.MathUtils.clamp(this.suspY + this.suspV * dt, -travel * 1.5, travel * 1.5);
    if (c.airborne) rough = 0;
    this.roughPhase += Math.abs(v) * dt * 1.4;
    const jitter = rough * travel * 0.35 * Math.min(1, Math.abs(v) / 15) * (Math.sin(this.roughPhase) * 0.6 + Math.sin(this.roughPhase * 2.7) * 0.4);
    this.body.position.y = this.suspY + jitter;
    const droop = c.airborne ? travel * 0.8 : 0;
    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i];
      this.wheelBaseY[i] ??= w.position.y;
      w.position.y = THREE.MathUtils.lerp(w.position.y, this.wheelBaseY[i] - droop, 1 - Math.exp(-dt * 12));
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
    // geometries of Kenney models are shared with the cached source and must stay alive
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh && o.geometry !== wheelGeo && o.geometry !== rimGeo && !o.geometry.userData.shared) o.geometry.dispose();
    });
    for (const m of this.ownedMaterials) m.dispose();
  }
}
