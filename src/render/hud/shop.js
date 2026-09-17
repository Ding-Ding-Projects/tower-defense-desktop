/**
 * The tower shop, drawn as an in-game panel of cards — one per TowerDef,
 * each showing a drawn portrait slot, the name, the cost, and an
 * affordability state. An unaffordable card is visibly dimmed AND states
 * the exact reason (see derive.js#deriveShopEntryState); no card ever looks
 * clickable and does nothing.
 *
 * Card height is derived from measured, wrapped text rather than a fixed
 * guess, so a long disabled-reason string ("Pool limit reached (2)") always
 * gets the room it measures at instead of being clipped. When the roster is
 * taller than the panel's rect, the panel scrolls (see `scroll`) rather than
 * clipping a card's text mid-line — the hidden accessibility mirror is
 * unaffected by scroll position, so a keyboard/AT user can always reach
 * every tower regardless of what is currently visible on screen.
 */
import { inset, row, stack, containsPoint } from './layout.js';
import { Panel, Button, IconSlot, wrapText, wrappedTextHeight, PALETTE } from './widgets.js';
import { deriveShopEntryState } from './derive.js';
import { getTowerSprite } from '../art/index.js';

// Facing up the card rather than along its firing line. A shop portrait is a picture
// of the tower, not a snapshot of it mid-engagement, and every card facing the same
// way is what makes the roster scannable.
const PORTRAIT_ANGLE = -Math.PI / 2;

const PADDING = 12;
// Large enough that a tower is recognisable rather than merely present. At 44 the
// plinth, barrel and sensor all landed inside about twenty pixels and every tower read
// as the same dark disc.
const ICON_SIZE = 56;
const CARD_GAP = 8;
const NAME_LINE_HEIGHT = 18;
const REASON_LINE_HEIGHT = 14;
const HEADING_HEIGHT = 26;

/**
 * One card's bookkeeping.
 *
 * The declared shape used to list five of the seven fields the code actually stores:
 * `selected` and `affordable` were assigned every frame and typed nowhere, so nothing
 * would have objected to a reader asking for a field that had quietly been renamed.
 *
 * @typedef {{
 *   rect: import('./layout.js').Rect|null,
 *   button: Button,
 *   def: import('../../data/schema/types.js').TowerDef,
 *   disabled: boolean,
 *   disabledReason: string|null,
 *   selected: boolean,
 *   affordable: boolean,
 *   iconSlot?: IconSlot,
 * }} ShopEntry
 */

