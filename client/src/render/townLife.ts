import * as THREE from 'three';
import { FREIGHT_CARS, planesAt, HARBOR, SBAHN_CARS, TRAIN_SCALE, trainsAt } from '@spidi/shared';
import { LIVERIES, planeGeometries } from './airportScenery';
import { assetsReady, getModel } from './assets';

/** A Kenney model centred on its footprint and scaled, or a coloured box without assets. */
function piece(name: string, scale: number, box: [number, number, number], color: string): THREE.Object3D {
  const src = assetsReady() ? getModel(name) : undefined;
  const holder = new THREE.Group();
  if (src) {
    const m = src.clone(true);
    const bb = new THREE.Box3().setFromObject(src);
    m.position.set(-(bb.min.x + bb.max.x) / 2, 0, -(bb.min.z + bb.max.z) / 2);
    const inner = new THREE.Group();
    inner.scale.setScalar(scale);
    inner.add(m);
    holder.add(inner);
  } else {
    holder.add(new THREE.Mesh(new THREE.BoxGeometry(...box).translate(0, box[1] / 2, 0), new THREE.MeshLambertMaterial({ color })));
  }
  return holder;
}

let puff: THREE.Texture | null = null;

/** A soft round white puff for steam (canvas, shared). */
function puffTexture() {
  if (puff) return puff;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(250,250,252,0.7)');
  grad.addColorStop(1, 'rgba(240,242,246,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  puff = new THREE.CanvasTexture(c);
  return puff;
}

interface TrainModel {
  cars: { obj: THREE.Object3D; flip: boolean }[];
}

/**
 * Moving scenery of the practice town, driven by the game time: the trains of the timetable (see
 * townRail – their collisions are in the game) and boats in the harbour basin.
 */
export class TownLife {
  readonly group = new THREE.Group();
  private trains: TrainModel[] = [];
  private boats: { obj: THREE.Object3D; path: (t: number) => [number, number, number] }[] = [];
  private rotors: THREE.Object3D[] = [];
  /** the moving aircraft (see townPlane): departing and taxiing */
  private planes: { obj: THREE.Group; livery: THREE.MeshLambertMaterial }[] = [];

  private steam: { sprite: THREE.Sprite; x: number; z: number; top: number; r: number; phase: number }[] = [];

  /**
   * White steam rising out of a cooling tower (top at height `top`, opening radius r): soft puffs
   * well up, grow, drift with the wind and fade.
   */
  addSteam(x: number, z: number, top: number, r: number) {
    const N = 26;
    for (let i = 0; i < N; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture(), transparent: true, depthWrite: false, color: '#ffffff', fog: true }));
      this.group.add(sprite);
      this.steam.push({ sprite, x, z, top, r, phase: (i / N + Math.random() * 0.02) % 1 });
    }
  }

  /** A wind turbine whose 'blades' node turns. */
  addWindmill(name: string, scale: number, x: number, z: number, rot: number) {
    const obj = piece(name, scale, [4, 30, 4], '#e8e8e8');
    obj.position.set(x, 0, z);
    obj.rotation.y = rot;
    this.group.add(obj);
    const blades = obj.getObjectByName('blades');
    if (blades) this.rotors.push(blades);
  }

  constructor() {
    const make = (parts: [string, boolean][], lens: number[], color: string) => {
      const cars = parts.map(([name, flip], k) => {
        const obj = piece(name, TRAIN_SCALE, [3.4, 4.5, lens[k]], color);
        obj.visible = false;
        this.group.add(obj);
        return { obj, flip };
      });
      this.trains.push({ cars });
    };
    // order and lengths as in the timetable (SBAHN_CARS / FREIGHT_CARS): the first car leads
    make([['tr-train-electric-city-a', false], ['tr-train-electric-city-c', false], ['tr-train-electric-city-c', false], ['tr-train-electric-city-a', true]], SBAHN_CARS, '#d8d0b0');
    const boxes = ['tr-train-carriage-container-blue', 'tr-train-carriage-container-red', 'tr-train-carriage-container-green', 'tr-train-carriage-tank'];
    make([['tr-train-locomotive-a', false], ...boxes.map((b): [string, boolean] => [b, false]), [boxes[1], false]], FREIGHT_CARS, '#8a5a3a');

    const { body, livery } = planeGeometries();
    const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    for (let k = 0; k < 2; k++) {
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
      const obj = new THREE.Group();
      obj.add(new THREE.Mesh(body, bodyMat), new THREE.Mesh(livery, mat));
      obj.rotation.order = 'YXZ';
      this.group.add(obj);
      this.planes.push({ obj, livery: mat });
    }

    const Q = HARBOR.quayZ, y = HARBOR.waterY - 0.4;
    const loop = (cx: number, cz: number, rx: number, rz: number, period: number, phase: number) => (t: number): [number, number, number] => {
      const a = ((t / period) * 2 + phase) * Math.PI;
      // heading along the tangent of the ellipse
      return [cx + Math.cos(a) * rx, cz + Math.sin(a) * rz, Math.atan2(-Math.sin(a) * rx, Math.cos(a) * rz)];
    };
    const boat = (name: string, scale: number, box: [number, number, number], path: (t: number) => [number, number, number]) => {
      const obj = piece(name, scale, box, '#e8e8e8');
      obj.position.y = y;
      this.group.add(obj);
      this.boats.push({ obj, path });
    };
    boat('wc-boat-speed-a', 3, [5, 3, 10], loop(0, Q - 160, 380, 50, 70, 0));
    boat('wc-boat-sail-b', 3, [5, 12, 12], loop(-150, Q - 260, 200, 60, 160, 0.5));
    boat('wc-boat-tug-a', 4, [7, 8, 14], loop(150, Q - 110, 260, 25, 110, 1.2));
  }

  update(t: number) {
    this.updateTrain(t);
    for (const s of this.steam) {
      // one puff every few seconds, each lives 14 s: up 40 m, drifting 30 m with the wind
      const age = (t / 14 + s.phase) % 1;
      const wobble = Math.sin(t * 0.7 + s.phase * 40) * s.r * 0.15;
      s.sprite.position.set(s.x + age * age * 30 + wobble, s.top + age * 40, s.z + age * 8 + wobble * 0.5);
      s.sprite.scale.setScalar(s.r * (1.2 + age * 3.2));
      s.sprite.material.opacity = 0.75 * Math.min(1, age * 6) * (1 - age);
    }
    // an aircraft pitches up around its main gear, about 18 m behind the nose
    planesAt(t).forEach((p, k) => {
      const { obj, livery } = this.planes[k];
      obj.position.set(p.x, p.y + 18 * Math.sin(p.pitch), p.z);
      obj.rotation.set(-p.pitch, p.heading, 0);
      livery.color.set(LIVERIES[p.livery % LIVERIES.length]);
    });
    for (const r of this.rotors) r.rotation.x = t * 1.4;
    for (const b of this.boats) {
      const [x, z, h] = b.path(t);
      b.obj.position.set(x, HARBOR.waterY - 0.4 + Math.sin(t * 1.3 + x * 0.01) * 0.15, z);
      b.obj.rotation.set(Math.sin(t * 0.9 + z) * 0.03, h, Math.sin(t * 1.1 + x) * 0.04);
    }
  }

  /** Both trains where the timetable puts them. */
  private updateTrain(t: number) {
    trainsAt(t).forEach((tr, k) => {
      tr.cars.forEach((pose, i) => {
        const m = this.trains[k].cars[i];
        m.obj.visible = !pose.hidden;
        m.obj.position.set(pose.x, 0.25, pose.z);
        m.obj.rotation.y = pose.heading + (m.flip ? Math.PI : 0);
      });
    });
  }
}
