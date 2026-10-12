import { getCar, type CarSpec } from '@spidi/shared';

/** Codes typed in the main menu, like in the old days. Active until the page is reloaded. */
export const cheats = { pioneer: false };

const CODES: Record<string, keyof typeof cheats> = { pioneer: 'pioneer' };
const MAX = Math.max(...Object.keys(CODES).map((c) => c.length));
let typed = '';

/** Feed a typed key; returns the cheat that was just entered, if any. */
export function typeCheat(key: string): keyof typeof cheats | null {
  if (!/^[a-z]$/i.test(key)) return null;
  typed = (typed + key.toLowerCase()).slice(-MAX);
  for (const [code, cheat] of Object.entries(CODES)) {
    if (typed.endsWith(code) && !cheats[cheat]) {
      cheats[cheat] = true;
      typed = '';
      return cheat;
    }
  }
  return null;
}

/** The town version of the formula car gets its full race top speed. */
export function townSpec(spec: CarSpec): CarSpec {
  if (cheats.pioneer && spec.id === 'kaito-stadt') return { ...spec, topSpeed: getCar('kaito').topSpeed };
  return spec;
}
