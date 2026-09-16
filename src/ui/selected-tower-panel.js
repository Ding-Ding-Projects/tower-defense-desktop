/**
 * The selected-tower panel: level, real current stats, upgrade cost and a real
 * description of what the upgrade changes, sell value, the five targeting
 * modes (as one cycling control, so a narrow panel never has to fit five
 * buttons), and an ability button with a real cooldown readout. Hidden (via
 * the `hidden` attribute) when nothing is selected — never a panel with blank
 * or placeholder fields.
 */
import { deriveUpgradeState, deriveSellValue } from './affordability.js';
import { cycleTargetingMode, targetingModeLabel } from './targeting.js';

/**
 * A partial lookup, so the `?? field` fallback below is meaningful rather than dead: a
 * field with no friendly label falls back to its own name, which is ugly and readable,
 * instead of printing "undefined" at a player.
 * @type {Partial<Record<string, string>>}
 */
const FIELD_LABELS = {
  damage: 'Damage',
  fireRate: 'Fire rate',
  range: 'Range',
  aoeRadius: 'Blast radius',
  pierceCount: 'Pierce',
  chainCount: 'Chain',
  burstCount: 'Burst shots',
};

/**
 * A Material Design button element. `disabled` is the component's own property, not
 * part of HTMLElement, so createElement hands back something that does not admit to
 * having it.
 * @typedef {HTMLElement & { disabled: boolean }} Md3Button
 */

/**
 * The stats this panel lists, typed against the schema's own field names so one renamed
 * there turns this red rather than quietly printing nothing.
 * @type {Array<Extract<keyof import('../data/schema/types.js').TowerLevel,
 *   'damage'|'fireRate'|'range'|'aoeRadius'|'pierceCount'|'chainCount'>>}
 */
const STAT_FIELDS = ['damage', 'fireRate', 'range', 'aoeRadius', 'pierceCount', 'chainCount'];

export class SelectedTowerPanel {
  constructor(doc = document) {
    this.doc = doc;
    this.el = doc.createElement('section');
    this.el.className = 'tower-panel';
    this.el.setAttribute('aria-label', 'Selected tower');
    this.el.hidden = true;

    this.nameEl = doc.createElement('h2');
    this.nameEl.className = 'tower-panel__name';

    this.statsEl = doc.createElement('dl');
    this.statsEl.className = 'tower-panel__stats';

    this.targetingButton = /** @type {Md3Button} */ (doc.createElement('md3-button'));
    this.targetingButton.setAttribute('variant', 'outlined');
    this.targetingButton.addEventListener('click', () => {
      this.el.dispatchEvent(new CustomEvent('tower-panel-cycle-targeting', { bubbles: true }));
    });

    this.abilityButton = /** @type {Md3Button} */ (doc.createElement('md3-button'));
    this.abilityButton.setAttribute('variant', 'tonal');
    this.abilityButton.addEventListener('click', () => {
      this.el.dispatchEvent(new CustomEvent('tower-panel-cast-ability', { bubbles: true }));
    });

    this.upgradeButton = /** @type {Md3Button} */ (doc.createElement('md3-button'));
    this.upgradeButton.setAttribute('variant', 'filled');
    this.upgradeButton.addEventListener('click', () => {
      this.el.dispatchEvent(new CustomEvent('tower-panel-upgrade', { bubbles: true }));
    });
    this.upgradeDetail = doc.createElement('p');
    this.upgradeDetail.className = 'tower-panel__upgrade-detail';

    this.sellButton = /** @type {Md3Button} */ (doc.createElement('md3-button'));
    this.sellButton.setAttribute('variant', 'outlined');
    this.sellButton.addEventListener('click', () => {
      this.el.dispatchEvent(new CustomEvent('tower-panel-sell', { bubbles: true }));
    });

    const actions = doc.createElement('div');
    actions.className = 'tower-panel__actions';
    actions.append(this.targetingButton, this.abilityButton);

    const upgradeGroup = doc.createElement('div');
    upgradeGroup.className = 'tower-panel__upgrade';
    upgradeGroup.append(this.upgradeButton, this.upgradeDetail);

    this.el.append(this.nameEl, this.statsEl, actions, upgradeGroup, this.sellButton);
  }

  clear() {
    this.el.hidden = true;
  }

  /**
   * @param {import('../data/schema/types.js').TowerDef} towerDef
   * @param {import('../render/view-model.js').ViewTower} tower
   * @param {number} cash
   */
  update(towerDef, tower, cash) {
    this.el.hidden = false;
    this.nameEl.textContent = `${towerDef.displayName} (Lv. ${tower.level + 1})`;

    const levelDef = towerDef.levels[tower.level];
    this.statsEl.innerHTML = '';
    for (const field of STAT_FIELDS) {
      if (levelDef[field] == null) continue;
      const dt = this.doc.createElement('dt');
      dt.textContent = FIELD_LABELS[field] ?? field;
      const dd = this.doc.createElement('dd');
      dd.textContent = String(levelDef[field]);
      this.statsEl.append(dt, dd);
    }

    this.targetingButton.textContent = `Target: ${targetingModeLabel(tower.targetingMode)}`;
    this.targetingButton.setAttribute('aria-label', `Cycle targeting mode, currently ${targetingModeLabel(tower.targetingMode)}`);

    if (levelDef.ability) {
      this.abilityButton.hidden = false;
      const ready = tower.abilityCooldownRemainingSeconds <= 0;
      this.abilityButton.textContent = ready ? levelDef.ability.displayName : `${levelDef.ability.displayName} (${Math.ceil(tower.abilityCooldownRemainingSeconds)}s)`;
      this.abilityButton.disabled = !ready;
    } else {
      this.abilityButton.hidden = true;
    }

    const upgrade = deriveUpgradeState(towerDef, tower.level, cash);
    if (upgrade.cost > 0 || upgrade.available) {
      this.upgradeButton.hidden = false;
      this.upgradeButton.disabled = !upgrade.available;
      this.upgradeButton.textContent = upgrade.disabledReason && !upgrade.available
        ? `Upgrade ($${upgrade.cost}) — ${upgrade.disabledReason}`
        : `Upgrade ($${upgrade.cost})`;
      this.upgradeDetail.textContent = upgrade.changes
        .map((c) => `${FIELD_LABELS[c.field] ?? c.field}: ${c.before} → ${c.after}`)
        .join(', ');
    } else {
      this.upgradeButton.hidden = false;
      this.upgradeButton.disabled = true;
      this.upgradeButton.textContent = 'Max level';
      this.upgradeDetail.textContent = '';
    }

    const sellValue = deriveSellValue(towerDef, tower.level);
    this.sellButton.textContent = `Sell for $${sellValue}`;
  }

  /**
   * @param {import('../data/schema/types.js').TargetingMode} currentMode
   * @param {import('../data/schema/types.js').TargetingMode[]} allowedModes
   * @returns {import('../data/schema/types.js').TargetingMode}
   */
  static nextTargetingMode(currentMode, allowedModes) {
    return cycleTargetingMode(currentMode, allowedModes, 1);
  }
}
