/**
 * Renders the Settings tab: theme, density, a full-spectrum accent colour picker
 * (three sliders, not a fixed row of swatches), font choice with a CJK-safe
 * fallback, language mode, and the tab strip's dock position. Every control applies
 * immediately and is persisted through site/scripts/store.js.
 */

import { LANGUAGE_MODES } from './i18n-core.mjs';
import { mountSearch } from './search.js';

/**
 * @param {object} opts
 * @param {HTMLElement} opts.panelEl
 * @param {import('./store.js').Prefs} opts.prefs
 * @param {(next: Partial<import('./store.js').Prefs>) => void} opts.onChange
 * @param {(key: string) => string} opts.t
 * @param {() => void} opts.notifySaved
 */
export function renderSettingsPanel({ panelEl, prefs, onChange, t, notifySaved }) {
  panelEl.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'panel-head';
  const h1 = document.createElement('h1');
  h1.textContent = t('settings.title');
  const subtitle = document.createElement('p');
  subtitle.textContent = t('settings.subtitle');
  head.append(h1);
  panelEl.append(head, subtitle);

  const searchMount = document.createElement('div');
  searchMount.id = 'settings-search';
  panelEl.appendChild(searchMount);

  const grid = document.createElement('div');
  grid.className = 'card-grid';
  panelEl.appendChild(grid);

  function section(titleKey, buildBody) {
    const card = document.createElement('div');
    card.className = 'md-card';
    card.dataset.searchText = t(titleKey);
    const h3 = document.createElement('h3');
    h3.textContent = t(titleKey);
    card.appendChild(h3);
    buildBody(card);
    grid.appendChild(card);
    return card;
  }

  function choiceGroup(options, currentValue, onPick) {
    const wrap = document.createElement('div');
    wrap.className = 'choice-group';
    wrap.setAttribute('role', 'radiogroup');
    for (const opt of options) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'choice-chip';
      chip.setAttribute('role', 'radio');
      chip.setAttribute('aria-checked', String(opt.value === currentValue));
      chip.setAttribute('aria-pressed', String(opt.value === currentValue));
      chip.textContent = opt.label;
      chip.addEventListener('click', () => onPick(opt.value));
      wrap.appendChild(chip);
    }
    return wrap;
  }

  // Theme
  section('settings.theme.label', (card) => {
    card.appendChild(
      choiceGroup(
        [
          { value: 'light', label: t('settings.theme.light') },
          { value: 'dark', label: t('settings.theme.dark') },
          { value: 'system', label: t('settings.theme.system') },
        ],
        prefs.theme,
        (value) => onChange({ theme: value })
      )
    );
  });

  // Density
  section('settings.density.label', (card) => {
    card.appendChild(
      choiceGroup(
        [
          { value: 'comfortable', label: t('settings.density.comfortable') },
          { value: 'compact', label: t('settings.density.compact') },
          { value: 'spacious', label: t('settings.density.spacious') },
        ],
        prefs.density,
        (value) => onChange({ density: value })
      )
    );
  });

  // Accent: full HSL spectrum, three sliders, never a fixed swatch row.
  section('settings.accent.label', (card) => {
    const makeSlider = (id, labelKey, min, max, value, onInput) => {
      const field = document.createElement('div');
      field.className = 'md-field';
      const label = document.createElement('label');
      label.htmlFor = id;
      label.textContent = t(labelKey);
      const input = document.createElement('input');
      input.type = 'range';
      input.className = 'md-slider';
      input.id = id;
      input.min = String(min);
      input.max = String(max);
      input.value = String(value);
      input.addEventListener('input', () => onInput(Number(input.value)));
      field.append(label, input);
      return field;
    };
    const swatch = document.createElement('div');
    swatch.setAttribute('aria-hidden', 'true');
    swatch.style.height = '32px';
    swatch.style.borderRadius = 'var(--shape-sm)';
    swatch.style.background = `hsl(${prefs.accentH} ${prefs.accentS}% ${prefs.accentL}%)`;
    swatch.id = 'accent-preview';

    card.append(
      makeSlider('accent-hue', 'settings.accent.hue', 0, 360, prefs.accentH, (v) => {
        onChange({ accentH: v });
        swatch.style.background = `hsl(${v} ${prefs.accentS}% ${prefs.accentL}%)`;
      }),
      makeSlider('accent-sat', 'settings.accent.sat', 0, 100, prefs.accentS, (v) => {
        onChange({ accentS: v });
        swatch.style.background = `hsl(${prefs.accentH} ${v}% ${prefs.accentL}%)`;
      }),
      makeSlider('accent-light', 'settings.accent.light', 10, 90, prefs.accentL, (v) => {
        onChange({ accentL: v });
        swatch.style.background = `hsl(${prefs.accentH} ${prefs.accentS}% ${v}%)`;
      }),
      swatch
    );
  });

  // Font
  section('settings.font.label', (card) => {
    card.appendChild(
      choiceGroup(
        [
          { value: 'latin', label: t('settings.font.latin') },
          { value: 'cjk', label: t('settings.font.cjk') },
        ],
        prefs.font,
        (value) => onChange({ font: value })
      )
    );
  });

  // Language
  section('settings.language.label', (card) => {
    card.appendChild(
      choiceGroup(
        LANGUAGE_MODES.map((mode) => ({ value: mode, label: t(`settings.language.${mode}`) })),
        prefs.language,
        (value) => onChange({ language: value })
      )
    );
  });

  // Tab dock
  section('settings.tabdock.label', (card) => {
    card.appendChild(
      choiceGroup(
        [
          { value: 'top', label: t('settings.tabdock.top') },
          { value: 'start', label: t('settings.tabdock.start') },
        ],
        prefs.tabDock,
        (value) => onChange({ tabDock: value })
      )
    );
  });

  const resetRow = document.createElement('div');
  resetRow.className = 'row';
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'md-btn';
  resetBtn.dataset.variant = 'outlined';
  resetBtn.textContent = t('settings.reset');
  resetBtn.addEventListener('click', () => {
    onChange({
      theme: 'system',
      density: 'comfortable',
      accentH: 168,
      accentS: 62,
      accentL: 38,
      font: 'latin',
      tabDock: 'top',
    });
    notifySaved();
  });
  resetRow.appendChild(resetBtn);
  panelEl.appendChild(resetRow);

  mountSearch({
    mountEl: searchMount,
    instanceId: 'settings',
    t,
    getItems: () => Array.from(grid.querySelectorAll('.md-card')),
    itemText: (item) => /** @type {HTMLElement} */ (item).dataset.searchText || '',
    applyMatch: (item, match) => {
      /** @type {HTMLElement} */ (item).hidden = !match;
    },
  });

  return { searchMount, searchableItems: () => Array.from(grid.children) };
}
