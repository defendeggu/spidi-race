import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { personAt, townPeople, type CarState, type PersonRoute, type TownMap } from '@spidi/shared';
import { assetsReady, getClips, getModel, PEOPLE_MODELS } from './assets';

/** only people this close to a player are drawn and animated (m) */
const VIEW = 180;
/** a car closer than this makes a pedestrian step aside (m) – too late for a car that comes fast */
const DODGE = 4;
const ADULT_HEIGHT = 1.75;
const CHILD_HEIGHT = 1.15;
const DOG_HEIGHT = 0.6;
/** a car this close (from either end of the car) to a person, dog or pram has hit them (m) */
const HIT = 1.5;
/** the same person counts once within this time (s) */
const HIT_COOLDOWN = 3;

interface Animated {
  obj: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  walk?: THREE.AnimationAction;
  idle?: THREE.AnimationAction;
}

interface Walker {
  route: PersonRoute;
  body: Animated;
  dog?: Animated;
  leash?: THREE.Line;
  pram?: THREE.Object3D;
  /** sideways step away from a car */
  offset: THREE.Vector2;
  moving: boolean;
  /** time of the last hit per car index (cooldown) */
  hitAt: number[];
}

/** A Kenney model (skinned, animated) scaled to the given height, feet on the ground. */
function animated(name: string, height: number): Animated | null {
  const src = getModel(name);
  if (!src) return null;
  const obj = cloneSkinned(src);
  const size = new THREE.Box3().setFromObject(src).getSize(new THREE.Vector3());
  obj.scale.setScalar(height / Math.max(0.01, size.y));
  // the bounding spheres of skinned meshes do not follow the animation
  obj.traverse((o) => (o.frustumCulled = false));
  const holder = new THREE.Group();
  holder.add(obj);
  const mixer = new THREE.AnimationMixer(obj);
  const clip = (n: string) => getClips(name).find((c) => c.name === n);
  const action = (n: string) => {
    const c = clip(n);
    return c ? mixer.clipAction(c) : undefined;
  };
  return { obj: holder, mixer, walk: action('walk'), idle: action('idle') };
}

/** A pram: tub with a hood on four wheels and a push bar (procedural, no kit has one). */
function pram(color: string): THREE.Object3D {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: '#2a2a2a' });
  const tub = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.78), paint);
  tub.position.set(0, 0.62, 0);
  const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.5, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), paint);
  hood.position.set(0, 0.78, -0.22);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.04), dark);
  bar.position.set(0, 1.0, -0.62);
  g.add(tub, hood, bar);
  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.42), dark);
    rail.position.set(sx * 0.24, 0.88, -0.48);
    rail.rotation.x = 0.7;
    g.add(rail);
    for (const z of [-0.28, 0.28]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 12).rotateZ(Math.PI / 2), dark);
      wheel.position.set(sx * 0.27, 0.13, z);
      g.add(wheel);
    }
  }
  return g;
}

const PRAM_COLORS = ['#3a5f8a', '#8a3a5a', '#4a7a4a', '#6a6a72'];

/**
 * The pedestrians of the practice town (routes from shared/townPeople): Kenney Mini Characters with
 * their walk and sit animations, children smaller, dogs on a leash, prams. They step aside when a
 * car comes close – nobody gets run over.
 */
export class TownPeople {
  readonly group = new THREE.Group();
  private walkers: Walker[] = [];

  constructor(town: TownMap) {
    if (!assetsReady()) return;
    for (const route of townPeople(town)) {
      const name = `pp-${PEOPLE_MODELS[route.model % PEOPLE_MODELS.length]}`;
      const body = animated(name, route.kind === 'child' ? CHILD_HEIGHT : ADULT_HEIGHT);
      if (!body) continue;
      const w: Walker = { route, body, offset: new THREE.Vector2(), moving: false, hitAt: [] };
      this.group.add(body.obj);
      if (route.kind === 'sitter') {
        const sit = getClips(name).find((c) => c.name === 'sit');
        if (sit) body.mixer.clipAction(sit).play();
      } else body.idle?.play();
      if (route.kind === 'dog') {
        w.dog = animated('pet-animal-dog', DOG_HEIGHT) ?? undefined;
        if (w.dog) {
          this.group.add(w.dog.obj);
          w.dog.idle?.play();
          w.leash = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#c0392b' }));
          w.leash.frustumCulled = false;
          this.group.add(w.leash);
        }
      }
      if (route.kind === 'pram') {
        w.pram = pram(PRAM_COLORS[route.model % PRAM_COLORS.length]);
        this.group.add(w.pram);
      }
      // start the animations at different points, so the crowd does not walk in step
      body.mixer.update(route.phase % 3);
      this.walkers.push(w);
    }
  }

