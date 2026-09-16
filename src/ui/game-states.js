/**
 * Wave start, wave clear, victory and defeat overlays. Each is a real md3-dialog
 * with real copy and a real action, never a blank screen while the match waits.
 * app.js owns opening/closing these as the snapshot's phase changes.
 */
/**
 * The Material Design components this module builds.
 *
 * `createElement('md3-dialog')` hands back an HTMLElement, which knows nothing about
 * the component's own `open`, `close`, `checked` and the rest. The classes themselves
 * are exported, so casting to them is not a convenience fiction: it names what the
 * element genuinely is once the custom element registry has upgraded it.
 *
 * @typedef {import('./components/md3-dialog.js').Md3Dialog} Md3Dialog
 * @typedef {import('./components/md3-button.js').Md3Button} Md3Button
 * @typedef {import('./components/md3-switch.js').Md3Switch} Md3Switch
 */

export class GameStateOverlays {
  constructor(doc = document) {
    this.doc = doc;
    this.waveStart = this._buildDialog('wave-start', 'Continue', () => this._emit('game-state-continue'));
    this.waveClear = this._buildDialog('wave-clear', 'Next wave', () => this._emit('game-state-continue'));
    this.victory = this._buildDialog('victory', 'Play again', () => this._emit('game-state-restart'));
    this.defeat = this._buildDialog('defeat', 'Try again', () => this._emit('game-state-restart'));
    this.root = doc.createDocumentFragment();
    this.root.append(this.waveStart.el, this.waveClear.el, this.victory.el, this.defeat.el);
    this._host = null;
  }

  /**
   * @param {string} kind
   * @param {string} actionLabel
   * @param {() => void} onAction
   * @returns {{el: Md3Dialog, headline: HTMLElement, body: HTMLElement, action: Md3Button}}
   */
  _buildDialog(kind, actionLabel, onAction) {
    const el = /** @type {Md3Dialog} */ (this.doc.createElement('md3-dialog'));
    el.className = `game-state-dialog game-state-dialog--${kind}`;
    el.setAttribute('no-escape-close', '');

    const headline = this.doc.createElement('span');
    headline.slot = 'headline';

    const body = this.doc.createElement('p');

    const action = /** @type {Md3Button} */ (this.doc.createElement('md3-button'));
    action.slot = 'actions';
    action.setAttribute('variant', 'filled');
    action.textContent = actionLabel;
    action.addEventListener('click', () => {
      el.close();
      onAction();
    });

    el.append(headline, body, action);
    return { el, headline, body, action };
  }

  /** @param {string} type */
  _emit(type) {
    (this._host ?? document).dispatchEvent(new CustomEvent(type, { bubbles: true }));
  }

  /** @param {HTMLElement} host */
  mount(host) {
    this._host = host;
    host.appendChild(this.root);
  }

  closeAll() {
    for (const dialog of [this.waveStart, this.waveClear, this.victory, this.defeat]) {
      dialog.el.close();
    }
  }

  /**
   * @param {number} waveIndex
   * @param {number} totalWaves
   */
  showWaveStart(waveIndex, totalWaves) {
    this.waveStart.headline.textContent = `Wave ${waveIndex} of ${totalWaves}`;
    this.waveStart.body.textContent = 'Enemies are inbound. Check your towers before it starts.';
    this.waveStart.el.open();
  }

  /**
   * @param {number} waveIndex
   * @param {number} completionBonus
   */
  showWaveClear(waveIndex, completionBonus) {
    this.waveClear.headline.textContent = `Wave ${waveIndex} cleared`;
    this.waveClear.body.textContent = completionBonus
      ? `No leaks got through. Completion bonus: $${completionBonus}.`
      : 'No leaks got through.';
    this.waveClear.el.open();
  }

  /** @param {number} waveCount */
  showVictory(waveCount) {
    this.victory.headline.textContent = 'Victory';
    this.victory.body.textContent = `All ${waveCount} waves survived. The base held.`;
    this.victory.el.open();
  }

  /** @param {number} waveIndex */
  showDefeat(waveIndex) {
    this.defeat.headline.textContent = 'Defeated';
    this.defeat.body.textContent = `The base fell on wave ${waveIndex}. Every leak counts.`;
    this.defeat.el.open();
  }
}
