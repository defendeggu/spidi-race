import { carRatings, getCar, TRACK_DEFS, type CarClass } from '@spidi/shared';
import type { App } from './app';
import { html } from './html';
import { SKILLS } from './prefs';

export interface RaceSettings {
  trackId: string;
  laps: number;
  aiCount: number;
  aiSkill: number;
}

const CLASS_LABEL: Partial<Record<CarClass, string>> = { offroad: 'Offroad · ', micro: 'Micro · ', town: 'Stadt · ', kart: 'Kart · ' };

/** Name and car of player k, with the car's ratings. */
export function playerPanel(app: App, k: number, cls: CarClass) {
  const p = app.prefs.players[k];
  const car = getCar(app.carOf(k, cls));
  const r = carRatings(car);
  const bar = (label: string, v: number) => html`<div class="stat"><span>${label}</span><div class="bar"><i style="width:${v * 100}%"></i></div></div>`;
  return html`
    <div class="player-panel">
      <h3>Spieler ${k + 1}</h3>
      <input class="name" data-a="name" data-k="${k}" maxlength="16" value="${p.name}" />
      <div class="car-select">
        <button class="arrow" data-a="carPrev" data-k="${k}">◀</button>
        <div class="car-name"><i style="background:${car.color}"></i>${car.name}</div>
        <button class="arrow" data-a="carNext" data-k="${k}">▶</button>
      </div>
      <div class="car-desc">${car.description}</div>
      ${bar('Tempo', r.speed)}${bar('Beschl.', r.accel)}${bar('Handling', r.handling)}${bar('Bremsen', r.brakes)}
      <div class="car-top">${CLASS_LABEL[cls] ?? ''}Spitze ca. ${Math.round(car.topSpeed * 3.6 * 0.92)} km/h</div>
    </div>`;
}

export function playerActions(app: App, refresh: () => void, cls: () => CarClass) {
  const cycle = (el: HTMLElement, d: number) => {
    app.cycleCar(Number(el.dataset.k), cls(), d);
    refresh();
  };
  return {
    name: (el: HTMLElement) => {
      const k = Number(el.dataset.k);
      app.prefs.players[k].name = (el as HTMLInputElement).value.trim().slice(0, 16) || `Spieler ${k + 1}`;
      app.savePrefs();
    },
    carPrev: (el: HTMLElement) => cycle(el, -1),
    carNext: (el: HTMLElement) => cycle(el, 1),
  };
}

/** Track choice, laps, AI count and skill. */
export function settingsBlock(s: RaceSettings, editable: boolean, maxAi: number, tracks = TRACK_DEFS) {
  const dis = !editable;
  const badge = (cls: CarClass | undefined) =>
    cls === 'offroad' ? html` <em class="badge">OFFROAD</em>` : cls === 'micro' ? html` <em class="badge micro">MICRO</em>` : '';
  return html`
    <div class="settings">
      <div class="tracks">
        ${tracks.map((t) => html`
          <button class="track ${t.id === s.trackId ? 'sel' : ''} ${t.theme}" data-a="track" data-id="${t.id}" ${dis ? html`disabled` : ''}>
            <b>${t.name}${badge(t.class)}</b><span>${t.description}</span>
          </button>`)}
      </div>
      <div class="opts">
        <label>Runden <span class="stepper"><button data-a="lapsDown" ${dis ? html`disabled` : ''}>−</button><b>${s.laps}</b><button data-a="lapsUp" ${dis ? html`disabled` : ''}>+</button></span></label>
        <label>Computergegner <span class="stepper"><button data-a="aiDown" ${dis ? html`disabled` : ''}>−</button><b>${Math.min(s.aiCount, maxAi)}</b><button data-a="aiUp" ${dis ? html`disabled` : ''}>+</button></span></label>
        <label>KI-Stärke <select data-a="skill" ${dis ? html`disabled` : ''}>${SKILLS.map((k) => html`<option value="${k.v}" ${Math.abs(k.v - s.aiSkill) < 0.001 ? html`selected` : ''}>${k.label}</option>`)}</select></label>
      </div>
    </div>`;
}

export function settingsActions(s: RaceSettings, maxAi: number, changed: () => void) {
  return {
    track: (el: HTMLElement) => { s.trackId = el.dataset.id!; changed(); },
    lapsDown: () => { s.laps = Math.max(1, s.laps - 1); changed(); },
    lapsUp: () => { s.laps = Math.min(10, s.laps + 1); changed(); },
    aiDown: () => { s.aiCount = Math.max(0, Math.min(maxAi, s.aiCount) - 1); changed(); },
    aiUp: () => { s.aiCount = Math.min(maxAi, s.aiCount + 1); changed(); },
    skill: (el: HTMLElement) => { s.aiSkill = Number((el as HTMLSelectElement).value); changed(); },
  };
}
