import { describe, expect, it } from 'vitest';
import { getCar, newCarState, NO_INPUT, stepRocket, updateVertical } from '@spidi/shared';
import { rocketRollAngle } from './rocketRoll';

describe('rocket barrel roll', () => {
  it('completes exactly one rotation before a normal landing', () => {
    const c = newCarState('camper', 0, 0, 0, 0);
    const dt = 1 / 60;
    let lastAngle = 0;
    let inverted = false;
    let complete = false;
    for (let i = 0; i < 180; i++) {
      stepRocket(c, getCar('california'), { ...NO_INPUT, rocket: i === 0 }, dt);
      updateVertical(c, 0, dt, false);
      const angle = rocketRollAngle(c);
      if (c.airborne) {
        expect(angle).toBeGreaterThanOrEqual(lastAngle);
        expect(angle).toBeLessThanOrEqual(2 * Math.PI);
        if (Math.abs(angle - Math.PI) < 0.15) inverted = true;
        if (angle === 2 * Math.PI) complete = true;
        lastAngle = angle;
      } else {
        expect(angle).toBe(0);
      }
    }
    expect(inverted).toBe(true);
    expect(complete).toBe(true);
    expect(c.airborne).toBe(false);
  });

  it('does not roll during ordinary jumps or while on the ground', () => {
    const c = newCarState('car', 0, 0, 0, 0);
    c.airborne = true;
    expect(rocketRollAngle(c)).toBe(0);
    c.rocketCooldown = 4;
    c.airborne = false;
    expect(rocketRollAngle(c)).toBe(0);
  });
});
