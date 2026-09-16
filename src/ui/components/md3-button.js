/**
 * A genuine Material Design 3 button: filled, tonal, outlined or text variant,
 * a real state layer for hover/press, a container shape and elevation, and a
 * real shadow-DOM `<button>` underneath so focus, keyboard activation
 * (Enter/Space), disabled semantics and the accessible name all come from the
 * browser's own button implementation rather than being reimplemented on a
 * `<div>`. Consumers get and set `disabled` like any form control and listen
 * for the native `click` event, which composes out through the shadow boundary.
 */

const TEMPLATE = document.createElement('template');
TEMPLATE.innerHTML = `
  <style>
    :host {
      display: inline-flex;
      --md3-btn-bg: var(--md-sys-color-primary, #6750a4);
      --md3-btn-fg: var(--md-sys-color-on-primary, #ffffff);
    }
    button {
      all: unset;
      box-sizing: border-box;
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 40px;
      min-width: 40px;
      padding: 0 24px;
      border-radius: 999px;
      font: 500 14px/20px Roboto, system-ui, sans-serif;
      letter-spacing: 0.1px;
      cursor: pointer;
      background: var(--md3-btn-bg);
      color: var(--md3-btn-fg);
      overflow: hidden;
    }
    :host([variant="tonal"]) { --md3-btn-bg: var(--md-sys-color-secondary-container, #e8def8); --md3-btn-fg: var(--md-sys-color-on-secondary-container, #1d192b); }
    :host([variant="outlined"]) button { background: transparent; color: var(--md-sys-color-primary, #6750a4); border: 1px solid var(--md-sys-color-outline, #79747e); }
    :host([variant="text"]) button { background: transparent; color: var(--md-sys-color-primary, #6750a4); padding: 0 12px; min-width: 0; }
    :host([variant="filled"]) button { box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 1px 3px 1px rgba(0, 0, 0, 0.15); }
    :host([dense]) button { min-height: 32px; padding: 0 16px; font-size: 13px; }
    .state-layer {
      position: absolute;
      inset: 0;
      background: currentColor;
      opacity: 0;
      transition: opacity 100ms ease;
      pointer-events: none;
    }
    button:hover .state-layer { opacity: 0.08; }
    button:active .state-layer { opacity: 0.12; }
    button:focus-visible {
      outline: 3px solid var(--md-sys-color-secondary, #625b71);
      outline-offset: 2px;
    }
    button[disabled] { cursor: not-allowed; opacity: 0.38; }
    button[aria-pressed="true"] {
      background: var(--md-sys-color-secondary-container, #e8def8);
      color: var(--md-sys-color-on-secondary-container, #1d192b);
    }
    ::slotted([slot="icon"]) { display: inline-flex; width: 18px; height: 18px; }
  </style>
  <button part="button" type="button">
    <slot name="icon"></slot>
    <slot></slot>
    <span class="state-layer" aria-hidden="true"></span>
  </button>
`;

export class Md3Button extends HTMLElement {
  static get observedAttributes() {
    return ['disabled', 'aria-pressed', 'aria-label', 'variant'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(TEMPLATE.content.cloneNode(true));
    this._button = this.shadowRoot.querySelector('button');
  }

  connectedCallback() {
    if (!this.hasAttribute('variant')) this.setAttribute('variant', 'filled');
    this._sync();
  }

  attributeChangedCallback() {
    this._sync();
  }

  _sync() {
    this._button.disabled = this.hasAttribute('disabled');
    if (this.hasAttribute('aria-pressed')) {
      this._button.setAttribute('aria-pressed', this.getAttribute('aria-pressed'));
    } else {
      this._button.removeAttribute('aria-pressed');
    }
    if (this.hasAttribute('aria-label')) {
      this._button.setAttribute('aria-label', this.getAttribute('aria-label'));
    } else {
      this._button.removeAttribute('aria-label');
    }
    if (this.hasAttribute('disabled') && this.hasAttribute('title-when-disabled')) {
      this._button.title = this.getAttribute('title-when-disabled');
    }
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  set disabled(value) {
    this.toggleAttribute('disabled', !!value);
  }

  focus(options) {
    this._button.focus(options);
  }
}

customElements.define('md3-button', Md3Button);
