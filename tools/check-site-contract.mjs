#!/usr/bin/env node
/**
 * Runs the hand-written contract in tools/lib/site-contract-list.mjs against the
 * real built site. Every row must name something concrete; this script's only job
 * is reading the real files off disk and reporting exactly which rows failed, so a
 * missing feature is a named, specific failure rather than a silent gap.
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTRACT } from './lib/site-contract-list.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SITE_DIR = path.join(ROOT, 'site');

/**
 * @param {string} dir
 * @param {(name: string) => boolean} match
 * @returns {Promise<string[]>}
 */
async function collectFiles(dir, match) {
  /** @type {string[]} */
  const results = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...(await collectFiles(full, match)));
    else if (match(entry.name)) results.push(full);
  }
  return results;
}

async function concatFiles(files) {
  const parts = await Promise.all(files.map((f) => readFile(f, 'utf8')));
  return parts.join('\n/* --- next file --- */\n');
}

async function main() {
  const html = await readFile(path.join(SITE_DIR, 'index.html'), 'utf8');

  const jsFiles = await collectFiles(path.join(SITE_DIR, 'scripts'), (n) => n.endsWith('.js') || n.endsWith('.mjs'));
  const js = await concatFiles(jsFiles);

  const cssFiles = await collectFiles(path.join(SITE_DIR, 'styles'), (n) => n.endsWith('.css'));
  const css = await concatFiles(cssFiles);

  const rootFiles = (await readdir(ROOT, { withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name);

  let featuresData = null;
  try {
    featuresData = JSON.parse(await readFile(path.join(SITE_DIR, 'data', 'features.json'), 'utf8'));
  } catch {
    featuresData = null;
  }

  const ctx = { html, js, css, rootFiles, featuresData };

  const results = CONTRACT.map((item) => ({ item, pass: item.check(ctx) }));
  const failed = results.filter((r) => !r.pass);

  for (const { item, pass } of results) {
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${item.id}  — ${item.description}`);
  }

  console.log('');
  console.log(`site contract: ${results.length - failed.length}/${results.length} passed`);

  if (failed.length) {
    console.error(`site contract: ${failed.length} requirement(s) not met.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('site contract check failed to run:', error);
  process.exitCode = 1;
});
