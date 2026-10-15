import type { WebSocket } from 'ws';
import type { Leaderboard } from './leaderboard';
import {
  AIDriver, applyNetCar, CARS, carsForClass, collideCars, createCarState, getCar, getTrack, gridPosition, idleCar,
  MAX_CARS, NO_INPUT, Race, sanitizeNetCar, stepCar, toNetCar, TRACK_DEFS,
  type CarState, type ClientMsg, type LobbyPlayer, type LobbySettings, type ServerMsg, type Slot, type Track,
} from '@spidi/shared';

const TICK = 1 / 60;
/** a client may move its car at most this much faster than the car's top speed (lag bursts) */
const SPEED_SLACK = 1.5;
/** ping interval; a client that misses two pongs is dropped */
const PING_MS = 15_000;
const AI_NAMES = ['Rossi', 'Lindqvist', 'Tanaka', 'Moreau', 'Becker', 'Okafor', 'Silva', 'Novak'];

interface Client {
  id: string;
  ws: WebSocket;
  players: LobbyPlayer[];
  joinedAt: number;
  missedPongs: number;
}

interface ServerCar {
  slot: Slot;
  state: CarState;
  ai?: AIDriver;
  seen: boolean;
  /** server time (ms) of the last accepted state update */
  lastUpdate: number;
}

/** A single lobby/race shared by everyone connected to this server. */
export class Room {
  constructor(private leaderboard: Leaderboard) {}

  private clients = new Map<string, Client>();
  private nextId = 1;
  private hostId = '';
  private settings: LobbySettings = { trackId: TRACK_DEFS[0].id, laps: 2, aiCount: 3, aiSkill: 0.93 };
  private phase: 'lobby' | 'race' = 'lobby';
  private race: Race | null = null;
  private track: Track | null = null;
  private cars: ServerCar[] = [];
  private timer: NodeJS.Timeout | null = null;
  private ticks = 0;
  private pinger: NodeJS.Timeout | null = null;

  add(ws: WebSocket) {
    const id = `c${this.nextId++}`;
    const client: Client = { id, ws, players: [], joinedAt: Date.now(), missedPongs: 0 };
    this.clients.set(id, client);
    this.send(client, { type: 'welcome', clientId: id });
    ws.on('message', (data) => {
      let msg: unknown;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;
      // a malformed message must never take the server (and everybody's race) down
      try {
        this.handle(client, msg as ClientMsg);
      } catch (e) {
        console.error(`[room] invalid message from ${id}:`, e);
      }
    });
    ws.on('pong', () => (client.missedPongs = 0));
    ws.on('close', () => this.remove(client));
    this.pinger ??= setInterval(() => this.ping(), PING_MS);
    console.log(`[room] client ${id} connected (${this.clients.size} online)`);
  }

  /** Drop clients whose connection died silently (laptop closed, Wi-Fi gone). */
  private ping() {
    for (const c of [...this.clients.values()]) {
      if (c.missedPongs >= 2) {
        console.log(`[room] client ${c.id} timed out`);
        c.ws.terminate();
        this.remove(c);
        continue;
      }
      c.missedPongs++;
      try {
        c.ws.ping();
      } catch {
        /* closing */
      }
    }
    if (this.clients.size === 0 && this.pinger) {
      clearInterval(this.pinger);
      this.pinger = null;
    }
  }

  /** Stop all timers (tests, shutdown). */
  close() {
    if (this.timer) clearInterval(this.timer);
    if (this.pinger) clearInterval(this.pinger);
    this.timer = this.pinger = null;
  }

  private send(c: Client, msg: ServerMsg) {
    if (c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(msg));
  }

  private broadcast(msg: ServerMsg) {
    const data = JSON.stringify(msg);
    for (const c of this.clients.values()) if (c.ws.readyState === c.ws.OPEN) c.ws.send(data);
  }

  private joined() {
    return [...this.clients.values()].filter((c) => c.players.length > 0).sort((a, b) => a.joinedAt - b.joinedAt);
  }

