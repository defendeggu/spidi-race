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
      'sedan.glb', 'taxi.glb', 'police.glb', 'firetruck.glb', 'van.glb', 'delivery.glb',
      'kart-oobi.glb', 'kart-oodi.glb', 'kart-ooli.glb', 'kart-oopi.glb', 'kart-oozi.glb',
      'debris-bolt.glb', 'debris-tire.glb', 'debris-plate-small-a.glb', 'debris-spoiler-a.glb', 'debris-door.glb',
      'Textures/colormap.png',
    ],
  },
  {
    name: 'City Kit (Suburban)',
    page: 'https://kenney.nl/assets/city-kit-suburban',
    url: 'https://kenney.nl/media/pages/assets/city-kit-suburban/2c871b7af2-1745479373/kenney_city-kit-suburban_20.zip',
    dir: 'Models/GLB format/',
    out: 'buildings',
    files: [...'abcdefghijklmnopqrstu'.split('').map((c) => `building-type-${c}.glb`), 'Textures/colormap.png'],
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
    name: 'City Kit (Industrial)',
    page: 'https://kenney.nl/assets/city-kit-industrial',
    url: 'https://kenney.nl/media/pages/assets/city-kit-industrial/0ec35b139d-1788171848/kenney_city-kit-industrial_2.0.zip',
    dir: 'Models/GLB format/',
    out: 'industrial',
    files: [
      ...'abcdefghijklmnopqrst'.split('').map((c) => `building-${c}.glb`),
      'chimney-large.glb', 'chimney-medium.glb', 'chimney-small.glb', 'detail-tank-large.glb', 'detail-tank.glb',
      'shipping-container-a.glb', 'shipping-container-b.glb', 'shipping-container-c.glb', 'water-tower.glb', 'windmill.glb',
      'solar-panel-landscape-group.glb', 'Textures/colormap.png',
    ],
  },
  {
    name: 'Fantasy Town Kit',
    page: 'https://kenney.nl/assets/fantasy-town-kit',
    url: 'https://kenney.nl/media/pages/assets/fantasy-town-kit/efe948d309-1754222374/kenney_fantasy-town-kit_2.0.zip',
    dir: 'Models/GLB format/',
    out: 'fantasy',
    files: [
      'wall.glb', 'wall-wood.glb', 'wall-window-shutters.glb', 'wall-wood-window-shutters.glb', 'wall-window-glass.glb',
      'wall-wood-window-glass.glb', 'wall-door.glb', 'wall-wood-door.glb', 'wall-doorway-round.glb', 'wall-detail-cross.glb',
      'wall-wood-detail-cross.glb', 'roof.glb', 'roof-gable.glb', 'roof-high.glb', 'roof-high-gable.glb', 'roof-point.glb',
      'chimney.glb', 'fountain-round-detail.glb', 'stall-red.glb', 'stall-green.glb', 'lantern.glb', 'hedge-large.glb',
      'overhang.glb', 'wall-window-round.glb', 'wall-arch.glb', 'roof-high-point.glb', 'Textures/colormap.png',
    ],
  },
  {
    name: 'Retro Urban Kit',
    page: 'https://kenney.nl/assets/retro-urban-kit',
    url: 'https://kenney.nl/media/pages/assets/retro-urban-kit/8314d4db22-1738147509/kenney_retro-urban-kit.zip',
    dir: 'Models/GLB format/',
    out: 'retro',
    files: [
      'wall-a-flat.glb', 'wall-a-flat-window.glb', 'wall-a-flat-painted.glb', 'wall-a-flat-garage.glb', 'wall-b-flat.glb', 'wall-b-flat-window.glb',
      'wall-a.glb', 'wall-a-window.glb', 'wall-a-door.glb', 'wall-a-painted.glb', 'wall-a-garage.glb', 'wall-a-roof.glb',
      'wall-a-roof-detailed.glb', 'wall-b.glb', 'wall-b-window.glb', 'wall-b-door.glb', 'wall-b-roof.glb',
      'detail-awning-wide.glb', 'detail-bench.glb', 'detail-dumpster-closed.glb',
      ...['bars', 'concrete', 'doors', 'metal', 'metal_wall', 'roof', 'roof_plates', 'signs', 'tiles', 'wall', 'wall_garage', 'wall_lines', 'windows', 'dirt', 'planks']
        .map((t) => `Textures/${t}.png`),
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
  {
    name: 'Mini Skate',
    page: 'https://kenney.nl/assets/mini-skate',
    url: 'https://kenney.nl/media/pages/assets/mini-skate/00b0c2b304-1791798670/kenney_mini-skate.zip',
    dir: 'Models/GLB format/',
    out: 'skate',
    files: [
      'rail-high.glb', 'rail-low.glb', 'rail-curve.glb', 'obstacle-box.glb', 'obstacle-box-grind.glb', 'bench.glb', 'benches.glb',
      'character-skate-boy.glb', 'character-skate-girl.glb', 'skateboard.glb', 'pallet.glb', 'scooter.glb',
      'Textures/colormap.png',
    ],
  },
  {
    name: 'Watercraft Kit',
    page: 'https://kenney.nl/assets/watercraft-kit',
    url: 'https://kenney.nl/media/pages/assets/watercraft-kit/a335cfed49-1713519620/kenney_watercraft-pack.zip',
    dir: 'Models/GLB format/',
    out: 'watercraft',
    files: [
      'ship-cargo-a.glb', 'ship-cargo-b.glb', 'boat-tug-a.glb', 'boat-fishing-small.glb', 'boat-sail-a.glb', 'boat-sail-b.glb',
      'boat-house-a.glb', 'boat-house-b.glb', 'boat-speed-a.glb', 'boat-row-small.glb', 'cargo-container-a.glb',
      'cargo-container-b.glb', 'cargo-container-c.glb', 'cargo-pile-a.glb', 'cargo-pile-b.glb', 'buoy.glb', 'buoy-flag.glb',
      'Textures/colormap.png',
    ],
  },
  {
    name: 'Train Kit',
    page: 'https://kenney.nl/assets/train-kit',
    url: 'https://kenney.nl/media/pages/assets/train-kit/cf8521d625-1727040883/kenney_train-kit.zip',
    dir: 'Models/GLB format/',
    out: 'train',
    files: [
      'train-electric-city-a.glb', 'train-electric-city-b.glb', 'train-electric-city-c.glb', 'train-locomotive-a.glb',
      'train-carriage-container-blue.glb', 'train-carriage-container-red.glb', 'train-carriage-container-green.glb',
      'train-carriage-tank.glb', 'railroad-straight.glb',
      'Textures/colormap.png',
    ],
  },
  {
    name: 'Graveyard Kit',
    page: 'https://kenney.nl/assets/graveyard-kit',
    url: 'https://kenney.nl/media/pages/assets/graveyard-kit/ba8d4b4517-1760691807/kenney_graveyard-kit_5.0.zip',
    dir: 'Models/GLB format/',
    out: 'graveyard',
    files: [
      'gravestone-cross.glb', 'gravestone-round.glb', 'gravestone-bevel.glb', 'gravestone-wide.glb', 'gravestone-roof.glb',
      'gravestone-decorative.glb', 'grave.glb', 'grave-border.glb', 'crypt.glb', 'crypt-small.glb', 'iron-fence.glb',
      'iron-fence-border-gate.glb', 'iron-fence-border-column.glb', 'lightpost-single.glb', 'lightpost-double.glb', 'pine.glb',
      'pine-crooked.glb', 'bench.glb', 'urn-round.glb', 'pillar-obelisk.glb', 'cross-column.glb',
      'Textures/colormap.png',
    ],
  },
  {
    name: 'Blaster Kit',
    page: 'https://kenney.nl/assets/blaster-kit',
    url: 'https://kenney.nl/media/pages/assets/blaster-kit/261d80a716-1753959510/kenney_blaster-kit_2.1.zip',
    dir: 'Models/GLB format/',
    out: 'blaster',
    files: [
      'blaster-a.glb', 'blaster-d.glb', 'blaster-h.glb', 'blaster-l.glb', 'bullet-foam.glb', 'bullet-foam-thick.glb',
      'grenade-a.glb', 'grenade-b.glb', 'crate-small.glb',
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
