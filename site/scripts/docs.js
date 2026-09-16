/**
 * The Documentation tab: a list of articles on the left, the selected article's
 * rendered Markdown on the right, each with its own search field. Articles come
 * from site/docs-bundle.json — a same-origin, locally generated file (built by
 * tools/check-docs-bundle.mjs from docs/features/*.md), never a content delivery
 * network or a third-party request.
 */

import { mountSearch } from './search.js';
import { renderMarkdown } from './markdown.js';

/**
 * @param {object} opts
 * @param {HTMLElement} opts.panelEl
 * @param {(key: string) => string} opts.t
 * @param {(id: string) => void} opts.onArticleShown
 * @param {import('../../tools/lib/docs-bundle.mjs').DocArticle[]} [opts.cachedArticles]
 * @param {(articles: import('../../tools/lib/docs-bundle.mjs').DocArticle[]) => void} [opts.onLoaded]
 * @param {string|null} [opts.initialSelectedId]
 */
export function createDocsPanel({ panelEl, t, onArticleShown, cachedArticles, onLoaded, initialSelectedId }) {
  panelEl.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'panel-head';
  const h1 = document.createElement('h1');
  h1.textContent = t('docs.title');
  head.appendChild(h1);
  const subtitle = document.createElement('p');
  subtitle.textContent = t('docs.subtitle');

  const searchMount = document.createElement('div');
  searchMount.id = 'docs-search';

  const layout = document.createElement('div');
  layout.className = 'docs-layout';

  const list = document.createElement('ul');
  list.className = 'docs-list';
  list.setAttribute('aria-label', t('docs.title'));

  const emptyList = document.createElement('p');
  emptyList.textContent = t('docs.empty');
  emptyList.hidden = true;

  const article = document.createElement('div');
  article.className = 'docs-article';
  article.setAttribute('role', 'region');
  article.setAttribute('aria-live', 'polite');

  const prompt = document.createElement('p');
  prompt.textContent = t('docs.selectPrompt');
  article.appendChild(prompt);

  layout.append(list, article);
  panelEl.append(head, subtitle, searchMount, emptyList, layout);

  /** @type {import('../../tools/lib/docs-bundle.mjs').DocArticle[]} */
  let articles = [];
  let selectedId = null;

  function selectArticle(id) {
    selectedId = id;
    const found = articles.find((a) => a.id === id);
    article.innerHTML = '';
    if (!found) {
      article.appendChild(prompt);
      return;
    }
    renderMarkdown(article, found.body);
    if (found.suggested.length) {
      const heading = document.createElement('h2');
      heading.textContent = t('docs.suggested');
      const ul = document.createElement('ul');
      for (const link of found.suggested) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = link.href;
        a.textContent = link.text;
        li.appendChild(a);
        ul.appendChild(li);
      }
      article.append(heading, ul);
    }
    for (const btn of list.querySelectorAll('button')) {
      btn.setAttribute('aria-current', String(btn.dataset.articleId === id));
    }
    onArticleShown(id);
  }

  function renderList() {
    list.innerHTML = '';
    for (const doc of articles) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.articleId = doc.id;
      btn.dataset.searchText = `${doc.title} ${doc.summary}`;
      btn.textContent = doc.title;
      btn.setAttribute('aria-current', String(doc.id === selectedId));
      btn.addEventListener('click', () => selectArticle(doc.id));
      li.appendChild(btn);
      list.appendChild(li);
    }
  }

  mountSearch({
    mountEl: searchMount,
    instanceId: 'docs',
    t,
    getItems: () => Array.from(list.querySelectorAll('button')),
    itemText: (item) => /** @type {HTMLElement} */ (item).dataset.searchText || '',
    applyMatch: (item, match) => {
      const li = /** @type {HTMLElement} */ (item).closest('li');
      if (li) li.hidden = !match;
    },
  });

  async function load() {
    if (cachedArticles) {
      articles = cachedArticles;
      renderList();
      const initial = articles.find((a) => a.id === initialSelectedId) || articles[0];
      if (initial) selectArticle(initial.id);
      return;
    }
    try {
      const response = await fetch(new URL('../docs-bundle.json', import.meta.url));
      if (!response.ok) throw new Error(`docs bundle responded ${response.status}`);
      const bundle = await response.json();
      articles = bundle.articles || [];
      renderList();
      if (articles.length) selectArticle(articles[0].id);
      onLoaded?.(articles);
    } catch (error) {
      emptyList.hidden = false;
      emptyList.textContent = `${t('docs.empty')} (${error instanceof Error ? error.message : String(error)})`;
    }
  }

  load();

  return {
    open: (id) => selectArticle(id),
    getArticles: () => articles,
    getSelectedId: () => selectedId,
  };
}