  private broadcastLobby() {
    const joined = this.joined();
    if (!this.clients.has(this.hostId) || !this.clients.get(this.hostId)!.players.length) this.hostId = joined[0]?.id ?? '';
    this.broadcast({
      type: 'lobby', hostId: this.hostId, phase: this.phase, settings: this.settings,
      clients: joined.map((c) => ({ id: c.id, players: c.players })),
    });
  }

  private handle(c: Client, msg: ClientMsg) {
    switch (msg.type) {
      case 'join': {
        if (!Array.isArray(msg.players)) return;
        const players = msg.players.filter((p): p is LobbyPlayer => !!p && typeof p === 'object').slice(0, 2);
        if (players.length === 0) return;
        c.players = players.map((p, k) => ({
          name: String(p.name ?? '').replace(/[<>]/g, '').trim().slice(0, 16) || `Spieler ${k + 1}`,
          // karts race only locally for now (their items are not synchronised over the network)
          carId: CARS.some((car) => car.id === p.carId && car.class !== 'kart') ? p.carId : CARS[0].id,
        }));
        this.broadcastLobby();
        break;
      }
      case 'settings': {
        if (c.id !== this.hostId || this.phase !== 'lobby' || !msg.settings || typeof msg.settings !== 'object') return;
        const s = msg.settings;
        this.settings = {
          trackId: TRACK_DEFS.some((t) => t.id === s.trackId) ? s.trackId : this.settings.trackId,
          laps: Math.max(1, Math.min(10, Math.round(Number(s.laps) || 2))),
          aiCount: Math.max(0, Math.min(MAX_CARS, Math.round(Number(s.aiCount) || 0))),
          aiSkill: Math.max(0.8, Math.min(1, Number(s.aiSkill) || 0.93)),
        };
        this.broadcastLobby();
        break;
      }
      case 'start':
        if (c.id === this.hostId && this.phase === 'lobby') this.startRace();
        break;
      case 'abort':
        if (c.id === this.hostId && this.phase === 'race') {
          this.broadcast({ type: 'aborted', by: c.players[0]?.name ?? 'Host' });
          this.endRace(false);
          console.log(`[room] race aborted by host ${c.id}`);
        }
        break;
      case 'state': {
        if (this.phase !== 'race' || !Array.isArray(msg.cars)) return;
        const now = performance.now();
        for (const raw of msg.cars.slice(0, 2)) {
          const id = raw && typeof raw === 'object' ? (raw as { id?: unknown }).id : undefined;
          const car = this.cars.find((k) => k.slot.id === id && k.slot.ownerId === c.id);
          if (!car) continue;
          const spec = getCar(car.slot.carId);
          const nc = sanitizeNetCar(raw, spec.gears);
          if (!nc) continue;
          // no teleporting: limit the distance since the last update to what the car can drive
          if (car.seen) {
            const dt = Math.min(0.5, (now - car.lastUpdate) / 1000) + 0.05;
            const max = spec.topSpeed * SPEED_SLACK * dt;
            const dx = nc.x - car.state.x, dz = nc.z - car.state.z, d = Math.hypot(dx, dz);
            if (d > max) {
              nc.x = car.state.x + (dx / d) * max;
              nc.z = car.state.z + (dz / d) * max;
            }
          }
          car.lastUpdate = now;
          applyNetCar(car.state, nc);
          const p = this.track!.project(car.state.x, car.state.z, car.state.idx);
          car.state.idx = p.idx;
          car.state.s = p.s;
          car.seen = true;
        }
        break;
      }
    }
  }

