import * as THREE from 'three';
import { lerpAngle } from '@spidi/shared';

export const CAMERA_MODES = ['Verfolger', 'Verfolger weit', 'Stossstange'] as const;

export class ChaseCamera {
  readonly camera = new THREE.PerspectiveCamera(68, 1, 0.3, 9000);
  mode = 0;
  private heading = 0;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private first = true;

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
}
