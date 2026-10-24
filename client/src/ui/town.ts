import { formatTime, TOWN_BOARDS, TOWN_GOAL_COUNTS, TRACK_DEFS, type OutReason, type TownResult, type TownTask } from '@spidi/shared';
import { KEYMAPS, SOLO_KEYMAP } from '../input';
import { submitResults } from '../leaderboardApi';
import { TownGame } from '../townGame';
import type { App } from './app';
import { html, setHtml } from './html';
import { TASKS, TRAFFIC, type TrafficLevel } from './prefs';
import { playerActions, playerPanel } from './widgets';

export function townGoals(app: App) {
  return TOWN_GOAL_COUNTS.includes(app.prefs.townGoals) ? app.prefs.townGoals : 10;
}

export function showTownSetup(app: App) {
  const pr = app.prefs;
  const humans = pr.townPlayers === 2 ? 2 : 1;
  const refresh = () => app.showTownSetup();
  const city = TRACK_DEFS.find((t) => t.theme === 'city')?.id ?? pr.trackId;
  app.backdrop.show(city, Array.from({ length: humans }, (_, k) => app.carOf(k, 'town')));
  const choice = <T extends string>(action: string, items: { id: T; label: string }[], cur: T) =>
    items.map((i) => html`<button class="${i.id === cur ? 'sel' : ''}" data-a="${action}" data-id="${i.id}">${i.label}</button>`);
  const unit = pr.townTask === 'stars' ? 'Sterne' : 'Parkfelder';
  app.setScreen('town', html`
    <div class="menu panel wide">
      <h2>Übungsfahrt</h2>
      <p class="hint">Eine ganze Stadt zum Herumfahren – ideal, um Tastatur oder Gamepad kennenzulernen. Mit Sternen oder Einparken gibt es Zeit und Rangliste, zu zweit ein Duell.</p>
      <div class="toggle town-row">${choice('players', [{ id: '1', label: '1 Spieler' }, { id: '2', label: '2 Spieler (Splitscreen)' }], String(humans))}</div>
      <div class="players">${playerPanel(app, 0, 'town')}${humans > 1 ? playerPanel(app, 1, 'town') : ''}</div>
      <div class="toggle town-row">${choice('task', TASKS, pr.townTask)}</div>
      <p class="hint">${TASKS.find((t) => t.id === pr.townTask)?.hint ?? ''}</p>
      ${pr.townTask === 'free' ? '' : humans > 1
        ? html`<p class="hint duel-hint"><b>Duell:</b> Ihr startet in entgegengesetzten Ecken der Stadt und jagt dasselbe Ziel. Wer zuerst dort ist, bekommt den Punkt. Nach 3 Minuten gewinnt, wer mehr Punkte hat.</p>`
        : html`<div class="toggle town-row">${choice('goals', TOWN_GOAL_COUNTS.map((n) => ({ id: String(n), label: `${n} ${unit}` })), String(townGoals(app)))}</div>
           <p class="hint">Die Zeit läuft, bis alle geschafft sind – die besten Zeiten kommen in die Rangliste.</p>`}
      <div class="toggle town-row">${choice('traffic', TRAFFIC, pr.townTraffic)}</div>
      <div class="row"><button data-a="back">Zurück</button><button class="go" data-a="start">Losfahren ▶</button></div>
    </div>`);
  const set = (fn: () => void) => () => { fn(); app.savePrefs(); refresh(); };
  app.bind({
    ...playerActions(app, refresh, () => 'town'),
    players: (el) => set(() => (pr.townPlayers = Number(el.dataset.id)))(),
    task: (el) => set(() => (pr.townTask = el.dataset.id as TownTask))(),
    traffic: (el) => set(() => (pr.townTraffic = el.dataset.id as TrafficLevel))(),
    goals: (el) => set(() => (pr.townGoals = Number(el.dataset.id)))(),
    back: () => app.showMain(),
    start: () => app.startTown(),
  });
}

export function startTown(app: App) {
  const pr = app.prefs;
  const humans = pr.townPlayers === 2 ? 2 : 1;
  app.lastLocal = null;
  app.restart = () => app.startTown();
  app.runGame(new TownGame(app.hudLayer, {
    players: Array.from({ length: humans }, (_, k) => ({
      name: pr.players[k].name, carId: app.carOf(k, 'town'), keymap: humans === 1 ? SOLO_KEYMAP : KEYMAPS[k], pad: k,
    })),
    task: pr.townTask,
    traffic: TRAFFIC.find((t) => t.id === pr.townTraffic)?.cars ?? 10,
    goals: townGoals(app),
  }));
}

