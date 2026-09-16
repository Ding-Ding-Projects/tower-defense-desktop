/**
 * The drawn furniture the whole in-canvas interface is built from: a
 * bevelled panel, a button with normal/hover/pressed/disabled states, a
 * progress bar, an icon slot, and a tooltip bubble. Every one of them is
 * game chrome, not a web control redrawn to look game-ish — flat panels with
 * an inset shadow and a hairline border, buttons that sink when pressed and
 * dim when disabled.
 *
 * Each widget class exposes `draw(ctx, rect, state)` and keeps the rect it
 * was last drawn at on `this.rect`, so a panel that owns a list of widgets
 * can hand the same rect straight to a hit test without recomputing layout.
 *
 * These functions only ever call canvas 2D context methods and read
 * measureText — no DOM, no globals, no `window.devicePixelRatio`. Palette
 * and metrics live here so every drawn control shares one visual language.
 */

import { containsPoint } from './layout.js';

export const PALETTE = {
  panelFill: '#1c1f26',
  panelFillElevated: '#22262f',
  panelBorder: 'rgba(208, 188, 255, 0.28)',
  panelShadow: 'rgba(0, 0, 0, 0.5)',
  text: '#e6e1e9',
  textMuted: '#938f99',
  textWarning: '#f2b8b5',
  textPositive: '#9ccc65',
  buttonFill: '#3a3f4b',
  buttonFillHover: '#454b59',
  buttonFillPressed: '#2e323c',
  buttonFillDisabled: '#25282f',
  buttonBorder: 'rgba(208, 188, 255, 0.4)',
  progressTrack: '#2b2d33',
  progressFill: '#d0bcff',
  progressFillWarning: '#f2b8b5',
  iconRing: 'rgba(208, 188, 255, 0.5)',
  tooltipFill: '#332d41',
  tooltipBorder: 'rgba(208, 188, 255, 0.5)',
};

/**
 * True when (x, y) is inside `rect`. Re-exported here so every widget file
 * and its tests have one obvious place to import hit testing from alongside
 * the widgets themselves.
 */
export { containsPoint };

/**
 * Wraps `text` into lines no wider than `maxWidth`, measured with the real
 * `ctx.measureText` rather than a guessed character count. A single word
 * wider than `maxWidth` still gets its own line rather than being split
 * mid-word or dropped — callers that need it to fit size the container to
 * the measurement instead of trusting a fixed width.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 * @returns {string[]}
 */
