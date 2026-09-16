/**
 * Wave start, wave cleared, victory and defeat, drawn in-canvas as a
 * dimmed, modal card rather than an HTML dialog. Each is a real state with
 * real copy and a real dismiss action — never a blank screen while the
 * match waits for the player to notice something happened.
 *
 * This module is intentionally stateless per draw call: it draws whatever
 * `kind` it is told to draw (or nothing, when `kind` is null) and reports
 * hit testing for its one dismiss button. Deciding *when* a phase change
 * should open an overlay, and remembering that it was dismissed, is owned
 * by interface-layer.js — the one place in this directory that already
 * tracks state across frames.
 */
import { inset, containsPoint } from './layout.js';
import { Panel, Button, PALETTE } from './widgets.js';

const CARD_WIDTH = 420;
const CARD_HEIGHT = 180;
const PADDING = 20;
const BUTTON_HEIGHT = 40;

const COPY = {
  waveStart: {
    headline: (p) => `Wave ${p.waveIndex} of ${p.totalWaves || p.waveIndex}`,
    body: () => 'Enemies are inbound. Check your towers before it starts.',
    actionLabel: 'Continue',
  },
  waveClear: {
    headline: (p) => `Wave ${p.waveIndex} cleared`,
    body: (p) => (p.completionBonus ? `No leaks got through. Completion bonus: $${p.completionBonus}.` : 'No leaks got through.'),
    actionLabel: 'Next wave',
  },
  victory: {
    headline: () => 'Victory',
    body: (p) => `All ${p.totalWaves} waves survived. The base held.`,
    actionLabel: 'Play again',
  },
  defeat: {
    headline: (p) => `Defeated`,
    body: (p) => `The base fell on wave ${p.waveIndex}. Every leak counts.`,
    actionLabel: 'Try again',
  },
};

export class OverlayHud {
  constructor() {
    this.rect = null;
    this._button = new Button({ id: 'overlay-dismiss', action: null });
    this._kind = null;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('./layout.js').Rect} viewportRect
   * @param {{kind: 'waveStart'|'waveClear'|'victory'|'defeat'|null, payload?: object}} state
   */
  draw(ctx, viewportRect, state = {}) {
    const { kind, payload = {} } = state;
    this._kind = kind;
    if (!kind || !COPY[kind]) {
      this.rect = null;
      this._button.rect = null;
      return;
    }
    this.rect = viewportRect;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(viewportRect.x, viewportRect.y, viewportRect.width, viewportRect.height);
    ctx.restore();

    const cardRect = {
      x: viewportRect.x + (viewportRect.width - CARD_WIDTH) / 2,
      y: viewportRect.y + (viewportRect.height - CARD_HEIGHT) / 2,
      width: Math.min(CARD_WIDTH, viewportRect.width - PADDING * 2),
      height: CARD_HEIGHT,
    };
    const panel = this._panel ?? (this._panel = new Panel());
    panel.draw(ctx, cardRect, { elevated: true });

    const inner = inset(cardRect, PADDING);
    const copy = COPY[kind];

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '700 22px "Roboto", system-ui, sans-serif';
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(copy.headline(payload), cardRect.x + cardRect.width / 2, inner.y + 26);

    ctx.font = '400 14px "Roboto", system-ui, sans-serif';
    ctx.fillStyle = PALETTE.textMuted;
    wrapCentered(ctx, copy.body(payload), cardRect.x + cardRect.width / 2, inner.y + 56, inner.width);
    ctx.restore();

    const buttonRect = {
      x: cardRect.x + (cardRect.width - 200) / 2,
      y: cardRect.y + cardRect.height - PADDING - BUTTON_HEIGHT,
      width: 200,
      height: BUTTON_HEIGHT,
    };
    this._button.action = { kind: 'dismissOverlay', overlayKind: kind };
    this._button.draw(ctx, buttonRect, {
      label: copy.actionLabel,
      disabled: false,
      hovered: this._button.hovered,
    });
  }

  get isBlocking() {
    return !!this._kind;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {{kind: 'dismissOverlay', overlayKind: string}|{kind: 'overlayBlocked'}|null}
   */
  hitTest(x, y) {
    if (!this._kind) return null;
    const button = this._button.hitTest(x, y, false);
    if (button) return button;
    // Modal: any other click within the dimmed viewport is swallowed rather
    // than falling through to the battlefield underneath it.
    if (containsPoint(this.rect, x, y)) return { kind: 'overlayBlocked' };
    return null;
  }

  setHover(x, y) {
    this._button.hovered = this._button.contains(x, y);
  }

  /** @returns {{key: string, label: string, disabled: boolean, action: object}[]} */
  accessibilityControls() {
    if (!this._kind) return [];
    return [{
      key: 'overlay-dismiss',
      label: COPY[this._kind].actionLabel,
      disabled: false,
      action: { kind: 'dismissOverlay', overlayKind: this._kind },
    }];
  }
}

function wrapCentered(ctx, text, cx, y, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = words[0] ?? '';
  for (let i = 1; i < words.length; i += 1) {
    const candidate = `${current} ${words[i]}`;
    if (ctx.measureText(candidate).width <= maxWidth) current = candidate;
    else {
      lines.push(current);
      current = words[i];
    }
  }
  if (current) lines.push(current);
  lines.forEach((line, i) => ctx.fillText(line, cx, y + i * 18));
}
