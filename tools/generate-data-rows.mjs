#!/usr/bin/env node
/**
 * Turn the scraped statistics cache into validated data rows.
 *
 * Two caches feed this. `towers.json` holds the upgrade table: cost, damage, rate,
 * range, per level. `attributes.json` holds the page infobox: hidden and flying
 * detection, placement footprint, base cost and base selling cost. Between them they
 * carry almost everything a tower row needs, and what is left is genuinely not on the
 * page at all — which terrain a tower may stand on, which shared cap it counts
 * against, which status it applies — and that is what the overlay below is for.
 *
 * The overlay used to carry detection, footprint and the refund as well, hand-written
 * from recollection, and it was wrong about most of them. Ranger was marked as seeing
 * hidden enemies and does not. Turret was marked as hitting flying ones and does not.
 * Every tower refunded 70 percent, and the real figure is a third. None of that was
 * visible, because a plausible number in a generated file looks exactly like a sourced
 * one. So the rule now is narrower and easier to hold: if the page says it, the page
 * is what is read, and the overlay only holds what the page does not say.
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
 * Hand-written, per tower, for the fields neither the table nor the infobox carries.
 *
 * Deliberately small. Everything that was moved out of here was moved because the
 * page had the real answer all along and nobody had gone to look.
 */
const OVERLAY = {
  scout: { terrain: ['ground'], pool: 'default', max: null },
  sniper: { terrain: ['ground'], pool: 'default', max: null },
  soldier: { terrain: ['ground'], pool: 'default', max: null },
  freezer: { terrain: ['ground'], pool: 'default', max: null, applies: ['slow'], statusSeconds: 1.5 },
  militant: { terrain: ['ground'], pool: 'default', max: null },
  shotgunner: { terrain: ['ground'], pool: 'default', max: null },
  hunter: { terrain: ['ground'], pool: 'default', max: null },
  minigunner: { terrain: ['ground'], pool: 'default', max: null },
  ranger: { terrain: ['ground'], pool: 'default', max: null },
  electroshocker: { terrain: ['ground'], pool: 'default', max: null, chain: 3, chainRadius: 8 },
  cowboy: { terrain: ['ground'], pool: 'default', max: null },
  turret: { terrain: ['ground'], pool: 'default', max: null },
  'gatling-gun': { terrain: ['ground'], pool: 'default', max: null },
  paintballer: { terrain: ['ground'], pool: 'default', max: null },
  demoman: { terrain: ['ground'], pool: 'default', max: null },
  mortar: { terrain: ['ground'], pool: 'default', max: null },
  rocketeer: { terrain: ['ground'], pool: 'default', max: null },
  // The shared economy cap, which is what the placementPool field exists for: farms
  // compete with each other for a limited number of slots rather than with the guns.
  farm: { terrain: ['ground'], pool: 'economy', max: 8 },
};

const ALL_MODES = ['first', 'last', 'closest', 'strongest', 'weakest'];

/**
 * The refund, as a fraction of everything spent on the tower.
 *
 * Read off the infobox rather than assumed: every tower in the cache lists a base
 * selling cost exactly equal to its base cost divided by three and truncated, with no
 * exceptions and no rounding slack. `1/3` is written rather than a tidied decimal
 * because the simulation multiplies by it, and 0.3333 multiplied by a cost divisible
 * by three truncates a dollar short — six of the thirteen towers land on exactly that
 * case.
 */
const REFUND_FRACTION = 1 / 3;

/**
 * Whether a detection applies at a given level.
 *
 * Detection is per level, which the old single boolean per tower could not say at all.
 * Demoman reads "Level 2+": blind at 0 and 1, seeing from 2 upward. Marking the whole
 * tower as a detector made it see two levels too early, and marking it as blind made
 * it never see at all; both were wrong for most of its levels.
 *
 * @param {{ fromLevel: number|null, never: boolean }} detection
 * @param {number} level
 * @returns {boolean}
 */
function detectionAtLevel(detection, level) {
  if (detection.never || detection.fromLevel == null) return false;
  return level >= detection.fromLevel;
}

/**
 * @param {any} row
 * @param {any} overlay
 * @param {any} attributes
 * @param {{ wikiUrl: string, retrievedAt: string }} source
 */
