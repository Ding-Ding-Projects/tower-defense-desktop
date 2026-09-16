/**
 * The offscreen, visually-hidden DOM mirror every panel in this directory
 * keeps beside its canvas drawing. Moving the whole interface onto a canvas
 * makes it invisible to a screen reader and unreachable by Tab, so each
 * panel that owns interactive controls reconciles one of these against the
 * exact same control list it just drew: a real, focusable `<button>` per
 * control, with a correct accessible name, that fires the identical action
 * a mouse click on the canvas would.
 *
 * The container is hidden with the standard clip-to-1px "visually hidden"
 * technique (never `display:none` or `visibility:hidden`, both of which
 * would also remove it from the accessibility tree and from the tab order)
 * so assistive tech and keyboard users can still reach every control while
 * sighted mouse users see only the canvas.
 */

const HIDDEN_STYLE =
  'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;' +
  'clip:rect(0,0,0,0);clip-path:inset(50%);white-space:nowrap;border:0;';

export class AccessibilityMirror {
  /**
   * @param {Document|null} [doc]
   * @param {string} [label]  aria-label for the mirror's own container region
   */
  constructor(doc = (typeof document !== 'undefined' ? document : null), label = 'Game interface controls') {
    this.doc = doc;
    this.label = label;
    this.container = null;
    /** @type {Map<string, HTMLButtonElement>} */
    this._elements = new Map();
  }

  get isAvailable() {
    return !!this.doc;
  }

  mount(host) {
    if (!this.doc || !host) return;
    if (this.container) this.unmount();
    this.container = this.doc.createElement('div');
    this.container.className = 'interface-layer-a11y-mirror';
    this.container.setAttribute('role', 'group');
    this.container.setAttribute('aria-label', this.label);
    this.container.setAttribute('style', HIDDEN_STYLE);
    host.appendChild(this.container);
  }

  unmount() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
    this._elements.clear();
  }

  /**
   * Reconciles the mirror's real DOM buttons to exactly match `controls`:
   * creates any missing element, updates every element's label/disabled
   * state, and removes any element whose control disappeared this frame
   * (for example, the tower panel's controls once nothing is selected).
   * @param {{key: string, label: string, disabled?: boolean, action: object}[]} controls
   * @param {(action: object) => void} dispatch  called with the control's action on activation
   */
  sync(controls, dispatch) {
    if (!this.container) return;
    const seen = new Set();
    for (const control of controls) {
      seen.add(control.key);
      let el = this._elements.get(control.key);
      if (!el) {
        el = this.doc.createElement('button');
        el.type = 'button';
        el.addEventListener('click', () => {
          if (el.disabled) return;
          dispatch(control.action);
        });
        this.container.appendChild(el);
        this._elements.set(control.key, el);
      }
      if (el.textContent !== control.label) el.textContent = control.label;
      el.setAttribute('aria-label', control.label);
      el.disabled = !!control.disabled;
      el.setAttribute('aria-disabled', String(!!control.disabled));
      el._interfaceAction = control.action;
    }
    for (const [key, el] of this._elements) {
      if (!seen.has(key)) {
        el.remove();
        this._elements.delete(key);
      }
    }
  }

  /** @returns {number} how many real controls the mirror currently holds */
  get size() {
    return this._elements.size;
  }
}
