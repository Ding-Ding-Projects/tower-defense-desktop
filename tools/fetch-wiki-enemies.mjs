#!/usr/bin/env node
/**
 * Pull real enemy statistics from the public wiki.
 *
 * Enemies are described by an infobox rather than an upgrade table, so this reads the
 * infobox fields directly: base_hp, speed, cash, hidden, fly, ghost, lead and
 * immunity. Two of those, ghost and lead, are concealment and resistance concepts the
 * simulation did not originally model, and they are captured here rather than
 * discarded so the data does not quietly lose information the source actually has.
 *
 * Every transport lesson from the tower fetcher applies unchanged and is reused from
 * it rather than copied.
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchPage } from './fetch-wiki-stats.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/**
 * @param {string} html
 * @returns {string}
 */
function clean(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_a, code) => String.fromCharCode(Number(code)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Read one infobox field.
 *
 * The value sits in a sibling element after the label, and the distance between them
 * varies by field, so this anchors on the data-source attribute and then takes the
 * first value span after it rather than assuming a fixed shape.
 * @param {string} html
 * @param {string} field
 * @returns {string | null}
 */
export function infoboxField(html, field) {
  const anchor = html.indexOf('data-source="' + field + '"');
  if (anchor < 0) return null;
  // Twenty thousand characters, not four: the value element can contain an inline
  // image whose data URL and lazy-load attributes run to several kilobytes, so a
  // short window never reaches the closing tag and the field reads as absent.
  const window = html.slice(anchor, anchor + 20000);
  const value = window.match(/class="pi-data-value[^"]*"[^>]*>([\s\S]*?)<\/div>/);
  if (!value) return null;
  // Inline style and script elements come out first, and stripping tags turns a
  // stylesheet into several hundred characters of CSS that reads as the field's value.
  // Ghost's Hidden field is exactly this: the page says Yes and carries a template
  // stylesheet in front of it, so the field read as a wall of selectors, `truthy` saw
  // no leading "yes", and the enemy came back as not hidden. Every trait on every
  // enemy in the roster read false, which looked like a roster with no traits rather
  // than a reader that never matched anything -- and because the generator took these
  // from a hand-written list instead, nothing ever compared the two.
  const withoutEmbeds = value[1]
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ');
  const text = clean(withoutEmbeds);
  return text.length > 0 ? text : null;
}

/**
 * @param {string | null} text
 * @returns {number | null}
 */
function firstNumber(text) {
  if (!text) return null;
  const match = text.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

/**
 * @param {string | null} text
 * @returns {boolean}
 */
function truthy(text) {
  if (!text) return false;
  return /^(yes|true)\b/i.test(text.trim());
}

/**
 * @param {string} name
 */
export function scrapeEnemy(name) {
  const url = 'https://tds.fandom.com/wiki/' + encodeURIComponent(name.replace(/ /g, '_'));
  const html = fetchPage(url);
  const immunityText = infoboxField(html, 'immunity');
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    displayName: name,
    url,
    baseHp: firstNumber(infoboxField(html, 'base_hp')),
    speed: firstNumber(infoboxField(html, 'speed')),
    cash: firstNumber(infoboxField(html, 'cash')),
    hidden: truthy(infoboxField(html, 'hidden')),
    flying: truthy(infoboxField(html, 'fly')),
    ghost: truthy(infoboxField(html, 'ghost')),
    lead: truthy(infoboxField(html, 'lead')),
    immunityText,
    spawnedBy: infoboxField(html, 'spawned_by'),
    firstWave: infoboxField(html, 'first_wave_appearance'),
  };
}

const invokedDirectly =
  Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) main();

function main() {
  const names = process.argv.slice(2);
  if (names.length === 0) {
    console.error('usage: node tools/fetch-wiki-enemies.mjs <EnemyName> [...]');
    process.exit(2);
  }

  const retrievedAt = new Date().toISOString().slice(0, 10);
  const results = [];
  for (const name of names) {
    try {
      const enemy = scrapeEnemy(name);
      if (enemy.baseHp === null || enemy.speed === null) {
        console.error(
          'INCOMPLETE ' + name.padEnd(16) +
            'hp=' + enemy.baseHp + ' speed=' + enemy.speed + '  (left out rather than guessed)',
        );
        continue;
      }
      results.push({ ...enemy, retrievedAt });
      console.log(
        'OK  ' + name.padEnd(16) + 'hp ' + String(enemy.baseHp).padStart(7) +
          '  speed ' + String(enemy.speed).padStart(5) +
          '  cash ' + String(enemy.cash ?? '?').padStart(5) +
          (enemy.hidden ? '  hidden' : '') +
          (enemy.flying ? '  flying' : '') +
          (enemy.lead ? '  lead' : '') +
          (enemy.immunityText ? '  immune:' + enemy.immunityText.slice(0, 28) : ''),
      );
    } catch (error) {
      console.error('FAILED    ' + name + ': ' + (error instanceof Error ? error.message : error));
    }
  }

  const outDir = join(ROOT, 'tools', 'wiki-cache');
  mkdirSync(outDir, { recursive: true });
  // Merged into what is already there, not written over it. Scraping one more enemy
  // used to throw away every enemy scraped before it, and the loss was silent: the file
  // simply came back smaller and the generator dutifully produced a smaller roster. The
  // tower cache had this exact defect and had it fixed; this one was missed, and then
  // quietly ate nine freshly-read records the first time a single enemy was re-fetched.
  // Each record keeps the date it was read, so a merged file can still say which parts
  // of it are old.
  const outPath = join(outDir, 'enemies.json');
  /** @type {Map<string, any>} */
  const merged = new Map();
  if (existsSync(outPath)) {
    const previous = JSON.parse(readFileSync(outPath, 'utf8'));
    for (const record of previous.results ?? []) merged.set(record.id, record);
  }
  for (const record of results) merged.set(record.id, record);
  const all = [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));

  writeFileSync(outPath, JSON.stringify({ retrievedAt, results: all }, null, 2) + '\n');
  console.log(
    '\nwrote ' + results.length + ' enemy row(s); the cache now holds ' + all.length,
  );
}
