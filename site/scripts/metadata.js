/**
 * DOM-side metadata behaviour: keeping <meta name="theme-color"> in step with the
 * live accent colour and theme, and a startup self-check that the social embed tags
 * already baked into index.html (a crawler runs no scripts, so they have to be
 * static) actually satisfy the same rules metadata-core.mjs enforces in tests.
 */

import { validateMetadata } from './metadata-core.mjs';

/**
 * @param {number} h @param {number} s @param {number} l
 * @returns {string} "#rrggbb"
 */
export function hslToHex(h, s, l) {
  const sat = s / 100;
  const light = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (n) => Math.round(255 * f(n)).toString(16).padStart(2, '0');
  return `#${toHex(0)}${toHex(8)}${toHex(4)}`;
}

/** @param {import('./store.js').Prefs} prefs */
export function syncThemeColor(prefs) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const isDark =
    prefs.theme === 'dark' || (prefs.theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  const lightness = isDark ? Math.max(18, Math.min(30, prefs.accentL)) : prefs.accentL;
  meta.setAttribute('content', hslToHex(prefs.accentH, prefs.accentS, lightness));
}

/** Logs (never throws) if the static social embed tags are internally inconsistent. */
export function selfCheckSocialMetadata() {
  const get = (selector) => document.querySelector(selector)?.getAttribute('content') || '';
  const meta = {
    title: get('meta[property="og:title"]'),
    description: get('meta[property="og:description"]'),
    imageUrl: get('meta[property="og:image"]'),
    imageWidth: Number(get('meta[property="og:image:width"]')),
    imageHeight: Number(get('meta[property="og:image:height"]')),
    imageAlt: get('meta[property="og:image:alt"]'),
    themeColor: get('meta[name="theme-color"]'),
  };
  const problems = validateMetadata(meta);
  if (problems.length) {
    // eslint-disable-next-line no-console
    console.warn('Social embed metadata problems:', problems);
  }
  return problems;
}
