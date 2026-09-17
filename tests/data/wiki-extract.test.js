/**
 * The scraper decides every number in the game, so its column reading is checked
 * here against synthetic tables shaped exactly like the real ones — footnote markers,
 * alternate column names and all. Synthetic, because a check that reaches the network
 * fails when the site throttles and tells you nothing about the code either way.
 *
 * The real values below are transcribed from the pages named in each case, and every
 * one of them is cross-checked against that page's own DPS column, which is the only
 * independent arithmetic the source offers.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractLevels, branchingPathCaptions } from '../../tools/fetch-wiki-stats.mjs';

/**
 * @param {string[]} header
 * @param {(string|number)[][]} rows
 * @returns {string}
 */
function table(header, rows) {
  const head = '<tr>' + header.map((h) => '<th>' + h + '</th>').join('') + '</tr>';
  const body = rows
    .map((r) => '<tr>' + r.map((c) => '<td>' + c + '</td>').join('') + '</tr>')
    .join('');
  return '<table>' + head + body + '</table>';
}

test('a splash tower whose damage column is headed "Splash Damage" is read, not skipped', () => {
  // Demoman. The page lists 3.08 damage per second at level 0, and 8 / 2.6 is 3.08.
  const html = table(
    ['Level', 'Cost', 'Total Cost', 'Splash Damage', 'Firerate', 'Range', 'Explosion Range'],
    [[0, 1500, 1500, 8, 2.6, 17, 4.5]],
  );
  const levels = extractLevels(html);
  assert.equal(levels.length, 1);
  assert.equal(levels[0].damage, 8);
  assert.equal(levels[0].shotIntervalSeconds, 2.6);
  assert.equal(levels[0].aoeRadius, 4.5);
  assert.ok(Math.abs(levels[0].damage / levels[0].shotIntervalSeconds - 3.08) < 0.01);
});

test('a melee tower whose rate column is headed "Swingrate" is read', () => {
  const html = table(['Level', 'Cost', 'Damage', 'Swingrate', 'Range'], [[0, 2000, 6, 0.65, 10]]);
  const levels = extractLevels(html);
  assert.equal(levels.length, 1);
  assert.equal(levels[0].shotIntervalSeconds, 0.65);
});

test('a salvo tower\'s projectile count is read, because the page folds it into DPS', () => {
  // Rocketeer level 4. The page lists 84.44 damage per second; 95 over a 4.5 second
  // cycle is 21.11, and it only reaches 84.44 once the four missiles are counted.
  const html = table(
    ['Level', 'Cost', 'Splash Damage', 'Missile Count', 'Firerate', 'Range', 'Explosion Range'],
    [[4, 25000, 95, 4, 4.5, 30, 3]],
  );
  const levels = extractLevels(html);
  assert.equal(levels.length, 1);
  assert.equal(levels[0].burstCount, 4);
  const dps = (levels[0].damage * levels[0].burstCount) / levels[0].shotIntervalSeconds;
  assert.ok(Math.abs(dps - 84.44) < 0.01, 'reproduces the page DPS, got ' + dps);
});

test('a projectile count of one is not recorded as a burst', () => {
  const html = table(
    ['Level', 'Cost', 'Splash Damage', 'Missile Count', 'Firerate', 'Range'],
    [[0, 5000, 30, 1, 3.75, 25]],
  );
  assert.equal(extractLevels(html)[0].burstCount, undefined);
});

test('the plain spelling still wins when a page carries both damage columns', () => {
  // Pyromancer lists "Normal Damage" beside "Burn Damage". The direct hit is the one
  // that belongs in `damage`; the burn is a status with its own duration and tick.
  const html = table(
    ['Level', 'Cost', 'Normal Damage', 'Burn Damage', 'Firerate', 'Range'],
    [[0, 1000, 4, 2, 0.5, 13]],
  );
  assert.equal(extractLevels(html)[0].damage, 4);
});

test('footnote markers in a header do not hide the column', () => {
  // Headers arrive as "Firerate &#91; 3 &#93;". Matching the raw text finds nothing,
  // which reads exactly like a page with no statistics table on it.
  const html = table(
    ['Level', 'Cost', 'Splash Damage &#91; 2 &#93;', 'Firerate &#91; 3 &#93;', 'Range'],
    [[0, 3500, 15, 4, 25]],
  );
  const levels = extractLevels(html);
  assert.equal(levels.length, 1);
  assert.equal(levels[0].damage, 15);
  assert.equal(levels[0].shotIntervalSeconds, 4);
});

