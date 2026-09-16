/**
 * Pure logic for the social embed metadata: building the tag set and validating it.
 * A crawler runs no scripts, so the actual <meta> tags must already be present in
 * the served HTML; this module is what tools/check-site-contract.mjs and the test
 * suite use to prove the values that got hard-coded into site/index.html are
 * internally consistent (absolute HTTPS image URL, non-empty alt text, sane
 * dimensions) rather than re-deriving the tags from nothing at request time.
 */

/**
 * @typedef {object} SocialMetadata
 * @property {string} title
 * @property {string} description
 * @property {string} imageUrl        absolute, https
 * @property {number} imageWidth
 * @property {number} imageHeight
 * @property {string} imageAlt
 * @property {string} themeColor      "#rrggbb"
 */

/**
 * @param {SocialMetadata} meta
 * @returns {Array<{property: string, content: string}>} og/twitter meta entries, in
 *   the order they should appear in <head>.
 */
export function buildMetaTags(meta) {
  return [
    { property: 'og:title', content: meta.title },
    { property: 'og:description', content: meta.description },
    { property: 'og:image', content: meta.imageUrl },
    { property: 'og:image:width', content: String(meta.imageWidth) },
    { property: 'og:image:height', content: String(meta.imageHeight) },
    { property: 'og:image:alt', content: meta.imageAlt },
    { property: 'twitter:card', content: 'summary_large_image' },
  ];
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Validate a metadata object against every rule the contract requires: an absolute
 * HTTPS image URL (a crawler will not resolve a relative path against an unknown
 * base, and never fetches over plain HTTP for a card), positive integer dimensions,
 * non-empty alt text, and a real hex theme colour.
 * @param {SocialMetadata} meta
 * @returns {string[]} problems found; empty means valid.
 */
export function validateMetadata(meta) {
  /** @type {string[]} */
  const problems = [];

  if (!meta.title || !meta.title.trim()) problems.push('title is empty');
  if (!meta.description || !meta.description.trim()) problems.push('description is empty');

  if (!/^https:\/\//.test(meta.imageUrl || '')) {
    problems.push('imageUrl must be an absolute https:// URL');
  }
  if (!Number.isInteger(meta.imageWidth) || meta.imageWidth <= 0) {
    problems.push('imageWidth must be a positive integer');
  }
  if (!Number.isInteger(meta.imageHeight) || meta.imageHeight <= 0) {
    problems.push('imageHeight must be a positive integer');
  }
  if (!meta.imageAlt || !meta.imageAlt.trim()) {
    problems.push('imageAlt is empty');
  }
  if (!HEX_COLOR.test(meta.themeColor || '')) {
    problems.push('themeColor must be a #rrggbb hex value');
  }

  return problems;
}
