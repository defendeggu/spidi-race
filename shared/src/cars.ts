import type { CarClass } from './track';

export interface CarShape {
  length: number;
  width: number;
  /** height of the body shoulder */
  height: number;
  /** cabin roof height */
  roof: number;
  /** cabin position along the car (0 = centre, positive = forward) */
  cabinShift: number;
  spoiler: boolean;
}

export interface CarSpec {
  id: string;
  /** 'road' cars race on asphalt tracks, 'offroad' cars on offroad tracks */
  class: CarClass;
  /** visual suspension travel (m) */
  suspension: number;
  name: string;
  description: string;
  /** m/s, theoretical */
  topSpeed: number;
  /** m/s² at standstill */
  accel: number;
  /** m/s² braking deceleration */
  brake: number;
  /** maximum lateral acceleration m/s² */
  grip: number;
  /** maximum steering angle (rad) at standstill */
  steer: number;
  wheelbase: number;
  gears: number;
  mass: number;
  color: string;
  accent: string;
  /** Kenney Car Kit model used by the client (visual only) */
  model: string;
  /** keep the model's original livery (taxi, police, fire engine) instead of repainting it */
  keepPaint?: boolean;
  shape: CarShape;
}

export const CARS: CarSpec[] = [
  {
    id: 'falcone',
    class: 'road',
    suspension: 0.06,
    name: 'Falcone Strada',
    description: 'Italienisches Sportcoupé – ausgewogen und schnell',
    topSpeed: 88,
    accel: 9.4,
    brake: 16,
    grip: 13.5,
    steer: 0.6,
    wheelbase: 2.6,
    gears: 6,
    mass: 1450,
    color: '#c8102e',
    accent: '#1b1b1b',
    model: 'sedan-sports',
    shape: { length: 4.5, width: 1.98, height: 0.86, roof: 1.18, cabinShift: -0.1, spoiler: false },
  },
  {
    id: 'sturmvogel',
    class: 'road',
    suspension: 0.06,
    name: 'Sturmvogel RS',
    description: 'Futuristischer Prototyp – höchste Endgeschwindigkeit',
    topSpeed: 94,
    accel: 8.8,
    brake: 17,
    grip: 12.8,
    steer: 0.58,
    wheelbase: 2.5,
    gears: 6,
    mass: 1400,
    color: '#c3cbd2',
    accent: '#222831',
    model: 'race-future',
    shape: { length: 4.4, width: 1.92, height: 0.9, roof: 1.26, cabinShift: -0.25, spoiler: true },
  },
  {
    id: 'kaito',
    class: 'road',
    suspension: 0.06,
    name: 'Kaito ZX',
    description: 'Leichter Formelwagen – Kurvenkünstler',
    topSpeed: 82,
    accel: 9.8,
    brake: 17.5,
    grip: 15,
    steer: 0.66,
    wheelbase: 2.45,
    gears: 6,
    mass: 1250,
    color: '#f2c500',
    accent: '#111111',
    model: 'race',
    shape: { length: 4.2, width: 1.86, height: 0.84, roof: 1.2, cabinShift: 0.05, spoiler: true },
  },
  {
    id: 'brutale',
    class: 'road',
    suspension: 0.06,
    name: 'Brutale V10',
    description: 'Hot Hatch mit V10 – brutale Beschleunigung',
    topSpeed: 86,
    accel: 11,
    brake: 14.5,
    grip: 12.2,
    steer: 0.56,
    wheelbase: 2.7,
    gears: 6,
    mass: 1650,
    color: '#1f7a3a',
    accent: '#f4f4f4',
    model: 'hatchback-sports',
    shape: { length: 4.6, width: 2.0, height: 0.92, roof: 1.22, cabinShift: -0.35, spoiler: false },
  },
  {
    id: 'bergziege',
    class: 'offroad',
    suspension: 0.22,
    name: 'Bergziege 4x4',
    description: 'Kompakter Geländewagen – wendig mit viel Grip',
    topSpeed: 64,
    accel: 9.6,
    brake: 15,
    grip: 14.5,
    steer: 0.68,
    wheelbase: 2.4,
    gears: 5,
    mass: 1500,
    color: '#3f8a3a',
    accent: '#1b1b1b',
    model: 'suv',
    shape: { length: 4.2, width: 2.0, height: 1.0, roof: 1.6, cabinShift: -0.2, spoiler: false },
  },
  {
    id: 'baron',
    class: 'offroad',
    suspension: 0.18,
    name: 'Baron V8',
    description: 'Luxus-Geländewagen – schnell und schwer',
    topSpeed: 70,
    accel: 8.6,
    brake: 14,
    grip: 13.2,
    steer: 0.6,
    wheelbase: 2.8,
    gears: 6,
    mass: 2100,
    color: '#e0a21a',
    accent: '#2a2a2a',
    model: 'suv-luxury',
    shape: { length: 4.8, width: 2.05, height: 1.05, roof: 1.65, cabinShift: -0.1, spoiler: false },
  },
  {
    id: 'raider',
    class: 'offroad',
    suspension: 0.25,
    name: 'Sahara Raider',
    description: 'Wüsten-Pickup – brachiale Beschleunigung',
    topSpeed: 66,
    accel: 10.6,
    brake: 14.5,
    grip: 13.6,
    steer: 0.62,
    wheelbase: 3.0,
    gears: 5,
    mass: 1900,
    color: '#c8452a',
    accent: '#f4f4f4',
    model: 'truck',
    shape: { length: 5.0, width: 2.05, height: 1.0, roof: 1.6, cabinShift: 0.4, spoiler: false },
  },
  {
    id: 'blitz',
    class: 'micro',
    suspension: 0.04,
    name: 'Mini-Blitz',
    description: 'Spielzeug-Rennwagen – höchste Spitze, rutscht gern',
    topSpeed: 60,
    accel: 11.4,
    brake: 16.5,
    grip: 17,
    steer: 0.75,
    wheelbase: 2.3,
    gears: 5,
    mass: 900,
    color: '#ffd400',
    accent: '#e0242b',
    model: 'race',
    shape: { length: 4.2, width: 1.9, height: 0.75, roof: 1.05, cabinShift: -0.2, spoiler: true },
  },
  {
    id: 'flitzer',
    class: 'micro',
    suspension: 0.04,
    name: 'Taschen-Flitzer',
    description: 'Kleiner Hatchback zum Aufziehen – wieselflink',
    topSpeed: 54,
    accel: 13,
    brake: 18,
    grip: 19.5,
    steer: 0.85,
    wheelbase: 2.2,
    gears: 4,
    mass: 800,
    color: '#19b5e6',
    accent: '#ffffff',
    model: 'hatchback-sports',
    shape: { length: 3.9, width: 1.85, height: 0.85, roof: 1.2, cabinShift: -0.3, spoiler: false },
  },
  {
    id: 'rakete',
    class: 'micro',
    suspension: 0.04,
    name: 'Zwergrakete',
    description: 'Zukunfts-Flitzer aus dem Überraschungsei – ausgewogen',
    topSpeed: 57,
    accel: 12.2,
    brake: 17.2,
    grip: 18.2,
    steer: 0.8,
    wheelbase: 2.3,
    gears: 5,
    mass: 850,
    color: '#e8368f',
    accent: '#2a2a2a',
    model: 'race-future',
    shape: { length: 4.1, width: 1.9, height: 0.7, roof: 1.0, cabinShift: -0.1, spoiler: true },
  },
];

