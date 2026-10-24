import { FREIGHT_PATH, HARBOR, LINES, OFFROAD_PARK, RAIL, SBAHN_PATH, TOWN_AIRPORT, TOWN_BOUNDS, TOWN_RAIL, type CarInput, type KartState, type TownMap, type TownTask } from '@spidi/shared';
import { ItemSlot } from './itemSlot';
import { CAMERA_MODES } from './render/cameras';
import { getPadThrottle, type KeyMap } from './input';
import type { PadKind } from './padMapping';
import { html, setHtml } from './ui/html';

export interface TownDot {
  x: number;
  z: number;
  color: string;
  kind: 'self' | 'player' | 'traffic' | 'target';
}

const KEY_LABEL: Record<string, string> = {
  KeyW: 'W', KeyA: 'A', KeyS: 'S', KeyD: 'D', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Space: 'Leertaste', ControlRight: 'Strg', ShiftRight: 'Shift', Numpad0: 'Num 0',
};
const label = (codes: string[]) => codes.map((c) => KEY_LABEL[c] ?? c).slice(0, 2).join(' / ');

const TASK_TITLE: Record<TownTask, string> = { free: 'FREIE FAHRT', stars: 'STERNE', parking: 'EINPARKEN' };

/** HTML overlay for one player in the practice town: speed, goal arrow, town map and a controls helper. */
export class TownHud {
  readonly root: HTMLDivElement;
  private el: Record<string, HTMLElement> = {};
  private map: HTMLCanvasElement;
  private mapBg: HTMLCanvasElement;
  private msgTimer = 0;
  private scale = 1;
  private help = true;
  private padMode: PadKind | null | undefined = undefined;
  private lastCenter = '';

  private item: ItemSlot;

  /** title: replaces the task title (kart battle) */
  constructor(parent: HTMLElement, private town: TownMap, task: TownTask, duel: boolean, private keymap: KeyMap, compact: boolean, title?: string) {
    this.root = document.createElement('div');
    this.root.className = 'hud town-hud' + (compact ? ' compact' : '');
    setHtml(this.root, html`
      <div class="hud-tl">
        <div class="town-task">${title ?? html`${duel ? 'DUELL · ' : ''}${TASK_TITLE[task]}`}</div>
        <div class="town-count" data-k="count"></div>
        <div class="town-time" data-k="time"></div>
        <div class="town-standings" data-k="standings"></div>
      </div>
      <div class="hud-center" data-k="center"></div>
      <div class="town-goal" data-k="goal">
        <svg viewBox="-20 -20 40 40" data-k="arrow"><path d="M0,-17 L13,9 L0,3 L-13,9 Z" /></svg>
        <div data-k="dist"></div>
        <div class="town-park"><div data-k="park"></div></div>
      </div>
      <div class="hud-msg" data-k="msg"></div>
      <div class="town-help" data-k="help"></div>
      <div class="hud-br">
        <div class="hud-speed"><span data-k="speed">0</span><small>km/h</small></div>
        <div class="hud-gear">GANG <span data-k="gear">1</span></div>
      </div>`);
    this.root.querySelectorAll<HTMLElement>('[data-k]').forEach((e) => (this.el[e.dataset.k!] = e));
    if (task === 'free') this.el.goal.style.display = 'none';
    const size = compact ? 140 : 200;
    this.mapBg = document.createElement('canvas');
    this.map = document.createElement('canvas');
    this.map.className = 'hud-map';
    this.map.width = this.map.height = this.mapBg.width = this.mapBg.height = size;
    this.root.appendChild(this.map);
    this.item = new ItemSlot(this.root);
    parent.appendChild(this.root);
    this.drawMapBackground(size);
  }

  private toMap(x: number, z: number): [number, number] {
    // same orientation as the race minimap: x flipped, +z up; centred on the town incl. harbour and railway
    const { minX, maxX, minZ, maxZ } = TOWN_BOUNDS;
    const h = this.map.width / 2;
    return [h - (x - (minX + maxX) / 2) * this.scale, h - (z - (minZ + maxZ) / 2) * this.scale];
  }

