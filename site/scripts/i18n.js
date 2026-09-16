/**
 * DOM-facing half of the language system. The actual resolution logic (which string
 * wins for which mode, and the English fallback) lives in i18n-core.mjs and is unit
 * tested there; this file only turns a resolved value into DOM nodes.
 *
 * `t(key)` returns a single string, always the mode-appropriate one for anywhere a
 * plain string is required (an aria-label, a placeholder, a button's text content).
 * `tNode(key)` returns a fragment with a primary line and, in bilingual mode, a
 * smaller secondary line — used for headings and body copy, where showing both
 * languages together is the point, not for compact chrome where a second line would
 * crowd a control that a 320px-wide screen has little room for to begin with.
 */

import { resolveString, interpolate } from './i18n-core.mjs';

/**
 * @param {{en: Record<string,string>, yue: Record<string,string>}} strings
 * @param {() => import('./i18n-core.mjs').LanguageMode} getLanguage
 */
export function createTranslator(strings, getLanguage) {
  /**
   * @param {string} key
   * @param {Record<string, string|number>} [params]
   * @returns {string}
   */
  function t(key, params) {
    const mode = getLanguage();
    const singleMode = mode === 'bilingual' ? 'en' : mode;
    const resolved = resolveString(strings, key, singleMode);
    const text = typeof resolved === 'string' ? resolved : resolved.primary;
    return interpolate(text, params);
  }

  /**
   * @param {string} key
   * @returns {DocumentFragment}
   */
  function tNode(key) {
    const mode = getLanguage();
    const resolved = resolveString(strings, key, mode);
    const frag = document.createDocumentFragment();
    if (typeof resolved === 'string') {
      frag.append(document.createTextNode(resolved));
      return frag;
    }
    frag.append(document.createTextNode(resolved.primary));
    if (resolved.secondary && resolved.secondary !== resolved.primary) {
      const secondary = document.createElement('span');
      secondary.className = 'lang-line--secondary';
      secondary.lang = 'yue-Hant-HK';
      secondary.textContent = resolved.secondary;
      frag.append(secondary);
    }
    return frag;
  }

  return { t, tNode };
}
