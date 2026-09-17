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
    // Fallen Comet is transcribed from the Abilities section of the same page the rest
    // of this enemy comes from: "Cooldown: 45 / Fallen Comet - ... stunning towers for
    // 5 seconds and dealing 50 damage to units with no range limit for the ability."
    // No radius is the page's own phrasing, and means the whole map here.
    //
    // It replaces an invented shieldPhase that granted 25,000 shield at half health,
    // which appears nowhere in the source. The page's fourth ability is Bone Armor,
    // which grows the boss's DEFENSE as its health drops, and the simulation has flat
    // defense with no way to raise it mid-life -- so the invention was not even
    // standing in for the right mechanic.
    //
    // The summon stays an engine value and still says so. The page's two real summons
    // call up Necrotic Skeletons and a one-off wave of forty Possessed Armor, Corrupted
    // Fallen, Fallen Hero, Fallen Giant and Fallen Necromancer, none of which are in
    // the shipped roster, so a faithful version has nothing to summon yet.
    sourcedAbilities: 'Fallen Comet read from the page: 45s cooldown, stuns every tower for 5 seconds, no range limit',
    abilities: [
      { kind: 'summon', cooldownSeconds: 10, summonEnemyId: 'normal', count: 4 },
      { kind: 'stun', cooldownSeconds: 45, durationSeconds: 5 },
    ],
  },
  'fallen-swordmaster': {
    leak: 30, boss: true, immunities: ['stun'],
    // The threshold is the page's own number, not a guess. Its fourth ability: "Refusing
    // Will - After its health drops below 75,000 health, the Fallen Swordmaster begins to
    // pant, giving it immunity to all damage. After it is done panting, it will
    // immediately perform its Spike Summon move. It also starts moving faster." Its
    // infobox says 150,000 health, so 75,000 is exactly half, and the shipped 0.35 was
    // somebody's estimate of a figure the page states outright.
    //
    // "It also starts moving faster" is the part the engine can express. The panting
    // immunity to all damage is not: nothing here can make an enemy untargetable for a
    // while. The duration is an engine value because the page gives none.
    sourcedAbilities: 'Refusing Will triggers below 75,000 of its 150,000 health, read from the page; its speed phase stands in for the "starts moving faster" half of that ability, and its duration remains an engine value',
    abilities: [{ kind: 'speedPhase', cooldownSeconds: 999, durationSeconds: 8, hpThreshold: 0.5 }],
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
  // The hand-set values are kept as a second reading rather than deleted. Where somebody
  // wrote one down, it has to agree with the page; if the two disagree, one of them is
  // stale and a row built from them would mix a trait from one reading with a number
  // from the other. Ghost is the only enemy with a hand-set trait, and it is the exact
  // one whose page reading was broken, so the two agreeing is the proof that the reader
  // is fixed rather than merely returning something.
  const disagreements = ['hidden', 'flying']
    .filter((trait) => traits[trait] !== undefined)
    .filter((trait) => traits[trait] !== (scraped[trait] === true))
    .map((trait) => 'hand-set ' + trait + '=' + traits[trait] + ', the page says ' + scraped[trait]);
  if (disagreements.length > 0) {
    // Collected and checked outside the loop on purpose. Written as a loop with a
    // `continue` inside it, this reported the disagreement and then wrote the row
    // anyway, because the continue belonged to the inner loop: a guard that prints a
    // complaint and lets the thing through is worse than no guard, since the complaint
    // reads as if something was stopped.
    skipped.push(
      scraped.id + ' (' + disagreements.join('; ') + '; one of the two readings is stale)',
    );
    continue;
  }

  const source = {
    wikiUrl: scraped.url,
    retrievedAt: scraped.retrievedAt ?? cache.retrievedAt,
    notes:
      'health, speed, reward, concealment and flight read from the infobox. Leak damage ' +
      'and abilities are engine values, not sourced: see docs/data-sources.md.' +
      (traits.sourcedAbilities ? ' Except: ' + traits.sourcedAbilities + '.' : ''),
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
    // Read from the page rather than hand-set. Both of these were engine defaults for
    // the whole roster, which meant every enemy was not hidden and not flying because
    // nobody had said otherwise, not because the source had. The scrape reads both
    // fields, and its answers were being thrown away: Ghost's page says Yes and the
    // reader returned a wall of CSS, so every trait on every enemy came back false.
    hidden: scraped.hidden === true,
    flying: scraped.flying === true,
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
