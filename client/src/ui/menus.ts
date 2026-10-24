import { carsForClass, KART_TRACKS, MAX_CARS, RACE_TRACKS, TRACK_DEFS, type Slot } from '@spidi/shared';
import { Game, type LocalPlayerCfg } from '../game';
import { KEYMAPS, setPadThrottle, SOLO_KEYMAP } from '../input';
import type { PadThrottle } from '../padMapping';
import type { App, Mode } from './app';
import { html } from './html';
import type { GraphicsLevel } from './prefs';
import { playerActions, playerPanel, settingsActions, settingsBlock } from './widgets';

export function showMain(app: App, error = '') {
  app.leaveNet();
  app.backdrop.show(app.prefs.trackId, [app.carOf(0, app.classOf(app.prefs.trackId))]);
  app.setScreen('main', html`
    <div class="menu main">
      <h1 class="logo">SPIDI<span>RACE</span></h1>
      <div class="tagline">Arcade-Rennen wie in den 90ern</div>
      ${error ? html`<div class="error">${error}</div>` : ''}
      <button class="big" data-a="single">Einzelrennen</button>
      <button class="big" data-a="split">Splitscreen · 2 Spieler</button>
      <button class="big" data-a="online">Netzwerkspiel</button>
      <button class="big kart" data-a="kart">Kart-Rennen mit Items</button>
      <button class="big practice" data-a="town">Übungsfahrt in der Stadt</button>
      <button class="big" data-a="board">Rangliste</button>
      <button class="big secondary" data-a="controls">Steuerung</button>
      <button class="big secondary" data-a="credits">Credits</button>
      <div class="toggle graphics" title="Niedrig: ohne Kantenglättung und mit geringerer Auflösung – für ältere Laptops und Handys">
        <span>Grafik</span>
        ${GRAPHICS.map((g) => html`<button class="${app.prefs.graphics === g.id ? 'sel' : ''}" data-a="gfx" data-id="${g.id}">${g.label}</button>`)}
      </div>
    </div>
    <div class="version">v${__APP_VERSION__}</div>`);
  app.bind({
    single: () => app.showSetup('single'),
    split: () => app.showSetup('split'),
    online: () => app.showOnlineSetup(),
    town: () => app.showTownSetup(),
    kart: () => app.showKartSetup(),
    board: () => app.showLeaderboard({ trackId: app.prefs.trackId, sort: 'bestLap' }, () => app.showMain()),
    controls: () => showControls(app),
    credits: () => showCredits(app),
    gfx: (el) => {
      const g = GRAPHICS.find((x) => x.id === el.dataset.id)?.id ?? 'auto';
      if (g === app.prefs.graphics) return;
      app.prefs.graphics = g;
      app.savePrefs();
      // antialiasing can only be set when the renderer is created
      location.reload();
    },
  });
}

const GRAPHICS: { id: GraphicsLevel; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'high', label: 'Hoch' },
  { id: 'low', label: 'Niedrig' },
];

function showCredits(app: App) {
  const link = (href: string, text: string) => html`<a href="${href}" target="_blank" rel="noopener">${text}</a>`;
  app.setScreen('credits', html`
    <div class="menu panel wide">
      <h2>Credits</h2>
      <p class="credits-head">
        <b>Spidi Race</b> · Version ${__APP_VERSION__} <small>(${link('https://semver.org/lang/de/', 'SemVer')})</small><br />
        Created by <b>Adrian S.</b> and <b>Anthropic Claude</b><br />
        ${link('https://github.com/defendeggu/spidi-race', 'github.com/defendeggu/spidi-race')} – Code unter MIT-Lizenz
      </p>
      <p class="hint">Grafiken (alle ${link('https://creativecommons.org/publicdomain/zero/1.0/', 'CC0')}, Public Domain) – herzlichen Dank an:</p>
      <ul class="credits">
        <li><b>Kenney</b> (${link('https://kenney.nl', 'kenney.nl')}): Car Kit, Nature Kit, City Kit (Suburban), City Kit (Commercial), City Kit (Industrial), Fantasy Town Kit, Retro Urban Kit, Mini Skate, Watercraft Kit, Train Kit, Graveyard Kit, Blaster Kit, Mini Characters, Cube Pets</li>
        <li><b>ambientCG</b> (${link('https://ambientcg.com', 'ambientcg.com')}): Asphalt031, Grass004, Rock064, Snow010A, Ground080, Gravel043, Concrete034, Ground106, Ground037, Ground071, Ground093C, Rock029, Ground097</li>
      </ul>
      <p class="hint">Sounds werden live im Browser synthetisiert. Inspiriert von <i>Need for Speed II: Special Edition</i> (1997).</p>
      <div class="row"><button data-a="back">Zurück</button></div>
    </div>`);
  app.bind({ back: () => app.showMain() });
}

