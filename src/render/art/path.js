/**
 * The lane, drawn as a worn dirt track rather than a grey rounded stroke:
 * packed earth with irregular hand-worn edges, a soft shadow where it meets
 * the grass, faint wheel ruts, and small chevrons hinting which way enemies
 * travel.
 *
 * Deliberately takes already-projected screen-space points rather than map
 * points plus a camera: path.js has no camera or zoom concept of its own,
 * exactly like terrain.js. The irregularity is seeded from vertex position
 * along the polyline, not from Math.random, so the same points and seed
 * always draw the same worn track — camera pan/zoom changes the points (and
 * so, correctly, where the jitter lands), never the seed's determinism.
 */

import { PATH, mixColors } from './palette.js';
import { hash2 } from './noise.js';

/** @typedef {{ x: number, y: number }} Point */

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Point[]} points  screen-space polyline, at least 2 points
 * @param {number} widthPx
 * @param {string|number} seed
 * @param {{ chevronSpacingPx?: number }} [options]
 */
export function drawPath(ctx, points, widthPx, seed, options = {}) {
  if (!points || points.length < 2) return;
  const chevronSpacing = options.chevronSpacingPx ?? Math.max(28, widthPx * 2.2);

  const normals = computeNormals(points);
  const jitterScale = widthPx * 0.16;

  const leftEdge = offsetPolyline(points, normals, widthPx / 2, seed, 'left', jitterScale);
  const rightEdge = offsetPolyline(points, normals, -widthPx / 2, seed, 'right', jitterScale);

  drawShadow(ctx, leftEdge, rightEdge);
  drawEarthFill(ctx, leftEdge, rightEdge);
  drawRuts(ctx, points, normals, widthPx);
  drawDirectionChevrons(ctx, points, chevronSpacing, widthPx);
}

/**
 * A unit normal per point, taken from the direction its neighbours imply, so the two
 * edges of the lane stay parallel through a corner.
 * @param {Point[]} points
 * @returns {Point[]}
 */
function computeNormals(points) {
  const normals = [];
  for (let i = 0; i < points.length; i += 1) {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i + 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    normals.push({ x: -dy / len, y: dx / len });
  }
  return normals;
}

/**
 * @param {Point[]} points
 * @param {Point[]} normals
 * @param {number} offset  how far along the normal, signed
 * @param {string|number} seed
 * @param {string} side  composed into the seed so the two edges wobble independently
 * @param {number} jitterScale
 * @returns {Point[]}
 */
function offsetPolyline(points, normals, offset, seed, side, jitterScale) {
  return points.map((p, i) => {
    const n = normals[i];
    const jitter = (hash2(i, offset > 0 ? 1 : 2, `${seed}:${side}`) - 0.5) * 2 * jitterScale;
    const total = offset + jitter;
    return { x: p.x + n.x * total, y: p.y + n.y * total };
  });
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Point[]} leftEdge
 * @param {Point[]} rightEdge
 */
function tracePolygon(ctx, leftEdge, rightEdge) {
  ctx.beginPath();
  leftEdge.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  for (let i = rightEdge.length - 1; i >= 0; i -= 1) {
    ctx.lineTo(rightEdge[i].x, rightEdge[i].y);
  }
  ctx.closePath();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Point[]} leftEdge
 * @param {Point[]} rightEdge
 */
function drawShadow(ctx, leftEdge, rightEdge) {
  ctx.save();
  ctx.translate(0, 2.5);
  ctx.fillStyle = PATH.shadow;
  tracePolygon(ctx, leftEdge, rightEdge);
  ctx.fill();
  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Point[]} leftEdge
 * @param {Point[]} rightEdge
 */
function drawEarthFill(ctx, leftEdge, rightEdge) {
  tracePolygon(ctx, leftEdge, rightEdge);
  ctx.fillStyle = mixColors(PATH.earthDark, PATH.earthBase, 0.7);
  ctx.fill();
  ctx.strokeStyle = PATH.edge;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Point[]} points
 * @param {Point[]} normals
 * @param {number} widthPx
 */
function drawRuts(ctx, points, normals, widthPx) {
  const rutOffset = widthPx * 0.22;
  ctx.strokeStyle = PATH.rut;
  ctx.lineWidth = Math.max(1, widthPx * 0.045);
  ctx.lineCap = 'round';
  for (const sign of [1, -1]) {
    ctx.beginPath();
    points.forEach((p, i) => {
      const n = normals[i];
      const x = p.x + n.x * rutOffset * sign;
      const y = p.y + n.y * rutOffset * sign;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Point[]} points
 * @param {number} spacingPx
 * @param {number} widthPx
 */
function drawDirectionChevrons(ctx, points, spacingPx, widthPx) {
  const chevronSize = Math.max(3, Math.min(9, widthPx * 0.22));
  ctx.fillStyle = PATH.direction;

  let distanceSincePrev = spacingPx * 0.5;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen === 0) continue;
    const dirX = dx / segLen;
    const dirY = dy / segLen;
    const normX = -dirY;
    const normY = dirX;

    let travelled = 0;
    while (distanceSincePrev + (segLen - travelled) >= spacingPx) {
      travelled += spacingPx - distanceSincePrev;
      distanceSincePrev = 0;
      const cx = a.x + dirX * travelled;
      const cy = a.y + dirY * travelled;
      drawChevron(ctx, cx, cy, dirX, dirY, normX, normY, chevronSize);
    }
    distanceSincePrev += segLen - travelled;
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} dirX  unit direction of travel
 * @param {number} dirY
 * @param {number} normX  unit normal, for the arrow's width
 * @param {number} normY
 * @param {number} size
 */
function drawChevron(ctx, cx, cy, dirX, dirY, normX, normY, size) {
  const tipX = cx + dirX * size;
  const tipY = cy + dirY * size;
  const backX = cx - dirX * size * 0.5;
  const backY = cy - dirY * size * 0.5;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(backX + normX * size * 0.55, backY + normY * size * 0.55);
  ctx.lineTo(backX - normX * size * 0.55, backY - normY * size * 0.55);
  ctx.closePath();
  ctx.fill();
}
