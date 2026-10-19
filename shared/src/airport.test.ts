import { describe, expect, it } from 'vitest';
import { AIDriver } from './ai';
import { AIRPORT, type Area } from './airport';
import { carsForClass, getCar } from './cars';
import { ItemWorld } from './items';
import { stepKart } from './kart';
import { KartBrain } from './kartAi';
import { kartBoardTrack, KART_PREFIX, sanitizeSubmission } from './leaderboard';
import { collideCars, createCarState, type CarState } from './physics';
import { Race, type Slot } from './race';
import { gridPosition, WALL_OFFSET, type Track } from './track';
import { getTrack, KART_TRACKS, RACE_TRACKS, TRACK_DEFS, trackInMode } from './tracks';

const DT = 1 / 60;
const road = getTrack('flughafen');
const kart = getTrack('flughafen-kart');

/** Distance from (x, z) to the centre line of a track. */
function centreDistance(t: Track, x: number, z: number) {
  const p = t.project(x, z);
  return Math.abs(p.lat);
}

/** Smallest corner radius within ±range metres of arc length s. */
function minRadius(t: Track, s: number, range: number) {
  const i0 = Math.floor(s / t.ds), k = Math.ceil(range / t.ds);
  let r = Infinity;
  for (let j = -k; j <= k; j++) r = Math.min(r, 1 / Math.max(1e-6, Math.abs(t.curv[(i0 + j + t.n) % t.n])));
  return r;
}

describe('track modes', () => {
  it('the road race airport is only a car race, the kart airport only a kart race', () => {
    const road = TRACK_DEFS.find((d) => d.id === 'flughafen')!, kartDef = TRACK_DEFS.find((d) => d.id === 'flughafen-kart')!;
    expect(trackInMode(road, 'race')).toBe(true);
    expect(trackInMode(road, 'kart')).toBe(false);
    expect(trackInMode(kartDef, 'race')).toBe(false);
    expect(trackInMode(kartDef, 'kart')).toBe(true);
    expect(RACE_TRACKS.map((d) => d.id)).toContain('flughafen');
    expect(RACE_TRACKS.map((d) => d.id)).not.toContain('flughafen-kart');
    expect(KART_TRACKS.map((d) => d.id)).toContain('flughafen-kart');
    expect(KART_TRACKS.map((d) => d.id)).not.toContain('flughafen');
  });

  it('all earlier tracks keep their modes: every one in the car race, all but micro in the kart race', () => {
    const earlier = ['alpenpass', 'kuestenstrasse', 'downtown', 'speedway', 'canyon', 'waldtrail', 'fruehstueck'];
    for (const id of earlier) {
      const d = TRACK_DEFS.find((t) => t.id === id)!;
      expect(trackInMode(d, 'race'), id).toBe(true);
      expect(trackInMode(d, 'kart'), id).toBe(id !== 'fruehstueck');
    }
  });

  it('kart boards exist only for kart tracks; car boards refuse the kart-only track', () => {
    expect(kartBoardTrack(KART_PREFIX + 'flughafen-kart')?.id).toBe('flughafen-kart');
    expect(kartBoardTrack(KART_PREFIX + 'flughafen')).toBeUndefined();
    expect(kartBoardTrack(KART_PREFIX + 'alpenpass')?.id).toBe('alpenpass');
    const base = { name: 'Lea', laps: 3, mode: 'solo' as const };
    // 3.4 km at 120 km/h: about 100 s per lap
    expect(sanitizeSubmission({ ...base, carId: 'kart-oobi', trackId: KART_PREFIX + 'flughafen-kart', time: 320, bestLap: 104 })).not.toBeNull();
    expect(sanitizeSubmission({ ...base, carId: 'falcone', trackId: 'flughafen-kart', time: 320, bestLap: 104 })).toBeNull();
    expect(sanitizeSubmission({ ...base, carId: 'kart-oobi', trackId: KART_PREFIX + 'flughafen', time: 320, bestLap: 104 })).toBeNull();
    expect(sanitizeSubmission({ ...base, carId: 'falcone', trackId: 'flughafen', laps: 2, time: 215, bestLap: 104 })).not.toBeNull();
    // impossibly fast: more than 35 % above the kart's top speed
    const top = getCar('kart-oobi').topSpeed;
    expect(sanitizeSubmission({ ...base, carId: 'kart-oobi', trackId: KART_PREFIX + 'flughafen-kart', laps: 1, time: 50, bestLap: kart.length / (top * 1.4) })).toBeNull();
  });
});

