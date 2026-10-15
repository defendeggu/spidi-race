import { getCar } from '@spidi/shared';
import { BattleGame, type BattleResult } from '../battleGame';
import { KEYMAPS, SOLO_KEYMAP } from '../input';
import type { App } from './app';
import { html } from './html';

export function startBattle(app: App) {
  const pr = app.prefs;
  const humans = pr.kartPlayers === 2 ? 2 : 1;
  app.lastLocal = null;
  app.restart = () => app.startBattle();
  app.runGame(new BattleGame(app.hudLayer, {
    players: Array.from({ length: humans }, (_, k) => ({
      name: pr.players[k].name, carId: app.carOf(k, 'kart'), keymap: humans === 1 ? SOLO_KEYMAP : KEYMAPS[k], pad: k,
    })),
    bots: Math.max(0, Math.min(4, pr.kartBots)),
  }));
}

export function showBattleResults(app: App, game: BattleGame, r: BattleResult) {
  game.setEngineVolume(0.25);
  const win = r.rows.find((x) => x.id === r.winner);
  app.setScreen('results', html`
    <div class="menu panel overlay">
      <h2>${win ? `${win.name} gewinnt!` : 'Unentschieden!'}</h2>
      <table class="results"><tr><th>#</th><th>Fahrer</th><th>Kart</th><th>Ballons</th><th>Treffer</th></tr>
        ${r.rows.map((x) => html`<tr class="${x.human ? 'me' : ''}"><td>${x.place}</td><td>${x.name}${x.human ? '' : html` <small>KI</small>`}</td>
          <td>${getCar(x.carId).name}</td><td>${x.balloons ? '🎈'.repeat(x.balloons) : '–'}</td><td>${x.hitsGiven}</td></tr>`)}
      </table>
      <div class="row">
        <button class="go" data-a="again">Nochmal</button>
        <button data-a="menu">Hauptmenü</button>
      </div>
    </div>`);
  app.ui.classList.add('dim');
  app.bind({ again: () => app.startBattle(), menu: () => app.quitGame() });
}
