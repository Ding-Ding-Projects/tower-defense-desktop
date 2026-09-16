/**
 * Pure logic for turning docs/features/*.md into the offline documentation bundle
 * the desktop app and the site's Documentation tab both read (site/docs-bundle.json).
 * No filesystem access happens in this module on purpose, so tests can hand it
 * in-memory fixtures and tools/check-docs-bundle.mjs can be the only thing that
 * actually touches disk.
 */

/**
 * @typedef {object} DocFile
 * @property {string} filename   e.g. "towers-and-upgrades.md"
 * @property {string} content    raw markdown
 */

/**
 * @typedef {object} SuggestedLink
 * @property {string} text
 * @property {string} href
 */

/**
 * @typedef {object} DocArticle
 * @property {string} id          filename without ".md"
 * @property {string} title       the article's H1, with the leading "# " stripped
 * @property {string} summary     first prose paragraph after the title
 * @property {string} body        the full markdown source
 * @property {SuggestedLink[]} suggested
 */

/**
 * @typedef {object} DocsBundle
 * @property {DocArticle[]} articles
 */

const H1 = /^#\s+(.+?)\s*$/;
const H2 = /^##\s+(.+?)\s*$/;
const SUGGESTED_HEADING = /^suggested (articles|reading|next articles)$/i;
const MD_LINK = /\[([^\]]+)\]\(([^)]+)\)/;

/**
 * @param {string} filename
 * @returns {string}
 */
export function idFromFilename(filename) {
  return filename.replace(/\.md$/i, '');
}

/**
 * @param {DocFile} file
 * @returns {DocArticle}
 */
export function parseArticle(file) {
  const lines = file.content.split(/\r?\n/);

  let title = idFromFilename(file.filename);
  let titleLineIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const match = H1.exec(lines[i]);
    if (match) {
      title = match[1];
      titleLineIndex = i;
      break;
    }
  }

  let summary = '';
  for (let i = titleLineIndex + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    if (H2.test(line) || H1.test(line)) break;
    summary = line;
    break;
  }

  /** @type {SuggestedLink[]} */
  const suggested = [];
  let inSuggested = false;
  for (const rawLine of lines) {
    const h2 = H2.exec(rawLine);
    if (h2) {
      inSuggested = SUGGESTED_HEADING.test(h2[1]);
      continue;
    }
    if (H1.test(rawLine)) {
      inSuggested = false;
      continue;
    }
    if (!inSuggested) continue;
    const link = MD_LINK.exec(rawLine);
    if (link) suggested.push({ text: link[1], href: link[2] });
  }

  return {
    id: idFromFilename(file.filename),
    title,
    summary,
    body: file.content,
    suggested,
  };
}

/**
 * Order articles by an explicit hand-written reading order, then alphabetically for
 * anything the order list does not name (a forward-compatible article from a sibling
 * lane, for instance) so the bundle never silently drops a file that exists on disk.
 * @param {DocArticle[]} articles
 * @param {string[]} order   article ids, earliest-read first
 * @returns {DocArticle[]}
 */
export function sortArticles(articles, order) {
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...articles].sort((a, b) => {
    const ra = rank.has(a.id) ? /** @type {number} */ (rank.get(a.id)) : order.length;
    const rb = rank.has(b.id) ? /** @type {number} */ (rank.get(b.id)) : order.length;
    if (ra !== rb) return ra - rb;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Build the whole bundle from disk-shaped input. Deterministic: two calls with the
 * same files and order produce byte-identical JSON, which is what lets
 * tools/check-docs-bundle.mjs compare a freshly built bundle against the committed
 * one and fail only on real drift, never on a timestamp.
 * @param {DocFile[]} files
 * @param {string[]} order
 * @returns {DocsBundle}
 */
export function buildBundle(files, order) {
  const articles = files.map(parseArticle);
  return { articles: sortArticles(articles, order) };
}

/**
 * Compare a freshly built bundle against the one committed to disk.
 * @param {DocsBundle} fresh
 * @param {DocsBundle|null} committed  null when no bundle file exists yet
 * @returns {{stale: boolean, missingIds: string[], extraIds: string[], changedIds: string[]}}
 */
export function diffBundle(fresh, committed) {
  const freshIds = fresh.articles.map((a) => a.id);
  if (!committed) {
    return { stale: freshIds.length > 0, missingIds: freshIds, extraIds: [], changedIds: [] };
  }

  const freshById = new Map(fresh.articles.map((a) => [a.id, a]));
  const committedById = new Map(committed.articles.map((a) => [a.id, a]));

  const missingIds = freshIds.filter((id) => !committedById.has(id));
  const extraIds = committed.articles.map((a) => a.id).filter((id) => !freshById.has(id));
  const changedIds = freshIds.filter((id) => {
    if (!committedById.has(id)) return false;
    return JSON.stringify(freshById.get(id)) !== JSON.stringify(committedById.get(id));
  });

  const orderChanged = committed.articles.map((a) => a.id).join('|') !== freshIds.join('|');

  return {
    stale: missingIds.length > 0 || extraIds.length > 0 || changedIds.length > 0 || orderChanged,
    missingIds,
    extraIds,
    changedIds,
  };
}
