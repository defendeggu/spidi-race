import type { CarSpec, CarState } from '@spidi/shared';
import { input, type KeyMap } from './input';

const panels = new WeakMap<HTMLElement, HTMLElement>();

/** Keep the launch key and cooldown visible in each local player's viewport. */
export function updateRocketHud(root: HTMLElement, spec: CarSpec, state: CarState, keys: KeyMap, primary: boolean) {
  if (primary) input.touch?.setRocketEnabled(!!spec.rocket);
  if (!spec.rocket) return;
  let panel = panels.get(root);
  if (!panel) {
    panel = document.createElement('div');
    panel.style.cssText = 'position:absolute;bottom:18px;left:50%;transform:translateX(-50%);padding:8px 12px;border-radius:8px;background:#101d2de0;color:#c5efff;font:bold 13px system-ui;white-space:nowrap;pointer-events:none';
    root.appendChild(panel);
    panels.set(root, panel);
  }
  const key = keys.rocket?.includes('KeyF') ? 'F' : 'Num 2 / Del';
  const cooldown = state.rocketCooldown ?? 0;
  panel.textContent = (state.rocketBurn ?? 0) > 0 ? 'ROCKET · THRUST'
    : state.airborne ? 'ROCKET · 360° ROLL / LANDING'
      : cooldown > 0 ? `ROCKET · ${cooldown.toFixed(1)} s`
        : `ROCKET · ${key} / △ / TOUCH · READY`;
}
