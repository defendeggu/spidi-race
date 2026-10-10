import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { rankEntries, sanitizeSubmission, type LeaderboardEntry, type LeaderboardSubmission } from '@spidi/shared';

/** Keep at most this many entries per track (the slowest by best lap are dropped). */
const MAX_PER_TRACK = 2000;

/** Permanent leaderboard stored as a JSON file (written atomically via a temp file). */
export class Leaderboard {
  private entries: LeaderboardEntry[] = [];

  /** Starts from `file`, or from the empty template next to it if no leaderboard exists yet. */
  constructor(private file: string) {
    const template = join(dirname(file), 'leaderboard.template.json');
    const source = existsSync(file) ? file : existsSync(template) ? template : null;
    if (source) {
      try {
        const data = JSON.parse(readFileSync(source, 'utf8'));
        if (Array.isArray(data.entries)) this.entries = data.entries;
      } catch (e) {
        console.error(`[leaderboard] ${source} konnte nicht gelesen werden:`, e);
      }
    }
    console.log(`[leaderboard] ${this.entries.length} Einträge aus ${file}`);
  }

  all() {
    return this.entries;
  }

  forTrack(trackId: string) {
    return this.entries.filter((e) => e.trackId === trackId);
  }

  /** Adds valid submissions and returns each one's best-lap rank on its track (0 = rejected). */
  add(subs: Partial<LeaderboardSubmission>[]): number[] {
    const added: (LeaderboardEntry | null)[] = subs.map((s) => {
      const clean = sanitizeSubmission(s);
      if (!clean) return null;
      const entry: LeaderboardEntry = { ...clean, id: randomUUID(), date: new Date().toISOString() };
      this.entries.push(entry);
      return entry;
    });
    if (added.some((e) => e)) {
      this.trim();
      this.save();
    }
    return added.map((e) => (e ? rankEntries(this.entries, e.trackId, 'bestLap').findIndex((r) => r.id === e.id) + 1 : 0));
  }

  private trim() {
    const tracks = new Set(this.entries.map((e) => e.trackId));
    for (const t of tracks) {
      const ranked = rankEntries(this.entries, t, 'bestLap');
      if (ranked.length <= MAX_PER_TRACK) continue;
      const drop = new Set(ranked.slice(MAX_PER_TRACK).map((e) => e.id));
      this.entries = this.entries.filter((e) => !drop.has(e.id));
    }
  }

  private save() {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify({ version: 1, entries: this.entries }));
      renameSync(tmp, this.file);
    } catch (e) {
      console.error('[leaderboard] Speichern fehlgeschlagen:', e);
    }
  }
}
