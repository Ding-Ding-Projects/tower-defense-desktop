#!/usr/bin/env node
/**
 * Launch the program at each size in the capture matrix, one at a time, and report what
 * to capture.
 *
 * What this does NOT do is take the pictures. Captures go through the project's
 * sanctioned off-screen route, which is a tool an agent calls rather than something a
 * committed script can invoke, and a script that quietly grabbed frames some other way
 * would be producing evidence from a route nobody agreed to trust.
 *
 * What it does do is remove the part that was actually unreliable. The sizes used to be
 * whatever the desktop happened to be that day, chosen by hand and not written down
 * anywhere, so two runs of "the capture matrix" were two different matrices. Here the
 * list is in the file, the program is launched at exactly those sizes, and each entry
 * prints the window title and the size it is waiting at.
 *
 * The layout itself is verified without any of this: tests/hud/viewport-fit.test.js
 * draws the real interface layer at each size and bounds every drawing coordinate.
 * These captures are evidence of what it looks like, not proof that it fits.
 *
 * Usage:  node tools/capture-matrix.mjs           list the matrix
 *         node tools/capture-matrix.mjs --launch  launch each entry in turn
 */

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/**
 * The sizes worth looking at, and why each one is in the list.
 *
 * Every entry is at or above the 960 by 600 minimum the program declares, because a
 * capture below the supported minimum proves nothing about the product.
 */
const MATRIX = [
  { width: 960, height: 600, why: 'the declared minimum, where clipping appears first' },
  { width: 1280, height: 800, why: 'the default window' },
  { width: 1920, height: 1080, why: 'a full screen' },
  { width: 2560, height: 1440, why: 'a large screen, where the sidebar cap binds' },
];

/** Seconds to leave each one up, so a capture has something settled to photograph. */
const HOLD_SECONDS = 12;

/**
 * @param {{width: number, height: number}} size
 * @returns {Promise<void>}
 */
function launchAndHold(size) {
  return new Promise((done, fail) => {
    const child = spawn(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['electron', '.', `--window-size=${size.width}x${size.height}`],
      { cwd: ROOT, stdio: 'ignore', detached: false },
    );
    child.on('error', fail);

    const timer = setTimeout(() => {
      child.kill();
      done();
    }, HOLD_SECONDS * 1000);

    child.on('exit', () => {
      clearTimeout(timer);
      done();
    });
  });
}

const invokedDirectly =
  Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (!invokedDirectly) throw new Error('this script is a command line, not a library');

console.log('The capture matrix, ' + MATRIX.length + ' entries:\n');
for (const entry of MATRIX) {
  console.log(
    '  ' + String(entry.width).padStart(4) + ' x ' + String(entry.height).padStart(4) +
    '   ' + entry.why,
  );
}

if (!process.argv.includes('--launch')) {
  console.log('\nPass --launch to bring each one up in turn. Capture the window titled');
  console.log('"Tower Defence Desktop" through the project\'s own off-screen route while it is up;');
  console.log('this script deliberately does not take pictures itself.');
  process.exit(0);
}

for (const entry of MATRIX) {
  console.log('\nlaunching at ' + entry.width + 'x' + entry.height + ', holding ' + HOLD_SECONDS + 's');
  await launchAndHold(entry);
  console.log('  closed');
}
console.log('\nmatrix finished');
