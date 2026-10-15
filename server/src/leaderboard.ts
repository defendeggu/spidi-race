import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { boardSort, rankEntries, sanitizeSubmission, type LeaderboardEntry, type LeaderboardSubmission } from '@spidi/shared';

/** Keep at most this many entries per track (the slowest by best lap are dropped). */
const MAX_PER_TRACK = 2000;
/** Entries per ranking in the overview (GET without track). */
const TOP = 50;
/** Changes are written at most this often (ms), so a burst of POSTs does not block the race loop. */
const SAVE_DELAY = 2000;

/** Permanent leaderboard stored as a JSON file (written atomically via a temp file). */
export class Leaderboard {
  private entries: LeaderboardEntry[] = [];
  private saveTimer: NodeJS.Timeout | null = null;
  private writing: Promise<void> = Promise.resolve();
  private failed = false;

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

  /** The top entries of every ranking of every track (best lap, and total time per lap / goal count). */
  top() {
    const keep = new Set<LeaderboardEntry>();
    for (const t of new Set(this.entries.map((e) => e.trackId))) {
      const onTrack = this.forTrack(t);
      if (boardSort(t) === 'bestLap') rankEntries(onTrack, t, 'bestLap').slice(0, TOP).forEach((e) => keep.add(e));
      for (const laps of new Set(onTrack.map((e) => e.laps))) rankEntries(onTrack, t, 'time', laps).slice(0, TOP).forEach((e) => keep.add(e));
    }
    return this.entries.filter((e) => keep.has(e));
  }

  /**
   * Adds valid submissions and returns each one's rank on its track (0 = rejected): best lap, or total
   * time on town boards. Only the game server itself (`trusted`) may add online races.
   */
  add(subs: Partial<LeaderboardSubmission>[], opts: { trusted?: boolean } = {}): number[] {
    const added: (LeaderboardEntry | null)[] = subs.map((s) => {
      const clean = sanitizeSubmission(s, opts.trusted);
      if (!clean) return null;
      const entry: LeaderboardEntry = { ...clean, id: randomUUID(), date: new Date().toISOString() };
      this.entries.push(entry);
      return entry;
    });
    if (added.some((e) => e)) {
      this.trim();
      this.scheduleSave();
    }
    return added.map((e) => (e ? rankEntries(this.entries, e.trackId, boardSort(e.trackId), e.laps).findIndex((r) => r.id === e.id) + 1 : 0));
  }

  private trim() {
    const tracks = new Set(this.entries.map((e) => e.trackId));
    for (const t of tracks) {
      // town boards rank by time per goal count; dropping by fastest goal keeps the strongest runs overall
      const ranked = rankEntries(this.entries, t, 'bestLap');
      if (ranked.length <= MAX_PER_TRACK) continue;
      const drop = new Set(ranked.slice(MAX_PER_TRACK).map((e) => e.id));
      this.entries = this.entries.filter((e) => !drop.has(e.id));
    }
  }

  private scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.writing = this.writing.then(() => this.write());
    }, SAVE_DELAY);
  }

  private async write() {
    const data = JSON.stringify({ version: 1, entries: this.entries });
    try {
      await mkdir(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, data);
      await rename(tmp, this.file);
      this.failed = false;
    } catch (e) {
      this.reportFailure(e);
    }
  }

  private reportFailure(e: unknown) {
    if (this.failed) return;
    this.failed = true;
    console.error(`[leaderboard] !!! Rangliste kann NICHT gespeichert werden (${this.file}). Schreibrechte des Ordners prüfen.`, e);
  }

  /** Writes pending changes now (tests, shutdown). */
  async flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
      this.writing = this.writing.then(() => this.write());
    }
    await this.writing;
  }

  /** Synchronous last-chance write when the process is being stopped. */
  flushSync() {
    if (!this.saveTimer) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify({ version: 1, entries: this.entries }));
      renameSync(tmp, this.file);
    } catch (e) {
      this.reportFailure(e);
    }
  }
}
