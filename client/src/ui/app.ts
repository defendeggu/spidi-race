import {
  CARS, carRatings, formatTime, getCar, MAX_CARS, TRACK_DEFS,
  type LobbyClient, type LobbyPlayer, type LobbySettings, type ResultRow, type ServerMsg, type Slot,
} from '@spidi/shared';
import { audio } from '../audio';
import { Game, type LocalPlayerCfg } from '../game';
import { escapeHtml } from '../hud';
import { input, KEYMAPS, SOLO_KEYMAP } from '../input';
import { Net } from '../net';
import { Backdrop } from './backdrop';

interface Prefs {
  players: LobbyPlayer[];
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
    players: [{ name: 'Spieler 1', carId: CARS[0].id }, { name: 'Spieler 2', carId: CARS[2].id }],
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
    this.backdrop.show(this.prefs.trackId, [this.prefs.players[0].carId]);
    this.setScreen('main', `
      <div class="menu main">
        <h1 class="logo">SPIDI<span>RACE</span></h1>
        <div class="tagline">Arcade-Rennen wie in den 90ern</div>
        ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
        <button class="big" data-a="single">Einzelrennen</button>
        <button class="big" data-a="split">Splitscreen · 2 Spieler</button>
        <button class="big" data-a="online">Netzwerkspiel</button>
        <button class="big secondary" data-a="controls">Steuerung</button>
        <button class="big secondary" data-a="credits">Credits</button>
      </div>
      <div class="version">v${__APP_VERSION__}</div>`);
    this.bind({
      single: () => this.showSetup('single'),
      split: () => this.showSetup('split'),
      online: () => this.showOnlineSetup(),
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
          <li><b>ambientCG</b> (<a href="https://ambientcg.com" target="_blank" rel="noopener">ambientcg.com</a>): Asphalt031, Grass004, Rock064, Snow010A, Ground080, Gravel043, Concrete034</li>
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

  private playerPanel(k: number) {
    const p = this.prefs.players[k];
    const car = getCar(p.carId);
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
        <div class="car-top">Spitze ca. ${Math.round(car.topSpeed * 3.6 * 0.92)} km/h</div>
      </div>`;
  }

  private playerActions(refresh: () => void) {
    const cycle = (el: HTMLElement, d: number) => {
      const k = Number(el.dataset.k);
      const i = CARS.findIndex((c) => c.id === this.prefs.players[k].carId);
      this.prefs.players[k].carId = CARS[(i + d + CARS.length) % CARS.length].id;
      this.savePrefs();
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
              <b>${t.name}</b><span>${t.description}</span>
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
    this.backdrop.show(this.prefs.trackId, this.prefs.players.slice(0, humans).map((p) => p.carId));
    this.setScreen('setup', `
      <div class="menu panel wide">
        <h2>${mode === 'split' ? 'Splitscreen' : 'Einzelrennen'}</h2>
        <div class="players">${this.playerPanel(0)}${humans > 1 ? this.playerPanel(1) : ''}</div>
        ${this.settingsBlock(this.prefs, true, maxAi)}
        <div class="row"><button data-a="back">Zurück</button><button class="go" data-a="start">Rennen starten ▶</button></div>
      </div>`);
    this.bind({
      ...this.playerActions(refresh),
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
    const slots: Slot[] = [];
    for (let i = 0; i < ai; i++) {
      slots.push({ id: `ai${i}`, name: names[i % names.length], carId: CARS[(i + 1) % CARS.length].id, isAI: true, ownerId: '', grid: i });
    }
    const locals: LocalPlayerCfg[] = [];
    for (let k = 0; k < humans; k++) {
      const p = this.prefs.players[k];
      slots.push({ id: `p${k + 1}`, name: p.name, carId: p.carId, isAI: false, ownerId: '', grid: ai + k });
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
    game.onFinish = (results) => this.showResults(results);
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
    this.setScreen('pause', `
      <div class="menu panel overlay">
        <h2>Pause</h2>
        ${online ? '<p class="hint">Im Netzwerkspiel läuft das Rennen weiter.</p>' : ''}
        <button class="big" data-a="resume">Weiter</button>
        ${online ? '' : '<button class="big" data-a="restart">Neustart</button>'}
        <button class="big secondary" data-a="quit">${online ? 'Rennen verlassen' : 'Hauptmenü'}</button>
      </div>`);
    this.ui.classList.add('dim');
    this.bind({
      resume: () => this.resume(),
      restart: () => this.lastLocal && this.startLocal(this.lastLocal.mode),
      quit: () => this.quitGame(),
    });
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

  private showResults(results: ResultRow[]) {
    this.game?.setEngineVolume(0.25);
    const online = !!this.net;
    const myIds = new Set(this.game ? [...this.game.race.entries.filter((e) => !e.isAI && (!online || e.ownerId === this.net!.clientId)).map((e) => e.id)] : []);
    const rows = results.map((r) => `
      <tr class="${myIds.has(r.id) ? 'me' : ''}">
        <td>${r.position}</td><td>${escapeHtml(r.name)}${r.isAI ? ' <small>KI</small>' : ''}</td><td>${getCar(r.carId).name}</td>
        <td>${r.finished ? formatTime(r.time) : `<small>${r.lapsDone} Rd.</small>`}</td><td>${formatTime(r.bestLap)}</td>
      </tr>`).join('');
    this.setScreen('results', `
      <div class="menu panel overlay">
        <h2>Ergebnis</h2>
        <table class="results"><tr><th>#</th><th>Fahrer</th><th>Auto</th><th>Zeit</th><th>Beste Runde</th></tr>${rows}</table>
        <div class="row">
          ${online ? '<button class="go" data-a="lobby">Zurück zur Lobby</button>' : '<button class="go" data-a="again">Nochmal</button>'}
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
      menu: () => this.quitGame(),
    });
  }

