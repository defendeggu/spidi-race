import * as THREE from 'three';
import { getCar, gridPosition, type Track } from '@spidi/shared';
import { CarVisual } from '../render/carModel';
import { getWorld, type World } from '../render/world';
import { renderViewports } from '../renderer';
import { createCarState } from '@spidi/shared';

/** Slowly orbiting camera around the selected car(s) on the start grid, shown behind the menus. */
export class Backdrop {
  private camera = new THREE.PerspectiveCamera(50, 1, 0.3, 9000);
  private world: World | null = null;
  private visuals: CarVisual[] = [];
  private raf = 0;
  private angle = 0.6;
  private last = 0;
  private center = new THREE.Vector3();
  private trackId = '';
  private carIds: string[] = [];

  show(trackId: string, carIds: string[]) {
    if (trackId !== this.trackId || carIds.join() !== this.carIds.join()) {
      this.clear();
      this.trackId = trackId;
      this.carIds = [...carIds];
      this.world = getWorld(trackId);
      const track = this.world.track;
      carIds.forEach((id, k) => {
        const v = new CarVisual(getCar(id));
        const g = gridPosition(track, carIds.length > 1 ? k : 0);
        const s = createCarState('menu', track, g.x, g.z, g.heading);
        v.update(g.x, g.y, g.z, g.heading, s, 1, track.upAt(s.idx, { x: 0, y: 1, z: 0 }), 0);
        this.world!.dynamic.add(v.group);
        this.visuals.push(v);
      });
      const c = this.center.set(0, 0, 0);
      for (const v of this.visuals) c.add(v.group.position);
      c.divideScalar(Math.max(1, this.visuals.length));
      this.groundHeading = gridPosition(track as Track, 0).heading;
    }
    if (!this.raf) {
      this.last = performance.now();
      const loop = (now: number) => {
        this.raf = requestAnimationFrame(loop);
        this.render((now - this.last) / 1000);
        this.last = now;
      };
      this.raf = requestAnimationFrame(loop);
    }
  }

  private groundHeading = 0;

  private render(dt: number) {
    if (!this.world) return;
    if (this.debugView(dt)) return;
    this.angle += Math.min(dt, 0.1) * 0.18;
    const a = this.groundHeading + this.angle;
    const r = this.visuals.length > 1 ? 11 : 8;
    this.camera.position.set(this.center.x + Math.sin(a) * r, this.center.y + 2.6, this.center.z + Math.cos(a) * r);
    this.camera.lookAt(this.center.x, this.center.y + 0.6, this.center.z);
    renderViewports(this.world.scene, [{ camera: this.camera, rect: [0, 0, 1, 1] }]);
  }

  /**
   * Developer aid: `?view=<trackId>@<metres>` places the camera on the track at that distance
   * (slowly driving forward) to inspect the scenery there.
   */
  private debugS = -1;
  private debugView(dt: number) {
    const m = /[?&]view=([a-z]+)@(\d+)/.exec(location.search);
    if (!m) return false;
    const world = getWorld(m[1]);
    if (this.debugS < 0) {
      this.debugS = Number(m[2]);
      document.getElementById('ui')!.style.display = 'none';
    }
    this.debugS += Math.min(dt, 0.1) * 8;
    const p = world.track.pointAt(this.debugS, 0);
    const q = world.track.pointAt(this.debugS + 40, 0);
    this.camera.position.set(p.x, p.y + 2.5, p.z);
    this.camera.lookAt(q.x, q.y + 1.5, q.z);
    renderViewports(world.scene, [{ camera: this.camera, rect: [0, 0, 1, 1] }]);
    return true;
  }

  private clear() {
    for (const v of this.visuals) v.dispose();
    this.visuals = [];
  }

  hide() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.clear();
    this.trackId = '';
    this.carIds = [];
  }
}