function toLevel(row, overlay, attributes, source) {
  /** @type {any} */
  const level = {
    level: row.level,
    cost: row.cost,
    // A support tower has no damage, rate or range column at all, and zero is the
    // honest value rather than a missing one: a farm genuinely deals no damage and
    // genuinely has no reach. The simulation already treats a zero-range tower as one
    // that never acquires a target.
    damage: row.damage ?? 0,
    // The wiki column is a cooldown in seconds; the simulation wants shots per
    // second. One division, in exactly one place, so it cannot be applied twice.
    fireRate: row.shotIntervalSeconds > 0 ? Number((1 / row.shotIntervalSeconds).toFixed(4)) : 0,
    range: row.range ?? 0,
    detectsHidden: detectionAtLevel(attributes.hidden, row.level),
    hitsAir: detectionAtLevel(attributes.flying, row.level),
    source: {
      ...source,
      notes: row.incomePerWave
        // A support tower's table has no firerate column to misread, and saying it did
        // would be a citation for a column that is not on the page.
        ? 'upgrade table; the income column is the cash paid at the end of each wave'
        : 'upgrade table; firerate column read as a cooldown in seconds',
    },
  };
  if (row.incomePerWave) level.incomePerWave = row.incomePerWave;
  if (row.aoeRadius) level.aoeRadius = row.aoeRadius;
  if (row.spinUpSeconds) level.spinUpSeconds = row.spinUpSeconds;
  if (row.burstCount && row.burstCount > 1) {
    level.burstCount = row.burstCount;
    if (row.reloadSeconds !== undefined) {
      // A burst tower gives both columns: the gap inside the burst and the reload
      // after it. Nothing to work out.
      level.reloadSeconds = row.reloadSeconds;
    } else {
      // A salvo tower gives only one number, and it is the WHOLE cycle: Rocketeer
      // fires four missiles and then waits 4.5 seconds, it does not wait 4.5 seconds
      // between each missile. Taking the column at face value here would quarter the
      // tower's damage and still look entirely reasonable in the data file.
      //
      // The missiles leave together, and the page does not say how far apart. One
      // simulation tick is the closest the engine can express "together", so that is
      // what is used, and the reload takes the rest of the cycle. The only number
      // here that is not off the page is that one-tick spacing, and it is named as a
      // modelling choice rather than dressed up as a statistic.
      const salvoGapSeconds = 1 / 30;
      level.fireRate = 30;
      level.reloadSeconds = Number(
        Math.max(salvoGapSeconds, row.shotIntervalSeconds - row.burstCount * salvoGapSeconds).toFixed(4),
      );
      level.source = {
        ...level.source,
        notes:
          'upgrade table; the firerate column is the whole salvo cycle, so the projectile count is ' +
          'modelled as a burst fired one tick apart with the remainder of the cycle as the reload',
      };
    }
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
const attributesPath = join(ROOT, 'tools', 'wiki-cache', 'attributes.json');
const attributeCache = JSON.parse(readFileSync(attributesPath, 'utf8'));
/** @type {Map<string, any>} */
const attributesById = new Map(attributeCache.results.map((r) => [r.id, r]));

const outDir = join(ROOT, 'src', 'data', 'towers');
mkdirSync(outDir, { recursive: true });

const written = [];
const skipped = [];

for (const scraped of cache.results) {
  const overlay = OVERLAY[scraped.id];
  if (!overlay) {
    skipped.push(scraped.id + ' (no hand-written overlay, so its terrain and pool are unknown)');
    continue;
  }

  const attributes = attributesById.get(scraped.id);
  if (!attributes) {
    skipped.push(scraped.id + ' (no infobox record; run tools/fetch-wiki-attributes.mjs for it first)');
    continue;
  }

  // Refusing rather than defaulting. A detection field that was never read would
  // otherwise become a quiet false, which makes a detector look blind and gives no
  // sign of it until a hidden wave walks straight past a tower that should have seen
  // it. The same reasoning covers the footprint: a guessed size silently changes what
  // can be placed where.
  const unread = [];
  if (attributes.hidden.raw == null) unread.push('hidden detection');
  if (attributes.flying.raw == null) unread.push('flying detection');
  if (attributes.footprint == null) unread.push('placement footprint');
  if (unread.length > 0) {
    skipped.push(scraped.id + ' (' + unread.join(', ') + ' not on the fetched page; a guess here is invisible)');
    continue;
  }

  // The two caches are read from the same page, so they have to agree about it. If the
  // table's placement cost and the infobox's base cost differ, one of them is stale,
  // and whichever it is the row built from them would mix a price from one reading with
  // detection from another.
  if (attributes.baseCost != null && attributes.baseCost !== scraped.levels[0].cost) {
    skipped.push(
      scraped.id + ' (the upgrade table says it costs $' + scraped.levels[0].cost +
        ' and the infobox says $' + attributes.baseCost + '; one of the two readings is stale)',
    );
    continue;
  }

  // The refund is claimed as one rule for the whole roster, so the claim is checked
  // against every tower rather than spot-checked once. A tower that refunds on some
  // other basis has to be noticed here, not discovered by a player selling one.
  if (attributes.baseCost != null && attributes.baseSell != null) {
    const expected = Math.trunc(attributes.baseCost * REFUND_FRACTION);
    if (expected !== attributes.baseSell) {
      skipped.push(
        scraped.id + ' (its listed selling cost is $' + attributes.baseSell + ', but a third of $' +
          attributes.baseCost + ' truncates to $' + expected + ', so the refund is not the usual rule)',
      );
      continue;
    }
  }

  const source = { wikiUrl: scraped.url, retrievedAt: scraped.retrievedAt ?? cache.retrievedAt };
  const row = {
    id: scraped.id,
    displayName: scraped.displayName,
    baseCost: scraped.levels[0].cost,
    allowedTerrain: overlay.terrain,
    placementPool: overlay.pool,
    maxCount: overlay.max,
    sellRefundFraction: REFUND_FRACTION,
    footprintRadius: attributes.footprint,
    targetingModes: ALL_MODES,
    // Level 0 is the placed tower, so its cost is the placement cost and the level
    // entry itself charges nothing further.
    levels: scraped.levels.map((l, i) =>
      toLevel(i === 0 ? { ...l, cost: 0 } : l, overlay, attributes, source),
    ),
    source: {
      ...source,
      notes:
        'upgrade table for the per-level statistics; the page infobox, retrieved ' +
        attributeCache.retrievedAt + ', for detection, footprint and the selling cost the ' +
        'refund fraction is derived from',
    },
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
