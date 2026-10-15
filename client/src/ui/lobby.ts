import { getCar, MAX_CARS, type ServerMsg } from '@spidi/shared';
import { Game, type LocalPlayerCfg } from '../game';
import { KEYMAPS, SOLO_KEYMAP } from '../input';
import { Net } from '../net';
import type { App } from './app';
import { html } from './html';
import { playerActions, playerPanel, settingsActions, settingsBlock } from './widgets';

export function showOnlineSetup(app: App, error = '') {
  const n = app.prefs.onlineLocal;
  const refresh = () => app.showOnlineSetup();
  app.backdrop.show(app.prefs.trackId, Array.from({ length: n }, (_, k) => app.carOf(k, 'road')));
  app.setScreen('onlineSetup', html`
    <div class="menu panel wide">
      <h2>Netzwerkspiel</h2>
      <p class="hint">Alle Mitspieler öffnen im Browser die Adresse dieses Servers, z.B. <b>${location.host}</b>.
      Wer zuerst in der Lobby ist, wählt Strecke und Optionen.</p>
      ${error ? html`<div class="error">${error}</div>` : ''}
      <div class="toggle">
        <button class="${n === 1 ? 'sel' : ''}" data-a="one">1 Spieler an diesem Gerät</button>
        <button class="${n === 2 ? 'sel' : ''}" data-a="two">2 Spieler (Splitscreen)</button>
      </div>
      <div class="players">${playerPanel(app, 0, 'road')}${n > 1 ? playerPanel(app, 1, 'road') : ''}</div>
      <p class="hint">Wählt der Host eine Offroad- oder Micro-Strecke, suchst du dein Auto dieser Klasse direkt in der Lobby aus.</p>
      <div class="row"><button data-a="back">Zurück</button><button class="go" data-a="connect">Lobby betreten ▶</button></div>
    </div>`);
  app.bind({
    ...playerActions(app, refresh, () => 'road'),
    one: () => { app.prefs.onlineLocal = 1; app.savePrefs(); refresh(); },
    two: () => { app.prefs.onlineLocal = 2; app.savePrefs(); refresh(); },
    back: () => app.showMain(),
    connect: () => void connect(app),
  });
}

async function connect(app: App) {
  const net = new Net();
  app.setScreen('connecting', html`<div class="menu panel"><h2>Verbinde…</h2></div>`);
  try {
    await net.connect();
  } catch (e) {
    app.showOnlineSetup(`${(e as Error).message}. Läuft der Server (npm run dev / docker compose up)?`);
    return;
  }
  app.net = net;
  net.on((m) => onNet(app, m));
  net.onClose = () => {
    app.game?.dispose();
    app.game = null;
    app.net = null;
    app.showMain('Verbindung zum Server verloren.');
  };
  net.send({ type: 'join', players: app.lobbyPlayers('road') });
}

export function leaveNet(app: App) {
  app.lobbyNotice = '';
  app.net?.close();
  app.net = null;
  app.lobby = null;
}

function onNet(app: App, m: ServerMsg) {
  if (m.type === 'aborted') {
    app.lobbyNotice = `Das Rennen wurde von ${m.by} abgebrochen.`;
    if (app.game) {
      app.game.dispose();
      app.game = null;
    }
    if (app.screen !== 'onlineSetup' && app.screen !== 'main') app.showLobby();
    return;
  }
  if (m.type === 'lobby') {
    app.lobby = m;
    // track class changed by the host: switch to my car of that class
    if (m.phase === 'lobby') {
      const want = app.lobbyPlayers(app.classOf(m.settings.trackId));
      const mine = m.clients.find((c) => c.id === app.net!.clientId)?.players;
      if (mine && JSON.stringify(mine) !== JSON.stringify(want)) app.net!.send({ type: 'join', players: want });
    }
    if (app.screen === 'lobby' || app.screen === 'connecting') app.showLobby();
  } else if (m.type === 'start') {
    const me = app.net!.clientId;
    const mine = m.slots.filter((s) => s.ownerId === me && !s.isAI).sort((a, b) => a.id.localeCompare(b.id));
    if (mine.length === 0) return;
    const locals: LocalPlayerCfg[] = mine.map((s, k) => ({
      slotId: s.id, keymap: mine.length === 1 ? SOLO_KEYMAP : KEYMAPS[k], pad: k,
    }));
    const skill = app.lobby?.settings.aiSkill ?? 0.93;
    app.runGame(new Game(app.hudLayer, {
      trackId: m.trackId, laps: m.laps, slots: m.slots, locals, countdown: m.countdown, aiSkill: skill, net: app.net!,
    }));
  }
}

export function showLobby(app: App) {
  const l = app.lobby;
  const net = app.net;
  if (!l || !net) return;
  const isHost = l.hostId === net.clientId;
  const humans = l.clients.reduce((s, c) => s + c.players.length, 0);
  const maxAi = Math.max(0, MAX_CARS - humans);
  const cls = app.classOf(l.settings.trackId);
  app.backdrop.show(l.settings.trackId, app.lobbyPlayers(cls).map((p) => p.carId));
  const canPick = l.phase === 'lobby';
  const list = l.clients.map((c) => c.players.map((p, k) => {
    const mine = c.id === net.clientId;
    const arrows = (d: number, label: string) => (mine && canPick ? html`<button class="mini" data-a="lcar" data-k="${k}" data-d="${d}">${label}</button>` : '');
    return html`
    <li class="${mine ? 'me' : ''}"><i style="background:${getCar(p.carId).color}"></i>
      ${p.name} ${arrows(-1, '◀')}<small>${getCar(p.carId).name}</small>${arrows(1, '▶')}${c.id === l.hostId ? html` <em>Host</em>` : ''}</li>`;
  }));
  const settings = { ...l.settings };
  app.setScreen('lobby', html`
    <div class="menu panel wide">
      <h2>Lobby</h2>
      <div class="lobby">
        <div><h3>Fahrer (${humans})</h3><ul class="lobby-list">${list}</ul></div>
        <div>${settingsBlock(settings, isHost && l.phase === 'lobby', maxAi)}</div>
      </div>
      ${app.lobbyNotice ? html`<div class="notice">${app.lobbyNotice}</div>` : ''}
      ${l.phase === 'race' ? html`<p class="hint">Ein Rennen läuft gerade – du fährst beim nächsten Rennen mit.</p>` : ''}
      <div class="row">
        <button data-a="leave">Lobby verlassen</button>
        ${isHost && l.phase === 'race' ? html`<button class="danger" data-a="abort">Rennen für alle abbrechen</button>` : ''}
        ${isHost ? html`<button class="go" data-a="start" ${l.phase !== 'lobby' ? html`disabled` : ''}>Rennen starten ▶</button>` : html`<span class="hint">Warte auf den Host…</span>`}
      </div>
    </div>`);
  app.bind({
    ...settingsActions(settings, maxAi, () => net.send({ type: 'settings', settings })),
    leave: () => app.showMain(),
    lcar: (el) => {
      app.cycleCar(Number(el.dataset.k), cls, Number(el.dataset.d));
      net.send({ type: 'join', players: app.lobbyPlayers(cls) });
    },
    abort: (el) => app.confirmAbort(el),
    start: () => {
      app.lobbyNotice = '';
      net.send({ type: 'start' });
    },
  });
}
