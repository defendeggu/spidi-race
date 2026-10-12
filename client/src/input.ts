import type { CarInput } from '@spidi/shared';

export interface KeyMap {
  up: string[];
  down: string[];
  left: string[];
  right: string[];
  handbrake: string[];
  camera: string[];
}

export const KEYMAPS: KeyMap[] = [
  { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], handbrake: ['Space'], camera: ['KeyC'] },
  {
    up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
    handbrake: ['ControlRight', 'ShiftRight', 'Numpad0'], camera: ['Enter', 'NumpadEnter', 'Period'],
  },
];

/** Single player may use both WASD and the arrow keys. */
export const SOLO_KEYMAP: KeyMap = {
  up: [...KEYMAPS[0].up, ...KEYMAPS[1].up],
  down: [...KEYMAPS[0].down, ...KEYMAPS[1].down],
  left: [...KEYMAPS[0].left, ...KEYMAPS[1].left],
  right: [...KEYMAPS[0].right, ...KEYMAPS[1].right],
  handbrake: [...KEYMAPS[0].handbrake, ...KEYMAPS[1].handbrake],
  camera: [...KEYMAPS[0].camera, ...KEYMAPS[1].camera],
};

const BLOCKED = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

class InputManager {
  private down = new Set<string>();
  private pressed = new Set<string>();

  constructor() {
    window.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (BLOCKED.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  isDown(codes: string[]) {
    return codes.some((c) => this.down.has(c));
  }

  /** True once per key press. */
  consume(codes: string[]) {
    let hit = false;
    for (const c of codes) if (this.pressed.delete(c)) hit = true;
    return hit;
  }

  clearPressed() {
    this.pressed.clear();
  }

  carInput(map: KeyMap, padSlot: number): CarInput {
    const inp: CarInput = {
      throttle: this.isDown(map.up) ? 1 : 0,
      brake: this.isDown(map.down) ? 1 : 0,
      steer: (this.isDown(map.right) ? 1 : 0) - (this.isDown(map.left) ? 1 : 0),
      handbrake: this.isDown(map.handbrake),
    };
    const pad = padState(padSlot);
    if (pad) {
      if (pad.steer !== 0) inp.steer = pad.steer;
      if (pad.throttle > 0) inp.throttle = pad.throttle;
      if (pad.brake > 0) inp.brake = pad.brake;
      if (pad.handbrake) inp.handbrake = true;
    }
    return inp;
  }

  /** True once per gamepad button press (camera / pause). */
  consumePad(padSlot: number, action: 'camera' | 'pause') {
    const pad = padState(padSlot);
    const key = `${pad?.index}:${action}`;
    const now = !!pad?.[action];
    const was = this.padHeld.has(key);
    if (now) this.padHeld.add(key);
    else this.padHeld.delete(key);
    return now && !was;
  }

  private padHeld = new Set<string>();
}

interface PadState {
  index: number;
  steer: number;
  throttle: number;
  brake: number;
  handbrake: boolean;
  camera: boolean;
  pause: boolean;
}

/**
 * Real gamepads in connection order. Skips sensor-only devices such as the
 * "Motion Sensors" node the Linux hid-sony driver creates for PS3/PS4 pads.
 */
function gamepads(): Gamepad[] {
  const list = navigator.getGamepads?.() ?? [];
  return list.filter((p): p is Gamepad => !!p && p.connected && p.buttons.length >= 10 && !/motion sensors/i.test(p.id));
}

/** Raw Linux evdev layout of a DualShock 3 (Firefox reports it without the standard mapping). */
const isRawPs3 = (p: Gamepad) =>
  p.mapping !== 'standard' && (/054c.*0268|PLAYSTATION\(R\)3/i.test(p.id));

function padState(slot: number): PadState | null {
  const p = gamepads()[slot];
  if (!p) return null;
  const b = (i: number) => p.buttons[i]?.pressed ?? false;
  const v = (i: number) => p.buttons[i]?.value ?? 0;
  // button indices: [cross/A, circle/B, square/X, triangle/Y, R1, L2, R2, start, dpad left, dpad right]
  const [south, east, west, north, r1, l2, r2, start, dl, dr] = isRawPs3(p)
    ? [0, 1, 3, 2, 5, 6, 7, 9, 15, 16]
    : [0, 1, 2, 3, 5, 6, 7, 9, 14, 15];
  // either stick steers, whichever is deflected further (right stick X: axis 2, raw PS3: axis 3)
  const left = p.axes[0] ?? 0, right = p.axes[isRawPs3(p) ? 3 : 2] ?? 0;
  const ax = Math.abs(right) > Math.abs(left) ? right : left;
  let steer = Math.abs(ax) > 0.15 ? Math.max(-1, Math.min(1, ax)) : 0;
  if (b(dl) || b(dr)) steer = (b(dr) ? 1 : 0) - (b(dl) ? 1 : 0);
  const trig = (i: number) => Math.max(v(i), b(i) ? 1 : 0);
  return {
    index: p.index,
    steer,
    throttle: Math.max(trig(r2) > 0.05 ? trig(r2) : 0, b(south) ? 1 : 0),
    brake: Math.max(trig(l2) > 0.05 ? trig(l2) : 0, b(east) ? 1 : 0),
    handbrake: b(west) || b(r1),
    camera: b(north),
    pause: b(start),
  };
}

export const input = new InputManager();

/** True if the n-th gamepad is connected (for showing gamepad instead of keyboard hints). */
export function padConnected(slot: number) {
  return !!gamepads()[slot];
}
