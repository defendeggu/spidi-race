import type { WebSocket } from 'ws';
import type { Leaderboard } from './leaderboard';
import { BattleMatch } from './battleMatch';
import {
  AIDriver, applyKartDrive, BATTLE_BOT_NAMES, BATTLE_MAX_KARTS, applyNetCar, CARS, carsForClass, collideCars, createCarState, getCar, getTrack, gridPosition,
  idleCar, ItemWorld, KART_PREFIX, KartBrain, MAX_CARS, NO_INPUT, Race, sanitizeNetCar, stepCar, stepKart, tickKartTimers,
  toNetCar, toNetItems, TRACK_DEFS,
  type CarState, type ClientMsg, type ItemEvent, type LobbyPlayer, type LobbySettings, type ServerMsg, type Slot, type Track,
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
  ready: boolean;
}

interface ServerCar {
  slot: Slot;
  state: CarState;
  ai?: AIDriver;
  /** kart races: item tactics of an AI kart */
  brain?: KartBrain;
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
  private settings: LobbySettings = { trackId: TRACK_DEFS[0].id, laps: 2, aiCount: 3, aiSkill: 0.93, kart: false };
  private phase: 'lobby' | 'race' = 'lobby';
  private race: Race | null = null;
  private track: Track | null = null;
  private cars: ServerCar[] = [];
  /** kart races: the items of all karts are judged here, the clients only show them */
  private items: ItemWorld | null = null;
  private itemEvents: ItemEvent[] = [];
  /** kart battle in the practice town (instead of a race) */
  private battle: BattleMatch | null = null;
  private timer: NodeJS.Timeout | null = null;
  private ticks = 0;
  private pinger: NodeJS.Timeout | null = null;

