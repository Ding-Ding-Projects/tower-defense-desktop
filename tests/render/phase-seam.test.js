/**
 * The simulation and the interface call the phases of a match by different names, and
 * the table between them has a fallback that hides a gap instead of failing on it.
 *
 * Internally a match is in `intermission`, `wave`, `won` or `lost`. The interface is
 * told `intermission`, `active`, `victory` or `defeat`. `PHASE_VIEW` in snapshot.js
 * translates, and it translates with `PHASE_VIEW[state.phase] ?? state.phase`.
 *
 * That fallback is the whole reason this file exists. A phase the table does not know
 * passes straight through under its internal name, and every comparison in the interface
 * is written against the interface names -- so nothing matches, no branch runs, nothing
 * throws, and the screen simply stops changing. A fifth phase added to the simulation
 * would do that on the day it was added, and the first sign of it would be a player
 * watching a match that never announces it has ended.
 *
 * This is the same seam as the command names one file over, and the same failure the
 * event union had: two vocabularies, one table, and nothing holding them together.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadGameData } from '../../src/data/loader.js';
import { createMatchState } from '../../src/sim/state/match-state.js';
import { snapshot } from '../../src/sim/state/snapshot.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Every .js file under a directory, recursively. */
function sourcesUnder(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = dir + entry;
    if (statSync(full).isDirectory()) out.push(...sourcesUnder(full + '/'));
    else if (entry.endsWith('.js')) out.push(full);
  }
  return out;
}

/** The translation table, as pairs. */
function phaseTable() {
  const source = readFileSync(ROOT + 'src/sim/state/snapshot.js', 'utf8');
  const start = source.indexOf('const PHASE_VIEW = Object.freeze({');
  assert.ok(start > 0, 'could not find the phase translation table');
  const block = source.slice(start, source.indexOf('});', start));
  const pairs = [...block.matchAll(/(\w+):\s*'(\w+)'/g)].map((m) => [m[1], m[2]]);
  assert.ok(pairs.length >= 4, 'read only ' + pairs.length + ' entries, so this is not reading the table');
  return new Map(pairs);
}

/** The phases the simulation actually assigns. */
function phasesAssigned() {
  const found = new Set();
  for (const file of sourcesUnder(ROOT + 'src/sim/')) {
    const source = readFileSync(file, 'utf8');
    for (const m of source.matchAll(/\.phase\s*=\s*'(\w+)'/g)) found.add(m[1]);
  }
  return found;
}

/** The phase names the snapshot type declares. */
function declaredPhases() {
  const source = readFileSync(ROOT + 'src/render/sim-interface.js', 'utf8');
  const line = source.split('\n').find((l) => /@property \{'[\w'|]+'\} phase/.test(l));
  assert.ok(line, 'could not find the phase union in the snapshot type');
  return new Set([...line.matchAll(/'(\w+)'/g)].map((m) => m[1]));
}

/** The phase names the interface compares against. */
function phasesCompared() {
  const found = new Set();
  for (const dir of ['src/ui/', 'src/render/']) {
    for (const file of sourcesUnder(ROOT + dir)) {
      const source = readFileSync(file, 'utf8');
      for (const m of source.matchAll(/phase\s*[=!]==\s*'(\w+)'/g)) found.add(m[1]);
    }
  }
  return found;
}

const sorted = (set) => [...set].sort();

test('the reading works, so the comparisons below mean something', () => {
  // Each of these returns a set, and two empty sets compare equal. Without this, a
  // pattern that stopped matching would make the whole file pass while reading nothing.
  assert.ok(phasesAssigned().size >= 4, 'read ' + phasesAssigned().size + ' assigned phases');
  assert.ok(declaredPhases().size >= 4, 'read ' + declaredPhases().size + ' declared phases');
  assert.ok(phasesCompared().size >= 3, 'read ' + phasesCompared().size + ' compared phases');
});

test('every phase the simulation can be in, the table can translate', () => {
  // The one the fallback hides. An untranslated phase reaches the interface under its
  // internal name, matches none of the interface comparisons, and the screen quietly
  // stops responding to the state of the match.
  const table = phaseTable();
  const untranslated = [...phasesAssigned()].filter((p) => !table.has(p)).sort();
  assert.deepEqual(
    untranslated, [],
    'the simulation can be in these phases and PHASE_VIEW does not know them, so they ' +
      'reach the interface untranslated and match nothing: ' + untranslated.join(', '),
  );
});

test('the table translates nothing the simulation cannot be in', () => {
  const assigned = phasesAssigned();
  const stale = [...phaseTable().keys()].filter((p) => !assigned.has(p)).sort();
  assert.deepEqual(
    stale, [],
    'PHASE_VIEW translates phases the simulation never enters: ' + stale.join(', '),
  );
});

test('the declared phases are exactly what the table produces', () => {
  const produced = sorted(new Set(phaseTable().values()));
  assert.deepEqual(
    sorted(declaredPhases()), produced,
    'the type says a phase is one of [' + sorted(declaredPhases()).join(', ') +
      '] and the table produces [' + produced.join(', ') + ']',
  );
});

test('every phase the interface compares against is one it can actually receive', () => {
  // A comparison against a name nothing produces is a branch that never runs, which
  // reads on the page as handled.
  const produced = new Set(phaseTable().values());
  const impossible = [...phasesCompared()].filter((p) => !produced.has(p)).sort();
  assert.deepEqual(
    impossible, [],
    'the interface tests for phases it can never be sent: ' + impossible.join(', '),
  );
});

test('a real snapshot really does carry the translated name', () => {
  // The four checks above compare source text. This asks the simulation.
  const gameData = loadGameData();
  const state = createMatchState(gameData, {
    seed: 1, mapId: 'crossroads', difficultyId: 'easy',
  });
  const table = phaseTable();
  for (const [internal, shown] of table) {
    state.phase = /** @type {any} */ (internal);
    assert.equal(
      snapshot(state).phase, shown,
      'a match in the internal phase "' + internal + '" is reported to the interface as "' +
        snapshot(state).phase + '", not "' + shown + '"',
    );
  }
});
