#!/usr/bin/env node
/**
 * Compose the release notes.
 *
 * A committed script rather than a block embedded in the workflow, for two reasons.
 * It can be run and read locally, so what a release will say is knowable before the
 * release exists. And the first attempt WAS embedded, as a PowerShell here-string,
 * whose content has to sit at column zero: that terminated the surrounding block
 * scalar and the whole workflow failed to parse in zero seconds, before a single step
 * ran.
 *
 * Usage:
 *   node tools/release-notes.mjs --version 0.1.7 --setup <path> --sha256 <hash> \
 *     --size-mb 113.7 --commit <sha> --started <iso> --line-count <path> --out <path>
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

/** @returns {Record<string, string>} */
function readArguments() {
  /** @type {Record<string, string>} */
  const values = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--')) continue;
    values[argv[i].slice(2)] = argv[i + 1] ?? '';
  }
  return values;
}

const args = readArguments();
const required = ['version', 'setup', 'sha256', 'size-mb', 'commit', 'out'];
for (const key of required) {
  if (!args[key]) {
    console.error('missing required argument: --' + key);
    process.exit(2);
  }
}

const completed = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const started = args.started && args.started !== 'unavailable' ? args.started : null;

let duration = 'unavailable';
if (started) {
  const ms = Date.parse(completed) - Date.parse(started);
  if (Number.isFinite(ms) && ms >= 0) {
    const seconds = Math.floor(ms / 1000);
    const pad = (n) => String(n).padStart(2, '0');
    duration = pad(Math.floor(seconds / 3600)) + ':' + pad(Math.floor((seconds % 3600) / 60)) + ':' + pad(seconds % 60);
  }
}

let lineCount = '_The line count could not be produced for this build._';
if (args['line-count']) {
  try {
    lineCount = readFileSync(args['line-count'], 'utf8').trim();
  } catch {
    // Never invent it. An unavailable report is reported as unavailable.
  }
}

const notes = [
  '## Tower Defence Desktop ' + args.version,
  '',
  'A deterministic tower defense game for Windows, with mechanical and statistical',
  'parity to Tower Defense Simulator.',
  '',
  '> [!WARNING]',
  '> **This installer is unsigned, and always will be.** Windows will show an',
  '> unknown-publisher warning when you run it. That is expected and is not being',
  '> worked around. It is also not a claim that the file is safe: it is a statement',
  '> that nothing has vouched for it.',
  '',
  '### Installer',
  '',
  '| | |',
  '| --- | --- |',
  '| File | `' + basename(args.setup) + '` |',
  '| Size | ' + args['size-mb'] + ' MB |',
  '| SHA-256 | `' + args.sha256 + '` |',
  '| Signature | `NotSigned`, verified during the build |',
  '| Commit | `' + args.commit + '` |',
  '',
  '### Build timing',
  '',
  'Measured from the run record, not from a clock read partway through.',
  '',
  '| | |',
  '| --- | --- |',
  '| Started | ' + (started ?? 'unavailable') + ' |',
  '| Completed | ' + completed + ' |',
  '| Duration | ' + duration + ' |',
  '',
  '### What is in this build',
  '',
  lineCount,
  '',
  '### Verification',
  '',
  '> [!NOTE]',
  '> Continuous integration for this project runs **no tests and no lint**, by standing',
  '> decision. It builds, packages, publishes and attaches evidence. Checking happens',
  '> locally before a push, with `npm run check`.',
  '>',
  '> So this release makes no claim that any check passed. It claims only that an',
  '> installer was built from the commit above, that it is unsigned, and that it has',
  '> the hash shown.',
  '',
].join('\n');

writeFileSync(args.out, notes + '\n');
console.log('wrote release notes to ' + args.out + ' (' + notes.split('\n').length + ' lines)');
