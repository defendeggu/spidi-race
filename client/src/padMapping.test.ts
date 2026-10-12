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

beforeEach(() => resetTriggers());

describe('Xbox / standard gamepad', () => {
  it('A or RT accelerates, B or LT brakes, X or RB is the handbrake, Y camera, Start pause', () => {
    expect(readPad(pad(XBOX, 'standard', 17, 4, [0])).throttle).toBe(1);
    expect(readPad(pad(XBOX, 'standard', 17, 4, [7])).throttle).toBe(1);
    expect(readPad(pad(XBOX, 'standard', 17, 4, [1])).brake).toBe(1);
    expect(readPad(pad(XBOX, 'standard', 17, 4, [6])).brake).toBe(1);
    expect(readPad(pad(XBOX, 'standard', 17, 4, [2])).handbrake).toBe(true);
    expect(readPad(pad(XBOX, 'standard', 17, 4, [5])).handbrake).toBe(true);
    expect(readPad(pad(XBOX, 'standard', 17, 4, [3])).camera).toBe(true);
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

  it('raw DualShock 3 layout: ✕ (0) accelerates, □ (3) is the handbrake, △ (2) camera', () => {
    expect(readPad(pad(PS3_RAW, '', 17, 4, [0]))).toMatchObject({ handbrake: false, throttle: 1 });
    expect(readPad(pad(PS3_RAW, '', 17, 4, [3]))).toMatchObject({ handbrake: true, throttle: 0 });
    expect(readPad(pad(PS3_RAW, '', 17, 4, [2])).camera).toBe(true);
    expect(readPad(pad(PS3_RAW, '', 17, 4, [16])).steer).toBe(1);
  });
});
