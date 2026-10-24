import { mulberry32, wrapAngle } from './math';
import type { CarState } from './physics';
import type { TownMap } from './town';

export type TownTask = 'free' | 'stars' | 'parking';

export const STAR_RADIUS = 4;
/** the next star is at least this far away (m, where possible) and at most STAR_FAR (solo) */
const STAR_NEAR = 220;
const STAR_FAR = 800;
/** parking: allowed offset across / along the bay, angle (either direction) and time standing still */
export const PARK_TOLERANCE = { across: 0.9, along: 1.5, angle: 0.35, hold: 1 };

export interface TaskTarget {
  x: number;
  z: number;
  heading: number;
  /** index into town.bays for the parking task */
  bay: number;
}

/**
 * One player's practice task: drive to a star, or park in a highlighted bay. When the goal is reached
 * the counter goes up and the next goal appears. Players never get the same goal at the same time.
 */
export class TaskTracker {
  target: TaskTarget | null = null;
  count = 0;
  /** 0..1 while the car stands correctly in the bay */
  parkProgress = 0;
  private rnd: () => number;

  constructor(private town: TownMap, readonly task: TownTask, seed: number) {
    this.rnd = mulberry32(seed);
  }

  /** Pick the next goal near the car, avoiding goals of the other players. */
  next(c: CarState, taken: (TaskTarget | null)[]) {
    this.parkProgress = 0;
    if (this.task === 'free') {
      this.target = null;
      return;
    }
    const busy = (x: number, z: number) => taken.some((t) => t && Math.hypot(t.x - x, t.z - z) < 1);
    if (this.task === 'stars') {
      // a real drive across town: 220–800 m away, farther spots more likely
      const near = (lo: number) => this.town.starSpots
        .map((s) => ({ s, d: Math.hypot(s.x - c.x, s.z - c.z) }))
        .filter(({ s, d }) => d > lo && d < STAR_FAR && !busy(s.x, s.z));
      let pool = near(STAR_NEAR);
      if (pool.length < 3) pool = near(80);
      if (pool.length === 0) pool = this.town.starSpots.map((s) => ({ s, d: 1 }));
      let r = this.rnd() * pool.reduce((sum, p) => sum + p.d, 0);
      const pick = pool.find((p) => (r -= p.d) <= 0) ?? pool[pool.length - 1];
      this.target = { x: pick.s.x, z: pick.s.z, heading: pick.s.heading, bay: -1 };
      return;
    }
    const free = this.town.bays.map((b, i) => ({ b, i })).filter(({ b }) => b.parked < 0 && !busy(b.x, b.z));
    // usually on another parking lot, so the drive there is part of the exercise
    const here = this.town.blockAt(c.x, c.z);
    const elsewhere = free.filter(({ b }) => this.town.blockAt(b.x, b.z) !== here);
    const pool = elsewhere.length > 0 && this.rnd() < 0.8 ? elsewhere : free;
    const pick = pool[Math.floor(this.rnd() * pool.length)];
    this.target = { x: pick.b.x, z: pick.b.z, heading: pick.b.heading, bay: pick.i };
  }

  /** Returns true when the current goal was reached in this step. */
  update(c: CarState, dt: number): boolean {
    const t = this.target;
    if (!t) return false;
    const dx = c.x - t.x, dz = c.z - t.z;
    if (this.task === 'stars') return Math.hypot(dx, dz) < STAR_RADIUS;
    const fx = Math.sin(t.heading), fz = Math.cos(t.heading);
    const along = Math.abs(dx * fx + dz * fz), across = Math.abs(-dx * fz + dz * fx);
    const da = Math.abs(wrapAngle(c.heading - t.heading));
    const angle = Math.min(da, Math.PI - da);
    const still = Math.hypot(c.vx, c.vz) < 0.5;
    if (along < PARK_TOLERANCE.along && across < PARK_TOLERANCE.across && angle < PARK_TOLERANCE.angle && still) {
      this.parkProgress = Math.min(1, this.parkProgress + dt / PARK_TOLERANCE.hold);
    } else {
      this.parkProgress = 0;
    }
    return this.parkProgress >= 1;
  }
}

