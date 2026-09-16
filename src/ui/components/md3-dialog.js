/**
 * A Material Design 3 dialog, wrapping the real `<dialog>` element so modal
 * focus trapping, ESC-to-close, backdrop and top-layer stacking all come from
 * the browser instead of being reimplemented. `open()`/`close()` mirror the
 * native API; a `headline`, `body` (default slot) and `actions` slot cover
 * every wave-state, pause and settings surface this project needs.
 */

const TEMPLATE = document.createElement('template');
TEMPLATE.innerHTML = `
  <style>
    dialog {
      border: none;
      border-radius: 28px;
      padding: 0;
      max-width: min(90vw, 420px);
      width: 100%;
      background: var(--md-sys-color-surface-container-high, #ece6f0);
      color: var(--md-sys-color-on-surface, #1d1b20);
      box-shadow: 0 8px 10px -6px rgba(0,0,0,.2), 0 20px 25px -5px rgba(0,0,0,.3);
    }
    dialog::backdrop { background: rgba(0, 0, 0, 0.4); }
    .content { padding: 24px; display: flex; flex-direction: column; gap: 16px; }
    .headline { font: 400 24px/32px Roboto, system-ui, sans-serif; margin: 0; }
    .body { font: 400 14px/20px Roboto, system-ui, sans-serif; color: var(--md-sys-color-on-surface-variant, #49454f); }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
  </style>
  <dialog part="dialog">
    <div class="content">
      <h2 class="headline"><slot name="headline"></slot></h2>
      <div class="body"><slot></slot></div>
      <div class="actions"><slot name="actions"></slot></div>
    </div>
  </dialog>
`;

export class Md3Dialog extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(TEMPLATE.content.cloneNode(true));
    this._dialog = this.shadowRoot.querySelector('dialog');
    this._dialog.addEventListener('close', () => this.dispatchEvent(new Event('close', { bubbles: true })));
    this._dialog.addEventListener('cancel', (e) => {
      if (this.hasAttribute('no-escape-close')) e.preventDefault();
    });
  }

  open() {
    if (!this._dialog.open) this._dialog.showModal();
  }

  close(returnValue) {
    if (this._dialog.open) this._dialog.close(returnValue);
  }

  get isOpen() {
    return this._dialog.open;
  }
}

customElements.define('md3-dialog', Md3Dialog);