test('a table without the columns that matter is passed over, not misread', () => {
  const html = table(['Level', 'Cost', 'Income', 'Thorn Power'], [[0, 200, 20, 1]]);
  assert.deepEqual(extractLevels(html), []);
});

/**
 * A caption row: one cell spanning the table, above the real header.
 * @param {string} caption
 * @param {string[]} header
 * @param {(string|number)[][]} rows
 */
function captionedTable(caption, header, rows) {
  const cap = '<tr><th colspan="' + header.length + '">' + caption + '</th></tr>';
  return table(header, rows).replace('<table>', '<table>' + cap);
}

test('a table that opens with a spanning caption is still read', () => {
  // Commander and Pursuit were reported for weeks as pages with no level column. Both
  // have one. Their tables simply open with a single spanning cell -- "Commander Stats"
  // -- so row zero was one cell wide, the column check found no Level, and the whole
  // table was skipped. The page then looked, to every step downstream, exactly like a
  // page with no statistics on it at all.
  const html = captionedTable(
    'Commander Stats',
    ['Level', 'Cost', 'Total Cost', 'Damage', 'Firerate', 'Range'],
    [[2, '$2,450', '$3,500', 15, '0.6', 13]],
  );
  const levels = extractLevels(html);
  assert.equal(levels.length, 1);
  assert.equal(levels[0].cost, 2450);
  assert.equal(levels[0].damage, 15);
});

test('the caption is only looked for near the top, so a stray cell cannot pass as one', () => {
  // Scanning the whole table for a header would let any row containing the words Level
  // and Cost become one, which on a long page is a real possibility.
  const rows = Array.from({ length: 8 }, (_, i) => ['<b>x</b>', i]);
  const html = '<table>' + rows.map((r) => '<tr><td>' + r.join('</td><td>') + '</td></tr>').join('') +
    '<tr><th>Level</th><th>Cost</th><th>Damage</th><th>Firerate</th><th>Range</th></tr>' +
    '<tr><td>0</td><td>$125</td><td>1</td><td>1</td><td>12</td></tr></table>';
  assert.deepEqual(extractLevels(html), []);
});

test('a page declaring branching upgrade paths says so in its own captions', () => {
  // Pursuit. Its statistics are split across a neutral block for levels 0 to 3 and then
  // a Top Path and a Bottom Path block that each claim their own levels 4 and 5. The
  // extractor stops at the first table that yields anything, so read without this the
  // tower comes back as an ordinary four-level tower and nothing says the other two
  // thirds were dropped.
  const html =
    captionedTable('Neutral Stats', ['Level', 'Cost', 'Damage', 'Firerate', 'Range'], [[0, '$5,000', 7, '0.225', 7]]) +
    captionedTable('Top Path Stats', ['Level', 'Cost', 'Damage', 'Firerate', 'Range'], [[4, '$15,000', 18, '0.15', 11]]) +
    captionedTable('Bottom Path Stats', ['Level', 'Cost', 'Damage', 'Firerate', 'Range'], [[4, '$9,500', 10, '0.175', 10]]);

  assert.deepEqual(branchingPathCaptions(html), ['Top Path Stats', 'Bottom Path Stats']);
  // And the thing that makes the flag necessary: read normally, the tower looks fine.
  assert.equal(extractLevels(html).length, 1);
});

test('an ordinary page is not accused of branching, however many tables it has', () => {
  // Most pages carry two statistics tables: the tower's own, and its Golden variant's.
  // Counting tables would flag every one of them; counting disagreements would too,
  // because a Golden variant differs at every level by design. Only the source's own
  // caption separates the two cases.
  const plain =
    table(['Level', 'Cost', 'Damage', 'Firerate', 'Range'], [[0, '$125', 1, '1', 12]]) +
    table(['Level', 'Cost', 'Damage', 'Firerate', 'Range'], [[0, '$125', 3, '0.5', 14]]);
  assert.deepEqual(branchingPathCaptions(plain), []);

  const captioned = captionedTable('Warden Stats', ['Level', 'Cost', 'Damage', 'Firerate', 'Range'], [[0, '$1,000', 6, '1', 10]]);
  assert.deepEqual(branchingPathCaptions(captioned), []);
});
