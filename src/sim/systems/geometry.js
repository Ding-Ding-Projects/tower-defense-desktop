/**
 * Lane geometry. Pure functions over map data, no state.
 *
 * Lanes are authored as waypoints in map-unit floats; everything the simulation does
 * with them is fixed-point, so conversion happens once here at the boundary.
 */

import { toFixed, isqrt } from '../core/fixed.js';

/**
 * Fixed-point length of each segment, plus the total.
 * @param {import('../../data/schema/types.js').Lane} lane
 * @returns {{ segments: number[], total: number }}
 */
export function laneMetrics(lane) {
  const segments = [];
  let total = 0;
  for (let i = 1; i < lane.waypoints.length; i += 1) {
    const a = lane.waypoints[i - 1];
    const b = lane.waypoints[i];
    const dx = toFixed(b.x) - toFixed(a.x);
    const dy = toFixed(b.y) - toFixed(a.y);
    const len = isqrt(dx * dx + dy * dy);
    segments.push(len);
    total += len;
  }
  return { segments, total };
}

/**
 * Position at a distance along a lane, with a perpendicular offset applied so a pack
 * of enemies spreads across the path instead of rendering as one line.
 * @param {import('../../data/schema/types.js').Lane} lane
 * @param {{ segments: number[], total: number }} metrics
 * @param {number} distFixed
 * @param {number} offsetFixed
 * @returns {{ xFixed: number, yFixed: number, segment: number }}
 */
export function positionAlong(lane, metrics, distFixed, offsetFixed) {
  let remaining = Math.max(0, distFixed);
  let segment = 0;
  while (segment < metrics.segments.length - 1 && remaining > metrics.segments[segment]) {
    remaining -= metrics.segments[segment];
    segment += 1;
  }
  const a = lane.waypoints[segment];
  const b = lane.waypoints[segment + 1] ?? lane.waypoints[segment];
  const ax = toFixed(a.x);
  const ay = toFixed(a.y);
  const bx = toFixed(b.x);
  const by = toFixed(b.y);
  const segLen = metrics.segments[segment] || 1;
  const clamped = Math.min(remaining, segLen);
  // Integer interpolation: multiply first, divide once, so rounding happens in
  // exactly one place rather than compounding across a long lane.
  const xFixed = ax + Math.trunc(((bx - ax) * clamped) / segLen);
  const yFixed = ay + Math.trunc(((by - ay) * clamped) / segLen);
  // Perpendicular to the direction of travel.
  const perpX = Math.trunc((-(by - ay) * offsetFixed) / segLen);
  const perpY = Math.trunc(((bx - ax) * offsetFixed) / segLen);
  return { xFixed: xFixed + perpX, yFixed: yFixed + perpY, segment };
}

/**
 * @param {import('../../data/schema/types.js').MapDef} map
 * @param {string} laneId
 * @returns {import('../../data/schema/types.js').Lane}
 */
export function requireLane(map, laneId) {
  const lane = map.lanes.find((l) => l.id === laneId);
  if (!lane) throw new Error('unknown lane ' + laneId + ' on map ' + map.id);
  return lane;
}

/**
 * Even-odd point-in-polygon. Polygons come from map data and are validated simple,
 * so the simple algorithm is the correct one here rather than a compromise.
 * @param {Array<[number, number]>} polygon
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function pointInPolygon(polygon, x, y) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const straddles = (yi > y) !== (yj > y);
    if (straddles && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
