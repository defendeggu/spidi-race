import { carsForClass, MAX_CARS, type Slot } from '@spidi/shared';
import { Game, type LocalPlayerCfg } from '../game';
import { KEYMAPS, SOLO_KEYMAP } from '../input';
import type { App, Mode } from './app';
import { html } from './html';
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
      <button class="big practice" data-a="town">Übungsfahrt in der Stadt</button>
      <button class="big" data-a="board">Rangliste</button>
      <button class="big secondary" data-a="controls">Steuerung</button>
      <button class="big secondary" data-a="credits">Credits</button>
    </div>
    <div class="version">v${__APP_VERSION__}</div>`);
  app.bind({
    single: () => app.showSetup('single'),
    split: () => app.showSetup('split'),
    online: () => app.showOnlineSetup(),
    town: () => app.showTownSetup(),
    board: () => app.showLeaderboard({ trackId: app.prefs.trackId, sort: 'bestLap' }, () => app.showMain()),
    controls: () => showControls(app),
    credits: () => showCredits(app),
  });
}

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
        <li><b>Kenney</b> (${link('https://kenney.nl', 'kenney.nl')}): Car Kit, Nature Kit, City Kit (Suburban), City Kit (Commercial), City Kit (Industrial), Fantasy Town Kit, Retro Urban Kit, Mini Skate, Watercraft Kit, Train Kit, Graveyard Kit, Blaster Kit</li>
        <li><b>ambientCG</b> (${link('https://ambientcg.com', 'ambientcg.com')}): Asphalt031, Grass004, Rock064, Snow010A, Ground080, Gravel043, Concrete034, Ground106, Ground037, Ground071, Ground093C, Rock029, Ground097</li>
      </ul>
      <p class="hint">Sounds werden live im Browser synthetisiert. Inspiriert von <i>Need for Speed II: Special Edition</i> (1997).</p>
      <div class="row"><button data-a="back">Zurück</button></div>
    </div>`);
  app.bind({ back: () => app.showMain() });
}

function showControls(app: App) {
  const k = (s: string) => html`<kbd>${s}</kbd>`;
  app.setScreen('controls', html`
    <div class="menu panel wide">
      <h2>Steuerung</h2>
      <table class="keys">
        <tr><th></th><th>Spieler 1</th><th>Spieler 2</th></tr>
        <tr><td>Gas / Bremse / Rückwärts</td><td>${k('W')} / ${k('S')}</td><td>${k('↑')} / ${k('↓')}</td></tr>
        <tr><td>Lenken</td><td>${k('A')} ${k('D')}</td><td>${k('←')} ${k('→')}</td></tr>
        <tr><td>Handbremse</td><td>${k('Leertaste')}</td><td>${k('Strg rechts')} / ${k('Shift rechts')} / ${k('Num 0')}</td></tr>
        <tr><td>Kamera wechseln</td><td>${k('C')}</td><td>${k('Enter')} / ${k('.')}</td></tr>
        <tr><td>Pause</td><td colspan="2">${k('Esc')}</td></tr>
        <tr><td>Ton an/aus</td><td colspan="2">${k('M')}</td></tr>
        <tr><td>Steuerungshilfe (Übungsfahrt)</td><td colspan="2">${k('H')}</td></tr>
      </table>
      <p class="hint">Im Einzelspieler funktionieren WASD und die Pfeiltasten. Spieler 1 bekommt das erste angeschlossene Gamepad, Spieler 2 das zweite.</p>
      <table class="keys">
        <tr><th></th><th>Xbox / Standard-Gamepad</th><th>PlayStation (auch PS3)</th></tr>
        <tr><td>Gas</td><td>RT oder A</td><td>R2 oder ✕</td></tr>
        <tr><td>Bremse / Rückwärts</td><td>LT oder B</td><td>L2 oder ○</td></tr>
        <tr><td>Lenken</td><td colspan="2">linker oder rechter Stick, Steuerkreuz</td></tr>
        <tr><td>Handbremse</td><td>X oder RB</td><td>□ oder R1</td></tr>
        <tr><td>Kamera / Pause</td><td>Y / Start</td><td>△ / Start</td></tr>
      </table>
      <p class="hint">Hinweis: Manche Tastaturen erkennen nicht beliebig viele gleichzeitig gedrückte Tasten.
      Falls im Splitscreen Eingaben verloren gehen, hilft ein Gamepad für einen der beiden Spieler.</p>
      <div class="row"><button data-a="back">Zurück</button></div>
    </div>`);
  app.bind({ back: () => app.showMain() });
}

export function showSetup(app: App, mode: Mode) {
  const humans = mode === 'split' ? 2 : 1;
  const maxAi = MAX_CARS - humans;
  const refresh = () => app.showSetup(mode);
  const cls = app.classOf(app.prefs.trackId);
  app.backdrop.show(app.prefs.trackId, Array.from({ length: humans }, (_, k) => app.carOf(k, cls)));
  app.setScreen('setup', html`
    <div class="menu panel wide">
      <h2>${mode === 'split' ? 'Splitscreen' : 'Einzelrennen'}</h2>
      <div class="players">${playerPanel(app, 0, cls)}${humans > 1 ? playerPanel(app, 1, cls) : ''}</div>
      ${settingsBlock(app.prefs, true, maxAi)}
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