describe('airport tracks', () => {
  it('are flat (height 0, no banking) and have the planned lengths', () => {
    for (const t of [road, kart]) {
      for (let i = 0; i < t.n; i++) {
        expect(Math.abs(t.py[i])).toBeLessThan(1e-6);
        expect(t.bank[i]).toBe(0);
      }
    }
    expect(road.length).toBeGreaterThan(4000);
    expect(road.length).toBeLessThan(6000);
    expect(kart.length).toBeGreaterThan(2500);
    expect(kart.length).toBeLessThan(3600);
  });

  it('the road race has a long runway straight and goes under the taxiway bridge', () => {
    // the runway part (x = 0) is one straight piece
    const onRunway = [...road.px].filter((x) => Math.abs(x) < 1).length * road.ds;
    expect(onRunway).toBeGreaterThan(2000);
    const b = AIRPORT.bridge;
    const under = [...road.gallery.keys()].filter((i) => road.gallery[i]);
    expect(under.length).toBeGreaterThan(10);
    for (const i of under) {
      expect(Math.abs(road.px[i] - b.x)).toBeLessThan(b.length / 2);
      expect(Math.abs(road.pz[i] - b.z)).toBeLessThan(b.width);
    }
  });

  it('the kart race: a short runway straight, the hairpin is the tightest corner, karts fit everywhere', () => {
    const onRunway = [...kart.px].filter((x) => Math.abs(x) < 1).length * kart.ds;
    expect(onRunway).toBeGreaterThan(750);
    expect(onRunway).toBeLessThan(1200);
    let tightest = 0;
    for (let i = 0; i < kart.n; i++) if (Math.abs(kart.curv[i]) > Math.abs(kart.curv[tightest])) tightest = i;
    // the hairpin by the tower
    expect(Math.hypot(kart.px[tightest] - AIRPORT.tower.x, kart.pz[tightest] - AIRPORT.tower.z)).toBeLessThan(80);
    expect(1 / Math.abs(kart.curv[tightest])).toBeGreaterThan(15);
    for (let i = 0; i < kart.n; i++) expect(kart.hw[i] * 2).toBeGreaterThanOrEqual(11.5);
  });

  it('the item box rows are not on the straight nor in the tightest corner, with room to dodge', () => {
    const w = new ItemWorld(kart, ['a'], 1);
    const rows = [0.2, 0.55, 0.85].map((f) => f * kart.length);
    expect(w.boxes).toHaveLength(12);
    for (const s of rows) {
      const p = kart.pointAt(s, 0);
      // not on the runway straight
      expect(Math.abs(p.x), `row at ${s.toFixed(0)} m`).toBeGreaterThan(50);
      expect(kart.gallery[p.idx]).toBe(0);
      // no hairpin right there, wide enough to pass the boxes
      expect(minRadius(kart, s, 20)).toBeGreaterThan(60);
      expect(kart.hw[p.idx] * 2).toBeGreaterThanOrEqual(12);
    }
  });

  it('buildings, docks, planes and the tower stay clear of both roadways', () => {
    const margin = (t: Track) => t.maxHalfWidth + WALL_OFFSET + 3;
    const corners = (a: Area) => [[a.x - a.w / 2, a.z - a.d / 2], [a.x + a.w / 2, a.z - a.d / 2], [a.x - a.w / 2, a.z + a.d / 2], [a.x + a.w / 2, a.z + a.d / 2], [a.x, a.z]];
    const objects: [string, number[][]][] = [
      ['terminal', corners(AIRPORT.terminal)],
      ...AIRPORT.docks.map((d): [string, number[][]] => [d.name, corners(d)]),
      ...AIRPORT.hangars.map((h, i): [string, number[][]] => [`hangar ${i}`, corners(h)]),
      ['tower', [[AIRPORT.tower.x, AIRPORT.tower.z]]],
      // a plane: nose, tail (36 m behind) and both wing tips
      ...AIRPORT.planes.filter((p) => !(p.x === 470 && p.z === 315)).map((p, i): [string, number[][]] => {
        const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
        return [`plane ${i}`, [[p.x, p.z], [p.x - fx * 36, p.z - fz * 36], [p.x - fx * 18 + fz * 17, p.z - fz * 18 - fx * 17], [p.x - fx * 18 - fz * 17, p.z - fz * 18 + fx * 17]]];
      }),
    ];
    for (const [name, pts] of objects) {
      for (const t of [road, kart]) {
        for (const [x, z] of pts) expect(centreDistance(t, x, z), `${name} vs ${t.def.id}`).toBeGreaterThan(margin(t));
      }
    }
  });
});

