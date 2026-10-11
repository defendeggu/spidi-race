import type { WebSocket } from 'ws';
import type { Leaderboard } from './leaderboard';
import {
  AIDriver, applyNetCar, CARS, collideCars, createCarState, getCar, getTrack, gridPosition, idleCar,
  MAX_CARS, NO_INPUT, Race, stepCar, toNetCar, TRACK_DEFS,
  type CarState, type ClientMsg, type LobbyPlayer, type LobbySettings, type ServerMsg, type Slot, type Track,
} from '@spidi/shared';

const TICK = 1 / 60;
const AI_NAMES = ['Rossi', 'Lindqvist', 'Tanaka', 'Moreau', 'Becker', 'Okafor', 'Silva', 'Novak'];

interface Client {
  id: string;
  ws: WebSocket;
  players: LobbyPlayer[];
  joinedAt: number;
}

interface ServerCar {
  slot: Slot;
  state: CarState;
  ai?: AIDriver;
  seen: boolean;
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

  add(ws: WebSocket) {
    const id = `c${this.nextId++}`;
    const client: Client = { id, ws, players: [], joinedAt: Date.now() };
    this.clients.set(id, client);
    this.send(client, { type: 'welcome', clientId: id });
    ws.on('message', (data) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      this.handle(client, msg);
    });
    ws.on('close', () => this.remove(client));
    console.log(`[room] client ${id} connected (${this.clients.size} online)`);
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
        c.players = msg.players.slice(0, 2).map((p, k) => ({
          name: String(p.name ?? '').replace(/[<>]/g, '').trim().slice(0, 16) || `Spieler ${k + 1}`,
          carId: CARS.some((car) => car.id === p.carId) ? p.carId : CARS[0].id,
        }));
        this.broadcastLobby();
        break;
      }
      case 'settings': {
        if (c.id !== this.hostId || this.phase !== 'lobby' || !msg.settings) return;
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
        for (const nc of msg.cars) {
          const car = this.cars.find((k) => k.slot.id === nc.id && k.slot.ownerId === c.id);
          if (!car || !Number.isFinite(nc.x) || !Number.isFinite(nc.z)) continue;
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
    const slots: Slot[] = [];
    for (let i = 0; i < aiCount; i++) {
      slots.push({ id: `ai${i}`, name: AI_NAMES[i % AI_NAMES.length], carId: CARS[(i + 1) % CARS.length].id, isAI: true, ownerId: '', grid: i });
    }
    humans.slice(0, MAX_CARS).forEach((h, k) => {
      slots.push({ id: `${h.client.id}-${h.k + 1}`, name: h.p.name, carId: h.p.carId, isAI: false, ownerId: h.client.id, grid: aiCount + k });
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
      };
    });
    this.phase = 'race';
    this.broadcast({ type: 'start', trackId: this.settings.trackId, laps: this.settings.laps, slots, countdown });
    this.broadcastLobby();
    this.ticks = 0;
    this.timer = setInterval(() => this.tick(), 1000 * TICK);
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
      })));
      this.broadcast({ type: 'end', results, ranks: Object.fromEntries(finished.map((r, i) => [r.id, ranks[i]])) });
    }
    this.race = null;
    this.cars = [];
    this.phase = 'lobby';
    this.broadcastLobby();
    console.log('[room] race finished');
  }

  private remove(c: Client) {
    this.clients.delete(c.id);
    console.log(`[room] client ${c.id} left (${this.clients.size} online)`);
    if (this.race) {
      for (const car of this.cars.filter((k) => k.slot.ownerId === c.id)) this.race.removeEntry(car.slot.id);
      this.cars = this.cars.filter((k) => k.slot.ownerId !== c.id);
      if (!this.cars.some((k) => !k.ai)) this.endRace(false);
    }
    this.broadcastLobby();
  }
}
