/**
 * Three sets that must be the same set: the events the simulation emits, the events the
 * snapshot type says exist, and the events the renderer draws something for.
 *
 * All three had drifted apart, in both directions at once, and nothing anywhere was red.
 *
 * `abilityCast`, `towerPlaced` and `towerSold` were declared as things a snapshot event
 * could be, and emitted by nothing. `towerFired` was the reverse: the renderer had a
 * branch for it driving `drawMuzzleFlash`, a finished piece of art that had never once
 * been called, and the type did not list it at all. The compiler could not object,
 * because `_handleEvent` took its event as `any`, which turns a comparison against a
 * type outside the union from an error into a comparison that is simply never true.
 *
 * So the branch was unreachable, the art was dead, three declared types did not exist,
 * and every check in the suite passed. Hence this, which asks the question directly
 * rather than trusting anyone to notice.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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

/**
 * The event types the simulation actually records, read from its `recordEvent` calls.
 *
 * Read from the calls rather than from the type, because the type is one of the things
 * being checked: asking the declaration what is emitted would make two of these three
 * sets the same question.
 */
function emittedTypes() {
  const found = new Set();
  for (const file of sourcesUnder(ROOT + 'src/sim/')) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/recordEvent\(\s*\w+\s*,\s*\{[\s\S]{0,120}?type:\s*'(\w+)'/g)) {
      found.add(match[1]);
    }
  }
  return found;
}

/** The types the renderer's handler has a branch for. */
function handledTypes() {
  const source = readFileSync(ROOT + 'src/render/renderer.js', 'utf8');
  // Sliced from the definition forward, not between two first-occurrences: both names
  // are CALLED earlier in the file than they are defined, so `indexOf` on the second
  // anchor found a call site above the handler and produced an empty slice -- and an
  // empty set compares equal to another empty set, which would have made this whole
  // file pass while reading nothing.
  // Anchored on the DEFINITION, which is the one with a brace after it. Both of these
  // names are called earlier in the file than they are defined, so anchoring on the bare
  // call signature found line 162 and sliced six lines of the draw loop: three hundred
  // characters, comfortably past a length check, containing not one branch. An empty set
  // then compares equal to another empty set and the whole file passes while reading
  // nothing, which is the failure this file exists to catch, one level up.
  const start = source.indexOf('_handleEvent(event, particles, now) {');
  assert.ok(start > 0, 'could not find the event handler definition');
  const handler = source.slice(start, source.indexOf('_drawEffects(camera, w, h, now) {', start));
  assert.ok(handler.length > 200, 'could not find the event handler to read');
  assert.match(handler, /this\._effects\.push/, 'the slice is not the event handler');
  return new Set([...handler.matchAll(/event\.type === '(\w+)'/g)].map((m) => m[1]));
}

/** The types the SnapshotEvent union declares. */
function declaredTypes(file, marker) {
  const source = readFileSync(ROOT + file, 'utf8');
  const line = source.split('\n').find((l) => l.includes(marker));
  assert.ok(line, 'could not find the event union in ' + file);
  return new Set([...line.matchAll(/'(\w+)'/g)].map((m) => m[1]));
}

const sorted = (set) => [...set].sort();

test('the reading itself works, so a mismatch below means something', () => {
  // Every one of these would report an empty set if its pattern stopped matching, and
  // two empty sets compare equal, which is the quietest possible way for this whole
  // file to stop checking anything.
  assert.ok(emittedTypes().size >= 5, 'read ' + emittedTypes().size + ' emitted types');
  assert.ok(handledTypes().size >= 5, 'read ' + handledTypes().size + ' handled types');
  assert.ok(
    declaredTypes('src/render/sim-interface.js', '@property {\'damageDealt\'').size >= 5,
    'read too few declared types from the renderer interface',
  );
});

test('everything the simulation emits, the renderer draws something for', () => {
  const emitted = emittedTypes();
  const handled = handledTypes();
  const ignored = sorted(emitted).filter((t) => !handled.has(t));
  assert.deepEqual(
    ignored, [],
    'the simulation emits these and the renderer does nothing with them: ' + ignored.join(', '),
  );
});

test('everything the renderer draws, the simulation actually emits', () => {
  // The direction that produced dead art. A branch for an event nothing sends is
  // unreachable code that looks exactly like a working feature.
  const emitted = emittedTypes();
  const handled = handledTypes();
  const unreachable = sorted(handled).filter((t) => !emitted.has(t));
  assert.deepEqual(
    unreachable, [],
    'the renderer has branches for events nothing emits, so they can never run: ' +
      unreachable.join(', '),
  );
});

test('the declared union is exactly what is emitted', () => {
  const declared = declaredTypes('src/render/sim-interface.js', '@property {\'damageDealt\'');
  assert.deepEqual(
    sorted(declared), sorted(emittedTypes()),
    'the type says an event may be one of [' + sorted(declared).join(', ') +
      '] and the simulation emits [' + sorted(emittedTypes()).join(', ') + ']',
  );
});

test('the simulation and the renderer agree on what an event may be', () => {
  // The union is written out twice, because the simulation must not import from the
  // renderer. Two copies of a list is two lists, until something compares them.
  const rendererSide = declaredTypes('src/render/sim-interface.js', '@property {\'damageDealt\'');
  const simSide = declaredTypes('src/sim/state/events.js', "type: 'damageDealt'");
  assert.deepEqual(
    sorted(simSide), sorted(rendererSide),
    'the simulation says [' + sorted(simSide).join(', ') + '] and the renderer says [' +
      sorted(rendererSide).join(', ') + ']',
  );
});

test('the handler is typed, so the compiler can see a branch that cannot match', () => {
  // This is what let the whole thing happen. With the event typed as `any`, comparing
  // it against a type outside the union is not an error; it is a comparison that is
  // simply never true, and reads as a feature.
  const source = readFileSync(ROOT + 'src/render/renderer.js', 'utf8');
  const at = source.indexOf('_handleEvent(event, particles, now) {');
  assert.ok(at > 0, 'could not find the event handler definition');
  const doc = source.slice(source.lastIndexOf('/**', at), at);
  assert.match(
    doc, /@param \{import\('\.\/sim-interface\.js'\)\.SnapshotEvent\} event/,
    'the event handler takes an untyped event again, which is how a branch for a ' +
      'non-existent event type stopped being a compile error',
  );
});