  private startRace() {
    const joined = this.joined();
    if (joined.length === 0) return;
    const humans = joined.flatMap((c) => c.players.map((p, k) => ({ client: c, p, k })));
    const aiCount = Math.max(0, Math.min(this.settings.aiCount, MAX_CARS - humans.length));
    // only cars of the track's class may start (road, offroad or micro)
    const pool = carsForClass(getTrack(this.settings.trackId).carClass);
    const slots: Slot[] = [];
    for (let i = 0; i < aiCount; i++) {
      slots.push({ id: `ai${i}`, name: AI_NAMES[i % AI_NAMES.length], carId: pool[(i + 1) % pool.length].id, isAI: true, ownerId: '', grid: i });
    }
    humans.slice(0, MAX_CARS).forEach((h, k) => {
      const carId = pool.some((c) => c.id === h.p.carId) ? h.p.carId : pool[k % pool.length].id;
      slots.push({ id: `${h.client.id}-${h.k + 1}`, name: h.p.name, carId, isAI: false, ownerId: h.client.id, grid: aiCount + k });
    });

    this.track = getTrack(this.settings.trackId);
    const countdown = 4.5;
    this.race = new Race(this.track, this.settings.laps, slots, countdown);
    this.cars = slots.map((slot) => {
      const g = gridPosition(this.track!, slot.grid);
      return {
        slot,
        state: createCarState(slot.id, this.track!, g.x, g.z, g.heading),
        ai: slot.isAI ? new AIDriver(slot.grid + 1, this.settings.aiSkill - 0.06 + ((slot.grid * 37) % 7) * 0.012) : undefined,
        seen: false,
        lastUpdate: 0,
      };
    });
    this.phase = 'race';
    this.broadcast({ type: 'start', trackId: this.settings.trackId, laps: this.settings.laps, slots, countdown });
    this.broadcastLobby();
    this.ticks = 0;
    // fixed steps on real time: setInterval(16.67) fires ~62.5×/s in Node, which made races 3 % too fast
    let last = performance.now(), acc = 0;
    this.timer = setInterval(() => {
      const now = performance.now();
      acc += Math.min(0.1, (now - last) / 1000);
      last = now;
      while (acc >= TICK && this.race) {
        this.tick();
        acc -= TICK;
      }
    }, 8);
    console.log(`[room] race started on ${this.settings.trackId} with ${humans.length} players and ${aiCount} AI`);
  }

  private tick() {
    const race = this.race!, track = this.track!;
    const states = this.cars.map((c) => c.state);
    for (const c of this.cars) {
      if (!c.ai) continue;
      const spec = getCar(c.slot.carId);
      if (!race.started) idleCar(c.state, NO_INPUT, TICK);
      else stepCar(c.state, spec, c.ai.update(c.state, spec, track, TICK, states), track, TICK);
    }
    if (race.started) {
      // AI cars are pushed by everyone; human cars are simulated by their clients
      for (let i = 0; i < this.cars.length; i++)
        for (let j = i + 1; j < this.cars.length; j++) {
          const a = this.cars[i], b = this.cars[j];
          if (!a.ai && !b.ai) continue;
          collideCars(a.state, b.state, a.ai ? getCar(a.slot.carId).mass : Infinity, b.ai ? getCar(b.slot.carId).mass : Infinity);
        }
    }
    race.update(TICK, (id) => {
      const c = this.cars.find((k) => k.slot.id === id);
      return c && (c.ai || c.seen) ? c.state.s : undefined;
    });
    if (++this.ticks % 2 === 0) {
      this.broadcast({ type: 'snap', cars: this.cars.map((c) => toNetCar(c.state)), race: race.toNet() });
    }
    if (race.phase === 'finished') this.endRace(true);
  }

  private endRace(sendResults: boolean) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (sendResults && this.race) {
      const results = this.race.results();
      // online races go to the permanent leaderboard directly from the server
      const finished = results.filter((r) => !r.isAI && r.finished);
      const ranks = this.leaderboard.add(finished.map((r) => ({
        name: r.name, carId: r.carId, trackId: this.track!.def.id, laps: this.race!.laps, time: r.time, bestLap: r.bestLap, mode: 'online',
      })), { trusted: true });
      this.broadcast({ type: 'end', results, ranks: Object.fromEntries(finished.map((r, i) => [r.id, ranks[i]])) });
    }
    this.race = null;
    this.cars = [];
    this.phase = 'lobby';
    this.broadcastLobby();
    console.log('[room] race finished');
  }

  private remove(c: Client) {
    if (!this.clients.delete(c.id)) return;
    console.log(`[room] client ${c.id} left (${this.clients.size} online)`);
    if (this.race) {
      for (const car of this.cars.filter((k) => k.slot.ownerId === c.id)) this.race.removeEntry(car.slot.id);
      this.cars = this.cars.filter((k) => k.slot.ownerId !== c.id);
      if (!this.cars.some((k) => !k.ai)) this.endRace(false);
    }
    this.broadcastLobby();
  }
}
