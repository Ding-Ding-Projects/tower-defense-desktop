/**
 * Two different pictures of the same world, and they are deliberately not the same
 * function.
 *
 * `snapshot` is what the interface reads: a stable, renamed, read-only view with
 * every entity carrying an `id` so the renderer can interpolate the same enemy across
 * two frames. Its field names are part of a contract with the interface layer and are
 * allowed to stay put even if the internal ones are refactored.
 *
 * `serializeState` and `hashState` are what determinism is proven with. They cover
 * the full internal world, including the generator position, because a replay that
 * matched on everything except the random stream would be a replay that diverges on
 * the very next draw.
 *
 * Collapsing the two into one function is the tempting mistake: the renderer does not
 * want the generator state, and the hash absolutely does.
 */

import { fromFixed } from '../core/fixed.js';
import { TICK_RATE } from '../core/constants.js';

/** Internal phase names to the ones the interface layer uses. */
const PHASE_VIEW = Object.freeze({
  intermission: 'intermission',
  wave: 'active',
  won: 'victory',
  lost: 'defeat',
});

/**
 * The read-only view the interface consumes.
 * @param {import('./match-state.js').MatchState} state
 * @returns {object}
 */
export function snapshot(state) {
  return {
    tick: state.tick,
    simTimeSeconds: state.tick / TICK_RATE,
    mapId: state.mapId,
    difficultyId: state.difficultyId,
    cash: state.cash,
    lives: state.lives,
    waveIndex: state.waveIndex,
    phase: PHASE_VIEW[state.phase] ?? state.phase,
    intermissionSecondsRemaining:
      state.phase === 'intermission' ? state.phaseTicks / TICK_RATE : 0,
    killCount: state.killCount,
    leakCount: state.leakCount,
    towers: state.towers.map((t) => ({
      id: t.seq,
      defId: t.defId,
      level: t.level,
      x: fromFixed(t.xFixed),
      y: fromFixed(t.yFixed),
      targeting: t.targeting,
      abilityCooldownSeconds: t.abilityCooldownTicks / TICK_RATE,
      totalSpent: t.totalSpent,
    })),
    enemies: state.enemies.map((e) => ({
      id: e.seq,
      defId: e.defId,
      x: fromFixed(e.xFixed),
      y: fromFixed(e.yFixed),
      hp: e.hp,
      maxHp: e.maxHp,
      shield: e.shield,
      statuses: e.statuses.map((s) => ({ id: s.id, stacks: s.stacks })),
    })),
    projectiles: state.projectiles.map((p) => ({
      id: p.seq,
      x: fromFixed(p.xFixed),
      y: fromFixed(p.yFixed),
      targetId: p.targetSeq,
    })),
  };
}

/**
 * Canonical serialisation of the entire internal world.
 *
 * Field order is written out by hand rather than left to object key order, because
 * key order is stable in practice and not guaranteed by anything this code controls,
 * and a hash that silently depends on it would fail somewhere else entirely.
 * @param {import('./match-state.js').MatchState} state
 * @returns {string}
 */
export function serializeState(state) {
  const parts = [
    state.tick,
    state.rng.state,
    state.seed,
    state.mapId,
    state.difficultyId,
    state.phase,
    state.phaseTicks,
    state.waveIndex,
    state.cash,
    state.lives,
    state.nextSeq,
    state.spawnedThisWave,
    state.killCount,
    state.leakCount,
  ];

  for (const e of [...state.enemies].sort((a, b) => a.seq - b.seq)) {
    parts.push(
      'E',
      e.seq,
      e.defId,
      e.laneId,
      e.segment,
      e.distFixed,
      e.xFixed,
      e.yFixed,
      e.offsetFixed,
      e.hp,
      e.maxHp,
      e.shield,
    );
    for (const s of [...e.statuses].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
      parts.push('s', s.id, s.ticksLeft, s.stacks);
    }
    for (const key of Object.keys(e.abilityCooldowns).sort()) {
      parts.push('c', key, e.abilityCooldowns[key]);
    }
    for (const key of [...e.firedThresholds].sort()) parts.push('f', key);
  }

  for (const t of [...state.towers].sort((a, b) => a.seq - b.seq)) {
    parts.push(
      'T',
      t.seq,
      t.defId,
      t.level,
      t.xFixed,
      t.yFixed,
      t.targeting,
      t.cooldownTicks,
      t.spinUpTicks,
      t.burstLeft,
      t.reloadTicks,
      t.abilityCooldownTicks,
      t.totalSpent,
    );
  }

  for (const p of [...state.projectiles].sort((a, b) => a.seq - b.seq)) {
    parts.push('P', p.seq, p.sourceSeq, p.xFixed, p.yFixed, p.targetSeq, p.damage, p.pierceLeft);
  }

  for (const q of [...state.spawnQueue].sort((a, b) => a.tick - b.tick || a.order - b.order)) {
    parts.push('Q', q.tick, q.enemyId, q.laneId, q.order);
  }

  return parts.join('|');
}

/**
 * FNV-1a over the canonical serialisation.
 *
 * Not a cryptographic hash and not trying to be. It exists to make "did these two
 * runs produce the same world" a single cheap integer comparison, taken once a
 * second, so a divergence is caught at the second it happened rather than at the end
 * of a forty-wave match.
 * @param {import('./match-state.js').MatchState} state
 * @returns {number}
 */
export function hashState(state) {
  const text = serializeState(state);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * A deep, plain-data copy suitable for saving and restoring.
 * @param {import('./match-state.js').MatchState} state
 * @returns {import('./match-state.js').MatchState}
 */
export function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}
