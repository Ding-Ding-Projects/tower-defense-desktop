#!/usr/bin/env node
/**
 * Pull real tower statistics from the public wiki and write them as cited data rows.
 *
 * This exists as a committed script rather than as a person copying tables by hand,
 * for the same reason the line counter does: a number nobody can re-derive is a
 * number nobody can check, and a wiki that gets balance patches will drift away from
 * a hand transcription without anybody noticing.
 *
 * Two things learned the hard way and recorded here so nobody rediscovers them:
 *
 * 1. The site answers a plain scripted request with HTTP 402, and answers the same
 *    request from a browser user agent with 200. That is client fingerprinting, not
 *    a paywall. Do not conclude the source is unavailable without trying a second
 *    transport.
 * 2. The column the wiki labels "Firerate" is a COOLDOWN in seconds, not shots per
 *    second. Scout level 4 lists damage 8, firerate 0.325 and DPS 24.62, and
 *    8 / 0.325 is 24.62. Reading it as a rate would make every tower wrong by a
 *    reciprocal, and the error would look plausible the whole way.
 *
 * Usage:  node tools/fetch-wiki-stats.mjs Scout Sniper Farm
 *         node tools/fetch-wiki-stats.mjs --all
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

const PAGE_CACHE = join(ROOT, 'tools', 'wiki-cache', 'pages');

/**
 * Where a fetched page is parked on disk.
 *
 * Cached because the site throttles: a run of seventeen requests gets everything
 * refused for several minutes afterwards, and re-fetching a page already on disk to
 * re-read one field off it is exactly what earns that. The cache holds raw
 * third-party HTML, so it is ignored by Git; the distilled JSON beside it is what
 * gets committed.
 *
 * @param {string} url
 * @returns {string}
 */
function cachePathFor(url) {
  const slug = decodeURIComponent(url.split('/').pop() ?? 'page').replace(/[^A-Za-z0-9]+/g, '_');
  return join(PAGE_CACHE, slug + '.html');
}

/**
 * @param {string} url
 * @param {{ refresh?: boolean }} [options]
 * @returns {string}
 */