/** Goal counts a solo run can be played to (each count has its own leaderboard). */
export const TOWN_GOAL_COUNTS = [5, 10, 20];
/** Length of a split-screen duel in seconds. */
export const DUEL_SECONDS = 180;
const COUNTDOWN = 3;

/** free: no goals; solo: reach N goals as fast as possible; duel: two players chase the same goal for 3 minutes. */
export type TownMode = 'free' | 'solo' | 'duel';
export type TownPhase = 'countdown' | 'running' | 'finished';

export interface TownResult {
  mode: TownMode;
  task: TownTask;
  /** solo: time for all goals; duel: DUEL_SECONDS */
  time: number;
  scores: number[];
  /** fastest single goal per player (0 if none) */
  fastest: number[];
  /** duel: index of the winner, -1 for a draw */
  winner: number;
  /** per player: why their run ended early (null: still in it to the end) – such runs do not count */
  out: (OutReason | null)[];
}

/** Why a player's run ended early: fell into the harbour, stayed in the cemetery, ran into people. */
export type OutReason = 'water' | 'cemetery' | 'people';

/** seconds a car may stay in the cemetery before the run is over */
export const CEMETERY_GRACE = 5;
/** the third pedestrian hit ends the run */
export const PEOPLE_STRIKES = 3;

/**
 * Watches one player for unseemly driving: in the cemetery a countdown runs (leaving it resets it),
 * hitting a pedestrian (or their dog or pram) gives a warning, the third one ends the run.
 */
export class FoulWatch {
  /** seconds in the cemetery so far (0 = outside) */
  cemetery = 0;
  strikes = 0;

  /** Advance by dt; returns true when the time in the cemetery has run out. */
  step(inCemetery: boolean, dt: number) {
    this.cemetery = inCemetery ? this.cemetery + dt : 0;
    return this.cemetery >= CEMETERY_GRACE;
  }

  /** Seconds left before the run ends, while in the cemetery. */
  get cemeteryLeft() {
    return Math.max(0, CEMETERY_GRACE - this.cemetery);
  }

  /** A pedestrian was hit: returns true on the strike that ends the run. */
  hit() {
    this.strikes++;
    return this.strikes >= PEOPLE_STRIKES;
  }
}

/** Street distance in a grid town (Manhattan) – fairer than straight-line distance for picking duel goals. */
const street = (ax: number, az: number, bx: number, bz: number) => Math.abs(ax - bx) + Math.abs(az - bz);

/**
 * Rules of a practice-town session: countdown, timer, goals and scores for 1–2 players.
 * The client steps it with the car states and shows the targets; tests can drive it directly.
 */
export class TownSession {
  readonly mode: TownMode;
  phase: TownPhase;
  countdown: number;
  time = 0;
  readonly trackers: TaskTracker[];
  readonly scores: number[];
  readonly fastest: number[];
  /** per player: why their run ended early, null while they are still in it */
  readonly out: (OutReason | null)[];
  private goalStart: number[];
  private rnd: () => number;

  constructor(private town: TownMap, readonly task: TownTask, players: number, readonly goals: number, seed: number) {
    this.mode = task === 'free' ? 'free' : players > 1 ? 'duel' : 'solo';
    this.phase = this.mode === 'free' ? 'running' : 'countdown';
    this.countdown = this.mode === 'free' ? 0 : COUNTDOWN;
    this.rnd = mulberry32(seed);
    this.trackers = Array.from({ length: players }, (_, k) => new TaskTracker(town, task, seed + 17 * (k + 1)));
    this.scores = this.trackers.map(() => 0);
    this.fastest = this.trackers.map(() => 0);
    this.goalStart = this.trackers.map(() => 0);
    this.out = this.trackers.map(() => null);
  }

  /** Where player k starts: the practice square, or opposite corners in a duel. */
  spawn(k: number) {
    return this.mode === 'duel' ? this.town.duelSpawn(k) : this.town.spawn(k);
  }

  /** Seconds left in a duel. */
  get remaining() {
    return Math.max(0, DUEL_SECONDS - this.time);
  }

  /** Choose the first goals (call once with the start positions). */
  begin(cars: CarState[]) {
    if (this.mode === 'duel') this.fairGoal(cars);
    else this.trackers.forEach((t, k) => t.next(cars[k], this.trackers.filter((o) => o !== t).map((o) => o.target)));
  }

