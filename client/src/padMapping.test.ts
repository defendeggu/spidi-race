import { beforeEach, describe, expect, it } from 'vitest';
import { readPad, resetTriggers, type PadLike } from './padMapping';

/** A pad with n buttons and m axes; `press` sets buttons (value 1), `axes` overrides axis values. */
function pad(id: string, mapping: string, n: number, m: number, press: number[] = [], axes: Record<number, number> = {}): PadLike {
  return {
    id, mapping, index: 0,
    buttons: Array.from({ length: n }, (_, i) => ({ pressed: press.includes(i), value: press.includes(i) ? 1 : 0 })),
    axes: Array.from({ length: m }, (_, i) => axes[i] ?? 0),
  };
}

const XBOX = 'Microsoft X-Box 360 pad (STANDARD GAMEPAD Vendor: 045e Product: 028e)';
const XBOX_RAW = '045e-028e-Microsoft X-Box 360 pad';
const PS3 = 'Sony PLAYSTATION(R)3 Controller (STANDARD GAMEPAD Vendor: 054c Product: 0268)';
const PS3_RAW = '054c-0268-Sony PLAYSTATION(R)3 Controller';
const CHILL_LINUX = '046d-cad1-Logitech Logitech Chillstream Controller';
const CHILL_WIN = 'Logitech Chillstream Controller (Vendor: 046d Product: cad1)';
const CHILL_STD = 'Logitech Chillstream Controller (STANDARD GAMEPAD Vendor: 046d Product: cad1)';

beforeEach(() => resetTriggers());

describe('Xbox / standard gamepad', () => {
  it('A or RT accelerates, B or LT brakes, X or RB is the handbrake, Y item and rocket, Back camera, Start pause', () => {
    expect(readPad(pad(XBOX, 'standard', 17, 4, [0])).throttle).toBe(1);
    expect(readPad(pad(XBOX, 'standard', 17, 4, [7])).throttle).toBe(1);
    expect(readPad(pad(XBOX, 'standard', 17, 4, [1])).brake).toBe(1);
    expect(readPad(pad(XBOX, 'standard', 17, 4, [6])).brake).toBe(1);
    expect(readPad(pad(XBOX, 'standard', 17, 4, [2])).handbrake).toBe(true);
    expect(readPad(pad(XBOX, 'standard', 17, 4, [5])).handbrake).toBe(true);
    expect(readPad(pad(XBOX, 'standard', 17, 4, [3]))).toMatchObject({ camera: false, item: true, rocket: true });
    expect(readPad(pad(XBOX, 'standard', 17, 4, [8])).camera).toBe(true);
    expect(readPad(pad(XBOX, 'standard', 17, 4, [9])).pause).toBe(true);
    expect(readPad(pad(XBOX, 'standard', 17, 4)).kind).toBe('xbox');
  });

  it('steers with either stick and the d-pad; nothing happens at rest', () => {
    const rest = readPad(pad(XBOX, 'standard', 17, 4));
    expect(rest).toMatchObject({ steer: 0, throttle: 0, brake: 0, handbrake: false });
    expect(readPad(pad(XBOX, 'standard', 17, 4, [], { 0: -0.8 })).steer).toBeCloseTo(-0.8);
    expect(readPad(pad(XBOX, 'standard', 17, 4, [], { 2: 0.6 })).steer).toBeCloseTo(0.6);
    expect(readPad(pad(XBOX, 'standard', 17, 4, [15])).steer).toBe(1);
  });

  it('raw evdev layout (Firefox on Linux): triggers are axes resting at -1 and do not steer', () => {
    // at rest: LT (axis 2) and RT (axis 5) are -1
    const rest = readPad(pad(XBOX_RAW, '', 11, 8, [], { 2: -1, 5: -1 }));
    expect(rest).toMatchObject({ steer: 0, throttle: 0, brake: 0, handbrake: false, pause: false });
    expect(readPad(pad(XBOX_RAW, '', 11, 8, [], { 2: -1, 5: 1 })).throttle).toBe(1);
    expect(readPad(pad(XBOX_RAW, '', 11, 8, [], { 2: 0, 5: -1 })).brake).toBeCloseTo(0.5);
    expect(readPad(pad(XBOX_RAW, '', 11, 8, [], { 2: -1, 5: -1, 3: 0.7 })).steer).toBeCloseTo(0.7);
    expect(readPad(pad(XBOX_RAW, '', 11, 8, [], { 2: -1, 5: -1, 6: -1 })).steer).toBe(-1);
    expect(readPad(pad(XBOX_RAW, '', 11, 8, [7], { 2: -1, 5: -1 })).pause).toBe(true);
    expect(readPad(pad(XBOX_RAW, '', 11, 8, [6], { 2: -1, 5: -1 })).pause).toBe(false);
  });

  it('raw triggers reported as 0 before the first touch do not count as half throttle', () => {
    expect(readPad(pad(XBOX_RAW, '', 11, 8)).throttle).toBe(0);
    expect(readPad(pad(XBOX_RAW, '', 11, 8)).brake).toBe(0);
  });
});

