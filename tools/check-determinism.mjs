#!/usr/bin/env node
/**
 * Refuse any source of non-determinism under src/sim.
 *
 * A simulation that reads the wall clock or the platform random generator cannot be
 * replayed, and the failure does not announce itself: the code works, the tests pass,
 * and then two runs of the same match quietly disagree about who died. So this is a
 * grep rather than a convention, and it runs before anything else.
 *
 * It is not sufficient on its own. An unstable sort comparator is just as fatal and
 * no pattern here can see it, which is why the replay hash checks exist alongside it.
 * This catches the careless half; those catch the subtle half.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const TARGET = join(ROOT, 'src', 'sim');

/** Each rule says what is banned and, more usefully, what to do instead. */
const BANNED = [
  { pattern: /Math\s*\.\s*random\s*\(/g, use: 'nextFloat(state.rng) from src/sim/core/rng.js' },
  { pattern: /Date\s*\.\s*now\s*\(/g, use: 'state.tick' },
  { pattern: /new\s+Date\s*\(/g, use: 'state.tick' },
  { pattern: /performance\s*\.\s*now\s*\(/g, use: 'state.tick' },
  { pattern: /crypto\s*\.\s*getRandomValues\s*\(/g, use: 'nextFloat(state.rng)' },
];

/**
 * @param {string} dir
 * @returns {string[]}
 */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.js')) out.push(full);
  }
  return out;
}

/**
 * Strip comments and string literals before scanning, so the word "Math.random" in a
 * comment explaining why it is banned does not fail the very check it documents.
 * @param {string} source
 * @returns {string}
 */
function stripNonCode(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
    .replace(/'(?:[^'\\\n]|\\.)*'/g, (m) => ' '.repeat(m.length))
    .replace(/"(?:[^"\\\n]|\\.)*"/g, (m) => ' '.repeat(m.length));
}

let failures = 0;
for (const file of walk(TARGET)) {
  const raw = readFileSync(file, 'utf8');
  const code = stripNonCode(raw);
  const lines = raw.split('\n');
  for (const { pattern, use } of BANNED) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(code)) !== null) {
      const line = code.slice(0, match.index).split('\n').length;
      console.error(
        relative(ROOT, file) + ':' + line + '  ' + lines[line - 1].trim(),
      );
      console.error('    banned in a deterministic simulation; use ' + use);
      failures += 1;
    }
  }
}

if (failures > 0) {
  console.error('\n' + failures + ' source(s) of non-determinism found under src/sim.');
  process.exit(1);
}
console.log('determinism check passed: no clock or platform randomness under src/sim');
