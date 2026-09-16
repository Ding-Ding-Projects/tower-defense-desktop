/**
 * The upgrade surface that opens when a tower on the battlefield is
 * clicked: current level, real current stats, the next upgrade's cost and
 * exactly what it changes, the sell value, the targeting mode with a
 * control to cycle it, and an ability button with a real cooldown readout
 * when the tower has one. Every disabled control names its unmet
 * condition — never a control that looks live and silently does nothing.
 *
 * `visible` is a real hidden/shown state (mirroring the old
 * `<section hidden>` behaviour), not a panel drawn with blank fields when
 * nothing is selected.
 */
import { inset, stack, containsPoint } from './layout.js';
import { Panel, Button, wrapText, wrappedTextHeight, PALETTE } from './widgets.js';
import { deriveUpgradeState, deriveSellValue, targetingModeLabel, ALL_TARGETING_MODES, FIELD_LABELS, isAbilityReady } from './derive.js';
import { IconSlot } from './widgets.js';
import { getTowerSprite } from '../art/index.js';

const PADDING = 12;
const ROW_HEIGHT = 20;
const BUTTON_HEIGHT = 34;
const DETAIL_LINE_HEIGHT = 14;
const PORTRAIT_SIZE = 40;
// Facing up, matching the shop card, so the tower a player is looking at in the panel
// is the same picture they picked out of the shop a minute earlier.
const PORTRAIT_ANGLE = -Math.PI / 2;

const STAT_FIELDS = ['damage', 'fireRate', 'range', 'aoeRadius', 'pierceCount', 'chainCount'];

export class TowerPanelHud {
  constructor() {
    this.rect = null;
    this.visible = false;
    this._panel = new Panel();
    this._targetingButton = new Button({ id: 'targeting', action: { kind: 'cycleTargeting' } });
    this._abilityButton = new Button({ id: 'ability', action: { kind: 'useAbility' } });
    this._upgradeButton = new Button({ id: 'upgrade', action: null });
    this._sellButton = new Button({ id: 'sell', action: { kind: 'sellTower' } });
    this._hasAbility = false;
    this._abilityReady = false;
    this._upgradeAvailable = false;
    this._sellValue = 0;
    this._towerId = null;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('./layout.js').Rect} rect
   * @param {{
   *   towerDef: import('../../data/schema/types.js').TowerDef|null,
   *   tower: import('../../render/view-model.js').ViewTower|null,
   *   cash: number,
   * }} state
   */
  /**
   * The height this panel's content actually needs.
   *
   * The sidebar used to split evenly between the shop and this panel, which is fine at
   * a comfortable window and wrong everywhere else: the shop scrolls and this does not,
   * so half the sidebar is more room than the shop needs and less than this needs. At
   * 125 percent interface scale in the smallest supported window the panel's buttons
   * ran past the bottom of the screen, and at 200 percent a good deal more than that.
   *
   * Measured the same way the shop measures its cards and the top bar measures itself,
   * so the one panel that cannot scroll is the one that gets told its real size.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} width
   * @param {{towerDef: any, tower: any, cash: number}} state
   * @returns {number}
   */
  measureHeight(ctx, width, state) {
    const { towerDef, tower, cash } = state;
    if (!towerDef || !tower) return 0;

    const innerWidth = Math.max(0, width - PADDING * 2);
    const levelDef = towerDef.levels[tower.level];
    if (!levelDef) return 0;

    let height = PADDING;
    height += PORTRAIT_SIZE + PADDING;
    for (const field of STAT_FIELDS) {
      if (levelDef[field] != null) height += ROW_HEIGHT;
    }
    height += PADDING / 2;
    height += BUTTON_HEIGHT + PADDING / 2;
    if (levelDef.ability) height += BUTTON_HEIGHT + PADDING / 2;

    const upgrade = deriveUpgradeState(towerDef, tower.level, cash);
    const detailText = upgrade.changes
      .map((c) => `${FIELD_LABELS[c.field] ?? c.field}: ${c.before} -> ${c.after}`)
      .join(', ');
    height += BUTTON_HEIGHT + 4;
    if (detailText) {
      ctx.save();
      ctx.font = '400 11px "Roboto", system-ui, sans-serif';
      const lines = wrapText(ctx, detailText, innerWidth);
      ctx.restore();
      height += wrappedTextHeight(lines.length, DETAIL_LINE_HEIGHT) + 4;
    }
    height += BUTTON_HEIGHT + PADDING;
    return height;
  }

