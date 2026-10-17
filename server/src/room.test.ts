import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { getCar, HARBOR, type BattleSession, type CarState, type ItemWorld, type Race, type ServerMsg, type Slot } from '@spidi/shared';
import { Leaderboard } from './leaderboard';
import { Room } from './room';

/** Minimal stand-in for a ws connection: records what the server sends. */
class FakeSocket extends EventEmitter {
  readonly OPEN = 1;
  readyState = 1;
  sent: ServerMsg[] = [];
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  ping() {}
  terminate() {
    this.readyState = 3;
    this.emit('close');
  }
  /** a raw message as it would arrive over the wire */
  msg(raw: string | object) {
    this.emit('message', Buffer.from(typeof raw === 'string' ? raw : JSON.stringify(raw)));
  }
}

type Internals = {
  race: Race | null; cars: { slot: Slot; state: CarState }[]; items: ItemWorld | null; tick(): void; timer: NodeJS.Timeout | null;
  battle: { session: BattleSession; items: ItemWorld; tick(cars: { slot: Slot; state: CarState }[], dt: number): boolean } | null; phase: string;
};

const rooms: Room[] = [];
const dirs: string[] = [];
afterEach(() => {
  rooms.splice(0).forEach((r) => r.close());
  dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true }));
});

function setup() {
  const d = mkdtempSync(join(tmpdir(), 'spidi-room-'));
  dirs.push(d);
  const room = new Room(new Leaderboard(join(d, 'leaderboard.json')));
  rooms.push(room);
  const join_ = (name: string) => {
    const ws = new FakeSocket();
    room.add(ws as unknown as WebSocket);
    ws.msg({ type: 'join', players: [{ name, carId: 'falcone' }] });
    return ws;
  };
  return { room, inner: room as unknown as Internals, join: join_ };
}

