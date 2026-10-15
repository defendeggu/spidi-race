import { describe, expect, it } from 'vitest';
import { AIDriver } from './ai';
import { carsForClass, getCar } from './cars';
import { ItemWorld, rollItem, ITEM_WEIGHTS } from './items';
import { DRIFT_BOOST, driftLevel, newKartState, stepKart } from './kart';
import { KartBrain } from './kartAi';
import { sanitizeSubmission } from './leaderboard';
import { mulberry32 } from './math';
import { collideCars, createCarState, forwardSpeed, type CarInput } from './physics';
import { Race, type Slot } from './race';
import { gridPosition } from './track';
import { getTrack, TRACK_DEFS } from './tracks';

const DT = 1 / 60;
const FULL: CarInput = { throttle: 1, brake: 0, steer: 0, handbrake: false };

describe('kart items', () => {
  it('weights follow the race position: the leader gets mines, the last one turbos', () => {
    const rnd = mulberry32(5);
    const count = (pos: number) => {
      const c: Record<string, number> = {};
      for (let i = 0; i < 10000; i++) {
        const k = rollItem(pos, 8, rnd);
        c[k] = (c[k] ?? 0) + 1;
      }
      return c;
    };
    const first = count(1), last = count(8);
    expect(first.turbo ?? 0).toBe(0);
    expect(first.mine).toBeGreaterThan(3500);
    expect(last.turbo).toBeGreaterThan(4000);
    expect(last.mine).toBeLessThan(800);
    expect(Object.keys(ITEM_WEIGHTS)).toHaveLength(5);
  });

  it('driving through an item box rolls an item after the roulette', () => {
    const t = getTrack('alpenpass');
    const w = new ItemWorld(t, ['a'], 1);
    const box = w.boxes[0];
    const c = createCarState('a', t, box.x, box.z, 0);
    w.step(DT, [c], () => 1, () => null);
    expect(w.kart('a').rolling).toBeGreaterThan(0);
    expect(box.respawn).toBeGreaterThan(0);
    for (let i = 0; i < 70; i++) w.step(DT, [c], () => 1, () => null);
    expect(w.kart('a').item).not.toBeNull();
    expect(w.events.some((e) => e.type === 'granted')).toBe(true);
  });

  it('a blaster shot hits the kart ahead: spin-out, then a moment of immunity', () => {
    const t = getTrack('speedway');
    const w = new ItemWorld(t, ['a', 'b'], 1);
    const p = t.pointAt(200, 0), q = t.pointAt(225, 0);
    const a = createCarState('a', t, p.x, p.z, p.heading), b = createCarState('b', t, q.x, q.z, q.heading);
    w.kart('a').item = 'blaster';
    w.use('a');
    let hit = false;
    for (let i = 0; i < 120 && !hit; i++) {
      w.step(DT, [a, b], () => 1, () => 'b');
      hit = w.events.some((e) => e.type === 'hit' && e.victim === 'b');
    }
    expect(hit).toBe(true);
    const kb = w.kart('b');
    expect(kb.spin).toBeGreaterThan(1);
    expect(w.kart('a').hitsGiven).toBe(1);
    // a mine right under b now does nothing (immune)
    w.mines.push({ id: 99, owner: 'a', x: b.x, y: b.y, z: b.z, age: 5 });
    w.step(DT, [a, b], () => 1, () => null);
    expect(w.mines).toHaveLength(1);
  });

  it('a shield blocks one hit', () => {
    const t = getTrack('speedway');
    const w = new ItemWorld(t, ['a', 'b'], 1);
    const p = t.pointAt(300, 0);
    const b = createCarState('b', t, p.x, p.z, p.heading);
    w.kart('b').item = 'shield';
    w.use('b');
    w.step(DT, [b], () => 1, () => null);
    expect(w.kart('b').shield).toBeGreaterThan(4);
    w.mines.push({ id: 7, owner: 'a', x: b.x, y: b.y, z: b.z, age: 5 });
    w.step(DT, [b], () => 1, () => null);
    expect(w.events.some((e) => e.type === 'blocked')).toBe(true);
    expect(w.kart('b').spin).toBe(0);
    expect(w.kart('b').shield).toBe(0);
  });

  it('a blaster bounces off the barriers at most 3 times and disappears after 8 s', () => {
    const t = getTrack('downtown');
    const w = new ItemWorld(t, ['a'], 1);
    const p = t.pointAt(100, 0);
    const a = createCarState('a', t, p.x, p.z, p.heading + 1.2);
    w.kart('a').item = 'blaster';
    w.use('a');
    w.step(DT, [a], () => 1, () => null);
    expect(w.projectiles).toHaveLength(1);
    let gone = -1;
    for (let i = 0; i < 60 * 9 && gone < 0; i++) {
      w.step(DT, [], () => 1, () => null);
      const d = w.events.find((e) => e.type === 'destroy');
      if (d && d.type === 'destroy') gone = i;
    }
    expect(gone).toBeGreaterThan(0);
    expect(w.projectiles).toHaveLength(0);
  });
});

