import { ROCKET_COOLDOWN, type CarState } from '@spidi/shared';

/** One barrel roll after lift-off, completed before a normal ballistic landing. */
export function rocketRollAngle(state: CarState): number {
  if (!state.airborne || !(state.rocketCooldown && state.rocketCooldown > 0)) return 0;
  const elapsed = ROCKET_COOLDOWN - state.rocketCooldown;
  const progress = Math.max(0, Math.min(1, (elapsed - 0.3) / 1.1));
  const eased = progress * progress * (3 - 2 * progress);
  return eased * Math.PI * 2;
}
