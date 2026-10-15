import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

const BASE = `${import.meta.env.BASE_URL}cc0/`;

export const CAR_MODELS = [
  'sedan-sports', 'race-future', 'race', 'hatchback-sports', 'suv', 'suv-luxury', 'truck',
  'sedan', 'taxi', 'police', 'firetruck', 'van', 'delivery',
  'kart-oobi', 'kart-oodi', 'kart-ooli', 'kart-oopi', 'kart-oozi',
  'debris-bolt', 'debris-tire', 'debris-plate-small-a', 'debris-spoiler-a', 'debris-door',
];
export const NATURE_MODELS = [
  'tree_pineTallA', 'tree_pineTallB', 'tree_pineDefaultA', 'tree_pineRoundA', 'tree_pineSmallA',
  'tree_oak', 'tree_default', 'tree_fat', 'tree_thin', 'tree_palmTall', 'tree_palmBend',
  'rock_largeA', 'rock_largeB', 'rock_largeC', 'rock_tallA', 'stone_tallA', 'plant_bushLarge',
  'cactus_short', 'cactus_tall', 'cliff_large_rock', 'log', 'log_large', 'log_stack', 'stump_old', 'stump_round',
  'mushroom_redGroup', 'mushroom_tanGroup', 'tent_detailedOpen', 'campfire_logs', 'fence_simple',
];
export const BUILDING_MODELS = 'abcdefghijklmnopqrstu'.split('').map((c) => `building-type-${c}`);
/** City Kit Industrial (registered with prefix 'ind-' because names clash with the commercial kit) */
export const INDUSTRIAL_MODELS = [
  ...'abcdefghijklmnopqrst'.split('').map((c) => `building-${c}`),
  'chimney-large', 'chimney-medium', 'chimney-small', 'detail-tank-large', 'detail-tank',
  'shipping-container-a', 'shipping-container-b', 'shipping-container-c', 'water-tower', 'windmill', 'solar-panel-landscape-group',
];
/** Fantasy Town Kit parts (prefix 'fan-') */
export const FANTASY_MODELS = [
  'wall', 'wall-wood', 'wall-window-shutters', 'wall-wood-window-shutters', 'wall-window-glass', 'wall-wood-window-glass',
  'wall-door', 'wall-wood-door', 'wall-doorway-round', 'wall-detail-cross', 'wall-wood-detail-cross', 'roof', 'roof-gable',
  'roof-high', 'roof-high-gable', 'roof-point', 'chimney', 'fountain-round-detail', 'stall-red', 'stall-green', 'lantern',
  'hedge-large', 'overhang', 'wall-window-round', 'wall-arch', 'roof-high-point',
];
/** Mini Skate (prefix 'sk-') */
export const SKATE_MODELS = [
  'rail-high', 'rail-low', 'rail-curve', 'obstacle-box', 'obstacle-box-grind', 'bench', 'benches',
  'character-skate-boy', 'character-skate-girl', 'skateboard', 'pallet', 'scooter',
];
/** Watercraft Kit (prefix 'wc-') */
export const WATERCRAFT_MODELS = [
  'ship-cargo-a', 'ship-cargo-b', 'boat-tug-a', 'boat-fishing-small', 'boat-sail-a', 'boat-sail-b', 'boat-house-a',
  'boat-house-b', 'boat-speed-a', 'boat-row-small', 'cargo-container-a', 'cargo-container-b', 'cargo-container-c',
  'cargo-pile-a', 'cargo-pile-b', 'buoy', 'buoy-flag',
];
/** Train Kit (prefix 'tr-') */
export const TRAIN_MODELS = [
  'train-electric-city-a', 'train-electric-city-b', 'train-electric-city-c', 'train-locomotive-a',
  'train-carriage-container-blue', 'train-carriage-container-red', 'train-carriage-container-green', 'train-carriage-tank',
];
/** Graveyard Kit (prefix 'gy-') */
export const GRAVEYARD_MODELS = [
  'gravestone-cross', 'gravestone-round', 'gravestone-bevel', 'gravestone-wide', 'gravestone-roof', 'gravestone-decorative',
  'grave', 'grave-border', 'crypt', 'crypt-small', 'iron-fence', 'iron-fence-border-gate', 'iron-fence-border-column',
  'lightpost-single', 'lightpost-double', 'pine', 'pine-crooked', 'bench', 'urn-round', 'pillar-obelisk', 'cross-column',
];
/** Blaster Kit (prefix 'bl-') */
export const BLASTER_MODELS = ['blaster-a', 'blaster-d', 'blaster-h', 'blaster-l', 'bullet-foam', 'bullet-foam-thick', 'grenade-a', 'grenade-b', 'crate-small'];
/** Retro Urban Kit parts (prefix 'ret-') */
export const RETRO_MODELS = [
  'wall-a-flat', 'wall-a-flat-window', 'wall-a-flat-painted', 'wall-a-flat-garage', 'wall-b-flat', 'wall-b-flat-window',
  'detail-awning-wide', 'detail-bench', 'detail-dumpster-closed',
];
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
  const addModel = (dir: string, name: string, prefix = '') =>
    jobs.push(async () => {
      const gltf: GLTF = await loader.loadAsync(`${BASE}${dir}/${name}.glb`);
      gltf.scene.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.userData.shared = true;
      });
      models.set(prefix + name, gltf.scene);
    });
  CAR_MODELS.forEach((m) => addModel('cars', m));
  NATURE_MODELS.forEach((m) => addModel('nature', m));
  BUILDING_MODELS.forEach((m) => addModel('buildings', m));
  CITY_MODELS.forEach((m) => addModel('city', m));
  INDUSTRIAL_MODELS.forEach((m) => addModel('industrial', m, 'ind-'));
  FANTASY_MODELS.forEach((m) => addModel('fantasy', m, 'fan-'));
  RETRO_MODELS.forEach((m) => addModel('retro', m, 'ret-'));
  SKATE_MODELS.forEach((m) => addModel('skate', m, 'sk-'));
  WATERCRAFT_MODELS.forEach((m) => addModel('watercraft', m, 'wc-'));
  TRAIN_MODELS.forEach((m) => addModel('train', m, 'tr-'));
  GRAVEYARD_MODELS.forEach((m) => addModel('graveyard', m, 'gy-'));
  BLASTER_MODELS.forEach((m) => addModel('blaster', m, 'bl-'));
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
