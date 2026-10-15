import { driftLevel, type ItemKind, type KartState } from '@spidi/shared';
import { html, setHtml } from './ui/html';

const ITEM_ICON: Record<ItemKind, string> = { blaster: '🔫', homing: '🎯', mine: '💣', turbo: '🚀', shield: '🛡️' };
const ITEM_LABEL: Record<ItemKind, string> = { blaster: 'Blaster', homing: 'Zielsucher', mine: 'Mine', turbo: 'Turbo', shield: 'Schild' };

/** Item slot of the kart modes (top centre): roulette while rolling, then the item; drift level below. */
export class ItemSlot {
  private box: HTMLDivElement;
  private icon!: HTMLElement;
  private label!: HTMLElement;
  private drift!: HTMLElement;
  private rollTime = 0;
  private last = '';

  constructor(parent: HTMLElement) {
    this.box = document.createElement('div');
    this.box.className = 'hud-item';
    setHtml(this.box, html`<div class="hud-item-icon"></div><div class="hud-item-label"></div><div class="hud-drift"></div>`);
    [this.icon, this.label, this.drift] = [...this.box.children] as HTMLElement[];
    this.box.style.display = 'none';
    parent.appendChild(this.box);
  }

  update(ks: KartState | undefined, dt: number) {
    this.box.style.display = ks ? '' : 'none';
    if (!ks) return;
    let icon = '', label = '';
    if (ks.rolling > 0) {
      this.rollTime += dt;
      const kinds = Object.keys(ITEM_ICON) as ItemKind[];
      icon = ITEM_ICON[kinds[Math.floor(this.rollTime * 14) % kinds.length]];
      label = '…';
    } else if (ks.item) {
      icon = ITEM_ICON[ks.item];
      label = ITEM_LABEL[ks.item];
    }
    if (icon + label !== this.last) {
      this.last = icon + label;
      this.icon.textContent = icon;
      this.label.textContent = label;
      this.box.classList.toggle('full', !!ks.item);
    }
    const lvl = driftLevel(ks);
    this.drift.className = 'hud-drift' + (ks.drift !== 0 && lvl > 0 ? ` l${lvl}` : '');
  }
}
