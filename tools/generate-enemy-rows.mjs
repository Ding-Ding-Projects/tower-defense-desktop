#!/usr/bin/env node
/**
 * Turn the scraped enemy cache into validated data rows.
 *
 * Health, speed and reward come straight from the infobox and carry its URL and
 * retrieval date. Everything else does not, and says so.
 *
 * In particular the concealment and resistance flags are NOT taken from the scrape.
 * The infobox represents them with an icon rather than the word yes, so the scraper
 * read every enemy as visible and grounded, which would have been a plausible-looking
 * lie: a hidden wave would have walked straight into a tower that should not be able
 * to see it, and nothing would have failed. They are hand-set below and the gap is
 * recorded in docs/data-sources.md as unresolved.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/** Hand-set traits, because the scrape cannot read them reliably. */
const TRAITS = {
  normal: { leak: 1, boss: false },
  speedy: { leak: 1, boss: false },
  slow: { leak: 2, boss: false },
  quick: { leak: 1, boss: false },
  slime: { leak: 3, boss: false },
  molten: { leak: 2, boss: false },
  ghost: { leak: 1, boss: false, hidden: true },
  'molten-boss': {
    leak: 25, boss: true, immunities: ['stun'],
    abilities: [{ kind: 'summon', cooldownSeconds: 12, summonEnemyId: 'molten', count: 3 }],
  },
  'fallen-king': {
    leak: 50, boss: true, immunities: ['stun', 'freeze'],
    abilities: [
      { kind: 'summon', cooldownSeconds: 10, summonEnemyId: 'normal', count: 4 },
      { kind: 'shieldPhase', cooldownSeconds: 999, magnitude: 25000, hpThreshold: 0.5 },
    ],
  },
  'fallen-swordmaster': {
    leak: 30, boss: true, immunities: ['stun'],
    abilities: [{ kind: 'speedPhase', cooldownSeconds: 999, durationSeconds: 8, hpThreshold: 0.35 }],
  },
};

const cache = JSON.parse(readFileSync(join(ROOT, 'tools', 'wiki-cache', 'enemies.json'), 'utf8'));
const outDir = join(ROOT, 'src', 'data', 'enemies');
mkdirSync(outDir, { recursive: true });

const written = [];
const skipped = [];

for (const scraped of cache.results) {
  const traits = TRAITS[scraped.id];
  if (!traits) {
    skipped.push(scraped.id + ' (no hand-set traits, so its concealment and leak damage are unknown)');
    continue;
  }
  const source = {
    wikiUrl: scraped.url,
    retrievedAt: scraped.retrievedAt ?? cache.retrievedAt,
    notes:
      'health, speed and reward read from the infobox. Concealment, flight, leak damage ' +
      'and abilities are engine values, not sourced: see docs/data-sources.md.',
  };
  const row = {
    id: scraped.id,
    displayName: scraped.displayName,
    maxHp: scraped.baseHp,
    shieldHp: 0,
    defense: 0,
    speed: scraped.speed,
    leakDamage: traits.leak,
    killReward: scraped.cash ?? 0,
    hidden: traits.hidden === true,
    flying: traits.flying === true,
    boss: traits.boss === true,
    immunities: traits.immunities ?? [],
    abilities: traits.abilities ?? [],
    source,
  };
  writeFileSync(join(outDir, scraped.id + '.json'), JSON.stringify(row, null, 2) + '\n');
  written.push(scraped.id);
}

console.log('wrote ' + written.length + ' enemy row(s): ' + written.join(', '));
if (skipped.length > 0) {
  console.log('\nskipped, and recorded as pending rather than guessed:');
  for (const entry of skipped) console.log('  - ' + entry);
}

const invokedDirectly =
  Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (!invokedDirectly) throw new Error('this script is a command line, not a library');
