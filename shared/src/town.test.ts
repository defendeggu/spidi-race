import { describe, expect, it } from 'vitest';
import { CARS, carsForClass, getCar, PARKED_MODELS, townVersion } from './cars';
import { forwardSpeed, NO_INPUT, type CarInput } from './physics';
import { BLOCK_INNER, GRID as GRID_STEP, HARBOR, LINES, OFFROAD_PARK, OUTER, ROAD_HW, TOWN_AIRPORT, TOWN_BOUNDS, createTownCar, getTown, stepCarTown, TOWN_HALF } from './town';
import { DUEL_SECONDS, FoulWatch, TaskTracker, TownSession } from './townTasks';
import { DEPARTURE_CYCLE, departureAt, planeBoxes } from './townPlane';
import { personAt, townPeople } from './townPeople';
import { collideTrains, FREIGHT_PATH, SBAHN_PATH, TOWN_RAIL, TRAIN_HALF_WIDTH, trainsAt } from './townRail';
import { sanitizeSubmission } from './leaderboard';
import { TRACK_DEFS } from './tracks';
import { Traffic } from './traffic';

const DT = 1 / 60;

/** Inside the harbour (south), railway (east) or airfield (west) strip, within the town bounds. */
const inStrips = (b: { x: number; z: number; w: number; d: number }) => {
  const { minX, maxX, maxZ } = TOWN_BOUNDS;
  const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
  const harbour = z1 <= -OUTER + 0.01 && z0 >= HARBOR.quayZ - 0.01 && x0 >= minX - 0.01 && x1 <= maxX + 0.01;
  const rail = x1 <= -OUTER + 0.01 && x0 >= minX - 0.01 && z1 <= maxZ + 0.01 && z0 >= HARBOR.quayZ - 0.01;
  const airfield = x0 >= OUTER - 0.01 && x1 <= maxX + 0.01 && z0 >= -OUTER - 0.01 && z1 <= maxZ + 0.01;
  return harbour || rail || airfield;
};
const town = getTown();
const FULL: CarInput = { throttle: 1, brake: 0, steer: 0, handbrake: false };

