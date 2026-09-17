/**
 * Every data file on disk must actually reach the game.
 *
 * The manifest in loader.js is hand-written on purpose: a static import list is what
 * lets the data load with no bundler and no dynamic path resolution. The cost of that
 * choice is a seam. Generating `towers/gatling-gun.json` and forgetting its two lines
 * in loader.js leaves a tower that exists on disk, validates cleanly, is cited
 * correctly, and is not in the game at all. Nothing throws. The whole suite stays
 * green. The only symptom is a shop that is quietly one tower short, which is
 * indistinguishable from a tower nobody has added yet.
 *
 * So this compares both directions: every file on disk is in the manifest, and every
 * manifest entry came from a file on disk.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RAW } from '../../src/data/loader.js';

const DATA_DIR = fileURLToPath(new URL('../../src/data/', import.meta.url));
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Directory on disk -> the key it is loaded under in the manifest. */
const DIRECTORIES = [
  ['towers', 'towers'],
  ['enemies', 'enemies'],
  ['statuses', 'statuses'],
  ['maps', 'maps'],
  ['difficulties', 'difficulties'],
  ['waves', 'waveTables'],
];

/**
 * A stable identity for one row, whatever kind it is. Tower, enemy, status, map and
 * difficulty rows carry an `id`; a wave table is identified by the pair it belongs to.
 * @param {any} row
 * @returns {string}
 */
function identify(row) {
  if (typeof row?.id === 'string') return row.id;
  if (typeof row?.mapId === 'string' && typeof row?.difficultyId === 'string') {
    return row.mapId + ':' + row.difficultyId;
  }
  throw new Error('cannot identify data row: ' + JSON.stringify(row).slice(0, 120));
}

for (const [directory, manifestKey] of DIRECTORIES) {
  test('every ' + directory + ' file on disk is in the loader manifest, and vice versa', () => {
    const files = readdirSync(join(DATA_DIR, directory)).filter((f) => f.endsWith('.json'));
    const onDisk = new Map();
    for (const file of files) {
      const row = JSON.parse(readFileSync(join(DATA_DIR, directory, file), 'utf8'));
      const id = identify(row);
      assert.ok(!onDisk.has(id), directory + ' has two files claiming the identity ' + id);
      onDisk.set(id, file);
    }

    const loaded = RAW[manifestKey];
    assert.ok(Array.isArray(loaded), 'RAW.' + manifestKey + ' should be an array');
    const inManifest = new Set(loaded.map(identify));
    assert.equal(inManifest.size, loaded.length, 'RAW.' + manifestKey + ' lists the same row twice');

    const missing = [...onDisk.keys()].filter((id) => !inManifest.has(id));
    assert.deepEqual(
      missing,
      [],
      'these ' + directory + ' files exist but are not imported in loader.js, so the game never sees them: ' +
        missing.map((id) => onDisk.get(id)).join(', '),
    );

    const phantom = [...inManifest].filter((id) => !onDisk.has(id));
    assert.deepEqual(
      phantom,
      [],
      'RAW.' + manifestKey + ' carries rows with no file in src/data/' + directory + ': ' + phantom.join(', '),
    );
  });
}

test('the counts written in the roadmap and the docs match what is on disk', () => {
  // Every number in this project that anyone has written in prose has gone stale at some
  // point, usually within the hour. The roadmap said four towers were blocked and listed
  // seven; it said the roster was 20 of roughly 40 when the wiki files 85.
  //
  // Only the counts this project controls are checked. How many towers the wiki has is
  // not one of them: it changes when somebody else edits a page, and a check that turns
  // red for that would be a false alarm about somebody else's work. It carries the date
  // it was read instead, exactly like every data row.
  const shipped = readdirSync(DATA_DIR + 'towers/').length;
  const roadmap = readFileSync(ROOT + 'ROADMAP.md', 'utf8');
  const sources = readFileSync(ROOT + 'docs/data-sources.md', 'utf8');

  const roadmapCount = roadmap.match(/First tranche of towers, each cited \((\d+) of/);
  assert.ok(roadmapCount, 'the roadmap no longer states how many towers ship');
  assert.equal(
    Number(roadmapCount[1]), shipped,
    'the roadmap says ' + roadmapCount[1] + ' towers ship and there are ' + shipped + ' on disk',
  );

  const docsCount = sources.match(/(\w+) towers ship\./);
  assert.ok(docsCount, 'docs/data-sources.md no longer states how many towers ship');
  const WORDS = { twenty: 20, 'twenty-one': 21, 'twenty-two': 22, 'twenty-three': 23 };
  const written = WORDS[docsCount[1].toLowerCase()] ?? Number(docsCount[1]);
  assert.equal(
    written, shipped,
    'the docs say ' + docsCount[1] + ' towers ship and there are ' + shipped + ' on disk',
  );
});

test('a count claimed about the source carries the date it was read', () => {
  // The one number here that is somebody else's to change. It is not checked against the
  // wiki, because that would fail on an edit nobody here made; it is required to say when
  // it was true, which is what every data row already does.
  const sources = readFileSync(ROOT + 'docs/data-sources.md', 'utf8');
  assert.match(
    sources,
    /85 pages under `Category:Towers`, read on \d{4}-\d{2}-\d{2}/,
    'the roster size is claimed about the wiki without saying when it was read',
  );
});
