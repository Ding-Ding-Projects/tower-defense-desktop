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
  // Footnote markers are stripped from cells as well as headers. The page writes a
  // referenced figure as "20.68 [ 3 ]", which is not a number, so the cell was rejected
  // and whatever depended on it silently went missing -- for Ace Pilot that was every
  // published damage-per-second value on the page, and with it the only independent
  // check on the transcription.
  const cleaned = String(value).replace(/\[\s*\d+\s*\]/g, '').replace(/[$,\s]/g, '');
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

/**
 * Which row actually carries the column names.
 *
 * Looked for rather than assumed, and bounded to the first few rows so a data row that
 * happens to contain the word cannot be mistaken for a header.
 *
 * @param {string[][]} rows
 * @returns {number} the row index, or -1
 */
function findHeaderRow(rows) {
  const limit = Math.min(rows.length, 4);
  for (let i = 0; i < limit; i += 1) {
    const cells = rows[i].map(normaliseHeader);
    if (cells.includes('level') && cells.includes('cost')) return i;
  }
  return -1;
}

/**
 * The captions of any statistics tables describing a branching upgrade path.
 *
 * `extractLevels` stops at the first table that yields anything, which is right for a
 * page with one subject and quietly wrong for a page without. Pursuit carries six
 * statistics tables: a neutral block for levels 0 to 3, then a Top Path and a Bottom
 * Path block that each claim their own levels 4 and 5, and then that whole set again.
 * Read first-table-wins, that tower comes back as an ordinary four-level tower, and
 * nothing anywhere says the other two thirds of it were dropped.
 *
 * Counting the tables does not separate that from the ordinary case, because plenty of
 * unambiguous pages carry two: most towers print their own table and then their Golden
 * variant's, and the generator's infobox cost cross-check already refuses a row that
 * read the wrong one. Comparing the tables' numbers does not separate it either, for
 * the same reason -- a Golden variant disagrees with its base tower at every level, by
 * design.
 *
 * What does separate it is that the source says so itself. A tower with branching
 * upgrades captions its tables "Top Path Stats" and "Bottom Path Stats", and across
 * every page read so far exactly one tower does: Pursuit. So this reports the source's
 * own words rather than inferring the structure from the numbers, and the generator
 * refuses a row whose page claims paths the engine has no way to represent.
 *
 * @param {string} html
 * @returns {string[]}  the captions naming a path, in page order
 */
export function branchingPathCaptions(html) {
  const tables = html.match(/<table[\s\S]*?<\/table>/g) || [];
  const captions = [];
  for (const table of tables) {
    const rows = tableToRows(table).filter((r) => r.length > 0);
    if (rows.length < 2) continue;
    const headerRow = findHeaderRow(rows);
    // A caption is the spanning row ABOVE the header, so a table whose header is row
    // zero has none and cannot be making a claim about paths either way.
    if (headerRow < 1) continue;
    const caption = rows[headerRow - 1].join(' ').trim();
    if (/\bpath\b/i.test(caption)) captions.push(caption);
  }
  return captions;
}

