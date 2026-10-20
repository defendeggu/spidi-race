/**
 * The airport ("Flughafen"): one shared layout for two tracks, the road race `flughafen` and the kart
 * race `flughafen-kart`. Runways and road race traced from an aerial photo of Zurich airport (the long
 * runway 16/34 with a parallel taxiway east of it, the crossing runway 10/28, the diagonal runway 14/32
 * east of 16/34, the midfield dock between them, terminal and docks south of 10/28), the kart race with
 * tower and hangars west of the southern part of 16/34; without any names or logos.
 *
 * Coordinates in metres, x east, z north – turned so that 16/34 runs along z (in reality it points 156°),
 * everything flat at height 0. Both tracks use the same world;
 * they may overlap each other (they never run at the same time) but each of them is free of crossings.
 */

/** A paved strip used as scenery: runway or taxiway from (x1, z1) to (x2, z2). */
export interface Strip {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  width: number;
}

/** A rectangle (centre, size along x and z) – buildings, aprons, docks. */
export interface Area {
  x: number;
  z: number;
  w: number;
  d: number;
}

/** A parked aircraft: nose position, heading (radians, forward = (sin, cos)) and livery variant 0–3. */
export interface ParkedPlane {
  x: number;
  z: number;
  heading: number;
  livery: number;
}

