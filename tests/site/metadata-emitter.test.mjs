import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMetaTags, validateMetadata } from '../../site/scripts/metadata-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_HTML_PATH = path.join(__dirname, '..', '..', 'site', 'index.html');

const validMeta = {
  title: 'Tower Defence Desktop',
  description: 'A deterministic tower defense game for Windows.',
  imageUrl: 'https://ding-ding-projects.github.io/tower-defense-desktop/social-preview.png',
  imageWidth: 1200,
  imageHeight: 630,
  imageAlt: 'Tower Defence Desktop wordmark over a stylised tower-defense lane',
  themeColor: '#1f6b5c',
};

test('buildMetaTags emits every required og/twitter entry in order', () => {
  const tags = buildMetaTags(validMeta);
  const properties = tags.map((t) => t.property);
  assert.deepEqual(properties, [
    'og:title',
    'og:description',
    'og:image',
    'og:image:width',
    'og:image:height',
    'og:image:alt',
    'twitter:card',
  ]);
  const card = tags.find((t) => t.property === 'twitter:card');
  assert.equal(card.content, 'summary_large_image');
});

test('validateMetadata accepts a fully valid metadata object', () => {
  assert.deepEqual(validateMetadata(validMeta), []);
});

test('validateMetadata rejects a relative or http:// image URL', () => {
  assert.notEqual(validateMetadata({ ...validMeta, imageUrl: '/social-preview.png' }).length, 0);
  assert.notEqual(validateMetadata({ ...validMeta, imageUrl: 'http://example.com/social-preview.png' }).length, 0);
});

test('validateMetadata rejects non-integer or non-positive dimensions', () => {
  assert.notEqual(validateMetadata({ ...validMeta, imageWidth: 0 }).length, 0);
  assert.notEqual(validateMetadata({ ...validMeta, imageWidth: 1200.5 }).length, 0);
  assert.notEqual(validateMetadata({ ...validMeta, imageHeight: -630 }).length, 0);
});

test('validateMetadata rejects empty title, description or alt text', () => {
  assert.notEqual(validateMetadata({ ...validMeta, title: '' }).length, 0);
  assert.notEqual(validateMetadata({ ...validMeta, description: '   ' }).length, 0);
  assert.notEqual(validateMetadata({ ...validMeta, imageAlt: '' }).length, 0);
});

test('validateMetadata rejects a non-hex theme colour', () => {
  assert.notEqual(validateMetadata({ ...validMeta, themeColor: 'teal' }).length, 0);
  assert.notEqual(validateMetadata({ ...validMeta, themeColor: '#fff' }).length, 0);
  assert.deepEqual(validateMetadata({ ...validMeta, themeColor: '#1F6B5C' }), []);
});

// --- The real page: extract the actual <head> metadata site/index.html ships and
// run it through the same validator, so this test fails if a future edit breaks
// the social embed contract without anyone touching metadata-core.mjs itself. ---

function extractMetaContent(html, matcher) {
  const re = new RegExp(`<meta\\s+${matcher}\\s+content="([^"]*)"`, 'i');
  const match = re.exec(html);
  return match ? match[1] : '';
}

test('the real site/index.html carries valid, internally consistent social metadata', async () => {
  const html = await readFile(SITE_HTML_PATH, 'utf8');
  const meta = {
    title: extractMetaContent(html, 'property="og:title"'),
    description: extractMetaContent(html, 'property="og:description"'),
    imageUrl: extractMetaContent(html, 'property="og:image"'),
    imageWidth: Number(extractMetaContent(html, 'property="og:image:width"')),
    imageHeight: Number(extractMetaContent(html, 'property="og:image:height"')),
    imageAlt: extractMetaContent(html, 'property="og:image:alt"'),
    themeColor: extractMetaContent(html, 'name="theme-color"'),
  };
  const problems = validateMetadata(meta);
  assert.deepEqual(problems, [], `site/index.html metadata problems: ${problems.join('; ')}`);
});
