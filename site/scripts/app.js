/**
 * Boots the whole site: loads preferences, wires the tab strip, renders every
 * panel for the active language, and re-renders whenever a preference changes.
 * No bundler, no framework: this file is the composition root that plain <script
 * type="module"> loads directly.
 */

import { strings } from './strings.js';
import { createTranslator } from './i18n.js';
import { DEFAULT_PREFS, loadPrefs, savePrefs, applyPrefsToDocument } from './store.js';
import { TabManager } from './tabs.js';
import { NotificationCenter } from './notifications.js';
import { renderOverviewPanel, renderFeaturesPanel, renderDownloadPanel, renderAboutPanel } from './panels.js';
import { renderSettingsPanel } from './settings-panel.js';
import { createDocsPanel } from './docs.js';
import { syncThemeColor, selfCheckSocialMetadata } from './metadata.js';

const TAB_DEFS = [
  { id: 'overview', i18nKey: 'nav.overview', defaultGroup: 'Product' },
  { id: 'features', i18nKey: 'nav.features', defaultGroup: 'Product' },
  { id: 'download', i18nKey: 'nav.download', defaultGroup: 'Product' },
  { id: 'docs', i18nKey: 'nav.docs', defaultGroup: 'Reference' },
  { id: 'settings', i18nKey: 'nav.settings', defaultGroup: 'Reference' },
  { id: 'about', i18nKey: 'nav.about', defaultGroup: 'Reference' },
];

function readReleaseData() {
  const el = document.getElementById('release-data');
  if (!el) return { published: false };
  try {
    return JSON.parse(el.textContent || '{}');
  } catch {
    return { published: false };
  }
}

async function main() {
  const prefs = loadPrefs();
  applyPrefsToDocument(prefs);

  const { t, tNode } = createTranslator(strings, () => prefs.language);
  const release = readReleaseData();

  const shellEl = /** @type {HTMLElement} */ (document.querySelector('.app-shell'));
  const stripEl = /** @type {HTMLElement} */ (document.getElementById('tab-strip'));
  const overflowMenuEl = /** @type {HTMLElement} */ (document.getElementById('tab-overflow-menu'));
  const overflowTriggerEl = /** @type {HTMLElement} */ (document.getElementById('tab-overflow-trigger'));
  const notificationRegion = /** @type {HTMLElement} */ (document.getElementById('notification-region'));
  const languageSelect = /** @type {HTMLSelectElement} */ (document.getElementById('language-select'));
  const themeToggle = /** @type {HTMLButtonElement} */ (document.getElementById('theme-toggle'));

  const notifications = new NotificationCenter(notificationRegion, t);

  let featuresData = [];
  try {
    const response = await fetch(new URL('../data/features.json', import.meta.url));
    featuresData = await response.json();
  } catch {
    featuresData = [];
  }

  let docsController = null;
  let docsArticlesCache = null;

  function panel(id) {
    return /** @type {HTMLElement} */ (document.getElementById(`panel-${id}`));
  }

  function showActivePanel(id) {
    for (const def of TAB_DEFS) {
      const el = panel(def.id);
      if (el) el.dataset.active = String(def.id === id);
    }
  }

  function openDocsArticle(articleId) {
    tabManager.activate('docs');
    docsController?.open(articleId);
  }

  function renderStaticPanels() {
    renderOverviewPanel({
      panelEl: panel('overview'),
      t,
      tNode,
      goToFeatures: () => tabManager.activate('features'),
      goToDownload: () => tabManager.activate('download'),
    });
    renderFeaturesPanel({
      panelEl: panel('features'),
      features: featuresData,
      t,
      language: prefs.language,
      openDocsArticle,
    });
    renderDownloadPanel({ panelEl: panel('download'), release, t, tNode });
    renderAboutPanel({ panelEl: panel('about'), t, tNode });
    renderSettingsPanel({
      panelEl: panel('settings'),
      prefs,
      t,
      onChange: applyPrefChange,
      notifySaved: () => notifications.notify(t('settings.saved')),
    });

    docsController = createDocsPanel({
      panelEl: panel('docs'),
      t,
      onArticleShown: () => {},
      cachedArticles: docsArticlesCache || undefined,
      initialSelectedId: docsController?.getSelectedId?.() ?? null,
      onLoaded: (articles) => {
        docsArticlesCache = articles;
      },
    });
  }

  const tabManager = new TabManager({
    stripEl,
    overflowMenuEl,
    overflowTriggerEl,
    shellEl,
    tabs: TAB_DEFS,
    t,
    onActivate: showActivePanel,
  });
  tabManager.setDock(prefs.tabDock);
  showActivePanel(tabManager.state.active);

  function syncHeaderControls() {
    languageSelect.value = prefs.language;
    const isDark = prefs.theme === 'dark';
    themeToggle.setAttribute('aria-checked', String(isDark));
    themeToggle.setAttribute('aria-label', t(isDark ? 'settings.theme.light' : 'settings.theme.dark'));
  }

  /** @param {Partial<import('./store.js').Prefs>} partial */
  function applyPrefChange(partial) {
    Object.assign(prefs, partial);
    savePrefs(prefs);
    applyPrefsToDocument(prefs);
    syncThemeColor(prefs);
    if (partial.tabDock) tabManager.setDock(partial.tabDock);

    if (partial.language) {
      renderStaticPanels();
      tabManager.render();
      showActivePanel(tabManager.state.active);
    } else {
      // Only Settings visibly depends on the other preference fields; re-render it
      // alone so a slider drag does not rebuild five unrelated panels per frame.
      renderSettingsPanel({
        panelEl: panel('settings'),
        prefs,
        t,
        onChange: applyPrefChange,
        notifySaved: () => notifications.notify(t('settings.saved')),
      });
    }
    syncHeaderControls();
  }

  renderStaticPanels();
  syncHeaderControls();
  syncThemeColor(prefs);
  selfCheckSocialMetadata();

  languageSelect.addEventListener('change', () => applyPrefChange({ language: /** @type {any} */ (languageSelect.value) }));
  themeToggle.addEventListener('click', () => {
    applyPrefChange({ theme: prefs.theme === 'dark' ? 'light' : 'dark' });
  });

  notifications.notify(t('notifications.welcome'), { timeoutMs: 5000 });
}

main();
