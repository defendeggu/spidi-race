import { describe, expect, it } from 'vitest';
import { carsForClass, getCar } from './cars';
import { forwardSpeed, NO_INPUT, type CarInput } from './physics';
import { BLOCK_INNER, createTownCar, getTown, stepCarTown, TOWN_HALF } from './town';
import { TaskTracker } from './townTasks';
import { TRACK_DEFS } from './tracks';
import { Traffic } from './traffic';

const DT = 1 / 60;
const town = getTown();
const FULL: CarInput = { throttle: 1, brake: 0, steer: 0, handbrake: false };

describe('practice town', () => {
  it('has the town cars and no race track uses them', () => {
    expect(carsForClass('town').map((c) => c.id)).toEqual(['familie', 'taxi', 'polizei', 'feuerwehr', 'kaito-stadt']);
    expect(TRACK_DEFS.some((d) => d.class === 'town')).toBe(false);
  });

  it('spawns, star spots and free parking bays are not inside obstacles', () => {
    for (let k = 0; k < 2; k++) {
      const s = town.spawn(k);
      expect(town.isFree(s.x, s.z, 3)).toBe(true);
    }
    for (const s of town.starSpots) expect(town.isFree(s.x, s.z, 2)).toBe(true);
    const free = town.bays.filter((b) => b.parked < 0);
    expect(free.length).toBeGreaterThan(10);
    for (const b of free) expect(town.isFree(b.x, b.z, 1.2)).toBe(true);
  });

  it('a car at full throttle into a building stays outside and bounces off', () => {
    // a shop on the north edge of its block, approached head-on from the street in front of it
    const block = town.blocks.find((b) => b.kind === 'shop')!;
    const shop = town.buildings.find((b) => b.rot === 0 && Math.abs(b.x - block.cx) < 30 && Math.abs(b.z - block.cz) < 45)!;
    const c = createTownCar('t', { x: shop.x, z: block.cz + 50, heading: Math.PI });
    const spec = getCar('familie');
    let maxImpact = 0;
    for (let i = 0; i < 60 * 8; i++) {
      stepCarTown(c, spec, FULL, town, DT);
      maxImpact = Math.max(maxImpact, c.impact);
      expect(c.z).toBeGreaterThan(shop.z + shop.d / 2 - 0.3);
    }
    expect(maxImpact).toBeGreaterThan(5);
  });

  it('gardens and courtyards can be entered from the street', () => {
    // from the sidewalk, some straight path into the block centre area is free of buildings on every side
    for (const b of town.blocks.filter((k) => k.kind === 'house' || k.kind === 'shop')) {
      let open = 0;
      for (const [fx, fz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        for (let lat = -30; lat <= 30; lat += 1) {
          let free = true;
          for (let d = BLOCK_INNER + 1; d > 12 && free; d -= 1) {
            const x = b.cx + fx * d + fz * lat, z = b.cz + fz * d + fx * lat;
            free = town.isFree(x, z, 1.4);
          }
          if (free) {
            open++;
            break;
          }
        }
      }
      expect(open, `block ${b.i},${b.j}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('buildings do not overlap each other or the streets', () => {
    const bs = town.buildings;
    const outside: string[] = [], overlaps: string[] = [];
    for (const b of bs) {
      const block = town.blockAt(b.x, b.z)!;
      if (Math.abs(b.x - block.cx) + b.w / 2 > BLOCK_INNER + 0.01 || Math.abs(b.z - block.cz) + b.d / 2 > BLOCK_INNER + 0.01) outside.push(b.model);
      for (const o of bs) {
        if (o === b) continue;
        if (Math.abs(b.x - o.x) < (b.w + o.w) / 2 - 0.5 && Math.abs(b.z - o.z) < (b.d + o.d) / 2 - 0.5) overlaps.push(`${b.model}@${b.x},${b.z}`);
      }
    }
    expect(bs.length).toBeGreaterThan(300);
    expect(outside).toEqual([]);
    expect(overlaps).toEqual([]);
  });

  it('town cars are gentle: about 70 km/h at most (the formula car a bit more)', () => {
    for (const spec of carsForClass('town')) {
      const c = createTownCar('t', { x: -450, z: -450, heading: 0 });
      for (let i = 0; i < 60 * 25; i++) stepCarTown(c, spec, FULL, town, DT);
      const kmh = forwardSpeed(c) * 3.6;
      expect(kmh).toBeGreaterThan(50);
      expect(kmh).toBeLessThan(spec.id === 'kaito-stadt' ? 100 : 75);
    }
  });

  it('the wall keeps cars inside the town', () => {
    const c = createTownCar('t', { x: 0, z: TOWN_HALF - 40, heading: 0 });
    for (let i = 0; i < 60 * 10; i++) stepCarTown(c, getCar('feuerwehr'), FULL, town, DT);
    expect(c.z).toBeLessThan(TOWN_HALF);
  });
});

describe('town traffic', () => {
  it('drives for 5 minutes without overlaps or getting stuck', () => {
    const traffic = new Traffic(22, 5);
    expect(traffic.cars.length).toBe(22);
    let closest = Infinity;
    for (let i = 0; i < 60 * 300; i++) {
      traffic.step(DT, []);
      if (i % 10 !== 0) continue;
      const cs = traffic.cars;
      for (let a = 0; a < cs.length; a++)
        for (let b = a + 1; b < cs.length; b++) {
          closest = Math.min(closest, Math.hypot(cs[a].state.x - cs[b].state.x, cs[a].state.z - cs[b].state.z));
        }
    }
    expect(closest).toBeGreaterThan(3);
    for (const c of traffic.cars) expect(c.odometer).toBeGreaterThan(400);
    for (const c of traffic.cars) expect(town.isFree(c.state.x, c.state.z, 1)).toBe(true);
  });

  it('waits behind a player standing in its lane', () => {
    const traffic = new Traffic(1, 3);
    const car = traffic.cars[0];
    const s = car.state;
    const player = { x: s.x + Math.sin(s.heading) * 20, z: s.z + Math.cos(s.heading) * 20 };
    for (let i = 0; i < 60 * 10; i++) traffic.step(DT, [player]);
    const d = Math.hypot(s.x - player.x, s.z - player.z);
    expect(d).toBeGreaterThan(5);
    expect(d).toBeLessThan(12);
    expect(car.speed).toBeLessThan(0.5);
  });
});

describe('practice tasks', () => {
  it('collecting a star counts and picks a new one', () => {
    const c = createTownCar('t', town.spawn(0));
    const t = new TaskTracker(town, 'stars', 1);
    t.next(c, []);
    const first = t.target!;
    expect(Math.hypot(first.x - c.x, first.z - c.z)).toBeGreaterThan(80);
    expect(t.update(c, DT)).toBe(false);
    c.x = first.x + 2;
    c.z = first.z;
    expect(t.update(c, DT)).toBe(true);
  });

  it('parking needs the right position, angle and one second standing still', () => {
    expect(town.blocks.filter((b) => b.kind === 'parking').length).toBe(5);
    const t = new TaskTracker(town, 'parking', 2);
    const c = createTownCar('t', town.spawn(0));
    t.next(c, []);
    const bay = t.target!;
    expect(town.bays[bay.bay].parked).toBe(-1);
    // reversed into the bay counts, too
    Object.assign(c, { x: bay.x + 0.3, z: bay.z - 0.5, heading: bay.heading + Math.PI + 0.1, vx: 0, vz: 0 });
    let done = false;
    for (let i = 0; i < 50; i++) done ||= t.update(c, DT);
    expect(done).toBe(false);
    for (let i = 0; i < 20; i++) done ||= t.update(c, DT);
    expect(done).toBe(true);
    // crooked: no
    const t2 = new TaskTracker(town, 'parking', 2);
    t2.next(c, []);
    Object.assign(c, { x: t2.target!.x, z: t2.target!.z, heading: t2.target!.heading + 0.8 });
    for (let i = 0; i < 120; i++) expect(t2.update(c, DT)).toBe(false);
  });

  it('two players never get the same goal', () => {
    const c = createTownCar('t', town.spawn(0));
    for (const task of ['stars', 'parking'] as const) {
      const a = new TaskTracker(town, task, 7), b = new TaskTracker(town, task, 7);
      for (let k = 0; k < 30; k++) {
        a.next(c, [b.target]);
        b.next(c, [a.target]);
        expect(a.target!.x !== b.target!.x || a.target!.z !== b.target!.z).toBe(true);
      }
    }
  });

  it('free driving has no goal', () => {
    const t = new TaskTracker(town, 'free', 1);
    t.next(createTownCar('t', town.spawn(0)), []);
    expect(t.target).toBeNull();
    expect(t.update(createTownCar('t', town.spawn(0)), DT)).toBe(false);
    void NO_INPUT;
  });
});
