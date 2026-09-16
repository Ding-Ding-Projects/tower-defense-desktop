#!/usr/bin/env node
/**
 * Build the wave tables so the game can actually be finished.
 *
 * The hand-authored tables could not be. A headless playthrough with an ordinary
 * strategy lost on wave 8 or 9 on every map and every difficulty, and the reason was
 * arithmetic rather than tactics: the whole ten-wave arc paid out about 12,000 cash,
 * the best tower in the roster converts cash into damage at roughly 6 damage per second
 * per 1,000 spent, and wave 10 alone carried 56,864 health. That is a finale needing
 * something like twenty times the damage the entire game had funded.
 *
 * Enemy health and kill rewards are wiki figures and are not ours to move. What IS ours
 * is which enemies turn up, how many, and what a wave pays on completion.
 *
 * One approach was tried and abandoned, recorded here so it is not tried again: deriving
 * the wave load from the cash earned so far. The economy compounds, so the budget
 * compounds, and since the heaviest non-boss enemy carries 350 health the only way to
 * express a compounding budget is hundreds of enemies per wave and completion bonuses in
 * the millions. A curve has to be expressible by the pieces on the board, and these
 * pieces cap out. So the curve is set directly, the economy is set to fund it, and
 * tools/playthrough-probe.mjs is what decides whether the pair works. A curve nobody has
 * played is a guess with arithmetic on it.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/** Wave 1's load, in reference-speed health, and how fast that climbs. */
const FIRST_WAVE_EFFORT = 26;
// Gentler than it looks, and chosen for where it ENDS rather than how it feels early.
// The wiki bosses carry 70,000 to 250,000 health, which is a scale a twenty-wave arc
// simply never reaches: at a steeper growth the curve overshoots into crowds of
// hundreds long before it reaches boss scale, and at this one it arrives there at
// roughly the right time.
const EFFORT_GROWTH = 1.198;

/**
 * How much harder a difficulty's curve is, derived from its own health multiplier.
 *
 * Without this the ladder came out INVERTED: every difficulty got the same effort
 * curve, so a harder one met the same total challenge with fewer, tougher enemies
 * while starting with more cash, and a playthrough finished intermediate with more
 * lives left than easy. A difficulty that only changes what the enemies look like is
 * not a difficulty.
 *
 * The exponent is below 1 on purpose. Hardcore multiplies health by six, and asking
 * for six times the effort on top of six times the health per enemy compounds into a
 * wall nothing could climb; this asks for about 2.8 times, which is a harder game
 * rather than a different one.
 *
 * @param {number} hpMultiplier
 */
function effortScaleFor(hpMultiplier) {
  return Math.pow(hpMultiplier, 0.62);
}

/** How much of its wave's budget a boss is allowed to be. */
const BOSS_SHARE_OF_WAVE = 1.6;

/** No wave becomes a puzzle about sheer count. */
const MAX_ENEMIES_PER_WAVE = 45;

/**
 * Cash paid per point of wave effort, over and above the wiki kill rewards.
 *
 * Kill rewards alone cannot fund the curve, and two of the three bosses pay nothing at
 * all, so the completion bonus is what keeps the economy level with the difficulty.
 */
const CASH_PER_EFFORT = 2.6;

/**
 * The speed the effort curve is quoted at. A slower enemy sits in a tower's range
 * proportionally longer, so it is proportionally less demanding per point of health;
 * that is the entire reason a boss is killable, and averaging it away makes every boss
 * look impossible on paper.
 */
const REFERENCE_SPEED = 2.7;

const MAPS = ['crossroads', 'riverbend'];
// Forty, because that is what the roster's own numbers ask for. The source game these
// statistics come from runs a long arc, and its bosses are sized for it; compressing
// them into ten waves is what produced a finale needing twenty times the damage the
// whole game had funded.
const WAVE_COUNT = 40;
const DIFFICULTY_IDS = ['easy', 'casual', 'intermediate', 'molten', 'fallen', 'hardcore'];

/** Read the committed rows directly; this script must never invent an enemy stat. */
function loadRows(kind, ids) {
  return ids.map((id) => JSON.parse(readFileSync(join(ROOT, 'src', 'data', kind, id + '.json'), 'utf8')));
}

