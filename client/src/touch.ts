import type { CarInput } from '@spidi/shared';
import { html, setHtml } from './ui/html';

export type TouchAction = 'item' | 'camera' | 'pause';

/** A phone or tablet: the touch controls are shown in games. */
export function isTouchDevice() {
  return typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);
}

/**
 * On-screen controls for phones and tablets (landscape): a steering pad on the left (drag sideways),
 * big buttons for gas, brake and drift on the right, the item button in kart modes and small buttons
 * for camera and pause. Several fingers at once are supported (pointer events per finger).
 */
export class TouchControls {
  readonly state: CarInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  private root: HTMLDivElement;
  private pressed = new Set<TouchAction>();
  private steerId: number | null = null;
  private steerX0 = 0;
  private knob: HTMLElement;

  constructor(parent: HTMLElement, opts: { item: boolean }) {
    this.root = document.createElement('div');
    this.root.className = 'touch';
    setHtml(this.root, html`
      <div class="touch-steer" data-t="steer"><div class="touch-track"></div><div class="touch-knob" data-t="knob"></div></div>
      <div class="touch-right">
        ${opts.item ? html`<button class="touch-btn item" data-t="item">ITEM</button>` : ''}
        <button class="touch-btn drift" data-t="hand">DRIFT</button>
        <button class="touch-btn brake" data-t="brake">BREMSE</button>
        <button class="touch-btn gas" data-t="gas">GAS</button>
      </div>
      <div class="touch-top">
        <button class="touch-mini" data-t="camera">📷</button>
        <button class="touch-mini" data-t="pause">⏸</button>
      </div>
      <div class="touch-rotate">Bitte das Gerät quer halten 🔄</div>`);
    parent.appendChild(this.root);
    const q = (k: string) => this.root.querySelector<HTMLElement>(`[data-t="${k}"]`)!;
    this.knob = q('knob');

    // steering: the finger's sideways offset from where it touched down
    const pad = q('steer');
    pad.addEventListener('pointerdown', (e) => {
      if (this.steerId !== null) return;
      this.steerId = e.pointerId;
      this.steerX0 = e.clientX;
      pad.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    pad.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.steerId) return;
      const range = Math.max(50, window.innerWidth * 0.08);
      this.state.steer = Math.max(-1, Math.min(1, (e.clientX - this.steerX0) / range));
      this.knob.style.transform = `translateX(${this.state.steer * 60}px)`;
    });
    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.steerId) return;
      this.steerId = null;
      this.state.steer = 0;
      this.knob.style.transform = '';
    };
    pad.addEventListener('pointerup', release);
    pad.addEventListener('pointercancel', release);

    // held buttons
    const hold = (key: string, on: (down: boolean) => void) => {
      const el = q(key);
      const set = (down: boolean) => {
        on(down);
        el.classList.toggle('on', down);
      };
      el.addEventListener('pointerdown', (e) => {
        el.setPointerCapture(e.pointerId);
        e.preventDefault();
        set(true);
      });
      el.addEventListener('pointerup', () => set(false));
      el.addEventListener('pointercancel', () => set(false));
    };
    hold('gas', (d) => (this.state.throttle = d ? 1 : 0));
    hold('brake', (d) => (this.state.brake = d ? 1 : 0));
    hold('hand', (d) => (this.state.handbrake = d));
    // tapped buttons
    for (const a of ['item', 'camera', 'pause'] as TouchAction[]) {
      const el = this.root.querySelector<HTMLElement>(`[data-t="${a}"]`);
      el?.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.pressed.add(a);
      });
    }
    // no context menu, no text selection on long presses
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** True once per tap of the button. */
  consume(a: TouchAction) {
    return this.pressed.delete(a);
  }

  dispose() {
    this.root.remove();
  }
}
