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
  it('ranks by best lap and persists to disk', async () => {
    const file = tmpFile();
    const lb = new Leaderboard(file);
    expect(lb.add([sub('Anna', 70), sub('Ben', 65)])).toEqual([2, 1]);
    expect(lb.add([sub('Cleo', 68)])).toEqual([2]);
    await lb.flush();
    const reloaded = new Leaderboard(file);
    expect(reloaded.forTrack('alpenpass').map((e) => e.name).sort()).toEqual(['Anna', 'Ben', 'Cleo']);
  });

  it('starts from the template when no leaderboard file exists, and never writes the template', async () => {
    const file = tmpFile();
    writeFileSync(join(dirname(file), 'leaderboard.template.json'), JSON.stringify({ version: 1, entries: [] }));
    const lb = new Leaderboard(file);
    expect(lb.all()).toHaveLength(0);
    lb.add([sub('Anna', 70)]);
    await lb.flush();
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
      sub('Lucky', 25.75),                    // the speed-hacked lap from the security report (Falcone needs >= 28.9 s)
      { ...sub('Off', 70), carId: 'bergziege' }, // offroad car on a road track
      { ...sub('Net', 70), mode: 'online' },  // online races are recorded by the server only
    ])).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(lb.all()).toHaveLength(0);
  });

  it('the game server may record online races', () => {
    const lb = new Leaderboard(tmpFile());
    expect(lb.add([{ ...sub('Net', 70), mode: 'online' }], { trusted: true })).toEqual([1]);
  });

  it('writes a burst of submissions once, debounced', async () => {
    const file = tmpFile();
    const lb = new Leaderboard(file);
    for (let i = 0; i < 20; i++) lb.add([sub(`P${i}`, 60 + i)]);
    expect(() => readFileSync(file)).toThrow();
    await lb.flush();
    expect(JSON.parse(readFileSync(file, 'utf8')).entries).toHaveLength(20);
  });

  it('the overview lists only the top entries of each ranking', () => {
    const lb = new Leaderboard(tmpFile());
    for (let i = 0; i < 120; i++) lb.add([sub(`P${i}`, 60 + i * 0.1)]);
    expect(lb.all()).toHaveLength(120);
    expect(lb.top().length).toBeLessThanOrEqual(100);
    expect(lb.top().map((e) => e.name)).toContain('P0');
  });

  it('strips markup from names', () => {
    const lb = new Leaderboard(tmpFile());
    lb.add([sub('<b>Evil</b>', 70)]);
    expect(lb.all()[0].name).toBe('bEvil/b');
  });
});
