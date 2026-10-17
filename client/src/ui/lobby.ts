import { BATTLE_BOT_NAMES, BATTLE_MAX_KARTS, getCar, MAX_CARS, TRACK_DEFS, type CarClass, type LobbySettings, type ServerMsg } from '@spidi/shared';
import { BattleGame } from '../battleGame';
import { Game, type LocalPlayerCfg } from '../game';
import { KEYMAPS, SOLO_KEYMAP } from '../input';
import { Net } from '../net';
import type { App } from './app';
import { html } from './html';
import { playerActions, playerPanel, settingsActions, settingsBlock } from './widgets';

/** karts race on road and offroad tracks */
const KART_TRACKS = TRACK_DEFS.filter((t) => (t.class ?? 'road') !== 'micro');

/** The car class of the lobby: karts in a kart race, otherwise the track's class. */
function lobbyClass(app: App, s: LobbySettings): CarClass {
  return s.kart ? 'kart' : app.classOf(s.trackId);
}

/** Name field of local player k (the vehicle is chosen in the lobby, once the kind of race is known). */
function nameField(app: App, k: number) {
  return html`
    <label class="name-field"><span>Spieler ${k + 1}</span>
      <input class="name" data-a="name" data-k="${k}" maxlength="16" value="${app.prefs.players[k].name}" /></label>`;
}