  /**
   * Move everybody to where the game time puts them; cars (the players) make them step aside.
   * Returns the indices of the cars that ran into someone (a person, a dog or a pram) in this frame.
   */
  update(t: number, dt: number, cars: CarState[]): number[] {
    const hits: number[] = [];
    for (const w of this.walkers) {
      const r = w.route;
      const home = r.pts[0];
      const near = cars.some((c) => Math.abs(c.x - home.x) < VIEW + 60 && Math.abs(c.z - home.z) < VIEW + 60);
      const pose = personAt(r, t);
      const seen = near && cars.some((c) => Math.hypot(c.x - pose.x, c.z - pose.z) < VIEW);
      const wasShown = w.body.obj.visible;
      this.show(w, seen);
      if (!seen) continue;

      // ran into: the person, the dog or the pram – where they were drawn in the last frame, as the player
      // saw them – is within reach of either end of a moving car
      const parts = !wasShown ? [] : [w.body.obj.position, ...(w.dog ? [w.dog.obj.position] : []), ...(w.pram ? [w.pram.position] : [])];
      cars.forEach((c, k) => {
        if (Math.hypot(c.vx, c.vz) < 2 || c.y > 1.5 || t - (w.hitAt[k] ?? -1e9) < HIT_COOLDOWN) return;
        const cx = Math.sin(c.heading) * 1.3, cz = Math.cos(c.heading) * 1.3;
        const hit = parts.some((p) => Math.hypot(p.x - c.x - cx, p.z - c.z - cz) < HIT || Math.hypot(p.x - c.x + cx, p.z - c.z + cz) < HIT);
        if (!hit) return;
        w.hitAt[k] = t;
        hits.push(k);
        // knocked aside (and back on the feet a moment later)
        const ax = w.body.obj.position.x - c.x, az = w.body.obj.position.z - c.z, d = Math.hypot(ax, az) || 1;
        w.offset.set(w.offset.x + (ax / d) * 3, w.offset.y + (az / d) * 3);
      });

      // step aside: away from the nearest car, back again once it has passed
      let tx = 0, tz = 0;
      for (const c of cars) {
        const dx = pose.x + w.offset.x - c.x, dz = pose.z + w.offset.y - c.z, d = Math.hypot(dx, dz);
        if (d < DODGE && d > 1e-3) {
          tx += (dx / d) * (DODGE - d + 1.5);
          tz += (dz / d) * (DODGE - d + 1.5);
        }
      }
      // quick to jump aside, slow to walk back onto the way
      const dodging = tx !== 0 || tz !== 0;
      const k = Math.min(1, dt * (dodging ? 5 : 1.5));
      w.offset.x += (tx - w.offset.x) * k;
      w.offset.y += (tz - w.offset.y) * k;
      const len = w.offset.length();
      if (len > 4) w.offset.multiplyScalar(4 / len);
      const x = pose.x + w.offset.x, z = pose.z + w.offset.y;

      const moving = pose.moving || dodging;
      if (moving !== w.moving && r.kind !== 'sitter') {
        w.moving = moving;
        const [from, to] = moving ? [w.body.idle, w.body.walk] : [w.body.walk, w.body.idle];
        to?.reset().play();
        if (from && to) from.crossFadeTo(to, 0.25, false);
        if (w.dog) {
          const [df, dt2] = moving ? [w.dog.idle, w.dog.walk] : [w.dog.walk, w.dog.idle];
          dt2?.reset().play();
          if (df && dt2) df.crossFadeTo(dt2, 0.25, false);
        }
      }
      if (w.body.walk) w.body.walk.timeScale = r.speed / 1.2;
      w.body.obj.position.set(x, dodging ? Math.abs(Math.sin(t * 9)) * 0.25 : 0, z);
      w.body.obj.rotation.y = pose.heading;
      w.body.mixer.update(dt);

      const fx = Math.sin(pose.heading), fz = Math.cos(pose.heading);
      if (w.dog && w.leash) {
        // the dog trots ahead and a little to the side, on a leash from the hand
        const dx = x + fx * 1.8 + fz * 0.5, dz = z + fz * 1.8 - fx * 0.5;
        w.dog.obj.position.set(dx, 0, dz);
        w.dog.obj.rotation.y = pose.heading;
        w.dog.mixer.update(dt);
        const pos = w.leash.geometry.attributes.position as THREE.BufferAttribute;
        pos.setXYZ(0, x + fz * 0.3 + fx * 0.2, 0.85, z - fx * 0.3 + fz * 0.2);
        pos.setXYZ(1, dx + fx * 0.25, 0.42, dz + fz * 0.25);
        pos.needsUpdate = true;
      }
      if (w.pram) {
        w.pram.position.set(x + fx * 0.95, 0, z + fz * 0.95);
        w.pram.rotation.y = pose.heading;
      }

    }
    return hits;
  }

  private show(w: Walker, on: boolean) {
    w.body.obj.visible = on;
    if (w.dog) w.dog.obj.visible = on;
    if (w.leash) w.leash.visible = on;
    if (w.pram) w.pram.visible = on;
  }
}
