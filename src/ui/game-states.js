/**
 * Wave start, wave clear, victory and defeat overlays. Each is a real md3-dialog
 * with real copy and a real action, never a blank screen while the match waits.
 * app.js owns opening/closing these as the snapshot's phase changes.
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

  _buildDialog(kind, actionLabel, onAction) {
    const el = this.doc.createElement('md3-dialog');
    el.className = `game-state-dialog game-state-dialog--${kind}`;
    el.setAttribute('no-escape-close', '');

    const headline = this.doc.createElement('span');
    headline.slot = 'headline';

    const body = this.doc.createElement('p');

    const action = this.doc.createElement('md3-button');
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

  _emit(type) {
    (this._host ?? document).dispatchEvent(new CustomEvent(type, { bubbles: true }));
  }

  mount(host) {
    this._host = host;
    host.appendChild(this.root);
  }

  closeAll() {
    for (const dialog of [this.waveStart, this.waveClear, this.victory, this.defeat]) {
      dialog.el.close();
    }
  }

  showWaveStart(waveIndex, totalWaves) {
    this.waveStart.headline.textContent = `Wave ${waveIndex} of ${totalWaves}`;
    this.waveStart.body.textContent = 'Enemies are inbound. Check your towers before it starts.';
    this.waveStart.el.open();
  }

  showWaveClear(waveIndex, completionBonus) {
    this.waveClear.headline.textContent = `Wave ${waveIndex} cleared`;
    this.waveClear.body.textContent = completionBonus
      ? `No leaks got through. Completion bonus: $${completionBonus}.`
      : 'No leaks got through.';
    this.waveClear.el.open();
  }

  showVictory(waveCount) {
    this.victory.headline.textContent = 'Victory';
    this.victory.body.textContent = `All ${waveCount} waves survived. The base held.`;
    this.victory.el.open();
  }

  showDefeat(waveIndex) {
    this.defeat.headline.textContent = 'Defeated';
    this.defeat.body.textContent = `The base fell on wave ${waveIndex}. Every leak counts.`;
    this.defeat.el.open();
  }
}
