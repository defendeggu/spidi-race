import { carsForClass, getTrack, type CarClass, type LobbyClient, type LobbyPlayer, type LobbySettings, type ResultRow } from '@spidi/shared';
import { audio } from '../audio';
import { typeCheat } from '../cheats';
import { Game } from '../game';
import { input } from '../input';
import type { Net } from '../net';
import { TownGame } from '../townGame';
import { Backdrop } from './backdrop';
import { html, setHtml, type SafeHtml } from './html';
import { leaveNet, showLobby, showOnlineSetup } from './lobby';
import { showMain, showSetup, startLocal } from './menus';
import { CAR_PREF, loadPrefs, savePrefs } from './prefs';
import { showLeaderboard, showResults, type BoardView } from './results';
import { showTownResults, showTownSetup, startTown } from './town';

export type Mode = 'single' | 'split';

/**
 * Menu and game orchestration. The screens live in menus / town / results / lobby; they receive
 * the App and reach each other only through its methods.
 */
export class App {
  readonly ui = document.getElementById('ui')!;
  readonly hudLayer = document.getElementById('hud')!;
  readonly backdrop = new Backdrop();
  readonly prefs = loadPrefs();
  game: Game | TownGame | null = null;
  net: Net | null = null;
  lobby: { hostId: string; phase: 'lobby' | 'race'; settings: LobbySettings; clients: LobbyClient[] } | null = null;
  lobbyNotice = '';
  screen = '';
  lastLocal: { mode: Mode } | null = null;
  /** starts the current local session again (pause menu) */
  restart: (() => void) | null = null;

  constructor() {
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('keydown', (e) => {
      if (this.screen === 'main' && !e.repeat && typeCheat(e.key)) audio.crash(14);
    });
    this.showMain();
  }

  savePrefs() {
    savePrefs(this.prefs);
  }

  setScreen(name: string, content: SafeHtml) {
    this.screen = name;
    this.ui.className = '';
    setHtml(this.ui, content);
  }

  bind(actions: Record<string, (el: HTMLElement) => void>) {
    this.ui.querySelectorAll<HTMLElement>('[data-a]').forEach((el) => {
      const fn = actions[el.dataset.a!];
      if (fn) el.addEventListener(el.tagName === 'SELECT' || el.tagName === 'INPUT' ? 'change' : 'click', () => fn(el));
    });
  }

  // ---------------------------------------------------------------- screens

  showMain(error = '') { showMain(this, error); }
  showSetup(mode: Mode) { showSetup(this, mode); }
  startLocal(mode: Mode) { startLocal(this, mode); }
  showTownSetup() { showTownSetup(this); }
  startTown() { startTown(this); }
  showResults(results: ResultRow[], ranks?: Record<string, number>) { showResults(this, results, ranks); }
  showLeaderboard(view: BoardView, back: () => void) { showLeaderboard(this, view, back); }
  showOnlineSetup(error = '') { showOnlineSetup(this, error); }
  showLobby() { showLobby(this); }
  leaveNet() { leaveNet(this); }

  // ---------------------------------------------------------------- cars of the players

  classOf(trackId: string): CarClass {
    return getTrack(trackId).carClass;
  }

  /** the car player k drives in the given class (falls back to a car of that class) */
  carOf(k: number, cls: CarClass) {
    const id = this.prefs.players[k][CAR_PREF[cls]];
    const pool = carsForClass(cls);
    return pool.some((c) => c.id === id) ? id! : pool[k % pool.length].id;
  }

  cycleCar(k: number, cls: CarClass, d: number) {
    const pool = carsForClass(cls);
    const i = pool.findIndex((c) => c.id === this.carOf(k, cls));
    this.prefs.players[k][CAR_PREF[cls]] = pool[(i + d + pool.length) % pool.length].id;
    this.savePrefs();
  }

  lobbyPlayers(cls: CarClass): LobbyPlayer[] {
    return this.prefs.players.slice(0, this.prefs.onlineLocal).map((p, k) => ({ name: p.name, carId: this.carOf(k, cls) }));
  }

  // ---------------------------------------------------------------- running a game

  runGame(game: Game | TownGame) {
    this.backdrop.hide();
    this.game?.dispose();
    this.game = game;
    this.ui.className = 'hidden';
    this.ui.innerHTML = '';
    this.screen = 'game';
    if (game instanceof Game) game.onFinish = (results, ranks) => this.showResults(results, ranks);
    else game.onFinish = (r) => showTownResults(this, game, r);
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
    this.setScreen('pause', html`
      <div class="menu panel overlay">
        <h2>Pause</h2>
        ${online ? html`<p class="hint">Im Netzwerkspiel läuft das Rennen weiter.</p>` : ''}
        <button class="big" data-a="resume">Weiter</button>
        ${g instanceof TownGame ? html`<button class="big" data-a="reset">Auto zum Start</button>` : ''}
        ${online ? '' : html`<button class="big" data-a="restart">Neustart</button>`}
        ${online && host ? html`<button class="big danger" data-a="abort">Rennen für alle abbrechen</button>` : ''}
        <button class="big secondary" data-a="quit">${online ? 'Netzwerkspiel verlassen' : 'Hauptmenü'}</button>
      </div>`);
    this.ui.classList.add('dim');
    this.bind({
      resume: () => this.resume(),
      reset: () => {
        if (g instanceof TownGame) g.resetCars();
        this.resume();
      },
      restart: () => this.restart?.(),
      abort: (el) => this.confirmAbort(el),
      quit: () => this.quitGame(),
    });
  }

  private isHost() {
    return !!this.net && this.lobby?.hostId === this.net.clientId;
  }

  /** First click asks for confirmation, the second one tells the server to abort the race. */
  confirmAbort(el: HTMLElement) {
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
    this.game.setEngineVolume(1);
    this.ui.className = 'hidden';
    this.ui.innerHTML = '';
    this.screen = 'game';
    input.clearPressed();
  }

  quitGame() {
    this.game?.dispose();
    this.game = null;
    this.showMain();
  }
}