export function extractLevels(html, options = {}) {
  const tables = html.match(/<table[\s\S]*?<\/table>/g) || [];
  /** @type {Array<Array<Record<string, number>>>} */
  const everyTable = [];
  for (const table of tables) {
    const rows = tableToRows(table).filter((r) => r.length > 0);
    if (rows.length < 2) continue;
    // The header is not always the first row. Several pages open their statistics table
    // with a single spanning cell -- "Commander Stats" -- so row zero is one cell, the
    // column check found no Level column, and the whole table was skipped. The page then
    // looked to every downstream step like a page with no statistics on it at all, which
    // is exactly what was reported about those two for weeks.
    const headerRow = findHeaderRow(rows);
    if (headerRow < 0) continue;
    const header = rows[headerRow].map(normaliseHeader);
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
    // "Normal Damage" before "Splash Damage", because a page carrying both is a tower
    // whose ordinary attack is the normal one and whose splash is a secondary. Taking
    // the splash column first read Ace Pilot's bomb as its whole output AND dropped its
    // first two levels, where the bomb does not exist yet and the cell says N/A.
    const iDamage = firstCol('damage', 'normal damage', 'splash damage');
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

    // The damage a critical hit deals, taken as its own figure rather than computed
    // from the multiplier beside it. At Warden's level 2 the listed crit is 23 where
    // 15 times 1.5 is 22.5, and it is the 23 that reproduces the published rate.
    const iCrit = col('critical damage');

    // A burn, chill or similar damage-over-time the tower applies. The published
    // damage-per-second folds it in, which is how Freezer reads 19 where its direct
    // damage alone is 16: the missing 3 is exactly its chill.
    const iDot = firstCol('chill damage', 'burn damage');

    // A splash figure SEPARATE from the direct damage, which only appears on a page that
    // lists both. Where the splash column IS the damage column -- Demoman, Mortar -- the
    // alias list above already picked it up as `damage` and there is nothing distinct.
    const iSplash = iDamage >= 0 && header[iDamage] !== 'splash damage'
      ? col('splash damage')
      : -1;

    // A second weapon on its own clock. Where a page carries a splash figure AND a
    // cooldown of its own for it, the two together describe a bomb rather than a blast
    // around the ordinary shot, and the published damage per second adds them.
    const iSecondaryCooldown = col('bomb cooldown');
    const iTick = col('tick');

    const levels = [];
    for (const row of rows.slice(headerRow + 1)) {
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
      if (iSplash >= 0) {
        const splash = money(row[iSplash]);
        const bombCooldown = iSecondaryCooldown >= 0 ? money(row[iSecondaryCooldown]) : null;
        if (splash !== null && splash > 0 && bombCooldown !== null && bombCooldown > 0) {
          // Its own cooldown makes it a separate weapon, not a blast around the shot.
          entry.secondaryDamage = splash;
          entry.secondaryCooldownSeconds = bombCooldown;
          if (iAoe >= 0) {
            const blast = money(row[iAoe]);
            if (blast !== null && blast > 0) entry.secondaryAoeRadius = blast;
          }
        } else if (splash !== null && splash > 0) {
          entry.splashDamage = splash;
        }
      }
      if (iDot >= 0) {
        const dot = money(row[iDot]);
        // The tick column is the gap between burn ticks in seconds; the figure the
        // simulation wants is per tick, which is what the column already gives.
        if (dot !== null && dot > 0) {
          entry.statusDamagePerTick = dot;
          const tick = iTick >= 0 ? money(row[iTick]) : null;
          if (tick !== null && tick > 0) entry.statusTickSeconds = tick;
        }
      }
      if (iCrit >= 0) {
        const crit = money(row[iCrit]);
        if (crit !== null && crit > 0) entry.critDamage = crit;
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
    if (levels.length > 0) {
      if (!options.allTables) return levels;
      everyTable.push(levels);
    }
  }
  return options.allTables ? /** @type {any} */ (everyTable) : [];
}

/**
 * Read a support tower's table: the ones that earn money rather than deal damage.
 *
 * Farm has no damage column, no rate column and no range column, so the main extractor
 * passes straight over its table and reports the page as having none. That reads like a
 * missing source and is really a different KIND of tower: the engine already carries
 * `incomePerWave`, so a farm is a data row like any other once somebody reads the right
 * column.
 *
 * @param {string} html
 * @returns {Array<Record<string, number>>}
 */
export function extractIncomeLevels(html) {
  const tables = html.match(/<table[\s\S]*?<\/table>/g) || [];
  for (const table of tables) {
    const rows = tableToRows(table).filter((r) => r.length > 0);
    if (rows.length < 2) continue;
    const headerRow = findHeaderRow(rows);
    if (headerRow < 0) continue;
    const header = rows[headerRow].map(normaliseHeader);
    const iLevel = header.indexOf('level');
    const iCost = header.indexOf('cost');
    const iIncome = header.indexOf('income');
    if (iLevel < 0 || iCost < 0 || iIncome < 0) continue;

    const levels = [];
    for (const row of rows.slice(headerRow + 1)) {
      const level = money(row[iLevel]);
      const cost = money(row[iCost]);
      const income = money(row[iIncome]);
      if (level === null || cost === null || income === null) continue;
      levels.push({ level, cost, incomePerWave: income });
    }
    if (levels.length > 0) return levels;
  }
  return [];
}

/**
 * @param {string} name
 * @returns {{ id: string, displayName: string, url: string, kind: string,
 *   levels: Array<Record<string, number>>, branchingPathCaptions: string[] }}
 */
export function scrapeTower(name) {
  const url = 'https://tds.fandom.com/wiki/' + encodeURIComponent(name.replace(/ /g, '_'));
  const html = fetchPage(url);
  let kind = 'attack';
  let levels = extractLevels(html);
  if (levels.length === 0) {
    // Falls back rather than giving up. A page with no damage table is not necessarily
    // a page with no statistics; it may simply be a tower that does not shoot.
    const income = extractIncomeLevels(html);
    if (income.length > 0) {
      levels = income;
      kind = 'income';
    }
  }
  return {
    kind,
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    displayName: name,
    url,
    levels,
    branchingPathCaptions: branchingPathCaptions(html),
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
