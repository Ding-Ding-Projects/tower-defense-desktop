/**
 * Enemy concealment and flight are read from the page, not defaulted.
 *
 * Both were engine defaults for the entire roster. Every enemy was not hidden and not
 * flying because nobody had said otherwise, rather than because the source had, and the
 * generated rows said so honestly in their own notes -- which made it look like a
 * limitation of the scrape rather than a defect in it.
 *
 * It was a defect in it. The infobox carries `hidden`, `fly`, `ghost` and `lead` fields
 * and the scraper reads all four, but Ghost's Hidden value has a template stylesheet
 * inline in front of it, so stripping tags returned several hundred characters of CSS
 * selectors. The truthiness test saw no leading "yes" and returned false. Every trait on
 * every enemy read false, which is indistinguishable from a roster that has none -- and
 * because the generator took its values from a hand-written list instead, the two were
 * never compared and nothing ever noticed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { infoboxField } from '../../tools/fetch-wiki-enemies.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const cache = JSON.parse(readFileSync(ROOT + 'tools/wiki-cache/enemies.json', 'utf8'));

/** Every shipped enemy row, by id. */
function shippedEnemies() {
  const dir = ROOT + 'src/data/enemies/';
  return readdirSync(dir).map((file) => JSON.parse(readFileSync(dir + file, 'utf8')));
}

test('an inline stylesheet in a value does not become the value', () => {
  // The exact shape of Ghost's Hidden field, reduced to the part that matters.
  const html =
    '<div data-source="hidden">' +
    '<h3 class="pi-data-label">Hidden?</h3>' +
    '<div class="pi-data-value pi-font">' +
    '<style>.mw-parser-output .attr-tag-first{color:#FFF;border:3px solid #2A2A2C}</style>' +
    'Yes' +
    '</div></div>';
  assert.equal(
    infoboxField(html, 'hidden'), 'Yes',
    'the stylesheet came back as the field value, which is how the whole roster read as ' +
      'having no traits at all',
  );
});

test('a field with no embedded stylesheet still reads normally', () => {
  const html =
    '<div data-source="fly"><h3 class="pi-data-label">Fly?</h3>' +
    '<div class="pi-data-value pi-font">No</div></div>';
  assert.equal(infoboxField(html, 'fly'), 'No');
});

test('a field that genuinely is not on the page still reads as absent', () => {
  // Stripping embeds must not turn a missing field into an empty string, which would
  // read as present-and-blank rather than absent.
  const html = '<div data-source="fly"><div class="pi-data-value"><style>a{}</style></div></div>';
  assert.equal(infoboxField(html, 'fly'), null);
  assert.equal(infoboxField(html, 'hidden'), null);
});

test('every shipped enemy took its concealment and flight from the page', () => {
  const byId = new Map(cache.results.map((r) => [r.id, r]));
  for (const enemy of shippedEnemies()) {
    const read = byId.get(enemy.id);
    assert.ok(read, enemy.id + ' is shipped but is not in the scrape cache');
    assert.equal(
      enemy.hidden, read.hidden === true,
      enemy.id + ' ships hidden=' + enemy.hidden + ' and its page says ' + read.hidden,
    );
    assert.equal(
      enemy.flying, read.flying === true,
      enemy.id + ' ships flying=' + enemy.flying + ' and its page says ' + read.flying,
    );
  }
});

test('the rows no longer claim concealment and flight are engine values', () => {
  // The note was true when it was written and is now a false description of where the
  // numbers came from, which is worse than no note.
  for (const enemy of shippedEnemies()) {
    assert.doesNotMatch(
      enemy.source.notes,
      /[Cc]oncealment, flight, leak damage[\s\S]*are engine values/,
      enemy.id + ' still says its concealment and flight are unsourced',
    );
    assert.match(
      enemy.source.notes,
      /concealment and flight read from the infobox/,
      enemy.id + ' does not say where its concealment and flight came from',
    );
  }
});