  draw(ctx, rect, state) {
    const { towerDef, tower, cash } = state;
    this.visible = !!(towerDef && tower);
    if (!this.visible) {
      this.rect = null;
      return;
    }
    this.rect = rect;
    this._towerId = tower.id;
    this._panel.draw(ctx, rect, { elevated: true });

    // The content below is analytically bounded (a name line, up to six stat
    // rows, a targeting button, an optional ability button, an upgrade
    // button plus its wrapped change list, and a sell button), and
    // interface-layer.js allocates this panel a rect sized for that. This
    // clip is a defensive guard against bleeding into the shop panel next
    // to it in the rare case a very long wrapped upgrade description pushes
    // past that budget — not a routine truncation path.
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();

    const inner = inset(rect, PADDING);
    let y = inner.y;

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '700 16px "Roboto", system-ui, sans-serif';
    ctx.fillStyle = PALETTE.text;
    // The tower's own portrait, at the level it is actually standing at. Upgrading
    // changes the picture, which is the one place a player can see what their money
    // bought without squinting at the battlefield.
    const portraitSlot = this._portraitSlot ?? (this._portraitSlot = new IconSlot());
    const portraitRect = { x: inner.x, y, width: PORTRAIT_SIZE, height: PORTRAIT_SIZE };
    portraitSlot.draw(ctx, portraitRect, {
      sprite: getTowerSprite(towerDef, towerDef.levels[tower.level], PORTRAIT_SIZE, PORTRAIT_ANGLE),
      glyph: towerDef.displayName,
    });

    const textX = inner.x + PORTRAIT_SIZE + PADDING;
    ctx.fillText(`${towerDef.displayName}`, textX, y + 16);
    ctx.font = '400 12px "Roboto", system-ui, sans-serif';
    ctx.fillStyle = PALETTE.textMuted;
    ctx.fillText(`Level ${tower.level + 1} of ${towerDef.levels.length}`, textX, y + 32);
    y += PORTRAIT_SIZE + PADDING;

    const levelDef = towerDef.levels[tower.level];
    ctx.font = '400 12px "Roboto", system-ui, sans-serif';
    for (const field of STAT_FIELDS) {
      if (levelDef[field] == null) continue;
      ctx.fillStyle = PALETTE.textMuted;
      ctx.fillText(FIELD_LABELS[field] ?? field, inner.x, y + 12);
      ctx.fillStyle = PALETTE.text;
      ctx.textAlign = 'right';
      ctx.fillText(String(levelDef[field]), inner.x + inner.width, y + 12);
      ctx.textAlign = 'left';
      y += ROW_HEIGHT;
    }
    y += PADDING / 2;
    ctx.restore();

    // targeting cycle button
    const targetingLabel = `Target: ${targetingModeLabel(tower.targetingMode)}`;
    const targetingRect = { x: inner.x, y, width: inner.width, height: BUTTON_HEIGHT };
    this._targetingButton.draw(ctx, targetingRect, {
      label: targetingLabel,
      disabled: false,
      hovered: this._targetingButton.hovered,
    });
    y += BUTTON_HEIGHT + PADDING / 2;

    // ability button, only when this tower has one
    this._hasAbility = !!levelDef.ability;
    if (this._hasAbility) {
      this._abilityReady = isAbilityReady(tower.abilityCooldownRemainingSeconds);
      const abilityLabel = levelDef.ability.displayName;
      const abilitySublabel = this._abilityReady ? 'Ready' : `Ready in ${Math.ceil(tower.abilityCooldownRemainingSeconds)}s`;
      const abilityRect = { x: inner.x, y, width: inner.width, height: BUTTON_HEIGHT };
      this._abilityButton.draw(ctx, abilityRect, {
        label: abilityLabel,
        sublabel: abilitySublabel,
        disabled: !this._abilityReady,
        hovered: this._abilityButton.hovered,
      });
      y += BUTTON_HEIGHT + PADDING / 2;
    } else {
      this._abilityButton.rect = null;
    }

    // upgrade button + a description of exactly what changes
    const upgrade = deriveUpgradeState(towerDef, tower.level, cash);
    this._upgradeAvailable = upgrade.available;
    this._upgradeButton.action = upgrade.cost > 0 || upgrade.changes.length ? { kind: 'upgradeTower', towerId: tower.id } : null;
    const upgradeLabel = upgrade.disabledReason === 'Max level' ? 'Max level' : `Upgrade ($${upgrade.cost})`;
    const upgradeSublabel = upgrade.disabledReason && upgrade.disabledReason !== 'Max level' ? upgrade.disabledReason : null;
    const detailText = upgrade.changes.map((c) => `${FIELD_LABELS[c.field] ?? c.field}: ${c.before} -> ${c.after}`).join(', ');

    ctx.save();
    ctx.font = '400 11px "Roboto", system-ui, sans-serif';
    const detailLines = detailText ? wrapText(ctx, detailText, inner.width) : [];
    ctx.restore();
    const detailHeight = detailLines.length ? wrappedTextHeight(detailLines.length, DETAIL_LINE_HEIGHT) + 4 : 0;

    const upgradeRect = { x: inner.x, y, width: inner.width, height: BUTTON_HEIGHT };
    this._upgradeButton.draw(ctx, upgradeRect, {
      label: upgradeLabel,
      sublabel: upgradeSublabel,
      disabled: !upgrade.available,
      hovered: this._upgradeButton.hovered,
    });
    y += BUTTON_HEIGHT + 4;

    if (detailLines.length) {
      ctx.save();
      ctx.font = '400 11px "Roboto", system-ui, sans-serif';
      ctx.fillStyle = PALETTE.textMuted;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      detailLines.forEach((line, i) => {
        ctx.fillText(line, inner.x, y + 10 + i * DETAIL_LINE_HEIGHT);
      });
      ctx.restore();
      y += detailHeight;
    }
    y += PADDING / 2;

    // sell
    this._sellValue = deriveSellValue(towerDef, tower.level);
    const sellRect = { x: inner.x, y, width: inner.width, height: BUTTON_HEIGHT };
    this._sellButton.draw(ctx, sellRect, {
      label: `Sell for $${this._sellValue}`,
      disabled: false,
      hovered: this._sellButton.hovered,
    });

    ctx.restore();
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {{kind: 'upgradeTower', towerId: string}|{kind: 'sellTower'}|{kind: 'cycleTargeting'}|{kind: 'useAbility'}|null}
   */
  hitTest(x, y) {
    if (!this.visible) return null;
    const targeting = this._targetingButton.hitTest(x, y, false);
    if (targeting) return targeting;
    if (this._hasAbility) {
      const ability = this._abilityButton.hitTest(x, y, !this._abilityReady);
      if (ability) return ability;
    }
    if (this._upgradeButton.action) {
      const upgrade = this._upgradeButton.hitTest(x, y, !this._upgradeAvailable);
      if (upgrade) return upgrade;
    }
    const sell = this._sellButton.hitTest(x, y, false);
    if (sell) return sell;
    return null;
  }

  setHover(x, y) {
    this._targetingButton.hovered = this._targetingButton.contains(x, y);
    this._abilityButton.hovered = this._hasAbility && this._abilityButton.contains(x, y);
    this._upgradeButton.hovered = this._upgradeButton.contains(x, y);
    this._sellButton.hovered = this._sellButton.contains(x, y);
  }

  /** @returns {{key: string, label: string, disabled: boolean, action: object}[]} */
  accessibilityControls() {
    if (!this.visible) return [];
    const controls = [
      { key: 'tower-panel-targeting', label: this._targetingButton.rect ? undefined : undefined, disabled: false, action: { kind: 'cycleTargeting' } },
    ];
    controls[0].label = `Cycle targeting mode`;
    if (this._hasAbility) {
      controls.push({
        key: 'tower-panel-ability',
        label: this._abilityReady ? 'Use ability' : `Ability on cooldown`,
        disabled: !this._abilityReady,
        action: { kind: 'useAbility' },
      });
    }
    if (this._upgradeButton.action) {
      controls.push({
        key: 'tower-panel-upgrade',
        label: this._upgradeAvailable ? 'Upgrade tower' : 'Upgrade tower, unavailable',
        disabled: !this._upgradeAvailable,
        action: { kind: 'upgradeTower', towerId: this._towerId },
      });
    }
    controls.push({
      key: 'tower-panel-sell',
      label: `Sell tower for $${this._sellValue}`,
      disabled: false,
      action: { kind: 'sellTower' },
    });
    return controls;
  }
}

export { ALL_TARGETING_MODES };