const PAD_THROTTLE: { id: PadThrottle; label: string }[] = [
  { id: 'buttons', label: 'Trigger / Taste' },
  { id: 'right', label: 'Rechter Stick' },
  { id: 'left', label: 'Linker Stick' },
];

function showControls(app: App) {
  const k = (s: string) => html`<kbd>${s}</kbd>`;
  const pt = app.prefs.padThrottle;
  const stickGas = pt === 'right' ? 'rechter Stick' : pt === 'left' ? 'linker Stick' : '';
  app.setScreen('controls', html`
    <div class="menu panel wide">
      <h2>Steuerung</h2>
      <table class="keys">
        <tr><th></th><th>Spieler 1</th><th>Spieler 2</th></tr>
        <tr><td>Gas / Bremse / Rückwärts</td><td>${k('W')} / ${k('S')}</td><td>${k('↑')} / ${k('↓')}</td></tr>
        <tr><td>Lenken</td><td>${k('A')} ${k('D')}</td><td>${k('←')} ${k('→')}</td></tr>
        <tr><td>Handbremse</td><td>${k('Leertaste')}</td><td>${k('Strg rechts')} / ${k('Shift rechts')} / ${k('Num 0')}</td></tr>
        <tr><td>Raketensprung Weltenbummler (5 s Abkühlzeit)</td><td>${k('F')}</td><td>${k('Num 2')} / ${k('Delete')}</td></tr>
        <tr><td>Kamera wechseln</td><td>${k('C')}</td><td>${k('Enter')} / ${k('.')}</td></tr>
        <tr><td>Pause</td><td colspan="2">${k('Esc')}</td></tr>
        <tr><td>Ton an/aus</td><td colspan="2">${k('M')}</td></tr>
        <tr><td>Steuerungshilfe (Übungsfahrt)</td><td colspan="2">${k('H')}</td></tr>
        <tr><td>Item benutzen (Kart-Rennen)</td><td>${k('E')}</td><td>${k('Ende')} / ${k('-')} / ${k('Num 1')}</td></tr>
      </table>
      <p class="hint">Im Einzelspieler funktionieren WASD und die Pfeiltasten. Spieler 1 bekommt das erste angeschlossene Gamepad, Spieler 2 das zweite.</p>
      <table class="keys">
        <tr><th></th><th>Xbox / Standard-Gamepad</th><th>PlayStation (auch PS3)</th></tr>
        <tr><td>Gas</td><td>RT oder A${stickGas ? html`, ${stickGas} hoch` : ''}</td><td>R2 oder ✕${stickGas ? html`, ${stickGas} hoch` : ''}</td></tr>
        <tr><td>Bremse / Rückwärts</td><td>LT oder B${stickGas ? html`, ${stickGas} runter` : ''}</td><td>L2 oder ○${stickGas ? html`, ${stickGas} runter` : ''}</td></tr>
        <tr><td>Lenken</td><td colspan="2">${pt === 'right' ? 'linker Stick' : 'linker oder rechter Stick'}, Steuerkreuz</td></tr>
        <tr><td>Handbremse</td><td>X oder RB</td><td>□ oder R1</td></tr>
        <tr><td>Kamera wechseln</td><td>Back oder ↑</td><td>Select oder ↑</td></tr>
        <tr><td>Pause</td><td>Start</td><td>Start</td></tr>
        <tr><td>Raketensprung (Weltenbummler)</td><td>Y</td><td>△</td></tr>
        <tr><td>Item benutzen (Kart-Rennen)</td><td>Y</td><td>△</td></tr>
      </table>
      <div class="toggle pad-throttle" title="Trigger und Tasten geben in jeder Einstellung weiterhin Gas">
        <span>Gas am Gamepad</span>
        ${PAD_THROTTLE.map((m) => html`<button class="${pt === m.id ? 'sel' : ''}" data-a="padgas" data-id="${m.id}">${m.label}</button>`)}
      </div>
      <p class="hint">Hinweis: Manche Tastaturen erkennen nicht beliebig viele gleichzeitig gedrückte Tasten.
      Falls im Splitscreen Eingaben verloren gehen, hilft ein Gamepad für einen der beiden Spieler.</p>
      <div class="row"><button data-a="back">Zurück</button></div>
    </div>`);
  app.bind({
    back: () => app.showMain(),
    padgas: (el) => {
      const m = PAD_THROTTLE.find((x) => x.id === el.dataset.id)?.id ?? 'buttons';
      app.prefs.padThrottle = m;
      app.savePrefs();
      setPadThrottle(m);
      showControls(app);
    },
  });
}

