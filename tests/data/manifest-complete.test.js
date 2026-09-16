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
