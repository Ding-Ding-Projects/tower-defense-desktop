/**
 * Where a tower may be put down.
 *
 * Four independent reasons a placement can be refused, and each one returns its own
 * reason string rather than a bare false, because the interface has to tell the
 * player which rule they hit. A disabled control with no stated reason is exactly the
 * kind of surface this project treats as a defect.
 */

import { toFixed, distanceSquared } from '../core/fixed.js';
import { pointInPolygon } from './geometry.js';

/**
 * @typedef {{ ok: true } | { ok: false, reason: string }} PlacementVerdict
 */

/**
 * @param {import('../state/match-state.js').MatchState} state
 * @param {import('../../data/schema/types.js').GameData} gameData
 * @param {string} towerId
 * @param {number} x  map units
 * @param {number} y  map units
 * @returns {PlacementVerdict}
 */
export function canPlace(state, gameData, towerId, x, y) {
  const def = gameData.towers.get(towerId);
  if (!def) return { ok: false, reason: 'unknown tower' };

  const difficulty = gameData.difficulties.get(state.difficultyId);
  if (difficulty && difficulty.disallowedTowers.includes(towerId)) {
    return { ok: false, reason: 'not allowed on this difficulty' };
  }

  const map = gameData.maps.get(state.mapId);
  if (!map) return { ok: false, reason: 'unknown map' };

  const zone = map.placementZones.find(
    (z) => def.allowedTerrain.includes(z.terrain) && pointInPolygon(z.polygon, x, y),
  );
  if (!zone) return { ok: false, reason: 'cannot build here' };

  const xFixed = toFixed(x);
  const yFixed = toFixed(y);
  for (const other of state.towers) {
    const otherDef = gameData.towers.get(other.defId);
    if (!otherDef) continue;
    const minGap = toFixed(def.footprintRadius + otherDef.footprintRadius);
    if (distanceSquared(xFixed, yFixed, other.xFixed, other.yFixed) < minGap * minGap) {
      return { ok: false, reason: 'too close to another tower' };
    }
  }

  if (def.maxCount !== null) {
    // The cap is shared across a pool, so two towers that share a pool count against
    // each other. That is how an economy cap stays meaningful when a second economy
    // tower is added later.
    const poolCount = state.towers.filter((t) => {
      const d = gameData.towers.get(t.defId);
      return d ? d.placementPool === def.placementPool : false;
    }).length;
    if (poolCount >= def.maxCount) {
      return { ok: false, reason: 'limit of ' + def.maxCount + ' reached' };
    }
  }

  if (state.cash < def.baseCost) {
    return { ok: false, reason: 'costs ' + def.baseCost + ', you have ' + state.cash };
  }

  return { ok: true };
}
