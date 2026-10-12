import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

const BASE = `${import.meta.env.BASE_URL}cc0/`;

export const CAR_MODELS = ['sedan-sports', 'race-future', 'race', 'hatchback-sports', 'suv', 'suv-luxury', 'truck'];
export const NATURE_MODELS = [
  'tree_pineTallA', 'tree_pineTallB', 'tree_pineDefaultA', 'tree_pineRoundA', 'tree_pineSmallA',
  'tree_oak', 'tree_default', 'tree_fat', 'tree_thin', 'tree_palmTall', 'tree_palmBend',
  'rock_largeA', 'rock_largeB', 'rock_largeC', 'rock_tallA', 'stone_tallA', 'plant_bushLarge',
  'cactus_short', 'cactus_tall', 'cliff_large_rock', 'log', 'log_large', 'log_stack', 'stump_old', 'stump_round',
  'mushroom_redGroup', 'mushroom_tanGroup', 'tent_detailedOpen', 'campfire_logs', 'fence_simple',
];
export const BUILDING_MODELS = ['building-type-a', 'building-type-c', 'building-type-f', 'building-type-k', 'building-type-n', 'building-type-t'];
export const CITY_MODELS = [
  ...'abcdefghijklmn'.split('').map((c) => `building-${c}`),
  ...'abcde'.split('').map((c) => `building-skyscraper-${c}`),
  ...'acfhl'.split('').map((c) => `low-detail-building-${c}`),
  'low-detail-building-wide-a',
];
export const FOOD_MODELS = [
  'bowl-cereal', 'cup-saucer', 'cup-coffee', 'mug', 'plate', 'croissant', 'bread', 'egg-cup', 'carton', 'honey',
  'peanut-butter', 'utensil-knife', 'utensil-spoon', 'utensil-fork', 'cutting-board', 'pancakes', 'banana', 'apple',
  'orange', 'shaker-salt', 'donut-sprinkles', 'muffin', 'glass', 'strawberry', 'waffle',
];
export const TEXTURES = [
  'asphalt', 'grass', 'rock', 'snow', 'sand', 'gravel', 'concrete',
  'dirt', 'forestfloor', 'mud', 'dune', 'redrock', 'desertdirt', 'wood',
] as const;
export type TextureName = (typeof TEXTURES)[number];

const models = new Map<string, THREE.Group>();
const textures = new Map<TextureName, THREE.Texture>();
let colormaps: { cars: HTMLImageElement | null } = { cars: null };
let ready = false;

/** True when the CC0 assets are loaded; otherwise the procedural fallback graphics are used. */
export function assetsReady() {
  return ready;
}

export function getModel(name: string): THREE.Group | undefined {
  return models.get(name);
}

export function getTexture(name: TextureName): THREE.Texture | undefined {
  return textures.get(name);
}

export function carColormapImage() {
  return colormaps.cars;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Bild ${url} nicht gefunden`));
    img.src = url;
  });
}

/** Load all models and textures. Resolves false (and keeps the fallback) if anything is missing. */
export async function loadAssets(onProgress: (done: number, total: number) => void): Promise<boolean> {
  const loader = new GLTFLoader();
  const texLoader = new THREE.TextureLoader();
  const jobs: (() => Promise<void>)[] = [];
  const addModel = (dir: string, name: string) =>
    jobs.push(async () => {
      const gltf: GLTF = await loader.loadAsync(`${BASE}${dir}/${name}.glb`);
      gltf.scene.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.userData.shared = true;
      });
      models.set(name, gltf.scene);
    });
  CAR_MODELS.forEach((m) => addModel('cars', m));
  NATURE_MODELS.forEach((m) => addModel('nature', m));
  BUILDING_MODELS.forEach((m) => addModel('buildings', m));
  CITY_MODELS.forEach((m) => addModel('city', m));
  FOOD_MODELS.forEach((m) => addModel('food', m));
  for (const t of TEXTURES)
    jobs.push(async () => {
      const tex = await texLoader.loadAsync(`${BASE}textures/${t}.jpg`);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = 8;
      textures.set(t, tex);
    });
  jobs.push(async () => {
    colormaps.cars = await loadImage(`${BASE}cars/Textures/colormap.png`);
  });

  let done = 0;
  onProgress(0, jobs.length);
  try {
    await Promise.all(
      jobs.map((j) =>
        j().then(() => {
          done++;
          onProgress(done, jobs.length);
        }),
      ),
    );
  } catch (e) {
    console.warn('CC0-Assets konnten nicht geladen werden – nutze prozedurale Grafik.', e);
    models.clear();
    textures.clear();
    colormaps = { cars: null };
    return false;
  }
  ready = true;
  return true;
}
