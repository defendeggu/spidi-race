import * as THREE from 'three';
import { HARBOR, RAIL } from '@spidi/shared';
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

interface Car {
  obj: THREE.Object3D;
  len: number;
  /** distance from the train's head to the car's centre */
  offset: number;
  /** cab at the rear: turned around */
  flip: boolean;
}

const TRAIN_SCALE = 3.2;
const SPEED = 14;
const ACCEL = 1;
const DWELL = 15;
const PAUSE = 8;

/**
 * Moving scenery of the practice town, driven by the game time: trains that stop at the station
 * and boats in the harbour basin. Purely visual – the track is fenced and the water out of reach.
 */
export class TownLife {
  readonly group = new THREE.Group();
  private trains: Car[][] = [];
  private boats: { obj: THREE.Object3D; path: (t: number) => [number, number, number] }[] = [];
  private rotors: THREE.Object3D[] = [];

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
    const s = TRAIN_SCALE;
    const make = (parts: [string, number, boolean][], color: string) => {
      let offset = 0;
      const cars: Car[] = parts.map(([name, len, flip]) => {
        const obj = piece(name, s, [3.4, 4.5, len * s], color);
        const car = { obj, len: len * s, offset: offset + (len * s) / 2, flip };
        offset += len * s + 0.4;
        obj.visible = false;
        this.group.add(obj);
        return car;
      });
      this.trains.push(cars);
    };
    make([['tr-train-electric-city-a', 2.4, false], ['tr-train-electric-city-c', 2.7, false], ['tr-train-electric-city-c', 2.7, false], ['tr-train-electric-city-a', 2.4, true]], '#d8d0b0');
    const boxes = ['tr-train-carriage-container-blue', 'tr-train-carriage-container-red', 'tr-train-carriage-container-green', 'tr-train-carriage-tank'];
    make([['tr-train-locomotive-a', 2.6, false], ...boxes.map((b): [string, number, boolean] => [b, 2.7, false]), [boxes[1], 2.7, false]], '#8a5a3a');

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
    for (const r of this.rotors) r.rotation.x = t * 1.4;
    for (const b of this.boats) {
      const [x, z, h] = b.path(t);
      b.obj.position.set(x, HARBOR.waterY - 0.4 + Math.sin(t * 1.3 + x * 0.01) * 0.15, z);
      b.obj.rotation.set(Math.sin(t * 0.9 + z) * 0.03, h, Math.sin(t * 1.1 + x) * 0.04);
    }
  }

  /** Trains take turns (S-Bahn / freight) and change direction every run. */
  private updateTrain(t: number) {
    const span = RAIL.north - RAIL.south;
    const runs = this.trains.map((cars) => {
      const len = cars[cars.length - 1].offset + cars[cars.length - 1].len / 2;
      // head distance from the entry portal: stop with the train centred on the platform (z = 0)
      const stopAt = span / 2 + len / 2;
      const brake = (SPEED * SPEED) / (2 * ACCEL);
      const tBrake = SPEED / ACCEL;
      const t1 = (stopAt - brake) / SPEED;
      const end = span + len;
      const t4 = (end - stopAt - brake) / SPEED;
      const total = t1 + tBrake + DWELL + tBrake + t4;
      const pos = (u: number) => {
        if (u < t1) return SPEED * u;
        if (u < t1 + tBrake) { const v = u - t1; return SPEED * t1 + SPEED * v - (ACCEL * v * v) / 2; }
        if (u < t1 + tBrake + DWELL) return stopAt;
        const w = u - t1 - tBrake - DWELL;
        if (w < tBrake) return stopAt + (ACCEL * w * w) / 2;
        return stopAt + brake + SPEED * (w - tBrake);
      };
      return { cars, total: total + PAUSE, pos, runTime: total };
    });
    const cycle = runs.reduce((s, r) => s + r.total, 0);
    let u = t % cycle;
    const turn = Math.floor(t / cycle);
    for (let k = 0; k < runs.length; k++) {
      const r = runs[k];
      const active = u >= 0 && u < r.runTime;
      // alternate direction: even runs southbound (from the north portal), odd runs northbound
      const south = (turn + k) % 2 === 0;
      const head = active ? r.pos(u) : -1e9;
      for (const c of r.cars) {
        const d = head - c.offset;
        const z = south ? RAIL.north - d : RAIL.south + d;
        // visible once it reaches out of a tunnel (the portal hides the rest)
        c.obj.visible = active && z + c.len / 2 > RAIL.south && z - c.len / 2 < RAIL.north;
        c.obj.position.set(RAIL.trackX, 0.25, z);
        c.obj.rotation.y = (south ? Math.PI : 0) + (c.flip ? Math.PI : 0);
      }
      u -= r.total;
    }
  }
}
