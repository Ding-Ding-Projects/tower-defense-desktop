/**
 * The tower shop panel. Renders one entry per TowerDef in GameData.towers, each
 * showing cost, an affordability-derived disabled state and reason (see
 * affordability.js), and a click that enters placement mode by dispatching a
 * `tower-shop-select` CustomEvent with `{ defId }` on the panel — app.js owns
 * turning that into a real placeTower command once the player clicks the map.
 */
import { deriveShopEntryState } from './affordability.js';

export class ShopPanel {
  /** @param {Document} [doc] */
  constructor(doc = document) {
    this.doc = doc;
    this.el = doc.createElement('section');
    this.el.className = 'shop-panel';
    this.el.setAttribute('aria-label', 'Tower shop');

    const heading = doc.createElement('h2');
    heading.className = 'shop-panel__heading';
    heading.textContent = 'Shop';
    this.el.appendChild(heading);

    this.list = doc.createElement('div');
    this.list.className = 'shop-panel__list';
    this.list.setAttribute('role', 'list');
    this.el.appendChild(this.list);

    this._buttons = new Map();
  }

  /**
   * @param {Map<string, import('../data/schema/types.js').TowerDef>} towers
   * @param {number} cash
   * @param {Map<string, number>} placementPoolCounts
   * @param {string[]} [disallowedTowerIds]
   * @param {string|null} [selectedDefId]
   */
  update(towers, cash, placementPoolCounts, disallowedTowerIds = [], selectedDefId = null) {
    for (const def of towers.values()) {
      let btn = this._buttons.get(def.id);
      if (!btn) {
        btn = this._createEntry(def);
        this._buttons.set(def.id, btn);
        this.list.appendChild(btn.root);
      }
      const state = deriveShopEntryState(def, cash, placementPoolCounts, disallowedTowerIds);
      btn.button.disabled = !state.affordable;
      btn.button.setAttribute('title-when-disabled', state.disabledReason ?? '');
      btn.button.setAttribute('aria-pressed', String(def.id === selectedDefId));
      btn.reason.textContent = state.disabledReason ?? `${def.footprintRadius} footprint · ${def.allowedTerrain.join('/')}`;
      btn.reason.classList.toggle('shop-entry__reason--warning', !state.affordable);
    }
  }

  /**
   * Returns the wrapper along with the two elements the caller updates as cash
   * changes, rather than making it re-query them out of the wrapper each time.
   * @param {import('../data/schema/types.js').TowerDef} def
   * @returns {{ root: HTMLElement, button: HTMLElement, reason: HTMLElement }}
   */
  _createEntry(def) {
    const root = this.doc.createElement('div');
    root.className = 'shop-entry';
    root.setAttribute('role', 'listitem');

    const button = this.doc.createElement('md3-button');
    button.setAttribute('variant', 'tonal');
    button.dataset.towerDefId = def.id;
    button.innerHTML = `<span class="shop-entry__name">${def.displayName}</span><span class="shop-entry__cost">$${def.baseCost}</span>`;
    button.addEventListener('click', () => {
      this.el.dispatchEvent(new CustomEvent('tower-shop-select', { bubbles: true, detail: { defId: def.id } }));
    });

    const reason = this.doc.createElement('p');
    reason.className = 'shop-entry__reason';

    root.append(button, reason);
    return { root, button, reason };
  }
}
