import { CARS } from './cars';
import { getTrack, TRACK_DEFS } from './tracks';

export type RaceMode = 'solo' | 'split' | 'online';

/** One finished race of a human driver, as submitted to the permanent leaderboard. */
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

/** Fastest plausible average speed in m/s (~400 km/h) – faster laps are rejected. */
const MAX_AVG_SPEED = 110;

/** Cleans a submission; returns null if it is incomplete or physically impossible. */
export function sanitizeSubmission(s: Partial<LeaderboardSubmission>): LeaderboardSubmission | null {
  if (!s || typeof s !== 'object') return null;
  const track = TRACK_DEFS.find((t) => t.id === s.trackId);
  if (!track || !CARS.some((c) => c.id === s.carId)) return null;
  const laps = Math.round(Number(s.laps));
  const time = Number(s.time), bestLap = Number(s.bestLap);
  if (!(laps >= 1 && laps <= 10) || !Number.isFinite(time) || !Number.isFinite(bestLap)) return null;
  const minLap = getTrack(track.id).length / MAX_AVG_SPEED;
  if (bestLap < minLap || bestLap > 3600 || time < bestLap * laps - 0.05 || time > 3600 * laps) return null;
  const name = String(s.name ?? '').replace(/[<>]/g, '').trim().slice(0, 16);
  if (!name) return null;
  const mode: RaceMode = s.mode === 'split' || s.mode === 'online' ? s.mode : 'solo';
  return { name, carId: s.carId!, trackId: track.id, laps, time: Math.round(time * 1000) / 1000, bestLap: Math.round(bestLap * 1000) / 1000, mode };
}

/** Ranking of a track: by best lap, or by total time among races with the same number of laps. */
export function rankEntries(entries: LeaderboardEntry[], trackId: string, sort: LeaderboardSort, laps?: number) {
  return entries
    .filter((e) => e.trackId === trackId && (sort === 'bestLap' || e.laps === laps))
    .sort((a, b) => (sort === 'bestLap' ? a.bestLap - b.bestLap : a.time - b.time) || a.date.localeCompare(b.date));
}
