/**
 * A reusable search field with its own regex construction and testing surface,
 * anchored in a popover beside the field rather than living on a detached page.
 * Mounted once per tab panel (site/scripts/app.js does the mounting), each instance
 * independent so filtering "Features" never touches what "Documentation" shows.
 */

/**
 * @param {object} opts
 * @param {HTMLElement} opts.mountEl        empty container to build the search bar into
 * @param {() => HTMLElement[]} opts.getItems  items to filter, each read fresh (the
 *   list can grow, e.g. once the docs bundle loads)
 * @param {(text: string) => string} opts.itemText  extracts the searchable text from an item
 * @param {(item: HTMLElement, match: boolean) => void} opts.applyMatch
 * @param {(key: string) => string} opts.t
 * @param {string} opts.instanceId          unique id fragment for this mount
 */
export function mountSearch({ mountEl, getItems, itemText, applyMatch, t, instanceId }) {
  mountEl.innerHTML = '';
  mountEl.className = 'search-bar';

  const field = document.createElement('div');
  field.className = 'md-field';
  const label = document.createElement('label');
  label.htmlFor = `search-input-${instanceId}`;
  label.className = 'visually-hidden';
  const input = document.createElement('input');
  input.type = 'search';
  input.id = `search-input-${instanceId}`;
  input.setAttribute('data-contract', 'search-bar-input');
  field.append(label, input);

  const regexToggle = document.createElement('button');
  regexToggle.type = 'button';
  regexToggle.className = 'md-btn';
  regexToggle.dataset.variant = 'outlined';
  regexToggle.setAttribute('aria-pressed', 'false');
  regexToggle.setAttribute('data-contract', 'search-regex-toggle');

  const popover = document.createElement('div');
  popover.className = 'regex-popover';
  popover.id = `regex-popover-${instanceId}`;
  popover.setAttribute('role', 'group');
  regexToggle.setAttribute('aria-controls', popover.id);

  const testField = document.createElement('div');
  testField.className = 'md-field';
  const testLabel = document.createElement('label');
  testLabel.htmlFor = `regex-test-${instanceId}`;
  const testInput = document.createElement('input');
  testInput.type = 'text';
  testInput.id = `regex-test-${instanceId}`;
  const testOutput = document.createElement('div');
  testOutput.className = 'support-text';
  testOutput.setAttribute('aria-live', 'polite');
  testField.append(testLabel, testInput, testOutput);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'md-btn';
  closeBtn.dataset.variant = 'icon';

  popover.append(testField, closeBtn);
  mountEl.append(field, regexToggle, popover);

  let useRegex = false;
  let popoverOpen = false;

  function setPopoverOpen(open) {
    popoverOpen = open;
    popover.dataset.open = String(open);
    if (open) testInput.focus();
  }

  function currentPattern() {
    return input.value;
  }

  /** @returns {{test: (text: string) => boolean, error: string|null}} */
  function buildMatcher() {
    const pattern = currentPattern();
    if (!pattern) return { test: () => true, error: null };
    if (!useRegex) {
      const needle = pattern.toLowerCase();
      return { test: (text) => text.toLowerCase().includes(needle), error: null };
    }
    try {
      const re = new RegExp(pattern, 'i');
      return { test: (text) => re.test(text), error: null };
    } catch {
      return { test: () => true, error: t('search.regex.invalid') };
    }
  }

  function applyFilter() {
    const matcher = buildMatcher();
    for (const item of getItems()) {
      applyMatch(item, matcher.test(itemText(item)));
    }
    updateRegexTest(matcher);
  }

  /** @param {{test: (text: string) => boolean, error: string|null}} matcher */
  function updateRegexTest(matcher) {
    if (matcher.error) {
      testOutput.textContent = matcher.error;
      testOutput.dataset.error = 'true';
      return;
    }
    testOutput.dataset.error = 'false';
    if (!useRegex || !currentPattern()) {
      testOutput.textContent = '';
      return;
    }
    const sample = testInput.value;
    const count = sample ? (sample.match(new RegExp(currentPattern(), 'gi')) || []).length : 0;
    testOutput.textContent = sample ? t('search.regex.matches').replace('{count}', String(count)) : '';
  }

  input.addEventListener('input', applyFilter);
  testInput.addEventListener('input', () => updateRegexTest(buildMatcher()));
  regexToggle.addEventListener('click', () => {
    useRegex = !useRegex;
    regexToggle.setAttribute('aria-pressed', String(useRegex));
    setPopoverOpen(useRegex);
    applyFilter();
  });
  closeBtn.addEventListener('click', () => {
    useRegex = false;
    regexToggle.setAttribute('aria-pressed', 'false');
    setPopoverOpen(false);
    applyFilter();
  });

  /** Re-applies translated copy; called by i18n.js on a language change. */
  function retranslate() {
    label.textContent = t('features.search.placeholder');
    input.placeholder = t('features.search.placeholder');
    regexToggle.textContent = t('search.regex.toggle');
    testLabel.textContent = t('search.regex.test.label');
    testInput.placeholder = t('search.regex.test.placeholder');
    closeBtn.textContent = t('common.close');
    closeBtn.setAttribute('aria-label', t('common.close'));
    if (popoverOpen || useRegex) updateRegexTest(buildMatcher());
  }
  retranslate();

  return { applyFilter, retranslate, setPlaceholder: (text) => { input.placeholder = text; label.textContent = text; } };
}
