import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArticle, buildBundle, sortArticles, diffBundle, idFromFilename } from '../../tools/lib/docs-bundle.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'docs');

test('idFromFilename strips the .md extension only', () => {
  assert.equal(idFromFilename('towers-and-upgrades.md'), 'towers-and-upgrades');
  assert.equal(idFromFilename('README.MD'), 'README');
});

test('parseArticle extracts title, summary and suggested links', () => {
  const article = parseArticle({
    filename: 'alpha.md',
    content: [
      '# Alpha feature',
      '',
      'This is the summary line.',
      '',
      '## Behaviour',
      '',
      'Body text.',
      '',
      '## Suggested articles',
      '',
      '- [Beta feature](./beta.md)',
      '- [Gamma feature](./gamma.md)',
    ].join('\n'),
  });

  assert.equal(article.id, 'alpha');
  assert.equal(article.title, 'Alpha feature');
  assert.equal(article.summary, 'This is the summary line.');
  assert.deepEqual(article.suggested, [
    { text: 'Beta feature', href: './beta.md' },
    { text: 'Gamma feature', href: './gamma.md' },
  ]);
  assert.match(article.body, /## Behaviour/);
});

test('parseArticle falls back to the filename id when there is no H1', () => {
  const article = parseArticle({ filename: 'no-title.md', content: 'just a paragraph, no heading' });
  assert.equal(article.title, 'no-title');
  assert.equal(article.summary, 'just a paragraph, no heading');
});

test('parseArticle only collects links under a heading that means "suggested"', () => {
  const article = parseArticle({
    filename: 'x.md',
    content: ['# X', '', '## Behaviour', '', '[Not suggested](./y.md)', '', '## Suggested reading', '', '- [Y](./y.md)'].join('\n'),
  });
  assert.deepEqual(article.suggested, [{ text: 'Y', href: './y.md' }]);
});

test('sortArticles honours the explicit order and appends unknown ids alphabetically', () => {
  const articles = [{ id: 'c' }, { id: 'a' }, { id: 'b' }, { id: 'z' }];
  const sorted = sortArticles(articles, ['b', 'a']);
  assert.deepEqual(sorted.map((a) => a.id), ['b', 'a', 'c', 'z']);
});

test('buildBundle is deterministic for the same input', () => {
  const files = [
    { filename: 'alpha.md', content: '# Alpha\n\nSummary.\n\n## Suggested articles\n\n- [Beta](./beta.md)' },
    { filename: 'beta.md', content: '# Beta\n\nSummary.\n\n## Suggested articles\n\n- [Alpha](./alpha.md)' },
  ];
  const first = buildBundle(files, ['alpha', 'beta']);
  const second = buildBundle(files, ['alpha', 'beta']);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test('diffBundle reports nothing stale when fresh matches committed', () => {
  const files = [{ filename: 'alpha.md', content: '# Alpha\n\nSummary.\n\n## Suggested articles\n\n- [Beta](./beta.md)' }];
  const fresh = buildBundle(files, ['alpha']);
  const diff = diffBundle(fresh, fresh);
  assert.equal(diff.stale, false);
  assert.deepEqual(diff.missingIds, []);
  assert.deepEqual(diff.extraIds, []);
  assert.deepEqual(diff.changedIds, []);
});

test('diffBundle flags a missing bundle file as stale (when anything exists to bundle)', () => {
  const files = [{ filename: 'alpha.md', content: '# Alpha\n\nSummary.' }];
  const fresh = buildBundle(files, ['alpha']);
  const diff = diffBundle(fresh, null);
  assert.equal(diff.stale, true);
  assert.deepEqual(diff.missingIds, ['alpha']);
});

test('diffBundle detects a changed article', () => {
  const before = buildBundle([{ filename: 'alpha.md', content: '# Alpha\n\nOld summary.' }], ['alpha']);
  const after = buildBundle([{ filename: 'alpha.md', content: '# Alpha\n\nNew summary.' }], ['alpha']);
  const diff = diffBundle(after, before);
  assert.equal(diff.stale, true);
  assert.deepEqual(diff.changedIds, ['alpha']);
});

test('diffBundle detects an article removed from disk', () => {
  const before = buildBundle(
    [
      { filename: 'alpha.md', content: '# Alpha\n\nSummary.' },
      { filename: 'beta.md', content: '# Beta\n\nSummary.' },
    ],
    ['alpha', 'beta']
  );
  const after = buildBundle([{ filename: 'alpha.md', content: '# Alpha\n\nSummary.' }], ['alpha', 'beta']);
  const diff = diffBundle(after, before);
  assert.equal(diff.stale, true);
  assert.deepEqual(diff.extraIds, ['beta']);
});

test('buildBundle works against real files on disk, not only in-memory fixtures', async () => {
  const names = await readdir(FIXTURES_DIR);
  const files = await Promise.all(
    names.map(async (filename) => ({ filename, content: await readFile(path.join(FIXTURES_DIR, filename), 'utf8') }))
  );
  const bundle = buildBundle(files, ['alpha', 'beta']);
  assert.deepEqual(bundle.articles.map((a) => a.id), ['alpha', 'beta']);
  assert.equal(bundle.articles[0].title, 'Alpha feature');
  assert.equal(bundle.articles[1].suggested[0].text, 'Alpha feature');
});

test('diffBundle detects a reordered bundle as stale even with identical articles', () => {
  const files = [
    { filename: 'alpha.md', content: '# Alpha\n\nSummary.' },
    { filename: 'beta.md', content: '# Beta\n\nSummary.' },
  ];
  const committed = buildBundle(files, ['alpha', 'beta']);
  const fresh = buildBundle(files, ['beta', 'alpha']);
  const diff = diffBundle(fresh, committed);
  assert.equal(diff.stale, true);
});
