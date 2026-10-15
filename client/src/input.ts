import type { CarInput } from '@spidi/shared';
import { isPlayStation, readPad, type PadKind, type PadState } from './padMapping';
import type { TouchAction, TouchControls } from './touch';

export interface KeyMap {
  up: string[];
  down: string[];
  left: string[];
  right: string[];
  handbrake: string[];
  camera: string[];
  /** use the held item (kart races) */
  item: string[];
}

export const KEYMAPS: KeyMap[] = [
  { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], handbrake: ['Space'], camera: ['KeyC'], item: ['KeyE'] },
  {
    up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
    handbrake: ['ControlRight', 'ShiftRight', 'Numpad0'], camera: ['Enter', 'NumpadEnter', 'Period'],
    // End, Num 1 and the '-' key of German keyboards (code Slash)
    item: ['End', 'Numpad1', 'Slash'],
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
  item: [...KEYMAPS[0].item, ...KEYMAPS[1].item],
};

const BLOCKED = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Slash', 'End']);

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

  /** on-screen controls on phones and tablets (player 1 only) */
  touch: TouchControls | null = null;

  /** True once per tap of a touch button (pause, camera, item). */
  consumeTouch(a: TouchAction) {
    return this.touch?.consume(a) ?? false;
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
    // the touch controls belong to player 1
    const t = padSlot === 0 ? this.touch?.state : undefined;
    if (t) {
      if (t.steer !== 0) inp.steer = t.steer;
      if (t.throttle > 0) inp.throttle = t.throttle;
      if (t.brake > 0) inp.brake = t.brake;
      if (t.handbrake) inp.handbrake = true;
    }
    return inp;
  }

  /** True once per gamepad button press (camera / pause). */
  consumePad(padSlot: number, action: 'camera' | 'pause' | 'item' | 'altCamera') {
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

/**
 * Real gamepads in connection order. Skips sensor-only devices such as the
 * "Motion Sensors" node the Linux hid-sony driver creates for PS3/PS4 pads.
 */
function gamepads(): Gamepad[] {
  const list = navigator.getGamepads?.() ?? [];
  return list.filter((p): p is Gamepad => !!p && p.connected && p.buttons.length >= 8 && !/motion sensors/i.test(p.id));
}

function padState(slot: number): PadState | null {
  const p = gamepads()[slot];
  return p ? readPad(p) : null;
}

export const input = new InputManager();

/** Layout of the n-th gamepad, or null if none is connected (for showing gamepad instead of keyboard hints). */
export function padKindAt(slot: number): PadKind | null {
  const p = gamepads()[slot];
  return p ? (isPlayStation(p) ? 'playstation' : 'xbox') : null;
}