  /** A goal about equally far (by street) from both players, not right next to either of them. */
  private fairGoal(cars: CarState[]) {
    const [a, b] = cars;
    const cands = this.task === 'stars'
      ? this.town.starSpots.map((s) => ({ x: s.x, z: s.z, heading: s.heading, bay: -1 }))
      : this.town.bays.map((s, i) => ({ x: s.x, z: s.z, heading: s.heading, bay: i })).filter((s) => this.town.bays[s.bay].parked < 0);
    const prev = this.trackers[0].target;
    const scored = cands
      .filter((c) => !prev || c.x !== prev.x || c.z !== prev.z)
      .map((c) => {
        const da = street(a.x, a.z, c.x, c.z), db = street(b.x, b.z, c.x, c.z);
        return { c, da, db, cost: Math.abs(da - db) };
      })
      // both have a real drive ahead: stars at least 220 m by street away, longer drives preferred
      .map((s) => ({ ...s, cost: s.cost - 0.15 * Math.min(s.da, s.db) }));
    const far = scored.filter((s) => Math.min(s.da, s.db) > STAR_NEAR);
    const ok = far.length >= 3 ? far : scored.filter((s) => Math.min(s.da, s.db) > 80);
    const pool = (ok.length ? ok : cands.map((c) => ({ c, cost: 0 }))).sort((x, y) => x.cost - y.cost).slice(0, 6);
    const pick = pool[Math.floor(this.rnd() * pool.length)].c;
    for (const t of this.trackers) {
      t.target = { ...pick };
      t.parkProgress = 0;
    }
  }

  /**
   * Advance by dt. Returns the indices of the players that reached a goal in this step.
   */
  step(dt: number, cars: CarState[]): number[] {
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.phase = 'running';
        this.countdown = 0;
      }
      return [];
    }
    if (this.phase === 'finished') return [];
    this.time += dt;
    const scored: number[] = [];
    this.trackers.forEach((t, k) => {
      if (this.out[k] || !t.update(cars[k], dt)) return;
      scored.push(k);
      // in a duel only the first one counts when both arrive in the same step
      if (this.mode === 'duel' && scored.length > 1) return;
      this.scores[k]++;
      t.count = this.scores[k];
      const took = this.time - this.goalStart[k];
      this.fastest[k] = this.fastest[k] > 0 ? Math.min(this.fastest[k], took) : took;
      if (this.mode === 'duel') {
        // both chase the next goal from now on
        this.goalStart = this.goalStart.map(() => this.time);
      } else {
        this.goalStart[k] = this.time;
        t.next(cars[k], this.trackers.filter((o) => o !== t).map((o) => o.target));
      }
    });
    if (this.mode === 'duel' && scored.length > 0) this.fairGoal(cars);
    if (this.mode === 'duel') scored.splice(1);
    if (this.mode === 'solo' && this.scores[0] >= this.goals) this.phase = 'finished';
    if (this.mode === 'duel' && this.time >= DUEL_SECONDS) {
      this.time = DUEL_SECONDS;
      this.phase = 'finished';
    }
    return scored;
  }

  /**
   * Player k's run is over (into the water, too long in the cemetery, the third pedestrian hit). It does
   * not count; the others play on – the session ends when nobody is left.
   */
  knockOut(k: number, reason: OutReason = 'water') {
    if (this.phase === 'finished' || this.out[k]) return;
    this.out[k] = reason;
    if (this.out.every(Boolean)) this.phase = 'finished';
  }

  /** Still in the game (not knocked out)? */
  playing(k: number) {
    return !this.out[k];
  }

  result(): TownResult {
    const [a, b] = this.scores;
    let winner = this.mode !== 'duel' ? 0 : a === b ? -1 : a > b ? 0 : 1;
    // a player who is out cannot win; if both are out nobody does
    if (this.mode === 'duel' && (this.out[0] || this.out[1])) winner = this.out[0] && this.out[1] ? -1 : this.out[0] ? 1 : 0;
    return { mode: this.mode, task: this.task, time: this.time, scores: [...this.scores], fastest: [...this.fastest], winner, out: [...this.out] };
  }
}
