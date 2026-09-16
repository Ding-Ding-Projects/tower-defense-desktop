/**
 * Tab manager: a dockable tab strip with pin, group, reorder and overflow, and its
 * state persisted across reloads. DOM-only (no pure logic split here, because there
 * is nothing about "which tab is 40px wide" that is worth unit-testing without a
 * real layout box) but written so every action is reachable two ways: dragging a tab
 * with a mouse, and the always-present "More tabs" menu, which lists every tab with
 * button controls, for keyboard and touch users and as the answer to "what happened
 * to the tab that stopped fitting" for everyone else.
 */

const STORAGE_KEY = 'tds-site:tabs:v1';

/**
 * @typedef {object} TabDef
 * @property {string} id
 * @property {string} i18nKey
 * @property {string|null} defaultGroup
 */

/**
 * @typedef {object} TabState
 * @property {string[]} order
 * @property {string[]} pinned
 * @property {Record<string, string|null>} groups
 * @property {string} active
 * @property {'top'|'start'} dock
 */

export class TabManager {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.stripEl
   * @param {HTMLElement} opts.overflowMenuEl
   * @param {HTMLElement} opts.overflowTriggerEl
   * @param {HTMLElement} opts.shellEl
   * @param {TabDef[]} opts.tabs
   * @param {(key: string) => string} opts.t   resolves an i18n key to display text
   * @param {(id: string) => void} opts.onActivate
   */
  constructor({ stripEl, overflowMenuEl, overflowTriggerEl, shellEl, tabs, t, onActivate }) {
    this.stripEl = stripEl;
    this.overflowMenuEl = overflowMenuEl;
    this.overflowTriggerEl = overflowTriggerEl;
    this.shellEl = shellEl;
    this.defs = new Map(tabs.map((tab) => [tab.id, tab]));
    this.t = t;
    this.onActivate = onActivate;
    this.state = this.loadState(tabs);
    this._dragId = null;

    this.overflowTriggerEl.addEventListener('click', () => this.toggleOverflowMenu());
    document.addEventListener('click', (event) => {
      if (
        this.overflowMenuEl.dataset.open === 'true' &&
        !this.overflowMenuEl.contains(/** @type {Node} */ (event.target)) &&
        event.target !== this.overflowTriggerEl
      ) {
        this.closeOverflowMenu();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.closeOverflowMenu();
    });

    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => this.render()).observe(this.stripEl);
    } else if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => this.render());
    }
  }

  /**
   * @param {TabDef[]} tabs
   * @returns {TabState}
   */
  loadState(tabs) {
    const defaultState = {
      order: tabs.map((tab) => tab.id),
      pinned: [tabs[0].id],
      groups: Object.fromEntries(tabs.map((tab) => [tab.id, tab.defaultGroup])),
      active: tabs[0].id,
      dock: /** @type {'top'} */ ('top'),
    };
    let saved = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch {
      saved = null;
    }
    if (!saved || !Array.isArray(saved.order)) return defaultState;

    // Reconcile with the current tab set: keep persisted order/pins/groups for tabs
    // that still exist, append any brand-new tab id at the end.
    const knownIds = new Set(tabs.map((tab) => tab.id));
    const order = saved.order.filter((id) => knownIds.has(id));
    for (const id of knownIds) if (!order.includes(id)) order.push(id);

    return {
      order,
      pinned: (saved.pinned || []).filter((id) => knownIds.has(id)),
      groups: { ...defaultState.groups, ...(saved.groups || {}) },
      active: knownIds.has(saved.active) ? saved.active : order[0],
      dock: saved.dock === 'start' ? 'start' : 'top',
    };
  }

  persist() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Storage can be unavailable (private browsing, quota); losing persistence is
      // not fatal, the tab strip still works for the rest of the session.
    }
  }

  /** @param {string} id */
  activate(id) {
    this.state.active = id;
    this.persist();
    this.render();
    this.onActivate(id);
  }

  /** @param {string} id */
  togglePin(id) {
    const pinned = new Set(this.state.pinned);
    if (pinned.has(id)) pinned.delete(id);
    else pinned.add(id);
    this.state.pinned = [...pinned];
    this.persist();
    this.render();
  }

  /**
   * @param {string} id
   * @param {-1|1} direction
   */
  move(id, direction) {
    const order = [...this.state.order];
    const from = order.indexOf(id);
    const to = from + direction;
    if (to < 0 || to >= order.length) return;
    [order[from], order[to]] = [order[to], order[from]];
    this.state.order = order;
    this.persist();
    this.render();
  }

  /**
   * @param {string} id
   * @param {string|null} groupName
   */
  setGroup(id, groupName) {
    this.state.groups = { ...this.state.groups, [id]: groupName || null };
    this.persist();
    this.render();
  }

  /** @param {'top'|'start'} dock */
  setDock(dock) {
    this.state.dock = dock;
    this.shellEl.dataset.tabDock = dock;
    this.persist();
  }

  toggleOverflowMenu() {
    const open = this.overflowMenuEl.dataset.open === 'true';
    this.overflowMenuEl.dataset.open = open ? 'false' : 'true';
    this.overflowTriggerEl.setAttribute('aria-expanded', open ? 'false' : 'true');
    if (!open) this.renderOverflowMenu();
  }

  closeOverflowMenu() {
    this.overflowMenuEl.dataset.open = 'false';
    this.overflowTriggerEl.setAttribute('aria-expanded', 'false');
  }

  render() {
    this.shellEl.dataset.tabDock = this.state.dock;
    this.stripEl.innerHTML = '';

    const visible = this.computeVisible();

    let currentGroup = /** @type {string|null|undefined} */ (undefined);
    let groupWrap = /** @type {HTMLElement|null} */ (null);
    for (const id of visible) {
      const groupName = this.state.groups[id] || null;
      if (groupName !== currentGroup) {
        groupWrap = document.createElement('div');
        groupWrap.className = 'tab-group';
        if (groupName) {
          groupWrap.dataset.grouped = 'true';
          const label = document.createElement('span');
          label.className = 'tab-group__label';
          label.textContent = groupName;
          groupWrap.appendChild(label);
        }
        this.stripEl.appendChild(groupWrap);
        currentGroup = groupName;
      }
      groupWrap?.appendChild(this.renderTabButton(id));
    }

    const hiddenCount = this.state.order.length - visible.length;
    this.overflowTriggerEl.textContent = `${this.t('tabs.more')}${hiddenCount > 0 ? ` (${hiddenCount})` : ''}`;
    this.overflowTriggerEl.setAttribute(
      'aria-label',
      `${this.t('tabs.more')}${hiddenCount > 0 ? `, ${hiddenCount} hidden` : ''}`
    );

    if (this.overflowMenuEl.dataset.open === 'true') this.renderOverflowMenu();
  }

  /** @returns {string[]} ids that fit the current strip width, pinned tabs always included */
  computeVisible() {
    const available = this.stripEl.clientWidth || Infinity;
    const pinnedSet = new Set(this.state.pinned);
    const order = this.state.order;
    if (!available || available === Infinity) return order;

    const estimateWidth = (id) => {
      const def = this.defs.get(id);
      const label = def ? this.t(def.i18nKey) : id;
      return Math.min(220, Math.max(90, label.length * 9 + 56));
    };

    let used = this.overflowTriggerEl.offsetWidth || 96;
    const visible = [];
    for (const id of order) {
      const width = estimateWidth(id);
      if (pinnedSet.has(id) || used + width <= available) {
        visible.push(id);
        used += width;
      }
    }
    // Never hide the active tab: swap it in for the last unpinned visible tab if it
    // would otherwise have been pushed into overflow, so activating something from
    // the menu doesn't make the strip look like it forgot what's open.
    if (!visible.includes(this.state.active) && order.includes(this.state.active)) {
      for (let i = visible.length - 1; i >= 0; i -= 1) {
        if (!pinnedSet.has(visible[i])) {
          visible[i] = this.state.active;
          break;
        }
      }
    }
    return order.filter((id) => visible.includes(id));
  }

  /** @param {string} id @returns {HTMLButtonElement} */
  renderTabButton(id) {
    const def = this.defs.get(id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab';
    btn.id = `tab-${id}`;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', String(this.state.active === id));
    btn.setAttribute('aria-controls', `panel-${id}`);
    btn.tabIndex = this.state.active === id ? 0 : -1;
    btn.draggable = true;
    btn.dataset.tabId = id;
    btn.dataset.pinned = String(this.state.pinned.includes(id));

    const pinMark = document.createElement('span');
    pinMark.className = 'tab__pin-icon';
    pinMark.setAttribute('aria-hidden', 'true');
    pinMark.textContent = this.state.pinned.includes(id) ? '\u{1F4CC}' : '';
    btn.appendChild(pinMark);

    const label = document.createElement('span');
    label.textContent = def ? this.t(def.i18nKey) : id;
    btn.appendChild(label);

    btn.addEventListener('click', () => this.activate(id));
    btn.addEventListener('keydown', (event) => this.handleTabKeydown(event, id));
    btn.addEventListener('dragstart', () => {
      this._dragId = id;
    });
    btn.addEventListener('dragover', (event) => {
      event.preventDefault();
      btn.dataset.dragOver = 'true';
    });
    btn.addEventListener('dragleave', () => {
      btn.dataset.dragOver = 'false';
    });
    btn.addEventListener('drop', (event) => {
      event.preventDefault();
      btn.dataset.dragOver = 'false';
      if (this._dragId && this._dragId !== id) this.reorderByDrop(this._dragId, id);
      this._dragId = null;
    });

    return btn;
  }

  /**
   * @param {KeyboardEvent} event
   * @param {string} id
   */
  handleTabKeydown(event, id) {
    const order = this.computeVisible();
    const index = order.indexOf(id);
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const next = event.key === 'ArrowRight' ? order[(index + 1) % order.length] : order[(index - 1 + order.length) % order.length];
      document.getElementById(`tab-${next}`)?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      document.getElementById(`tab-${order[0]}`)?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      document.getElementById(`tab-${order[order.length - 1]}`)?.focus();
    }
  }

  /**
   * @param {string} draggedId
   * @param {string} targetId
   */
  reorderByDrop(draggedId, targetId) {
    const order = [...this.state.order];
    const from = order.indexOf(draggedId);
    const to = order.indexOf(targetId);
    if (from < 0 || to < 0) return;
    order.splice(from, 1);
    order.splice(to, 0, draggedId);
    this.state.order = order;
    this.persist();
    this.render();
  }

  renderOverflowMenu() {
    this.overflowMenuEl.innerHTML = '';
    const visible = new Set(this.computeVisible());
    for (const id of this.state.order) {
      const def = this.defs.get(id);
      const row = document.createElement('div');
      row.className = 'row';
      row.style.justifyContent = 'space-between';

      const activateBtn = document.createElement('button');
      activateBtn.type = 'button';
      const offStripMark = visible.has(id) ? '' : ' •';
      activateBtn.innerHTML = `<span>${def ? this.t(def.i18nKey) : id}${offStripMark}</span>`;
      activateBtn.addEventListener('click', () => {
        this.activate(id);
        this.closeOverflowMenu();
      });

      const pinBtn = document.createElement('button');
      pinBtn.type = 'button';
      pinBtn.style.flex = 'none';
      pinBtn.style.width = 'auto';
      const pinned = this.state.pinned.includes(id);
      pinBtn.textContent = pinned ? '\u{1F4CC}' : '\u{1F4CD}';
      pinBtn.setAttribute('aria-label', this.t(pinned ? 'tabs.unpin' : 'tabs.pin'));
      pinBtn.addEventListener('click', () => this.togglePin(id));

      const leftBtn = document.createElement('button');
      leftBtn.type = 'button';
      leftBtn.style.flex = 'none';
      leftBtn.style.width = 'auto';
      leftBtn.textContent = '←';
      leftBtn.setAttribute('aria-label', this.t('tabs.moveLeft'));
      leftBtn.addEventListener('click', () => this.move(id, -1));

      const rightBtn = document.createElement('button');
      rightBtn.type = 'button';
      rightBtn.style.flex = 'none';
      rightBtn.style.width = 'auto';
      rightBtn.textContent = '→';
      rightBtn.setAttribute('aria-label', this.t('tabs.moveRight'));
      rightBtn.addEventListener('click', () => this.move(id, 1));

      row.append(activateBtn, pinBtn, leftBtn, rightBtn);
      this.overflowMenuEl.appendChild(row);
    }
  }
}
