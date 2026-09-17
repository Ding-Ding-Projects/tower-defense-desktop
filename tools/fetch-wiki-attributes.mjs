#!/usr/bin/env node
/**
 * Pull the per-tower attributes that live in the page infobox rather than in the
 * upgrade table.
 *
 * The upgrade table carries damage, rate, range and cost. Everything else a tower row
 * needs — whether it sees hidden enemies, whether it can shoot flying ones, how much
 * space it takes, what it refunds when sold — sits in the infobox beside the picture,
 * and until now every one of those was hand-written into an overlay as somebody's best
 * recollection. This reads them instead.
 *
 * Two things the infobox turned out to say that the overlay could not express:
 *
 * 1. Hidden detection is PER LEVEL, not a property of the tower. Demoman reads
 *    "Level 2+", meaning it is blind at levels 0 and 1 and sees from 2 upward. A single
 *    boolean per tower is simply the wrong shape, and the schema already has the right
 *    one, because `detectsHidden` sits on the level rather than on the tower.
 * 2. The refund is a third of what was spent, not the 70 percent every row currently
 *    carries as an engine default. Demoman costs $575 and lists a base selling cost of
 *    $191, and 575 / 3 truncates to exactly 191.
 *
 * Parsing note: the values are read by tokenising on tag boundaries and taking the
 * token after the label, rather than by a regular expression. The escaping needed to
 * match a literal pipe survives neither this shell nor a heredoc, and a regex that
 * silently matches nothing here reads exactly like a page that has no infobox.
 *
 * Usage:  node tools/fetch-wiki-attributes.mjs Scout Demoman "Ace Pilot"
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchPage } from './fetch-wiki-stats.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
/**
 * The boundary a tag is replaced with before splitting.
 *
 * Built with fromCharCode rather than written as an escape in a string literal. The
 * escape did not survive being written to disk: it landed as a real NUL byte, which
 * works perfectly and quietly turns this file into a binary blob as far as Git is
 * concerned, so its diffs stop being readable. A character that cannot appear in page
 * text is still the right separator; it just has to be spelled where a byte cannot
 * take its place.
 */
const TOKEN_SEPARATOR = String.fromCharCode(0);

/**
 * Reduce a page to a flat list of visible text tokens, in document order.
 * @param {string} html
 * @returns {string[]}
 */
export function tokenise(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, TOKEN_SEPARATOR)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_all, code) => String.fromCharCode(Number(code)))
    .split(TOKEN_SEPARATOR)
    .map((piece) => piece.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/**
 * The value that follows an exactly-matching label token.
 * @param {string[]} tokens
 * @param {string} label
 * @returns {string|null}
 */
export function fieldAfter(tokens, label) {
  const index = tokens.indexOf(label);
  if (index < 0 || index + 1 >= tokens.length) return null;
  return tokens[index + 1];
}

/**
 * Read a detection field into the first level at which it becomes true.
 *
 * "Level 2+" means blind below 2. "N/A" means never. A bare "Level 0+" means always.
 * Anything else is returned as unread rather than guessed at, because the whole point
 * of reading these is to stop inventing them.
 *
 * @param {string|null} raw
 * @returns {{ fromLevel: number|null, never: boolean, raw: string|null }}
 */
export function parseDetection(raw) {
  if (raw == null) return { fromLevel: null, never: false, raw };
  const text = raw.trim();
  if (/^n\/?a$/i.test(text) || /^none$/i.test(text) || /^no$/i.test(text)) {
    return { fromLevel: null, never: true, raw: text };
  }
  const match = text.match(/^Level\s+(\d+)\s*\+?$/i);
  if (match) return { fromLevel: Number(match[1]), never: false, raw: text };
  if (/^yes$/i.test(text)) return { fromLevel: 0, never: false, raw: text };
  return { fromLevel: null, never: false, raw: text };
}

/**
 * "Average (1.5)" -> 1.5. The word is a category; the number is the thing.
 * @param {string|null} raw
 * @returns {number|null}
 */
export function parseFootprint(raw) {
  if (raw == null) return null;
  const match = raw.match(/\(([\d.]+)\)/);
  return match ? Number(match[1]) : null;
}

/**
 * @param {string|null} raw
 * @returns {number|null}
 */
export function parseMoney(raw) {
  if (raw == null) return null;
  const cleaned = raw.replace(/[$,\s]/g, '');
  return /^\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : null;
}

/**
 * @param {string} name
 * @returns {object}
 */
export function scrapeAttributes(name) {
  const url = 'https://tds.fandom.com/wiki/' + encodeURIComponent(name.replace(/ /g, '_'));

  // fetchPage owns the page cache. This used to keep a second one of its own, which
  // happened to agree with it and would not have stayed that way: two caches for one
  // set of pages is one cache and one thing that goes stale unnoticed.
  const html = fetchPage(url);
  const tokens = tokenise(html);
  const baseCost = parseMoney(fieldAfter(tokens, 'Base Cost'));
  const baseSell = parseMoney(fieldAfter(tokens, 'Base Selling Cost'));

  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    displayName: name,
    url,
    hidden: parseDetection(fieldAfter(tokens, 'Hidden Detection')),
    flying: parseDetection(fieldAfter(tokens, 'Flying Detection')),
    lead: parseDetection(fieldAfter(tokens, 'Lead Detection')),
    footprint: parseFootprint(fieldAfter(tokens, 'Placement Footprint')),
    footprintRaw: fieldAfter(tokens, 'Placement Footprint'),
    baseCost,
    baseSell,
    // Reported rather than rounded to something tidy. If the ratio is not the same
    // across the roster, that is a fact about the source worth seeing, not noise to
    // average away.
    refundRatio: baseCost && baseSell ? Number((baseSell / baseCost).toFixed(4)) : null,
    immunities: fieldAfter(tokens, 'Immunities'),
    terrain: terrainFromCategories(html),
  };
}

