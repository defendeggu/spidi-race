import * as THREE from 'three';
import { driftLevel, type ItemEvent, type ItemWorld } from '@spidi/shared';
import { assetsReady, getModel } from './assets';
import type { CarVisual } from './carModel';
import type { Particles } from './particles';

/** A Kenney model scaled and centred, or a simple fallback mesh without assets. */
function model(name: string, scale: number, fallback: () => THREE.Object3D) {
  const src = assetsReady() ? getModel(name) : undefined;
  if (!src) return fallback();
  const holder = new THREE.Group();
  const m = src.clone(true);
  const bb = new THREE.Box3().setFromObject(src);
  m.position.set(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  const inner = new THREE.Group();
  inner.scale.setScalar(scale);
  inner.add(m);
  holder.add(inner);
  return holder;
}

function questionTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 128, 128);
  grad.addColorStop(0, '#ffe066');
  grad.addColorStop(1, '#ff8a00');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 8;
  g.strokeRect(4, 4, 120, 120);
  g.fillStyle = '#ffffff';
  g.font = 'bold 96px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('?', 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const SPARK = ['#7fd4ff', '#ff9a1f', '#d36bff'];

interface KartDeco {
  visual: CarVisual;
  shield: THREE.Mesh;
  flame: THREE.Mesh;
  hop: THREE.Group;
}

interface Debris {
  obj: THREE.Object3D;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
}

/** Everything of the item system that can be seen: boxes, projectiles, mines, shields, boosts, hits. */
export class ItemVisuals {
  private group = new THREE.Group();
  private boxes: THREE.Mesh[] = [];
  private shots = new Map<number, THREE.Object3D>();
  private mines = new Map<number, THREE.Object3D>();
  private karts = new Map<string, KartDeco>();
  private debris: Debris[] = [];
  private time = 0;
  private boxMat: THREE.MeshLambertMaterial;

