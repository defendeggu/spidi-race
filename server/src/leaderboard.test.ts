import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Leaderboard } from './leaderboard';

const dirs: string[] = [];
const tmpFile = () => {
  const d = mkdtempSync(join(tmpdir(), 'spidi-lb-'));
  dirs.push(d);
  return join(d, 'leaderboard.json');
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

const sub = (name: string, bestLap: number, trackId = 'alpenpass') => ({
  name, carId: 'falcone', trackId, laps: 2, time: bestLap * 2 + 3, bestLap, mode: 'solo' as const,
});

describe('leaderboard', () => {
  it('ranks by best lap and persists to disk', () => {
    const file = tmpFile();
    const lb = new Leaderboard(file);
    expect(lb.add([sub('Anna', 70), sub('Ben', 65)])).toEqual([2, 1]);
    expect(lb.add([sub('Cleo', 68)])).toEqual([2]);
    const reloaded = new Leaderboard(file);
    expect(reloaded.forTrack('alpenpass').map((e) => e.name).sort()).toEqual(['Anna', 'Ben', 'Cleo']);
  });

  it('starts from the template when no leaderboard file exists, and never writes the template', () => {
    const file = tmpFile();
    writeFileSync(join(dirname(file), 'leaderboard.template.json'), JSON.stringify({ version: 1, entries: [] }));
    const lb = new Leaderboard(file);
    expect(lb.all()).toHaveLength(0);
    lb.add([sub('Anna', 70)]);
    expect(JSON.parse(readFileSync(join(dirname(file), 'leaderboard.template.json'), 'utf8')).entries).toHaveLength(0);
    expect(JSON.parse(readFileSync(file, 'utf8')).entries).toHaveLength(1);
  });

  it('rejects impossible or broken submissions', () => {
    const lb = new Leaderboard(tmpFile());
    expect(lb.add([
      sub('Speedy', 5),                       // faster than physically possible
      { ...sub('X', 70), trackId: 'nope' },   // unknown track
      { ...sub('Y', 70), carId: 'tank' },     // unknown car
      { ...sub('Z', 70), time: 10 },          // total time shorter than laps × best lap
      sub('', 70),                            // no name
    ])).toEqual([0, 0, 0, 0, 0]);
    expect(lb.all()).toHaveLength(0);
  });

  it('strips markup from names', () => {
    const lb = new Leaderboard(tmpFile());
    lb.add([sub('<b>Evil</b>', 70)]);
    expect(lb.all()[0].name).toBe('bEvil/b');
  });
});