export function fetchPage(url, options = {}) {
  const cached = cachePathFor(url);
  if (!options.refresh && existsSync(cached)) {
    const html = readFileSync(cached, 'utf8');
    // The same length guard as a live fetch. A truncated page that reached the cache
    // would otherwise be served forever, and would look exactly like a page with no
    // statistics table on it.
    if (html.length >= 50000) return html;
  }

  // Written to a file and read back, rather than captured from standard output.
  //
  // Capturing stdout returned a valid but TRUNCATED page: 5,627 bytes of a 603,508
  // byte document, with a correct title and no tables. That is the worst shape a
  // failure can take, because every downstream step then reports "this page has no
  // statistics table" about a page that plainly does, and the parser gets blamed for
  // a transport problem.
  // Retried, because the short response is intermittent rather than structural: the
  // same URL that returns 5,630 bytes on one attempt returns 600,000 on the next.
  // Without the length guard this would have been invisible, and the parser would
  // have been blamed for a page that simply did not arrive.
  let lastError = new Error('no attempt was made');
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const temp = join(tmpdir(), 'tds-fetch-' + process.pid + '-' + Date.now() + '.html');
    try {
      execFileSync('curl', ['-sS', '--compressed', '-A', BROWSER_UA, '-o', temp, url], {
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      const html = readFileSync(temp, 'utf8');
      if (html.length < 50000) {
        throw new Error(
          'short response (' + html.length + ' bytes); a real article is hundreds of kilobytes',
        );
      }
      mkdirSync(PAGE_CACHE, { recursive: true });
      writeFileSync(cached, html);
      return html;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      // Deliberately blocking. This is a one-off scrape, not a hot path, and a busy
      // wait is far easier to reason about here than an async retry ladder.
      const until = Date.now() + attempt * 1500;
      while (Date.now() < until) {
        // waiting out the throttle
      }
    } finally {
      try {
        unlinkSync(temp);
      } catch {
        // A leftover temporary file is not worth failing a scrape over.
      }
    }
  }
  throw new Error('gave up on ' + url + ' after 4 attempts: ' + lastError.message);
}

/**
 * Flatten one HTML table into a grid of cell strings.
 * @param {string} tableHtml
 * @returns {string[][]}
 */
export function tableToRows(tableHtml) {
  const rows = tableHtml.match(/<tr[\s\S]*?<\/tr>/g) || [];
  return rows.map((row) => {
    const cells = row.match(/<t[hd][\s\S]*?<\/t[hd]>/g) || [];
    return cells.map((cell) =>
      cell
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        // Numeric entities are decoded rather than deleted. Deleting them turned the
        // header "Firerate &#91; 1 &#93;" into "firerate 1" instead of "firerate",
        // which matched nothing and read exactly like a page with no table at all.
        .replace(/&#(\d+);/g, (_all, code) => String.fromCharCode(Number(code)))
        .replace(/\s+/g, ' ')
        .trim(),
    );
  });
}

/**
 * @param {string} value
 * @returns {number | null}
 */
function money(value) {
  const cleaned = String(value).replace(/[$,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/**
 * Find the upgrade table and read it.
 *
 * A page can carry several tables, so the right one is identified by its header
 * containing the columns that matter rather than by position, which would silently
 * pick up a navigation box the day the layout changes.
 * @param {string} html
 * @returns {Array<Record<string, number>>}
 */
/**
 * Normalise a header cell.
 *
 * Headers carry footnote markers encoded as numeric entities, so "Firerate [1]"
 * arrives as "Firerate &#91; 1 &#93;". Matching on the raw text silently finds
 * nothing, which reads exactly like a page that has no table at all.
 * @param {string} cell
 * @returns {string}
 */
function normaliseHeader(cell) {
  return cell
    .replace(/&#\d+;/g, '')
    .replace(/\[\s*\d+\s*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function extractLevels(html) {
  const tables = html.match(/<table[\s\S]*?<\/table>/g) || [];
  for (const table of tables) {
    const rows = tableToRows(table).filter((r) => r.length > 0);
    if (rows.length < 2) continue;
    const header = rows[0].map(normaliseHeader);
    const col = (name) => header.findIndex((h) => h === name);
    // Several columns mean one thing under more than one name, and the difference is
    // purely editorial: a splash tower's damage column is headed "Splash Damage", a
    // melee tower's rate column is headed "Swingrate". Matching only the most common
    // spelling reported "this page has no statistics table" about eleven pages that
    // plainly have one, which reads like a missing source rather than a missing alias.
    //
    // The aliases are ordered, and the order is the priority: Pyromancer carries both
    // "Normal Damage" and "Burn Damage", and the direct-hit figure is the one that
    // belongs in `damage`, with the burn modelled as a status.
    const firstCol = (...names) => {
      for (const name of names) {
        const index = col(name);
        if (index >= 0) return index;
      }
      return -1;
    };
    const iLevel = col('level');
    const iCost = col('cost');
    const iDamage = firstCol('damage', 'splash damage', 'normal damage');
    const iFire = firstCol('firerate', 'swingrate');
    const iRange = col('range');
    if (iLevel < 0 || iCost < 0 || iDamage < 0 || iFire < 0 || iRange < 0) continue;

    // Splash towers carry their blast size in their own column. It is read here rather
    // than hand-written in the overlay because it is a real sourced number sitting
    // right beside the damage it applies to, and a hand-written blast radius is exactly
    // the kind of plausible invention the overlay exists to keep visible.
    const iAoe = firstCol('explosion range', 'explosion radius');

    // The page's own damage-per-second column, carried through unread by anything that
    // builds a row. It is the only independent arithmetic the source offers, and it has
    // caught two real errors already: reading the rate column as a rate rather than a
    // cooldown, which inverts every tower, and dropping a salvo's projectile count,
    // which quartered Rocketeer. Both produced numbers that looked entirely reasonable.
    const iDps = col('dps');

    // A burst tower carries both columns: "firerate" is the gap between shots inside
    // a burst, and "cooldown" is the reload between bursts. A single-shot tower has
    // only the first, and for it that column IS the whole cycle.
    // A salvo tower names the same idea "Missile Count": how many projectiles leave
    // the tower per cycle. Reading it matters for more than flavour, because the
    // page's own DPS column folds it in — Rocketeer's top level lists 84.44, and
    // 95 damage over a 4.5 second cycle is 21.11 unless the four missiles are counted.
    const iBurst = firstCol('burst count', 'missile count', 'bullet count', 'ammo');
    const iCooldown = firstCol('cooldown', 'reload time');

    // A wind-up before the first shot. The engine has a field for it, and without it a
    // tower that is supposed to take a second to get going opens fire instantly.
    const iSpin = firstCol('spin time', 'charge-up');

    const levels = [];
    for (const row of rows.slice(1)) {
      const level = money(row[iLevel]);
      const cost = money(row[iCost]);
      const damage = money(row[iDamage]);
      const firerate = money(row[iFire]);
      const range = money(row[iRange]);
      if (level === null || cost === null || damage === null || firerate === null || range === null) {
        continue;
      }
      /** @type {Record<string, number>} */
      const entry = { level, cost, damage, shotIntervalSeconds: firerate, range };
      if (iAoe >= 0) {
        const aoe = money(row[iAoe]);
        if (aoe !== null && aoe > 0) entry.aoeRadius = aoe;
      }
      if (iSpin >= 0) {
        const spin = money(row[iSpin]);
        if (spin !== null && spin > 0) entry.spinUpSeconds = spin;
      }
      if (iDps >= 0) {
        const pageDps = money(row[iDps]);
        if (pageDps !== null) entry.pageDps = pageDps;
      }
      if (iBurst >= 0) {
        const burst = money(row[iBurst]);
        if (burst !== null && burst > 1) entry.burstCount = burst;
      }
      if (iCooldown >= 0) {
        const reload = money(row[iCooldown]);
        if (reload !== null) entry.reloadSeconds = reload;
      }
      levels.push(entry);
    }
    if (levels.length > 0) return levels;
  }
  return [];
}

/**
 * @param {string} name
 * @returns {{ id: string, displayName: string, url: string, levels: Array<Record<string, number>> }}
 */
export function scrapeTower(name) {
  const url = 'https://tds.fandom.com/wiki/' + encodeURIComponent(name.replace(/ /g, '_'));
  const html = fetchPage(url);
  const levels = extractLevels(html);
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    displayName: name,
    url,
    levels,
  };
}

// Only run the command line when invoked directly. Without this, importing the
// extractor from a check runs the whole scrape as a side effect, which is how a
// test suite ends up quietly making network requests.
const invokedDirectly =
  Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) main();

function main() {
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('usage: node tools/fetch-wiki-stats.mjs <TowerName> [...]');
  process.exit(2);
}

const retrievedAt = new Date().toISOString().slice(0, 10);
const outDir = join(ROOT, 'tools', 'wiki-cache');
mkdirSync(outDir, { recursive: true });

const results = [];
for (const name of args) {
  try {
    const scraped = scrapeTower(name);
    if (scraped.levels.length === 0) {
      console.error('NO TABLE  ' + name + '  (page fetched, no upgrade table matched)');
      continue;
    }
    results.push({ ...scraped, retrievedAt });
    const dps = (l) => (l.shotIntervalSeconds > 0 ? (l.damage / l.shotIntervalSeconds).toFixed(2) : 'n/a');
    console.log(
      'OK  ' + name.padEnd(18) + scraped.levels.length + ' level(s)   base $' +
        scraped.levels[0].cost + '   top DPS ' + dps(scraped.levels[scraped.levels.length - 1]),
    );
  } catch (error) {
    console.error('FAILED    ' + name + ': ' + (error instanceof Error ? error.message : error));
  }
}

// Merged into what is already there, not written over it. Scraping two more towers
// used to throw away every tower scraped before them, and the loss was silent: the
// cache simply came back smaller, and the generator dutifully produced a smaller
// roster from it. Each record keeps the date it was read, so a merged file can still
// say which parts of it are old.
const outPath = join(outDir, 'towers.json');
/** @type {Map<string, any>} */
const merged = new Map();
if (existsSync(outPath)) {
  const previous = JSON.parse(readFileSync(outPath, 'utf8'));
  for (const record of previous.results ?? []) {
    merged.set(record.id, { retrievedAt: previous.retrievedAt, ...record });
  }
}
for (const record of results) merged.set(record.id, record);

const all = [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(outPath, JSON.stringify({ retrievedAt, results: all }, null, 2) + '\n');
console.log('\nwrote ' + results.length + ' tower(s); the cache now holds ' + all.length);
}