describe('kart race on the airport', () => {
  it('AI karts with items finish, lap times about 1:30–2:00', () => {
    const pool = carsForClass('kart');
    const slots: Slot[] = Array.from({ length: 6 }, (_, k) => ({ id: `ai${k}`, name: `AI ${k}`, carId: pool[k % pool.length].id, isAI: true, ownerId: '', grid: k }));
    const race = new Race(kart, 1, slots, 0.5);
    const items = new ItemWorld(kart, slots.map((s) => s.id), 7);
    const cars = slots.map((s) => {
      const g = gridPosition(kart, s.grid);
      return { slot: s, state: createCarState(s.id, kart, g.x, g.z, g.heading), ai: new AIDriver(s.grid, 0.9 + s.grid * 0.012), brain: new KartBrain(s.grid) };
    });
    const states: CarState[] = cars.map((c) => c.state);
    const pos = (id: string) => race.entry(id)!.position;
    const ahead = (id: string) => race.entries.find((e) => e.position === pos(id) - 1)?.id ?? null;
    let steps = 0, used = 0, wall = 0;
    while (race.phase !== 'finished' && steps < 60 * 60 * 5) {
      if (race.started) {
        for (const c of cars) {
          const spec = getCar(c.slot.carId);
          const { input, use } = c.brain.update(c.state, c.ai.update(c.state, spec, kart, DT, states), kart, items, states, DT);
          if (use) items.use(c.state.id);
          stepKart(c.state, spec, input, kart, DT, items.kart(c.state.id));
          if (c.state.impact > 4) wall++;
        }
        for (let i = 0; i < states.length; i++) for (let j = i + 1; j < states.length; j++) collideCars(states[i], states[j], 600, 600);
        items.step(DT, states, pos, ahead);
        used += items.events.filter((e) => e.type === 'use').length;
        items.events.length = 0;
      }
      race.update(DT, (id) => states.find((s) => s.id === id)!.s);
      steps++;
    }
    const res = race.results();
    expect(res.every((r) => r.finished)).toBe(true);
    const best = Math.min(...res.map((r) => r.bestLap));
    expect(best).toBeGreaterThan(80);
    expect(best).toBeLessThan(130);
    expect(used).toBeGreaterThan(3);
    // they do not hang on the barriers all the time: few hard wall contacts per kart and lap
    expect(wall / slots.length).toBeLessThan(15);
  });

  it('a blaster fired across a taxiway bounces off the barriers at most three times', () => {
    const w = new ItemWorld(kart, ['a'], 1);
    const p = kart.pointAt(0.2 * kart.length + 30, 0);
    const a = createCarState('a', kart, p.x, p.z, p.heading + 1.1);
    w.kart('a').item = 'blaster';
    w.use('a');
    w.step(DT, [a], () => 1, () => null);
    expect(w.projectiles).toHaveLength(1);
    let maxBounces = 0;
    for (let i = 0; i < 60 * 9 && w.projectiles.length; i++) {
      w.step(DT, [], () => 1, () => null);
      for (const pr of w.projectiles) maxBounces = Math.max(maxBounces, pr.bounces);
    }
    expect(maxBounces).toBeGreaterThan(0);
    expect(maxBounces).toBeLessThanOrEqual(3);
    expect(w.projectiles).toHaveLength(0);
  });

  it('a mine on the racing line can be driven around', () => {
    // at each box row there is room beside a mine in the middle: half width minus mine and kart
    for (const f of [0.2, 0.55, 0.85]) {
      const p = kart.pointAt(f * kart.length + 25, 0);
      expect(kart.hw[p.idx] - 1.2 - 1.0, `free beside a mine at ${f}`).toBeGreaterThan(3);
    }
  });
});
