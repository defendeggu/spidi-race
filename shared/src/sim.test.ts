import { describe, expect, it } from 'vitest';
import { AIDriver } from './ai';
import { CARS, getCar } from './cars';
import { CAR_HALF_WIDTH, collideCars, createCarState, forwardSpeed, stepCar } from './physics';
import { Race, type Slot } from './race';
import { gridPosition, WALL_OFFSET } from './track';
import { getTrack, TRACK_DEFS } from './tracks';

const DT = 1 / 60;

describe('track', () => {
  for (const def of TRACK_DEFS) {
    it(`${def.id}: builds and projects consistently`, () => {
      const t = getTrack(def.id);
      expect(t.length).toBeGreaterThan(1500);
      for (const s of [0, 123.4, t.length / 2, t.length - 1]) {
        const p = t.pointAt(s, 3);
        const pr = t.project(p.x, p.z);
        expect(Math.abs(pr.s - s)).toBeLessThan(0.5);
        expect(pr.lat).toBeCloseTo(3, 1);
      }
    });

    it(`${def.id}: does not self-intersect (separate sections stay apart)`, () => {
      const t = getTrack(def.id);
      const clearance = t.maxHalfWidth * 2 + WALL_OFFSET * 2 + 6;
      for (let i = 0; i < t.n; i += 3) {
        for (let j = 0; j < t.n; j += 3) {
          const along = Math.min(Math.abs(i - j), t.n - Math.abs(i - j)) * t.ds;
          if (along < 120) continue;
          const d = Math.hypot(t.px[i] - t.px[j], t.pz[i] - t.pz[j]);
          expect(d, `samples ${i} and ${j}`).toBeGreaterThan(clearance);
        }
      }
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

describe('race with AI drivers', () => {
  for (const def of TRACK_DEFS) {
    it(`${def.id}: all AI cars finish 2 laps`, () => {
      const t = getTrack(def.id);
      const slots: Slot[] = Array.from({ length: 6 }, (_, k) => ({
        id: `ai${k}`, name: `AI ${k}`, carId: CARS[k % CARS.length].id, isAI: true, ownerId: '', grid: k,
      }));
      const race = new Race(t, 2, slots, 0.5);
      const cars = slots.map((s) => {
        const g = gridPosition(t, s.grid);
        return { slot: s, state: createCarState(s.id, t, g.x, g.z, g.heading), ai: new AIDriver(s.grid, 0.9 + s.grid * 0.015) };
      });
      const states = cars.map((c) => c.state);
      let steps = 0;
      const maxSteps = 60 * 60 * 10;
      while (race.phase !== 'finished' && steps < maxSteps) {
        if (race.started) {
          for (const c of cars) {
            const spec = getCar(c.slot.carId);
            stepCar(c.state, spec, c.ai.update(c.state, spec, t, DT, states), t, DT);
          }
          for (let i = 0; i < states.length; i++)
            for (let j = i + 1; j < states.length; j++) collideCars(states[i], states[j], 1400, 1400);
        }
        race.update(DT, (id) => states.find((s) => s.id === id)!.s);
        steps++;
      }
      const res = race.results();
      const avgLap = res.reduce((s, r) => s + r.bestLap, 0) / res.length;
      console.log(`${def.id}: length ${t.length.toFixed(0)} m, winner ${res[0].time.toFixed(1)} s, avg best lap ${avgLap.toFixed(1)} s`);
      expect(res.every((r) => r.finished)).toBe(true);
    });
  }
});