export function showSetup(app: App, mode: Mode) {
  const humans = mode === 'split' ? 2 : 1;
  const maxAi = MAX_CARS - humans;
  const refresh = () => app.showSetup(mode);
  // a kart-only track is not offered in the car race
  if (!RACE_TRACKS.some((t) => t.id === app.prefs.trackId)) app.prefs.trackId = RACE_TRACKS[0].id;
  const cls = app.classOf(app.prefs.trackId);
  app.backdrop.show(app.prefs.trackId, Array.from({ length: humans }, (_, k) => app.carOf(k, cls)));
  app.setScreen('setup', html`
    <div class="menu panel wide">
      <h2>${mode === 'split' ? 'Splitscreen' : 'Einzelrennen'}</h2>
      <div class="players">${playerPanel(app, 0, cls)}${humans > 1 ? playerPanel(app, 1, cls) : ''}</div>
      ${settingsBlock(app.prefs, true, maxAi, RACE_TRACKS)}
      <div class="row"><button data-a="back">Zurück</button><button class="go" data-a="start">Rennen starten ▶</button></div>
    </div>`);
  app.bind({
    ...playerActions(app, refresh, () => cls),
    ...settingsActions(app.prefs, maxAi, () => { app.savePrefs(); refresh(); }),
    back: () => app.showMain(),
    start: () => app.startLocal(mode),
  });
}

const AI_NAMES = ['Rossi', 'Lindqvist', 'Tanaka', 'Moreau', 'Becker', 'Okafor', 'Silva', 'Novak'];

export function showKartSetup(app: App) {
  const pr = app.prefs;
  const humans = pr.kartPlayers === 2 ? 2 : 1;
  const maxAi = MAX_CARS - humans;
  if (!KART_TRACKS.some((t) => t.id === pr.kartTrackId)) pr.kartTrackId = KART_TRACKS[0].id;
  const s = { trackId: pr.kartTrackId, laps: pr.laps, aiCount: pr.aiCount, aiSkill: pr.aiSkill };
  const refresh = () => app.showKartSetup();
  const city = TRACK_DEFS.find((t) => t.theme === 'city')?.id ?? pr.kartTrackId;
  app.backdrop.show(pr.kartMode === 'battle' ? city : pr.kartTrackId, Array.from({ length: humans }, (_, k) => app.carOf(k, 'kart')));
  const battle = pr.kartMode === 'battle';
  const bots = Math.max(0, Math.min(4, pr.kartBots));
  app.setScreen('kart', html`
    <div class="menu panel wide">
      <h2>${battle ? 'Kart-Battle' : 'Kart-Rennen'}</h2>
      <div class="toggle town-row">
        <button class="${battle ? '' : 'sel'}" data-a="mode" data-id="race">Rennen auf einer Strecke</button>
        <button class="${battle ? 'sel' : ''}" data-a="mode" data-id="battle">Battle in der Stadt</button>
      </div>
      <p class="hint">${battle
        ? 'Jedes Kart hat 3 Ballons. Jeder Treffer kostet einen, wer ins Hafenbecken fällt, verliert alle. Wer zuletzt noch Ballons hat, gewinnt – spätestens nach 3 Minuten. Die ?-Boxen stehen auf den Kreuzungen.'
        : 'Fahr durch die ?-Boxen und schnapp dir ein Item: Blaster, Zielsucher, Mine, Turbo oder Schild. Driften (Handbremse + Lenken) lädt einen Turbo auf.'}</p>
      <div class="toggle town-row">
        <button class="${humans === 1 ? 'sel' : ''}" data-a="players" data-id="1">1 Spieler</button>
        <button class="${humans === 2 ? 'sel' : ''}" data-a="players" data-id="2">2 Spieler (Splitscreen)</button>
      </div>
      <div class="players">${playerPanel(app, 0, 'kart')}${humans > 1 ? playerPanel(app, 1, 'kart') : ''}</div>
      ${battle
        ? html`<div class="opts"><label>Computer-Karts <span class="stepper"><button data-a="botsDown">−</button><b>${bots}</b><button data-a="botsUp">+</button></span></label></div>`
        : settingsBlock(s, true, maxAi, KART_TRACKS)}
      <div class="row"><button data-a="back">Zurück</button><button class="go" data-a="start">${battle ? 'Battle starten ▶' : 'Rennen starten ▶'}</button></div>
    </div>`);
  app.bind({
    ...playerActions(app, refresh, () => 'kart'),
    ...settingsActions(s, maxAi, () => {
      Object.assign(pr, { kartTrackId: s.trackId, laps: s.laps, aiCount: s.aiCount, aiSkill: s.aiSkill });
      app.savePrefs();
      refresh();
    }),
    players: (el) => { pr.kartPlayers = Number(el.dataset.id); app.savePrefs(); refresh(); },
    mode: (el) => { pr.kartMode = el.dataset.id === 'battle' ? 'battle' : 'race'; app.savePrefs(); refresh(); },
    botsDown: () => { pr.kartBots = Math.max(0, bots - 1); app.savePrefs(); refresh(); },
    botsUp: () => { pr.kartBots = Math.min(4, bots + 1); app.savePrefs(); refresh(); },
    back: () => app.showMain(),
    start: () => (battle ? app.startBattle() : app.startKart()),
  });
}