export interface AirportLayout {
  runways: (Strip & { name: string })[];
  taxiways: Strip[];
  /** concrete aprons in front of the docks and hangars */
  aprons: Area[];
  terminal: Area;
  /** pier buildings ("Dock A", "Dock B") with gates on both long sides */
  docks: (Area & { name: string })[];
  hangars: (Area & { facing: number })[];
  tower: { x: number; z: number };
  /** taxiway bridge over the service road of the road race (seen as the underpass) */
  bridge: { x: number; z: number; length: number; width: number; heading: number };
  planes: ParkedPlane[];
  windsocks: { x: number; z: number }[];
  /** extent of the whole airport (terrain must cover it) */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/** Main runway (north–south) shared by both tracks: x = 0. */
export const RUNWAY_X = 0;

/** Runway 14/32 (heading 162°, 18° east of 16/34): from its north-west end north of 16/34 to the midfield. */
const R14 = { x: 141, z: 2180, len: 2001, heading: (161.7 * Math.PI) / 180 };
const on14 = (s: number) => [R14.x + Math.sin(R14.heading) * s, R14.z + Math.cos(R14.heading) * s];

/**
 * Road race, traced from the aerial photo, clockwise: start and finish on the long diagonal runway 14/32,
 * at its south-east end right onto the taxiway, across 10/28 and right again onto the taxiway along the
 * docks, a hook into the apron (sharp left, hairpin right), diagonally north-west across 16/34 into a
 * wide loop, east over 10/28 and 16/34 right at their crossing, a jink onto the parallel taxiway, north
 * on it, over the rapid exit onto 16/34, north on the runway and through the hairpin at its end back onto
 * 14/32. [x, z, height, width?]
 */
export const FLUGHAFEN_POINTS: number[][] = [
  [407.9, 1373, 0, 22],
  // south-east on 14/32, near its end right onto the taxiway (heading 205°)
  [727.2, 407.5, 0, 22], [746, 350.5, 0, 22], [750.4, 332.9, 0, 22], [752.1, 314.9, 0, 16], [751, 296.8, 0, 16],
  [747.3, 279.1, 0, 16], [740.9, 262.1, 0, 16], [715.5, 207.7, 0, 16],
  // across 10/28, 90° right onto the taxiway along the docks (heading 295°)
  [619, 0.6, 0, 14], [593.6, -53.7, 0, 14], [583.2, -67.9, 0, 14], [568.3, -77, 0, 14], [551, -79.7, 0, 14],
  [533.9, -75.6, 0, 14], [479.4, -50.4, 0, 14],
  // the hook into the apron: sharp left, then a hairpin right
  [261.9, 50.1, 0, 13], [207.4, 75.3, 0, 13], [187.1, 77.5, 0, 13], [169.5, 66.8, 0, 13], [162.1, 47.8, 0, 13],
  [157.7, -43.2, 0, 14], [149.7, -60.8, 0, 14], [131.8, -68, 0, 14], [113.8, -60.8, 0, 14], [70.3, -19.4, 0, 14],
  // north-west across 16/34, the wide loop round to the east
  [-167.1, 206.7, 0, 15], [-210.5, 248.1, 0, 15], [-224.4, 264.7, 0, 15], [-234.1, 284, 0, 15], [-239.3, 305, 0, 15],
  [-239.5, 326.6, 0, 15], [-234.9, 347.7, 0, 15], [-225.6, 367.2, 0, 15], [-212.1, 384.1, 0, 15], [-195.2, 397.5, 0, 15],
  [-175.7, 406.8, 0, 15], [-154.6, 411.4, 0, 15], [-132.9, 411.1, 0, 15],
  // east over 10/28 and 16/34 right at their crossing, a jink left-right-left onto the parallel taxiway
  [-28.6, 397.7, 0, 14], [-15.9, 398.8, 0, 14], [-4.8, 405.1, 0, 14], [32, 437.9, 0, 14], [40.7, 443.2, 0, 14],
  [50.7, 445, 0, 14], [110, 445, 0, 14], [125, 449, 0, 14], [136, 460, 0, 14], [140, 475, 0, 14], [140, 535, 0, 14],
  // north on the parallel taxiway, over the rapid exit onto 16/34
  [140, 1028.8, 0, 15], [140, 1088.8, 0, 15], [137, 1107.6, 0, 15], [128.1, 1124.6, 0, 15], [114.4, 1137.9, 0, 15],
  [25.6, 1200.1, 0, 18], [11.9, 1213.4, 0, 18], [3, 1230.4, 0, 18], [0, 1249.2, 0, 20], [0, 1309.2, 0, 20],
  // north on 16/34, bearing right at its end
  [0, 1466.7, 0, 20], [0, 1526.7, 0, 20], [1.6, 1548.5, 0, 20], [6.3, 1569.8, 0, 20], [14.1, 1590.1, 0, 20], [39.5, 1644.5, 0, 20],
  // the hairpin back onto 14/32
  [76, 1722.9, 0, 16], [101.3, 1777.3, 0, 16], [112, 1794.9, 0, 16], [126.2, 1809.7, 0, 16], [143.2, 1821.2, 0, 16],
  [162.4, 1828.8, 0, 16], [182.7, 1832, 0, 16], [203.2, 1830.8, 0, 16], [223, 1825.2, 0, 16], [241.1, 1815.5, 0, 16],
  [256.7, 1802.1, 0, 16], [269.1, 1785.7, 0, 16], [277.6, 1766.9, 0, 22], [296.4, 1709.9, 0, 22],
];

/**
 * Kart race: a 0.9 km start/finish straight on the southern part of the main runway, then a fast left
 * arc into the taxiways west of it – chicane, S-bends past the docks, a tight hairpin by the tower,
 * 90° corners along the hangars – and a last left-hander back onto the runway. Narrower than the road
 * race on the taxiways, wide on the runway.
 */
export const FLUGHAFEN_KART_POINTS: number[][] = [
  [0, -700, 0, 18], [0, -460, 0, 18], [0, -340, 0, 17], [0, -250, 0, 16],
  // fast left arc onto the exit taxiway
  [-16, -160, 0, 14], [-80, -112, 0, 13], [-180, -102, 0, 12],
  // 90° left, south along taxiway "B"
  [-270, -104, 0, 12], [-306, -140, 0, 12], [-312, -215, 0, 12],
  // chicane
  [-296, -270, 0, 12], [-328, -325, 0, 12], [-312, -382, 0, 12],
  [-312, -450, 0, 12],
  // 90° right, west along the apron road, S-bends
  [-334, -500, 0, 12], [-400, -510, 0, 12], [-455, -496, 0, 12], [-510, -520, 0, 12], [-550, -506, 0, 12],
  // tight hairpin by the tower
  [-578, -508, 0, 13], [-600, -524, 0, 13], [-602, -548, 0, 13], [-578, -566, 0, 13],
  // back east, 90° right, south along the hangars
  [-510, -576, 0, 12], [-450, -584, 0, 12], [-404, -620, 0, 12], [-392, -690, 0, 12], [-392, -830, 0, 12],
  // 90° right, west, 90° left, south
  [-412, -880, 0, 12], [-480, -892, 0, 12], [-560, -900, 0, 12], [-596, -935, 0, 12], [-600, -1040, 0, 12],
  // 90° left, east along the southern taxiway
  [-580, -1110, 0, 12], [-520, -1140, 0, 12], [-330, -1145, 0, 12], [-190, -1145, 0, 13],
  // last left-hander back onto the runway
  [-70, -1142, 0, 15], [-14, -1118, 0, 17], [0, -1065, 0, 18], [0, -950, 0, 18],
];

export const AIRPORT: AirportLayout = {
  runways: [
    { name: '16/34', x1: 0, z1: -1600, x2: 0, z2: 1650, width: 60 },
    // crossing runway (heading 120°): crosses 16/34 at (0, 345)
    { name: '10/28', x1: -522, z1: 637, x2: 924, z2: -183, width: 50 },
    // diagonal runway east of 16/34, ends north of 10/28
    { name: '14/32', x1: R14.x, z1: R14.z, x2: on14(R14.len)[0], z2: on14(R14.len)[1], width: 50 },
  ],
  taxiways: [
    // parallel taxiway east of the main runway (road race in the north) with links at both ends
    { x1: 140, z1: -1450, x2: 140, z2: 1600, width: 23 },
    { x1: 0, z1: -1500, x2: 140, z2: -1450, width: 23 },
    { x1: 0, z1: 1600, x2: 140, z2: 1600, width: 23 },
    // rapid exit from 16/34 (road race)
    { x1: 140, z1: 1120, x2: 0, z2: 1218, width: 23 },
    // road race: from the end of 14/32 south across 10/28, along the docks, the hook into the apron
    { x1: 761, z1: 305, x2: 575, z2: -94, width: 23 },
    { x1: 700, z1: -152, x2: 0, z2: 171, width: 23 },
    { x1: 164, z1: 95, x2: 155, z2: -100, width: 23 },
    // to the midfield dock
    { x1: 0, z1: 445, x2: 680, z2: 445, width: 23 },
    // taxiways west of the main runway (kart race)
    { x1: -312, z1: -1250, x2: -312, z2: -104, width: 23 },
    { x1: -1000, z1: -104, x2: 0, z2: -104, width: 23 },
    { x1: -900, z1: -1145, x2: 0, z2: -1145, width: 23 },
    { x1: -392, z1: -1145, x2: -392, z2: -580, width: 20 },
    { x1: -900, z1: -580, x2: -312, z2: -580, width: 20 },
    // taxiway west of 16/34 with the northern apron
    { x1: -1000, z1: 1420, x2: 0, z2: 1420, width: 23 },
    // service road under the taxiway bridge
    { x1: 20, z1: -1000, x2: 900, z2: -1000, width: 16 },
  ],
  aprons: [
    // apron west (remote stands), midfield apron at Dock E, apron in front of the terminal, at the hangars
    { x: -680, z: 110, w: 400, d: 300 },
    { x: 420, z: 520, w: 440, d: 170 },
    { x: 450, z: -260, w: 500, d: 260 },
    { x: -720, z: -760, w: 420, d: 200 },
    // northern apron (remote stands) and the cargo apron east of the runway
    { x: -400, z: 1490, w: 460, d: 110 },
    { x: 470, z: -700, w: 260, d: 300 },
  ],
  terminal: { x: 450, z: -430, w: 420, d: 60 },
  docks: [
    // two piers north of the terminal and the midfield dock between 16/34 and 14/32
    { name: 'Dock A', x: 330, z: -300, w: 36, d: 200 },
    { name: 'Dock B', x: 560, z: -300, w: 36, d: 200 },
    { name: 'Dock E', x: 420, z: 520, w: 320, d: 36 },
  ],
  hangars: [
    { x: -560, z: -760, w: 110, d: 70, facing: 0 },
    { x: -760, z: -760, w: 110, d: 70, facing: 0 },
    { x: -500, z: -1230, w: 120, d: 80, facing: Math.PI },
    { x: -700, z: -1230, w: 120, d: 80, facing: Math.PI },
    // cargo hall at the cargo apron, doors to the west (w, d are world x, z)
    { x: 650, z: -720, w: 70, d: 150, facing: -Math.PI / 2 },
  ],
  tower: { x: -655, z: -540 },
  // the parallel taxiway crosses the service road on a bridge
  bridge: { x: 140, z: -1000, length: 120, width: 40, heading: 0 },
  planes: [
    // Dock A and Dock B, both sides, noses at the pier (heading = where the nose points)
    ...[-340, -250].flatMap((z, k) => [
      { x: 306, z, heading: Math.PI / 2, livery: k },
      { x: 354, z, heading: -Math.PI / 2, livery: k + 1 },
      { x: 536, z, heading: Math.PI / 2, livery: k + 2 },
      { x: 584, z, heading: -Math.PI / 2, livery: k + 3 },
    ]),
    // Dock E, south and north side
    ...[300, 380, 460, 540].flatMap((x, k) => [
      { x, z: 496, heading: 0, livery: k },
      { x, z: 544, heading: Math.PI, livery: k + 2 },
    ]),
    // remote stands on the apron west
    ...[-800, -700, -600].map((x, k) => ({ x, z: 60, heading: 0, livery: k + 1 })),
    // in front of the hangars
    { x: -560, z: -700, heading: Math.PI, livery: 1 },
    { x: -760, z: -700, heading: Math.PI, livery: 0 },
    // on the taxiway bridge
    { x: 140, z: -985, heading: 0, livery: 3 },
    // northern apron: remote stands, noses north
    ...[-580, -500, -420, -340, -260].map((x, k) => ({ x, z: 1525, heading: 0, livery: (k + 1) % 4 })),
    // cargo apron: noses towards the cargo hall in the east
    ...[-800, -720, -640].map((z, k) => ({ x: 520, z, heading: Math.PI / 2, livery: k + 1 })),
    // taxiing on the parallel taxiway (the departures are animated)
    { x: 140, z: -600, heading: 0, livery: 0 },
    { x: 140, z: 1450, heading: Math.PI, livery: 2 },
    // holding short of 16/34 on the northern taxiway
    { x: -80, z: 1420, heading: Math.PI / 2, livery: 0 },
  ],
  windsocks: [{ x: 60, z: 1450 }, { x: -70, z: -1500 }, { x: 330, z: 250 }, { x: -560, z: 720 }],
  bounds: { minX: -1400, maxX: 1000, minZ: -1650, maxZ: 2260 },
};

/** True if (x, z) lies on the paved strip (with an extra margin around it). */
export function onStrip(s: Strip, x: number, z: number, margin = 0) {
  const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
  const tx = (s.x2 - s.x1) / len, tz = (s.z2 - s.z1) / len;
  const dx = x - s.x1, dz = z - s.z1;
  const t = dx * tx + dz * tz;
  return t > -margin && t < len + margin && Math.abs(-dx * tz + dz * tx) < s.width / 2 + margin;
}

/** True on any of the three runways. */
export const onRunwayStrip = (x: number, z: number) => AIRPORT.runways.some((r) => onStrip(r, x, z));

