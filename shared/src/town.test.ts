import { describe, expect, it } from 'vitest';
import { carsForClass, getCar } from './cars';
import { forwardSpeed, NO_INPUT, type CarInput } from './physics';
import { BLOCK_INNER, HARBOR, OUTER, RAIL, TOWN_BOUNDS, createTownCar, getTown, stepCarTown, TOWN_HALF } from './town';
import { DUEL_SECONDS, TaskTracker, TownSession } from './townTasks';
import { sanitizeSubmission } from './leaderboard';
import { TRACK_DEFS } from './tracks';
import { Traffic } from './traffic';

const DT = 1 / 60;

/** Inside the harbour (south) or railway (east) strip, within the town bounds. */
const inStrips = (b: { x: number; z: number; w: number; d: number }) => {
  const { minX, maxX, maxZ } = TOWN_BOUNDS;
  const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
  const harbour = z1 <= -OUTER + 0.01 && z0 >= HARBOR.quayZ - 0.01 && x0 >= minX - 0.01 && x1 <= maxX + 0.01;
  const rail = x1 <= -OUTER + 0.01 && x0 >= minX - 0.01 && z1 <= maxZ + 0.01 && z0 >= HARBOR.quayZ - 0.01;
  return harbour || rail;
};
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
    for (const b of town.blocks.filter((k) => ['house', 'shop', 'brick', 'oldtown', 'industry', 'plaza'].includes(k.kind))) {
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
      const block = town.blockAt(b.x, b.z);
      // harbour and railway buildings lie in the new strips outside the old town
      if (!block) {
        if (!inStrips(b)) outside.push(b.model);
        continue;
      }
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

  it('cars fit under the canopy of the tower with the entrance roof, but not into its walls', () => {
    const towers = town.buildings.filter((b) => b.model === 'building-n');
    expect(towers.length).toBeGreaterThan(0);
    for (const b of towers) {
      const at = (mx: number, mz: number) => ({
        x: b.x + (mx * Math.cos(b.rot) + mz * Math.sin(b.rot)) * b.scale,
        z: b.z + (-mx * Math.sin(b.rot) + mz * Math.cos(b.rot)) * b.scale,
      });
      const under = at(-0.82, 0.1), inside = at(0.4, 0.1);
      expect(town.isFree(under.x, under.z, 1.2), `under the canopy of ${b.x},${b.z}`).toBe(true);
      expect(town.isFree(inside.x, inside.z, 1.2)).toBe(false);
    }
  });

  it('keeps the 5 parking lots where they were', () => {
    const lots = town.blocks.filter((b) => b.kind === 'parking').map((b) => `${b.i},${b.j}`).sort();
    expect(lots).toEqual(['1,5', '2,1', '4,7', '6,2', '7,6']);
  });

  it('has two supermarkets, each right next to a parking lot, entrance facing it', () => {
    const markets = town.blocks.filter((b) => b.kind === 'supermarket');
    expect(markets).toHaveLength(2);
    for (const m of markets) {
      const lot = town.blocks.find((b) => b.kind === 'parking' && Math.abs(b.i - m.i) + Math.abs(b.j - m.j) === 1);
      expect(lot, `supermarket ${m.i},${m.j}`).toBeDefined();
      const hall = town.buildings.find((b) => b.model === 'supermarket' && town.blockAt(b.x, b.z) === m)!;
      // the hall sits on the lot's side of its block, the front (+z of the model) points to the lot
      expect(Math.sin(hall.rot) * (lot!.cx - m.cx) + Math.cos(hall.rot) * (lot!.cz - m.cz)).toBeGreaterThan(50);
      expect(Math.hypot(hall.x - lot!.cx, hall.z - lot!.cz)).toBeLessThan(Math.hypot(m.cx - lot!.cx, m.cz - lot!.cz));
    }
  });

  it('has the new quarters and the towers in the middle', () => {
    const kinds = new Set(town.blocks.map((b) => b.kind));
    for (const k of ['brick', 'oldtown', 'industry', 'power', 'plaza', 'towerplaza', 'tower'] as const) expect(kinds.has(k), k).toBe(true);
    const towers = town.blocks.filter((b) => b.kind === 'tower');
    for (const t of towers) expect(Math.max(Math.abs(t.i - 4), Math.abs(t.j - 4))).toBeLessThanOrEqual(1);
    expect(town.props.some((p) => p.model === 'ind-water-tower')).toBe(true);
    expect(town.props.filter((p) => p.model.includes('chimney')).length).toBeGreaterThanOrEqual(3);
  });

  it('buildings of the same kind come in many colour variants and models', () => {
    const byKit = (prefix: string) => town.buildings.filter((b) => b.model.startsWith(prefix));
    for (const prefix of ['building-type', 'building-skyscraper', 'ind-building', 'tpl-fantasy', 'tpl-retro']) {
      const bs = byKit(prefix);
      expect(bs.length, prefix).toBeGreaterThan(4);
      expect(new Set(bs.map((b) => b.variant)).size, prefix).toBeGreaterThanOrEqual(3);
      expect(new Set(bs.map((b) => b.model)).size, prefix).toBeGreaterThanOrEqual(3);
    }
  });

  it('props stay inside their block and off the streets', () => {
    for (const p of town.props) {
      const block = town.blockAt(p.x, p.z);
      if (!block) {
        // harbour, railway and ships in the water
        expect(inStrips(p) || (p.model.startsWith('wc-') && p.z < HARBOR.quayZ), p.model).toBe(true);
        continue;
      }
      expect(Math.abs(p.x - block.cx) + p.w / 2, p.model).toBeLessThanOrEqual(BLOCK_INNER + 0.01);
      expect(Math.abs(p.z - block.cz) + p.d / 2, p.model).toBeLessThanOrEqual(BLOCK_INNER + 0.01);
    }
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

describe('practice session', () => {
  const at = (c: ReturnType<typeof createTownCar>, x: number, z: number, heading = c.heading) => Object.assign(c, { x, z, heading, vx: 0, vz: 0 });

  it('solo: countdown, then the run ends after the chosen number of stars', () => {
    const s = new TownSession(town, 'stars', 1, 5, 1);
    const car = createTownCar('p1', s.spawn(0));
    s.begin([car]);
    expect(s.phase).toBe('countdown');
    for (let i = 0; i <= 60 * 3; i++) s.step(DT, [car]);
    expect(s.phase).toBe('running');
    for (let g = 0; g < 5; g++) {
      for (let i = 0; i < 60 * 4; i++) s.step(DT, [car]);
      const t = s.trackers[0].target!;
      at(car, t.x, t.z);
      expect(s.step(DT, [car])).toEqual([0]);
    }
    expect(s.phase).toBe('finished');
    const r = s.result();
    expect(r.scores).toEqual([5]);
    expect(r.time).toBeGreaterThan(20);
    expect(r.fastest[0]).toBeGreaterThan(3.9);
    expect(sanitizeSubmission({ name: 'Lea', carId: 'familie', trackId: 'town-stars', laps: 5, time: r.time, bestLap: r.fastest[0], mode: 'solo' })).not.toBeNull();
  });

  it('free driving has no countdown and never ends', () => {
    const s = new TownSession(town, 'free', 2, 5, 1);
    expect(s.phase).toBe('running');
    const cars = [0, 1].map((k) => createTownCar(`p${k}`, s.spawn(k)));
    s.begin(cars);
    for (let i = 0; i < 60 * 10; i++) s.step(DT, cars);
    expect(s.phase).toBe('running');
    expect(s.trackers[0].target).toBeNull();
  });

  it('duel: opposite corners, fair shared goals, 3 minutes, more goals wins', () => {
    const s = new TownSession(town, 'stars', 2, 5, 3);
    const a = s.spawn(0), b = s.spawn(1);
    // point-symmetric start in opposite corners
    expect(a.x).toBeCloseTo(-b.x);
    expect(a.z).toBeCloseTo(-b.z);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(1000);
    const cars = [createTownCar('p1', a), createTownCar('p2', b)];
    for (const c of cars) expect(town.isFree(c.x, c.z, 2)).toBe(true);
    s.begin(cars);
    for (let i = 0; i <= 60 * 3; i++) s.step(DT, cars);
    for (let g = 0; g < 3; g++) {
      const t = s.trackers[0].target!;
      expect(s.trackers[1].target).toEqual(t);
      const da = Math.abs(t.x - cars[0].x) + Math.abs(t.z - cars[0].z), db = Math.abs(t.x - cars[1].x) + Math.abs(t.z - cars[1].z);
      expect(Math.abs(da - db)).toBeLessThan(60);
      // player 1 wins the first two goals, player 2 the third
      const k = g < 2 ? 0 : 1;
      at(cars[k], t.x, t.z);
      for (let i = 0; i < 60; i++) s.step(DT, cars);
    }
    expect(s.scores).toEqual([2, 1]);
    for (let i = 0; i < 60 * DUEL_SECONDS; i++) s.step(DT, cars);
    expect(s.phase).toBe('finished');
    expect(s.result()).toMatchObject({ mode: 'duel', winner: 0, time: DUEL_SECONDS });
  });

  it('duel parking: both chase the same free bay, a goal counts once', () => {
    const s = new TownSession(town, 'parking', 2, 5, 4);
    const cars = [0, 1].map((k) => createTownCar(`p${k}`, s.spawn(k)));
    s.begin(cars);
    for (let i = 0; i <= 60 * 3; i++) s.step(DT, cars);
    const t = s.trackers[0].target!;
    expect(town.bays[t.bay].parked).toBe(-1);
    // both stand perfectly in the bay at the same time: only the first scores
    for (const c of cars) at(c, t.x, t.z, t.heading);
    let total = 0;
    for (let i = 0; i < 90; i++) total += s.step(DT, cars).length;
    expect(total).toBe(1);
    expect(s.scores[0] + s.scores[1]).toBe(1);
  });
});

describe('town leaderboard', () => {
  const ok = { name: 'Lea', carId: 'taxi', trackId: 'town-parking', laps: 10, time: 300, bestLap: 12, mode: 'solo' as const };
  it('accepts plausible runs with a town car and a known goal count', () => {
    expect(sanitizeSubmission(ok)).toMatchObject({ trackId: 'town-parking', laps: 10, time: 300 });
  });
  it('rejects race cars, odd goal counts and impossible times', () => {
    expect(sanitizeSubmission({ ...ok, carId: 'falcone' })).toBeNull();
    expect(sanitizeSubmission({ ...ok, laps: 7 })).toBeNull();
    expect(sanitizeSubmission({ ...ok, bestLap: 1 })).toBeNull();
    expect(sanitizeSubmission({ ...ok, time: 50 })).toBeNull();
    expect(sanitizeSubmission({ ...ok, trackId: 'town-nonsense' })).toBeNull();
  });
});

describe('town extensions', () => {
  const drive = (x: number, z: number, heading: number, seconds: number, spec = getCar('familie')) => {
    const c = createTownCar('t', { x, z, heading });
    let flew = 0, maxY = 0;
    for (let i = 0; i < 60 * seconds; i++) {
      stepCarTown(c, spec, FULL, town, DT);
      if (c.airborne) flew += DT;
      maxY = Math.max(maxY, c.y);
    }
    return { c, flew, maxY };
  };

  it('keeps the familiar old town (replaced blocks do not reshuffle the others)', () => {
    // a park and a house block were replaced; every other block still has its buildings
    expect(town.blocks.filter((b) => b.kind === 'skate')).toHaveLength(1);
    expect(town.blocks.filter((b) => b.kind === 'church')).toHaveLength(1);
    expect(town.buildings.some((b) => b.model.startsWith('tpl-church'))).toBe(true);
    expect(town.buildings.filter((b) => b.model.startsWith('building-type')).length).toBeGreaterThan(150);
  });

  it('skate park: ramps have height, a fast car jumps the kicker and lands', () => {
    const park = town.blocks.find((b) => b.kind === 'skate')!;
    expect(town.heightAt(park.cx - 10, park.cz)).toBeCloseTo(1.6);
    expect(town.heightAt(park.cx, park.cz - 40)).toBe(0);
    // run-up from the street south of the park straight over the kicker of the jump line
    const { c, flew, maxY } = drive(park.cx - 30, park.cz - 60, 0, 6, getCar('kaito-stadt'));
    expect(flew).toBeGreaterThan(0.3);
    expect(maxY).toBeGreaterThan(1.5);
    expect(c.airborne).toBe(false);
  });

  it('cars climb a quarter pipe and roll back instead of flying off the back', () => {
    const park = town.blocks.find((b) => b.kind === 'skate')!;
    const { c, maxY } = drive(park.cx + 28, park.cz, 0, 4);
    expect(maxY).toBeGreaterThan(1);
    expect(c.z).toBeLessThan(park.cz + 14);
  });

  it('the quay edge keeps cars out of the water', () => {
    const { c } = drive(0, -470, Math.PI, 12, getCar('feuerwehr'));
    expect(c.z).toBeGreaterThan(HARBOR.quayZ);
  });

  it('the railway fence keeps cars off the track', () => {
    for (const z of [-200, 0, 200, 400]) {
      const { c } = drive(-462, z, -Math.PI / 2, 8);
      expect(c.x, `z=${z}`).toBeGreaterThan(RAIL.fenceX);
    }
  });

  it('new star spots and parking bays exist in harbour, station and skate park', () => {
    expect(town.starSpots.filter((s) => s.z < -OUTER).length).toBeGreaterThanOrEqual(4);
    expect(town.starSpots.filter((s) => s.x < -OUTER).length).toBeGreaterThanOrEqual(3);
    expect(town.bays.filter((b) => b.z < -OUTER && b.parked < 0).length).toBeGreaterThan(5);
    expect(town.bays.filter((b) => b.x < -OUTER && b.parked < 0).length).toBeGreaterThan(5);
  });

  it('the cemetery can be entered through its gate', () => {
    const ch = town.blocks.find((b) => b.kind === 'church')!;
    for (let z = ch.cz - 44; z < ch.cz - 8; z += 1) expect(town.isFree(ch.cx, z, 1.3), `z=${z}`).toBe(true);
  });
});
