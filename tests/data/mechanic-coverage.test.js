/**
 * Every mechanic the engine can express is either used by a shipped tower, or recorded
 * here as unused with the reason.
 *
 * This exists because of a specific failure that has now happened twice. The ability
 * system's `buffPulse` branch was empty, behind a comment claiming the work was done
 * elsewhere, for the entire life of the project. Nothing was red. No tower on disk had
 * an ability, so the branch was never reached, and every check of the ability system
 * ran against a synthetic fixture that exercised a different branch. The same audit
 * found Paintballer and Ranger shipping uncapped explosions, because the engine had no
 * cap and their pages had said "Max Hits" all along.
 *
 * A mechanic nothing uses is a mechanic nothing exercises, and the fixture will happily
 * go on proving it works while the shipped game never runs it once.
 *
 * The list is hand-written, and that is the point. A check that discovered the mechanics
 * by reading the schema could not notice one that was deleted, and a check that
 * discovered them by reading the data could not notice one with no users at all, which
 * is the exact thing being looked for.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Every optional field a tower level may carry, and what is expected of it.
 *
 * `unusedBecause` is a deliberate admission, not a way to silence the check: a mechanic
 * carrying one must genuinely have no shipped user, so a mechanic that quietly gains
 * one turns this red and the note has to be removed.
 */
const MECHANICS = [
  { field: 'spinUpSeconds' },
  { field: 'burstCount' },
  { field: 'reloadSeconds' },
  { field: 'aoeRadius' },
  { field: 'splashDamage' },
  { field: 'maxSplashTargets' },
  { field: 'chainCount' },
  { field: 'chainRadius' },
  { field: 'appliesStatuses' },
  { field: 'statusDurationSeconds' },
  { field: 'statusDamagePerTick' },
  { field: 'incomePerWave' },
  { field: 'secondary' },
  { field: 'ability' },
  { field: 'waveStartAura' },
  { field: 'waveStartAuraSeconds' },
  {
    field: 'critDamage',
    unusedBecause: 'the critical-hit model was solved for Warden, whose own page ' +
      'contradicts itself about its cost and damage, so the tower does not ship',
  },
  { field: 'critEveryNthHit', unusedBecause: 'same as critDamage; they are one mechanic' },
  {
    field: 'projectileSpeed',
    unusedBecause: 'no shipped tower publishes one. Mortar, Rocketeer, Demoman and ' +
      'Paintballer all have tables with no speed column, and their published DPS treats ' +
      'a shot as landing when it is fired, so a travel time here would be invented ' +
      'rather than read',
  },
  {
    field: 'pierceCount',
    unusedBecause: 'no shipped tower publishes a pierce count. The column that looked ' +
      'like one, "Max Hits", caps an explosion rather than a shot, and is read as ' +
      'maxSplashTargets',
  },
  {
    field: 'bonusVsTag',
    unusedBecause: 'the mark-and-consume synergy primitive. No shipped tower applies a ' +
      'tagged status, and the pairings were never sourced',
  },
  {
    field: 'aura',
    unusedBecause: 'a standing aura, as opposed to the wave-start one Ranger now ' +
      'carries. Every support tower with a permanent buff is blocked: Commander has ' +
      'two abilities on one level and summons friendly units, and DJ Booth has ' +
      'player-selected buff tracks',
  },
  {
    field: 'firesOnlyDuringAbility',
    unusedBecause: 'written for Commander, which does not ship',
  },
];

/** Which shipped towers use each field. */
function usersByField() {
  /** @type {Map<string, string[]>} */
  const users = new Map();
  const dir = ROOT + 'src/data/towers/';
  for (const file of readdirSync(dir)) {
    const def = JSON.parse(readFileSync(dir + file, 'utf8'));
    for (const level of def.levels) {
      for (const field of Object.keys(level)) {
        if (!users.has(field)) users.set(field, []);
        const list = /** @type {string[]} */ (users.get(field));
        if (!list.includes(def.id)) list.push(def.id);
      }
    }
  }
  return users;
}

test('every mechanic with no shipped user says why, in writing', () => {
  const users = usersByField();
  const silent = MECHANICS
    .filter((m) => !m.unusedBecause && (users.get(m.field) ?? []).length === 0)
    .map((m) => m.field);
  assert.deepEqual(
    silent, [],
    'these mechanics are used by no shipped tower and carry no recorded reason: ' +
      silent.join(', ') + '. A mechanic nothing uses is a mechanic nothing runs, which ' +
      'is how buffPulse stayed empty for the life of the project.',
  );
});

test('a mechanic recorded as unused really is unused', () => {
  const users = usersByField();
  const stale = MECHANICS
    .filter((m) => m.unusedBecause && (users.get(m.field) ?? []).length > 0)
    .map((m) => m.field + ' (now used by ' + (users.get(m.field) ?? []).join(', ') + ')');
  assert.deepEqual(
    stale, [],
    'these carry a note saying nothing uses them, and something does: ' + stale.join('; ') +
      '. Remove the note rather than leaving a false explanation in place.',
  );
});

test('the list covers every optional field the towers actually carry', () => {
  // The direction a hand-written list gets wrong: a field added to the schema and used
  // by a row, with nobody adding it here. Without this the list slowly stops describing
  // the engine and nobody finds out.
  const REQUIRED_ON_EVERY_LEVEL = [
    'level', 'cost', 'damage', 'fireRate', 'range', 'detectsHidden', 'hitsAir', 'source',
  ];
  const known = new Set([...MECHANICS.map((m) => m.field), ...REQUIRED_ON_EVERY_LEVEL]);
  const unlisted = [...usersByField().keys()].filter((field) => !known.has(field));
  assert.deepEqual(
    unlisted, [],
    'shipped rows carry fields this list has never heard of: ' + unlisted.join(', '),
  );
});

test('the list has not drifted from the schema either', () => {
  // And the direction the data cannot show at all: a mechanic the schema can express
  // that no row uses AND nobody listed. That is precisely the shape buffPulse had.
  const schema = readFileSync(ROOT + 'src/data/schema/types.js', 'utf8');
  const towerLevel = schema.slice(
    schema.indexOf('@typedef {object} TowerLevel'),
    schema.indexOf('@typedef {object} AuraDef'),
  );
  assert.ok(towerLevel.length > 500, 'could not find the TowerLevel definition to read');

  const optional = [...towerLevel.matchAll(/@property \{[^}]+\} \[(\w+)\]/g)].map((m) => m[1]);
  assert.ok(
    optional.length > 10,
    'read only ' + optional.length + ' optional fields, so this is not reading the schema',
  );

  const listed = new Set(MECHANICS.map((m) => m.field));
  const missing = optional.filter((field) => !listed.has(field));
  assert.deepEqual(
    missing, [],
    'the schema can express these and the list does not mention them: ' + missing.join(', '),
  );
});
