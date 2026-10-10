import { Track, type TrackDef } from './track';

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
