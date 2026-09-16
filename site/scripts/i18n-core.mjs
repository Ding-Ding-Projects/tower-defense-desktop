/**
 * Pure string-resolution logic for the three language modes: English, playful Hong
 * Kong Cantonese, and bilingual. Kept free of the DOM so it can run under
 * `node --test` without a browser, and so site/scripts/i18n.js (the DOM-wiring half)
 * stays a thin adapter with nothing left to get wrong.
 */

/** @typedef {'en'|'yue'|'bilingual'} LanguageMode */

export const LANGUAGE_MODES = /** @type {const} */ (['en', 'yue', 'bilingual']);

/**
 * Look a key up in a dot-path dictionary, e.g. "nav.overview".
 * @param {Record<string, string>} flatDict
 * @param {string} key
 * @returns {string|undefined}
 */
function lookup(flatDict, key) {
  return Object.prototype.hasOwnProperty.call(flatDict, key) ? flatDict[key] : undefined;
}

/**
 * Resolve one string for a single-language mode ('en' or 'yue'). Cantonese always
 * falls back to English on a missing key rather than surfacing a raw key or an empty
 * string, so a partially translated page never shows a blank control.
 * @param {{en: Record<string,string>, yue: Record<string,string>}} strings
 * @param {string} key
 * @param {'en'|'yue'} mode
 * @returns {string}
 */
export function resolveSingle(strings, key, mode) {
  if (mode === 'yue') {
    const yue = lookup(strings.yue, key);
    if (yue !== undefined) return yue;
  }
  const en = lookup(strings.en, key);
  if (en !== undefined) return en;
  return key;
}

/**
 * Resolve one string for the requested mode. 'bilingual' returns both lines so the
 * caller can render a primary line plus a smaller secondary line, rather than one
 * language silently winning; the two lines are never allowed to be identical filler
 * because that would just be a wider English-only row.
 * @param {{en: Record<string,string>, yue: Record<string,string>}} strings
 * @param {string} key
 * @param {LanguageMode} mode
 * @returns {string|{primary: string, secondary: string}}
 */
export function resolveString(strings, key, mode) {
  if (mode === 'bilingual') {
    return {
      primary: resolveSingle(strings, key, 'en'),
      secondary: resolveSingle(strings, key, 'yue'),
    };
  }
  return resolveSingle(strings, key, mode);
}

/**
 * Fill `{name}` placeholders in a resolved string. Applied after resolution so
 * bilingual mode substitutes into both lines independently.
 * @param {string} template
 * @param {Record<string, string|number>} [params]
 * @returns {string}
 */
export function interpolate(template, params) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole
  );
}

/**
 * Every key present in `en`, and every key present in `yue` that `en` is missing.
 * Used by the site contract check and by tests to prove there is no Cantonese-only
 * key that English silently lacks a fallback for.
 * @param {{en: Record<string,string>, yue: Record<string,string>}} strings
 * @returns {string[]}
 */
export function allKeys(strings) {
  return Array.from(new Set([...Object.keys(strings.en), ...Object.keys(strings.yue)])).sort();
}

/**
 * Keys present in `yue` but absent from `en`. This must always be empty: a Cantonese
 * string with no English counterpart has nothing for 'en' mode or the bilingual
 * primary line to fall back to.
 * @param {{en: Record<string,string>, yue: Record<string,string>}} strings
 * @returns {string[]}
 */
export function orphanYueKeys(strings) {
  return Object.keys(strings.yue).filter((key) => !Object.prototype.hasOwnProperty.call(strings.en, key));
}

/**
 * True when every English key also has a Cantonese translation, i.e. bilingual mode
 * never has to silently duplicate the English line as its own secondary line.
 * @param {{en: Record<string,string>, yue: Record<string,string>}} strings
 * @returns {boolean}
 */
export function isFullyTranslated(strings) {
  return Object.keys(strings.en).every((key) => Object.prototype.hasOwnProperty.call(strings.yue, key));
}
