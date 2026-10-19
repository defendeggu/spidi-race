import * as THREE from 'three';
import type { Track } from '@spidi/shared';
import type { Terrain } from './terrain';

/** Scenery of the airport (shared by the road race and the kart race). */
export function buildAirportScenery(_track: Track, _terrain: Terrain): THREE.Group {
  return new THREE.Group();
}
