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

/**
 * Road race: a 2.4 km run along the main runway, a right-hand U-turn over a rapid-exit taxiway, back
 * south on the parallel taxiway east of the runway with a detour over the service road (under the
 * taxiway bridge) and a second U-turn onto the runway. [x, z, height, width?]
 */
export const FLUGHAFEN_POINTS: number[][] = [
  [0, -800, 0, 22], [0, -300, 0, 22], [0, 300, 0, 22], [0, 800, 0, 22], [0, 1000, 0, 22], [0, 1120, 0, 20],
  // U-turn north (right) over the rapid-exit taxiway
  [25, 1235, 0, 15], [100, 1305, 0, 14], [190, 1300, 0, 14], [252, 1225, 0, 14],
  // parallel taxiway south
  [262, 1050, 0], [262, 820, 0],
  // 90° left onto the service road, then 90° right
  [270, 700, 0], [310, 662, 0], [400, 655, 0], [440, 620, 0],
  // service road south, under the taxiway bridge
  [450, 520, 0], [452, 380, 0], [452, 250, 0], [450, 120, 0],
  // back west onto the taxiway: 90° right, 90° left
  [432, 70, 0], [380, 45, 0], [300, 42, 0], [266, 5, 0],
  [262, -150, 0], [262, -500, 0], [262, -850, 0], [262, -1080, 0],
  // U-turn south (right) onto the runway
  [245, -1200, 0, 14], [180, -1280, 0, 14], [80, -1290, 0, 15], [15, -1225, 0, 20], [0, -1110, 0, 22], [0, -980, 0, 22],
];

/** u range (control-point units) of the underpass below the taxiway bridge on the road race. */
export const FLUGHAFEN_UNDERPASS: [number, number] = [17.35, 17.75];

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
    // crossing runway in the north (east–west), only scenery
    { name: '10/28', x1: -1300, z1: 1750, x2: 900, z2: 1750, width: 50 },
  ],
  taxiways: [
    // parallel taxiway east of the main runway
    { x1: 262, z1: -1450, x2: 262, z2: 1450, width: 23 },
    // taxiways west of the main runway (kart race)
    { x1: -312, z1: -1250, x2: -312, z2: -104, width: 23 },
    { x1: -1000, z1: -104, x2: 0, z2: -104, width: 23 },
    { x1: -900, z1: -1145, x2: 0, z2: -1145, width: 23 },
    { x1: -392, z1: -1145, x2: -392, z2: -580, width: 20 },
    { x1: -900, z1: -580, x2: -312, z2: -580, width: 20 },
    // rapid exits and links to the crossing runway
    { x1: 0, z1: 1200, x2: 262, z2: 1300, width: 23 },
    { x1: 0, z1: -1200, x2: 262, z2: -1300, width: 23 },
    { x1: 262, z1: 1450, x2: 262, z2: 1750, width: 23 },
    { x1: -200, z1: -104, x2: -200, z2: 1750, width: 23 },
    // service road east (road race) – the taxiway bridge spans it
    { x1: 450, z1: 30, x2: 450, z2: 680, width: 16 },
  ],
  aprons: [
    { x: -560, z: 190, w: 600, d: 560 },
    { x: -720, z: -760, w: 420, d: 200 },
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
    // waiting on the northern taxiway, and one on the taxiway bridge
    { x: -200, z: 1200, heading: Math.PI, livery: 2 },
    { x: 470, z: 315, heading: -Math.PI / 2, livery: 3 },
  ],
  windsocks: [{ x: 70, z: 1450 }, { x: -70, z: -1500 }, { x: 330, z: 0 }],
  bounds: { minX: -1400, maxX: 950, minZ: -1650, maxZ: 1800 },
};