const ENEMY_IDS = [
  'normal', 'speedy', 'quick', 'slow', 'ghost', 'molten', 'slime',
  'molten-boss', 'fallen-swordmaster', 'fallen-king',
];
const enemies = new Map(loadRows('enemies', ENEMY_IDS).map((e) => [e.id, e]));
const difficulties = new Map(loadRows('difficulties', DIFFICULTY_IDS).map((d) => [d.id, d]));

/**
 * What a group really costs to clear, in reference-speed health.
 * @param {string} enemyId
 * @param {number} count
 * @param {number} hpMultiplier
 */
function effortOf(enemyId, count, hpMultiplier) {
  const enemy = enemies.get(enemyId);
  const exposureRatio = REFERENCE_SPEED / Math.max(0.1, enemy.speed);
  return (enemy.maxHp * hpMultiplier * count) / exposureRatio;
}

/** The wave a filler enemy first becomes fair to field. */
const UNLOCKED_AT = { normal: 1, speedy: 2, slow: 3, quick: 4, ghost: 6, molten: 8, slime: 11 };

/**
 * Fill an effort budget, heaviest unlocked enemy first so a late wave is a few
 * dangerous things rather than a crowd of trivial ones.
 *
 * @param {number} budget
 * @param {number} hpMultiplier
 * @param {number} waveIndex
 */
function fillToEffort(budget, hpMultiplier, waveIndex) {
  const unlocked = Object.entries(UNLOCKED_AT)
    .filter(([, at]) => waveIndex >= at)
    .map(([id]) => id)
    .sort((a, b) => effortOf(b, 1, hpMultiplier) - effortOf(a, 1, hpMultiplier));

  const groups = [];
  let remaining = budget;
  let used = 0;

  for (let i = 0; i < unlocked.length; i += 1) {
    const id = unlocked[i];
    const each = effortOf(id, 1, hpMultiplier);
    if (each <= 0) continue;
    // The heaviest kind may take most of the wave but never all of it, so a wave is
    // never a puzzle with exactly one answer. The lightest kind mops up the remainder.
    const share = i === unlocked.length - 1 ? remaining : remaining * 0.65;
    const room = MAX_ENEMIES_PER_WAVE - used;
    const count = Math.max(0, Math.min(room, Math.floor(share / each)));
    if (count <= 0) continue;
    groups.push({ enemyId: id, count });
    remaining -= count * each;
    used += count;
    if (used >= MAX_ENEMIES_PER_WAVE) break;
  }

  if (groups.length === 0) groups.push({ enemyId: 'normal', count: 5 });
  return groups;
}

/** The bosses, lightest first, so each lands as early as the curve can carry it. */
const BOSS_ORDER = ['molten-boss', 'fallen-swordmaster', 'fallen-king'];

/**
 * Work out which wave each boss belongs on, rather than declaring it.
 *
 * Fixed wave numbers were tried and were simply wrong: molten-boss was pinned to wave
 * 20, where the curve has reached about 800 and the boss costs 20,741, so it was
 * dropped from every table on every difficulty and the arc quietly had no bosses at
 * all. Where a boss fits is a fact about the curve and the difficulty multiplier, so
 * it is computed from both.
 *
 * @param {number} hpMultiplier
 * @param {(index: number) => number} budgetAt
 * @returns {{ placed: Map<number, string>, unplaceable: string[] }}
 */
function planBosses(hpMultiplier, budgetAt) {
  const placed = new Map();
  const unplaceable = [];
  let earliest = 8;

  for (const bossId of BOSS_ORDER) {
    const effort = effortOf(bossId, 1, hpMultiplier);
    let landed = null;
    for (let index = earliest; index <= WAVE_COUNT; index += 1) {
      if (effort <= budgetAt(index) * BOSS_SHARE_OF_WAVE) {
        landed = index;
        break;
      }
    }
    if (landed == null) {
      unplaceable.push(bossId);
      continue;
    }
    placed.set(landed, bossId);
    // Keep them apart. Two bosses back to back is one long wave, not two set pieces.
    earliest = landed + 4;
  }

  return { placed, unplaceable };
}

/**
 * @param {string} mapId
 * @param {string} difficultyId
 */
