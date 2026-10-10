import type { LeaderboardEntry, LeaderboardSubmission } from '@spidi/shared';

/** Permanent leaderboard on the game server (same host that served the page). */
export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const res = await fetch('/api/leaderboard', { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).entries;
}

/** Submits finished races; resolves with each one's best-lap rank on its track (0 = rejected). */
export async function submitResults(entries: LeaderboardSubmission[]): Promise<number[]> {
  const res = await fetch('/api/leaderboard', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ entries }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).ranks;
}
