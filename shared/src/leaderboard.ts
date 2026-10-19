import { CARS } from './cars';
import { TOWN_GOAL_COUNTS } from './townTasks';
import { getTrack, TRACK_DEFS, trackInMode } from './tracks';

export type RaceMode = 'solo' | 'split' | 'online';

/**
 * One finished race of a human driver, as submitted to the permanent leaderboard.
 * Practice-town runs use a town board as trackId, the number of goals as laps and the fastest goal as bestLap.
 */
export interface LeaderboardSubmission {
  name: string;
  carId: string;
  trackId: string;
  laps: number;
  /** total race time in seconds */
  time: number;
  bestLap: number;
  mode: RaceMode;
}

export interface LeaderboardEntry extends LeaderboardSubmission {
  id: string;
  /** ISO timestamp */
  date: string;
}

export type LeaderboardSort = 'bestLap' | 'time';

/** Leaderboards of the practice town: total time for 5, 10 or 20 goals. */
export const TOWN_BOARDS = [
  { id: 'town-stars', name: 'Stadt: Sterne', task: 'stars', unit: 'Sterne', minGoal: 2.5 },
  { id: 'town-parking', name: 'Stadt: Einparken', task: 'parking', unit: 'Parkfelder', minGoal: 3 },
] as const;

export function townBoard(id: string | undefined) {
  return TOWN_BOARDS.find((b) => b.id === id);
}

/** Kart races have their own board per track: 'kart:<trackId>' (road and offroad tracks). */
export const KART_PREFIX = 'kart:';

export function kartBoardTrack(id: string | undefined) {
  if (!id?.startsWith(KART_PREFIX)) return undefined;
  const t = TRACK_DEFS.find((d) => d.id === id.slice(KART_PREFIX.length));
  return t && trackInMode(t, 'kart') ? t : undefined;
}

/** Karts can be faster than their top speed while boosting. */
const KART_BOOST_MARGIN = 1.35;

/** Town boards rank by total time, race tracks by best lap. */
export function boardSort(trackId: string): LeaderboardSort {
  return townBoard(trackId) ? 'time' : 'bestLap';
}

/**
 * Cleans a submission; returns null if it is incomplete or physically impossible.
 * Only the game server itself (`trusted`) may record online races.
 */
export function sanitizeSubmission(s: Partial<LeaderboardSubmission>, trusted = false): LeaderboardSubmission | null {
  if (!s || typeof s !== 'object') return null;
  if (townBoard(s.trackId)) return sanitizeTown(s);
  const kartTrack = kartBoardTrack(s.trackId);
  // car boards only for tracks of the car race (not for a kart-only track)
  const track = kartTrack ?? TRACK_DEFS.find((t) => t.id === s.trackId && trackInMode(t, 'race'));
  const car = CARS.find((c) => c.id === s.carId);
  // the car must belong to the track's class (road, offroad or micro), on kart boards it must be a kart
  if (!track || !car || car.class !== (kartTrack ? 'kart' : track.class ?? 'road')) return null;
  const laps = Math.round(Number(s.laps));
  const time = Number(s.time), bestLap = Number(s.bestLap);
  if (!(laps >= 1 && laps <= 10) || !Number.isFinite(time) || !Number.isFinite(bestLap)) return null;
  // no lap can be faster than driving the whole length at the car's top speed
  const minLap = getTrack(track.id).length / (car.topSpeed * (kartTrack ? KART_BOOST_MARGIN : 1));
  if (bestLap < minLap || bestLap > 3600 || time < bestLap * laps - 0.05 || time > 3600 * laps) return null;
  const name = String(s.name ?? '').replace(/[<>]/g, '').trim().slice(0, 16);
  if (!name) return null;
  if (s.mode === 'online' && !trusted) return null;
  const mode: RaceMode = s.mode === 'split' || s.mode === 'online' ? s.mode : 'solo';
  return { name, carId: s.carId!, trackId: kartTrack ? KART_PREFIX + track.id : track.id, laps, time: Math.round(time * 1000) / 1000, bestLap: Math.round(bestLap * 1000) / 1000, mode };
}

/** A practice-town run: known goal count, town car, plausible times (a goal takes at least a few seconds). */
function sanitizeTown(s: Partial<LeaderboardSubmission>): LeaderboardSubmission | null {
  const board = townBoard(s.trackId)!;
  const car = CARS.find((c) => c.id === s.carId);
  const goals = Math.round(Number(s.laps));
  const time = Number(s.time), fastest = Number(s.bestLap);
  if (!car || car.class !== 'town' || !TOWN_GOAL_COUNTS.includes(goals)) return null;
  if (!Number.isFinite(time) || !Number.isFinite(fastest)) return null;
  if (fastest < board.minGoal || time < fastest * goals - 0.05 || time > 3600) return null;
  const name = String(s.name ?? '').replace(/[<>]/g, '').trim().slice(0, 16);
  if (!name) return null;
  return { name, carId: car.id, trackId: board.id, laps: goals, time: Math.round(time * 1000) / 1000, bestLap: Math.round(fastest * 1000) / 1000, mode: 'solo' };
}

/** Ranking of a track: by best lap, or by total time among races with the same number of laps. */
export function rankEntries(entries: LeaderboardEntry[], trackId: string, sort: LeaderboardSort, laps?: number) {
  return entries
    .filter((e) => e.trackId === trackId && (sort === 'bestLap' || e.laps === laps))
    .sort((a, b) => (sort === 'bestLap' ? a.bestLap - b.bestLap : a.time - b.time) || a.date.localeCompare(b.date));
}