describe('practice town', () => {
  it('has the town cars and no race track uses them', () => {
    const ids = carsForClass('town').map((c) => c.id);
    expect(ids.slice(0, 8)).toEqual(['california-town', 'familie', 'taxi', 'polizei', 'feuerwehr', 'kaito-stadt', 'hilux-town', 'aventador-town']);
    // every road, offroad and micro car has a town version, the karts do not
    for (const c of CARS.filter((x) => x.class === 'road' || x.class === 'offroad' || x.class === 'micro')) {
      expect(ids, c.id).toContain(townVersion(c.id));
      expect(getCar(townVersion(c.id)).model).toBe(c.model);
    }
    expect(ids.some((id) => id.startsWith('kart'))).toBe(false);
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

  it('town cars are gentle: about 85 km/h at most (the formula car a bit more)', () => {
    for (const spec of carsForClass('town')) {
      const c = createTownCar('t', { x: -450, z: -450, heading: 0 });
      for (let i = 0; i < 60 * 25; i++) stepCarTown(c, spec, FULL, town, DT);
      const kmh = forwardSpeed(c) * 3.6;
      expect(kmh).toBeGreaterThan(50);
      expect(kmh).toBeLessThan(spec.id === 'kaito-stadt' ? 100 : 88);
      // the camper does 80 km/h
      if (spec.id === 'california-town') expect(kmh).toBeGreaterThan(76);
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

describe('falling into the water, the cemetery and pedestrians', () => {
  it('ends a solo run without a time; in a duel the other player plays on and wins', () => {
    const solo = new TownSession(town, 'stars', 1, 5, 1);
    for (let i = 0; i <= 60 * 3; i++) solo.step(DT, [createTownCar('p', solo.spawn(0))]);
    solo.knockOut(0);
    expect(solo.phase).toBe('finished');
    expect(solo.result().out).toEqual(['water']);
    const duel = new TownSession(town, 'stars', 2, 5, 1);
    duel.scores[1] = 0;
    duel.scores[0] = 4;
    duel.knockOut(0, 'cemetery');
    // the other one is still driving
    expect(duel.phase).not.toBe('finished');
    expect(duel.playing(1)).toBe(true);
    expect(duel.result()).toMatchObject({ winner: 1, out: ['cemetery', null] });
    duel.knockOut(1, 'people');
    expect(duel.phase).toBe('finished');
    expect(duel.result().winner).toBe(-1);
    const free = new TownSession(town, 'free', 1, 5, 1);
    free.knockOut(0);
    expect(free.phase).toBe('finished');
  });

  it('five seconds in the cemetery or the third pedestrian end the run, leaving in time resets the countdown', () => {
    const church = town.blocks.find((b) => b.kind === 'church')!;
    expect(town.inCemetery(church.cx + 10, church.cz - 20)).toBe(true);
    expect(town.inCemetery(church.cx + 10, church.cz + 20)).toBe(false);
    const w = new FoulWatch();
    for (let i = 0; i < 60 * 4; i++) expect(w.step(true, DT)).toBe(false);
    w.step(false, DT);
    expect(w.cemetery).toBe(0);
    let out = false;
    for (let i = 0; i < 60 * 5 + 2 && !out; i++) out = w.step(true, DT);
    expect(out).toBe(true);
    const p = new FoulWatch();
    expect([p.hit(), p.hit(), p.hit()]).toEqual([false, false, true]);
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
    // a park and two house blocks were replaced; every other block still has its buildings
    expect(town.blocks.filter((b) => b.kind === 'skate')).toHaveLength(2);
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

  it('a fast car flies over the top of a quarter pipe (no wall at the edge)', () => {
    const park = town.blocks.find((b) => b.kind === 'skate')!;
    const { c, flew, maxY } = drive(park.cx + 28, park.cz - 3, 0, 4, getCar('kaito-stadt'));
    expect(maxY).toBeGreaterThan(2.5);
    expect(flew).toBeGreaterThan(0.2);
    expect(c.z).toBeGreaterThan(park.cz + 14);
  });

  it('a car that drives over the quay edge falls into the water', () => {
    const { c } = drive(-250, -470, Math.PI, 8, getCar('feuerwehr'));
    expect(c.z).toBeLessThan(HARBOR.quayZ);
    expect(c.y).toBeLessThan(-1);
    expect(c.airborne).toBe(true);
  });

  it('containers have their real size', () => {
    const boxes = town.props.filter((p) => p.model === 'container');
    expect(boxes.length).toBeGreaterThan(150);
    for (const b of boxes) expect(Math.min(b.w, b.d)).toBeCloseTo(2.44);
    // some are stacked
    expect(boxes.some((b) => (b.y ?? 0) > 5)).toBe(true);
  });

  it('the tracks are open: a car drives across both of them', () => {
    for (let z = -400; z <= 400; z += 37) {
      if (Math.abs(z) < 75) continue; // the station platform
      // start just before the S-Bahn track (the grass towards the town has trees)
      const { c } = drive(TOWN_RAIL.trackX + 8, z, -Math.PI / 2, 4);
      expect(c.x, `z=${z}`).toBeLessThan(TOWN_RAIL.freightX - 3);
    }
  });

  it('the tracks are free of obstacles (except the platforms beside them)', () => {
    for (const path of [SBAHN_PATH, FREIGHT_PATH]) {
      // (the ends lie in the tunnel portals)
      for (let s = 4; s <= path.length - (path === FREIGHT_PATH ? 4 : 0); s += 2) {
        const p = path.at(s);
        expect(town.isFree(p.x, p.z, 1.5), `${p.x.toFixed(0)},${p.z.toFixed(0)}`).toBe(true);
      }
    }
    // the S-Bahn reaches the airport station
    const end = SBAHN_PATH.at(SBAHN_PATH.length);
    expect(end.x).toBeCloseTo(TOWN_RAIL.airportX, 0);
    expect(end.z).toBeCloseTo(TOWN_RAIL.airportEnd, 0);
  });

  it('a train is always moving, the S-Bahn stops at both stations', () => {
    let stopsEast = 0, stopsAirport = 0, wasMoving = true, unseen = 0;
    for (let t = 0; t < 1200; t += 0.25) {
      const trains = trainsAt(t);
      expect(trains.some((tr) => tr.moving), `t=${t}`).toBe(true);
      // only for a moment, when the freight train turns inside a tunnel, is no train to be seen
      if (!trains.some((tr) => tr.moving && tr.cars.some((c) => !c.hidden))) unseen++;
      const sb = trains[0];
      if (wasMoving && !sb.moving && sb.cars.every((c) => !c.hidden)) {
        const mid = sb.cars[1];
        if (Math.abs(mid.z) < 30 && mid.x < -500) stopsEast++;
        if (mid.x > 480) stopsAirport++;
      }
      wasMoving = sb.moving;
    }
    expect(unseen).toBeLessThan(1200 / 70 + 2);
    expect(stopsEast).toBeGreaterThan(2);
    expect(stopsAirport).toBeGreaterThan(1);
  });

  it('a train pushes a car off the track', () => {
    const spec = carsForClass('town')[0];
    const trains = trainsAt(30);
    const car = trains.flatMap((tr) => tr.cars).find((c) => !c.hidden)!;
    const c = createTownCar('t', { x: car.x, z: car.z, heading: 0 });
    for (let i = 0; i < 5; i++) collideTrains(c, spec, trains);
    expect(Math.hypot(c.x - car.x, c.z - car.z)).toBeGreaterThan(TRAIN_HALF_WIDTH);
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

  it('cars fly over low obstacles in the skate park, but not over buildings', () => {
    const town = getTown();
    const spec = carsForClass('town')[0];
    const rail = town.props.find((p) => p.model === 'sk-rail-high')!;
    const at = (y: number) => {
      const c = createTownCar('t', { x: rail.x, z: rail.z, heading: 0 });
      c.y = y;
      town.collide(c, spec);
      return Math.hypot(c.x - rail.x, c.z - rail.z);
    };
    expect(at(0)).toBeGreaterThan(0.1);
    expect(at(3.5)).toBe(0);
    const b = town.buildings[0];
    const c = createTownCar('t', { x: b.x, z: b.z, heading: 0 });
    c.y = b.h - 1;
    town.collide(c, spec);
    expect(Math.hypot(c.x - b.x, c.z - b.z)).toBeGreaterThan(0.1);
  });

  it('a second skate park lies beside the parking lot of the second supermarket, laid out like the first', () => {
    const parks = town.blocks.filter((b) => b.kind === 'skate');
    const market = town.blocks.filter((b) => b.kind === 'supermarket')[1];
    const lot = town.blocks.find((b) => b.kind === 'parking' && Math.abs(b.i - market.i) + Math.abs(b.j - market.j) === 1)!;
    expect(parks.some((p) => Math.abs(p.i - lot.i) + Math.abs(p.j - lot.j) === 1)).toBe(true);
    // 6 ramps per skate park (the offroad park adds its jumps after them)
    expect(town.ramps.filter((r) => r.x < OFFROAD_PARK.area.x0 - 10)).toHaveLength(12);
    const [a, b] = parks;
    for (let k = 0; k < 6; k++) {
      expect(town.ramps[k + 6].x - b.cx).toBeCloseTo(town.ramps[k].x - a.cx);
      expect(town.ramps[k + 6].z - b.cz).toBeCloseTo(town.ramps[k].z - a.cz);
    }
    expect(town.heightAt(b.cx - 10, b.cz)).toBeCloseTo(1.6);
  });

  it('no invisible walls in the air: parked cars, lamps, trees and buildings end at their height', () => {
    const spec = carsForClass('town')[0];
    // the car collides with a circle at its front and back: try it at several places along z
    const hitAt = (x: number, z: number, y: number) => [-2, -1, 0, 1, 2].some((dz) => {
      const c = createTownCar('t', { x, z: z + dz, heading: 0 });
      c.y = y;
      town.collide(c, spec);
      return Math.hypot(c.x - x, c.z - z - dz) > 0.01;
    });
    const bay = town.bays.find((q) => q.parked >= 0)!;
    expect(hitAt(bay.x, bay.z, 0)).toBe(true);
    expect(hitAt(bay.x, bay.z, 2.5)).toBe(false);
    const lamp = town.circles.find((o) => o.kind === 'lamp')!;
    expect(hitAt(lamp.x + 0.5, lamp.z, 3)).toBe(true);
    expect(hitAt(lamp.x + 0.5, lamp.z, 8)).toBe(false);
    const tree = town.circles.find((o) => o.kind === 'tree')!;
    expect(hitAt(tree.x + 0.5, tree.z, 9)).toBe(false);
    const b = town.buildings[0];
    expect(hitAt(b.x, b.z, b.h + 0.5)).toBe(false);
  });

  it('a car jumping out of the quarter pipe towards the parking lot flies over the parked cars', () => {
    const spec = getCar('kaito-stadt');
    for (const park of town.blocks.filter((b) => b.kind === 'skate')) {
      // the quarter pipe that faces the neighbouring parking lot (+z)
      const r = town.ramps.find((q) => q.curve === 'quarter' && q.rot === 0 && Math.abs(q.x - park.cx - 28) < 1e-6 && Math.abs(q.z - park.cz - 6) < 1e-6)!;
      const c = createTownCar('t', { x: r.x, z: r.z - 8, heading: 0 });
      c.vz = 45;
      let bounced = false;
      for (let i = 0; i < 400 && !bounced; i++) {
        const vz = c.vz;
        stepCarTown(c, spec, { throttle: 1, brake: 0, steer: 0, handbrake: false }, town, 1 / 60);
        // in the air (beyond the ramp) a collision would reverse or stop the forward motion
        if (c.airborne && c.z > r.z + r.up + r.top + 1 && c.vz < vz - 3) bounced = true;
      }
      expect(bounced).toBe(false);
    }
  });

  it('the side of a ramp is a wall, the car is not lifted onto it', () => {
    const town = getTown();
    const spec = carsForClass('town')[0];
    // a quarter pipe of the skate park, hit from the side at full speed
    const r = town.ramps.find((q) => q.curve === 'quarter' && q.height >= 3)!;
    const fx = Math.sin(r.rot), fz = Math.cos(r.rot);
    const u = r.up + r.top / 2;
    const mx = r.x + fx * u, mz = r.z + fz * u;
    const sx = -fz, sz = fx; // sideways
    const c = createTownCar('t', { x: mx + sx * (r.width / 2 + 3), z: mz + sz * (r.width / 2 + 3), heading: Math.atan2(-sx, -sz) });
    c.vx = -sx * 15;
    c.vz = -sz * 15;
    let maxY = 0;
    for (let i = 0; i < 60; i++) {
      stepCarTown(c, spec, { throttle: 1, brake: 0, steer: 0, handbrake: false }, town, 1 / 60);
      maxY = Math.max(maxY, c.y);
    }
    expect(maxY).toBeLessThan(0.5);
    expect(Math.hypot(c.x - mx, c.z - mz)).toBeGreaterThan(r.width / 2 - 0.5);
  });

  it('a boosted kart drives up a quarter pipe and flies out of it', () => {
    const town = getTown();
    const spec = { ...getCar('kart-oopi'), topSpeed: 50, accel: 30 };
    const r = town.ramps.find((q) => q.curve === 'quarter' && q.height >= 3)!;
    const fx = Math.sin(r.rot), fz = Math.cos(r.rot);
    const c = createTownCar('t', { x: r.x - fx * 6, z: r.z - fz * 6, heading: r.rot });
    c.vx = fx * 45;
    c.vz = fz * 45;
    let maxY = 0;
    for (let i = 0; i < 40; i++) {
      stepCarTown(c, spec, { throttle: 1, brake: 0, steer: 0, handbrake: false }, town, 1 / 60);
      maxY = Math.max(maxY, c.y);
    }
    expect(maxY).toBeGreaterThan(r.height);
  });
});

describe('airfield in the west', () => {
  const A = TOWN_AIRPORT;
  const drive = (x: number, z: number, heading: number, seconds: number) => {
    const c = createTownCar('t', { x, z, heading });
    for (let i = 0; i < 60 * seconds; i++) stepCarTown(c, getCar('familie'), FULL, town, DT);
    return { c };
  };

  it('runway and taxiway run along the west wall, runway long and straight', () => {
    expect(A.runway.x + A.runway.width / 2).toBeLessThan(TOWN_BOUNDS.maxX - 10);
    expect(A.runway.z1 - A.runway.z0).toBeGreaterThan(800);
    expect(A.taxiway.x).toBeLessThan(A.runway.x);
  });

  it('runway, taxiway and apron are paved and free to drive', () => {
    for (let z = A.runway.z0 + 50; z < A.runway.z1; z += 25) {
      expect(town.surfaceAt(A.runway.x, z)).toBe('asphalt');
      expect(town.isFree(A.runway.x - 8, z, 2.5), `runway z=${z}`).toBe(true);
    }
    for (let z = A.taxiway.z0; z < A.taxiway.z1; z += 25) {
      expect(town.surfaceAt(A.taxiway.x, z)).toBe('asphalt');
      // the taxiing plane takes up part of the taxiway
      if (Math.abs(z - 220) > 30) expect(town.isFree(A.taxiway.x, z, 2.5), `taxiway z=${z}`).toBe(true);
    }
    for (const l of A.links) expect(town.isFree((A.taxiway.x + A.runway.x) / 2, l, 2.5)).toBe(true);
    expect(town.surfaceAt(600, 0)).toBe('asphalt');
    expect(town.surfaceAt(690, 100)).toBe('dirt');
  });

  it('terminal, cargo hall, tower, containers and several parked aircraft; the runway is kept free for departures', () => {
    const models = town.buildings.map((b) => b.model).concat(town.props.map((p) => p.model));
    expect(models).toContain('airport-terminal');
    expect(models).toContain('airport-cargo');
    expect(models).toContain('airport-tower');
    expect(town.props.filter((p) => p.model === 'plane').length).toBeGreaterThanOrEqual(6);
    const lined = A.planes.filter((p) => Math.abs(p.x - A.runway.x) < 1 && p.z < A.runway.z0 + 60);
    expect(lined).toHaveLength(0);
    const containers = town.props.filter((p) => p.model === 'container' && p.x > OUTER && p.z > -OUTER);
    expect(containers.length).toBeGreaterThan(2);
    expect(containers.length).toBeLessThan(12);
  });

  it('a car drives from the outer street onto the apron and is stopped by a parked plane', () => {
    // from the outer ring street straight west through the access lane north of the terminal
    const { c } = drive(450, 120, Math.PI / 2, 10);
    expect(c.x).toBeGreaterThan(560);
    for (let x = 455; x < 650; x += 5) expect(town.surfaceAt(x, 120), `x=${x}`).toBe('asphalt');
    // into the fuselage of the plane at the middle gate: from the north, at its middle
    const p = A.planes[1];
    const hit = drive(p.x + 18, p.z + 30, Math.PI, 5).c;
    expect(hit.z).toBeGreaterThan(p.z + 2);
  });

  it('the old town stays the same: no buildings moved by the new strip', () => {
    expect(town.buildings.filter((b) => b.x > OUTER).map((b) => b.model).sort()).toEqual(['airport-cargo', 'airport-terminal', 'tpl-retro-10x4x3']);
  });

  it('the departing aircraft lifts off at about two thirds of the runway, then the next one comes', () => {
    const r = TOWN_AIRPORT.runway;
    let liftZ = NaN, liveries = new Set<number>(), was = true;
    for (let t = 0; t < DEPARTURE_CYCLE * 3; t += 0.1) {
      const p = departureAt(t);
      liveries.add(p.livery);
      if (was && !p.onGround) liftZ = p.z;
      was = p.onGround;
      // on the ground it blocks cars, in the air it does not
      expect(planeBoxes(p).length).toBe(p.onGround ? 1 : 0);
    }
    const frac = (liftZ - r.z0) / (r.z1 - r.z0);
    expect(frac).toBeGreaterThan(0.6);
    expect(frac).toBeLessThan(0.75);
    expect(liveries.size).toBe(3);
  });

  it('pedestrians of all kinds walk where nothing stands in their way', () => {
    const people = townPeople(town);
    const kinds = new Map<string, number>();
    for (const p of people) kinds.set(p.kind, (kinds.get(p.kind) ?? 0) + 1);
    expect(people.length).toBeGreaterThan(60);
    expect(kinds.get('adult')).toBeGreaterThan(20);
    expect(kinds.get('child')).toBeGreaterThan(5);
    expect(kinds.get('dog')).toBeGreaterThan(4);
    expect(kinds.get('pram')).toBeGreaterThan(4);
    // in the parks, on the squares, at the supermarket and in the cemetery
    const near = (kind: string) => people.filter((p) => p.kind !== 'sitter' && town.blocks.some((b) => b.kind === kind && Math.abs(p.pts[0].x - b.cx) < 50 && Math.abs(p.pts[0].z - b.cz) < 50)).length;
    for (const kind of ['park', 'plaza', 'towerplaza', 'church']) expect(near(kind), kind).toBeGreaterThan(1);
    const supermarket = town.buildings.find((b) => b.model === 'supermarket')!;
    expect(people.filter((p) => !p.loop && p.pts.some((q) => Math.hypot(q.x - supermarket.x, q.z - supermarket.z) < 30)).length).toBeGreaterThan(2);
    // streets are crossed only at zebra crossings (6–9 m from the middle of an intersection)
    const nearest = (v: number) => LINES.reduce((b, L) => (Math.abs(v - L) < Math.abs(v - b) ? L : b), LINES[0]);
    for (const p of people.filter((q) => q.kind !== 'sitter')) {
      for (let t = 0; t < 300; t += 1) {
        const at = personAt(p, t);
        if (Math.abs(at.x) > OUTER || Math.abs(at.z) > OUTER) continue;
        const dx = Math.abs(at.x - nearest(at.x)), dz = Math.abs(at.z - nearest(at.z));
        const onRoad = dx < ROAD_HW || dz < ROAD_HW;
        const zebra = (dx < ROAD_HW + 0.5 && dz >= ROAD_HW && dz <= ROAD_HW + 4.5) || (dz < ROAD_HW + 0.5 && dx >= ROAD_HW && dx <= ROAD_HW + 4.5);
        expect(!onRoad || zebra, `${p.kind} on the street at ${at.x.toFixed(1)},${at.z.toFixed(1)}`).toBe(true);
      }
    }
    expect(people.filter((p) => p.pts.length === 6).length, 'shoppers over the zebra').toBeGreaterThan(2);
    // nobody walks through an obstacle
    for (const p of people.filter((q) => q.kind !== 'sitter')) {
      for (let t = 0; t < 120; t += 7) {
        const at = personAt(p, t);
        expect(town.pointHit(at.x, at.z, 0.5), `${p.kind} ${at.x.toFixed(1)},${at.z.toFixed(1)}`).toBeNull();
      }
    }
  });

  it('offroad park: dirt loop with sand, mud and a water hole, and a kicker to jump from', () => {
    const O = OFFROAD_PARK;
    expect(town.surfaceAt(O.water.x, O.water.z)).toBe('water');
    const surfaces = new Set<string>();
    for (const [x, z] of O.loop) surfaces.add(town.surfaceAt(x, z));
    for (let x = O.area.x0 + 2; x < O.area.x1; x += 3) for (let z = O.area.z0 + 2; z < O.area.z1; z += 3) surfaces.add(town.surfaceAt(x, z));
    expect([...surfaces].sort()).toEqual(['dirt', 'mud', 'sand', 'water']);
    // full throttle along the top straight: over the kicker into the air
    const c = createTownCar('t', { x: 492, z: -384, heading: Math.PI / 2 });
    let flew = 0;
    for (let i = 0; i < 60 * 5; i++) {
      stepCarTown(c, getCar('hilux-town'), FULL, town, DT);
      if (c.airborne) flew += DT;
    }
    expect(flew).toBeGreaterThan(0.3);
    // the park is open: rocks and cacti stand off the course
    for (const [x, z] of O.loop) expect(town.isFree(x, z, 2)).toBe(true);
  });

  it('fire and police station with their vehicles beside the northern supermarket', () => {
    const fire = town.buildings.find((b) => b.model === 'firestation')!, police = town.buildings.find((b) => b.model === 'policestation')!;
    const market = town.buildings.filter((b) => b.model === 'supermarket').sort((a, b) => b.z - a.z)[0];
    for (const b of [fire, police]) {
      expect(Math.abs(b.x - (market.x - GRID_STEP))).toBeLessThan(60);
      expect(Math.abs(b.z - market.z)).toBeLessThan(50);
    }
    const parked = (model: string) => town.bays.filter((b) => b.parked === PARKED_MODELS.indexOf(model)).length;
    expect(parked('firetruck')).toBe(3);
    expect(parked('police')).toBe(3);
    // shops still line the block on two sides
    expect(town.buildings.filter((b) => Math.abs(b.x - fire.x) < 46 && Math.abs(b.z - (fire.z + police.z) / 2) < 46).length).toBeGreaterThan(4);
  });
});