/** End of a solo run (time, leaderboard) or a duel (winner). */
export function showTownResults(app: App, game: TownGame, r: TownResult) {
  game.setEngineVolume(0.25);
  const names = game.opts.players.map((p) => p.name);
  const unit = r.task === 'stars' ? 'Sterne' : 'Parkfelder';
  const board = TOWN_BOARDS.find((b) => b.task === r.task)!;
  const outIdx = r.out.findIndex(Boolean);
  const anyOut = outIdx >= 0;
  const OUT_TEXT: Record<OutReason, { title: string; line: string; hint: string }> = {
    water: { title: 'Platsch!', line: 'Ins Wasser gefallen – die Fahrt ist zu Ende.', hint: 'Am Kai gibt es kein Geländer – also vorsichtig fahren!' },
    cemetery: { title: 'Ausgeschieden', line: 'Zu lange auf dem Friedhof herumgefahren – das ist pietätlos.', hint: 'Auf dem Friedhof wird nicht gefahren. Wer hineingerät, hat 5 Sekunden, um wieder hinauszufahren.' },
    people: { title: 'Ausgeschieden', line: 'Dreimal in Fussgänger gefahren – die Fahrt ist zu Ende.', hint: 'Auf Fussgänger, Hunde und Kinderwagen aufpassen: Nach der dritten Verwarnung ist Schluss.' },
  };
  const outLines = r.out.map((o, k) => (o ? `${names[k]}: ${OUT_TEXT[o].line}` : '')).filter(Boolean);
  const body = anyOut && r.mode !== 'duel' && r.out.every(Boolean) && r.out.length === 1
    ? html`<h2>${OUT_TEXT[r.out[0]!].title}</h2>
      <p class="town-result">${OUT_TEXT[r.out[0]!].line}</p>
      <p class="hint">${r.mode === 'solo' ? 'Diesmal gibt es keine Zeit für die Rangliste. ' : ''}${OUT_TEXT[r.out[0]!].hint}</p>`
    : r.mode === 'duel'
    ? html`<h2>${r.winner < 0 ? 'Unentschieden!' : `${names[r.winner]} gewinnt!`}</h2>
      ${outLines.map((l) => html`<p class="hint">${l}</p>`)}
      <table class="results"><tr><th>Fahrer</th><th>${unit}</th><th>Schnellstes Ziel</th></tr>
        ${[0, 1].map((k) => html`<tr class="${k === r.winner ? 'me' : ''}"><td>${names[k]}${r.out[k] ? html` <small>ausgeschieden</small>` : ''}</td><td>${r.scores[k]}</td><td>${formatTime(r.fastest[k])}</td></tr>`)}
      </table>
      ${anyOut ? '' : html`<p class="hint">${r.scores[0]} : ${r.scores[1]} nach 3 Minuten</p>`}`
    : anyOut
    ? html`<h2>Fahrt beendet</h2>${outLines.map((l) => html`<p class="hint">${l}</p>`)}`
    : html`<h2>Geschafft!</h2>
      <p class="town-result">${r.scores[0]} ${unit} in <b>${formatTime(r.time)}</b></p>
      <p class="hint">Schnellstes Ziel: ${formatTime(r.fastest[0])}</p>
      <div class="lb-info" id="lb-info"></div>`;
  app.setScreen('results', html`
    <div class="menu panel overlay">
      ${body}
      <div class="row">
        <button class="go" data-a="again">Nochmal</button>
        ${r.mode === 'solo' && !anyOut ? html`<button data-a="board">Rangliste</button>` : ''}
        <button data-a="menu">Hauptmenü</button>
      </div>
    </div>`);
  app.ui.classList.add('dim');
  const back = () => showTownResults(app, game, r);
  app.bind({
    again: () => app.startTown(),
    board: () => app.showLeaderboard({ trackId: board.id, sort: 'time', laps: game.opts.goals }, back),
    menu: () => app.quitGame(),
  });
  // runs that ended early do not count
  if (r.mode !== 'solo' || anyOut || game.cheated || submitted.has(r)) return;
  submitted.add(r);
  const p = game.opts.players[0];
  submitResults([{ name: p.name, carId: p.carId, trackId: board.id, laps: game.opts.goals, time: r.time, bestLap: r.fastest[0], mode: 'solo' }])
    .then(([rank]) => {
      const el = document.getElementById('lb-info');
      if (el && rank > 0) setHtml(el, html`🏆 <b>${p.name}</b>: Platz ${rank} der Rangliste (${game.opts.goals} ${unit})`);
    })
    .catch(() => {
      const el = document.getElementById('lb-info');
      if (el) el.textContent = 'Rangliste nicht erreichbar – Ergebnis wurde nicht gespeichert.';
    });
}

const submitted = new WeakSet<TownResult>();