export function wrapText(ctx, text, maxWidth) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines = [];
  let current = words[0];
  for (let i = 1; i < words.length; i += 1) {
    const word = words[i];
    const candidate = `${current} ${word}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

/**
 * The measured height of `lineCount` lines of text at `lineHeight`. Kept as
 * a function (rather than inlined multiplication everywhere) so every
 * caller that sizes a container from wrapped text agrees on the formula.
 * @param {number} lineCount
 * @param {number} lineHeight
 * @returns {number}
 */
export function wrappedTextHeight(lineCount, lineHeight) {
  return Math.max(1, lineCount) * lineHeight;
}

function traceRoundedRect(ctx, rect, radius) {
  const r = Math.max(0, Math.min(radius, rect.width / 2, rect.height / 2));
  const { x, y, width: w, height: h } = rect;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

class Widget {
  constructor() {
    /** @type {import('./layout.js').Rect|null} */
    this.rect = null;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('./layout.js').Rect} rect
   * @param {object} [state]
   */
  draw(ctx, rect, state = {}) {
    this.rect = rect;
    this._draw(ctx, rect, state);
  }

  contains(x, y) {
    return containsPoint(this.rect, x, y);
  }
}

/** A bevelled panel with an inner shadow and a hairline border. */
export class Panel extends Widget {
  _draw(ctx, rect, state) {
    const { radius = 10, elevated = false } = state;
    ctx.save();
    traceRoundedRect(ctx, rect, radius);
    ctx.fillStyle = elevated ? PALETTE.panelFillElevated : PALETTE.panelFill;
    ctx.fill();

    // Inner shadow: a darker stroke traced one pixel inside the fill, giving
    // the panel a sunken, bevelled look instead of a flat rectangle.
    const inner = { x: rect.x + 1.5, y: rect.y + 1.5, width: Math.max(0, rect.width - 3), height: Math.max(0, rect.height - 3) };
    traceRoundedRect(ctx, inner, Math.max(0, radius - 2));
    ctx.strokeStyle = PALETTE.panelShadow;
    ctx.lineWidth = 2;
    ctx.stroke();

    traceRoundedRect(ctx, rect, radius);
    ctx.strokeStyle = PALETTE.panelBorder;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * @param {{disabled?: boolean, pressed?: boolean, hovered?: boolean}} state
 * @returns {'disabled'|'pressed'|'hovered'|'normal'}
 */
export function resolveButtonVisualState(state = {}) {
  if (state.disabled) return 'disabled';
  if (state.pressed) return 'pressed';
  if (state.hovered) return 'hovered';
  return 'normal';
}

const BUTTON_FILL_BY_VISUAL_STATE = {
  normal: PALETTE.buttonFill,
  hovered: PALETTE.buttonFillHover,
  pressed: PALETTE.buttonFillPressed,
  disabled: PALETTE.buttonFillDisabled,
};

/**
 * A button with normal, hover, pressed and disabled states. `state.label` is
 * always drawn in full — callers are responsible for giving the button a
 * rect wide enough for its measured label (see wrapText/wrappedTextHeight)
 * rather than relying on this widget to clip or truncate it.
 */
export class Button extends Widget {
  constructor({ id = null, action = null } = {}) {
    super();
    this.id = id;
    this.action = action;
    this.hovered = false;
    this.pressed = false;
  }

  _draw(ctx, rect, state) {
    const visual = resolveButtonVisualState({ disabled: state.disabled, pressed: state.pressed ?? this.pressed, hovered: state.hovered ?? this.hovered });
    ctx.save();
    traceRoundedRect(ctx, rect, 6);
    ctx.fillStyle = BUTTON_FILL_BY_VISUAL_STATE[visual];
    ctx.fill();
    ctx.strokeStyle = PALETTE.buttonBorder;
    ctx.globalAlpha = state.disabled ? 0.5 : 1;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;

    const font = state.font ?? '600 13px "Roboto", system-ui, sans-serif';
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = state.disabled ? PALETTE.textMuted : PALETTE.text;
    const cx = rect.x + rect.width / 2;
    const label = state.label ?? '';
    if (state.sublabel) {
      ctx.fillText(label, cx, rect.y + rect.height * 0.36);
      ctx.font = state.sublabelFont ?? '400 11px "Roboto", system-ui, sans-serif';
      ctx.fillStyle = state.disabled ? PALETTE.textWarning : PALETTE.textMuted;
      ctx.fillText(state.sublabel, cx, rect.y + rect.height * 0.7);
    } else {
      ctx.fillText(label, cx, rect.y + rect.height / 2);
    }
    ctx.restore();
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {boolean} disabled
   * @returns {*} this button's action, or null when the point misses or the button is disabled
   */
  hitTest(x, y, disabled) {
    if (disabled) return null;
    if (!this.contains(x, y)) return null;
    return this.action;
  }
}

/** A horizontal progress bar (used for hp readouts, cooldowns, XP-style meters). */
export class ProgressBar extends Widget {
  _draw(ctx, rect, state) {
    const ratio = Math.min(1, Math.max(0, state.ratio ?? 0));
    ctx.save();
    traceRoundedRect(ctx, rect, Math.min(4, rect.height / 2));
    ctx.fillStyle = PALETTE.progressTrack;
    ctx.fill();
    if (ratio > 0) {
      const fillRect = { x: rect.x, y: rect.y, width: rect.width * ratio, height: rect.height };
      traceRoundedRect(ctx, fillRect, Math.min(4, rect.height / 2));
      ctx.fillStyle = state.warning ? PALETTE.progressFillWarning : PALETTE.progressFill;
      ctx.fill();
    }
    ctx.restore();
  }
}

/** A square icon slot: a bevelled frame around a simple deterministic glyph. */
export class IconSlot extends Widget {
  _draw(ctx, rect, state) {
    ctx.save();
    traceRoundedRect(ctx, rect, 6);
    ctx.fillStyle = PALETTE.panelFillElevated;
    ctx.fill();
    ctx.strokeStyle = PALETTE.iconRing;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const glyph = (state.glyph ?? '?').slice(0, 1).toUpperCase();
    ctx.font = `700 ${Math.round(rect.height * 0.5)}px "Roboto", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = state.tint ?? PALETTE.text;
    ctx.fillText(glyph, rect.x + rect.width / 2, rect.y + rect.height / 2 + 1);
    ctx.restore();
  }
}

/**
 * A tooltip bubble anchored above (or, if there is no room, below) a point,
 * sized to its wrapped, measured text rather than a fixed guess. Clamped so
 * it never draws outside `state.bounds` when supplied.
 */
export class Tooltip extends Widget {
  _draw(ctx, rect, state) {
    const text = state.text ?? '';
    if (!text) return;
    const font = state.font ?? '400 12px "Roboto", system-ui, sans-serif';
    ctx.save();
    ctx.font = font;
    const maxWidth = state.maxWidth ?? 220;
    const lines = wrapText(ctx, text, maxWidth - 16);
    const lineHeight = state.lineHeight ?? 16;
    const textWidth = Math.min(maxWidth - 16, Math.max(...lines.map((l) => ctx.measureText(l).width)));
    const width = textWidth + 16;
    const height = wrappedTextHeight(lines.length, lineHeight) + 12;

    let x = rect.x - width / 2;
    let y = rect.y - height - 8;
    const bounds = state.bounds;
    if (bounds) {
      x = Math.min(Math.max(bounds.x, x), bounds.x + bounds.width - width);
      if (y < bounds.y) y = rect.y + 8;
    }
    const bubbleRect = { x, y, width, height };
    this.rect = bubbleRect;

    traceRoundedRect(ctx, bubbleRect, 6);
    ctx.fillStyle = PALETTE.tooltipFill;
    ctx.fill();
    ctx.strokeStyle = PALETTE.tooltipBorder;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = PALETTE.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => {
      ctx.fillText(line, x + 8, y + 6 + i * lineHeight);
    });
    ctx.restore();
  }
}

export { traceRoundedRect };
