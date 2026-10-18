import { describe, expect, it } from 'vitest';
import { AIDriver } from './ai';
import { CARS, carsForClass, getCar } from './cars';
import { CAR_HALF_WIDTH, collideCars, createCarState, forwardSpeed, stepCar } from './physics';
import { Race, type Slot } from './race';
import { gridPosition, WALL_OFFSET } from './track';
import { getTrack, TRACK_DEFS } from './tracks';

const DT = 1 / 60;

describe('track', () => {
  for (const def of TRACK_DEFS) {
    it(`${def.id}: builds and projects consistently`, () => {
      const t = getTrack(def.id);
      // micro tracks on a table are short by nature
      expect(t.length).toBeGreaterThan(def.class === 'micro' ? 600 : 1500);
      for (const s of [0, 123.4, t.length / 2, t.length - 1]) {
        const p = t.pointAt(s, 3);
        const pr = t.project(p.x, p.z);
        const ds = Math.abs(pr.s - s);
        expect(Math.min(ds, t.length - ds)).toBeLessThan(0.5);
        expect(pr.lat).toBeCloseTo(3, 1);
      }
    });

    it(`${def.id}: does not self-intersect (separate sections stay apart)`, () => {
      const t = getTrack(def.id);
      const clearance = t.maxHalfWidth * 2 + WALL_OFFSET * 2 + 6;
      let min = Infinity, where = '';
      for (let i = 0; i < t.n; i += 3) {
        for (let j = i + 3; j < t.n; j += 3) {
          const along = Math.min(j - i, t.n - (j - i)) * t.ds;
          if (along < 120) continue;
          const d = Math.hypot(t.px[i] - t.px[j], t.pz[i] - t.pz[j]);
          if (d < min) {
            min = d;
            where = `samples ${i} and ${j}`;
          }
        }
      }
      expect(min, where).toBeGreaterThan(clearance);
    });
  }
});

describe('physics', () => {
  it('accelerates on the straight and respects the barrier', () => {
    const t = getTrack('kuestenstrasse');
    const g = gridPosition(t, 0);
    const c = createCarState('a', t, g.x, g.z, g.heading);
    for (let k = 0; k < 60 * 5; k++) stepCar(c, CARS[0], { throttle: 1, brake: 0, steer: 0, handbrake: false }, t, DT);
    expect(forwardSpeed(c)).toBeGreaterThan(30);
    for (let k = 0; k < 60 * 3; k++) stepCar(c, CARS[0], { throttle: 1, brake: 0, steer: 1, handbrake: false }, t, DT);
    expect(Math.abs(c.lat)).toBeLessThanOrEqual(t.hw[c.idx] + WALL_OFFSET - CAR_HALF_WIDTH + 0.01);
  });

  it('separates overlapping cars', () => {
    const t = getTrack('alpenpass');
    const a = createCarState('a', t, 0, 0, Math.PI / 2);
    const b = createCarState('b', t, 1, 0, Math.PI / 2);
    collideCars(a, b, 1400, 1400);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(1.9);
  });
});

describe('speedway', () => {
  it('can be driven flat out: every car has enough grip at its real top speed in every corner', () => {
    const t = getTrack('speedway');
    for (const car of CARS) {
      // terminal speed where engine force equals drag + rolling resistance (see stepCar)
      let v = 0;
      for (let k = 0; k < 60 * 120; k++) v += (car.accel * Math.max(0, 1 - (v / car.topSpeed) ** 2) - v * 0.015 - 0.25) * DT;
      for (let i = 0; i < t.n; i++) {
        expect(v * v * Math.abs(t.curv[i]), `${car.id} (${(v * 3.6).toFixed(0)} km/h) at sample ${i}`).toBeLessThan(car.grip + t.bankGrip(i));
      }
    }
  });

  it('a car holding full throttle and only steering laps without hitting the wall', () => {
    const t = getTrack('speedway');
    const g = gridPosition(t, 0);
    const c = createCarState('a', t, g.x, g.z, g.heading);
    const ai = new AIDriver(1, 1);
    let wallHits = 0;
    for (let k = 0; k < 60 * 90; k++) {
      const inp = ai.update(c, CARS[1], t, DT);
      stepCar(c, CARS[1], { ...inp, throttle: 1, brake: 0 }, t, DT);
      if (c.impact > 2) wallHits++;
    }
    expect(wallHits).toBe(0);
    expect(forwardSpeed(c)).toBeGreaterThan(75);
  });
});