// ---------------------------------------------------------------- practice town: gentle everyday cars
const TOWN_BASE = {
  class: 'town' as const,
  suspension: 0.1,
  topSpeed: 20,
  accel: 4.8,
  brake: 10,
  grip: 10,
  steer: 0.65,
  wheelbase: 2.6,
  gears: 4,
  mass: 1400,
  accent: '#222222',
};

export const TOWN_CARS: CarSpec[] = [
  {
    ...TOWN_BASE,
    id: 'familie',
    name: 'Familienauto',
    description: 'Gemütliche Limousine für die ersten Runden',
    color: '#2f6fd0',
    model: 'sedan',
    shape: { length: 4.3, width: 1.9, height: 0.9, roof: 1.5, cabinShift: -0.1, spoiler: false },
  },
  {
    ...TOWN_BASE,
    id: 'taxi',
    name: 'Taxi',
    description: 'Gelbes Stadttaxi – kennt jede Strasse',
    color: '#f2c200',
    model: 'taxi',
    keepPaint: true,
    shape: { length: 4.5, width: 1.9, height: 0.9, roof: 1.55, cabinShift: -0.1, spoiler: false },
  },
  {
    ...TOWN_BASE,
    id: 'polizei',
    name: 'Polizeiauto',
    description: 'Streifenwagen auf Patrouille',
    color: '#f4f4f4',
    model: 'police',
    keepPaint: true,
    wheelbase: 2.8,
    shape: { length: 4.8, width: 1.95, height: 0.9, roof: 1.5, cabinShift: -0.1, spoiler: false },
  },
  {
    ...TOWN_BASE,
    id: 'feuerwehr',
    name: 'Feuerwehr',
    description: 'Grosses Feuerwehrauto – langsamer, aber unübersehbar',
    color: '#d42020',
    model: 'firetruck',
    keepPaint: true,
    topSpeed: 17,
    accel: 4,
    brake: 8.5,
    grip: 9,
    steer: 0.6,
    wheelbase: 3.6,
    mass: 3500,
    shape: { length: 6, width: 2.3, height: 1.4, roof: 2.6, cabinShift: 1.6, spoiler: false },
  },
  {
    ...TOWN_BASE,
    id: 'kaito-stadt',
    name: 'Kaito ZX',
    description: 'Formelwagen – flinker und schneller, für Fortgeschrittene',
    color: '#f2c500',
    model: 'race',
    suspension: 0.06,
    topSpeed: 27,
    accel: 7,
    brake: 13,
    grip: 13,
    steer: 0.66,
    wheelbase: 2.45,
    gears: 5,
    mass: 1250,
    shape: { length: 4.2, width: 1.86, height: 0.84, roof: 1.2, cabinShift: 0.05, spoiler: true },
  },
];