export function startKart(app: App) {
  const pr = app.prefs;
  const humans = pr.kartPlayers === 2 ? 2 : 1;
  app.lastLocal = { mode: humans === 2 ? 'split' : 'single', kart: true };
  app.restart = () => app.startKart();
  const ai = Math.min(pr.aiCount, MAX_CARS - humans);
  const pool = carsForClass('kart');
  const slots: Slot[] = [];
  for (let i = 0; i < ai; i++) {
    slots.push({ id: `ai${i}`, name: AI_NAMES[i % AI_NAMES.length], carId: pool[(i + 1) % pool.length].id, isAI: true, ownerId: '', grid: i });
  }
  const locals: LocalPlayerCfg[] = [];
  for (let k = 0; k < humans; k++) {
    slots.push({ id: `p${k + 1}`, name: pr.players[k].name, carId: app.carOf(k, 'kart'), isAI: false, ownerId: '', grid: ai + k });
    locals.push({ slotId: `p${k + 1}`, keymap: humans === 1 ? SOLO_KEYMAP : KEYMAPS[k], pad: k });
  }
  app.runGame(new Game(app.hudLayer, {
    trackId: pr.kartTrackId, laps: pr.laps, slots, locals, countdown: 3.5, aiSkill: pr.aiSkill, kart: true,
  }));
}

export function startLocal(app: App, mode: Mode) {
  app.lastLocal = { mode };
  app.restart = () => app.startLocal(mode);
  const humans = mode === 'split' ? 2 : 1;
  const ai = Math.min(app.prefs.aiCount, MAX_CARS - humans);
  const cls = app.classOf(app.prefs.trackId);
  const pool = carsForClass(cls);
  const slots: Slot[] = [];
  for (let i = 0; i < ai; i++) {
    slots.push({ id: `ai${i}`, name: AI_NAMES[i % AI_NAMES.length], carId: pool[(i + 1) % pool.length].id, isAI: true, ownerId: '', grid: i });
  }
  const locals: LocalPlayerCfg[] = [];
  for (let k = 0; k < humans; k++) {
    const p = app.prefs.players[k];
    slots.push({ id: `p${k + 1}`, name: p.name, carId: app.carOf(k, cls), isAI: false, ownerId: '', grid: ai + k });
    locals.push({ slotId: `p${k + 1}`, keymap: humans === 1 ? SOLO_KEYMAP : KEYMAPS[k], pad: k });
  }
  app.runGame(new Game(app.hudLayer, {
    trackId: app.prefs.trackId, laps: app.prefs.laps, slots, locals, countdown: 3.5, aiSkill: app.prefs.aiSkill,
  }));
}
