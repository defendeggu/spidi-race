import * as THREE from 'three';
import { lerpAngle } from '@spidi/shared';

export const CAMERA_MODES = ['Verfolger', 'Verfolger weit', 'Stossstange', 'Vogelperspektive'] as const;
export const TOPDOWN_MODE = 3;

export class ChaseCamera {
  readonly camera = new THREE.PerspectiveCamera(68, 1, 0.3, 9000);
  mode = 0;
  private heading = 0;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private first = true;
  private lead = new THREE.Vector3();

  constructor(mode = 0) {
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
      this.pos.set(target.x + fx * 0.5 + up.x * 1.05, target.y + up.y * 1.05, target.z + fz * 0.5 + up.z * 1.05);
      this.look.set(target.x + fx * 30, target.y + 1.0, target.z + fz * 30);
      this.camera.position.copy(this.pos);
      this.camera.up.copy(up);
      this.camera.lookAt(this.look);
      this.first = false;
      return;
    }
    const dist = this.mode === 0 ? 6.4 : 10;
    const height = this.mode === 0 ? 2.3 : 3.6;
    const desired = new THREE.Vector3(target.x - fx * dist, target.y + height, target.z - fz * dist);
    if (this.first) this.pos.copy(desired);
    else this.pos.lerp(desired, k);
    // stay above the road surface level of the car
    if (this.pos.y < target.y + 1.0) this.pos.y = target.y + 1.0;
    this.look.set(target.x + fx * 4, target.y + 1.1, target.z + fz * 4);
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