describe('PlayStation controller', () => {
  it('standard mapping: ✕ or R2 accelerate, □ or R1 is the handbrake, ○ or L2 brake', () => {
    const cross = readPad(pad(PS3, 'standard', 17, 4, [0]));
    expect(cross.kind).toBe('playstation');
    expect(cross).toMatchObject({ throttle: 1, handbrake: false });
    expect(readPad(pad(PS3, 'standard', 17, 4, [2]))).toMatchObject({ throttle: 0, handbrake: true });
    expect(readPad(pad(PS3, 'standard', 17, 4, [5])).handbrake).toBe(true);
    expect(readPad(pad(PS3, 'standard', 17, 4, [7])).throttle).toBe(1);
    expect(readPad(pad(PS3, 'standard', 17, 4, [1])).brake).toBe(1);
  });

  it('raw DualShock 3 layout: ✕ (0) accelerates, □ (3) is the handbrake, △ (2) rocket, select camera', () => {
    expect(readPad(pad(PS3_RAW, '', 17, 4, [0]))).toMatchObject({ handbrake: false, throttle: 1 });
    expect(readPad(pad(PS3_RAW, '', 17, 4, [3]))).toMatchObject({ handbrake: true, throttle: 0 });
    expect(readPad(pad(PS3_RAW, '', 17, 4, [2]))).toMatchObject({ camera: false, rocket: true });
    expect(readPad(pad(PS3_RAW, '', 17, 4, [8])).camera).toBe(true);
    expect(readPad(pad(PS3_RAW, '', 17, 4, [16])).steer).toBe(1);
  });

  it('gas on the right stick: up accelerates, down brakes, only the left stick steers', () => {
    const std = (axes: Record<number, number>, press: number[] = []) => readPad(pad(PS3, 'standard', 17, 4, press, axes), 'right');
    expect(std({})).toMatchObject({ throttle: 0, brake: 0, steer: 0 });
    expect(std({ 3: -1 })).toMatchObject({ throttle: 1, brake: 0 });
    expect(std({ 3: -0.55 }).throttle).toBeCloseTo(0.5);
    expect(std({ 3: 1 })).toMatchObject({ throttle: 0, brake: 1 });
    // a small deflection does not creep
    expect(std({ 3: -0.18 }).throttle).toBe(0);
    // the right stick no longer steers, the left one does
    expect(std({ 2: 0.9, 3: -1 }).steer).toBe(0);
    expect(std({ 0: -0.7, 3: -1 })).toMatchObject({ throttle: 1 });
    expect(std({ 0: -0.7 }).steer).toBeCloseTo(-0.7);
    // R2 and ✕ keep working
    expect(std({}, [7]).throttle).toBe(1);
    // raw DualShock 3: the right stick's y is axis 4
    expect(readPad(pad(PS3_RAW, '', 17, 6, [], { 4: -1 }), 'right').throttle).toBe(1);
    expect(readPad(pad(PS3_RAW, '', 17, 6, [], { 4: 1 }), 'right').brake).toBe(1);
  });

  it('gas on the left stick: one stick for steering and gas', () => {
    const p = readPad(pad(PS3, 'standard', 17, 4, [], { 0: 0.6, 1: -1 }), 'left');
    expect(p).toMatchObject({ throttle: 1, brake: 0 });
    expect(p.steer).toBeCloseTo(0.6);
    expect(readPad(pad(PS3, 'standard', 17, 4, [], { 1: 1 }), 'left').brake).toBe(1);
    // the right stick's y does nothing in this mode
    expect(readPad(pad(PS3, 'standard', 17, 4, [], { 3: -1 }), 'left').throttle).toBe(0);
  });

  it('by default the sticks do not give gas', () => {
    expect(readPad(pad(PS3, 'standard', 17, 4, [], { 1: -1, 3: -1 }))).toMatchObject({ throttle: 0, brake: 0 });
  });
});

