/**
 * The heads-up display: cash, base lives, wave number, phase and a
 * skip-intermission control. Always a real state with real copy, including the
 * quiet moments between waves — never a blank overlay.
 */
export class Hud {
  constructor(doc = document) {
    this.doc = doc;
    this.el = doc.createElement('div');
    this.el.className = 'hud';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');

    this.cashEl = this._stat('Cash', 'hud__cash');
    this.livesEl = this._stat('Lives', 'hud__lives');
    this.waveEl = this._stat('Wave', 'hud__wave');
    this.phaseEl = this._stat('Status', 'hud__phase');

    this.skipButton = doc.createElement('md3-button');
    this.skipButton.setAttribute('variant', 'outlined');
    this.skipButton.setAttribute('dense', '');
    this.skipButton.textContent = 'Skip intermission';
    this.skipButton.addEventListener('click', () => {
      this.el.dispatchEvent(new CustomEvent('hud-skip-intermission', { bubbles: true }));
    });

    this.el.append(this.cashEl.root, this.livesEl.root, this.waveEl.root, this.phaseEl.root, this.skipButton);
  }

  /**
   * Returns the wrapper AND the element the value goes into, because the caller
   * updates the value every frame and should not have to go looking for it.
   * @param {string} label
   * @param {string} className
   * @returns {{ root: HTMLElement, valueEl: HTMLElement }}
   */
  _stat(label, className) {
    const root = this.doc.createElement('div');
    root.className = `hud__stat ${className}`;
    const labelEl = this.doc.createElement('span');
    labelEl.className = 'hud__stat-label';
    labelEl.textContent = label;
    const valueEl = this.doc.createElement('span');
    valueEl.className = 'hud__stat-value';
    root.append(labelEl, valueEl);
    return { root, valueEl };
  }

  /** @param {import('../render/view-model.js').ViewModel} viewModel @param {number} totalWaves */
  update(viewModel, totalWaves) {
    this.cashEl.valueEl.textContent = `$${Math.floor(viewModel.cash)}`;
    this.livesEl.valueEl.textContent = String(Math.max(0, Math.floor(viewModel.lives)));
    this.waveEl.valueEl.textContent = totalWaves ? `${viewModel.waveIndex} / ${totalWaves}` : String(viewModel.waveIndex);

    if (viewModel.phase === 'intermission') {
      this.phaseEl.valueEl.textContent = `Next wave in ${Math.ceil(viewModel.intermissionSecondsRemaining)}s`;
      this.skipButton.removeAttribute('disabled');
    } else if (viewModel.phase === 'active') {
      this.phaseEl.valueEl.textContent = 'Wave in progress';
      this.skipButton.setAttribute('disabled', '');
    } else if (viewModel.phase === 'victory') {
      this.phaseEl.valueEl.textContent = 'Victory';
      this.skipButton.setAttribute('disabled', '');
    } else {
      this.phaseEl.valueEl.textContent = 'Defeated';
      this.skipButton.setAttribute('disabled', '');
    }
  }
}
