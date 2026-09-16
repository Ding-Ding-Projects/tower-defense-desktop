/**
 * The frameless custom title bar: app name, drag region, and minimize/maximize/
 * close wired to the narrow preload surface the desktop shell exposes as
 * `window.towerDefence`. Guarded for its absence so the page still runs (with
 * the controls visibly disabled and a reason) in a plain browser during
 * development.
 */
export function createTitleBar(doc = document) {
  const bar = doc.createElement('header');
  bar.className = 'title-bar';
  bar.setAttribute('role', 'banner');

  const title = doc.createElement('span');
  title.className = 'title-bar__title';
  title.textContent = 'Tower Defence Desktop';

  const controls = doc.createElement('div');
  controls.className = 'title-bar__controls';

  // The preload bridge, which is the only way this renderer can touch the real window.
  // It is attached by the desktop shell at run time, so it is not part of the standard
  // Window type and has to be reached through a cast rather than pretended into one.
  const bridge = /** @type {any} */ (typeof window !== 'undefined' ? window : {});
  /** @type {{minimize?: () => void, maximize?: () => void, close?: () => void}|undefined} */
  const api = bridge.towerDefence;

  const minimizeBtn = makeIconButton(doc, 'minimize', 'Minimize window', () => api?.minimize?.());
  const maximizeBtn = makeIconButton(doc, 'maximize', 'Maximize window', () => api?.maximize?.());
  const closeBtn = makeIconButton(doc, 'close', 'Close window', () => api?.close?.());
  closeBtn.setAttribute('tone', 'close');

  controls.append(minimizeBtn, maximizeBtn, closeBtn);
  bar.append(title, controls);

  if (!api) {
    for (const btn of [minimizeBtn, maximizeBtn, closeBtn]) {
      btn.setAttribute('disabled', '');
      btn.setAttribute('title-when-disabled', 'Unavailable outside the desktop shell');
    }
  }

  return bar;
}

/**
 * @param {Document} doc
 * @param {string} icon
 * @param {string} label
 * @param {() => void} onClick
 * @returns {HTMLElement}
 */
function makeIconButton(doc, icon, label, onClick) {
  const btn = doc.createElement('md3-icon-button');
  btn.setAttribute('aria-label', label);
  btn.setAttribute('icon', icon);
  btn.addEventListener('click', onClick);
  return btn;
}