  private drawMapBackground(size: number) {
    const { minX, maxX, minZ, maxZ } = TOWN_BOUNDS;
    this.scale = (size - 8) / Math.max(maxX - minX, maxZ - minZ);
    const g = this.mapBg.getContext('2d')!;
    const rect = (x0: number, z0: number, x1: number, z1: number, color: string) => {
      const [a, b] = this.toMap(x1, z1), [c, d] = this.toMap(x0, z0);
      g.fillStyle = color;
      g.fillRect(a, b, c - a, d - b);
    };
    // harbour apron, water strip below the quay, railway line with station
    rect(minX, HARBOR.quayZ, maxX, -LINES[LINES.length - 1] - 8, 'rgba(150,150,150,0.55)');
    rect(minX, HARBOR.quayZ - 12, maxX, HARBOR.quayZ, 'rgba(60,140,210,0.85)');
    const f = RAIL.forecourt, af = TOWN_RAIL.airportForecourt;
    rect(f.x0, f.z0, f.x1, f.z1, 'rgba(150,150,150,0.6)');
    rect(af.x0, af.z0, af.x1, af.z1, 'rgba(150,150,150,0.6)');
    // both tracks: the S-Bahn to the airport, the freight line between the tunnels
    g.strokeStyle = 'rgba(80,70,60,0.9)';
    g.lineWidth = 2;
    // the offroad park loop (dirt brown, wider)
    g.strokeStyle = 'rgba(170,110,60,0.95)';
    g.lineWidth = 3;
    g.beginPath();
    OFFROAD_PARK.loop.forEach(([x, z], i) => {
      const [mx, my] = this.toMap(x, z);
      if (i === 0) g.moveTo(mx, my);
      else g.lineTo(mx, my);
    });
    g.stroke();
    g.strokeStyle = 'rgba(80,70,60,0.9)';
    g.lineWidth = 2;
    for (const path of [SBAHN_PATH, FREIGHT_PATH]) {
      g.beginPath();
      path.points.forEach((p, i) => {
        const [mx, my] = this.toMap(p.x, p.z);
        if (i === 0) g.moveTo(mx, my);
        else if (i % 8 === 0 || i === path.points.length - 1) g.lineTo(mx, my);
      });
      g.stroke();
    }
    // airfield: landside and apron, taxiway with its links, runway
    const A = TOWN_AIRPORT, ap = A.apron, ls = A.landside, r = A.runway, t = A.taxiway;
    rect(ls.x0, ls.z0, ap.x1, ap.z1, 'rgba(160,160,160,0.6)');
    rect(t.x - t.width / 2, t.z0, t.x + t.width / 2, t.z1, 'rgba(110,110,110,0.8)');
    for (const l of A.links) rect(t.x, l - t.width / 2, r.x, l + t.width / 2, 'rgba(110,110,110,0.8)');
    rect(r.x - r.width / 2, r.z0, r.x + r.width / 2, r.z1, 'rgba(225,225,220,0.9)');
    const colors: Record<string, string> = {
      house: 'rgba(200,190,170,0.55)', shop: 'rgba(170,170,180,0.6)', tower: 'rgba(120,130,150,0.7)',
      park: 'rgba(80,160,70,0.75)', parking: 'rgba(90,140,220,0.75)', practice: 'rgba(240,200,40,0.75)',
      brick: 'rgba(190,110,80,0.6)', oldtown: 'rgba(210,160,110,0.6)', plaza: 'rgba(230,200,150,0.7)',
      industry: 'rgba(140,130,110,0.7)', power: 'rgba(110,100,90,0.8)', supermarket: 'rgba(230,70,60,0.85)',
      towerplaza: 'rgba(170,190,210,0.7)', skate: 'rgba(200,200,200,0.85)', church: 'rgba(120,160,110,0.75)',
      emergency: 'rgba(210,60,50,0.8)',
    };
    for (const b of this.town.blocks) {
      const [x0, y0] = this.toMap(b.cx + 45, b.cz + 45);
      g.fillStyle = colors[b.kind];
      g.fillRect(x0, y0, 90 * this.scale, 90 * this.scale);
    }
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = Math.max(1.5, 10 * this.scale);
    const ext = LINES[LINES.length - 1] + 5;
    g.beginPath();
    for (const L of LINES) {
      let [a, b] = this.toMap(-ext, L);
      let [c, d] = this.toMap(ext, L);
      g.moveTo(a, b);
      g.lineTo(c, d);
      [a, b] = this.toMap(L, -ext);
      [c, d] = this.toMap(L, ext);
      g.moveTo(a, b);
      g.lineTo(c, d);
    }
    g.stroke();
  }

  flash(text: string, seconds = 2) {
    this.el.msg.textContent = text;
    this.el.msg.classList.add('show');
    this.msgTimer = seconds;
  }

  /** Kart battle: item slot and the list of karts with their balloons. */
  updateBattle(ks: KartState | undefined, rows: { name: string; color: string; balloons: number; me: boolean }[], dt: number) {
    this.item.update(ks, dt);
    setHtml(this.el.standings, html`${rows.map((r) => html`<div class="${r.me ? 'me' : ''} ${r.balloons ? '' : 'out'}"><i style="background:${r.color}"></i>${r.name} <b>${r.balloons ? '🎈'.repeat(r.balloons) : '✗'}</b></div>`)}`);
  }

  toggleHelp() {
    this.help = !this.help;
    this.el.help.style.display = this.help ? '' : 'none';
  }

  showCameraMode(mode: number) {
    this.flash(`Kamera: ${CAMERA_MODES[mode]}`, 1.2);
  }

