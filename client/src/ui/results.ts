import {
  formatTime, getCar, rankEntries, TOWN_BOARDS, TOWN_GOAL_COUNTS, townBoard, TRACK_DEFS,
  type LeaderboardEntry, type LeaderboardSort, type ResultRow,
} from '@spidi/shared';
import { Game } from '../game';
import { fetchLeaderboard, submitResults } from '../leaderboardApi';
import type { App } from './app';
import { html, setHtml } from './html';

export interface BoardView {
  trackId: string;
  sort: LeaderboardSort;
  laps?: number;
}

const submitted = new WeakSet<ResultRow[]>();

export function showResults(app: App, results: ResultRow[], ranks?: Record<string, number>) {
  app.game?.setEngineVolume(0.25);
  const online = !!app.net;
  const game = app.game instanceof Game ? app.game : null;
  const trackId = game?.track.def.id ?? app.prefs.trackId;
  const myIds = new Set(game ? game.race.entries.filter((e) => !e.isAI && (!online || e.ownerId === app.net!.clientId)).map((e) => e.id) : []);
  const rows = results.map((r) => html`
    <tr class="${myIds.has(r.id) ? 'me' : ''}">
      <td>${r.position}</td><td>${r.name}${r.isAI ? html` <small>KI</small>` : ''}</td><td>${getCar(r.carId).name}</td>
      <td>${r.finished ? formatTime(r.time) : html`<small>${r.lapsDone} Rd.</small>`}</td><td>${formatTime(r.bestLap)}</td>
    </tr>`);
  app.setScreen('results', html`
    <div class="menu panel overlay">
      <h2>Ergebnis</h2>
      <table class="results"><tr><th>#</th><th>Fahrer</th><th>Auto</th><th>Zeit</th><th>Beste Runde</th></tr>${rows}</table>
      <div class="lb-info" id="lb-info"></div>
      <div class="row">
        ${online ? html`<button class="go" data-a="lobby">Zurück zur Lobby</button>` : html`<button class="go" data-a="again">Nochmal</button>`}
        <button data-a="board">Rangliste</button>
        <button data-a="menu">Hauptmenü</button>
      </div>
    </div>`);
  app.ui.classList.add('dim');
  app.bind({
    again: () => app.lastLocal && app.startLocal(app.lastLocal.mode),
    lobby: () => {
      app.game?.dispose();
      app.game = null;
      app.showLobby();
    },
    board: () => app.showLeaderboard({ trackId, sort: 'bestLap' }, () => showResults(app, results, ranks)),
    menu: () => app.quitGame(),
  });

  // record my finished drivers in the permanent leaderboard (online: the server already did)
  const mine = results.filter((r) => myIds.has(r.id) && r.finished);
  if (mine.length === 0) return;
  const show = (rk: number[]) => {
    const el = document.getElementById('lb-info');
    if (!el) return;
    const trackName = TRACK_DEFS.find((t) => t.id === trackId)?.name ?? trackId;
    const lines = mine.filter((_, i) => rk[i] > 0).map((r) => html`🏆 <b>${r.name}</b>: Platz ${rk[mine.indexOf(r)]} der Rundenrekorde auf ${trackName}<br />`);
    setHtml(el, html`${lines}`);
  };
  const known = ranks;
  if (known) {
    show(mine.map((r) => known[r.id] ?? 0));
    return;
  }
  if (submitted.has(results)) return;
  submitted.add(results);
  const mode = app.lastLocal?.mode === 'split' ? 'split' : 'solo';
  submitResults(mine.map((r) => ({ name: r.name, carId: r.carId, trackId, laps: game?.race.laps ?? 1, time: r.time, bestLap: r.bestLap, mode })))
    .then((rk) => {
      ranks = Object.fromEntries(mine.map((r, i) => [r.id, rk[i]]));
      show(rk);
    })
    .catch(() => {
      const el = document.getElementById('lb-info');
      if (el) el.textContent = 'Rangliste nicht erreichbar – Ergebnis wurde nicht gespeichert.';
    });
}