CARS.push(...TOWN_CARS);

// ---------------------------------------------------------------- karts (kart races with items)
const KART_BASE = {
  class: 'kart' as const,
  suspension: 0.05,
  brake: 16,
  wheelbase: 1.9,
  gears: 4,
  mass: 600,
  accent: '#222222',
  keepPaint: true,
  shape: { length: 2.6, width: 1.8, height: 0.7, roof: 1.6, cabinShift: 0, spoiler: false },
};

export const KART_CARS: CarSpec[] = [
  { ...KART_BASE, id: 'kart-oobi', name: 'Oobi', description: 'Allrounder – nichts zu meckern', model: 'kart-oobi', color: '#e8402a', topSpeed: 35.1, accel: 13.0, grip: 16, steer: 0.8 },
  { ...KART_BASE, id: 'kart-oodi', name: 'Oodi', description: 'Raketenstart – beschleunigt am schnellsten', model: 'kart-oodi', color: '#3a7ad8', topSpeed: 33.8, accel: 15.0, grip: 15.5, steer: 0.8 },
  { ...KART_BASE, id: 'kart-ooli', name: 'Ooli', description: 'Kurvenkünstlerin – klebt auf der Strasse', model: 'kart-ooli', color: '#3aa84a', topSpeed: 33.8, accel: 12.3, grip: 18, steer: 0.88 },
  { ...KART_BASE, id: 'kart-oopi', name: 'Oopi', description: 'Vollgas-Fan – höchste Spitze, rutscht gern', model: 'kart-oopi', color: '#e8c020', topSpeed: 37.1, accel: 12.3, grip: 15, steer: 0.76 },
  { ...KART_BASE, id: 'kart-oozi', name: 'Oozi', description: 'Schwergewicht – schiebt die anderen weg', model: 'kart-oozi', color: '#a050d0', topSpeed: 35.8, accel: 12.7, grip: 15.5, steer: 0.78, mass: 800 },
];

CARS.push(...KART_CARS);

/** Parked and passing cars in the town (visual only). */
export const TRAFFIC_MODELS = ['sedan', 'hatchback-sports', 'suv', 'van', 'delivery', 'taxi', 'sedan-sports'];

export function carsForClass(cls: CarClass) {
  return CARS.filter((c) => c.class === cls);
}

export function getCar(id: string): CarSpec {
  return CARS.find((c) => c.id === id) ?? CARS[0];
}

/** Display ratings 0..1 for the menu. */
export function carRatings(c: CarSpec) {
  const norm = (v: number, lo: number, hi: number) => Math.max(0.1, Math.min(1, (v - lo) / (hi - lo)));
  // micro cars are compared among themselves: they are all quicker off the line and grippier
  const micro = c.class === 'micro';
  const speed = { road: [70, 96], offroad: [56, 74], micro: [50, 62], town: [15, 22], kart: [31, 38] }[c.class];
  if (c.class === 'kart') {
    return {
      speed: norm(c.topSpeed, 31, 38), accel: norm(c.accel, 11, 15.5), handling: norm(c.grip + c.steer * 5, 17.5, 23), brakes: norm(c.brake, 12, 18),
    };
  }
  return {
    speed: norm(c.topSpeed, speed[0], speed[1]),
    accel: micro ? norm(c.accel, 10, 13.5) : c.class === 'town' ? norm(c.accel, 3, 5.5) : norm(c.accel, 7, 11.5),
    handling: micro ? norm(c.grip + c.steer * 5, 18, 24.5) : c.class === 'town' ? norm(c.grip + c.steer * 5, 9, 14) : norm(c.grip + c.steer * 5, 13, 18.6),
    brakes: c.class === 'town' ? norm(c.brake, 7, 11) : norm(c.brake, 12, 18),
  };
}
