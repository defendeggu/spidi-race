import { describe, expect, it } from 'vitest';
import { getCar } from '@spidi/shared';
import { cheats, townSpec, typeCheat } from './cheats';

describe('cheats', () => {
  it('a typed code unlocks once, other keys are ignored', () => {
    expect(townSpec(getCar('kaito-stadt')).topSpeed).toBe(getCar('kaito-stadt').topSpeed);
    const hits = [...'xpionexpi', 'Shift', ...'oneer'].map((k) => typeCheat(k));
    expect(hits.filter(Boolean)).toEqual(['pioneer']);
    expect(cheats.pioneer).toBe(true);
    expect([...'pioneer'].map((k) => typeCheat(k)).filter(Boolean)).toEqual([]);
  });

  it('only changes the town formula car, to the race top speed', () => {
    expect(townSpec(getCar('kaito-stadt')).topSpeed).toBe(getCar('kaito').topSpeed);
    expect(townSpec(getCar('familie'))).toBe(getCar('familie'));
  });
});
