/**
 * Ties the shipped tower rows back to the infobox evidence they were generated from.
 *
 * This exists because changing every tower's refund from 70 percent to a third moved
 * no test at all. The suite covers the mechanics with a synthetic fixture, which is
 * the right way to check a mechanic, and the consequence is that the real numbers had
 * nothing watching them: they could be corrected, or quietly un-corrected, and every
 * check would stay green either way.
 *
 * So these read the generated rows and the scrape cache and check they still agree.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RAW } from '../../src/data/loader.js';

const attributes = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../tools/wiki-cache/attributes.json', import.meta.url)), 'utf8'),
);
const byId = new Map(attributes.results.map((r) => [r.id, r]));

test('every tower refunds a third of what was spent, and the pages say so', () => {
  // The rule was not assumed: all thirteen pages list a base selling cost exactly
  // equal to a third of the base cost, truncated, with no exceptions. Before this was
  // read, every row shipped at 70 percent, which more than doubled every refund.
  for (const tower of RAW.towers) {
    const listed = byId.get(tower.id);
    assert.ok(listed, tower.id + ' has no infobox record to check against');
    assert.ok(
      Math.abs(tower.sellRefundFraction - 1 / 3) < 1e-12,
      tower.id + ' refunds ' + tower.sellRefundFraction + ', and the sourced rule is a third',
    );
    assert.equal(
      Math.trunc(tower.baseCost * tower.sellRefundFraction),
      listed.baseSell,
      tower.id + ' at $' + tower.baseCost + ' should sell for the listed $' + listed.baseSell,
    );
  }
});

test('the refund fraction survives being multiplied, not just divided', () => {
  // 0.3333 looks like the same number and is not: six of the thirteen towers cost a
  // multiple of three, and for those the tidied decimal truncates a dollar short.
  const tidy = 0.3333;
  const divisibleByThree = RAW.towers.filter((t) => t.baseCost % 3 === 0);
  assert.ok(divisibleByThree.length > 0, 'no tower exercises the case this guards');
  for (const tower of divisibleByThree) {
    assert.equal(
      Math.trunc(tower.baseCost * tower.sellRefundFraction),
      tower.baseCost / 3,
      tower.id + ' must refund exactly a third of $' + tower.baseCost,
    );
    assert.notEqual(
      Math.trunc(tower.baseCost * tidy),
      tower.baseCost / 3,
      tower.id + ' no longer demonstrates the rounding trap, so this check has stopped guarding it',
    );
  }
});

test('detection is per level, and matches the level the page names', () => {
  for (const tower of RAW.towers) {
    const listed = byId.get(tower.id);
    for (const level of tower.levels) {
      const expectedHidden = !listed.hidden.never && listed.hidden.fromLevel != null
        ? level.level >= listed.hidden.fromLevel
        : false;
      const expectedAir = !listed.flying.never && listed.flying.fromLevel != null
        ? level.level >= listed.flying.fromLevel
        : false;
      assert.equal(
        level.detectsHidden, expectedHidden,
        tower.id + ' level ' + level.level + ' hidden detection disagrees with "' + listed.hidden.raw + '"',
      );
      assert.equal(
        level.hitsAir, expectedAir,
        tower.id + ' level ' + level.level + ' flying detection disagrees with "' + listed.flying.raw + '"',
      );
    }
  }
});

test('the towers the old hand-written overlay got backwards stay corrected', () => {
  // Named individually on purpose. A rule-shaped check passes happily when a whole
  // tower disappears; these four were each wrong in a specific direction, and each is
  // pinned in that direction.
  const get = (id) => RAW.towers.find((t) => t.id === id);

  // Was marked as a hidden detector. It is not one at any level.
  assert.ok(get('ranger').levels.every((l) => !l.detectsHidden), 'ranger sees no hidden enemies');
  // Was marked as hitting flying enemies. It does not, at any level.
  assert.ok(get('turret').levels.every((l) => !l.hitsAir), 'turret cannot shoot flying enemies');
  // Was marked as not hitting flying enemies. It does, from the moment it is placed.
  assert.ok(get('sniper').levels.every((l) => l.hitsAir), 'sniper hits flying enemies from level 0');
  // Was marked as blind. It sees, but only from level 2.
  const scout = get('scout');
  assert.equal(scout.levels.find((l) => l.level === 1).detectsHidden, false);
  assert.equal(scout.levels.find((l) => l.level === 2).detectsHidden, true);
});

test('footprints come off the page, not from a default', () => {
  // Three towers are not the 1.5 the overlay gave everything, and a tower's footprint
  // decides what can be placed beside it.
  const sizes = new Map(RAW.towers.map((t) => [t.id, t.footprintRadius]));
  assert.equal(sizes.get('shotgunner'), 1);
  assert.equal(sizes.get('sniper'), 1.25);
  assert.equal(sizes.get('cowboy'), 1.25);
  assert.equal(sizes.get('turret'), 2);
  for (const tower of RAW.towers) {
    assert.equal(
      tower.footprintRadius, byId.get(tower.id).footprint,
      tower.id + ' footprint disagrees with its page',
    );
  }
});

const towerTables = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../tools/wiki-cache/towers.json', import.meta.url)), 'utf8'),
);
const tableById = new Map(towerTables.results.map((r) => [r.id, r]));

test('every shipped level reproduces the damage per second its page states', () => {
  // The source computes this column itself, which makes it the one piece of arithmetic
  // available to check the transcription against rather than against itself. It has
  // already caught two errors that produced entirely reasonable-looking numbers:
  // reading the rate column as a rate instead of a cooldown, which inverts every tower,
  // and ignoring a salvo's projectile count, which quartered Rocketeer's top level.
  // Named individually, with the reason, because "it did not match so it was excluded"
  // is how a cross-check quietly stops checking anything.
  //
  // Cowboy publishes 2.57 at level 0 from 3 damage on a 1 second interval, and 3 / 1 is
  // 3.00. Its table also carries a 2 second wind-up and a cash shot every 6, and the
  // published figure fits neither a magazine of 6 with the wind-up as its reload (2.25)
  // nor the wind-up amortised over any consistent number of shots: solving for the
  // implied extra time per magazine gives 1, 0.35, 0.35, 0.4, 0.65 and 0.65 seconds
  // across the six levels against listed wind-ups of 2, 1.25, 1.25, 1, 1 and 1. Its
  // wind-up is recorded as sourced data either way; what is not claimed is that the
  // simulation reproduces a published figure nobody has been able to derive.
  const UNDERIVABLE = new Map([
    ['cowboy', 'its published figure folds in a wind-up by a rule the table does not state'],
  ]);

  let checked = 0;
  for (const tower of RAW.towers) {
    if (UNDERIVABLE.has(tower.id)) continue;
    const table = tableById.get(tower.id);
    assert.ok(table, tower.id + ' has no scrape record to check against');
    for (const level of tower.levels) {
      const scraped = table.levels.find((l) => l.level === level.level);
      // Freezer and Ranger publish no such column; nothing to check, and nothing to
      // pretend was checked.
      if (!scraped || scraped.pageDps == null) continue;

      const shots = level.burstCount && level.burstCount > 1 ? level.burstCount : 1;
      // A damage-over-time the tower applies counts toward the published figure. It is
      // what makes Freezer read 19 where its direct damage alone is 16, and it was
      // invisible until footnote markers stopped being read as part of the number.
      const overTime = level.statusDamagePerTick
        ? level.statusDamagePerTick / (scraped.statusTickSeconds ?? 1)
        : 0;
      // Every shot is followed by its own interval, and the reload comes on top of the
      // last one. Counting only the gaps BETWEEN shots makes the cycle one gap short,
      // which is exactly the error this check found in the simulation itself.
      const cycleSeconds = shots > 1
        ? shots / level.fireRate + (level.reloadSeconds ?? 0)
        : 1 / level.fireRate;
      // A separate splash figure is counted once alongside the direct hit, which is how
      // the source computes it: Ranger's top level deals 875 to what it hit and 375
      // around it, and both over the same 8 second interval make its published 156.25.
      const perShot = level.damage + (level.splashDamage ?? 0);
      const dps = (perShot * shots) / cycleSeconds + overTime;

      // A tenth of a percent, to absorb the four decimal places the rate is rounded to
      // and nothing wider. Every class of error this has caught was off by a factor,
      // not by a rounding.
      const tolerance = Math.max(0.02, scraped.pageDps * 0.001);
      assert.ok(
        Math.abs(dps - scraped.pageDps) <= tolerance,
        tower.id + ' level ' + level.level + ' works out to ' + dps.toFixed(2) +
          ' damage per second, and its page states ' + scraped.pageDps,
      );
      checked += 1;
    }
  }
  assert.ok(checked >= 60, 'only ' + checked + ' levels were actually checked; the cross-check has gone hollow');

  // The excluded towers still have to exist and still have to carry the field that
  // earned them the exclusion. Otherwise the exclusion list outlives its reason and
  // becomes a place to quietly put anything inconvenient.
  for (const [id, reason] of UNDERIVABLE) {
    const tower = RAW.towers.find((t) => t.id === id);
    assert.ok(tower, id + ' is excluded from the cross-check but is not in the roster');
    assert.ok(
      tower.levels.some((l) => l.spinUpSeconds > 0),
      id + ' is excluded because ' + reason + ', but no level carries a wind-up any more',
    );
  }
});

test('the farm earns rather than shoots, and its income is the page figure', () => {
  // The first tower in the roster that deals no damage at all. It is a data row like
  // any other, but only once the scraper reads the right column: its table has no
  // damage, rate or range column, so the main extractor passed straight over it and
  // reported the page as having no statistics at all.
  const farm = RAW.towers.find((t) => t.id === 'farm');
  assert.ok(farm, 'the farm is not in the roster');

  for (const level of farm.levels) {
    assert.equal(level.damage, 0, 'a farm deals no damage');
    assert.equal(level.fireRate, 0, 'and never fires');
    assert.equal(level.range, 0, 'and never acquires a target');
    assert.ok(level.incomePerWave > 0, 'level ' + level.level + ' earns nothing, so it does nothing at all');
  }

  // The exact figures off the page, so a silently rescaled economy turns this red.
  assert.equal(farm.baseCost, 300);
  assert.deepEqual(
    farm.levels.map((l) => l.incomePerWave),
    [60, 100, 225, 500, 900, 1500],
  );
  // It competes with other farms for slots, not with the guns.
  assert.equal(farm.placementPool, 'economy');
  assert.equal(farm.maxCount, 8);
});