describe('kart driving', () => {
  it('a drift charges a boost that fires on release', () => {
    const t = getTrack('speedway');
    const spec = getCar('kart-oobi');
    const p = t.pointAt(50, 0);
    const c = createCarState('k', t, p.x, p.z, p.heading);
    const ks = newKartState('k');
    for (let i = 0; i < 60 * 4; i++) stepKart(c, spec, FULL, t, DT, ks);
    for (let i = 0; i < 60; i++) stepKart(c, spec, { ...FULL, steer: 0.35, handbrake: true }, t, DT, ks);
    expect(ks.drift).not.toBe(0);
    expect(driftLevel(ks)).toBe(1);
    stepKart(c, spec, FULL, t, DT, ks);
    expect(ks.boost).toBeCloseTo(DRIFT_BOOST[1] - DT, 2);
    expect(ks.spin).toBe(0);
    // longer drifts reach the higher levels
    expect([0.3, 0.7, 1.3, 2.5].map((d) => driftLevel({ ...ks, driftTime: d }))).toEqual([0, 1, 2, 3]);
  });

  it('a boost makes the kart faster than its top speed', () => {
    const t = getTrack('speedway');
    const spec = getCar('kart-oobi');
    const p = t.pointAt(50, 0);
    const c = createCarState('k', t, p.x, p.z, p.heading);
    const ks = newKartState('k');
    for (let i = 0; i < 60 * 12; i++) stepKart(c, spec, FULL, t, DT, ks);
    const normal = forwardSpeed(c);
    ks.boost = 3;
    for (let i = 0; i < 60 * 2.5; i++) stepKart(c, spec, FULL, t, DT, ks);
    expect(forwardSpeed(c)).toBeGreaterThan(normal * 1.1);
  });

  it('kart boards accept karts only, with room for boosts', () => {
    const ok = { name: 'Lea', carId: 'kart-oobi', trackId: 'kart:alpenpass', laps: 2, time: 200, bestLap: 95, mode: 'solo' as const };
    expect(sanitizeSubmission(ok)).toMatchObject({ trackId: 'kart:alpenpass' });
    expect(sanitizeSubmission({ ...ok, carId: 'falcone' })).toBeNull();
    expect(sanitizeSubmission({ ...ok, trackId: 'kart:fruehstueck' })).toBeNull();
    expect(sanitizeSubmission({ ...ok, bestLap: 50, time: 110 })).toBeNull();
    expect(sanitizeSubmission({ ...ok, trackId: 'alpenpass' })).toBeNull();
  });
});

describe('kart race with AI and items', () => {
  for (const def of TRACK_DEFS.filter((d) => (d.class ?? 'road') !== 'micro')) {
    it(`${def.id}: 8 AI karts with items all finish 2 laps`, () => {
      const t = getTrack(def.id);
      const pool = carsForClass('kart');
      const slots: Slot[] = Array.from({ length: 8 }, (_, k) => ({
        id: `ai${k}`, name: `AI ${k}`, carId: pool[k % pool.length].id, isAI: true, ownerId: '', grid: k,
      }));
      const race = new Race(t, 2, slots, 0.5);
      const items = new ItemWorld(t, slots.map((s) => s.id), 3);
      const cars = slots.map((s) => {
        const g = gridPosition(t, s.grid);
        return { slot: s, state: createCarState(s.id, t, g.x, g.z, g.heading), ai: new AIDriver(s.grid, 0.9 + s.grid * 0.012), brain: new KartBrain(s.grid) };
      });
      const states = cars.map((c) => c.state);
      const pos = (id: string) => race.entry(id)!.position;
      const ahead = (id: string) => race.entries.find((e) => e.position === pos(id) - 1)?.id ?? null;
      let steps = 0, used = 0, hits = 0;
      while (race.phase !== 'finished' && steps < 60 * 60 * 12) {
        if (race.started) {
          for (const c of cars) {
            const spec = getCar(c.slot.carId);
            const base = c.ai.update(c.state, spec, t, DT, states);
            const { input, use } = c.brain.update(c.state, base, t, items, states, DT);
            if (use) items.use(c.state.id);
            stepKart(c.state, spec, input, t, DT, items.kart(c.state.id));
          }
          for (let i = 0; i < states.length; i++)
            for (let j = i + 1; j < states.length; j++) collideCars(states[i], states[j], 600, 600);
          items.step(DT, states, pos, ahead);
          used += items.events.filter((e) => e.type === 'use').length;
          hits += items.events.filter((e) => e.type === 'hit').length;
          items.events.length = 0;
        }
        race.update(DT, (id) => states.find((s) => s.id === id)!.s);
        steps++;
      }
      const res = race.results();
      console.log(`kart ${def.id}: winner ${res[0].time.toFixed(1)} s, items used ${used}, hits ${hits}`);
      expect(res.every((r) => r.finished)).toBe(true);
      expect(used).toBeGreaterThan(10);
      expect(hits).toBeGreaterThan(0);
    });
  }
});
