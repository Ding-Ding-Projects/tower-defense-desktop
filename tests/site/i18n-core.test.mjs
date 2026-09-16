import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveSingle,
  resolveString,
  interpolate,
  allKeys,
  orphanYueKeys,
  isFullyTranslated,
  LANGUAGE_MODES,
} from '../../site/scripts/i18n-core.mjs';
import { strings } from '../../site/scripts/strings.js';

const fixture = {
  en: { greeting: 'Hello', onlyEnglish: 'English only' },
  yue: { greeting: '喳' },
};

test('LANGUAGE_MODES is exactly the three required modes', () => {
  assert.deepEqual([...LANGUAGE_MODES], ['en', 'yue', 'bilingual']);
});

test('resolveSingle in en mode returns the English string', () => {
  assert.equal(resolveSingle(fixture, 'greeting', 'en'), 'Hello');
});

test('resolveSingle in yue mode prefers Cantonese when present', () => {
  assert.equal(resolveSingle(fixture, 'greeting', 'yue'), '喳');
});

test('resolveSingle in yue mode falls back to English when no Cantonese exists, never blank', () => {
  const result = resolveSingle(fixture, 'onlyEnglish', 'yue');
  assert.equal(result, 'English only');
  assert.notEqual(result, '');
});

test('resolveSingle falls back to the raw key when neither language has it', () => {
  assert.equal(resolveSingle(fixture, 'nonexistent.key', 'en'), 'nonexistent.key');
});

test('resolveString in bilingual mode returns both a primary and a secondary line', () => {
  const result = resolveString(fixture, 'greeting', 'bilingual');
  assert.deepEqual(result, { primary: 'Hello', secondary: '喳' });
});

test('resolveString bilingual secondary never silently empty: falls back to English', () => {
  const result = resolveString(fixture, 'onlyEnglish', 'bilingual');
  assert.deepEqual(result, { primary: 'English only', secondary: 'English only' });
});

test('resolveString in a single-language mode returns a plain string, not an object', () => {
  assert.equal(typeof resolveString(fixture, 'greeting', 'en'), 'string');
  assert.equal(typeof resolveString(fixture, 'greeting', 'yue'), 'string');
});

test('interpolate fills named placeholders and leaves unknown ones untouched', () => {
  assert.equal(interpolate('Hello {name}', { name: 'World' }), 'Hello World');
  assert.equal(interpolate('Hello {missing}', {}), 'Hello {missing}');
  assert.equal(interpolate('No placeholders'), 'No placeholders');
});

test('allKeys is the union of both languages, de-duplicated and sorted', () => {
  assert.deepEqual(allKeys(fixture), ['greeting', 'onlyEnglish'].sort());
});

test('orphanYueKeys finds a Cantonese key with no English counterpart', () => {
  const withOrphan = { en: { a: '1' }, yue: { a: '一', b: '二' } };
  assert.deepEqual(orphanYueKeys(withOrphan), ['b']);
  assert.deepEqual(orphanYueKeys(fixture), []);
});

test('isFullyTranslated is false when an English key has no Cantonese counterpart', () => {
  assert.equal(isFullyTranslated(fixture), false);
  assert.equal(isFullyTranslated({ en: { a: '1' }, yue: { a: '一' } }), true);
});

// --- The real site dictionary, not just a small fixture: this is the guard that
// actually catches a string added to site/scripts/strings.js in English only. ---

test('the real strings table has no Cantonese key without an English counterpart', () => {
  assert.deepEqual(orphanYueKeys(strings), []);
});

test('the real strings table is fully translated: every English key has Cantonese', () => {
  const missing = Object.keys(strings.en).filter((key) => !(key in strings.yue));
  assert.deepEqual(missing, [], `keys missing a Cantonese translation: ${missing.join(', ')}`);
  assert.equal(isFullyTranslated(strings), true);
});

test('the real strings table resolves every key in all three language modes without falling back to the raw key', () => {
  for (const key of Object.keys(strings.en)) {
    for (const mode of LANGUAGE_MODES) {
      const resolved = resolveString(strings, key, mode);
      const text = typeof resolved === 'string' ? resolved : resolved.primary;
      assert.notEqual(text, key, `key "${key}" resolved to itself in mode "${mode}"`);
    }
  }
});
