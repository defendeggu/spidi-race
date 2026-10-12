#!/usr/bin/env node
/**
 * Downloads the CC0 asset packs (Kenney, ambientCG) and extracts only the files the game uses
 * into client/public/cc0. Run with `npm run assets`; the result is committed to the repo.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'client/public/cc0');

const KENNEY = [
  {
    name: 'Car Kit',
    page: 'https://kenney.nl/assets/car-kit',
    url: 'https://kenney.nl/media/pages/assets/car-kit/1a312ec241-1775131960/kenney_car-kit.zip',
    dir: 'Models/GLB format/',
    out: 'cars',
    files: [
      'sedan-sports.glb', 'race-future.glb', 'race.glb', 'hatchback-sports.glb', 'suv.glb', 'suv-luxury.glb', 'truck.glb',
      'sedan.glb', 'taxi.glb', 'police.glb', 'firetruck.glb', 'van.glb', 'delivery.glb', 'Textures/colormap.png',
    ],
  },
  {
    name: 'City Kit (Suburban)',
    page: 'https://kenney.nl/assets/city-kit-suburban',
    url: 'https://kenney.nl/media/pages/assets/city-kit-suburban/2c871b7af2-1745479373/kenney_city-kit-suburban_20.zip',
    dir: 'Models/GLB format/',
    out: 'buildings',
    files: ['building-type-a.glb', 'building-type-c.glb', 'building-type-f.glb', 'building-type-k.glb', 'building-type-n.glb', 'building-type-t.glb', 'Textures/colormap.png'],
  },
  {
    name: 'City Kit (Commercial)',
    page: 'https://kenney.nl/assets/city-kit-commercial',
    url: 'https://kenney.nl/media/pages/assets/city-kit-commercial/a742d900eb-1753115042/kenney_city-kit-commercial_2.1.zip',
    dir: 'Models/GLB format/',
    out: 'city',
    files: [
      ...'abcdefghijklmn'.split('').map((c) => `building-${c}.glb`),
      ...'abcde'.split('').map((c) => `building-skyscraper-${c}.glb`),
      ...'acfhl'.split('').map((c) => `low-detail-building-${c}.glb`),
      'low-detail-building-wide-a.glb',
      'Textures/colormap.png',
    ],
  },
  {
    name: 'Nature Kit',
    page: 'https://kenney.nl/assets/nature-kit',
    url: 'https://kenney.nl/media/pages/assets/nature-kit/37ac38a37b-1677698939/kenney_nature-kit.zip',
    dir: 'Models/GLTF format/',
    out: 'nature',
    files: [
      'tree_pineTallA.glb', 'tree_pineTallB.glb', 'tree_pineDefaultA.glb', 'tree_pineRoundA.glb', 'tree_pineSmallA.glb',
      'tree_oak.glb', 'tree_default.glb', 'tree_fat.glb', 'tree_thin.glb', 'tree_palmTall.glb', 'tree_palmBend.glb',
      'rock_largeA.glb', 'rock_largeB.glb', 'rock_largeC.glb', 'rock_tallA.glb', 'stone_tallA.glb', 'plant_bushLarge.glb',
      // offroad scenery
      'cactus_short.glb', 'cactus_tall.glb', 'cliff_large_rock.glb', 'log.glb', 'log_large.glb', 'log_stack.glb',
      'stump_old.glb', 'stump_round.glb', 'mushroom_redGroup.glb', 'mushroom_tanGroup.glb', 'tent_detailedOpen.glb',
      'campfire_logs.glb', 'fence_simple.glb',
    ],
  },
  {
    name: 'Food Kit',
    page: 'https://kenney.nl/assets/food-kit',
    url: 'https://kenney.nl/media/pages/assets/food-kit/83086fa91c-1719418518/kenney_food-kit.zip',
    dir: 'Models/GLB format/',
    out: 'food',
    files: [
      'bowl-cereal.glb', 'cup-saucer.glb', 'cup-coffee.glb', 'mug.glb', 'plate.glb', 'croissant.glb', 'bread.glb',
      'egg-cup.glb', 'carton.glb', 'honey.glb', 'peanut-butter.glb', 'utensil-knife.glb', 'utensil-spoon.glb',
      'utensil-fork.glb', 'cutting-board.glb', 'pancakes.glb', 'banana.glb', 'apple.glb', 'orange.glb',
      'shaker-salt.glb', 'donut-sprinkles.glb', 'muffin.glb', 'glass.glb', 'strawberry.glb', 'waffle.glb',
      'Textures/colormap.png',
    ],
  },
];

const AMBIENTCG = [
  ['Asphalt031', 'asphalt'],
  ['Grass004', 'grass'],
  ['Rock064', 'rock'],
  ['Snow010A', 'snow'],
  ['Ground080', 'sand'],
  ['Gravel043', 'gravel'],
  ['Concrete034', 'concrete'],
  ['Ground106', 'dirt'],
  ['Ground037', 'forestfloor'],
  ['Ground071', 'mud'],
  ['Ground093C', 'dune'],
  ['Rock029', 'redrock'],
  ['Ground097', 'desertdirt'],
  ['Wood049', 'wood'],
];

async function download(url) {
  process.stdout.write(`  ↓ ${url}\n`);
  const res = await fetch(url, { headers: { 'user-agent': 'spidi-race-asset-fetcher' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

function write(rel, data) {
  const p = join(OUT, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, data);
}

rmSync(OUT, { recursive: true, force: true });
const credits = [
  '# Asset-Credits',
  '',
  'Alle Grafiken in diesem Ordner stehen unter **CC0 1.0 (Public Domain)** – https://creativecommons.org/publicdomain/zero/1.0/',
  'Sie wurden mit `npm run assets` (scripts/fetch-assets.mjs) heruntergeladen. Danke an die Urheber!',
  '',
];

for (const kit of KENNEY) {
  console.log(`Kenney ${kit.name}`);
  const zip = unzipSync(await download(kit.url));
  for (const f of kit.files) {
    const data = zip[kit.dir + f];
    if (!data) throw new Error(`${f} fehlt in ${kit.name}`);
    write(`${kit.out}/${f}`, data);
  }
  credits.push(`- **${kit.name}** von Kenney (www.kenney.nl), CC0 – ${kit.page} → \`${kit.out}/\``);
}

console.log('ambientCG');
for (const [id, name] of AMBIENTCG) {
  const zip = unzipSync(await download(`https://ambientcg.com/get?file=${id}_1K-JPG.zip`));
  const color = zip[`${id}_1K-JPG_Color.jpg`];
  if (!color) throw new Error(`Color-Map fehlt in ${id}`);
  write(`textures/${name}.jpg`, color);
  credits.push(`- **${id}** von ambientCG (ambientcg.com), CC0 – https://ambientcg.com/view?id=${id} → \`textures/${name}.jpg\``);
}

write('CREDITS.md', credits.join('\n') + '\n');
console.log(`Fertig: ${OUT}`);
