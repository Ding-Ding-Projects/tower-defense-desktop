/**
 * The interface and the simulation call every command by a different name, and the one
 * table that translates between them is not checked by anything.
 *
 * The interface says `placeTower` and `castAbility`; the simulation says `PlaceTower`
 * and `UseAbility`. `COMMAND_KINDS` in `sim-source.js` maps one vocabulary to the other,
 * and it is the only thing holding the seam together.
 *
 * One direction is already safe at runtime and says why in its own comment: a name the
 * table does not know throws, "because a command name that quietly does nothing is the
 * worst kind of interface defect: the button appears to work and the world never
 * changes". That comment is there because it happened -- upgrade, sell, ability and
 * targeting were all working-looking buttons that changed nothing.
 *
 * The other direction has no such protection. A value in the table that the simulation
 * does not handle comes back as `{accepted: false}` from a function whose return nobody
 * reads, so it is exactly the same defect arriving from the other side. And the typedef
 * that tells the rest of the interface which commands exist is a fourth list, kept in
 * step with the other three by nothing at all.
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

/** The translation table, read as pairs. */
function commandTable() {
  const source = readFileSync(ROOT + 'src/render/sim-source.js', 'utf8');
  const start = source.indexOf('const COMMAND_KINDS = Object.freeze({');
  assert.ok(start > 0, 'could not find the command translation table');
  const block = source.slice(start, source.indexOf('});', start));
  const pairs = [...block.matchAll(/(\w+):\s*'(\w+)'/g)].map((m) => [m[1], m[2]]);
  assert.ok(pairs.length >= 5, 'read only ' + pairs.length + ' entries, so this is not reading the table');
  return new Map(pairs);
}

/** The command kinds the simulation's own switch handles. */
function simulationHandles() {
  const source = readFileSync(ROOT + 'src/sim/commands.js', 'utf8');
  const start = source.indexOf('switch (command.kind)');
  assert.ok(start > 0, 'could not find the command switch');
  const block = source.slice(start, source.indexOf('unknown command:', start));
  return new Set([...block.matchAll(/case '(\w+)':/g)].map((m) => m[1]));
}

/** The command names the typedef declares for the interface side. */
function declaredCommands() {
  const source = readFileSync(ROOT + 'src/render/sim-interface.js', 'utf8');
  const start = source.indexOf('Every mutation the UI is allowed to request');
  assert.ok(start > 0, 'could not find the Command typedef block');
  const block = source.slice(start, source.indexOf('} Command', start));
  return new Set([...block.matchAll(/type: '(\w+)'/g)].map((m) => m[1]));
}

/** The command names the interface and renderer actually submit. */
function submittedCommands() {
  const found = new Set();
  for (const dir of ['src/ui/', 'src/render/']) {
    for (const file of sourcesUnder(ROOT + dir)) {
      if (file.endsWith('sim-source.js')) continue;
      const source = readFileSync(file, 'utf8');
      // Only names inside an actual `submitCommand(...)` call. A first version also
      // swept every `{kind: '...', towerId: ...}` object literal and dragged in
      // `buyTower`, which is an interface ACTION returned by a hit test -- it opens
      // placement mode and never reaches the simulation at all. A guard that reports a
      // defect in correct code gets switched off, which costs more than it ever caught.
      for (const m of source.matchAll(/submitCommand\([^)]*?['"](\w+)['"]/g)) found.add(m[1]);
    }
  }
  return found;
}

test('the reading works, so the comparisons below mean something', () => {
  assert.ok(commandTable().size >= 5, 'read ' + commandTable().size + ' table entries');
  assert.ok(simulationHandles().size >= 5, 'read ' + simulationHandles().size + ' simulation cases');
  assert.ok(declaredCommands().size >= 5, 'read ' + declaredCommands().size + ' declared commands');
  assert.ok(submittedCommands().size >= 3, 'read ' + submittedCommands().size + ' submitted commands');
});

test('every name the table translates to, the simulation actually handles', () => {
  // The unguarded direction. A typo on this side is refused by the simulation with
  // `{accepted: false}` from a function whose return value nobody reads, so it is the
  // same silent dead button arriving from the opposite side of the seam.
  const handled = simulationHandles();
  const orphans = [...commandTable().entries()]
    .filter(([, simName]) => !handled.has(simName))
    .map(([uiName, simName]) => uiName + ' -> ' + simName);
  assert.deepEqual(
    orphans, [],
    'the table translates these to names the simulation does not handle: ' + orphans.join(', '),
  );
});

test('every command the simulation handles, the table can reach', () => {
  // A command the simulation supports and the interface has no name for is a feature
  // nobody can use, which is quieter but no better.
  const reachable = new Set(commandTable().values());
  const unreachable = [...simulationHandles()].filter((name) => !reachable.has(name)).sort();
  assert.deepEqual(
    unreachable, [],
    'the simulation handles these and no interface name reaches them: ' + unreachable.join(', '),
  );
});

test('the declared commands are exactly the ones the table knows', () => {
  const declared = [...declaredCommands()].sort();
  const known = [...commandTable().keys()].sort();
  assert.deepEqual(
    declared, known,
    'the typedef declares [' + declared.join(', ') + '] and the table knows [' + known.join(', ') + ']',
  );
});

test('everything the interface submits is a name the table knows', () => {
  // This one would throw at runtime rather than fail quietly, which is the good case --
  // but only on the click that uses it, in front of whoever clicked.
  const known = commandTable();
  const unknown = [...submittedCommands()].filter((name) => !known.has(name)).sort();
  assert.deepEqual(
    unknown, [],
    'the interface submits these and the table has never heard of them: ' + unknown.join(', '),
  );
});

test('an unknown command name still throws rather than doing nothing', () => {
  // The protection that already exists, pinned so it cannot be softened into a shrug.
  const source = readFileSync(ROOT + 'src/render/sim-source.js', 'utf8');
  const start = source.indexOf('const kind = COMMAND_KINDS[');
  assert.ok(start > 0, 'could not find the translation lookup');
  assert.match(
    source.slice(start, start + 600),
    /throw new Error\('unknown command from the interface: '/,
    'an unknown command name no longer throws, so a mistyped button goes back to ' +
      'looking like it works while changing nothing',
  );
});
