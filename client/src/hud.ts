import { formatTime, getCar, type Race, type Track } from '@spidi/shared';
import { CAMERA_MODES } from './render/cameras';

export interface MapDot {
  x: number;
  z: number;
  color: string;
  self: boolean;
}

/** HTML overlay for one viewport. */
export class Hud {
  readonly root: HTMLDivElement;
  private el: Record<string, HTMLElement> = {};
  private map: HTMLCanvasElement;
  private mapBg: HTMLCanvasElement;
  private msgTimer = 0;
  private lastCount = '';
  private mapScale = 1;
  private mapOx = 0;
  private mapOz = 0;

  constructor(parent: HTMLElement, private track: Track, private entryId: string, compact: boolean) {
    this.root = document.createElement('div');
    this.root.className = 'hud' + (compact ? ' compact' : '');
    this.root.innerHTML = `
      <div class="hud-tl">
        <div class="hud-pos"><span data-k="pos">1</span><small>/<span data-k="cnt">1</span></small></div>
        <div class="hud-lap">RUNDE <span data-k="lap">1/3</span></div>
        <div class="hud-times">
          <div>ZEIT <span data-k="time">0:00.00</span></div>
          <div>LETZTE <span data-k="last">--:--.--</span></div>
          <div>BESTE <span data-k="best">--:--.--</span></div>
        </div>
      </div>
      <div class="hud-standings" data-k="standings"></div>
      <div class="hud-center" data-k="center"></div>
      <div class="hud-msg" data-k="msg"></div>
      <div class="hud-br">
        <div class="hud-speed"><span data-k="speed">0</span><small>km/h</small></div>
        <div class="hud-gear">GANG <span data-k="gear">1</span></div>
        <div class="hud-rpm"><div data-k="rpm"></div></div>
      </div>`;
    this.root.querySelectorAll<HTMLElement>('[data-k]').forEach((e) => (this.el[e.dataset.k!] = e));
    const size = compact ? 120 : 170;
    this.mapBg = document.createElement('canvas');
    this.map = document.createElement('canvas');
    this.map.className = 'hud-map';
    this.map.width = this.map.height = this.mapBg.width = this.mapBg.height = size;
    this.root.appendChild(this.map);
    parent.appendChild(this.root);
    this.drawMapBackground(size);
  }

  private drawMapBackground(size: number) {
    const t = this.track, b = t.bounds;
    const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
    this.mapScale = (size - 16) / span;
    this.mapOx = 8 + (size - 16 - (b.maxX - b.minX) * this.mapScale) / 2 - b.minX * this.mapScale;
    this.mapOz = 8 + (size - 16 - (b.maxZ - b.minZ) * this.mapScale) / 2 - b.minZ * this.mapScale;
    const g = this.mapBg.getContext('2d')!;
    g.lineJoin = 'round';
    g.beginPath();
    for (let i = 0; i <= t.n; i += 2) {
      const k = i % t.n;
      const [x, y] = this.toMap(t.px[k], t.pz[k]);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = 6;
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 2.5;
    g.stroke();
    const [sx, sy] = this.toMap(t.px[0], t.pz[0]);
    g.fillStyle = '#ffcc00';
    g.fillRect(sx - 3, sy - 3, 6, 6);
  }

  private toMap(x: number, z: number): [number, number] {
    // view from above with x to the right: flip x so the map matches the driving view (z forward = up)
    return [this.map.width - (x * this.mapScale + this.mapOx), this.map.height - (z * this.mapScale + this.mapOz)];
  }

  flash(text: string, seconds = 2) {
    this.el.msg.textContent = text;
    this.el.msg.classList.add('show');
    this.msgTimer = seconds;
  }

  update(race: Race, speed: number, gear: number, rpm: number, dots: MapDot[], wrongWay: boolean, dt: number) {
    const e = race.entry(this.entryId);
    if (!e) return;
    const n = race.entries.length;
    this.el.pos.textContent = String(e.position);
    this.el.cnt.textContent = String(n);
    this.el.lap.textContent = `${race.displayLap(e)}/${race.laps}`;
    const lapTime = e.finished ? e.lastLap : race.phase === 'countdown' ? 0 : race.time - e.lapStart;
    this.el.time.textContent = formatTime(Math.max(0.0001, lapTime));
    this.el.last.textContent = formatTime(e.lastLap);
    this.el.best.textContent = formatTime(e.bestLap);
    this.el.speed.textContent = String(Math.round(Math.abs(speed) * 3.6));
    this.el.gear.textContent = gear === 0 ? 'R' : String(gear);
    (this.el.rpm as HTMLElement).style.width = `${Math.min(100, (rpm / 7600) * 100)}%`;
    this.el.rpm.classList.toggle('red', rpm > 6900);

    let center = '';
    if (race.phase === 'countdown') center = race.countdown > 3 ? 'BEREIT' : String(Math.ceil(race.countdown));
    else if (race.time < 1) center = 'LOS!';
    else if (e.finished) center = e.position === 1 ? 'SIEG!' : `ZIEL – PLATZ ${e.position}`;
    else if (wrongWay) center = 'FALSCHE RICHTUNG';
    if (center !== this.lastCount) {
      this.el.center.textContent = center;
      this.el.center.className = 'hud-center' + (center ? ' show' : '') + (wrongWay && !e.finished ? ' warn' : '');
      this.lastCount = center;
    }

    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) this.el.msg.classList.remove('show');
    }

    const rows = [...race.entries].sort((a, b) => a.position - b.position).slice(0, 8);
    this.el.standings.innerHTML = rows
      .map((r) => `<div class="${r.id === this.entryId ? 'me' : ''}"><b>${r.position}</b><i style="background:${getCar(r.carId).color}"></i>${escapeHtml(r.name)}${r.finished ? ' ✔' : ''}</div>`)
      .join('');

    const g = this.map.getContext('2d')!;
    g.clearRect(0, 0, this.map.width, this.map.height);
    g.drawImage(this.mapBg, 0, 0);
    for (const d of [...dots].sort((a, b) => Number(a.self) - Number(b.self))) {
      const [x, y] = this.toMap(d.x, d.z);
      g.beginPath();
      g.arc(x, y, d.self ? 5 : 3.5, 0, Math.PI * 2);
      g.fillStyle = d.color;
      g.fill();
      g.lineWidth = d.self ? 2 : 1;
      g.strokeStyle = d.self ? '#fff' : '#000';
      g.stroke();
    }
  }

  showCameraMode(mode: number) {
    this.flash(`Kamera: ${CAMERA_MODES[mode]}`, 1.2);
  }

  dispose() {
    this.root.remove();
  }
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
