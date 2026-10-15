import { TRACK_DEFS, type CarClass, type LobbyPlayer, type TownTask } from '@spidi/shared';

/** a player's preferences: carId is the road car, offroadCarId / microCarId / townCarId the cars of the other classes */
export type PlayerPref = LobbyPlayer & { offroadCarId?: string; microCarId?: string; townCarId?: string; kartCarId?: string };

/** the preference field holding the player's car for each class */
export const CAR_PREF = { road: 'carId', offroad: 'offroadCarId', micro: 'microCarId', town: 'townCarId', kart: 'kartCarId' } as const satisfies Record<CarClass, keyof PlayerPref>;

export type TrafficLevel = 'off' | 'few' | 'many';

export interface Prefs {
  players: PlayerPref[];
  trackId: string;
  laps: number;
  aiCount: number;
  aiSkill: number;
  onlineLocal: number;
  /** practice town: players (1/2), task and traffic level */
  townPlayers: number;
  townTask: TownTask;
  townTraffic: TrafficLevel;
  /** goals of a solo run (5 / 10 / 20) */
  townGoals: number;
  /** kart race: players (1/2) and track (road and offroad tracks only) */
  kartPlayers: number;
  kartTrackId: string;
  /** kart race on a track or battle in the town, and the number of battle bots */
  kartMode: 'race' | 'battle';
  kartBots: number;
}

export const TRAFFIC: { id: TrafficLevel; label: string; cars: number }[] = [
  { id: 'off', label: 'Kein Verkehr', cars: 0 },
  { id: 'few', label: 'Wenig Verkehr', cars: 10 },
  { id: 'many', label: 'Mehr Verkehr', cars: 22 },
];

export const TASKS: { id: TownTask; label: string; hint: string }[] = [
  { id: 'free', label: 'Frei fahren', hint: 'Einfach durch die Stadt fahren, ohne Ziel.' },
  { id: 'stars', label: 'Sterne sammeln', hint: 'Ein Stern auf einer Lichtsäule zeigt das Ziel, der Pfeil oben zeigt die Richtung.' },
  { id: 'parking', label: 'Einparken', hint: 'Auf dem Parkplatz leuchtet ein Feld. Gerade hineinfahren (vorwärts oder rückwärts) und kurz stehen bleiben.' },
];

export const SKILLS = [
  { v: 0.86, label: 'Leicht' },
  { v: 0.93, label: 'Mittel' },
  { v: 1.0, label: 'Schwer' },
];

const KEY = 'spidi-race-prefs';

export function loadPrefs(): Prefs {
  const def: Prefs = {
    players: [
      { name: 'Spieler 1', carId: 'falcone', offroadCarId: 'bergziege', microCarId: 'blitz', townCarId: 'familie', kartCarId: 'kart-oobi' },
      { name: 'Spieler 2', carId: 'kaito', offroadCarId: 'raider', microCarId: 'flitzer', townCarId: 'polizei', kartCarId: 'kart-ooli' },
    ],
    trackId: TRACK_DEFS[0].id, laps: 2, aiCount: 4, aiSkill: 0.93, onlineLocal: 1,
    townPlayers: 1, townTask: 'stars', townTraffic: 'few', townGoals: 10,
    kartPlayers: 1, kartTrackId: 'alpenpass', kartMode: 'race', kartBots: 3,
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...def, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return def;
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
