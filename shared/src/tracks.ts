import { Track, type TrackDef } from './track';

/**
 * Superspeedway oval built from a curvature profile: straight, clothoid (curvature ramps up),
 * constant-radius turn, clothoid back to straight – so there is no sudden tight spot at the turn-in.
 */
function speedwayOval(straight: number, radius: number, transition: number): number[][] {
  const k = 1 / radius;
  const arc = Math.PI * radius - transition;
  const half: [number, (s: number) => number][] = [
    [straight, () => 0],
    [transition, (s) => (k * s) / transition],
    [arc, () => k],
    [transition, (s) => k * (1 - s / transition)],
  ];
  const segs = [...half, ...half];
  const step = 25;
  const pts: number[][] = [];
  let x = -straight / 2, z = 0, h = Math.PI / 2;
  for (const [len, curv] of segs) {
    const n = Math.round(len / step);
    const ds = len / n;
    for (let i = 0; i < n; i++) {
      pts.push([x, z, 0]);
      // midpoint integration; positive curvature turns left (heading increases)
      const hm = h + (curv(i * ds) * ds) / 2;
      x += Math.sin(hm) * ds;
      z += Math.cos(hm) * ds;
      h += curv((i + 0.5) * ds) * ds;
    }
  }
  return pts;
}

export const TRACK_DEFS: TrackDef[] = [
  {
    id: 'alpenpass',
    name: 'Alpenpass',
    description: 'Serpentinen hinauf zum Pass, durch die Lawinengalerie und in schnellen Kurven zurück ins Tal.',
    theme: 'alpine',
    width: 11,
    defaultLaps: 2,
    seed: 7,
    points: [
      [0, 0, 0],
      [200, 0, 0],
      [380, 20, 4],
      [480, 90, 10],
      [500, 200, 18],
      [440, 262, 24],
      [300, 272, 32],
      [214, 300, 36, 14],
      [228, 352, 40, 14],
      [360, 372, 48],
      [462, 392, 54, 14],
      [472, 444, 58, 14],
      [380, 472, 64],
      [240, 482, 70],
      [60, 470, 72],
      [-80, 430, 68],
      [-180, 340, 56],
      [-170, 230, 42],
      [-240, 140, 30],
      [-200, 50, 14],
      [-110, 0, 4],
    ],
    galleries: [[13.1, 13.9, 1]],
  },
  {
    id: 'kuestenstrasse',
    name: 'Küstenstrasse',
    description: 'Lange Vollgas-Geraden durchs Fischerdorf und schnelle Kurven hoch über dem Meer.',
    theme: 'coast',
    width: 13,
    defaultLaps: 2,
    seed: 23,
    points: [
      [0, 0, 12],
      [300, 10, 12],
      [600, -10, 14],
      [850, 30, 16],
      [1000, 120, 16],
      [1010, 250, 11],
      [900, 320, 8],
      [700, 300, 9],
      [520, 345, 11],
      [330, 310, 13],
      [160, 345, 11],
      [0, 325, 9],
      [-160, 270, 8],
      [-250, 160, 11],
      [-220, 60, 13],
      [-120, 5, 12],
    ],
    galleries: [[12.25, 12.85, -1]],
  },
  {
    id: 'downtown',
    name: 'Downtown',
    description: 'Stadtkurs zwischen Hochhäusern: enge 90°-Ecken, Schikane und eine Unterführung.',
    theme: 'city',
    width: 12,
    defaultLaps: 3,
    seed: 41,
    points: [
      [0, 0, 2, 14],
      [320, 0, 2, 14],
      [380, 8, 2],
      [392, 60, 3],
      [392, 220, 5],
      [400, 262, 5],
      [450, 272, 5],
      [560, 272, 4],
      [598, 290, 4],
      [606, 340, 3],
      [590, 380, 3],
      [540, 392, 2],
      [300, 392, 1],
      [250, 400, 1],
      [220, 420, 1],
      [180, 425, 1],
      [60, 425, 2],
      [10, 410, 2],
      [-8, 370, 3],
      [-8, 230, 4],
      [-30, 190, 4],
      [-60, 170, 4],
      [-90, 140, 3],
      [-95, 90, 3],
      [-80, 30, 2],
      [-40, 4, 2],
    ],
    galleries: [[11.3, 11.8, 1]],
  },
  {
    id: 'speedway',
    name: 'Speedway',
    description: 'Riesiges Superspeedway-Oval mit Steilkurven – fast permanent Vollgas mit über 280 km/h.',
    theme: 'speedway',
    width: 18,
    defaultLaps: 3,
    seed: 59,
    points: speedwayOval(900, 520, 200),
    banking: { gain: 160, max: 0.3 },
  },
  {
    id: 'canyon',
    name: 'Canyon Run',
    description: 'Offroad: Schotter und Sand durch eine rote Schlucht – drei Sprünge, einer über ein ausgetrocknetes Flussbett.',
    theme: 'desert',
    class: 'offroad',
    width: 14,
    defaultLaps: 2,
    seed: 71,
    surface: 'dirt',
    surfaces: [[4.2, 4.9, 'sand'], [5.6, 7.6, 'sand'], [13, 14.5, 'sand']],
    points: [
      [0, 0, 10], [250, 0, 10], [420, 40, 14], [520, 140, 18], [540, 300, 20], [520, 520, 16],
      [430, 620, 12], [280, 640, 10], [150, 590, 12], [60, 480, 16], [-60, 440, 18], [-200, 480, 14],
      [-320, 420, 10], [-360, 280, 8], [-300, 140, 8], [-200, 40, 9], [-100, 0, 10],
    ],
    jumps: [
      { u: 0.3, up: 14, height: 1.8, land: 40 },
      { u: 4.3, up: 16, height: 2.2, gap: 22, depth: 3, land: 45 },
      { u: 10.25, up: 12, height: 1.5, land: 35 },
    ],
    galleries: [[12.3, 12.7, 1]],
  },
  {
    id: 'waldtrail',
    name: 'Waldtrail',
    description: 'Offroad: Waldweg über Kuppen, durch Schlammlöcher und eine Furt – mit Sprung über den Bach.',
    theme: 'forest',
    class: 'offroad',
    width: 12,
    defaultLaps: 2,
    seed: 83,
    surface: 'dirt',
    surfaces: [[5.3, 5.7, 'mud'], [8.45, 8.6, 'water'], [12.4, 12.7, 'mud']],
    points: [
      [0, 0, 20], [200, 10, 22], [330, 60, 26], [380, 170, 30], [340, 280, 26], [240, 330, 22],
      [120, 320, 20], [40, 380, 18], [60, 500, 16], [180, 580, 18], [320, 600, 22], [440, 560, 26],
      [520, 460, 24], [560, 320, 22], [560, 160, 20], [500, 40, 18], [420, -60, 16], [250, -120, 16],
      [60, -110, 18], [-60, -60, 19],
    ],
    jumps: [
      { u: 0.35, up: 12, height: 1.6, land: 30 },
      { u: 9.3, up: 14, height: 1.8, gap: 16, depth: 2.5, land: 40 },
      { u: 17.3, up: 12, height: 1.6, land: 35 },
    ],
  },
  {
    // built at ~1:100 – 1 m in the game is 1 cm on the real table
    id: 'fruehstueck',
    name: 'Frühstückstisch',
    description: 'Micro: Spielzeugautos zwischen Müslischale, Kaffeetasse und Croissant – enge Haarnadeln über den Küchentisch.',
    theme: 'table',
    class: 'micro',
    camera: 'topdown',
    width: 10,
    defaultLaps: 3,
    seed: 97,
    points: [
      [0, 0, 0], [70, 0, 0], [140, 0, 0], [185, 8, 0], [208, 35, 0], [214, 75, 0], [206, 112, 0], [185, 134, 0],
      [150, 142, 0], [122, 130, 0], [96, 144, 0], [66, 134, 0], [36, 138, 0], [12, 124, 0], [14, 100, 0], [50, 96, 0],
      [98, 98, 0], [126, 92, 0], [136, 74, 0], [124, 56, 0], [96, 52, 0], [55, 55, 0], [20, 52, 0], [-10, 42, 0],
      [-22, 20, 0], [-14, 4, 0],
    ],
  },
];

const cache = new Map<string, Track>();

export function getTrack(id: string): Track {
  let t = cache.get(id);
  if (!t) {
    const def = TRACK_DEFS.find((d) => d.id === id) ?? TRACK_DEFS[0];
    t = new Track(def);
    cache.set(id, t);
    cache.set(def.id, t);
  }
  return t;
}
