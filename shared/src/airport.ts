/**
 * The airport ("Flughafen"): one shared layout for two tracks, the road race `flughafen` and the kart
 * race `flughafen-kart`. Loosely inspired by Zurich airport (a long north–south runway with a parallel
 * taxiway, a crossing east–west runway in the north, docks and the terminal west of the runway, the
 * tower between them, hangars in the south-west and a taxiway bridge over a service road), but not to
 * scale and without any names or logos.
 *
 * Coordinates in metres, x east, z north, everything flat at height 0. Both tracks use the same world;
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

/** Runway 14/32 (diagonal, heading 140°): from its north-west end, crossing 10/28 at about (-788, 1350). */
const R14 = { x: -1250, z: 1900, len: 1700, heading: (140 * Math.PI) / 180 };
const on14 = (s: number, w?: number) => {
  const p = [R14.x + Math.sin(R14.heading) * s, R14.z + Math.cos(R14.heading) * s, 0];
  return w ? [...p, w] : p;
};
/** where 14/32 crosses 10/28 (z = 1350), in metres from the north-west end of 14/32 */
const S_CROSS = (R14.z - 1350) / -Math.cos(R14.heading);

/**
 * Road race over the three crossing runways (like Zurich): north on the long runway 16/34, left onto
 * the crossing runway 10/28, a hairpin onto the diagonal runway 14/32, south-east on it, then onto the
 * taxiways: a loop over the apron in front of the docks with four 90° corners, south on taxiway "W"
 * and back east onto 16/34. [x, z, height, width?]
 */
