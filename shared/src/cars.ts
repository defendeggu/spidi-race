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
];

export function carsForClass(cls: CarClass) {
  return CARS.filter((c) => c.class === cls);
}

export function getCar(id: string): CarSpec {
  return CARS.find((c) => c.id === id) ?? CARS[0];
}

/** Display ratings 0..1 for the menu. */
export function carRatings(c: CarSpec) {
  const norm = (v: number, lo: number, hi: number) => Math.max(0.1, Math.min(1, (v - lo) / (hi - lo)));
  const off = c.class === 'offroad';
  return {
    speed: off ? norm(c.topSpeed, 56, 74) : norm(c.topSpeed, 70, 96),
    accel: norm(c.accel, 7, 11.5),
    handling: norm(c.grip + c.steer * 5, 13, 18.6),
    brakes: norm(c.brake, 12, 18),
  };
}
