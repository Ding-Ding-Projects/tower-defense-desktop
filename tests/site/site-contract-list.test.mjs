import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTRACT } from '../../tools/lib/site-contract-list.mjs';

const EMPTY_CTX = { html: '', js: '', css: '', rootFiles: [], featuresData: null };

test('the contract is a non-trivial, hand-written list', () => {
  assert.ok(CONTRACT.length >= 20, 'expected a genuinely broad contract, not a token handful of checks');
});

test('every contract entry has a unique id', () => {
  const ids = CONTRACT.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate ids in the contract list');
});

test('every contract entry has a non-empty id and description', () => {
  for (const item of CONTRACT) {
    assert.ok(item.id && item.id.trim(), 'an item has an empty id');
    assert.ok(item.description && item.description.trim(), `${item.id} has an empty description`);
  }
});

test('every contract entry has a callable check function', () => {
  for (const item of CONTRACT) {
    assert.equal(typeof item.check, 'function', `${item.id}.check is not a function`);
  }
});

test('every positive-presence contract entry fails against a completely empty site', () => {
  // This is the whole point of a hand-written list: it must name a requirement even
  // when the site has none of it, so a feature that never shipped is a named
  // failure, not silence. A rule-shaped scanner that only matches patterns already
  // present would pass this fixture wrongly; a hand-written list must not.
  //
  // The two "absence" checks are the deliberate exception, not a hole in this
  // guard: "no-content-delivery-network" and "no-analytics-or-tracking" assert
  // that something bad is NOT present, so they are correctly satisfied by a site
  // that has nothing in it at all. They are proven capable of failing instead in
  // the "sample of checks" test below, against a fixture that actually injects a
  // CDN link.
  const ABSENCE_CHECKS = new Set(['no-content-delivery-network', 'no-analytics-or-tracking']);
  const positiveChecks = CONTRACT.filter((item) => !ABSENCE_CHECKS.has(item.id));
  assert.ok(positiveChecks.length >= 20, 'expected most of the contract to be presence checks');

  const wronglyPassing = positiveChecks.filter((item) => {
    try {
      return item.check(EMPTY_CTX) === true;
    } catch {
      return false;
    }
  });
  assert.deepEqual(
    wronglyPassing.map((f) => f.id),
    [],
    'a contract item passed against a completely empty site, which means it is not actually checking for anything'
  );
});

test('a sample of checks can be individually watched failing and then passing', () => {
  const cases = [
    {
      id: 'social-preview-file-exists',
      failing: { ...EMPTY_CTX, rootFiles: [] },
      passing: { ...EMPTY_CTX, rootFiles: ['social-preview.png'] },
    },
    {
      id: 'skip-link-present',
      failing: { ...EMPTY_CTX, html: '<a href="#main-content">Skip</a>' },
      passing: { ...EMPTY_CTX, html: '<a class="skip-link" href="#main-content">Skip</a><main id="main-content"></main>' },
    },
    {
      id: 'touch-target-minimum',
      failing: { ...EMPTY_CTX, css: '--target-min: 40px;' },
      passing: { ...EMPTY_CTX, css: '--target-min: 44px;' },
    },
    {
      id: 'og-image-absolute-https',
      failing: { ...EMPTY_CTX, html: '<meta property="og:image" content="/social-preview.png" />' },
      passing: { ...EMPTY_CTX, html: '<meta property="og:image" content="https://example.com/social-preview.png" />' },
    },
    {
      id: 'no-content-delivery-network',
      failing: { ...EMPTY_CTX, html: '<link href="https://fonts.googleapis.com/css">' },
      passing: { ...EMPTY_CTX, html: '<link href="./styles/tokens.css">' },
    },
    {
      id: 'no-analytics-or-tracking',
      failing: { ...EMPTY_CTX, js: "gtag('config', 'UA-XXXX');" },
      passing: { ...EMPTY_CTX, js: 'console.log("no tracking here");' },
    },
  ];

  for (const { id, failing, passing } of cases) {
    const item = CONTRACT.find((c) => c.id === id);
    assert.ok(item, `no contract item named ${id}`);
    assert.equal(item.check(failing), false, `${id} should fail against its "failing" fixture`);
    assert.equal(item.check(passing), true, `${id} should pass against its "passing" fixture`);
  }
});

test('features-tab-exhaustive-and-honest rejects a roster that claims everything is shipped', () => {
  const item = CONTRACT.find((c) => c.id === 'features-tab-exhaustive-and-honest');
  const allShipped = Array.from({ length: 15 }, (_, i) => ({ id: `f${i}`, status: 'shipped' }));
  const honestMix = [
    ...Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, status: 'shipped' })),
    ...Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, status: 'planned' })),
  ];
  assert.equal(item.check({ ...EMPTY_CTX, featuresData: allShipped }), false);
  assert.equal(item.check({ ...EMPTY_CTX, featuresData: honestMix }), true);
});
