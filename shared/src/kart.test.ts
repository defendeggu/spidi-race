import { describe, expect, it } from 'vitest';
import { AIDriver } from './ai';
import { carsForClass, getCar } from './cars';
import { ItemWorld, rollItem, ITEM_WEIGHTS, type ItemEvent } from './items';
import { DRIFT_BOOST, driftLevel, hitKart, newKartState, SPIN_TIME, stepKart, tickKartTimers, TURBO_TIME } from './kart';
import { KartBrain } from './kartAi';
import { sanitizeSubmission } from './leaderboard';
import { mulberry32 } from './math';
import { applyNetItems, ItemMirror, toNetItems } from './protocol';
import { collideCars, createCarState, forwardSpeed, type CarInput } from './physics';
import { Race, type Slot } from './race';
import { gridPosition } from './track';
import { getTrack, KART_TRACKS } from './tracks';

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
    // online kart races: only from the game server
    expect(sanitizeSubmission({ ...ok, mode: 'online' })).toBeNull();
    expect(sanitizeSubmission({ ...ok, mode: 'online' }, true)).toMatchObject({ mode: 'online', trackId: 'kart:alpenpass' });
  });
});

describe('kart race with AI and items', () => {
  for (const def of KART_TRACKS) {
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
      console.log(`kart ${def.id}: length ${t.length.toFixed(0)} m, winner ${res[0].time.toFixed(1)} s, best lap ${Math.min(...res.map((r) => r.bestLap)).toFixed(1)} s, items used ${used}, hits ${hits}`);
      expect(res.every((r) => r.finished)).toBe(true);
      expect(used).toBeGreaterThan(10);
      expect(hits).toBeGreaterThan(0);
    });
  }
});

describe('kart items over the network', () => {
  it('a client mirror follows the server, own karts keep their drift', () => {
    const track = getTrack('speedway');
    const server = new ItemWorld(track, ['a', 'b'], 5);
    const client = new ItemWorld(track, ['a', 'b'], 9);
    const sa = server.kart('a'), sb = server.kart('b');
    sa.item = 'blaster';
    sb.boost = 0.8;
    sb.drift = -1;
    hitKart(sa);
    server.boxes[2].respawn = 1.5;
    const ca = client.kart('a');
    ca.drift = 1;
    ca.driftTime = 1;
    ca.boost = 0.4;
    const ev: ItemEvent[] = [{ type: 'use', car: 'a', item: 'turbo' }];
    applyNetItems(client, JSON.parse(JSON.stringify(toNetItems(server, ev))), new Set(['a']));
    // own kart: item and spin-out from the server (the hit ends the drift), turbo boost from the event
    expect(ca.item).toBe('blaster');
    expect(ca.spin).toBeCloseTo(SPIN_TIME);
    expect(ca.drift).toBe(0);
    expect(ca.boost).toBe(TURBO_TIME);
    // other karts: everything from the server
    expect(client.kart('b').drift).toBe(-1);
    expect(client.kart('b').boost).toBe(0.8);
    expect(client.boxes.map((b) => b.respawn > 0)).toEqual(server.boxes.map((b) => b.respawn > 0));
    // the server keeps the timers of client-driven karts running
    tickKartTimers(sa, SPIN_TIME + 0.1);
    expect(sa.spin).toBe(0);
  });
});

describe('collecting several items', () => {
  it('a kart carries up to three items and uses them in order', () => {
    const track = getTrack('speedway');
    const w = new ItemWorld(track, ['a'], 3);
    const c = createCarState('a', track, 0, 0, 0);
    const ks = w.kart('a');
    // drive through four boxes, one after another (each roll finishes before the next box)
    for (let k = 0; k < 4; k++) {
      const b = w.boxes[k];
      c.x = b.x;
      c.y = b.y;
      c.z = b.z;
      w.step(1 / 60, [c], () => 1, () => null);
      c.x += 100;
      for (let i = 0; i < 70; i++) w.step(1 / 60, [c], () => 1, () => null);
    }
    expect(ks.item).not.toBeNull();
    expect(ks.stock.length).toBe(2);
    const order = [ks.item, ...ks.stock];
    const used: string[] = [];
    w.events.length = 0;
    for (let k = 0; k < 4; k++) {
      w.use('a');
      w.step(1 / 60, [c], () => 1, () => null);
    }
    for (const e of w.events) if (e.type === 'use') used.push(e.item);
    expect(used).toEqual(order);
    expect(ks.item).toBeNull();
  });
});

describe('own items shown at once in the network game', () => {
  const track = getTrack('speedway');
  const setup = () => {
    const server = new ItemWorld(track, ['a', 'b'], 5);
    const client = new ItemMirror(new ItemWorld(track, ['a', 'b'], 9));
    const c = createCarState('a', track, 0, 0, 0);
    server.kart('a').item = 'blaster';
    server.kart('a').stock = ['mine'];
    const own = new Set(['a']);
    client.apply(toNetItems(server, []), own);
    return { server, client, c, own };
  };

  it('the shot flies at once, the server shot takes it over', () => {
    const { server, client, c, own } = setup();
    const ev = client.use('a', c);
    expect(ev.map((e) => e.type)).toEqual(['use', 'spawn']);
    const local = client.world.projectiles[0].id;
    expect(local).toBeLessThan(0);
    expect(client.world.kart('a').item).toBe('mine');
    // a snapshot from before the server got the message: the shot stays, the slot stays moved on
    client.apply(JSON.parse(JSON.stringify(toNetItems(server, []))), own);
    expect(client.world.projectiles.map((p) => p.id)).toEqual([local]);
    expect(client.world.kart('a').item).toBe('mine');
    // the server fires: its shot takes over, nothing is shown twice
    server.use('a');
    server.step(1 / 60, [c], () => 1, () => null);
    const r = client.apply(JSON.parse(JSON.stringify(toNetItems(server, server.events.splice(0)))), own);
    const id = server.projectiles[0].id;
    expect(r.adopt).toEqual([[local, id]]);
    expect(r.events.filter((e) => e.type === 'use' || e.type === 'spawn')).toEqual([]);
    expect(client.world.projectiles.map((p) => p.id)).toEqual([id]);
    expect(client.world.kart('a').item).toBe('mine');
  });

  it('a use the server refuses disappears again', () => {
    const { server, client, c, own } = setup();
    client.use('a', c);
    const local = client.world.projectiles[0].id;
    client.update(0.5);
    // the server never fired (the kart was hit just before): the item is back after the timeout
    expect(client.update(0.6)).toEqual([{ type: 'destroy', id: local, reason: 'timeout' }]);
    expect(client.world.projectiles).toEqual([]);
    client.apply(toNetItems(server, []), own);
    expect(client.world.kart('a').item).toBe('blaster');
  });
});
