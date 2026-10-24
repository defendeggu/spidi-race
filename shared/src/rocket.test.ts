import { describe, expect, it } from 'vitest';
import { getCar } from './cars';
import { createCarState, newCarState, NO_INPUT, stepCar, stepRocket, updateVertical } from './physics';
import { applyNetCar, sanitizeNetCar, toNetCar } from './protocol';
import { getTrack } from './tracks';
import { createTownCar, getTown, stepCarTown } from './town';

const dt = 1 / 60;
const camper = getCar('california');
const fire = { ...NO_INPUT, rocket: true };

describe('camper rocket hop', () => {
  it('launches, ends its burn and lands without repeating a held press', () => {
    const c = newCarState('camper', 0, 0, 0, 0);
    let maxHeight = 0;
    let landed = false;
    for (let i = 0; i < 8 / dt; i++) {
      stepRocket(c, camper, fire, dt);
      updateVertical(c, 0, dt, false);
      maxHeight = Math.max(maxHeight, c.y);
      if (c.landed > 0) landed = true;
      if (i > 30) expect(c.rocketBurn).toBe(0);
    }
    expect(maxHeight).toBeGreaterThan(3);
    expect(maxHeight).toBeLessThan(6);
    expect(landed).toBe(true);
    expect(c.airborne).toBe(false);
    expect(c.y).toBe(0);
    stepRocket(c, camper, NO_INPUT, dt);
    stepRocket(c, camper, fire, dt);
    expect(c.airborne).toBe(true);
  });

  it('fires in mid-air too, for example after a jump over a ramp', () => {
    const c = newCarState('camper', 0, 0, 0, 0);
    // thrown up by a ramp, already falling again
    Object.assign(c, { airborne: true, y: 3, vy: -2 });
    stepRocket(c, camper, fire, dt);
    expect(c.vy).toBeGreaterThan(7);
    expect(c.rocketBurn).toBeGreaterThan(0);
    let maxHeight = 0;
    for (let i = 0; i < 4 / dt; i++) {
      stepRocket(c, camper, NO_INPUT, dt);
      updateVertical(c, 0, dt, true);
      maxHeight = Math.max(maxHeight, c.y);
    }
    expect(maxHeight).toBeGreaterThan(5);
    expect(c.airborne).toBe(false);
  });

  it('does not allow retriggers during the cooldown, on the ground or in the air', () => {
    const c = newCarState('camper', 0, 0, 0, 0);
    stepRocket(c, camper, fire, dt);
    for (let i = 0; i < 180; i++) {
      stepRocket(c, camper, i % 2 ? fire : NO_INPUT, dt);
      updateVertical(c, 0, dt, false);
    }
    expect(c.airborne).toBe(false);
    expect(c.rocketCooldown).toBeGreaterThan(1);
    expect(c.rocketBurn).toBe(0);
  });

  it('leaves other cars on the ground and disallows a launch in water', () => {
    const c = newCarState('normal', 0, 0, 0, 0);
    stepRocket(c, getCar('falcone'), fire, dt);
    expect(c.airborne).toBe(false);
    stepRocket(c, camper, fire, dt, false);
    expect(c.airborne).toBe(false);
  });

  it('integrates with asphalt physics and returns to the road', () => {
    const track = getTrack('alpenpass');
    const p = track.pointAt(100, 0);
    const c = createCarState('road', track, p.x, p.z, 0);
    stepCar(c, camper, fire, track, dt);
    expect(c.airborne).toBe(true);
    for (let i = 0; i < 240; i++) stepCar(c, camper, NO_INPUT, track, dt);
    expect(c.airborne).toBe(false);
    expect(c.y).toBeCloseTo(track.project(c.x, c.z).y, 2);
  });

  it('integrates with the town and lands at ground height', () => {
    const town = getTown();
    const c = createTownCar('town', { x: -450, z: -450, heading: 0 });
    stepCarTown(c, getCar('california-town'), fire, town, dt);
    expect(c.airborne).toBe(true);
    for (let i = 0; i < 240; i++) stepCarTown(c, getCar('california-town'), NO_INPUT, town, dt);
    expect(c.airborne).toBe(false);
    expect(c.y).toBe(town.heightAt(c.x, c.z));
  });

  it('synchronizes bounded burn and cooldown state for remote visuals', () => {
    const c = newCarState('source', 0, 0, 0, 0);
    stepRocket(c, camper, fire, dt);
    const remote = newCarState('remote', 0, 0, 0, 0);
    applyNetCar(remote, sanitizeNetCar(toNetCar(c))!);
    expect(remote.rocketBurn).toBeGreaterThan(0);
    expect(remote.airborne).toBe(true);
    const sanitized = sanitizeNetCar({ ...toNetCar(c), rb: Infinity, rc: 999 })!;
    expect(sanitized.rb).toBe(0);
    expect(sanitized.rc).toBe(5);
  });
});