  // ---------------------------------------------------------------- online

  private showOnlineSetup(error = '') {
    const n = this.prefs.onlineLocal;
    const refresh = () => this.showOnlineSetup();
    this.backdrop.show(this.prefs.trackId, this.prefs.players.slice(0, n).map((p) => p.carId));
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
        <div class="players">${this.playerPanel(0)}${n > 1 ? this.playerPanel(1) : ''}</div>
        <div class="row"><button data-a="back">Zurück</button><button class="go" data-a="connect">Lobby betreten ▶</button></div>
      </div>`);
    this.bind({
      ...this.playerActions(refresh),
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
    net.send({ type: 'join', players: this.prefs.players.slice(0, this.prefs.onlineLocal) });
  }

  private leaveNet() {
    this.net?.close();
    this.net = null;
    this.lobby = null;
  }

  private onNet(m: ServerMsg) {
    if (m.type === 'lobby') {
      this.lobby = m;
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
    this.backdrop.show(l.settings.trackId, this.prefs.players.slice(0, this.prefs.onlineLocal).map((p) => p.carId));
    const list = l.clients.map((c) => c.players.map((p) => `
      <li class="${c.id === net.clientId ? 'me' : ''}"><i style="background:${getCar(p.carId).color}"></i>
        ${escapeHtml(p.name)} <small>${getCar(p.carId).name}</small>${c.id === l.hostId ? ' <em>Host</em>' : ''}</li>`).join('')).join('');
    const settings = { ...l.settings };
    this.setScreen('lobby', `
      <div class="menu panel wide">
        <h2>Lobby</h2>
        <div class="lobby">
          <div><h3>Fahrer (${humans})</h3><ul class="lobby-list">${list}</ul></div>
          <div>${this.settingsBlock(settings, isHost && l.phase === 'lobby', maxAi)}</div>
        </div>
        ${l.phase === 'race' ? '<p class="hint">Ein Rennen läuft gerade – du fährst beim nächsten Rennen mit.</p>' : ''}
        <div class="row">
          <button data-a="leave">Lobby verlassen</button>
          ${isHost ? `<button class="go" data-a="start" ${l.phase !== 'lobby' ? 'disabled' : ''}>Rennen starten ▶</button>` : '<span class="hint">Warte auf den Host…</span>'}
        </div>
      </div>`);
    this.bind({
      ...this.settingsActions(settings, maxAi, () => net.send({ type: 'settings', settings })),
      leave: () => this.showMain(),
      start: () => net.send({ type: 'start' }),
    });
  }
}