test('the reader really can tell a hidden enemy from an ordinary one', () => {
  // The check above compares the rows against the cache, and would pass just as well if
  // both were uniformly false. This is the one enemy the source says is hidden, so it is
  // what separates a working reader from one that returns the same answer every time.
  const ghost = shippedEnemies().find((e) => e.id === 'ghost');
  assert.ok(ghost, 'ghost is not shipped');
  assert.equal(ghost.hidden, true, 'the Ghost page says Hidden: Yes');

  const ordinary = shippedEnemies().filter((e) => e.id !== 'ghost');
  assert.ok(
    ordinary.some((e) => e.hidden === false),
    'every enemy reads hidden, so the reader is not reading anything',
  );
});

test('nothing flies, and that is now a reading rather than a default', () => {
  // Worth stating plainly, because it is why no tower's hitsAir flag has ever mattered
  // in a real match. It is not an omission: every one of these ten pages says Fly: No,
  // and the source's own enemy index says why -- the only flying enemies it has are two
  // Flying Duckies from limited-time event modes, not the base game.
  //
  // This turns red the moment one ships, which is the point: the anti-air flag becomes
  // live that day, and the note explaining why it is inert has to come out rather than
  // quietly becoming false.
  for (const read of cache.results) {
    assert.equal(
      read.flying, false,
      read.id + ' flies, so a tower that cannot hit air now has something to miss. ' +
        'Remove the note in docs/data-sources.md saying the anti-air flag is inert.',
    );
  }
  assert.ok(cache.results.length >= 10, 'the cache holds ' + cache.results.length + ' enemies');
});

test('the anti-air flag is real sourced data, not filler', () => {
  // An inert flag is one thing; a flag every tower shares is another, and they look the
  // same from a match nothing flies in. The roster genuinely disagrees about this, and
  // the readings have already been corrected once -- Turret turned out not to hit air
  // and Sniper turned out to.
  const dir = ROOT + 'src/data/towers/';
  const flags = new Set();
  for (const file of readdirSync(dir)) {
    const def = JSON.parse(readFileSync(dir + file, 'utf8'));
    for (const level of def.levels) flags.add(level.hitsAir === true);
  }
  assert.deepEqual(
    [...flags].sort(), [false, true],
    'every shipped tower level agrees about hitsAir, so the field is carrying no information',
  );
});

test('a sourced boss threshold is the page figure, not a rounded guess', () => {
  // Refusing Will: "After its health drops below 75,000 health, the Fallen Swordmaster
  // begins to pant [...] It also starts moving faster." Its infobox says 150,000 health,
  // so the threshold is exactly half. The shipped value was 0.35, somebody's estimate of
  // a number the page states outright, and an estimate is indistinguishable from a
  // reading once it is in the file.
  const swordmaster = shippedEnemies().find((e) => e.id === 'fallen-swordmaster');
  assert.ok(swordmaster, 'fallen-swordmaster is not shipped');
  const phase = swordmaster.abilities.find((a) => a.kind === 'speedPhase');
  assert.ok(phase, 'the Fallen Swordmaster has no speed phase');
  assert.equal(
    phase.hpThreshold * swordmaster.maxHp, 75000,
    'the page says Refusing Will triggers below 75,000 health; this row triggers at ' +
      (phase.hpThreshold * swordmaster.maxHp),
  );
});

test('a row whose abilities are partly sourced says which part', () => {
  // The blanket note said every ability was an engine value. Once one of them is read
  // off the page, that note is a false description of where the numbers came from, in
  // the direction that matters: it understates what is known, so nobody goes looking.
  const partlySourced = shippedEnemies().filter((e) => /Except:/.test(e.source.notes));
  assert.deepEqual(
    partlySourced.map((e) => e.id).sort(),
    ['fallen-king', 'fallen-swordmaster'],
    'the wrong set of enemies claims partly-sourced abilities',
  );
  for (const enemy of partlySourced) {
    assert.match(
      enemy.source.notes, /Except: \S[\s\S]{30,}/,
      enemy.id + ' says its abilities are partly sourced without saying which part',
    );
  }
});
