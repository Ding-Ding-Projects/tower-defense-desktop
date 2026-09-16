/**
 * Corner-anchored, non-blocking notifications (the M3 snackbar pattern). Nothing in
 * this site uses a modal dialog for a notification; a modal is reserved for a real
 * decision, and there is exactly one of those (none, currently — Settings changes
 * apply immediately and Download never asks a question, it just states a fact).
 */

export class NotificationCenter {
  /**
   * @param {HTMLElement} regionEl   aria-live region the toasts render into
   * @param {(key: string) => string} t
   */
  constructor(regionEl, t) {
    this.regionEl = regionEl;
    this.t = t;
    this.timers = new Map();
  }

  /**
   * @param {string} message
   * @param {{kind?: 'info'|'error', timeoutMs?: number}} [opts]
   */
  notify(message, opts = {}) {
    const { kind = 'info', timeoutMs = 6000 } = opts;
    const el = document.createElement('div');
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    el.id = id;
    el.className = 'snackbar';
    el.dataset.kind = kind;
    el.setAttribute('role', kind === 'error' ? 'alert' : 'status');

    const text = document.createElement('div');
    text.className = 'snackbar__message';
    text.textContent = message;

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'snackbar__close';
    close.setAttribute('aria-label', this.t('notifications.dismiss'));
    close.textContent = '×';
    close.addEventListener('click', () => this.dismiss(id));

    el.append(text, close);
    this.regionEl.appendChild(el);

    if (timeoutMs > 0) {
      const timer = window.setTimeout(() => this.dismiss(id), timeoutMs);
      this.timers.set(id, timer);
      el.addEventListener('mouseenter', () => window.clearTimeout(this.timers.get(id)));
      el.addEventListener('mouseleave', () => {
        this.timers.set(id, window.setTimeout(() => this.dismiss(id), timeoutMs));
      });
    }
    return id;
  }

  /** @param {string} id */
  dismiss(id) {
    const el = document.getElementById(id);
    window.clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    el?.remove();
  }
}