  add(ws: WebSocket) {
    const id = `c${this.nextId++}`;
    const client: Client = { id, ws, players: [], joinedAt: Date.now(), missedPongs: 0, ready: false };
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
      clients: joined.map((c) => ({
        id: c.id, players: c.players, ready: c.ready,
        racing: this.phase === 'race' && this.cars.some((k) => k.slot.ownerId === c.id),
      })),
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
          carId: CARS.some((car) => car.id === p.carId) ? p.carId : CARS[0].id,
        }));
        this.broadcastLobby();
        break;
      }
      case 'settings': {
        if (c.id !== this.hostId || this.phase !== 'lobby' || !msg.settings || typeof msg.settings !== 'object') return;
        const s = msg.settings;
        const kart = s.kart === true;
        const battle = kart && s.battle === true;
        // karts race on road and offroad tracks, not on the breakfast table
        const ok = (id: unknown) => TRACK_DEFS.some((t) => t.id === id && !(kart && t.class === 'micro'));
        this.settings = {
          kart,
          battle,
          trackId: ok(s.trackId) ? s.trackId : ok(this.settings.trackId) ? this.settings.trackId : TRACK_DEFS[0].id,
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
      case 'ready':
        if (!c.players.length) return;
        c.ready = msg.ready === true;
        this.broadcastLobby();
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
          if (this.track) {
            const p = this.track.project(car.state.x, car.state.z, car.state.idx);
            car.state.idx = p.idx;
            car.state.s = p.s;
          }
          car.seen = true;
        }
        const items = this.items ?? this.battle?.items;
        if (items && Array.isArray(msg.karts)) {
          for (const raw of msg.karts.slice(0, 2)) {
            const id = raw && typeof raw === 'object' ? (raw as { id?: unknown }).id : undefined;
            const car = this.cars.find((k) => k.slot.id === id && k.slot.ownerId === c.id);
            if (car) applyKartDrive(items.kart(car.slot.id), raw);
          }
        }
        break;
      }
      case 'item': {
        const car = this.cars.find((k) => k.slot.id === msg.id && k.slot.ownerId === c.id);
        if (!car) return;
        if (this.battle) {
          if (this.battle.canUse(car.slot.id)) this.battle.items.use(car.slot.id);
          return;
        }
        if (!this.items || !this.race?.started || this.race.entry(car.slot.id)?.finished) return;
        this.items.use(car.slot.id);
        break;
      }
    }
  }

  private startRace() {
    const joined = this.joined();
    if (joined.length === 0) return;
    if (this.settings.battle) {
      this.startBattle();
      return;
    }
    const humans = joined.flatMap((c) => c.players.map((p, k) => ({ client: c, p, k })));
    const aiCount = Math.max(0, Math.min(this.settings.aiCount, MAX_CARS - humans.length));
    // only cars of the track's class may start (road, offroad or micro) – or karts in a kart race
    const kart = !!this.settings.kart;
    const pool = carsForClass(kart ? 'kart' : getTrack(this.settings.trackId).carClass);
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
        brain: kart && slot.isAI ? new KartBrain(slot.grid + 1) : undefined,
        seen: false,
        lastUpdate: 0,
      };
    });
    this.items = kart ? new ItemWorld(this.track, slots.map((s) => s.id), Math.floor(Math.random() * 1e9)) : null;
    this.itemEvents = [];
    this.phase = 'race';
    this.broadcast({ type: 'start', trackId: this.settings.trackId, laps: this.settings.laps, slots, countdown, kart });
    this.broadcastLobby();
    this.runClock(() => this.tick());
    console.log(`[room] ${kart ? 'kart race' : 'race'} started on ${this.settings.trackId} with ${humans.length} players and ${aiCount} AI`);
  }

  /** Fixed steps on real time: setInterval(16.67) fires ~62.5×/s in Node, which made races 3 % too fast. */
  private runClock(tick: () => void) {
    this.ticks = 0;
    let last = performance.now(), acc = 0;
    this.timer = setInterval(() => {
      const now = performance.now();
      acc += Math.min(0.1, (now - last) / 1000);
      last = now;
      while (acc >= TICK && this.phase === 'race') {
        tick();
        acc -= TICK;
      }
    }, 8);
  }

  /** Kart battle in the practice town: up to 8 karts, at most 4 of them bots. */
  private startBattle() {
    const humans = this.joined().flatMap((c) => c.players.map((p, k) => ({ client: c, p, k }))).slice(0, BATTLE_MAX_KARTS);
    const bots = Math.max(0, Math.min(this.settings.aiCount, BATTLE_BOT_NAMES.length, BATTLE_MAX_KARTS - humans.length));
    const pool = carsForClass('kart');
    const slots: Slot[] = humans.map((h, k) => ({
      id: `${h.client.id}-${h.k + 1}`, name: h.p.name, carId: pool.some((c) => c.id === h.p.carId) ? h.p.carId : pool[k % pool.length].id,
      isAI: false, ownerId: h.client.id, grid: k,
    }));
    // bots prefer the karts nobody else drives, so everybody can be told apart
    const taken = new Set(slots.map((s) => s.carId));
    const botKarts = [...pool.filter((c) => !taken.has(c.id)), ...pool.filter((c) => taken.has(c.id))];
    for (let i = 0; i < bots; i++) {
      slots.push({ id: `ai${i}`, name: BATTLE_BOT_NAMES[i], carId: botKarts[i % botKarts.length].id, isAI: true, ownerId: '', grid: humans.length + i });
    }
    const battle = new BattleMatch(slots);
    this.battle = battle;
    this.track = null;
    this.cars = slots.map((slot) => ({ slot, state: battle.createCar(slot), seen: false, lastUpdate: 0 }));
    this.phase = 'race';
    this.broadcast({ type: 'start', trackId: this.settings.trackId, laps: 1, slots, countdown: battle.session.countdown, kart: true, battle: true });
    this.broadcastLobby();
    this.runClock(() => {
      const done = battle.tick(this.cars, TICK);
      if (++this.ticks % 2 === 0) this.broadcast(battle.snapshot(this.cars));
      if (done) {
        this.broadcast(battle.result());
        this.endRace(false);
      }
    });
    console.log(`[room] kart battle started with ${humans.length} players and ${bots} bots`);
  }

  private tick() {
    const race = this.race!, track = this.track!;
    const states = this.cars.map((c) => c.state);
    const items = this.items;
    for (const c of this.cars) {
      if (!c.ai) {
        // karts of the clients: only the timers, the clients drive them
        if (items && race.started) tickKartTimers(items.kart(c.slot.id), TICK);
        continue;
      }
      const spec = getCar(c.slot.carId);
      if (!race.started) idleCar(c.state, NO_INPUT, TICK);
      else if (items) {
        let inp = c.ai.update(c.state, spec, track, TICK, states);
        if (c.brain && !race.entry(c.slot.id)?.finished) {
          const d = c.brain.update(c.state, inp, track, items, states, TICK);
          inp = d.input;
          if (d.use) items.use(c.slot.id);
        }
        stepKart(c.state, spec, inp, track, TICK, items.kart(c.slot.id));
      } else stepCar(c.state, spec, c.ai.update(c.state, spec, track, TICK, states), track, TICK);
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
    if (race.started && items) {
      const pos = (id: string) => race.entry(id)?.position ?? 1;
      const ahead = (id: string) => race.entries.find((e) => e.position === pos(id) - 1)?.id ?? null;
      // cars of clients that have not reported yet are still on the grid: they take part like the others
      items.step(TICK, states, pos, ahead);
      this.itemEvents.push(...items.events);
      items.events.length = 0;
    }
    race.update(TICK, (id) => {
      const c = this.cars.find((k) => k.slot.id === id);
      return c && (c.ai || c.seen) ? c.state.s : undefined;
    });
    if (++this.ticks % 2 === 0) {
      this.broadcast({
        type: 'snap', cars: this.cars.map((c) => toNetCar(c.state)), race: race.toNet(),
        items: items ? toNetItems(items, this.itemEvents.splice(0)) : undefined,
      });
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
        name: r.name, carId: r.carId, trackId: (this.items ? KART_PREFIX : '') + this.track!.def.id, laps: this.race!.laps, time: r.time, bestLap: r.bestLap, mode: 'online',
      })), { trusted: true });
      this.broadcast({ type: 'end', results, ranks: Object.fromEntries(finished.map((r, i) => [r.id, ranks[i]])) });
    }
    this.race = null;
    this.battle = null;
    this.cars = [];
    this.items = null;
    this.phase = 'lobby';
    // everybody confirms again before the next race
    for (const cl of this.clients.values()) cl.ready = false;
    this.broadcastLobby();
    console.log('[room] race finished');
  }

  private remove(c: Client) {
    if (!this.clients.delete(c.id)) return;
    console.log(`[room] client ${c.id} left (${this.clients.size} online)`);
    if (this.battle) {
      for (const car of this.cars.filter((k) => k.slot.ownerId === c.id)) this.battle.leave(car.slot.id);
      this.cars = this.cars.filter((k) => k.slot.ownerId !== c.id);
      if (!this.cars.some((k) => !k.slot.isAI)) this.endRace(false);
    } else if (this.race) {
      for (const car of this.cars.filter((k) => k.slot.ownerId === c.id)) this.race.removeEntry(car.slot.id);
      this.cars = this.cars.filter((k) => k.slot.ownerId !== c.id);
      if (!this.cars.some((k) => !k.ai)) this.endRace(false);
    }
    this.broadcastLobby();
  }
}
