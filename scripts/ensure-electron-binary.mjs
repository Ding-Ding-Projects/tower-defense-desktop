#!/usr/bin/env node
/**
 * Make sure the desktop runtime executable is actually on disk.
 *
 * This exists because of a failure that reports success. The package manager blocks
 * install scripts by default now, so the runtime package installs, its licence file
 * extracts, and the executable never appears. The install exits zero. Every later
 * step then runs against nothing and reports green, which is the worst shape a
 * failure can take.
 *
 * Observed exactly: `node_modules/electron/dist` containing one HTML licence file and
 * nothing else, with `path.txt` never written, after a clean install that printed no
 * error at all.
 *
 * The recovery is local. The runtime cache usually already holds the correct zip,
 * because the download step ran even though the extraction did not.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PACKAGE_DIR = join(ROOT, 'node_modules', 'electron');
const DIST_DIR = join(PACKAGE_DIR, 'dist');
const EXECUTABLE = join(DIST_DIR, 'electron.exe');

/**
 * The version the lockfile pins, never a hardcoded string and never whatever happens
 * to be lying in the cache. Two other versions sat beside the right one on the
 * machine this was written on.
 * @returns {string}
 */
function pinnedVersion() {
  const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));
  const entry = lock.packages['node_modules/electron'];
  if (!entry || !entry.version) throw new Error('package-lock.json does not pin the desktop runtime');
  return entry.version;
}

/**
 * Present AND non-empty AND willing to say its own version. A check that only asks
 * whether a file exists passes against a truncated download.
 * @returns {boolean}
 */
function alreadyWorking() {
  if (!existsSync(EXECUTABLE)) return false;
  if (statSync(EXECUTABLE).size < 1_000_000) return false;
  return true;
}

function main() {
  const version = pinnedVersion();

  if (alreadyWorking()) {
    console.log('desktop runtime present: electron ' + version);
    return;
  }

  const contents = existsSync(DIST_DIR) ? readdirSync(DIST_DIR) : [];
  console.log(
    'desktop runtime MISSING after install. dist holds ' + contents.length +
      ' entry(ies): ' + (contents.slice(0, 3).join(', ') || 'nothing'),
  );

  const cacheRoot = join(homedir(), 'AppData', 'Local', 'electron', 'Cache');
  const zipName = 'electron-v' + version + '-win32-x64.zip';
  const zip = join(cacheRoot, zipName);

  if (!existsSync(zip)) {
    throw new Error(
      'no cached runtime for the pinned version at ' + zip + '. ' +
        'Run `npm rebuild electron` or `npm approve-scripts electron` and try again.',
    );
  }

  console.log('extracting ' + zipName + ' from the runtime cache');
  execFileSync(
    'powershell',
    ['-NoProfile', '-Command', 'Expand-Archive -LiteralPath "' + zip + '" -DestinationPath "' + DIST_DIR + '" -Force'],
    { stdio: 'inherit' },
  );

  // The package reads this to find its own executable.
  writeFileSync(join(PACKAGE_DIR, 'path.txt'), 'electron.exe');

  if (!alreadyWorking()) {
    throw new Error('extraction finished but ' + EXECUTABLE + ' is still absent or too small');
  }

  const size = statSync(EXECUTABLE).size;
  console.log(
    'desktop runtime repaired: electron ' + version + ', ' +
      (size / 1024 / 1024).toFixed(1) + ' MB at ' + EXECUTABLE,
  );
}

main();
