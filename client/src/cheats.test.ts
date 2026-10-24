import { describe, expect, it } from 'vitest';
import { getCar } from '@spidi/shared';
import { cheats, PIONEER_BOOST, raceSpec, townSpec, typeCheat } from './cheats';

describe('cheats', () => {
  it('a typed code unlocks once, other keys are ignored', () => {
    expect(townSpec(getCar('kaito-stadt')).topSpeed).toBe(getCar('kaito-stadt').topSpeed);
    const hits = [...'xpionexpi', 'Shift', ...'oneer'].map((k) => typeCheat(k));
    expect(hits.filter(Boolean)).toEqual(['pioneer']);
    expect(cheats.pioneer).toBe(true);
    expect([...'pioneer'].map((k) => typeCheat(k)).filter(Boolean)).toEqual([]);
  });

  it('the pioneer cars get their race top speed in the town', () => {
    expect(townSpec(getCar('kaito-stadt')).topSpeed).toBe(getCar('kaito').topSpeed);
    expect(townSpec(getCar('california-town')).topSpeed).toBe(getCar('california').topSpeed);
    expect(townSpec(getCar('aventador-town')).topSpeed).toBe(getCar('aventador').topSpeed);
    expect(townSpec(getCar('sturmvogel-town')).topSpeed).toBe(getCar('sturmvogel').topSpeed);
    expect(townSpec(getCar('familie'))).toBe(getCar('familie'));
    expect(townSpec(getCar('falcone-town'))).toBe(getCar('falcone-town'));
  });

  it('and are 15 % faster in races', () => {
    expect(raceSpec(getCar('sturmvogel')).topSpeed).toBeCloseTo(getCar('sturmvogel').topSpeed * PIONEER_BOOST);
    expect(raceSpec(getCar('kaito')).accel).toBeCloseTo(getCar('kaito').accel * PIONEER_BOOST);
    expect(raceSpec(getCar('falcone'))).toBe(getCar('falcone'));
  });
});
