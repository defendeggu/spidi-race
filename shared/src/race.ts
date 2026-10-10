import { gridPosition, type Track } from './track';

export interface Slot {
  id: string;
  name: string;
  carId: string;
  isAI: boolean;
  /** client id that simulates this car ('' = local / server) */
  ownerId: string;
  grid: number;
}

export type RacePhase = 'countdown' | 'racing' | 'finished';

export interface RaceEntry {
  id: string;
  name: string;
  carId: string;
  isAI: boolean;
  ownerId: string;
  /** total distance driven along the track since the start line (negative on the grid) */
  distance: number;
  lastS: number;
  lapsDone: number;
  lapStart: number;
  lastLap: number;
  bestLap: number;
  finished: boolean;
  finishTime: number;
  position: number;
}

export interface NetEntry {
  id: string;
  d: number;
  l: number;
  p: number;
  f: boolean;
  ft: number;
  bl: number;
  ll: number;
  ls: number;
}

export interface NetRace {
  phase: RacePhase;
  countdown: number;
  time: number;
  entries: NetEntry[];
}

export interface ResultRow {
  position: number;
  id: string;
  name: string;
  carId: string;
  isAI: boolean;
  finished: boolean;
  time: number;
  bestLap: number;
  lapsDone: number;
}

const END_DELAY = 3;
const TIMEOUT_AFTER_FIRST_HUMAN = 60;

export class Race {
  phase: RacePhase = 'countdown';
  countdown: number;
  time = 0;
  readonly entries: RaceEntry[];
  private endTimer = -1;
  private firstHumanFinish = -1;

  constructor(readonly track: Track, readonly laps: number, slots: Slot[], countdown = 3) {
    this.countdown = countdown;
    this.entries = slots.map((s) => {
      const g = gridPosition(track, s.grid);
      return {
        id: s.id, name: s.name, carId: s.carId, isAI: s.isAI, ownerId: s.ownerId,
        distance: g.s, lastS: ((g.s % track.length) + track.length) % track.length,
        lapsDone: 0, lapStart: 0, lastLap: 0, bestLap: 0, finished: false, finishTime: 0, position: s.grid + 1,
      };
    });
    this.sortPositions();
  }

  entry(id: string) {
    return this.entries.find((e) => e.id === id);
  }

  removeEntry(id: string) {
    const i = this.entries.findIndex((e) => e.id === id);
    if (i >= 0) this.entries.splice(i, 1);
  }

  get started() {
    return this.phase !== 'countdown';
  }

  /** Current lap number for display (1-based, capped). */
  displayLap(e: RaceEntry) {
    return Math.min(this.laps, e.lapsDone + 1);
  }

  update(dt: number, getS: (id: string) => number | undefined) {
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.phase = 'racing';
        this.time = -this.countdown;
        this.countdown = 0;
      }
      return;
    }
    if (this.phase === 'finished') return;
    this.time += dt;
    const L = this.track.length;
    for (const e of this.entries) {
      if (e.finished) continue;
      const s = getS(e.id);
      if (s === undefined) continue;
      let ds = s - e.lastS;
      if (ds < -L / 2) ds += L;
      if (ds > L / 2) ds -= L;
      e.distance += ds;
      e.lastS = s;
      while (e.distance >= (e.lapsDone + 1) * L && !e.finished) {
        const lap = this.time - e.lapStart;
        e.lastLap = lap;
        e.bestLap = e.bestLap > 0 ? Math.min(e.bestLap, lap) : lap;
        e.lapStart = this.time;
        e.lapsDone++;
        if (e.lapsDone >= this.laps) {
          e.finished = true;
          e.finishTime = this.time;
          if (!e.isAI && this.firstHumanFinish < 0) this.firstHumanFinish = this.time;
        }
      }
    }
    this.sortPositions();

    const humans = this.entries.filter((e) => !e.isAI);
    const done = humans.length > 0 ? humans.every((e) => e.finished) : this.entries.every((e) => e.finished);
    const timeout = this.firstHumanFinish >= 0 && this.time - this.firstHumanFinish > TIMEOUT_AFTER_FIRST_HUMAN;
    if ((done || timeout) && this.endTimer < 0) this.endTimer = END_DELAY;
    if (this.endTimer >= 0) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) this.phase = 'finished';
    }
  }

  private sortPositions() {
    const sorted = [...this.entries].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.distance - a.distance;
    });
    sorted.forEach((e, i) => (e.position = i + 1));
  }

  results(): ResultRow[] {
    return [...this.entries]
      .sort((a, b) => a.position - b.position)
      .map((e) => ({
        position: e.position, id: e.id, name: e.name, carId: e.carId, isAI: e.isAI, finished: e.finished,
        time: e.finishTime, bestLap: e.bestLap, lapsDone: e.lapsDone,
      }));
  }

  toNet(): NetRace {
    return {
      phase: this.phase,
      countdown: this.countdown,
      time: this.time,
      entries: this.entries.map((e) => ({
        id: e.id, d: e.distance, l: e.lapsDone, p: e.position, f: e.finished, ft: e.finishTime,
        bl: e.bestLap, ll: e.lastLap, ls: e.lapStart,
      })),
    };
  }

  /** Online clients mirror the server's race state. */
  applyNet(n: NetRace) {
    this.phase = n.phase;
    this.countdown = n.countdown;
    this.time = n.time;
    for (const ne of n.entries) {
      const e = this.entry(ne.id);
      if (!e) continue;
      e.distance = ne.d;
      e.lapsDone = ne.l;
      e.position = ne.p;
      e.finished = ne.f;
      e.finishTime = ne.ft;
      e.bestLap = ne.bl;
      e.lastLap = ne.ll;
      e.lapStart = ne.ls;
    }
    for (const e of [...this.entries]) if (!n.entries.some((ne) => ne.id === e.id)) this.removeEntry(e.id);
  }
}

export function formatTime(t: number) {
  if (!(t > 0)) return '--:--.--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}