export class ShopHud {
  constructor() {
    /** @type {Map<string, ShopEntry>} */
    this._entries = new Map();
    this.rect = null;
    this._contentHeight = 0;
    this._scrollOffset = 0;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('./layout.js').Rect} rect
   * @param {{
   *   towers: Map<string, import('../../data/schema/types.js').TowerDef>,
   *   cash: number,
   *   placementPoolCounts: Map<string, number>,
   *   disallowedTowerIds?: string[],
   *   selectedDefId?: string|null,
   * }} state
   */
  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('./layout.js').Rect} rect
   * @param {{
   *   towers: Map<string, import('../../data/schema/types.js').TowerDef>,
   *   cash: number,
   *   placementPoolCounts: Map<string, number>,
   *   disallowedTowerIds?: string[],
   *   selectedDefId?: string|null,
   * }} state
   */
  draw(ctx, rect, state) {
    this.rect = rect;
    const { towers, cash, placementPoolCounts, disallowedTowerIds = [], selectedDefId = null } = state;
    const panel = this._panel ?? (this._panel = new Panel());
    panel.draw(ctx, rect, {});

    const inner = inset(rect, PADDING);
    ctx.save();
    ctx.font = '700 15px "Roboto", system-ui, sans-serif';
    ctx.fillStyle = PALETTE.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Shop', inner.x, inner.y + 18);
    ctx.restore();

    const listRect = inset({ x: inner.x, y: inner.y + HEADING_HEIGHT, width: inner.width, height: inner.height - HEADING_HEIGHT }, 0);

    const defs = [...towers.values()];
    ctx.save();
    ctx.font = '400 12px "Roboto", system-ui, sans-serif';
    const cardHeights = defs.map((def) => this._measureCardHeight(ctx, def, cash, placementPoolCounts, disallowedTowerIds, listRect.width));
    ctx.restore();

    this._contentHeight = cardHeights.reduce((sum, h) => sum + h, 0) + CARD_GAP * Math.max(0, defs.length - 1);
    const maxScroll = Math.max(0, this._contentHeight - listRect.height);
    this._scrollOffset = Math.min(Math.max(0, this._scrollOffset), maxScroll);

    ctx.save();
    // Clip to the list area so a scrolled-past card never paints outside the
    // shop panel. This is ordinary scroll clipping (the same thing any
    // scrollable list does), not text truncation: every visible card still
    // renders its full, unclipped, wrapped text.
    ctx.beginPath();
    ctx.rect(listRect.x, listRect.y, listRect.width, listRect.height);
    ctx.clip();

    const seen = new Set();
    let cursor = listRect.y - this._scrollOffset;
    defs.forEach((def, i) => {
      const cardHeight = cardHeights[i];
      const cardRect = { x: listRect.x, y: cursor, width: listRect.width, height: cardHeight };
      cursor += cardHeight + CARD_GAP;
      if (cardRect.y + cardRect.height < listRect.y || cardRect.y > listRect.y + listRect.height) {
        // Fully scrolled out of view: still keep its button entry (with its
        // last-known rect) so the hit test and the accessibility mirror stay
        // consistent, but skip the draw call — nothing to paint.
        this._updateEntry(def, cardRect, cash, placementPoolCounts, disallowedTowerIds, selectedDefId);
        seen.add(def.id);
        return;
      }
      this._drawCard(ctx, cardRect, def, cash, placementPoolCounts, disallowedTowerIds, selectedDefId);
      seen.add(def.id);
    });
    ctx.restore();

    for (const key of [...this._entries.keys()]) {
      if (!seen.has(key)) this._entries.delete(key);
    }
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('../../data/schema/types.js').TowerDef} def
   * @param {number} cash
   * @param {Map<string, number>} placementPoolCounts
   * @param {string[]} disallowedTowerIds
   * @param {number} width
   * @returns {number}
   */
  _measureCardHeight(ctx, def, cash, placementPoolCounts, disallowedTowerIds, width) {
    const { disabledReason } = deriveShopEntryState(def, cash, placementPoolCounts, disallowedTowerIds);
    const textWidth = width - PADDING * 2 - ICON_SIZE - PADDING;
    const reasonText = disabledReason ?? `${def.footprintRadius} footprint - ${def.allowedTerrain.join('/')}`;
    const lines = wrapText(ctx, reasonText, Math.max(20, textWidth));
    const reasonHeight = wrappedTextHeight(lines.length, REASON_LINE_HEIGHT);
    return Math.max(ICON_SIZE + PADDING, NAME_LINE_HEIGHT + reasonHeight) + PADDING * 2;
  }

  /**
   * @param {import('../../data/schema/types.js').TowerDef} def
   * @param {import('./layout.js').Rect} cardRect
   * @param {number} cash
   * @param {Map<string, number>} placementPoolCounts
   * @param {string[]} disallowedTowerIds
   * @param {string|null|undefined} selectedDefId
   */
  _updateEntry(def, cardRect, cash, placementPoolCounts, disallowedTowerIds, selectedDefId) {
    const { affordable, disabledReason } = deriveShopEntryState(def, cash, placementPoolCounts, disallowedTowerIds);
    let entry = this._entries.get(def.id);
    if (!entry) {
      // Built complete rather than half-filled and patched below, so the declared shape
      // and the object actually created cannot drift apart.
      entry = {
        rect: null,
        button: new Button({ id: def.id, action: { kind: 'buyTower', towerId: def.id } }),
        def,
        disabled: false,
        disabledReason: null,
        selected: false,
        affordable: true,
      };
      this._entries.set(def.id, entry);
    }
    entry.rect = cardRect;
    entry.button.rect = cardRect;
    entry.disabled = !affordable;
    entry.disabledReason = disabledReason;
    entry.selected = def.id === selectedDefId;
    entry.affordable = affordable;
    return entry;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('./layout.js').Rect} cardRect
   * @param {import('../../data/schema/types.js').TowerDef} def
   * @param {number} cash
   * @param {Map<string, number>} placementPoolCounts
   * @param {string[]} disallowedTowerIds
   * @param {string|null|undefined} selectedDefId
   */
  _drawCard(ctx, cardRect, def, cash, placementPoolCounts, disallowedTowerIds, selectedDefId) {
    const entry = this._updateEntry(def, cardRect, cash, placementPoolCounts, disallowedTowerIds, selectedDefId);
    const inner = inset(cardRect, PADDING);
    const [iconRect, textRect] = row(inner, [ICON_SIZE, null], PADDING);

    entry.button.draw(ctx, cardRect, {
      label: '',
      disabled: entry.disabled,
      pressed: false,
      hovered: entry.button.hovered,
    });
    if (entry.selected) {
      ctx.save();
      ctx.strokeStyle = PALETTE.progressFill;
      ctx.lineWidth = 2;
      ctx.strokeRect(cardRect.x + 1, cardRect.y + 1, cardRect.width - 2, cardRect.height - 2);
      ctx.restore();
    }

    const iconSlot = entry.iconSlot ?? (entry.iconSlot = new IconSlot());
    // The real sprite, at the level the money actually buys: level 0. Drawing the
    // top-level portrait would be advertising something the player cannot have yet.
    const portrait = getTowerSprite(def, def.levels[0], ICON_SIZE, PORTRAIT_ANGLE);
    iconSlot.draw(
      ctx,
      { x: iconRect.x, y: inner.y, width: ICON_SIZE, height: ICON_SIZE },
      {
        sprite: portrait,
        dimmed: entry.disabled,
        glyph: def.displayName,
        tint: entry.disabled ? PALETTE.textMuted : PALETTE.text,
      },
    );

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '600 13px "Roboto", system-ui, sans-serif';
    ctx.fillStyle = entry.disabled ? PALETTE.textMuted : PALETTE.text;
    ctx.fillText(`${def.displayName}`, textRect.x, inner.y + 14);

    ctx.font = '600 12px "Roboto", system-ui, sans-serif';
    ctx.fillStyle = entry.affordable ? PALETTE.textPositive : PALETTE.textWarning;
    ctx.fillText(`$${def.baseCost}`, textRect.x, inner.y + 14 + NAME_LINE_HEIGHT - 4);

    ctx.font = '400 12px "Roboto", system-ui, sans-serif';
    ctx.fillStyle = entry.disabled ? PALETTE.textWarning : PALETTE.textMuted;
    const reasonText = entry.disabledReason ?? `${def.footprintRadius} footprint - ${def.allowedTerrain.join('/')}`;
    const lines = wrapText(ctx, reasonText, textRect.width);
    const reasonTop = inner.y + 14 + NAME_LINE_HEIGHT + 12;
    lines.forEach((line, i) => {
      ctx.fillText(line, textRect.x, reasonTop + i * REASON_LINE_HEIGHT);
    });
    ctx.restore();
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {{kind: 'buyTower', towerId: string}|null}
   */
  /**
   * @param {number} x
   * @param {number} y
   * @returns {({kind: string} & Record<string, any>)|null}
   */
  hitTest(x, y) {
    if (!this.rect || !containsPoint(this.rect, x, y)) return null;
    for (const entry of this._entries.values()) {
      if (!entry.rect) continue;
      if (entry.rect.y + entry.rect.height < this.rect.y || entry.rect.y > this.rect.y + this.rect.height) continue;
      const action = entry.button.hitTest(x, y, entry.disabled);
      if (action) return action;
    }
    return null;
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  setHover(x, y) {
    for (const entry of this._entries.values()) {
      entry.button.hovered = !!entry.rect && containsPoint(entry.rect, x, y) && !entry.disabled;
    }
  }

  /** Scrolls the card list by `deltaY` pixels, clamped to content bounds. */
  /** @param {number} deltaY */
  scroll(deltaY) {
    this._scrollOffset += deltaY;
  }

  /** @returns {{key: string, label: string, disabled: boolean, action: object}[]} */
  accessibilityControls() {
    return [...this._entries.values()].map((entry) => ({
      key: `shop-${entry.def.id}`,
      label: entry.disabledReason
        ? `Buy ${entry.def.displayName} for $${entry.def.baseCost}, unavailable: ${entry.disabledReason}`
        : `Buy ${entry.def.displayName} for $${entry.def.baseCost}`,
      disabled: entry.disabled,
      action: entry.button.action,
    }));
  }
}