describe('room', () => {
  it('survives malformed messages (security report S-1)', () => {
    const { inner, join } = setup();
    const a = join('Anna');
    const garbage = ['null', '[null]', '"text"', '42', '[]', 'not json', '{"type":"join","players":[null]}', '{"type":"join","players":"x"}',
      '{"type":"settings","settings":"x"}', '{"type":"settings","settings":null}', '{"type":"state","cars":[null]}', '{"type":"nonsense"}'];
    for (const g of garbage) expect(() => a.msg(g)).not.toThrow();
    a.msg({ type: 'start' });
    expect(inner.race).not.toBeNull();
    // during the race, too
    for (const g of ['{"type":"state","cars":[null]}', '{"type":"state","cars":[{"id":null}]}', '{"type":"state","cars":"x"}', 'null'])
      expect(() => a.msg(g)).not.toThrow();
  });

  it('guests mark themselves ready; latecomers wait for the next race; ready resets after a race', () => {
    const { inner, join } = setup();
    const a = join('Anna');
    const b = join('Ben');
    const lastLobby = (ws: { sent: ServerMsg[] }) => [...ws.sent].reverse().find((m) => m.type === 'lobby') as Extract<ServerMsg, { type: 'lobby' }>;
    expect(lastLobby(a).clients.map((c) => c.ready)).toEqual([false, false]);
    b.msg({ type: 'ready', ready: true });
    expect(lastLobby(a).clients.map((c) => c.ready)).toEqual([false, true]);
    a.msg({ type: 'start' });
    expect(inner.phase).toBe('race');
    // Cleo comes in while the race runs: she is in the lobby but not in the race
    const c = join('Cleo');
    const during = lastLobby(a);
    expect(during.phase).toBe('race');
    expect(during.clients.map((k) => k.racing)).toEqual([true, true, false]);
    // the host aborts: back to the lobby, everybody has to confirm again
    a.msg({ type: 'abort' });
    const after = lastLobby(c);
    expect(after.phase).toBe('lobby');
    expect(after.clients.map((k) => k.ready)).toEqual([false, false, false]);
    expect(after.clients.map((k) => k.racing)).toEqual([false, false, false]);
  });

  it('only the host starts the race', () => {
    const { inner, join } = setup();
    join('Anna');
    const b = join('Ben');
    b.msg({ type: 'start' });
    expect(inner.race).toBeNull();
  });

  it('cleans car states and does not let cars teleport (S-2, S-3)', () => {
    const { inner, join } = setup();
    const a = join('Anna');
    a.msg({ type: 'start' });
    const lobby = a.sent.find((m) => m.type === 'welcome') as { clientId: string };
    const car = inner.cars.find((c) => c.slot.ownerId === lobby.clientId)!;
    const { x, z } = car.state;
    a.msg({ type: 'state', cars: [{ id: car.slot.id, x, z, y: 0, h: 0, g: { nested: ['xxx'] }, br: 'yes', rpm: 'fast', vx: 1e308 }] });
    expect(car.state.gear).toBeTypeOf('number');
    expect(car.state.braking).toBe(false);
    expect(Number.isFinite(car.state.vx)).toBe(true);
    // 1000 m in one packet: clamped to what the car can drive
    a.msg({ type: 'state', cars: [{ id: car.slot.id, x: x + 1000, z, y: 0, h: 0 }] });
    expect(car.state.x - x).toBeLessThan(88 * 1.5 * 0.6);
    // another player's car cannot be moved
    const other = inner.cars.find((c) => c.slot.ownerId !== lobby.clientId)!;
    const ox = other.state.x;
    a.msg({ type: 'state', cars: [{ id: other.slot.id, x: ox + 5, z: other.state.z }] });
    expect(other.state.x).toBe(ox);
  });

  it('the race clock runs at real time (F-1)', async () => {
    const { inner, join } = setup();
    const a = join('Anna');
    a.msg({ type: 'start' });
    const c0 = inner.race!.countdown, t0 = performance.now();
    await new Promise((r) => setTimeout(r, 1500));
    const real = (performance.now() - t0) / 1000;
    const sim = c0 - inner.race!.countdown;
    expect(sim / real).toBeGreaterThan(0.98);
    expect(sim / real).toBeLessThan(1.02);
  });

  it('drops clients that stop answering pings (F-3)', () => {
    const { room, join } = setup();
    const a = join('Anna');
    const ping = (room as unknown as { ping(): void }).ping.bind(room);
    ping();
    ping();
    expect(a.readyState).toBe(1);
    ping();
    expect(a.readyState).toBe(3);
  });

  it('runs kart races with items on the server', () => {
    const { inner, join } = setup();
    const a = join('Anna');
    a.msg({ type: 'join', players: [{ name: 'Anna', carId: 'kart-oopi' }] });
    // karts are not allowed on the breakfast table: the host's choice falls back to a road track
    a.msg({ type: 'settings', settings: { trackId: 'fruehstueck', laps: 1, aiCount: 3, aiSkill: 0.93, kart: true } });
    a.msg({ type: 'start' });
    const start = a.sent.find((m) => m.type === 'start') as Extract<ServerMsg, { type: 'start' }>;
    expect(start.kart).toBe(true);
    expect(start.slots.every((s) => getCar(s.carId).class === 'kart')).toBe(true);
    expect(start.slots.find((s) => !s.isAI)!.carId).toBe('kart-oopi');
    expect(inner.items).not.toBeNull();
    // drive the server by hand (the timer is stopped): the AI karts collect items and shoot
    clearInterval(inner.timer!);
    const me = start.slots.find((s) => !s.isAI)!.id;
    let used = 0;
    for (let i = 0; i < 60 * 60 && inner.race; i++) {
      inner.tick();
      used += inner.items?.events.length ?? 0;
    }
    const snaps = a.sent.filter((m): m is Extract<ServerMsg, { type: 'snap' }> => m.type === 'snap' && !!m.items);
    expect(snaps.length).toBeGreaterThan(100);
    const events = snaps.flatMap((m) => m.items!.ev);
    expect(events.some((e) => e.type === 'box')).toBe(true);
    expect(events.some((e) => e.type === 'use')).toBe(true);
    expect(used).toBe(0); // the events go out with the snapshots
    // a client can only fire its own kart's item, and only when it has one
    const ks = inner.items!.kart(me);
    ks.item = 'turbo';
    a.msg({ type: 'item', id: 'ai0' });
    a.msg({ type: 'item', id: me });
    inner.tick();
    expect(ks.item).toBeNull();
    // the client's drift and boost are taken over, cleaned
    a.msg({ type: 'state', cars: [{ id: me, x: inner.cars.find((c) => c.slot.id === me)!.state.x, z: inner.cars.find((c) => c.slot.id === me)!.state.z }], karts: [{ id: me, bo: 99, dr: 5, dt: 1, hp: 'x' }] });
    expect(ks.boost).toBe(3);
    expect(ks.drift).toBe(1);
    expect(ks.hop).toBe(0);
  });

  it('runs a kart battle in the town', () => {
    const { inner, join } = setup();
    const a = join('Anna'), b = join('Ben');
    a.msg({ type: 'join', players: [{ name: 'Anna', carId: 'kart-ooli' }] });
    a.msg({ type: 'settings', settings: { trackId: 'speedway', laps: 1, aiCount: 9, aiSkill: 0.93, kart: true, battle: true } });
    a.msg({ type: 'start' });
    const start = b.sent.find((m) => m.type === 'start') as Extract<ServerMsg, { type: 'start' }>;
    expect(start.battle).toBe(true);
    // two players and at most four bots, all in karts, each on its own intersection
    expect(start.slots.length).toBe(6);
    expect(start.slots.every((s) => getCar(s.carId).class === 'kart')).toBe(true);
    expect(new Set(inner.cars.map((c) => `${c.state.x},${c.state.z}`)).size).toBe(6);
    // stop the room's clock and step the battle by hand
    clearInterval(inner.timer!);
    const battle = inner.battle!;
    const step = (n: number) => {
      for (let i = 0; i < n && !battle.tick(inner.cars, 1 / 60); i++);
    };
    step(60 * 4);
    expect(battle.session.phase).toBe('running');
    // Ben drives into the harbour: out
    const ben = start.slots.find((s) => !s.isAI && s.name === 'Ben')!;
    const car = inner.cars.find((c) => c.slot.id === ben.id)!;
    b.msg({ type: 'state', cars: [{ id: ben.id, x: car.state.x, z: car.state.z, y: HARBOR.waterY - 2 }] });
    step(1);
    expect(battle.session.alive(ben.id)).toBe(false);
    // Anna fires her item; Ben (out) cannot, and nobody fires someone else's
    const anna = start.slots.find((s) => !s.isAI && s.name === 'Anna')!;
    battle.items.kart(anna.id).item = 'shield';
    battle.items.kart(ben.id).item = 'shield';
    b.msg({ type: 'item', id: anna.id });
    b.msg({ type: 'item', id: ben.id });
    step(1);
    expect(battle.items.kart(anna.id).item).toBe('shield');
    expect(battle.items.kart(ben.id).item).toBe('shield');
    a.msg({ type: 'item', id: anna.id });
    step(1);
    expect(battle.items.kart(anna.id).shield).toBeGreaterThan(0);
    // the bots hunt Anna (who stands still) and each other: decided within the three minutes
    step(60 * 200);
    expect(battle.session.phase).toBe('finished');
  });

  it('sends the battle result and returns to the lobby', async () => {
    const { inner, join } = setup();
    const a = join('Anna'), b = join('Ben');
    a.msg({ type: 'settings', settings: { trackId: 'speedway', laps: 1, aiCount: 0, aiSkill: 0.93, kart: true, battle: true } });
    a.msg({ type: 'start' });
    const start = a.sent.find((m) => m.type === 'start') as Extract<ServerMsg, { type: 'start' }>;
    const [anna, ben] = start.slots;
    inner.battle!.session.step(5);
    // Ben falls into the harbour: Anna wins, the result follows after a short pause
    const car = inner.cars.find((c) => c.slot.id === ben.id)!;
    b.msg({ type: 'state', cars: [{ id: ben.id, x: car.state.x, z: car.state.z, y: HARBOR.waterY - 2 }] });
    await new Promise((r) => setTimeout(r, 3000));
    const end = a.sent.find((m) => m.type === 'battleEnd') as Extract<ServerMsg, { type: 'battleEnd' }> | undefined;
    expect(end?.winner).toBe(anna.id);
    expect(end?.rows.map((r) => [r.id, r.place, r.isAI])).toEqual([[anna.id, 1, false], [ben.id, 2, false]]);
    expect(inner.phase).toBe('lobby');
    expect(a.sent.filter((m) => m.type === 'bsnap').length).toBeGreaterThan(50);
  });
});
