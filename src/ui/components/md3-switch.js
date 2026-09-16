/**
 * A Material Design 3 switch, built on a real `<input type="checkbox">` with
 * `role="switch"` so screen readers announce it correctly and Space/click both
 * toggle it for free. The track and thumb are purely visual siblings driven by
 * `:checked`; the checkbox itself is the actual control.
 */

const TEMPLATE = document.createElement('template');
TEMPLATE.innerHTML = `
  <style>
    :host { display: inline-flex; }
    label {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
      font: 400 14px/20px Roboto, system-ui, sans-serif;
      color: var(--md-sys-color-on-surface, #1d1b20);
    }
    input {
      position: absolute;
      opacity: 0;
      width: 52px;
      height: 32px;
      margin: 0;
      cursor: pointer;
    }
    .track {
      position: relative;
      width: 52px;
      height: 32px;
      border-radius: 16px;
      background: var(--md-sys-color-surface-variant, #e7e0ec);
      border: 2px solid var(--md-sys-color-outline, #79747e);
      transition: background-color 150ms ease, border-color 150ms ease;
      flex: none;
    }
    .thumb {
      position: absolute;
      top: 4px;
      left: 4px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--md-sys-color-outline, #79747e);
      transition: transform 150ms ease, width 150ms ease, height 150ms ease, top 150ms ease, left 150ms ease, background-color 150ms ease;
    }
    input:checked + .track {
      background: var(--md-sys-color-primary, #6750a4);
      border-color: var(--md-sys-color-primary, #6750a4);
    }
    input:checked + .track .thumb {
      width: 24px;
      height: 24px;
      top: 2px;
      transform: translateX(20px);
      background: var(--md-sys-color-on-primary, #ffffff);
    }
    input:focus-visible + .track {
      outline: 3px solid var(--md-sys-color-secondary, #625b71);
      outline-offset: 2px;
    }
    input:disabled + .track { opacity: 0.38; cursor: not-allowed; }
    input:disabled { cursor: not-allowed; }
  </style>
  <label>
    <span style="position: relative; display: inline-flex;">
      <input type="checkbox" role="switch" />
      <span class="track" aria-hidden="true"><span class="thumb"></span></span>
    </span>
    <slot></slot>
  </label>
`;

export class Md3Switch extends HTMLElement {
  static get observedAttributes() {
    return ['checked', 'disabled'];
  }

  constructor() {
    super();
    // attachShadow RETURNS the root it just created; reading this.shadowRoot
    // afterwards gets the same object typed as possibly null, which it cannot be on
    // the line below the call that made it. The query results are asserted because
    // the template is a constant in this file: a missing element means the template
    // was edited and this component quietly stopped working.
    const root = this.attachShadow({ mode: 'open' });
    root.appendChild(TEMPLATE.content.cloneNode(true));
    const input = root.querySelector('input');
    if (!input) throw new Error('md3-switch: the shadow template has no input');
    this._input = input;
    this._input.addEventListener('change', () => {
      this.toggleAttribute('checked', this._input.checked);
      this.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  connectedCallback() {
    this._sync();
  }

  attributeChangedCallback() {
    this._sync();
  }

  _sync() {
    this._input.checked = this.hasAttribute('checked');
    this._input.disabled = this.hasAttribute('disabled');
  }

  get checked() {
    return this.hasAttribute('checked');
  }

  set checked(value) {
    this.toggleAttribute('checked', !!value);
  }
}

customElements.define('md3-switch', Md3Switch);
