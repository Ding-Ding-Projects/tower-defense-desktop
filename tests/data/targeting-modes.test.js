/**
 * Six places name the targeting modes, and they all have to name the same five.
 *
 * The switch in `systems/targeting.js` implements them. The `TargetingMode` typedef
 * declares them. `ALL_TARGETING_MODES` in the interface decides what a tower with no
 * declared list may cycle through, and `LABELS` beside it decides what each one is
 * called on screen. The validator has its own copy. And every tower row on disk carries
 * the subset it allows.
 *
 * Each pair of those can drift in its own way, and each drift fails differently:
 *
 * - A mode in a data row that the simulation does not implement throws, at the moment a
 *   tower carrying it first picks a target. That is a crash several waves into a match,
 *   in front of whoever is playing. The validator now refuses it instead.
 * - A mode the simulation implements that no list offers is a feature nobody can reach.
 * - A mode in `ALL_TARGETING_MODES` and not in `LABELS` is a button that displays its
 *   own internal id, because `targetingModeLabel` falls back to the raw string.
 *
 * The lists are compared rather than shared, on purpose: one canonical list imported
 * everywhere would make five of these six agree by construction, and then the sixth --
 * the switch that actually does the work -- would be the only one that could be wrong,
 * with nothing left to compare it against.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ALL_TARGETING_MODES, targetingModeLabel } from '../../src/ui/targeting.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** The modes the simulation's own switch implements. */
function implemented() {
  const source = readFileSync(ROOT + 'src/sim/systems/targeting.js', 'utf8');
  const start = source.indexOf('switch (mode)');
  assert.ok(start > 0, 'could not find the targeting switch');
  const block = source.slice(start, source.indexOf('unknown targeting mode', start));
  return new Set([...block.matchAll(/case '(\w+)':/g)].map((m) => m[1]));
}

/** The modes the schema typedef declares. */
function declared() {
  const source = readFileSync(ROOT + 'src/data/schema/types.js', 'utf8');
  const line = source.split('\n').find((l) => l.includes('} TargetingMode */'));
  assert.ok(line, 'could not find the TargetingMode typedef');
  return new Set([...line.matchAll(/'(\w+)'/g)].map((m) => m[1]));
}

/** The modes the validator accepts. */
function validated() {
  const source = readFileSync(ROOT + 'tools/validate-data.mjs', 'utf8');
  const line = source.split('\n').find((l) => l.includes('const TARGETING_MODES = ['));
  assert.ok(line, 'could not find the validator list');
  return new Set([...line.matchAll(/'(\w+)'/g)].map((m) => m[1]));
}

/** Every mode any shipped tower allows. */
function allowedByTowers() {
  const dir = ROOT + 'src/data/towers/';
  const found = new Set();
  for (const file of readdirSync(dir)) {
    const def = JSON.parse(readFileSync(dir + file, 'utf8'));
    for (const mode of def.targetingModes ?? []) found.add(mode);
  }
  return found;
}

const sorted = (set) => [...set].sort();

test('the reading works, so the comparisons below mean something', () => {
  // Each of these returns a set and two empty sets compare equal, so a pattern that
  // stopped matching would make every comparison here pass while reading nothing.
  assert.ok(implemented().size >= 5, 'read ' + implemented().size + ' implemented modes');
  assert.ok(declared().size >= 5, 'read ' + declared().size + ' declared modes');
  assert.ok(validated().size >= 5, 'read ' + validated().size + ' validated modes');
  assert.ok(allowedByTowers().size >= 5, 'read ' + allowedByTowers().size + ' modes across the roster');
});

test('the simulation, the schema and the validator agree', () => {
  assert.deepEqual(sorted(declared()), sorted(implemented()), 'the typedef and the switch disagree');
  assert.deepEqual(sorted(validated()), sorted(implemented()), 'the validator and the switch disagree');
});

test('the interface offers exactly the modes that exist', () => {
  assert.deepEqual(
    [...ALL_TARGETING_MODES].sort(), sorted(implemented()),
    'the interface offers [' + [...ALL_TARGETING_MODES].sort().join(', ') +
      '] and the simulation implements [' + sorted(implemented()).join(', ') + ']',
  );
});

test('every mode the interface offers has a name a player can read', () => {
  // `targetingModeLabel` falls back to the raw string, so a missing label is a control
  // that shows its own internal id rather than anything failing.
  for (const mode of ALL_TARGETING_MODES) {
    const label = targetingModeLabel(mode);
    assert.notEqual(
      label, mode,
      mode + ' has no label, so the control displays its internal id',
    );
    assert.match(label, /^[A-Z]/, mode + ' is labelled ' + JSON.stringify(label));
  }
});

test('no tower allows a mode that does not exist', () => {
  // The one that used to be a crash rather than a failed check.
  const real = implemented();
  const unknown = [...allowedByTowers()].filter((m) => !real.has(m)).sort();
  assert.deepEqual(
    unknown, [],
    'towers allow these and the simulation would throw on them mid-match: ' + unknown.join(', '),
  );
});

test('every mode that exists is allowed by at least one tower', () => {
  // A mode nothing offers is a mode nothing exercises, which is how an untested branch
  // of the targeting switch would sit there quietly being wrong.
  const allowed = allowedByTowers();
  const unreachable = [...implemented()].filter((m) => !allowed.has(m)).sort();
  assert.deepEqual(
    unreachable, [],
    'the simulation implements these and no tower on disk offers them: ' + unreachable.join(', '),
  );
});
