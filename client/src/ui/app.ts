import {
  carRatings, carsForClass, formatTime, getCar, getTrack, MAX_CARS, rankEntries, TRACK_DEFS,
  type CarClass,
  type LeaderboardEntry, type LeaderboardSort,
  type LobbyClient, type LobbyPlayer, type LobbySettings, type ResultRow, type ServerMsg, type Slot,
} from '@spidi/shared';
import { audio } from '../audio';
import { Game, type LocalPlayerCfg } from '../game';
import { escapeHtml } from '../hud';
import { input, KEYMAPS, SOLO_KEYMAP } from '../input';
import { fetchLeaderboard, submitResults } from '../leaderboardApi';
import { Net } from '../net';
import { Backdrop } from './backdrop';

/** a player's preferences: carId is the road car, offroadCarId / microCarId the cars of the other classes */
type PlayerPref = LobbyPlayer & { offroadCarId?: string; microCarId?: string };

/** the preference field holding the player's car for each class */
const CAR_PREF = { road: 'carId', offroad: 'offroadCarId', micro: 'microCarId' } as const satisfies Record<CarClass, keyof PlayerPref>;

interface Prefs {
  players: PlayerPref[];
  trackId: string;
  laps: number;
  aiCount: number;
  aiSkill: number;
  onlineLocal: number;
}

const SKILLS = [
  { v: 0.86, label: 'Leicht' },
  { v: 0.93, label: 'Mittel' },
  { v: 1.0, label: 'Schwer' },
];