  constructor(parent: THREE.Group, private items: ItemWorld, visuals: Map<string, CarVisual>, private particles: Particles) {
    parent.add(this.group);
    this.boxMat = new THREE.MeshLambertMaterial({ map: questionTexture(), transparent: true, opacity: 0.85, emissive: '#553300' });
    const boxGeo = new THREE.BoxGeometry(1.4, 1.4, 1.4);
    for (const b of items.boxes) {
      const m = new THREE.Mesh(boxGeo, this.boxMat);
      m.position.set(b.x, b.y + 1.2, b.z);
      this.group.add(m);
      this.boxes.push(m);
    }
    const shieldMat = new THREE.MeshPhongMaterial({ color: '#66ccff', transparent: true, opacity: 0.28, shininess: 120, depthWrite: false });
    const flameMat = new THREE.MeshBasicMaterial({ color: '#ffaa22', transparent: true, opacity: 0.85 });
    for (const [id, visual] of visuals) {
      // a blaster on top of every kart
      const gun = model('bl-blaster-l', 2.6, () => new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 1.2), new THREE.MeshLambertMaterial({ color: '#ff7a00' })));
      // beside the driver, pointing forward
      gun.position.set(0.95, 0.55, 0.55);
      const hop = new THREE.Group();
      hop.add(gun);
      visual.group.add(hop);
      const shield = new THREE.Mesh(new THREE.SphereGeometry(2, 18, 12), shieldMat);
      shield.position.y = 0.9;
      shield.visible = false;
      visual.group.add(shield);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.6, 8).rotateX(-Math.PI / 2).translate(0, 0.45, -2.1), flameMat);
      flame.visible = false;
      visual.group.add(flame);
      this.karts.set(id, { visual, shield, flame, hop });
    }
  }

  /** React to item events (spawn / destroy / hit); returns nothing, sounds and HUD are done by the game. */
  handle(e: ItemEvent) {
    if (e.type === 'spawn') {
      if (e.kind === 'mine') {
        const m = model('bl-grenade-a', 6, () => new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), new THREE.MeshLambertMaterial({ color: '#3a6a2a' })));
        const blink = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff2020' }));
        blink.position.y = 1.5;
        blink.name = 'blink';
        m.add(blink);
        this.group.add(m);
        this.mines.set(e.id, m);
      } else {
        const homing = e.kind === 'homing';
        const m = model(homing ? 'bl-bullet-foam-thick' : 'bl-bullet-foam', homing ? 30 : 34,
          () => new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 1, 4, 8).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#ff8a00' })));
        // the foam darts are modelled upright: lay them along the flight direction
        m.children[0]?.rotation.set(Math.PI / 2, 0, 0);
        const glow = new THREE.Mesh(new THREE.SphereGeometry(homing ? 0.6 : 0.45, 10, 8),
          new THREE.MeshBasicMaterial({ color: homing ? '#ff3030' : '#ffd040', transparent: true, opacity: 0.5, depthWrite: false }));
        m.add(glow);
        this.group.add(m);
        this.shots.set(e.id, m);
      }
    } else if (e.type === 'destroy') {
      const o = this.shots.get(e.id) ?? this.mines.get(e.id);
      if (o) {
        if (e.reason !== 'timeout') this.burst(o.position, e.reason === 'blocked' ? '#66ccff' : '#ffaa33');
        o.removeFromParent();
      }
      this.shots.delete(e.id);
      this.mines.delete(e.id);
    } else if (e.type === 'hit') {
      const k = this.karts.get(e.victim);
      if (k) this.wreck(k.visual.group.position);
    }
  }

  /** Network game: the server's shot or mine (id) takes over the one shown in advance (local id). */
  adopt(local: number, id: number) {
    for (const map of [this.shots, this.mines]) {
      const o = map.get(local);
      if (!o) continue;
      map.delete(local);
      map.set(id, o);
    }
  }

  private burst(p: THREE.Vector3, color: string) {
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 6;
      this.particles.emit(p.x, p.y + 0.5, p.z, Math.cos(a) * s, 2 + Math.random() * 4, Math.sin(a) * s, color, 0.9, 0.7, 6);
    }
  }

  /** Bolts, a tyre and plates fly off the hit kart. */
  private wreck(p: THREE.Vector3) {
    this.burst(p, '#ffcc33');
    const parts = ['debris-bolt', 'debris-tire', 'debris-plate-small-a', 'debris-spoiler-a'];
    for (const name of parts) {
      const obj = model(name, 1.6, () => new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.4), new THREE.MeshLambertMaterial({ color: '#777' })));
      obj.position.copy(p).add(new THREE.Vector3(0, 1, 0));
      this.group.add(obj);
      const a = Math.random() * Math.PI * 2;
      this.debris.push({
        obj, life: 1.4,
        vel: new THREE.Vector3(Math.cos(a) * 5, 6 + Math.random() * 4, Math.sin(a) * 5),
        spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
      });
    }
  }

  update(dt: number) {
    this.time += dt;
    const it = this.items;
    it.boxes.forEach((b, i) => {
      const m = this.boxes[i];
      m.visible = b.respawn <= 0;
      m.rotation.set(0.4, this.time * 1.5 + i, 0.2);
      m.position.y = b.y + 1.3 + Math.sin(this.time * 2 + i) * 0.2;
    });
    for (const p of it.projectiles) {
      const o = this.shots.get(p.id);
      if (!o) continue;
      o.position.set(p.x, p.y, p.z);
      o.rotation.y = Math.atan2(p.vx, p.vz);
    }
    for (const m of it.mines) {
      const o = this.mines.get(m.id);
      if (!o) continue;
      o.position.set(m.x, m.y, m.z);
      const blink = o.getObjectByName('blink');
      if (blink) blink.visible = Math.sin(this.time * 8) > 0;
    }
    for (const [id, k] of this.karts) {
      const ks = it.kart(id);
      k.shield.visible = ks.shield > 0;
      k.shield.scale.setScalar(1 + Math.sin(this.time * 6) * 0.03);
      k.flame.visible = ks.boost > 0;
      k.flame.scale.set(1, 1, 0.8 + Math.random() * 0.5);
      k.hop.position.y = ks.hop > 0 ? Math.sin((ks.hop / 0.3) * Math.PI) * 0.35 : 0;
      // drift sparks behind the rear wheels, colour by boost level
      const lvl = driftLevel(ks);
      if (ks.drift !== 0 && lvl > 0 && Math.random() < 0.8) {
        const g = k.visual.group;
        const back = new THREE.Vector3(ks.drift * 0.7, 0.1, -1.1).applyQuaternion(g.quaternion).add(g.position);
        this.particles.emit(back.x, back.y, back.z, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, SPARK[lvl - 1], 0.45, 0.35, 4);
      }
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      d.vel.y -= 18 * dt;
      d.obj.position.addScaledVector(d.vel, dt);
      d.obj.rotation.x += d.spin.x * dt;
      d.obj.rotation.y += d.spin.y * dt;
      d.obj.rotation.z += d.spin.z * dt;
      if (d.life <= 0) {
        d.obj.removeFromParent();
        this.debris.splice(i, 1);
      }
    }
  }

  dispose() {
    this.group.removeFromParent();
    for (const k of this.karts.values()) {
      k.shield.removeFromParent();
      k.flame.removeFromParent();
      k.hop.removeFromParent();
    }
  }
}