describe('Logitech Chillstream (PS3-style)', () => {
  const HAT_REST = 1.2857;
  it('is treated as a PlayStation controller with the same buttons as the PS3 pad', () => {
    const at = (press: number[]) => readPad(pad(CHILL_LINUX, '', 12, 6, press));
    expect(at([]).kind).toBe('playstation');
    expect(at([])).toMatchObject({ steer: 0, throttle: 0, brake: 0, handbrake: false, camera: false, pause: false });
    // ✕ (1) gas, ○ (2) brake, □ (0) handbrake, △ (3) item / rocket, R1 (5) handbrake, R2 (7) gas, L2 (6) brake
    expect(at([1])).toMatchObject({ throttle: 1, handbrake: false });
    expect(at([2]).brake).toBe(1);
    expect(at([0])).toMatchObject({ handbrake: true, throttle: 0 });
    expect(at([3])).toMatchObject({ camera: false, item: true, rocket: true });
    expect(at([5]).handbrake).toBe(true);
    expect(at([7]).throttle).toBe(1);
    expect(at([6]).brake).toBe(1);
    // select: camera in every mode, start: pause
    expect(at([8]).camera).toBe(true);
    expect(at([9]).pause).toBe(true);
  });

  it('steers with both sticks and the d-pad (hat axes on Linux, hat axis 9 on Windows)', () => {
    expect(readPad(pad(CHILL_LINUX, '', 12, 6, [], { 0: -0.8 })).steer).toBeCloseTo(-0.8);
    expect(readPad(pad(CHILL_LINUX, '', 12, 6, [], { 2: 0.6 })).steer).toBeCloseTo(0.6);
    expect(readPad(pad(CHILL_LINUX, '', 12, 6, [], { 4: 1 })).steer).toBe(1);
    expect(readPad(pad(CHILL_LINUX, '', 12, 6, [], { 5: -1 })).camera).toBe(true);
    expect(readPad(pad(CHILL_WIN, '', 12, 10, [], { 9: HAT_REST }))).toMatchObject({ steer: 0, camera: false });
    expect(readPad(pad(CHILL_WIN, '', 12, 10, [], { 9: -1 + (2 / 7) * 2 })).steer).toBe(1);
    expect(readPad(pad(CHILL_WIN, '', 12, 10, [], { 9: -1 + (2 / 7) * 6 })).steer).toBe(-1);
    expect(readPad(pad(CHILL_WIN, '', 12, 10, [], { 9: -1 })).camera).toBe(true);
  });

  it('gas on the right stick works like on the PS3 pad', () => {
    expect(readPad(pad(CHILL_LINUX, '', 12, 6, [], { 3: -1 }), 'right').throttle).toBe(1);
    expect(readPad(pad(CHILL_LINUX, '', 12, 6, [], { 3: 1 }), 'right').brake).toBe(1);
    expect(readPad(pad(CHILL_LINUX, '', 12, 6, [], { 2: 0.9, 3: -1 }), 'right').steer).toBe(0);
  });

  it('with the browser\'s standard mapping it behaves exactly like a PS3 pad', () => {
    expect(readPad(pad(CHILL_STD, 'standard', 17, 4, [0]))).toMatchObject({ kind: 'playstation', throttle: 1 });
    expect(readPad(pad(CHILL_STD, 'standard', 17, 4, [2])).handbrake).toBe(true);
  });
});
