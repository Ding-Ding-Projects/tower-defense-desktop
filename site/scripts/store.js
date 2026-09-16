/**
 * Persisted appearance and language preferences, applied straight onto <html> as
 * data-attributes and CSS custom properties. One small store rather than scattering
 * localStorage calls through settings.js and app.js, so there is exactly one place
 * that knows the storage key and the default values.
 */

const STORAGE_KEY = 'tds-site:prefs:v1';

/** @typedef {'light'|'dark'|'system'} ThemeMode */
/** @typedef {'comfortable'|'compact'|'spacious'} Density */
/** @typedef {'latin'|'cjk'} FontChoice */
/** @typedef {import('./i18n-core.mjs').LanguageMode} LanguageMode */

/**
 * @typedef {object} Prefs
 * @property {ThemeMode} theme
 * @property {Density} density
 * @property {number} accentH
 * @property {number} accentS
 * @property {number} accentL
 * @property {FontChoice} font
 * @property {LanguageMode} language
 * @property {'top'|'start'} tabDock
 */

/** @type {Prefs} */
export const DEFAULT_PREFS = {
  theme: 'system',
  density: 'comfortable',
  accentH: 168,
  accentS: 62,
  accentL: 38,
  font: 'latin',
  language: 'en',
  tabDock: 'top',
};

/** @returns {Prefs} */
export function loadPrefs() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/** @param {Prefs} prefs */
export function savePrefs(prefs) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Non-fatal: the session still works, it just will not remember next time.
  }
}

/** @param {Prefs} prefs */
export function applyPrefsToDocument(prefs) {
  const root = document.documentElement;
  root.dataset.theme = prefs.theme;
  root.dataset.density = prefs.density;
  root.dataset.language = prefs.language;
  root.style.setProperty('--accent-h', String(prefs.accentH));
  root.style.setProperty('--accent-s', `${prefs.accentS}%`);
  root.style.setProperty('--accent-l', `${prefs.accentL}%`);
  root.style.setProperty(
    '--font-body',
    prefs.font === 'cjk'
      ? 'var(--font-cjk), var(--font-latin)'
      : 'var(--font-latin), var(--font-cjk)'
  );
}
