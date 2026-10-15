import { describe, expect, it } from 'vitest';
import { applyNetBattle, BATTLE_MAX_KARTS, BATTLE_SECONDS, BattleBot, BattleSession, battleSpawn, toNetBattle } from './battle';
import { carsForClass, getCar } from './cars';
import { ItemWorld, townArena } from './items';
import { stepKartWith } from './kart';
import { collideCars } from './physics';
import { createTownCar, getTown, stepCarTown } from './town';

const DT = 1 / 60;
const town = getTown();

describe('kart battle', () => {
  it('balloons: hits cost one, the last kart standing wins', () => {
    const s = new BattleSession(['a', 'b', 'c']);
    for (let i = 0; i <= 60 * 3; i++) s.step(DT);
    expect(s.phase).toBe('running');
    s.hit('b');
    s.hit('b');
    expect(s.balloons.get('b')).toBe(1);
    s.eliminate('c');
    expect(s.alive('c')).toBe(false);
    s.hit('b');
    expect(s.phase).toBe('finished');
    expect(s.winner()).toBe('a');
    expect(s.ranking().map((r) => [r.id, r.place])).toEqual([['a', 1], ['b', 2], ['c', 3]]);
  });

  it('after three minutes the most balloons win, equal balloons are a draw', () => {
    const s = new BattleSession(['a', 'b']);
    for (let i = 0; i <= 60 * (BATTLE_SECONDS + 4); i++) s.step(DT);
    expect(s.phase).toBe('finished');
    expect(s.winner()).toBeNull();
  });

  it('start positions are on free streets, away from the item boxes', () => {
    const boxes = townArena(town).boxes;
    const spots = new Set<string>();
    for (let k = 0; k < BATTLE_MAX_KARTS; k++) {
      const p = battleSpawn(k);
      spots.add(`${p.x},${p.z}`);
      expect(town.isFree(p.x, p.z, 3)).toBe(true);
      for (const b of boxes) expect(Math.hypot(b.x - p.x, b.z - p.z)).toBeGreaterThan(20);
    }
    expect(spots.size).toBe(BATTLE_MAX_KARTS);
  });

  it('a client follows the server battle', () => {
    const server = new BattleSession(['a', 'b', 'c']);
    server.step(5);
    server.hit('a');
    server.eliminate('c');
    const client = new BattleSession(['a', 'b', 'c']);
    applyNetBattle(client, JSON.parse(JSON.stringify(toNetBattle(server))));
    expect(client.phase).toBe(server.phase);
    expect(client.ranking()).toEqual(server.ranking());
    expect(client.winner()).toBe('b');
  });

  it('four bots find item boxes, drive through town and hit each other', () => {
    const ids = ['b0', 'b1', 'b2', 'b3'];
    const pool = carsForClass('kart');
    const cars = ids.map((id, k) => createTownCar(id, battleSpawn(k)));
    const items = new ItemWorld(townArena(town), ids, 9);
    const session = new BattleSession(ids);
    const bots = ids.map((_, k) => new BattleBot(k));
    const start = cars.map((c) => ({ x: c.x, z: c.z }));
    let travelled = 0, hits = 0, boxes = 0;
    for (let i = 0; i < 60 * 150 && session.phase !== 'finished'; i++) {
      session.step(DT);
      if (session.phase !== 'running') continue;
      cars.forEach((c, k) => {
        if (!session.alive(c.id)) return;
        const spec = getCar(pool[k].id);
        const { input, use } = bots[k].update(c, town, items, cars, (id) => session.alive(id), DT);
        if (use) items.use(c.id);
        const px = c.x, pz = c.z;
        stepKartWith(c, spec, input, DT, items.kart(c.id), (s, inp) => stepCarTown(c, s, inp, town, DT));
        travelled += Math.hypot(c.x - px, c.z - pz);
      });
      const alive = cars.filter((c) => session.alive(c.id));
      for (let a = 0; a < alive.length; a++) for (let b = a + 1; b < alive.length; b++) collideCars(alive[a], alive[b], 600, 600);
      items.step(DT, alive, () => 1, () => null);
      for (const e of items.events) {
        if (e.type === 'hit') {
          hits++;
          session.hit(e.victim);
        }
        if (e.type === 'box') boxes++;
      }
      items.events.length = 0;
    }
    console.log(`battle: travelled ${(travelled / 4).toFixed(0)} m per bot, boxes ${boxes}, hits ${hits}, phase ${session.phase}`);
    expect(travelled / 4).toBeGreaterThan(800);
    expect(boxes).toBeGreaterThan(4);
    expect(hits).toBeGreaterThan(0);
    // every bot moved away from its start
    cars.forEach((c, k) => expect(Math.hypot(c.x - start[k].x, c.z - start[k].z)).toBeGreaterThan(20));
  });
});