function buildTable(mapId, difficultyId) {
  const difficulty = difficulties.get(difficultyId);
  const hpMultiplier = difficulty.enemyHpMultiplier;
  const cashMultiplier = difficulty.cashMultiplier;
  const waves = [];
  const effortScale = effortScaleFor(hpMultiplier);
  const budgetAt = (index) => FIRST_WAVE_EFFORT * Math.pow(EFFORT_GROWTH, index - 1) * effortScale;
  const bossPlan = planBosses(hpMultiplier, budgetAt);
  const skippedBosses = bossPlan.unplaceable.map(
    (id) => id + ' (needs a wave heavier than this arc reaches)',
  );

  for (let index = 1; index <= WAVE_COUNT; index += 1) {
    // The multiplier makes each enemy heavier, so the same curve is met with fewer,
    // tougher enemies on a harder difficulty rather than a longer queue. That is the
    // right shape: hardcore should be a wall, not a crowd.
    const budget = budgetAt(index);

    const bossId = bossPlan.placed.get(index) ?? null;
    let picked;
    if (bossId) {
      const bossEffort = effortOf(bossId, 1, hpMultiplier);
      // A boss is allowed to be most of its wave, and no more. A boss that costs more
      // than the wave's whole budget is the wave-10 cliff all over again, and it is
      // recorded as skipped rather than quietly shipped as an unwinnable finale.
      picked = [
        { enemyId: bossId, count: 1 },
        ...fillToEffort(Math.max(0, budget * BOSS_SHARE_OF_WAVE - bossEffort) * 0.6, hpMultiplier, index),
      ];
    } else {
      picked = fillToEffort(budget, hpMultiplier, index);
    }

    const groups = picked
      .filter((g) => g.count > 0)
      .map((g, i) => ({
        enemyId: g.enemyId,
        count: g.count,
        spawnIntervalSeconds: Number(
          (enemies.get(g.enemyId).maxHp > 10000 ? 2 : Math.max(0.4, 1.3 - index * 0.035)).toFixed(2),
        ),
        startDelaySeconds: i === 0 ? 0 : i * 4,
        lane: 'main',
      }));

    const earned = groups.reduce(
      (sum, g) => sum + enemies.get(g.enemyId).killReward * g.count * cashMultiplier,
      0,
    );
    const completionBonus = Math.max(40, Math.round(budget * CASH_PER_EFFORT * cashMultiplier - earned));

    waves.push({
      index,
      intermissionSeconds: bossId ? 15 : index <= 3 ? 10 : 8,
      completionBonus,
      groups,
    });
  }

  return {
    table: {
      mapId,
      difficultyId,
      source: {
        origin: 'engine-default',
        reason:
          'an original wave schedule generated by tools/generate-waves.mjs: a geometric ' +
          'difficulty curve with the completion bonus set to fund it, verified end to end ' +
          'by tools/playthrough-probe.mjs. Enemy health and kill rewards are the wiki ' +
          'figures and are not adjusted here.',
      },
      waves,
    },
    skippedBosses,
  };
}

const invokedDirectly =
  Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (!invokedDirectly) throw new Error('this script is a command line, not a library');

for (const mapId of MAPS) {
  for (const difficultyId of DIFFICULTY_IDS) {
    const { table, skippedBosses } = buildTable(mapId, difficultyId);
    writeFileSync(
      join(ROOT, 'src', 'data', 'waves', mapId + '.' + difficultyId + '.json'),
      JSON.stringify(table, null, 2) + '\n',
    );
    const enemyCount = table.waves.reduce((s, w) => s + w.groups.reduce((n, g) => n + g.count, 0), 0);
    const effectiveHp = table.waves.reduce(
      (s, w) => s + w.groups.reduce(
        (n, g) => n + enemies.get(g.enemyId).maxHp * g.count * difficulties.get(difficultyId).enemyHpMultiplier,
        0,
      ),
      0,
    );
    const cash = table.waves.reduce((s, w) => s + w.completionBonus, 0);
    console.log(
      (mapId + '/' + difficultyId).padEnd(26) +
        String(enemyCount).padStart(4) + ' enemies  ' +
        Math.round(effectiveHp).toLocaleString().padStart(10) + ' health  ' +
        Math.round(cash).toLocaleString().padStart(9) + ' in bonuses' +
        (skippedBosses.length ? '   (no room for: ' + skippedBosses.join(', ') + ')' : ''),
    );
  }
}
