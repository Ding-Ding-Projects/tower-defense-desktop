/**
 * The pause surface and the settings surface reachable from it: resume, open
 * settings, quit; and, in settings, sound volume, a reduced-motion override
 * (on top of honouring the OS `prefers-reduced-motion` automatically) and a
 * close action. Both are real md3-dialogs.
 */
export class PauseAndSettings {
  constructor(doc = document) {
    this.doc = doc;

    this.pauseDialog = doc.createElement('md3-dialog');
    this.pauseDialog.setAttribute('no-escape-close', '');
    const pauseHeadline = doc.createElement('span');
    pauseHeadline.slot = 'headline';
    pauseHeadline.textContent = 'Paused';
    const pauseBody = doc.createElement('p');
    pauseBody.textContent = 'The match is paused. Nothing is moving.';
    this.resumeButton = doc.createElement('md3-button');
    this.resumeButton.slot = 'actions';
    this.resumeButton.setAttribute('variant', 'filled');
    this.resumeButton.textContent = 'Resume';
    this.resumeButton.addEventListener('click', () => {
      this.pauseDialog.close();
      this._emit('pause-resume');
    });
    this.settingsButton = doc.createElement('md3-button');
    this.settingsButton.slot = 'actions';
    this.settingsButton.setAttribute('variant', 'outlined');
    this.settingsButton.textContent = 'Settings';
    this.settingsButton.addEventListener('click', () => {
      this.pauseDialog.close();
      this.settingsDialog.open();
    });
    this.pauseDialog.append(pauseHeadline, pauseBody, this.resumeButton, this.settingsButton);

    this.settingsDialog = doc.createElement('md3-dialog');
    const settingsHeadline = doc.createElement('span');
    settingsHeadline.slot = 'headline';
    settingsHeadline.textContent = 'Settings';

    const volumeRow = doc.createElement('label');
    volumeRow.className = 'settings-row';
    const volumeLabel = doc.createElement('span');
    volumeLabel.textContent = 'Sound volume';
    this.volumeInput = doc.createElement('input');
    this.volumeInput.type = 'range';
    this.volumeInput.min = '0';
    this.volumeInput.max = '100';
    this.volumeInput.value = '70';
    this.volumeInput.className = 'md3-slider';
    this.volumeInput.addEventListener('input', () => {
      this._emit('settings-volume-change', { volume: Number(this.volumeInput.value) });
    });
    volumeRow.append(volumeLabel, this.volumeInput);

    const motionRow = doc.createElement('div');
    motionRow.className = 'settings-row';
    this.reducedMotionSwitch = doc.createElement('md3-switch');
    this.reducedMotionSwitch.textContent = 'Reduce motion';
    this.reducedMotionSwitch.addEventListener('change', () => {
      this._emit('settings-reduced-motion-change', { reducedMotion: this.reducedMotionSwitch.checked });
    });
    motionRow.append(this.reducedMotionSwitch);

    this.closeSettingsButton = doc.createElement('md3-button');
    this.closeSettingsButton.slot = 'actions';
    this.closeSettingsButton.setAttribute('variant', 'filled');
    this.closeSettingsButton.textContent = 'Done';
    this.closeSettingsButton.addEventListener('click', () => this.settingsDialog.close());

    this.settingsDialog.append(settingsHeadline, volumeRow, motionRow, this.closeSettingsButton);

    this._host = null;
  }

  _emit(type, detail) {
    (this._host ?? document).dispatchEvent(new CustomEvent(type, { bubbles: true, detail }));
  }

  mount(host) {
    this._host = host;
    host.append(this.pauseDialog, this.settingsDialog);
  }

  openPause() {
    this.pauseDialog.open();
  }

  /** @param {boolean} systemPrefersReducedMotion */
  setSystemReducedMotionHint(systemPrefersReducedMotion) {
    if (systemPrefersReducedMotion) {
      this.reducedMotionSwitch.setAttribute('checked', '');
    }
  }
}
