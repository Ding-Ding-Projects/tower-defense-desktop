#!/usr/bin/env node
/**
 * Point the site's download button at the real latest release.
 *
 * The site refuses to guess a link: until a release genuinely exists it shows an
 * honest empty state and the button is hidden. This script is what turns that on, and
 * it only ever writes values it actually read back from the forge.
 *
 * Two things it will not do. It will not mark the site as published when no release
 * is found, and it will not write an asset URL it has not seen in the release's own
 * asset list. A download button that 404s is worse than no download button, because
 * the first person to click it concludes the whole project is broken.
 *
 * Usage:  node tools/update-site-release.mjs           read the latest release and write it
 *         node tools/update-site-release.mjs --check   fail if the site is out of date
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const INDEX = resolve(ROOT, 'site', 'index.html');
const REPO = 'Ding-Ding-Projects/tower-defense-desktop';
const checkOnly = process.argv.includes('--check');

/** @returns {object | null} */
function latestRelease() {
  try {
    const json = execFileSync(
      'gh',
      ['release', 'view', '--repo', REPO, '--json', 'tagName,isDraft,publishedAt,assets'],
      { encoding: 'utf8' },
    );
    const release = JSON.parse(json);
    if (release.isDraft) return null;
    return release;
  } catch {
    return null;
  }
}

const release = latestRelease();

/** @type {{ published: boolean, tag?: string, assetUrl?: string, assetName?: string, publishedAt?: string, checksum?: string }} */
let data = { published: false };

if (release) {
  const installer = (release.assets ?? []).find((asset) => /Setup.*\.exe$/.test(asset.name));
  if (installer) {
    data = {
      published: true,
      tag: release.tagName,
      assetName: installer.name,
      // Taken from the asset record itself, never assembled from a template.
      assetUrl: installer.url,
      publishedAt: release.publishedAt,
      checksum: 'see the release notes',
    };
  } else {
    console.warn('the latest release has no installer asset; leaving the site in its empty state');
  }
} else {
  console.warn('no published release found; leaving the site in its empty state');
}

const html = readFileSync(INDEX, 'utf8');
const pattern = /(<script id="release-data" type="application\/json">)([\s\S]*?)(<\/script>)/;
const match = html.match(pattern);
if (!match) throw new Error('the release-data block is missing from site/index.html');

const current = JSON.parse(match[2]);
const next = JSON.stringify(data, null, 2);
const changed = JSON.stringify(current, null, 2) !== next;

if (checkOnly) {
  if (changed) {
    console.error('site/index.html release data is out of date.');
    console.error('  site says : ' + JSON.stringify(current));
    console.error('  forge says: ' + JSON.stringify(data));
    process.exit(1);
  }
  console.log('site release data matches the published release: ' + (data.tag ?? 'none published'));
} else {
  if (!changed) {
    console.log('site release data already current: ' + (data.tag ?? 'none published'));
  } else {
    writeFileSync(INDEX, html.replace(pattern, '$1\n' + next + '\n$3'));
    console.log('site now points at ' + (data.tag ?? 'no release') + (data.assetName ? ' (' + data.assetName + ')' : ''));
  }
}
