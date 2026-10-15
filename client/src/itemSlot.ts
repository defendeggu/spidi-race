import { driftLevel, type ItemKind, type KartState } from '@spidi/shared';
import { html, setHtml } from './ui/html';

const ITEM_ICON: Record<ItemKind, string> = { blaster: '🔫', homing: '🎯', mine: '💣', turbo: '🚀', shield: '🛡️' };
const ITEM_LABEL: Record<ItemKind, string> = { blaster: 'Blaster', homing: 'Zielsucher', mine: 'Mine', turbo: 'Turbo', shield: 'Schild' };

/**
 * Item slot of the kart modes (top centre): the item used next, roulette while rolling; the items
 * collected behind it small beside the slot; drift level below.
 */
export class ItemSlot {
  private box: HTMLDivElement;
  private icon!: HTMLElement;
  private label!: HTMLElement;
  private drift!: HTMLElement;
  private next!: HTMLElement;
  private rollTime = 0;
  private last = '';

  constructor(parent: HTMLElement) {
    this.box = document.createElement('div');
    this.box.className = 'hud-item';
    setHtml(this.box, html`<div class="hud-item-icon"></div><div class="hud-item-label"></div><div class="hud-drift"></div><div class="hud-item-next"></div>`);
    [this.icon, this.label, this.drift, this.next] = [...this.box.children] as HTMLElement[];
    this.box.style.display = 'none';
    parent.appendChild(this.box);
  }

  update(ks: KartState | undefined, dt: number) {
    this.box.style.display = ks ? '' : 'none';
    if (!ks) return;
    let icon = '', label = '';
    const queued = ks.stock.map((k) => ITEM_ICON[k]);
    if (ks.rolling > 0) {
      this.rollTime += dt;
      const kinds = Object.keys(ITEM_ICON) as ItemKind[];
      const roll = ITEM_ICON[kinds[Math.floor(this.rollTime * 14) % kinds.length]];
      // the roulette runs in the big slot while it is empty, otherwise behind the collected items
      if (ks.item) queued.push(roll);
      else {
        icon = roll;
        label = '…';
      }
    }
    if (ks.item) {
      icon = ITEM_ICON[ks.item];
      label = ITEM_LABEL[ks.item];
    }
    const key = icon + label + queued.join('');
    if (key !== this.last) {
      this.last = key;
      this.icon.textContent = icon;
      this.label.textContent = label;
      this.next.textContent = queued.join(' ');
      this.box.classList.toggle('full', !!ks.item);
    }
    const lvl = driftLevel(ks);
    this.drift.className = 'hud-drift' + (ks.drift !== 0 && lvl > 0 ? ` l${lvl}` : '');
  }
}
