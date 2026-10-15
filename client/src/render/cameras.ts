import * as THREE from 'three';
import { lerpAngle } from '@spidi/shared';

export const CAMERA_MODES = ['Verfolger', 'Verfolger weit', 'Stossstange', 'Vogelperspektive'] as const;
export const TOPDOWN_MODE = 3;

/** Where the chase camera sits for a car: behind (dist), above the ground (height), looking at lookY. */
export interface ChaseView {
  dist: number;
  height: number;
  lookY: number;
  /** bumper camera: distance in front of the car centre */
  bumperAhead: number;
}

const DEFAULT_VIEW: ChaseView = { dist: 6.4, height: 2.3, lookY: 1.1, bumperAhead: 0.5 };

/** A higher and further view for tall vehicles (Kenney town cars are up to 3 m high). */
export function viewForCar(length: number, roof: number): Partial<ChaseView> {
  return {
    dist: Math.max(7.5, length * 1.2 + roof * 1.2),
    height: roof + 1.5,
    lookY: roof * 0.7,
    bumperAhead: length / 2 + 0.3,
  };
}

export class ChaseCamera {
  readonly camera = new THREE.PerspectiveCamera(68, 1, 0.3, 9000);
  mode = 0;
  private heading = 0;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private first = true;
  private lead = new THREE.Vector3();

  private view: ChaseView;
  /** camera shake strength (decays by itself), e.g. after a hit */
  shake = 0;

  constructor(mode = 0, view: Partial<ChaseView> = {}) {
    this.view = { ...DEFAULT_VIEW, ...view };
    this.mode = mode;
  }

  cycle() {
    this.mode = (this.mode + 1) % CAMERA_MODES.length;
    this.first = true;
  }

  get isInside() {
    return this.mode === 2;
  }

  update(target: THREE.Vector3, heading: number, up: THREE.Vector3, speed: number, dt: number) {
    this.place(target, heading, up, speed, dt);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.5);
      const s = this.shake * 0.5;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
    }
  }

  private place(target: THREE.Vector3, heading: number, up: THREE.Vector3, speed: number, dt: number) {
    const k = this.first ? 1 : 1 - Math.exp(-dt * 7);
    this.heading = this.first ? heading : lerpAngle(this.heading, heading, 1 - Math.exp(-dt * (this.mode === 2 ? 30 : 5.5)));
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    if (this.mode === TOPDOWN_MODE) {
      this.topDown(target, fx, fz, speed, dt);
      return;
    }
    const fov = 66 + Math.min(16, Math.abs(speed) * 0.18);
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 3);
      this.camera.updateProjectionMatrix();
    }
    if (this.mode === 2) {
      const ahead = this.view.bumperAhead;
      this.pos.set(target.x + fx * ahead + up.x * 1.05, target.y + up.y * 1.05, target.z + fz * ahead + up.z * 1.05);
      this.look.set(target.x + fx * 30, target.y + 1.0, target.z + fz * 30);
      this.camera.position.copy(this.pos);
      this.camera.up.copy(up);
      this.camera.lookAt(this.look);
      this.first = false;
      return;
    }
    // the wide chase view is the normal one scaled up
    const far = this.mode === 0 ? 1 : 1.56;
    const dist = this.view.dist * far;
    const height = this.view.height * far;
    const desired = new THREE.Vector3(target.x - fx * dist, target.y + height, target.z - fz * dist);
    if (this.first) this.pos.copy(desired);
    else this.pos.lerp(desired, k);
    // stay above the road surface level of the car
    if (this.pos.y < target.y + 1.0) this.pos.y = target.y + 1.0;
    this.look.set(target.x + fx * 4, target.y + this.view.lookY, target.z + fz * 4);
    this.camera.position.copy(this.pos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.look);
    this.first = false;
  }

  /**
   * Micro-Machines style: high above the car with a fixed world orientation (screen up = +z),
   * looking a little ahead in the driving direction so corners show up early.
   */
  private topDown(target: THREE.Vector3, fx: number, fz: number, speed: number, dt: number) {
    if (Math.abs(this.camera.fov - 50) > 0.05) {
      this.camera.fov = 50;
      this.camera.updateProjectionMatrix();
    }
    const ahead = Math.max(-6, Math.min(18, speed * 0.35));
    const k = this.first ? 1 : 1 - Math.exp(-dt * 2.5);
    this.lead.x += (fx * ahead - this.lead.x) * k;
    this.lead.z += (fz * ahead - this.lead.z) * k;
    this.look.set(target.x + this.lead.x, target.y, target.z + this.lead.z);
    const desired = new THREE.Vector3(this.look.x, this.look.y + 46, this.look.z - 15);
    if (this.first) this.pos.copy(desired);
    else this.pos.lerp(desired, 1 - Math.exp(-dt * 8));
    this.camera.position.copy(this.pos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.pos.x, this.pos.y - 46, this.pos.z + 15);
    this.first = false;
  }
}