export function showOnlineSetup(app: App, error = '') {
  const n = app.prefs.onlineLocal;
  const refresh = () => app.showOnlineSetup();
  app.backdrop.show(app.prefs.trackId, Array.from({ length: n }, (_, k) => app.carOf(k, 'road')));
  app.setScreen('onlineSetup', html`
    <div class="menu panel">
      <h2>Netzwerkspiel</h2>
      <p class="hint">Alle Mitspieler öffnen im Browser die Adresse dieses Servers: <b>${location.host}</b>.
      Wer zuerst in der Lobby ist, ist <b>Host</b>: Er stellt Strecke und Rennart ein und startet das Rennen, sobald alle da sind.
      Dein Fahrzeug wählst du in der Lobby – passend zur Rennart.</p>
      ${error ? html`<div class="error">${error}</div>` : ''}
      <div class="toggle">
        <button class="${n === 1 ? 'sel' : ''}" data-a="one">1 Spieler an diesem Gerät</button>
        <button class="${n === 2 ? 'sel' : ''}" data-a="two">2 Spieler (Splitscreen)</button>
      </div>
      <div class="names">${nameField(app, 0)}${n > 1 ? nameField(app, 1) : ''}</div>
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
    const before = app.lobby;
    app.lobby = m;
    // the host learns in the race that somebody is waiting in the lobby
    if (m.phase === 'race' && m.hostId === app.net!.clientId && app.game && 'notify' in app.game) {
      const known = new Set(before?.clients.map((c) => c.id));
      for (const c of m.clients) {
        if (c.racing || known.has(c.id)) continue;
        const who = c.players.map((p) => p.name).join(' & ');
        app.game.notify(`${who} wartet in der Lobby – Esc: Rennen abbrechen`, 5);
      }
    }
    // track class changed by the host: switch to my car of that class
    if (m.phase === 'lobby') {
      const want = app.lobbyPlayers(lobbyClass(app, m.settings));
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
    if (m.battle) {
      app.runGame(new BattleGame(app.hudLayer, {
        players: mine.map((s, k) => ({ name: s.name, carId: s.carId, keymap: locals[k].keymap, pad: k, slotId: s.id })),
        bots: 0, net: app.net!, slots: m.slots,
      }));
      return;
    }
    const skill = app.lobby?.settings.aiSkill ?? 0.93;
    app.runGame(new Game(app.hudLayer, {
      trackId: m.trackId, laps: m.laps, slots: m.slots, locals, countdown: m.countdown, aiSkill: skill, net: app.net!, kart: !!m.kart,
    }));
  }
}

export function showLobby(app: App) {
  const l = app.lobby;
  const net = app.net;
  if (!l || !net) return;
  const isHost = l.hostId === net.clientId;
  const humans = l.clients.reduce((s, c) => s + c.players.length, 0);
  const battle = !!l.settings.kart && !!l.settings.battle;
  const maxAi = battle ? Math.max(0, Math.min(BATTLE_BOT_NAMES.length, BATTLE_MAX_KARTS - humans)) : Math.max(0, MAX_CARS - humans);
  const cls = lobbyClass(app, l.settings);
  const kart = !!l.settings.kart;
  const editable = isHost && l.phase === 'lobby';
  const me = l.clients.find((c) => c.id === net.clientId);
  const guests = l.clients.filter((c) => c.id !== l.hostId);
  const readyGuests = guests.filter((c) => c.ready).length;
  const racing = l.phase === 'race';
  app.backdrop.show(l.settings.trackId, app.lobbyPlayers(cls).map((p) => p.carId));

  const status = (c: (typeof l.clients)[number]) =>
    racing
      ? c.racing ? html`<em class="st racing">fährt</em>` : html`<em class="st wait">wartet aufs nächste Rennen</em>`
      : c.id === l.hostId ? html`<em>Host</em>`
        : c.ready ? html`<em class="st ready">✔ bereit</em>` : html`<em class="st wait">noch nicht bereit</em>`;
  const list = l.clients.map((c) => c.players.map((p, k) => html`
    <li class="${c.id === net.clientId ? 'me' : ''}"><i style="background:${getCar(p.carId).color}"></i>
      ${p.name} <small>${getCar(p.carId).name}</small>${k === 0 ? status(c) : ''}</li>`));

  const kindLabel = battle ? 'Kart-Battle' : kart ? 'Kart-Rennen' : cls === 'offroad' ? 'Offroad-Rennen' : cls === 'micro' ? 'Micro-Rennen' : 'Autorennen';
  const startLabel = battle ? 'Battle starten' : 'Rennen starten';
  const allReady = guests.length > 0 && readyGuests === guests.length;
  const settings = { ...l.settings };
  app.setScreen('lobby', html`
    <div class="menu panel wide">
      <h2>Lobby <small class="kind">${kindLabel}</small></h2>
      <p class="hint">Mitspieler öffnen <b>${location.host}</b> und wählen <b>Netzwerkspiel</b>.</p>
      <div class="lobby">
        <div>
          <h3>Fahrer (${humans})</h3>
          <ul class="lobby-list">${list}</ul>
          ${guests.length === 0 && isHost && !racing ? html`<p class="hint waiting">Warte auf Mitspieler …</p>` : ''}
        </div>
        <div>
          <div class="toggle">
            <button class="${!kart ? 'sel' : ''}" data-a="kind" data-id="cars" ${!editable ? html`disabled` : ''}>Autorennen</button>
            <button class="${kart && !battle ? 'sel' : ''}" data-a="kind" data-id="kart" ${!editable ? html`disabled` : ''}>Kart-Rennen mit Items</button>
            <button class="${battle ? 'sel' : ''}" data-a="kind" data-id="battle" ${!editable ? html`disabled` : ''}>Kart-Battle in der Stadt</button>
          </div>
          ${battle
            ? html`
              <p class="hint">Jedes Kart hat 3 Ballons. Jeder Treffer kostet einen, wer ins Hafenbecken fällt, verliert alle.
              Wer zuletzt noch Ballons hat, gewinnt – spätestens nach 3 Minuten. Bis zu ${BATTLE_MAX_KARTS} Karts.</p>
              <div class="opts"><label>Computer-Karts <span class="stepper">
                <button data-a="aiDown" ${!editable ? html`disabled` : ''}>−</button><b>${Math.min(settings.aiCount, maxAi)}</b>
                <button data-a="aiUp" ${!editable ? html`disabled` : ''}>+</button></span></label></div>`
            : settingsBlock(settings, editable, maxAi, kart ? KART_TRACKS : TRACK_DEFS)}
        </div>
      </div>
      ${me && !racing ? html`
        <h3>Dein ${cls === 'kart' ? 'Kart' : 'Fahrzeug'} für dieses Rennen</h3>
        <div class="players">${me.players.map((_, k) => playerPanel(app, k, cls))}</div>` : ''}
      ${app.lobbyNotice ? html`<div class="notice">${app.lobbyNotice}</div>` : ''}
      ${racing ? html`<p class="hint">Ein Rennen läuft gerade${me?.racing ? '' : ' – du fährst beim nächsten Rennen mit'}.</p>` : ''}
      <div class="row">
        <button data-a="leave">Lobby verlassen</button>
        ${isHost && racing ? html`<button class="danger" data-a="abort">Rennen für alle abbrechen</button>` : ''}
        ${isHost
          ? html`<button class="go" data-a="start" ${racing ? html`disabled` : ''}>${startLabel}${guests.length ? ` (${readyGuests}/${guests.length} bereit)` : ''} ▶</button>`
          : racing ? ''
            : html`<span class="hint">Der Host startet das Rennen.</span>
              <button class="${me?.ready ? 'sel' : 'go'}" data-a="ready">${me?.ready ? '✔ Bereit – zurücknehmen' : 'Bereit ✔'}</button>`}
      </div>
    </div>`);
  // name changes and vehicle choice go to the server right away
  const actions = playerActions(app, () => {
    net.send({ type: 'join', players: app.lobbyPlayers(cls) });
    showLobby(app);
  }, () => cls);
  app.bind({
    ...settingsActions(settings, maxAi, () => net.send({ type: 'settings', settings })),
    ...actions,
    name: (el) => {
      actions.name(el);
      net.send({ type: 'join', players: app.lobbyPlayers(cls) });
    },
    kind: (el) => {
      settings.kart = el.dataset.id === 'kart' || el.dataset.id === 'battle';
      settings.battle = el.dataset.id === 'battle';
      if (settings.kart && !KART_TRACKS.some((t) => t.id === settings.trackId)) settings.trackId = KART_TRACKS[0].id;
      net.send({ type: 'settings', settings });
    },
    leave: () => app.showMain(),
    ready: () => net.send({ type: 'ready', ready: !me?.ready }),
    abort: (el) => app.confirmAbort(el),
    start: (el) => {
      // nobody else there yet, or not everybody ready: ask once more
      if (!allReady && !el.dataset.armed) {
        el.dataset.armed = '1';
        el.textContent = guests.length === 0 ? 'Noch allein – trotzdem starten?' : `Erst ${readyGuests}/${guests.length} bereit – trotzdem starten?`;
        setTimeout(() => {
          if (el.isConnected && el.dataset.armed) showLobby(app);
        }, 4000);
        return;
      }
      app.lobbyNotice = '';
      net.send({ type: 'start' });
    },
  });
}