export const FLUGHAFEN_POINTS: number[][] = [
  [0, 200, 0, 22], [0, 600, 0, 22], [0, 1000, 0, 22], [0, 1200, 0, 22],
  // 90° left onto runway 10/28
  [-6, 1300, 0, 20], [-35, 1342, 0, 18], [-100, 1350, 0, 18],
  [-300, 1350, 0, 18], [-500, 1350, 0, 18], [-650, 1350, 0, 17],
  // hairpin onto runway 14/32 (just before the runways cross)
  [-724.2, 1350, 0, 15], [-740.1, 1345.4, 0, 15], [-751.4, 1332.7, 0, 15], [-754, 1316.3, 0, 15], [-747.4, 1301, 0, 15],
  // south-east on 14/32
  on14(S_CROSS + 150, 18), on14(S_CROSS + 400, 18), on14(S_CROSS + 650, 18), on14(S_CROSS + 760, 16),
  // right onto taxiway "W" (x = -200)
  [-223.5, 676.7, 0, 14], [-203, 640, 0, 13], [-200, 600, 0],
  // loop over the apron: 90° right, 90° left, 90° left, 90° right
  [-200, 520, 0], [-202, 455, 0], [-218, 436, 0], [-245, 430, 0], [-330, 430, 0],
  [-410, 430, 0], [-437, 425, 0], [-449, 408, 0], [-450, 380, 0], [-450, 300, 0],
  [-450, 210, 0], [-448, 182, 0], [-433, 160, 0], [-410, 150, 0], [-330, 150, 0],
  [-245, 150, 0], [-218, 144, 0], [-202, 125, 0], [-200, 90, 0],
  // south on taxiway "W", 90° left onto the link taxiway, 90° left onto 16/34
  [-200, -50, 0], [-200, -200, 0], [-200, -350, 0], [-198, -410, 0], [-185, -438, 0], [-160, -450, 0],
  [-100, -450, 0], [-40, -450, 0, 15], [-12, -440, 0, 18], [0, -412, 0, 20], [0, -330, 0, 22], [0, -150, 0, 22],
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
    { name: '16/34', x1: 0, z1: -1600, x2: 0, z2: 1600, width: 60 },
    // crossing runway (east–west): crosses 16/34 and 14/32
    { name: '10/28', x1: -1300, z1: 1350, x2: 700, z2: 1350, width: 50 },
    // diagonal runway north-west of the docks
    { name: '14/32', x1: R14.x, z1: R14.z, x2: on14(R14.len)[0], z2: on14(R14.len)[1], width: 50 },
  ],
  taxiways: [
    // parallel taxiway east of the main runway
    { x1: 262, z1: -1450, x2: 262, z2: 1350, width: 23 },
    // taxiways west of the main runway (kart race)
    { x1: -312, z1: -1250, x2: -312, z2: -104, width: 23 },
    { x1: -1000, z1: -104, x2: 0, z2: -104, width: 23 },
    { x1: -900, z1: -1145, x2: 0, z2: -1145, width: 23 },
    { x1: -392, z1: -1145, x2: -392, z2: -580, width: 20 },
    { x1: -900, z1: -580, x2: -312, z2: -580, width: 20 },
    // rapid exits and links to the crossing runway
    { x1: 0, z1: 1200, x2: 262, z2: 1300, width: 23 },
    { x1: 0, z1: -1200, x2: 262, z2: -1300, width: 23 },
    // taxiway "W" from the crossing runway down to the southern link (road race)
    { x1: -200, z1: -450, x2: -200, z2: 1350, width: 23 },
    { x1: -200, z1: -450, x2: 0, z2: -450, width: 23 },
    // taxiway north of the crossing runway with the northern apron
    { x1: -1000, z1: 1420, x2: 0, z2: 1420, width: 23 },
    // service road east (road race) – the taxiway bridge spans it
    { x1: 450, z1: 30, x2: 450, z2: 680, width: 16 },
  ],
  aprons: [
    { x: -560, z: 190, w: 600, d: 560 },
    { x: -720, z: -760, w: 420, d: 200 },
    // northern apron (remote stands) and the cargo apron east of the runway
    { x: -400, z: 1490, w: 460, d: 110 },
    { x: 470, z: -700, w: 260, d: 300 },
  ],
  terminal: { x: -960, z: 190, w: 110, d: 520 },
  docks: [
    { name: 'Dock A', x: -620, z: 260, w: 40, d: 360 },
    { name: 'Dock B', x: -420, z: 20, w: 260, d: 36 },
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
  bridge: { x: 452, z: 315, length: 120, width: 40, heading: Math.PI / 2 },
  planes: [
    // Dock A, west and east side, noses at the pier (heading = where the nose points)
    { x: -646, z: 140, heading: Math.PI / 2, livery: 0 },
    { x: -646, z: 240, heading: Math.PI / 2, livery: 1 },
    { x: -646, z: 340, heading: Math.PI / 2, livery: 2 },
    { x: -594, z: 140, heading: -Math.PI / 2, livery: 3 },
    { x: -594, z: 240, heading: -Math.PI / 2, livery: 0 },
    { x: -594, z: 340, heading: -Math.PI / 2, livery: 2 },
    // Dock B, north and south side – the southern ones are seen from the kart race
    { x: -480, z: 44, heading: Math.PI, livery: 1 },
    { x: -380, z: 44, heading: Math.PI, livery: 3 },
    { x: -480, z: -4, heading: 0, livery: 0 },
    { x: -380, z: -4, heading: 0, livery: 1 },
    // remote stands on the open apron
    { x: -800, z: -20, heading: 0, livery: 2 },
    { x: -820, z: 380, heading: Math.PI / 2, livery: 3 },
    // in front of the hangars
    { x: -560, z: -700, heading: Math.PI, livery: 1 },
    { x: -760, z: -700, heading: Math.PI, livery: 0 },
    // waiting on taxiway "W", and one on the taxiway bridge
    { x: -200, z: 1240, heading: Math.PI, livery: 2 },
    { x: 470, z: 315, heading: -Math.PI / 2, livery: 3 },
    // northern apron: remote stands, noses north
    ...[-580, -500, -420, -340, -260].map((x, k) => ({ x, z: 1525, heading: 0, livery: (k + 1) % 4 })),
    // cargo apron: noses towards the cargo hall in the east
    ...[-800, -720, -640].map((z, k) => ({ x: 520, z, heading: Math.PI / 2, livery: k + 1 })),
    // taxiing on the parallel taxiway, lined up on 16 (north end); departures on 28 and 14 are animated
    { x: 262, z: 450, heading: Math.PI, livery: 0 },
    { x: 262, z: -250, heading: 0, livery: 1 },
    { x: 0, z: 1570, heading: Math.PI, livery: 3 },
    // holding short of 14/32 on the northern taxiway
    { x: -960, z: 1420, heading: Math.PI / 2, livery: 0 },
  ],
  windsocks: [{ x: 70, z: 1450 }, { x: -70, z: -1500 }, { x: 330, z: 0 }, { x: -1000, z: 1260 }],
  bounds: { minX: -1400, maxX: 950, minZ: -1650, maxZ: 1980 },
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

