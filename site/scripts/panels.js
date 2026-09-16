/**
 * Renders the Overview, Features, Download and About tab panels. Settings has its
 * own module (settings-panel.js) because it owns mutable state; Documentation has
 * its own module (docs.js) because it owns the offline bundle. These four are close
 * to pure presentation of static data (site/data/features.json, the inline release
 * JSON, and the strings table), re-run in full on every language change.
 */

import { mountSearch } from './search.js';

/**
 * @param {{en: string, yue: string}} pair
 * @param {import('./i18n-core.mjs').LanguageMode} mode
 * @returns {string|{primary: string, secondary: string}}
 */
function pick(pair, mode) {
  if (mode === 'bilingual') return { primary: pair.en, secondary: pair.yue || pair.en };
  if (mode === 'yue') return pair.yue || pair.en;
  return pair.en;
}

/**
 * @param {HTMLElement} el
 * @param {string|{primary: string, secondary: string}} resolved
 */
function fillBilingual(el, resolved) {
  el.textContent = '';
  if (typeof resolved === 'string') {
    el.textContent = resolved;
    return;
  }
  el.append(document.createTextNode(resolved.primary));
  if (resolved.secondary && resolved.secondary !== resolved.primary) {
    const secondary = document.createElement('span');
    secondary.className = 'lang-line--secondary';
    secondary.lang = 'yue-Hant-HK';
    secondary.textContent = resolved.secondary;
    el.appendChild(secondary);
  }
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.panelEl
 * @param {(key: string) => string} opts.t
 * @param {(key: string) => DocumentFragment} opts.tNode
 * @param {() => void} opts.goToFeatures
 * @param {() => void} opts.goToDownload
 */
export function renderOverviewPanel({ panelEl, t, tNode, goToFeatures, goToDownload }) {
  panelEl.innerHTML = '';
  const title = document.createElement('h1');
  title.appendChild(tNode('overview.title'));
  const subtitle = document.createElement('p');
  subtitle.appendChild(tNode('overview.subtitle'));
  const body1 = document.createElement('p');
  body1.appendChild(tNode('overview.body1'));
  const body2 = document.createElement('p');
  body2.appendChild(tNode('overview.body2'));

  const statusCard = document.createElement('div');
  statusCard.className = 'md-card';
  const statusTitle = document.createElement('h3');
  statusTitle.appendChild(tNode('overview.status.title'));
  const statusBody = document.createElement('p');
  statusBody.appendChild(tNode('overview.status.body'));
  statusCard.append(statusTitle, statusBody);

  const actions = document.createElement('div');
  actions.className = 'row';
  const exploreBtn = document.createElement('button');
  exploreBtn.type = 'button';
  exploreBtn.className = 'md-btn';
  exploreBtn.dataset.variant = 'filled';
  exploreBtn.textContent = t('overview.cta.explore');
  exploreBtn.addEventListener('click', goToFeatures);
  const downloadBtn = document.createElement('button');
  downloadBtn.type = 'button';
  downloadBtn.className = 'md-btn';
  downloadBtn.dataset.variant = 'outlined';
  downloadBtn.textContent = t('overview.cta.download');
  downloadBtn.addEventListener('click', goToDownload);
  actions.append(exploreBtn, downloadBtn);

  panelEl.append(title, subtitle, body1, body2, statusCard, actions);
}

const STATUS_ORDER = ['in-progress', 'planned', 'shipped'];

/**
 * @param {object} opts
 * @param {HTMLElement} opts.panelEl
 * @param {Array<object>} opts.features
 * @param {(key: string) => string} opts.t
 * @param {import('./i18n-core.mjs').LanguageMode} opts.language
 * @param {(id: string) => void} opts.openDocsArticle
 */
export function renderFeaturesPanel({ panelEl, features, t, language, openDocsArticle }) {
  panelEl.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'panel-head';
  const h1 = document.createElement('h1');
  h1.textContent = t('features.title');
  head.appendChild(h1);
  const subtitle = document.createElement('p');
  subtitle.textContent = t('features.subtitle');

  const searchMount = document.createElement('div');
  searchMount.id = 'features-search';

  const empty = document.createElement('p');
  empty.textContent = t('features.empty');
  empty.hidden = true;

  const grid = document.createElement('div');
  grid.className = 'card-grid';

  const byCategory = new Map();
  for (const feature of features) {
    if (!byCategory.has(feature.category)) byCategory.set(feature.category, []);
    byCategory.get(feature.category).push(feature);
  }

  for (const [category, items] of byCategory) {
    const heading = document.createElement('h2');
    heading.textContent = category;
    heading.style.gridColumn = '1 / -1';
    grid.appendChild(heading);

    for (const feature of items.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))) {
      const card = document.createElement('article');
      card.className = 'md-card';
      card.dataset.featureId = feature.id;

      const titleEl = document.createElement('h3');
      fillBilingual(titleEl, pick(feature.title, language));

      const chip = document.createElement('span');
      chip.className = 'status-chip';
      chip.dataset.status = feature.status;
      chip.textContent = t(`features.status.${feature.status}`);

      const summaryEl = document.createElement('p');
      fillBilingual(summaryEl, pick(feature.summary, language));

      card.append(titleEl, chip, summaryEl);

      const searchableText = [feature.title.en, feature.title.yue, feature.summary.en, feature.summary.yue, feature.category]
        .filter(Boolean)
        .join(' ');
      card.dataset.searchText = searchableText;

      if (feature.docsArticle) {
        const link = document.createElement('button');
        link.type = 'button';
        link.className = 'md-btn';
        link.dataset.variant = 'outlined';
        link.textContent = t('features.readMore');
        link.addEventListener('click', () => openDocsArticle(feature.docsArticle));
        card.appendChild(link);
      }

      grid.appendChild(card);
    }
  }

  panelEl.append(head, subtitle, searchMount, empty, grid);

  mountSearch({
    mountEl: searchMount,
    instanceId: 'features',
    t,
    getItems: () => Array.from(grid.querySelectorAll('[data-feature-id]')),
    itemText: (item) => /** @type {HTMLElement} */ (item).dataset.searchText || '',
    applyMatch: (item, match) => {
      /** @type {HTMLElement} */ (item).hidden = !match;
    },
  });

  const observer = () => {
    const anyVisible = Array.from(grid.querySelectorAll('[data-feature-id]')).some(
      (item) => !/** @type {HTMLElement} */ (item).hidden
    );
    empty.hidden = anyVisible;
  };
  grid.addEventListener('input', observer);
  const searchInput = searchMount.querySelector('input[type="search"]');
  searchInput?.addEventListener('input', observer);
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.panelEl
 * @param {{published: boolean, tag?: string, assetUrl?: string, assetName?: string, publishedAt?: string, checksum?: string}} opts.release
 * @param {(key: string) => string} opts.t
 * @param {(key: string) => DocumentFragment} opts.tNode
 */
