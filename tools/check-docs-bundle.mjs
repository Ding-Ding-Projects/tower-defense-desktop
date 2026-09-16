#!/usr/bin/env node
/**
 * Regenerates the offline documentation bundle (site/docs-bundle.json) from every
 * docs/features/*.md file and fails when the committed bundle does not match what
 * the source files actually produce — the only way an edited article can go stale
 * is if this check was not run, and this check exists specifically so that mistake
 * is caught here rather than shipped.
 *
 * Usage:
 *   node tools/check-docs-bundle.mjs           # verify; exit 1 if stale or invalid
 *   node tools/check-docs-bundle.mjs --write   # regenerate site/docs-bundle.json
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBundle, diffBundle } from './lib/docs-bundle.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT, 'docs', 'features');
const BUNDLE_PATH = path.join(ROOT, 'site', 'docs-bundle.json');

// Hand-written reading order. Anything on disk that is not named here (a sibling
// lane's article, most obviously docs/features/interface.md) is appended
// alphabetically rather than dropped, so the bundle never silently loses a file
// that genuinely exists.
const ORDER = [
  'simulation-and-replay',
  'data-model',
  'towers-and-upgrades',
  'enemies-and-statuses',
  'maps-and-placement',
  'waves-and-difficulties',
  'economy',
  'interface',
  'accessibility',
  'build-and-release',
  'update-mechanism',
];

async function loadDocFiles() {
  const entries = await readdir(DOCS_DIR, { withFileTypes: true });
  const mdFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.md')).map((e) => e.name);
  const files = [];
  for (const filename of mdFiles) {
    const content = await readFile(path.join(DOCS_DIR, filename), 'utf8');
    files.push({ filename, content });
  }
  return files;
}

/**
 * Content-level completeness rules the JSON shape alone cannot express: every
 * article needs a real title, a real summary, and its required suggested-articles
 * section, because a bundle entry with an empty summary is technically valid JSON
 * and still a broken documentation article.
 * @param {import('./lib/docs-bundle.mjs').DocArticle[]} articles
 * @returns {string[]}
 */
function validateArticleContent(articles) {
  const problems = [];
  for (const article of articles) {
    if (!article.title || article.title === article.id) {
      problems.push(`${article.id}: missing an "# " title heading`);
    }
    if (!article.summary) {
      problems.push(`${article.id}: missing a summary paragraph after the title`);
    }
    if (!article.suggested.length) {
      problems.push(`${article.id}: missing its "## Suggested articles" section, or it has no links`);
    }
  }
  return problems;
}

async function main() {
  const write = process.argv.includes('--write');

  const files = await loadDocFiles();
  const fresh = buildBundle(files, ORDER);

  const contentProblems = validateArticleContent(fresh.articles);
  if (contentProblems.length) {
    console.error('docs bundle: article content problems:');
    for (const problem of contentProblems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    if (!write) return;
  }

  if (write) {
    await writeFile(BUNDLE_PATH, `${JSON.stringify(fresh, null, 2)}\n`, 'utf8');
    console.log(`docs bundle: wrote ${fresh.articles.length} article(s) to ${path.relative(ROOT, BUNDLE_PATH)}`);
    return;
  }

  let committed = null;
  if (existsSync(BUNDLE_PATH)) {
    committed = JSON.parse(await readFile(BUNDLE_PATH, 'utf8'));
  }

  const diff = diffBundle(fresh, committed);
  if (!diff.stale) {
    console.log(`docs bundle: up to date (${fresh.articles.length} article(s))`);
    return;
  }

  console.error('docs bundle: site/docs-bundle.json is stale. Run with --write to regenerate it.');
  if (!committed) console.error('  - no bundle file exists yet');
  if (diff.missingIds.length) console.error(`  - missing from the bundle: ${diff.missingIds.join(', ')}`);
  if (diff.extraIds.length) console.error(`  - in the bundle but no longer on disk: ${diff.extraIds.join(', ')}`);
  if (diff.changedIds.length) console.error(`  - changed since the bundle was generated: ${diff.changedIds.join(', ')}`);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error('docs bundle check failed:', error);
  process.exitCode = 1;
});