describe('offroad', () => {
  const lapWith = (trackId: string, carId: string, throttle: number | null, seconds: number) => {
    const t = getTrack(trackId);
    const g = gridPosition(t, 0);
    const c = createCarState('a', t, g.x, g.z, g.heading);
    const ai = new AIDriver(3, 1);
    const spec = getCar(carId);
    let flights = 0, longest = 0, wasAir = false;
    for (let k = 0; k < 60 * seconds; k++) {
      const inp = ai.update(c, spec, t, DT);
      // throttle=null: AI decides; otherwise hold a crawling pace
      if (throttle !== null) inp.throttle = forwardSpeed(c) < throttle ? 1 : 0;
      stepCar(c, spec, inp, t, DT);
      if (c.airborne && !wasAir) flights++;
      if (c.airborne) longest = Math.max(longest, c.airTime);
      wasAir = c.airborne;
      expect(Math.abs(c.lat)).toBeLessThan(t.hw[c.idx] + WALL_OFFSET);
    }
    return { flights, longest, c };
  };

  it('fast cars fly over the jumps and land on the track', () => {
    const r = lapWith('canyon', 'bergziege', null, 70);
    expect(r.flights).toBeGreaterThanOrEqual(3);
    expect(r.longest).toBeGreaterThan(0.6);
    expect(r.c.airborne).toBe(false);
  });

  it('crawling over the same jumps keeps the wheels on the ground', () => {
    const r = lapWith('canyon', 'bergziege', 6, 40);
    expect(r.longest).toBeLessThan(0.25);
  });

  it('mud slows the car down compared to dirt', () => {
    const t = getTrack('waldtrail');
    const speedAfter = (u: number) => {
      let i = 0;
      while (t.u[i] < u) i++;
      const c = createCarState('a', t, t.px[i], t.pz[i], Math.atan2(t.tx[i], t.tz[i]));
      c.vx = Math.sin(c.heading) * 25;
      c.vz = Math.cos(c.heading) * 25;
      for (let k = 0; k < 50; k++) stepCar(c, getCar('baron'), { throttle: 1, brake: 0, steer: 0, handbrake: false }, t, DT);
      return forwardSpeed(c);
    };
    expect(speedAfter(5.35)).toBeLessThan(speedAfter(4.5) - 1.5);
  });

  it('every track class has cars and the classes are disjoint', () => {
    expect(carsForClass('road').length).toBe(5);
    expect(carsForClass('offroad').length).toBe(4);
    expect(carsForClass('micro').length).toBe(3);
    expect(TRACK_DEFS.filter((d) => d.class === 'offroad').map((d) => d.id)).toEqual(['canyon', 'waldtrail']);
    expect(TRACK_DEFS.filter((d) => d.class === 'micro').map((d) => d.id)).toEqual(['fruehstueck']);
  });
});

describe('race with AI drivers', () => {
  for (const def of TRACK_DEFS) {
    it(`${def.id}: all AI cars finish 2 laps`, () => {
      const t = getTrack(def.id);
      const pool = carsForClass(t.carClass);
      const slots: Slot[] = Array.from({ length: 6 }, (_, k) => ({
        id: `ai${k}`, name: `AI ${k}`, carId: pool[k % pool.length].id, isAI: true, ownerId: '', grid: k,
      }));
      const race = new Race(t, 2, slots, 0.5);
      const cars = slots.map((s) => {
        const g = gridPosition(t, s.grid);
        return { slot: s, state: createCarState(s.id, t, g.x, g.z, g.heading), ai: new AIDriver(s.grid, 0.9 + s.grid * 0.015) };
      });
      const states = cars.map((c) => c.state);
      let steps = 0, maxAir = 0;
      const maxSteps = 60 * 60 * 10;
      while (race.phase !== 'finished' && steps < maxSteps) {
        if (race.started) {
          for (const c of cars) {
            const spec = getCar(c.slot.carId);
            stepCar(c.state, spec, c.ai.update(c.state, spec, t, DT, states), t, DT);
            if (c.state.airborne) maxAir = Math.max(maxAir, c.state.airTime);
          }
          for (let i = 0; i < states.length; i++)
            for (let j = i + 1; j < states.length; j++) collideCars(states[i], states[j], 1400, 1400);
        }
        race.update(DT, (id) => states.find((s) => s.id === id)!.s);
        steps++;
      }
      const res = race.results();
      const avgLap = res.reduce((s, r) => s + r.bestLap, 0) / res.length;
      console.log(`${def.id}: length ${t.length.toFixed(0)} m, winner ${res[0].time.toFixed(1)} s, avg best lap ${avgLap.toFixed(1)} s, longest flight ${maxAir.toFixed(2)} s`);
      expect(res.every((r) => r.finished)).toBe(true);
      // road tracks have no jumps: at most tiny hops over crests
      if (!def.jumps) expect(maxAir).toBeLessThan(0.3);
      else expect(maxAir).toBeGreaterThan(0.6);
    });
  }
});