export function renderDownloadPanel({ panelEl, release, t, tNode }) {
  panelEl.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'panel-head';
  const h1 = document.createElement('h1');
  h1.textContent = t('download.title');
  head.appendChild(h1);
  const subtitle = document.createElement('p');
  subtitle.appendChild(tNode('download.subtitle'));

  const searchMount = document.createElement('div');
  searchMount.id = 'download-search';

  const card = document.createElement('div');
  card.className = 'stack';
  card.dataset.searchText = `${t('download.title')} ${t('download.none.title')} ${t('download.none.body')}`;

  const emptyState = document.createElement('div');
  emptyState.className = 'install-honest-state';
  emptyState.dataset.contract = 'install-empty-state';
  emptyState.hidden = release.published;
  const emptyTitle = document.createElement('strong');
  emptyTitle.textContent = t('download.none.title');
  const emptyBody = document.createElement('span');
  emptyBody.textContent = t('download.none.body');
  emptyState.append(emptyTitle, document.createElement('br'), emptyBody);

  const downloadLink = /** @type {HTMLAnchorElement} */ (document.createElement('a'));
  downloadLink.id = 'download-button';
  downloadLink.className = 'md-btn';
  downloadLink.dataset.variant = 'filled';
  downloadLink.hidden = !release.published;
  if (release.published && release.assetUrl) {
    downloadLink.href = release.assetUrl;
    downloadLink.textContent = t('download.button');
    downloadLink.setAttribute('rel', 'noopener');
  }

  const meta = document.createElement('dl');
  meta.hidden = !release.published;
  if (release.published) {
    const rows = [
      [t('download.version.label'), release.tag],
      [t('download.published.label'), release.publishedAt],
    ];
    for (const [label, value] of rows) {
      if (!value) continue;
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      meta.append(dt, dd);
    }
  }

  const notice = document.createElement('p');
  notice.className = 'support-text';
  notice.appendChild(tNode('download.unsigned.notice'));

  card.append(emptyState, downloadLink, meta, notice);
  panelEl.append(head, subtitle, searchMount, card);

  mountSearch({
    mountEl: searchMount,
    instanceId: 'download',
    t,
    getItems: () => [card],
    itemText: (item) => /** @type {HTMLElement} */ (item).dataset.searchText || '',
    applyMatch: (item, match) => {
      /** @type {HTMLElement} */ (item).style.opacity = match ? '1' : '0.35';
    },
  });
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.panelEl
 * @param {(key: string) => string} opts.t
 * @param {(key: string) => DocumentFragment} opts.tNode
 */
export function renderAboutPanel({ panelEl, t, tNode }) {
  panelEl.innerHTML = '';
  const h1 = document.createElement('h1');
  h1.textContent = t('about.title');
  const subtitle = document.createElement('p');
  subtitle.appendChild(tNode('about.subtitle'));

  const searchMount = document.createElement('div');
  searchMount.id = 'about-search';

  const body = document.createElement('p');
  body.dataset.searchText = t('about.body');
  body.appendChild(tNode('about.body'));

  const licenceCard = document.createElement('div');
  licenceCard.className = 'md-card';
  licenceCard.dataset.searchText = `${t('about.licence.title')} ${t('about.licence.body')}`;
  const licenceTitle = document.createElement('h3');
  licenceTitle.appendChild(tNode('about.licence.title'));
  const licenceBody = document.createElement('p');
  licenceBody.appendChild(tNode('about.licence.body'));
  licenceCard.append(licenceTitle, licenceBody);

  panelEl.append(h1, subtitle, searchMount, body, licenceCard);

  mountSearch({
    mountEl: searchMount,
    instanceId: 'about',
    t,
    getItems: () => [body, licenceCard],
    itemText: (item) => /** @type {HTMLElement} */ (item).dataset.searchText || '',
    applyMatch: (item, match) => {
      /** @type {HTMLElement} */ (item).style.opacity = match ? '1' : '0.35';
    },
  });
}
