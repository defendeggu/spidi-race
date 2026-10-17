/**
 * Reads a gamepad into driving controls. Pure (no DOM access) so it can be unit-tested.
 *
 * Browsers report pads in two ways:
 * - mapping 'standard' (Chrome; Firefox for known pads): fixed button/axis order, triggers are buttons 6/7.
 * - no mapping (Firefox on Linux for some pads): the raw evdev order of the driver. Two layouts are
 *   known here: the DualShock 3 (hid-sony) and the Xbox layout (xpad and most generic pads), whose
 *   triggers are axes that rest at -1.
 */

export interface PadLike {
  id: string;
  mapping: string;
  index: number;
  buttons: readonly { pressed: boolean; value: number }[];
  axes: readonly number[];
}

export type PadKind = 'xbox' | 'playstation';

/**
 * Where the gamepad gives gas: 'buttons' = trigger or bottom face button (the default), 'right' = right
 * stick up / down (the left stick steers alone), 'left' = left stick up / down (one stick for everything).
 * The trigger and face buttons keep working in every mode.
 */
export type PadThrottle = 'buttons' | 'right' | 'left';

export interface PadState {
  index: number;
  kind: PadKind;
  steer: number;
  throttle: number;
  brake: number;
  handbrake: boolean;
  camera: boolean;
  pause: boolean;
  /** Y / △: also the item button in kart races */
  item: boolean;
  /** Back / Select or d-pad up: the camera button in kart races */
  altCamera: boolean;
}

export const isPlayStation = (p: PadLike) => /054c|playstation|sony|dualshock|dualsense|wireless controller/i.test(p.id);

/** Raw Linux evdev layout of a DualShock 3 (Firefox reports it without the standard mapping). */
const isRawPs3 = (p: PadLike) => p.mapping !== 'standard' && /054c.*0268|PLAYSTATION\(R\)3/i.test(p.id);

/** Lowest value seen per trigger axis: raw triggers only count once they were seen resting at -1. */
const triggerRest = new Map<string, number>();

function triggerAxis(p: PadLike, axis: number) {
  const v = p.axes[axis] ?? 0;
  const key = `${p.index}:${p.id}:${axis}`;
  const min = Math.min(triggerRest.get(key) ?? v, v);
  triggerRest.set(key, min);
  // before the first touch some browsers report 0 instead of -1: that must not count as half throttle
  return min <= -0.5 ? Math.max(0, (v + 1) / 2) : 0;
}

/** For tests: forget the trigger rest positions. */
export function resetTriggers() {
  triggerRest.clear();
}

const dead = (v: number) => (Math.abs(v) > 0.15 ? Math.max(-1, Math.min(1, v)) : 0);

/** Stick deflection beyond a larger dead zone, rescaled to 0..1 (gas must not creep in while steering). */
const pedal = (v: number) => Math.max(0, Math.min(1, (Math.abs(v) - 0.2) / 0.7));

export function readPad(p: PadLike, throttleMode: PadThrottle = 'buttons'): PadState {
  const b = (i: number) => p.buttons[i]?.pressed ?? false;
  const v = (i: number) => p.buttons[i]?.value ?? 0;
  const trig = (i: number) => {
    const t = Math.max(v(i), b(i) ? 1 : 0);
    return t > 0.05 ? t : 0;
  };
  const kind: PadKind = isPlayStation(p) ? 'playstation' : 'xbox';

  let south: boolean, east: boolean, west: boolean, north: boolean, bumper: boolean, start: boolean;
  // sticks: left and right x; ys: left and right y (up is negative)
  let rt: number, lt: number, sticks: number[], ys: number[], dpad: number, select: boolean, up: boolean;
  if (p.mapping === 'standard') {
    [south, east, west, north, bumper, start] = [b(0), b(1), b(2), b(3), b(5), b(9)];
    rt = trig(7);
    lt = trig(6);
    sticks = [p.axes[0] ?? 0, p.axes[2] ?? 0];
    ys = [p.axes[1] ?? 0, p.axes[3] ?? 0];
    dpad = (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
    select = b(8);
    up = b(12);
  } else if (isRawPs3(p)) {
    // cross, circle, triangle, square, L1, R1, L2, R2, select, start, …, dpad up/down/left/right 13–16
    [south, east, west, north, bumper, start] = [b(0), b(1), b(3), b(2), b(5), b(9)];
    rt = trig(7);
    lt = trig(6);
    sticks = [p.axes[0] ?? 0, p.axes[3] ?? 0];
    ys = [p.axes[1] ?? 0, p.axes[4] ?? 0];
    dpad = (b(16) ? 1 : 0) - (b(15) ? 1 : 0);
    select = b(8);
    up = b(13);
  } else {
    // Xbox evdev order: A B X Y LB RB back start guide LS RS; axes LX LY LT RX RY RT hatX hatY
    [south, east, west, north, bumper, start] = [b(0), b(1), b(2), b(3), b(5), b(7)];
    rt = Math.max(triggerAxis(p, 5), 0);
    lt = Math.max(triggerAxis(p, 2), 0);
    sticks = [p.axes[0] ?? 0, p.axes[3] ?? 0];
    ys = [p.axes[1] ?? 0, p.axes[4] ?? 0];
    const hat = p.axes[6] ?? 0;
    dpad = Math.abs(hat) > 0.5 ? Math.sign(hat) : 0;
    select = b(6);
    up = (p.axes[7] ?? 0) < -0.5;
  }

  // either stick steers, whichever is deflected further; the d-pad steers digitally.
  // With gas on the right stick only the left one steers.
  const [l, r] = throttleMode === 'right' ? [sticks[0], 0] : sticks;
  let steer = dead(Math.abs(r) > Math.abs(l) ? r : l);
  if (dpad !== 0) steer = dpad;
  // gas on a stick: up accelerates, down brakes and reverses
  const y = throttleMode === 'right' ? ys[1] : throttleMode === 'left' ? ys[0] : 0;
  const stickGas = y < 0 ? pedal(y) : 0, stickBrake = y > 0 ? pedal(y) : 0;

  // the bottom face button (A / ✕) accelerates, the left one (X / □) is the handbrake
  return {
    index: p.index,
    kind,
    steer,
    throttle: Math.max(rt, south ? 1 : 0, stickGas),
    brake: Math.max(lt, east ? 1 : 0, stickBrake),
    handbrake: west || bumper,
    camera: north,
    pause: start,
    item: north,
    altCamera: select || up,
  };
}
