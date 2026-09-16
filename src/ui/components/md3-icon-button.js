/**
 * A round Material Design 3 icon button: title-bar minimize/maximize/close,
 * pause/settings glyphs, and anywhere else a control needs to be compact. Draws
 * its glyph procedurally with inline SVG paths keyed by the `icon` attribute —
 * no icon font, no fetched asset. Requires `aria-label`, because an icon-only
 * control with no text content has no accessible name without one; a missing
 * label logs a console warning in development rather than shipping silently.
 */

const ICONS = {
  minimize: 'M5 12h14v1.5H5z',
  maximize: 'M6 6h12v12H6zm1.5 1.5v9h9v-9z',
  restore: 'M8 6h10v10h-1.5V7.5H8zM6 8h10v10H6z',
  close: 'M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z',
  pause: 'M8 5h3v14H8zm5 0h3v14h-3z',
  play: 'M8 5.5 18 12 8 18.5z',
  settings:
    'M12 8.5A3.5 3.5 0 1 1 8.5 12 3.5 3.5 0 0 1 12 8.5m0-1.5a5 5 0 1 0 5 5 5 5 0 0 0-5-5z',
  chevronLeft: 'M14.7 6.3 9 12l5.7 5.7 1.4-1.4L11.8 12l4.3-4.3z',
  chevronRight: 'M9.3 6.3 15 12l-5.7 5.7-1.4-1.4L12.2 12 7.9 7.7z',
};

const TEMPLATE = document.createElement('template');
TEMPLATE.innerHTML = `
  <style>
    :host { display: inline-flex; }
    button {
      all: unset;
      box-sizing: border-box;
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 32px;
      border-radius: 8px;
      cursor: pointer;
      color: var(--md-sys-color-on-surface, #1d1b20);
    }
    :host([tone="close"]) button { color: var(--md-sys-color-on-surface, #1d1b20); }
    .state-layer {
      position: absolute; inset: 0; background: currentColor; opacity: 0;
      transition: background-color 120ms ease, opacity 100ms ease; pointer-events: none;
    }
    button:hover .state-layer { opacity: 0.08; }
    button:active .state-layer { opacity: 0.12; }
    :host([tone="close"]) button:hover .state-layer { background: #e53935; opacity: 0.9; }
    :host([tone="close"]) button:hover svg { fill: #ffffff; }
    button:focus-visible { outline: 2px solid var(--md-sys-color-secondary, #625b71); outline-offset: -2px; }
    button[disabled] { cursor: not-allowed; opacity: 0.38; }
    svg { width: 16px; height: 16px; fill: currentColor; position: relative; }
  </style>
  <button part="button" type="button">
    <span class="state-layer" aria-hidden="true"></span>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path></path></svg>
  </button>
`;

export class Md3IconButton extends HTMLElement {
  static get observedAttributes() {
    return ['disabled', 'aria-label', 'icon', 'title-when-disabled'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(TEMPLATE.content.cloneNode(true));
    this._button = this.shadowRoot.querySelector('button');
    this._path = this.shadowRoot.querySelector('path');
  }

  connectedCallback() {
    this._sync();
    if (!this.hasAttribute('aria-label')) {
      // eslint-disable-next-line no-console
      console.warn('md3-icon-button used without aria-label: the control has no accessible name.');
    }
  }

  attributeChangedCallback() {
    this._sync();
  }

  _sync() {
    this._button.disabled = this.hasAttribute('disabled');
    const label = this.getAttribute('aria-label') ?? '';
    this._button.setAttribute('aria-label', label);
    if (this.hasAttribute('disabled') && this.hasAttribute('title-when-disabled')) {
      this._button.title = this.getAttribute('title-when-disabled');
    } else {
      this._button.removeAttribute('title');
    }
    const icon = this.getAttribute('icon');
    this._path.setAttribute('d', ICONS[icon] ?? '');
  }

  focus(options) {
    this._button.focus(options);
  }
}

customElements.define('md3-icon-button', Md3IconButton);
