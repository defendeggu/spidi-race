import { getCar, raceVersion, type CarSpec } from '@spidi/shared';

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

/** The pioneer cars: Kaito, Weltenbummler, Toro Fulmine and Sturmvogel. */
const PIONEER_CARS = new Set(['kaito', 'california', 'aventador', 'sturmvogel']);
/** with the pioneer cheat the pioneer cars are this much faster in races */
export const PIONEER_BOOST = 1.15;

/** With the pioneer cheat Roki drives exactly like the Kaito formula car. */
const KAITO_DRIVE = { roki: 'kaito', 'roki-town': 'kaito-stadt' } as Record<string, string>;
const driveLike = (spec: CarSpec, model: CarSpec): CarSpec => {
  const { topSpeed, accel, brake, grip, steer, wheelbase, gears, mass } = model;
  return { ...spec, topSpeed, accel, brake, grip, steer, wheelbase, gears, mass };
};

/** In the town the pioneer cars get the full top speed of their race version. */
export function townSpec(spec: CarSpec): CarSpec {
  if (cheats.pioneer && spec.id === 'roki-town') return driveLike(spec, townSpec(getCar(KAITO_DRIVE[spec.id])));
  const race = raceVersion(spec.id);
  if (cheats.pioneer && spec.class === 'town' && PIONEER_CARS.has(race)) return { ...spec, topSpeed: getCar(race).topSpeed };
  return spec;
}

/** In races (and kart-free online races) the pioneer cars are 15 % faster and pull harder. */
export function raceSpec(spec: CarSpec): CarSpec {
  if (cheats.pioneer && spec.id === 'roki') return driveLike(spec, raceSpec(getCar(KAITO_DRIVE[spec.id])));
  if (cheats.pioneer && PIONEER_CARS.has(spec.id)) return { ...spec, topSpeed: spec.topSpeed * PIONEER_BOOST, accel: spec.accel * PIONEER_BOOST };
  return spec;
}
