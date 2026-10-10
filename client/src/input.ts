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

  carInput(map: KeyMap, padIndex: number): CarInput {
    const inp: CarInput = {
      throttle: this.isDown(map.up) ? 1 : 0,
      brake: this.isDown(map.down) ? 1 : 0,
      steer: (this.isDown(map.right) ? 1 : 0) - (this.isDown(map.left) ? 1 : 0),
      handbrake: this.isDown(map.handbrake),
    };
    const pad = navigator.getGamepads?.()[padIndex];
    if (pad && pad.connected) {
      const ax = pad.axes[0] ?? 0;
      if (Math.abs(ax) > 0.15) inp.steer = Math.max(-1, Math.min(1, ax));
      const rt = pad.buttons[7]?.value ?? 0, lt = pad.buttons[6]?.value ?? 0;
      if (rt > 0.05 || pad.buttons[0]?.pressed) inp.throttle = Math.max(rt, pad.buttons[0]?.pressed ? 1 : 0);
      if (lt > 0.05 || pad.buttons[1]?.pressed) inp.brake = Math.max(lt, pad.buttons[1]?.pressed ? 1 : 0);
      if (pad.buttons[2]?.pressed || pad.buttons[5]?.pressed) inp.handbrake = true;
    }
    return inp;
  }

  padButton(padIndex: number, button: number) {
    const pad = navigator.getGamepads?.()[padIndex];
    return !!pad?.buttons[button]?.pressed;
  }
}

export const input = new InputManager();