  /**
   * arrow: direction to the goal in screen terms (radians, clockwise from up) or null without a goal.
   */
  update(speed: number, gear: number, status: { count: string; time: string; center: string; warn?: boolean }, arrow: number | null, dist: number, park: number,
    inp: CarInput, pad: PadKind | null, dots: TownDot[], dt: number) {
    this.el.speed.textContent = String(Math.round(Math.abs(speed) * 3.6));
    this.el.gear.textContent = gear === 0 ? 'R' : String(gear);
    this.el.count.textContent = status.count;
    this.el.time.textContent = status.time;
    const key = status.center + (status.warn ? '!' : '');
    if (key !== this.lastCenter) {
      this.lastCenter = key;
      this.el.center.textContent = status.center;
      // warnings blink red like the wrong-way warning on the race tracks
      this.el.center.className = 'hud-center' + (status.center ? ' show' : '') + (status.warn ? ' warn' : '');
    }
    this.el.goal.style.visibility = arrow === null ? 'hidden' : 'visible';
    if (arrow !== null) {
      this.el.arrow.style.transform = `rotate(${arrow}rad)`;
      this.el.dist.textContent = dist < 15 ? 'fast da!' : `${Math.round(dist / 5) * 5} m`;
      this.el.park.style.width = `${park * 100}%`;
      this.el.park.parentElement!.style.visibility = park > 0 ? 'visible' : 'hidden';
    }
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) this.el.msg.classList.remove('show');
    }
    this.updateHelp(inp, pad);

    const g = this.map.getContext('2d')!;
    g.clearRect(0, 0, this.map.width, this.map.height);
    g.drawImage(this.mapBg, 0, 0);
    const order = { traffic: 0, player: 1, target: 2, self: 3 };
    for (const d of [...dots].sort((a, b) => order[a.kind] - order[b.kind])) {
      const [x, y] = this.toMap(d.x, d.z);
      g.beginPath();
      if (d.kind === 'target') {
        star(g, x, y, 7, 3);
      } else {
        g.arc(x, y, d.kind === 'self' ? 5 : d.kind === 'player' ? 4 : 2.2, 0, Math.PI * 2);
      }
      g.fillStyle = d.color;
      g.fill();
      if (d.kind !== 'traffic') {
        g.lineWidth = d.kind === 'self' ? 2 : 1;
        g.strokeStyle = d.kind === 'self' ? '#fff' : '#000';
        g.stroke();
      }
    }
  }

  /** Keys (or gamepad controls) light up while they are used. */
  private updateHelp(inp: CarInput, pad: PadKind | null) {
    if (pad !== this.padMode) {
      this.padMode = pad;
      const k = this.keymap;
      const ps = pad === 'playstation';
      const stick = { buttons: '', right: ' · R-Stick', left: ' · L-Stick' }[getPadThrottle()];
      setHtml(this.el.help, pad
        ? html`<div class="th-title">${ps ? 'PlayStation-Controller' : 'Gamepad'}</div>
           <div class="th-row"><b data-h="throttle">${ps ? 'R2 · ✕' : 'RT · A'}${stick ? `${stick} ▲` : ''}</b><span>Gas</span></div>
           <div class="th-row"><b data-h="brake">${ps ? 'L2 · ○' : 'LT · B'}${stick ? `${stick} ▼` : ''}</b><span>Bremse / Rückwärts</span></div>
           <div class="th-row"><b data-h="left">◀ Stick</b><b data-h="right">Stick ▶</b><span>Lenken</span></div>
           <div class="th-row"><b data-h="hand">${ps ? '□ · R1' : 'X · RB'}</b><span>Handbremse</span></div>
           <div class="th-foot">H = Hilfe aus</div>`
        : html`<div class="th-title">Tastatur</div>
           <div class="th-keys">
             <div></div><b data-h="throttle">${label(k.up)}<small>Gas</small></b><div></div>
             <b data-h="left">${label(k.left)}<small>Links</small></b><b data-h="brake">${label(k.down)}<small>Bremse</small></b><b data-h="right">${label(k.right)}<small>Rechts</small></b>
           </div>
           <div class="th-row"><b data-h="hand">${label(k.handbrake)}</b><span>Handbremse</span></div>
           <div class="th-foot">H = Hilfe aus</div>`);
    }
    const on: Record<string, boolean> = {
      throttle: inp.throttle > 0.05, brake: inp.brake > 0.05, left: inp.steer < -0.1, right: inp.steer > 0.1, hand: inp.handbrake,
    };
    this.el.help.querySelectorAll<HTMLElement>('[data-h]').forEach((e) => e.classList.toggle('on', on[e.dataset.h!]));
  }

  dispose() {
    this.root.remove();
  }
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number, ri: number) {
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = k % 2 ? ri : r;
    if (k === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}
