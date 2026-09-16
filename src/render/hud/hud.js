/**
 * The heads-up display: cash, lives, wave number and phase, drawn as a game
 * HUD bar, plus a skip-intermission control and a pause control. Always a
 * real state with real copy, including the quiet moments between waves —
 * never a blank strip while the match waits.
 *
 * Every stat's cell width is measured from its own current text rather than
 * a fixed guess, and the whole bar falls back to two rows when the measured
 * content does not fit the available width in one — the same "measure, then
 * lay out" rule the shop and tower panel follow, so a long "$123,456"
 * balance or a narrow 320px viewport never clips a stat.
 */
import { inset, row, stack, containsPoint } from './layout.js';
import { Panel, Button, PALETTE } from './widgets.js';

const PADDING = 10;
const STAT_GAP = 16;
const BUTTON_WIDTH = 130;
const BUTTON_HEIGHT = 30;
const ROW_HEIGHT = 32;

/**
 * What the top bar says the match is currently doing.
 * @typedef {{
 *   cash: number, lives: number, waveIndex: number, totalWaves: number,
 *   phase: string, intermissionSecondsRemaining: number, paused: boolean,
 * }} HudState
 */

/**
 * @param {HudState} state
 * @returns {string}
 */
function phaseLabel(state) {
  if (state.phase === 'intermission') return `Next wave in ${Math.ceil(state.intermissionSecondsRemaining)}s`;
  if (state.phase === 'active') return 'Wave in progress';
  if (state.phase === 'victory') return 'Victory';
  return 'Defeated';
}

export class GameHud {
  constructor() {
    this.rect = null;
    this._skipButton = new Button({ id: 'skip', action: { kind: 'skipIntermission' } });
    this._pauseButton = new Button({ id: 'pause', action: { kind: 'togglePause' } });
    this._skipDisabled = true;
  }

  /**
   * @param {HudState} state
   * @returns {{ label: string, value: string }[]}
   */
  _statsOf(state) {
    return [
      { label: 'Cash', value: `$${Math.floor(state.cash)}` },
      { label: 'Lives', value: String(Math.max(0, Math.floor(state.lives))) },
      { label: 'Wave', value: state.totalWaves ? `${state.waveIndex} / ${state.totalWaves}` : String(state.waveIndex) },
      { label: 'Status', value: phaseLabel(state) },
    ];
  }

  /**
   * Computes the bar's layout without drawing anything, so a caller (the
   * interface layer) can reserve exactly the right amount of vertical space
   * for the HUD before laying out everything below it.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} width
   * @param {HudState} state
   * @returns {{barHeight: number, fitsOneRow: boolean, statWidths: number[], totalStatsWidth: number, buttonsWidth: number}}
   */
  measureLayout(ctx, width, state) {
    const stats = this._statsOf(state);
    ctx.save();
    ctx.font = '700 13px "Roboto", system-ui, sans-serif';
    const statWidths = stats.map((s) => Math.max(ctx.measureText(`${s.label}: ${s.value}`).width + 4, 60));
    ctx.restore();
    const totalStatsWidth = statWidths.reduce((a, b) => a + b, 0) + STAT_GAP * (stats.length - 1);
    const buttonsWidth = BUTTON_WIDTH * 2 + PADDING;
    const fitsOneRow = totalStatsWidth + PADDING + buttonsWidth <= width;
    const barHeight = fitsOneRow ? ROW_HEIGHT + PADDING : ROW_HEIGHT * 2 + PADDING * 1.5;
    return { barHeight, fitsOneRow, statWidths, totalStatsWidth, buttonsWidth };
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} width
   * @param {HudState} state
   * @returns {number}
   */
  measureBarHeight(ctx, width, state) {
    return this.measureLayout(ctx, width, state).barHeight;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('./layout.js').Rect} rect
   * @param {{cash:number, lives:number, waveIndex:number, totalWaves:number, phase:string, intermissionSecondsRemaining:number, paused:boolean}} state
   */
  draw(ctx, rect, state) {
    this.rect = rect;
    const stats = this._statsOf(state);
    const { barHeight, fitsOneRow, statWidths, buttonsWidth } = this.measureLayout(ctx, rect.width, state);
    const barRect = { x: rect.x, y: rect.y, width: rect.width, height: barHeight };

    const panel = this._panel ?? (this._panel = new Panel());
    panel.draw(ctx, barRect, {});

    const inner = inset(barRect, PADDING / 2, PADDING);

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    if (fitsOneRow) {
      let x = inner.x;
      const y = inner.y + ROW_HEIGHT / 2;
      stats.forEach((s, i) => {
        this._drawStat(ctx, x, y, s);
        x += statWidths[i] + STAT_GAP;
      });
      const [, buttonsRect] = row(inner, [null, buttonsWidth], STAT_GAP);
      this._drawButtons(ctx, buttonsRect, state);
    } else {
      let x = inner.x;
      const y = inner.y + ROW_HEIGHT / 2;
      stats.forEach((s, i) => {
        this._drawStat(ctx, x, y, s);
        x += statWidths[i] + STAT_GAP;
      });
      const buttonsRow = { x: inner.x, y: inner.y + ROW_HEIGHT + PADDING / 2, width: inner.width, height: ROW_HEIGHT };
      const [, buttonsRect] = row(buttonsRow, [null, buttonsWidth], STAT_GAP);
      this._drawButtons(ctx, buttonsRect, state);
    }
    ctx.restore();
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x
   * @param {number} y  the baseline between the label and its value
   * @param {{ label: string, value: string }} stat
   */
  _drawStat(ctx, x, y, stat) {
    ctx.font = '400 11px "Roboto", system-ui, sans-serif';
    ctx.fillStyle = PALETTE.textMuted;
    ctx.fillText(`${stat.label}:`, x, y - 7);
    ctx.font = '700 13px "Roboto", system-ui, sans-serif';
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(stat.value, x, y + 7);
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('./layout.js').Rect} rect
   * @param {HudState} state
   */
  _drawButtons(ctx, rect, state) {
    const [skipRect, pauseRect] = row(rect, [BUTTON_WIDTH, BUTTON_WIDTH], PADDING);
    this._skipDisabled = state.phase !== 'intermission';
    this._skipButton.draw(ctx, skipRect, {
      label: 'Skip intermission',
      disabled: this._skipDisabled,
      hovered: this._skipButton.hovered,
    });
    this._pauseButton.draw(ctx, pauseRect, {
      label: state.paused ? 'Resume' : 'Pause',
      disabled: false,
      hovered: this._pauseButton.hovered,
    });
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {{kind: 'skipIntermission'}|{kind: 'togglePause'}|null}
   */
  hitTest(x, y) {
    if (!this.rect || !containsPoint(this.rect, x, y)) return null;
    const skip = this._skipButton.hitTest(x, y, this._skipDisabled);
    if (skip) return skip;
    const pause = this._pauseButton.hitTest(x, y, false);
    if (pause) return pause;
    return null;
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  setHover(x, y) {
    this._skipButton.hovered = this._skipButton.contains(x, y);
    this._pauseButton.hovered = this._pauseButton.contains(x, y);
  }

  /**
   * @param {boolean} paused
   * @returns {{key: string, label: string, disabled: boolean, action: object}[]}
   */
  accessibilityControls(paused) {
    return [
      { key: 'hud-skip', label: 'Skip intermission', disabled: this._skipDisabled, action: { kind: 'skipIntermission' } },
      { key: 'hud-pause', label: paused ? 'Resume' : 'Pause', disabled: false, action: { kind: 'togglePause' } },
    ];
  }
}
