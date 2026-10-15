import {
  BattleBot, BattleSession, battleSpawn, collideCars, createTownCar, getCar, getTown, HARBOR, idleCar, ItemWorld,
  NO_INPUT, stepCarTown, stepKartWith, tickKartTimers, toNetBattle, toNetCar, toNetItems, townArena,
  type CarState, type ItemEvent, type ServerMsg, type Slot,
} from '@spidi/shared';

/** after the battle is decided the clients see the result for this long before the end message */
const END_DELAY = 2.5;

export interface MatchCar {
  slot: Slot;
  state: CarState;
}

/**
 * A kart battle in the practice town on the game server. Like the online races, every client drives
 * its own karts; the server runs the bots and judges everything else: item boxes, projectiles, mines,
 * hits, balloons and who fell into the harbour.
 */
export class BattleMatch {
  private town = getTown();
  readonly session: BattleSession;
  readonly items: ItemWorld;
  private bots = new Map<string, BattleBot>();
  private events: ItemEvent[] = [];
  private endIn = END_DELAY;

  constructor(readonly slots: Slot[]) {
    const ids = slots.map((s) => s.id);
    this.session = new BattleSession(ids);
    this.items = new ItemWorld(townArena(this.town), ids, Math.floor(Math.random() * 1e9));
    for (const s of slots) if (s.isAI) this.bots.set(s.id, new BattleBot(s.grid + 1));
  }

  /** Start position of a kart: its own intersection around the town centre. */
  createCar(slot: Slot) {
    return createTownCar(slot.id, battleSpawn(slot.grid));
  }

  get running() {
    return this.session.phase === 'running';
  }

  /** May this kart use its item now? */
  canUse(id: string) {
    return this.running && this.session.alive(id);
  }

  /** One server step. Returns true once the battle is over and the result can be sent. */
  tick(cars: MatchCar[], dt: number) {
    const se = this.session, town = this.town, items = this.items;
    se.step(dt);
    const alive = cars.filter((c) => se.alive(c.slot.id));
    const states = alive.map((c) => c.state);
    for (const c of cars) {
      const s = c.state, id = c.slot.id;
      const bot = this.bots.get(id);
      if (bot) {
        if (se.phase === 'countdown') idleCar(s, NO_INPUT, dt);
        else {
          let inp = { ...NO_INPUT, handbrake: true };
          if (se.alive(id) && se.phase === 'running') {
            const d = bot.update(s, town, items, states, (o) => se.alive(o), dt);
            inp = d.input;
            if (d.use) items.use(id);
          }
          const spec = getCar(c.slot.carId);
          stepKartWith(s, spec, inp, dt, items.kart(id), (sp, i) => stepCarTown(s, sp, i, town, dt));
        }
      } else if (se.phase === 'running') tickKartTimers(items.kart(id), dt);
      // into the harbour: all balloons gone (the clients report their own karts' height)
      if (s.y < HARBOR.waterY && se.alive(id)) se.eliminate(id);
    }
    if (se.phase === 'running') {
      // bots are pushed by everyone; the clients' karts are simulated by their clients
      for (let a = 0; a < alive.length; a++)
        for (let b = a + 1; b < alive.length; b++) {
          const x = alive[a], y = alive[b];
          const bx = this.bots.has(x.slot.id), by = this.bots.has(y.slot.id);
          if (!bx && !by) continue;
          collideCars(x.state, y.state, bx ? getCar(x.slot.carId).mass : Infinity, by ? getCar(y.slot.carId).mass : Infinity);
        }
      // the item roll goes by balloons: fewer balloons, better items
      const rank = (id: string) => 1 + alive.filter((o) => (se.balloons.get(o.slot.id) ?? 0) > (se.balloons.get(id) ?? 0)).length;
      const nearest = (id: string) => {
        const me = cars.find((c) => c.slot.id === id)?.state;
        if (!me) return null;
        let best: string | null = null, bd = Infinity;
        for (const o of alive) {
          if (o.slot.id === id) continue;
          const d = Math.hypot(o.state.x - me.x, o.state.z - me.z);
          if (d < bd) {
            bd = d;
            best = o.slot.id;
          }
        }
        return best;
      };
      items.step(dt, states, rank, nearest);
      for (const e of items.events) {
        if (e.type === 'hit') se.hit(e.victim);
        this.events.push(e);
      }
      items.events.length = 0;
    }
    if (se.phase !== 'finished') return false;
    this.endIn -= dt;
    return this.endIn <= 0;
  }

  /** A player left: their karts are out. */
  leave(id: string) {
    this.session.eliminate(id);
  }

  snapshot(cars: MatchCar[]): ServerMsg {
    return {
      type: 'bsnap', cars: cars.map((c) => toNetCar(c.state)),
      items: toNetItems(this.items, this.events.splice(0)), battle: toNetBattle(this.session),
    };
  }

  result(): ServerMsg {
    const rows = this.session.ranking((id) => this.items.kart(id).hitsGiven).map((r) => {
      const slot = this.slots.find((s) => s.id === r.id)!;
      return { ...r, name: slot.name, carId: slot.carId, isAI: slot.isAI, ownerId: slot.ownerId };
    });
    return { type: 'battleEnd', rows, winner: this.session.winner() };
  }
}
