import * as THREE from 'three';
import { getTrack, type Track, type TrackTheme } from '@spidi/shared';
import { breakfastScenery, kitchenRoom } from './breakfast';
import { buildScenery } from './scenery';
import { buildTerrain } from './terrain';
import { buildTrackMesh } from './trackMesh';

export interface World {
  track: Track;
  scene: THREE.Scene;
  /** container for cars and other per-race objects */
  dynamic: THREE.Group;
  sun: THREE.DirectionalLight;
}

export const THEMES: Record<TrackTheme, { skyTop: string; horizon: string; fog: string; sun: string; ground: string; fogFar: number }> = {
  alpine: { skyTop: '#3b77c4', horizon: '#cfe1ef', fog: '#c8dbe9', sun: '#fff3dc', ground: '#4c6b3a', fogFar: 1500 },
  coast: { skyTop: '#2f86d1', horizon: '#f2e7d2', fog: '#e9e3d4', sun: '#fff0d0', ground: '#7d8b4a', fogFar: 1700 },
  city: { skyTop: '#4a6fa8', horizon: '#f0d6b8', fog: '#d9cbbb', sun: '#ffe2b8', ground: '#6b6b66', fogFar: 1300 },
  speedway: { skyTop: '#2a7fd8', horizon: '#dceaf5', fog: '#d4e4f0', sun: '#fff6e0', ground: '#5f8a3c', fogFar: 2600 },
  desert: { skyTop: '#3d7cc9', horizon: '#f3d6a8', fog: '#e8c9a0', sun: '#fff1d6', ground: '#b0603a', fogFar: 1400 },
  forest: { skyTop: '#4f7fb5', horizon: '#c9d9c0', fog: '#b4c6ac', sun: '#fff4dc', ground: '#3f5a2e', fogFar: 850 },
  table: { skyTop: '#e9dcc8', horizon: '#f5ead8', fog: '#efe3cf', sun: '#fff1d8', ground: '#a87a4f', fogFar: 1100 },
};

export function sky(top: string, horizon: string) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color(top) }, horizon: { value: new THREE.Color(horizon) } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 vDir;
      void main(){ float h = clamp(vDir.y, 0.0, 1.0); vec3 c = mix(horizon, top, pow(h, 0.55));
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(4000, 24, 12), mat);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return mesh;
}

const cache = new Map<string, World>();

export function getWorld(trackId: string): World {
  let w = cache.get(trackId);
  if (w) return w;
  const track = getTrack(trackId);
  const theme = THEMES[track.def.theme];
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(theme.horizon);
  scene.fog = new THREE.Fog(theme.fog, 200, theme.fogFar);

  const skyMesh = sky(theme.skyTop, theme.horizon);
  const b = track.bounds;
  skyMesh.position.set((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
  scene.add(skyMesh);
  scene.add(new THREE.HemisphereLight('#dfefff', theme.ground, 1.4));
  const sun = new THREE.DirectionalLight(theme.sun, 2.2);
  sun.position.set(-300, 500, -200);
  scene.add(sun);

  const terrain = buildTerrain(track);
  scene.add(buildTrackMesh(track));
  if (track.def.theme === 'table') {
    // micro track: a kitchen table instead of a landscape
    scene.add(kitchenRoom(track));
    scene.add(breakfastScenery(track, terrain));
  } else {
    scene.add(terrain.mesh);
    scene.add(buildScenery(track, terrain));
  }

  if (track.def.theme === 'coast') {
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(9000, 9000),
      new THREE.MeshPhongMaterial({ color: '#2c7fae', shininess: 90, specular: '#9fd3ff', transparent: true, opacity: 0.92 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0;
    scene.add(water);
  }

  const dynamic = new THREE.Group();
  scene.add(dynamic);
  w = { track, scene, dynamic, sun };
  cache.set(trackId, w);
  return w;
}
