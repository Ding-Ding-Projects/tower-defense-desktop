/**
 * Choosing which map and which difficulty to play.
 *
 * The game shipped with two maps and six difficulties and no way to reach any of them.
 * `app.js` took the first map in the loaded data and the first difficulty marked
 * selectable, and nothing anywhere let a player change either, so one of the two maps and
 * five of the six difficulties were data nobody could get to. Restarting after a victory
 * or a defeat put you back on exactly the same combination.
 *
 * That is the same defect as the cliff zones that no tower could occupy, on a much larger
 * scale: content that exists, is validated, has wave tables generated for it, and is
 * unreachable from the running program.
 *
 * Built as a DOM overlay rather than inside the canvas, matching the pause and settings
 * screens. That is the established shape for anything wrapped around a match rather than
 * part of one, and it means every choice here is a real button an assistive technology
 * can find, rather than a rectangle drawn on a canvas that would need mirroring.
 *
 * @typedef {import('./components/md3-dialog.js').Md3Dialog} Md3Dialog
 * @typedef {import('./components/md3-button.js').Md3Button} Md3Button
 */

export class MatchSetup {
  /**
   * @param {{ maps: any[], difficulties: any[] }} options
   * @param {Document} [doc]
   */
  constructor(options, doc = document) {
    this.doc = doc;
    this.maps = options.maps;

    // Only the ones the data says may be chosen. Hardcore carries `selectable: false`,
    // and in the source game it is unlocked by progression this project does not have,
    // so offering it here would be inventing a rule rather than reading one. It remains
    // reachable to the simulation, and the end-to-end checks play it.
    this.difficulties = options.difficulties.filter((d) => d.selectable);

    if (this.maps.length === 0 || this.difficulties.length === 0) {
      throw new Error('match setup: nothing to choose between');
    }

    this.selectedMapId = this.maps[0].id;
    this.selectedDifficultyId = this.difficulties[0].id;

    this.dialog = /** @type {Md3Dialog} */ (doc.createElement('md3-dialog'));
    this.dialog.setAttribute('id', 'match-setup');

    const headline = doc.createElement('span');
    headline.setAttribute('slot', 'headline');
    headline.textContent = 'Choose a battlefield';

    this.mapButtons = this._buildGroup('Map', this.maps, (def) => {
      this.selectedMapId = def.id;
      this._refresh();
    });
    this.difficultyButtons = this._buildGroup('Difficulty', this.difficulties, (def) => {
      this.selectedDifficultyId = def.id;
      this._refresh();
    });

    this.startButton = /** @type {Md3Button} */ (doc.createElement('md3-button'));
    this.startButton.setAttribute('variant', 'filled');
    this.startButton.setAttribute('slot', 'actions');
    this.startButton.textContent = 'Start';
    this.startButton.addEventListener('click', () => {
      this.dialog.close();
      this._emit('match-setup-start', {
        mapId: this.selectedMapId,
        difficultyId: this.selectedDifficultyId,
      });
    });

    this.dialog.append(
      headline,
      this.mapButtons.section,
      this.difficultyButtons.section,
      this.startButton,
    );
    this._host = null;
    this._refresh();
  }

  /**
   * One labelled row of choices.
   * @param {string} label
   * @param {any[]} defs
   * @param {(def: any) => void} onChoose
   */
  _buildGroup(label, defs, onChoose) {
    const doc = this.doc;
    const section = doc.createElement('section');
    section.className = 'match-setup-group';

    const heading = doc.createElement('h3');
    heading.textContent = label;
    section.append(heading);

    const buttons = defs.map((def) => {
      const button = /** @type {Md3Button} */ (doc.createElement('md3-button'));
      button.setAttribute('variant', 'outlined');
      button.textContent = def.displayName ?? def.id;
      // Named for what it selects, not just what it says. Two groups of buttons reading
      // "Crossroads" and "Easy" tell a screen reader nothing about which is which.
      button.setAttribute('aria-label', label + ': ' + (def.displayName ?? def.id));
      button.addEventListener('click', () => onChoose(def));
      section.append(button);
      return { def, button };
    });

    return { section, buttons };
  }

  /** Mark exactly one button in each group as the current choice. */
  _refresh() {
    for (const { def, button } of this.mapButtons.buttons) {
      this._mark(button, def.id === this.selectedMapId);
    }
    for (const { def, button } of this.difficultyButtons.buttons) {
      this._mark(button, def.id === this.selectedDifficultyId);
    }
  }

  /**
   * @param {Md3Button} button
   * @param {boolean} chosen
   */
  _mark(button, chosen) {
    // aria-pressed as well as the visual variant. A filled button and an outlined one
    // are indistinguishable to anything that is not looking at them.
    button.setAttribute('variant', chosen ? 'filled' : 'outlined');
    button.setAttribute('aria-pressed', chosen ? 'true' : 'false');
  }

  /**
   * @param {string} type
   * @param {any} [detail]
   */
  _emit(type, detail) {
    (this._host ?? this.doc).dispatchEvent(new CustomEvent(type, { bubbles: true, detail }));
  }

  /** @param {HTMLElement} host */
  mount(host) {
    this._host = host;
    host.append(this.dialog);
  }

  open() {
    this.dialog.open();
  }
}