export function showLeaderboard(app: App, view: BoardView, back: () => void, entries?: LeaderboardEntry[]) {
  if (!entries) {
    app.setScreen('leaderboard', html`<div class="menu panel"><h2>Rangliste</h2><p class="hint">Lade…</p></div>`);
    fetchLeaderboard(view.trackId)
      .then((all) => app.screen === 'leaderboard' && showLeaderboard(app, view, back, all))
      .catch(() => {
        app.setScreen('leaderboard', html`
          <div class="menu panel"><h2>Rangliste</h2>
            <div class="error">Der Spielserver ist nicht erreichbar.</div>
            <div class="row"><button data-a="back">Zurück</button></div></div>`);
        app.bind({ back });
      });
    return;
  }
  const town = townBoard(view.trackId);
  // town boards: total time for a fixed number of goals
  if (town) view.sort = 'time';
  const onTrack = entries.filter((e) => e.trackId === view.trackId);
  const lapOptions = town ? TOWN_GOAL_COUNTS : [...new Set(onTrack.map((e) => e.laps))].sort((a, b) => a - b);
  if (view.sort === 'time' && !lapOptions.includes(view.laps ?? -1)) view.laps = town ? 10 : lapOptions[0];
  const ranked = rankEntries(entries, view.trackId, view.sort, view.laps).slice(0, 50);
  const modes: Record<string, string> = { solo: 'Einzel', split: 'Splitscreen', online: 'Netzwerk' };
  const date = (iso: string) => new Date(iso).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const rows = ranked.map((e, i) => {
    const car = getCar(e.carId);
    return html`<tr class="${i < 3 ? `top${i + 1}` : ''}">
      <td>${i + 1}</td><td>${e.name}</td>
      <td><i class="dot" style="background:${car.color}"></i>${car.name}</td>
      <td class="${view.sort === 'bestLap' ? 'key' : ''}">${formatTime(e.bestLap)}</td>
      <td class="${view.sort === 'time' ? 'key' : ''}">${formatTime(e.time)} <small>(${e.laps} ${town ? town.unit : 'Rd.'})</small></td>
      <td><small>${modes[e.mode] ?? e.mode}</small></td><td><small>${date(e.date)}</small></td>
    </tr>`;
  });
  const sel = (on: boolean) => (on ? html`selected` : '');
  app.setScreen('leaderboard', html`
    <div class="menu panel wide">
      <h2>Rangliste</h2>
      <div class="toggle">
        ${[...TRACK_DEFS, ...TOWN_BOARDS].map((t) => html`<button class="${t.id === view.trackId ? 'sel' : ''}" data-a="track" data-id="${t.id}">${t.name}</button>`)}
      </div>
      <div class="opts">
        ${town ? '' : html`<label>Wertung
          <select data-a="sort">
            <option value="bestLap" ${sel(view.sort === 'bestLap')}>Beste Runde</option>
            <option value="time" ${sel(view.sort === 'time')}>Rennzeit</option>
          </select>
        </label>`}
        ${view.sort === 'time' && lapOptions.length ? html`<label>${town ? town.unit : 'Runden'} <select data-a="laps">${lapOptions.map((l) => html`<option ${sel(l === view.laps)}>${l}</option>`)}</select></label>` : ''}
        <span class="hint">${onTrack.length} ${town ? (onTrack.length === 1 ? 'Fahrt' : 'Fahrten') : 'Rennen'} gespeichert</span>
      </div>
      ${ranked.length
        ? html`<div class="board-wrap"><table class="results board"><tr><th>#</th><th>Fahrer</th><th>Auto</th><th>${town ? 'Schnellstes Ziel' : 'Beste Runde'}</th><th>${town ? 'Zeit' : 'Rennzeit'}</th><th>Modus</th><th>Datum</th></tr>${rows}</table></div>`
        : html`<p class="hint">${town ? `Noch keine Zeiten für ${view.laps} ${town.unit} – fahr die erste!` : 'Noch keine Zeiten auf dieser Strecke – fahr die erste!'}</p>`}
      <div class="row"><button data-a="back">Zurück</button></div>
    </div>`);
  const again = (v: BoardView) => showLeaderboard(app, v, back, entries);
  app.bind({
    track: (el) => showLeaderboard(app, { ...view, trackId: el.dataset.id! }, back),
    sort: (el) => again({ ...view, sort: (el as HTMLSelectElement).value as LeaderboardSort }),
    laps: (el) => again({ ...view, laps: Number((el as HTMLSelectElement).value) }),
    back,
  });
}
