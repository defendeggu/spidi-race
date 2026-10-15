import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import type { CarState, Race, ServerMsg, Slot } from '@spidi/shared';
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

type Internals = { race: Race | null; cars: { slot: Slot; state: CarState }[] };

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
});
