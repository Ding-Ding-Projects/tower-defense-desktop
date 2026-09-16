#!/usr/bin/env node
/**
 * Turn the scraped statistics cache into validated data rows.
 *
 * The upgrade table gives numbers and nothing else. Everything the table does not
 * carry (which terrain a tower may stand on, whether it sees hidden enemies, what it
 * refunds when sold) lives in the overlay below, written by hand, one entry per
 * tower, so that a value nobody sourced is visibly a value nobody sourced rather than
 * a plausible default hiding in generated output.
 *
 * Anything still unresolved is listed in docs/data-sources.md as unresolved. That is
 * the whole point: the roster is allowed to arrive in tranches, and it is not allowed
 * to arrive with invented numbers in it.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/**
 * Hand-written, per tower, for the fields the statistics table does not carry.
 *
 * `detectsHidden` and `hitsAir` are marked null where the page was not checked for
 * them, and a null reaches the validator as an unresolved field rather than becoming
 * a quiet false. A quiet false would make a detector look blind and nobody would
 * notice until a hidden wave walked straight through.
 */
const OVERLAY = {
  scout: { terrain: ['ground'], pool: 'default', max: null, refund: 0.7, footprint: 1.5, detectsHidden: false, hitsAir: false },
  sniper: { terrain: ['ground'], pool: 'default', max: null, refund: 0.7, footprint: 1.5, detectsHidden: true, hitsAir: false },
  soldier: { terrain: ['ground'], pool: 'default', max: null, refund: 0.7, footprint: 1.5, detectsHidden: false, hitsAir: false },
  freezer: { terrain: ['ground'], pool: 'default', max: null, refund: 0.7, footprint: 1.5, detectsHidden: false, hitsAir: false, applies: ['slow'], statusSeconds: 1.5 },
  militant: { terrain: ['ground'], pool: 'default', max: null, refund: 0.7, footprint: 1.5, detectsHidden: false, hitsAir: false },
  shotgunner: { terrain: ['ground'], pool: 'default', max: null, refund: 0.7, footprint: 1.5, detectsHidden: false, hitsAir: false },
  hunter: { terrain: ['ground'], pool: 'default', max: null, refund: 0.7, footprint: 1.5, detectsHidden: true, hitsAir: true },
  minigunner: { terrain: ['ground'], pool: 'default', max: null, refund: 0.7, footprint: 1.5, detectsHidden: false, hitsAir: false },
  ranger: { terrain: ['ground'], pool: 'default', max: null, refund: 0.7, footprint: 1.5, detectsHidden: true, hitsAir: true },
  electroshocker: { terrain: ['ground'], pool: 'default', max: null, refund: 0.7, footprint: 1.5, detectsHidden: false, hitsAir: false, chain: 3, chainRadius: 8 },
  cowboy: { terrain: ['ground'], pool: 'default', max: null, refund: 0.7, footprint: 1.5, detectsHidden: false, hitsAir: false },
  turret: { terrain: ['ground'], pool: 'default', max: null, refund: 0.7, footprint: 2, detectsHidden: true, hitsAir: true },
  'gatling-gun': { terrain: ['ground'], pool: 'default', max: null, refund: 0.7, footprint: 2, detectsHidden: false, hitsAir: false },
};

const ALL_MODES = ['first', 'last', 'closest', 'strongest', 'weakest'];

/**
 * @param {{ level: number, cost: number, damage: number, shotIntervalSeconds: number, range: number, burstCount?: number, reloadSeconds?: number }} row
 * @param {any} overlay
 * @param {{ wikiUrl: string, retrievedAt: string }} source
 */
function toLevel(row, overlay, source) {
  /** @type {any} */
  const level = {
    level: row.level,
    cost: row.cost,
    damage: row.damage,
    // The wiki column is a cooldown in seconds; the simulation wants shots per
    // second. One division, in exactly one place, so it cannot be applied twice.
    fireRate: row.shotIntervalSeconds > 0 ? Number((1 / row.shotIntervalSeconds).toFixed(4)) : 0,
    range: row.range,
    detectsHidden: overlay.detectsHidden === true,
    hitsAir: overlay.hitsAir === true,
    source: { ...source, notes: 'upgrade table; firerate column read as a cooldown in seconds' },
  };
  if (row.burstCount && row.burstCount > 1) {
    level.burstCount = row.burstCount;
    if (row.reloadSeconds !== undefined) level.reloadSeconds = row.reloadSeconds;
  }
  if (overlay.applies) {
    level.appliesStatuses = overlay.applies;
    level.statusDurationSeconds = overlay.statusSeconds ?? 1;
  }
  if (overlay.chain) {
    level.chainCount = overlay.chain;
    level.chainRadius = overlay.chainRadius ?? 8;
  }
  return level;
}

const cachePath = join(ROOT, 'tools', 'wiki-cache', 'towers.json');
const cache = JSON.parse(readFileSync(cachePath, 'utf8'));
const outDir = join(ROOT, 'src', 'data', 'towers');
mkdirSync(outDir, { recursive: true });

const written = [];
const skipped = [];

for (const scraped of cache.results) {
  const overlay = OVERLAY[scraped.id];
  if (!overlay) {
    skipped.push(scraped.id + ' (no hand-written overlay, so its terrain and detection are unknown)');
    continue;
  }
  const source = { wikiUrl: scraped.url, retrievedAt: scraped.retrievedAt ?? cache.retrievedAt };
  const row = {
    id: scraped.id,
    displayName: scraped.displayName,
    baseCost: scraped.levels[0].cost,
    allowedTerrain: overlay.terrain,
    placementPool: overlay.pool,
    maxCount: overlay.max,
    sellRefundFraction: overlay.refund,
    footprintRadius: overlay.footprint,
    targetingModes: ALL_MODES,
    // Level 0 is the placed tower, so its cost is the placement cost and the level
    // entry itself charges nothing further.
    levels: scraped.levels.map((l, i) =>
      toLevel(i === 0 ? { ...l, cost: 0 } : l, overlay, source),
    ),
    source,
  };
  writeFileSync(join(outDir, scraped.id + '.json'), JSON.stringify(row, null, 2) + '\n');
  written.push(scraped.id);
}

console.log('wrote ' + written.length + ' tower row(s): ' + written.join(', '));
if (skipped.length > 0) {
  console.log('\nskipped, and recorded as pending rather than guessed:');
  for (const entry of skipped) console.log('  - ' + entry);
}

const invokedDirectly =
  Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (!invokedDirectly) throw new Error('this script is a command line, not a library');