function loadPrefs(): Prefs {
  const def: Prefs = {
    players: [
      { name: 'Spieler 1', carId: 'falcone', offroadCarId: 'bergziege', microCarId: 'blitz' },
      { name: 'Spieler 2', carId: 'kaito', offroadCarId: 'raider', microCarId: 'flitzer' },
    ],
    trackId: TRACK_DEFS[0].id, laps: 2, aiCount: 4, aiSkill: 0.93, onlineLocal: 1,
  };
  try {
    const raw = localStorage.getItem('spidi-race-prefs');
    if (raw) return { ...def, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return def;
}

type Mode = 'single' | 'split';

export class App {
  private ui = document.getElementById('ui')!;
  private hudLayer = document.getElementById('hud')!;
  private backdrop = new Backdrop();
  private prefs = loadPrefs();
  private game: Game | null = null;
  private net: Net | null = null;
  private lobby: { hostId: string; phase: 'lobby' | 'race'; settings: LobbySettings; clients: LobbyClient[] } | null = null;
  private screen = '';
  private lastLocal: { mode: Mode } | null = null;

  constructor() {
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.showMain();
  }

  private savePrefs() {
    try {
      localStorage.setItem('spidi-race-prefs', JSON.stringify(this.prefs));
    } catch {
      /* ignore */
    }
  }

  private setScreen(name: string, html: string) {
    this.screen = name;
    this.ui.className = '';
    this.ui.innerHTML = html;
  }

  private bind(actions: Record<string, (el: HTMLElement) => void>) {
    this.ui.querySelectorAll<HTMLElement>('[data-a]').forEach((el) => {
      const fn = actions[el.dataset.a!];
      if (fn) el.addEventListener(el.tagName === 'SELECT' || el.tagName === 'INPUT' ? 'change' : 'click', () => fn(el));
    });
  }

  // ---------------------------------------------------------------- main menu

  showMain(error = '') {
    this.leaveNet();
    this.backdrop.show(this.prefs.trackId, [this.carOf(0, this.classOf(this.prefs.trackId))]);
    this.setScreen('main', `
      <div class="menu main">
        <h1 class="logo">SPIDI<span>RACE</span></h1>
        <div class="tagline">Arcade-Rennen wie in den 90ern</div>
        ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
        <button class="big" data-a="single">Einzelrennen</button>
        <button class="big" data-a="split">Splitscreen · 2 Spieler</button>
        <button class="big" data-a="online">Netzwerkspiel</button>
        <button class="big" data-a="board">Rangliste</button>
        <button class="big secondary" data-a="controls">Steuerung</button>
        <button class="big secondary" data-a="credits">Credits</button>
      </div>
      <div class="version">v${__APP_VERSION__}</div>`);
    this.bind({
      single: () => this.showSetup('single'),
      split: () => this.showSetup('split'),
      online: () => this.showOnlineSetup(),
      board: () => this.showLeaderboard({ trackId: this.prefs.trackId, sort: 'bestLap' }, () => this.showMain()),
      controls: () => this.showControls(),
      credits: () => this.showCredits(),
    });
  }

  private showCredits() {
    const cc0 = '<a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noopener">CC0</a>';
    this.setScreen('credits', `
      <div class="menu panel wide">
        <h2>Credits</h2>
        <p class="credits-head">
          <b>Spidi Race</b> · Version ${__APP_VERSION__} <small>(<a href="https://semver.org/lang/de/" target="_blank" rel="noopener">SemVer</a>)</small><br />
          Created by <b>Adrian S.</b> and <b>Anthropic Claude</b><br />
          <a href="https://github.com/defendeggu/spidi-race" target="_blank" rel="noopener">github.com/defendeggu/spidi-race</a> – Code unter MIT-Lizenz
        </p>
        <p class="hint">Grafiken (alle ${cc0}, Public Domain) – herzlichen Dank an:</p>
        <ul class="credits">
          <li><b>Kenney</b> (<a href="https://kenney.nl" target="_blank" rel="noopener">kenney.nl</a>): Car Kit, Nature Kit, City Kit (Suburban), City Kit (Commercial)</li>
          <li><b>ambientCG</b> (<a href="https://ambientcg.com" target="_blank" rel="noopener">ambientcg.com</a>): Asphalt031, Grass004, Rock064, Snow010A, Ground080, Gravel043, Concrete034, Ground106, Ground037, Ground071, Ground093C, Rock029, Ground097</li>
        </ul>
        <p class="hint">Sounds werden live im Browser synthetisiert. Inspiriert von <i>Need for Speed II: Special Edition</i> (1997).</p>
        <div class="row"><button data-a="back">Zurück</button></div>
      </div>`);
    this.bind({ back: () => this.showMain() });
  }

  private showControls() {
    this.setScreen('controls', `
      <div class="menu panel wide">
        <h2>Steuerung</h2>
        <table class="keys">
          <tr><th></th><th>Spieler 1</th><th>Spieler 2</th></tr>
          <tr><td>Gas / Bremse / Rückwärts</td><td><kbd>W</kbd> / <kbd>S</kbd></td><td><kbd>↑</kbd> / <kbd>↓</kbd></td></tr>
          <tr><td>Lenken</td><td><kbd>A</kbd> <kbd>D</kbd></td><td><kbd>←</kbd> <kbd>→</kbd></td></tr>
          <tr><td>Handbremse</td><td><kbd>Leertaste</kbd></td><td><kbd>Strg rechts</kbd> / <kbd>Shift rechts</kbd> / <kbd>Num 0</kbd></td></tr>
          <tr><td>Kamera wechseln</td><td><kbd>C</kbd></td><td><kbd>Enter</kbd> / <kbd>.</kbd></td></tr>
          <tr><td>Pause</td><td colspan="2"><kbd>Esc</kbd></td></tr>
          <tr><td>Ton an/aus</td><td colspan="2"><kbd>M</kbd></td></tr>
        </table>
        <p class="hint">Im Einzelspieler funktionieren WASD und die Pfeiltasten. Gamepads werden ebenfalls unterstützt
        (RT Gas, LT Bremse, linker Stick lenken, X/RB Handbremse).</p>
        <p class="hint">Hinweis: Manche Tastaturen erkennen nicht beliebig viele gleichzeitig gedrückte Tasten.
        Falls im Splitscreen Eingaben verloren gehen, hilft ein Gamepad für einen der beiden Spieler.</p>
        <div class="row"><button data-a="back">Zurück</button></div>
      </div>`);
    this.bind({ back: () => this.showMain() });
  }

  // ---------------------------------------------------------------- shared widgets

  private classOf(trackId: string): CarClass {
    return getTrack(trackId).carClass;
  }

  /** the car player k drives in the given class (falls back to a car of that class) */
  private carOf(k: number, cls: CarClass) {
    const p = this.prefs.players[k];
    const id = p[CAR_PREF[cls]];
    const pool = carsForClass(cls);
    return pool.some((c) => c.id === id) ? id! : pool[k % pool.length].id;
  }

  private setCarOf(k: number, cls: CarClass, id: string) {
    this.prefs.players[k][CAR_PREF[cls]] = id;
    this.savePrefs();
  }

  private cycleCar(k: number, cls: CarClass, d: number) {
    const pool = carsForClass(cls);
    const i = pool.findIndex((c) => c.id === this.carOf(k, cls));
    this.setCarOf(k, cls, pool[(i + d + pool.length) % pool.length].id);
  }

  private lobbyPlayers(cls: CarClass): LobbyPlayer[] {
    return this.prefs.players.slice(0, this.prefs.onlineLocal).map((p, k) => ({ name: p.name, carId: this.carOf(k, cls) }));
  }

  private playerPanel(k: number, cls: CarClass) {
    const p = this.prefs.players[k];
    const car = getCar(this.carOf(k, cls));
    const r = carRatings(car);
    const bar = (label: string, v: number) => `<div class="stat"><span>${label}</span><div class="bar"><i style="width:${v * 100}%"></i></div></div>`;
    return `
      <div class="player-panel">
        <h3>Spieler ${k + 1}</h3>
        <input class="name" data-a="name" data-k="${k}" maxlength="16" value="${escapeHtml(p.name)}" />
        <div class="car-select">
          <button class="arrow" data-a="carPrev" data-k="${k}">◀</button>
          <div class="car-name"><i style="background:${car.color}"></i>${car.name}</div>
          <button class="arrow" data-a="carNext" data-k="${k}">▶</button>
        </div>
        <div class="car-desc">${car.description}</div>
        ${bar('Tempo', r.speed)}${bar('Beschl.', r.accel)}${bar('Handling', r.handling)}${bar('Bremsen', r.brakes)}
        <div class="car-top">${cls === 'offroad' ? 'Offroad · ' : cls === 'micro' ? 'Micro · ' : ''}Spitze ca. ${Math.round(car.topSpeed * 3.6 * 0.92)} km/h</div>
      </div>`;
  }

  private playerActions(refresh: () => void, cls: () => CarClass) {
    const cycle = (el: HTMLElement, d: number) => {
      this.cycleCar(Number(el.dataset.k), cls(), d);
      refresh();
    };
    return {
      name: (el: HTMLElement) => {
        const k = Number(el.dataset.k);
        this.prefs.players[k].name = (el as HTMLInputElement).value.trim().slice(0, 16) || `Spieler ${k + 1}`;
        this.savePrefs();
      },
      carPrev: (el: HTMLElement) => cycle(el, -1),
      carNext: (el: HTMLElement) => cycle(el, 1),
    };
  }

  private settingsBlock(s: { trackId: string; laps: number; aiCount: number; aiSkill: number }, editable: boolean, maxAi: number) {
    const dis = editable ? '' : 'disabled';
    return `
      <div class="settings">
        <div class="tracks">
          ${TRACK_DEFS.map((t) => `
            <button class="track ${t.id === s.trackId ? 'sel' : ''} ${t.theme}" data-a="track" data-id="${t.id}" ${dis}>
              <b>${t.name}${t.class === 'offroad' ? ' <em class="badge">OFFROAD</em>' : t.class === 'micro' ? ' <em class="badge micro">MICRO</em>' : ''}</b><span>${t.description}</span>
            </button>`).join('')}
        </div>
        <div class="opts">
          <label>Runden <span class="stepper"><button data-a="lapsDown" ${dis}>−</button><b>${s.laps}</b><button data-a="lapsUp" ${dis}>+</button></span></label>
          <label>Computergegner <span class="stepper"><button data-a="aiDown" ${dis}>−</button><b>${Math.min(s.aiCount, maxAi)}</b><button data-a="aiUp" ${dis}>+</button></span></label>
          <label>KI-Stärke <select data-a="skill" ${dis}>${SKILLS.map((k) => `<option value="${k.v}" ${Math.abs(k.v - s.aiSkill) < 0.001 ? 'selected' : ''}>${k.label}</option>`).join('')}</select></label>
        </div>
      </div>`;
  }

  private settingsActions(s: { trackId: string; laps: number; aiCount: number; aiSkill: number }, maxAi: number, changed: () => void) {
    return {
      track: (el: HTMLElement) => { s.trackId = el.dataset.id!; changed(); },
      lapsDown: () => { s.laps = Math.max(1, s.laps - 1); changed(); },
      lapsUp: () => { s.laps = Math.min(10, s.laps + 1); changed(); },
      aiDown: () => { s.aiCount = Math.max(0, Math.min(maxAi, s.aiCount) - 1); changed(); },
      aiUp: () => { s.aiCount = Math.min(maxAi, s.aiCount + 1); changed(); },
      skill: (el: HTMLElement) => { s.aiSkill = Number((el as HTMLSelectElement).value); changed(); },
    };
  }

  // ---------------------------------------------------------------- local setup

  private showSetup(mode: Mode) {
    const humans = mode === 'split' ? 2 : 1;
    const maxAi = MAX_CARS - humans;
    const refresh = () => this.showSetup(mode);
    const cls = this.classOf(this.prefs.trackId);
    this.backdrop.show(this.prefs.trackId, Array.from({ length: humans }, (_, k) => this.carOf(k, cls)));
    this.setScreen('setup', `
      <div class="menu panel wide">
        <h2>${mode === 'split' ? 'Splitscreen' : 'Einzelrennen'}</h2>
        <div class="players">${this.playerPanel(0, cls)}${humans > 1 ? this.playerPanel(1, cls) : ''}</div>
        ${this.settingsBlock(this.prefs, true, maxAi)}
        <div class="row"><button data-a="back">Zurück</button><button class="go" data-a="start">Rennen starten ▶</button></div>
      </div>`);
    this.bind({
      ...this.playerActions(refresh, () => cls),
      ...this.settingsActions(this.prefs, maxAi, () => { this.savePrefs(); refresh(); }),
      back: () => this.showMain(),
      start: () => this.startLocal(mode),
    });
  }

  private startLocal(mode: Mode) {
    this.lastLocal = { mode };
    const humans = mode === 'split' ? 2 : 1;
    const ai = Math.min(this.prefs.aiCount, MAX_CARS - humans);
    const names = ['Rossi', 'Lindqvist', 'Tanaka', 'Moreau', 'Becker', 'Okafor', 'Silva', 'Novak'];
    const cls = this.classOf(this.prefs.trackId);
    const pool = carsForClass(cls);
    const slots: Slot[] = [];
    for (let i = 0; i < ai; i++) {
      slots.push({ id: `ai${i}`, name: names[i % names.length], carId: pool[(i + 1) % pool.length].id, isAI: true, ownerId: '', grid: i });
    }
    const locals: LocalPlayerCfg[] = [];
    for (let k = 0; k < humans; k++) {
      const p = this.prefs.players[k];
      slots.push({ id: `p${k + 1}`, name: p.name, carId: this.carOf(k, cls), isAI: false, ownerId: '', grid: ai + k });
      locals.push({ slotId: `p${k + 1}`, keymap: humans === 1 ? SOLO_KEYMAP : KEYMAPS[k], pad: k });
    }
    this.runGame(new Game(this.hudLayer, {
      trackId: this.prefs.trackId, laps: this.prefs.laps, slots, locals, countdown: 3.5, aiSkill: this.prefs.aiSkill,
    }));
  }

  private runGame(game: Game) {
    this.backdrop.hide();
    this.game?.dispose();
    this.game = game;
    this.ui.className = 'hidden';
    this.ui.innerHTML = '';
    this.screen = 'game';
    game.onFinish = (results, ranks) => this.showResults(results, ranks);
    game.onPause = () => this.togglePause();
    game.start();
  }

  private togglePause() {
    const g = this.game;
    if (!g) return;
    if (this.screen === 'pause') {
      this.resume();
      return;
    }
    if (this.screen !== 'game') return;
    g.paused = true;
    g.setEngineVolume(0);
    const online = !!this.net;
    const host = this.isHost();
    this.setScreen('pause', `
      <div class="menu panel overlay">
        <h2>Pause</h2>
        ${online ? '<p class="hint">Im Netzwerkspiel läuft das Rennen weiter.</p>' : ''}
        <button class="big" data-a="resume">Weiter</button>
        ${online ? '' : '<button class="big" data-a="restart">Neustart</button>'}
        ${online && host ? '<button class="big danger" data-a="abort">Rennen für alle abbrechen</button>' : ''}
        <button class="big secondary" data-a="quit">${online ? 'Netzwerkspiel verlassen' : 'Hauptmenü'}</button>
      </div>`);
    this.ui.classList.add('dim');
    this.bind({
      resume: () => this.resume(),
      restart: () => this.lastLocal && this.startLocal(this.lastLocal.mode),
      abort: (el) => this.confirmAbort(el),
      quit: () => this.quitGame(),
    });
  }

  private isHost() {
    return !!this.net && this.lobby?.hostId === this.net.clientId;
  }

  /** First click asks for confirmation, the second one tells the server to abort the race. */
  private confirmAbort(el: HTMLElement) {
    if (el.dataset.armed) {
      this.net?.send({ type: 'abort' });
      el.textContent = 'Breche ab…';
      (el as HTMLButtonElement).disabled = true;
      return;
    }
    el.dataset.armed = '1';
    el.textContent = 'Wirklich abbrechen? Nochmal klicken';
    setTimeout(() => {
      if (!el.isConnected || !el.dataset.armed) return;
      delete el.dataset.armed;
      el.textContent = 'Rennen für alle abbrechen';
    }, 4000);
  }

  private resume() {
    if (!this.game) return;
    this.game.paused = false;
    this.game.setEngineVolume(this.game ? 1 : 0);
    this.ui.className = 'hidden';
    this.ui.innerHTML = '';
    this.screen = 'game';
    input.clearPressed();
  }

  private quitGame() {
    this.game?.dispose();
    this.game = null;
    this.showMain();
  }

  private showResults(results: ResultRow[], ranks?: Record<string, number>) {
    this.game?.setEngineVolume(0.25);
    const online = !!this.net;
    const game = this.game;
    const trackId = game?.track.def.id ?? this.prefs.trackId;
    const myIds = new Set(game ? game.race.entries.filter((e) => !e.isAI && (!online || e.ownerId === this.net!.clientId)).map((e) => e.id) : []);
    const rows = results.map((r) => `
      <tr class="${myIds.has(r.id) ? 'me' : ''}">
        <td>${r.position}</td><td>${escapeHtml(r.name)}${r.isAI ? ' <small>KI</small>' : ''}</td><td>${getCar(r.carId).name}</td>
        <td>${r.finished ? formatTime(r.time) : `<small>${r.lapsDone} Rd.</small>`}</td><td>${formatTime(r.bestLap)}</td>
      </tr>`).join('');
    this.setScreen('results', `
      <div class="menu panel overlay">
        <h2>Ergebnis</h2>
        <table class="results"><tr><th>#</th><th>Fahrer</th><th>Auto</th><th>Zeit</th><th>Beste Runde</th></tr>${rows}</table>
        <div class="lb-info" id="lb-info"></div>
        <div class="row">
          ${online ? '<button class="go" data-a="lobby">Zurück zur Lobby</button>' : '<button class="go" data-a="again">Nochmal</button>'}
          <button data-a="board">Rangliste</button>
          <button data-a="menu">Hauptmenü</button>
        </div>
      </div>`);
    this.ui.classList.add('dim');
    this.bind({
      again: () => this.lastLocal && this.startLocal(this.lastLocal.mode),
      lobby: () => {
        this.game?.dispose();
        this.game = null;
        this.showLobby();
      },
      board: () => this.showLeaderboard({ trackId, sort: 'bestLap' }, () => this.showResults(results, ranks)),
      menu: () => this.quitGame(),
    });

    // record my finished drivers in the permanent leaderboard (online: the server already did)
    const mine = results.filter((r) => myIds.has(r.id) && r.finished);
    if (mine.length === 0) return;
    const show = (rk: number[]) => {
      const el = document.getElementById('lb-info');
      if (!el) return;
      const trackName = TRACK_DEFS.find((t) => t.id === trackId)?.name ?? trackId;
      el.innerHTML = mine
        .map((r, i) => (rk[i] > 0 ? `🏆 <b>${escapeHtml(r.name)}</b>: Platz ${rk[i]} der Rundenrekorde auf ${trackName}` : ''))
        .filter(Boolean)
        .join('<br />');
    };
    const known = ranks;
    if (known) {
      show(mine.map((r) => known[r.id] ?? 0));
      return;
    }
    if (this.submitted === results) return;
    this.submitted = results;
    const mode = this.lastLocal?.mode === 'split' ? 'split' : 'solo';
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

  private submitted: ResultRow[] | null = null;
  private lobbyNotice = '';

  // ---------------------------------------------------------------- leaderboard

  private showLeaderboard(view: { trackId: string; sort: LeaderboardSort; laps?: number }, back: () => void, entries?: LeaderboardEntry[]) {
    if (!entries) {
      this.setScreen('leaderboard', `<div class="menu panel"><h2>Rangliste</h2><p class="hint">Lade…</p></div>`);
      fetchLeaderboard()
        .then((all) => this.screen === 'leaderboard' && this.showLeaderboard(view, back, all))
        .catch(() => {
          this.setScreen('leaderboard', `
            <div class="menu panel"><h2>Rangliste</h2>
              <div class="error">Der Spielserver ist nicht erreichbar.</div>
              <div class="row"><button data-a="back">Zurück</button></div></div>`);
          this.bind({ back });
        });
      return;
    }
    const onTrack = entries.filter((e) => e.trackId === view.trackId);
    const lapOptions = [...new Set(onTrack.map((e) => e.laps))].sort((a, b) => a - b);
    if (view.sort === 'time' && !lapOptions.includes(view.laps ?? -1)) view.laps = lapOptions[0];
    const ranked = rankEntries(entries, view.trackId, view.sort, view.laps).slice(0, 50);
    const modes: Record<string, string> = { solo: 'Einzel', split: 'Splitscreen', online: 'Netzwerk' };
    const date = (iso: string) => new Date(iso).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const rows = ranked.map((e, i) => {
      const car = getCar(e.carId);
      return `<tr class="${i < 3 ? `top${i + 1}` : ''}">
        <td>${i + 1}</td><td>${escapeHtml(e.name)}</td>
        <td><i class="dot" style="background:${car.color}"></i>${car.name}</td>
        <td class="${view.sort === 'bestLap' ? 'key' : ''}">${formatTime(e.bestLap)}</td>
        <td class="${view.sort === 'time' ? 'key' : ''}">${formatTime(e.time)} <small>(${e.laps} Rd.)</small></td>
        <td><small>${modes[e.mode] ?? e.mode}</small></td><td><small>${date(e.date)}</small></td>
      </tr>`;
    }).join('');
    this.setScreen('leaderboard', `
      <div class="menu panel wide">
        <h2>Rangliste</h2>
        <div class="toggle">
          ${TRACK_DEFS.map((t) => `<button class="${t.id === view.trackId ? 'sel' : ''}" data-a="track" data-id="${t.id}">${t.name}</button>`).join('')}
        </div>
        <div class="opts">
          <label>Wertung
            <select data-a="sort">
              <option value="bestLap" ${view.sort === 'bestLap' ? 'selected' : ''}>Beste Runde</option>
              <option value="time" ${view.sort === 'time' ? 'selected' : ''}>Rennzeit</option>
            </select>
          </label>
          ${view.sort === 'time' && lapOptions.length ? `<label>Runden <select data-a="laps">${lapOptions.map((l) => `<option ${l === view.laps ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
          <span class="hint">${onTrack.length} Rennen gespeichert</span>
        </div>
        ${ranked.length
          ? `<div class="board-wrap"><table class="results board"><tr><th>#</th><th>Fahrer</th><th>Auto</th><th>Beste Runde</th><th>Rennzeit</th><th>Modus</th><th>Datum</th></tr>${rows}</table></div>`
          : '<p class="hint">Noch keine Zeiten auf dieser Strecke – fahr die erste!</p>'}
        <div class="row"><button data-a="back">Zurück</button></div>
      </div>`);
    const again = (v: typeof view) => this.showLeaderboard(v, back, entries);
    this.bind({
      track: (el) => again({ ...view, trackId: el.dataset.id! }),
      sort: (el) => again({ ...view, sort: (el as HTMLSelectElement).value as LeaderboardSort }),
      laps: (el) => again({ ...view, laps: Number((el as HTMLSelectElement).value) }),
      back,
    });
  }

  // ---------------------------------------------------------------- online

  private showOnlineSetup(error = '') {
    const n = this.prefs.onlineLocal;
    const refresh = () => this.showOnlineSetup();
    this.backdrop.show(this.prefs.trackId, Array.from({ length: n }, (_, k) => this.carOf(k, 'road')));
    this.setScreen('onlineSetup', `
      <div class="menu panel wide">
        <h2>Netzwerkspiel</h2>
        <p class="hint">Alle Mitspieler öffnen im Browser die Adresse dieses Servers, z.B. <b>${escapeHtml(location.host)}</b>.
        Wer zuerst in der Lobby ist, wählt Strecke und Optionen.</p>
        ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
        <div class="toggle">
          <button class="${n === 1 ? 'sel' : ''}" data-a="one">1 Spieler an diesem Gerät</button>
          <button class="${n === 2 ? 'sel' : ''}" data-a="two">2 Spieler (Splitscreen)</button>
        </div>
        <div class="players">${this.playerPanel(0, 'road')}${n > 1 ? this.playerPanel(1, 'road') : ''}</div>
        <p class="hint">Wählt der Host eine Offroad- oder Micro-Strecke, suchst du dein Auto dieser Klasse direkt in der Lobby aus.</p>
        <div class="row"><button data-a="back">Zurück</button><button class="go" data-a="connect">Lobby betreten ▶</button></div>
      </div>`);
    this.bind({
      ...this.playerActions(refresh, () => 'road'),
      one: () => { this.prefs.onlineLocal = 1; this.savePrefs(); refresh(); },
      two: () => { this.prefs.onlineLocal = 2; this.savePrefs(); refresh(); },
      back: () => this.showMain(),
      connect: () => void this.connect(),
    });
  }

  private async connect() {
    const net = new Net();
    this.setScreen('connecting', `<div class="menu panel"><h2>Verbinde…</h2></div>`);
    try {
      await net.connect();
    } catch (e) {
      this.showOnlineSetup(`${(e as Error).message}. Läuft der Server (npm run dev / docker compose up)?`);
      return;
    }
    this.net = net;
    net.on((m) => this.onNet(m));
    net.onClose = () => {
      this.game?.dispose();
      this.game = null;
      this.net = null;
      this.showMain('Verbindung zum Server verloren.');
    };
    net.send({ type: 'join', players: this.lobbyPlayers('road') });
  }

  private leaveNet() {
    this.lobbyNotice = '';
    this.net?.close();
    this.net = null;
    this.lobby = null;
  }

  private onNet(m: ServerMsg) {
    if (m.type === 'aborted') {
      this.lobbyNotice = `Das Rennen wurde von ${m.by} abgebrochen.`;
      if (this.game) {
        this.game.dispose();
        this.game = null;
      }
      if (this.screen !== 'onlineSetup' && this.screen !== 'main') this.showLobby();
      return;
    }
    if (m.type === 'lobby') {
      this.lobby = m;
      // track class changed by the host: switch to my car of that class
      if (m.phase === 'lobby') {
        const want = this.lobbyPlayers(this.classOf(m.settings.trackId));
        const mine = m.clients.find((c) => c.id === this.net!.clientId)?.players;
        if (mine && JSON.stringify(mine) !== JSON.stringify(want)) this.net!.send({ type: 'join', players: want });
      }
      if (this.screen === 'lobby' || this.screen === 'connecting') this.showLobby();
    } else if (m.type === 'start') {
      const me = this.net!.clientId;
      const mine = m.slots.filter((s) => s.ownerId === me && !s.isAI).sort((a, b) => a.id.localeCompare(b.id));
      if (mine.length === 0) return;
      const locals: LocalPlayerCfg[] = mine.map((s, k) => ({
        slotId: s.id, keymap: mine.length === 1 ? SOLO_KEYMAP : KEYMAPS[k], pad: k,
      }));
      const skill = this.lobby?.settings.aiSkill ?? 0.93;
      this.runGame(new Game(this.hudLayer, {
        trackId: m.trackId, laps: m.laps, slots: m.slots, locals, countdown: m.countdown, aiSkill: skill, net: this.net!,
      }));
    }
  }

  private showLobby() {
    const l = this.lobby;
    const net = this.net;
    if (!l || !net) return;
    const isHost = l.hostId === net.clientId;
    const humans = l.clients.reduce((s, c) => s + c.players.length, 0);
    const maxAi = Math.max(0, MAX_CARS - humans);
    const cls = this.classOf(l.settings.trackId);
    this.backdrop.show(l.settings.trackId, this.lobbyPlayers(cls).map((p) => p.carId));
    const canPick = l.phase === 'lobby';
    const list = l.clients.map((c) => c.players.map((p, k) => {
      const mine = c.id === net.clientId;
      const arrows = (d: number, label: string) => (mine && canPick ? `<button class="mini" data-a="lcar" data-k="${k}" data-d="${d}">${label}</button>` : '');
      return `
      <li class="${mine ? 'me' : ''}"><i style="background:${getCar(p.carId).color}"></i>
        ${escapeHtml(p.name)} ${arrows(-1, '◀')}<small>${getCar(p.carId).name}</small>${arrows(1, '▶')}${c.id === l.hostId ? ' <em>Host</em>' : ''}</li>`;
    }).join('')).join('');
    const settings = { ...l.settings };
    this.setScreen('lobby', `
      <div class="menu panel wide">
        <h2>Lobby</h2>
        <div class="lobby">
          <div><h3>Fahrer (${humans})</h3><ul class="lobby-list">${list}</ul></div>
          <div>${this.settingsBlock(settings, isHost && l.phase === 'lobby', maxAi)}</div>
        </div>
        ${this.lobbyNotice ? `<div class="notice">${escapeHtml(this.lobbyNotice)}</div>` : ''}
        ${l.phase === 'race' ? '<p class="hint">Ein Rennen läuft gerade – du fährst beim nächsten Rennen mit.</p>' : ''}
        <div class="row">
          <button data-a="leave">Lobby verlassen</button>
          ${isHost && l.phase === 'race' ? '<button class="danger" data-a="abort">Rennen für alle abbrechen</button>' : ''}
          ${isHost ? `<button class="go" data-a="start" ${l.phase !== 'lobby' ? 'disabled' : ''}>Rennen starten ▶</button>` : '<span class="hint">Warte auf den Host…</span>'}
        </div>
      </div>`);
    this.bind({
      ...this.settingsActions(settings, maxAi, () => net.send({ type: 'settings', settings })),
      leave: () => this.showMain(),
      lcar: (el) => {
        this.cycleCar(Number(el.dataset.k), cls, Number(el.dataset.d));
        net.send({ type: 'join', players: this.lobbyPlayers(cls) });
      },
      abort: (el) => this.confirmAbort(el),
      start: () => {
        this.lobbyNotice = '';
        net.send({ type: 'start' });
      },
    });
  }
}