/**
 * Where a tower may be placed, read from the page's own categories.
 *
 * The infobox does not carry this and the prose only sometimes mentions it -- Ranger's
 * tooltip calls it "an expensive cliff tower" and Mortar's says nothing at all -- but
 * the wiki files every tower under a placement category, and that is structured enough
 * to read without guessing. Ranger, Mortar and Sniper are filed under Cliff; Gatling Gun
 * is filed under both Ground and Cliff.
 *
 * This was hand-written as `ground` for all twenty towers, which put four of them on the
 * wrong terrain and left every cliff zone on both shipped maps permanently unbuildable.
 *
 * @param {string} html
 * @returns {string[]}  lowercase terrain names, in a stable order
 */
export function terrainFromCategories(html) {
  const KNOWN = ['ground', 'cliff', 'water'];
  const categories = new Set(
    [...html.matchAll(/\/wiki\/Category:([A-Za-z0-9_%()-]+)/g)]
      .map((m) => decodeURIComponent(m[1]).replace(/_/g, ' ').toLowerCase()),
  );
  // Ordered by the KNOWN list rather than by what the page happened to mention, so two
  // towers with the same placement always produce the same array.
  return KNOWN.filter((t) => categories.has(t));
}

const invokedDirectly =
  Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) main();

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('usage: node tools/fetch-wiki-attributes.mjs <TowerName> [...]');
    process.exit(2);
  }

  const results = [];
  for (const name of args) {
    try {
      const attributes = scrapeAttributes(name);
      results.push(attributes);
      const third = attributes.baseCost == null ? null : Math.trunc(attributes.baseCost / 3);
      console.log(
        name.padEnd(16) +
          ' hidden=' + String(attributes.hidden.raw).padEnd(10) +
          ' flying=' + String(attributes.flying.raw).padEnd(10) +
          ' foot=' + String(attributes.footprint).padEnd(6) +
          ' cost=' + String(attributes.baseCost).padEnd(8) +
          ' sell=' + String(attributes.baseSell).padEnd(8) +
          ' ratio=' + String(attributes.refundRatio).padEnd(8) +
          ' cost/3=' + third,
      );
    } catch (error) {
      console.log(name.padEnd(16) + ' FAILED: ' + (error instanceof Error ? error.message : error));
    }
  }

  const outPath = join(ROOT, 'tools', 'wiki-cache', 'attributes.json');

  // Merged into what is already there, not written over it. Re-reading one tower used
  // to discard the other sixteen records, silently, and the only sign was the next
  // generator run refusing most of the roster for want of an infobox it had read an
  // hour earlier. Each record carries the date it was read, so a merged file can still
  // say which parts of it are old.
  const retrievedAt = new Date().toISOString().slice(0, 10);
  /** @type {Map<string, any>} */
  const merged = new Map();
  if (existsSync(outPath)) {
    const previous = JSON.parse(readFileSync(outPath, 'utf8'));
    for (const record of previous.results ?? []) {
      merged.set(record.id, { retrievedAt: previous.retrievedAt, ...record });
    }
  }
  for (const record of results) merged.set(record.id, { ...record, retrievedAt });

  const all = [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));
  writeFileSync(outPath, JSON.stringify({ retrievedAt, results: all }, null, 2) + '\n');
  console.log(
    '\nwrote ' + results.length + ' attribute record(s); the cache now holds ' + all.length,
  );
}
