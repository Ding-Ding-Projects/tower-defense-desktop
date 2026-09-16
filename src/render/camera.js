/**
 * Pure camera maths: pan, zoom, clamping to the map bounds, and the world/screen
 * projection the renderer and the input handlers both need. A camera is a plain
 * `{ x, y, zoom }` object in map units — never a class holding a canvas context —
 * so every function here is trivially unit tested.
 */

export const DEFAULT_MIN_ZOOM = 0.5;
export const DEFAULT_MAX_ZOOM = 3;

/**
 * @param {{ x?: number, y?: number, zoom?: number }} [initial]
 * @returns {{ x: number, y: number, zoom: number }}
 */
export function createCamera({ x = 0, y = 0, zoom = 1 } = {}) {
  return { x, y, zoom };
}

/**
 * @param {number} zoom
 * @param {number} [minZoom]
 * @param {number} [maxZoom]
 * @returns {number}
 */
export function clampZoom(zoom, minZoom = DEFAULT_MIN_ZOOM, maxZoom = DEFAULT_MAX_ZOOM) {
  return Math.min(maxZoom, Math.max(minZoom, zoom));
}

/**
 * Clamp a camera so the visible viewport never shows outside the map. When the
 * viewport (in world units at the current zoom) is wider or taller than the map
 * itself, that axis centers on the map instead of clamping to an empty range.
 * @param {{ x: number, y: number, zoom: number }} camera
 * @param {{
 *   viewportWidth: number, viewportHeight: number,
 *   mapWidth: number, mapHeight: number,
 *   minZoom?: number, maxZoom?: number,
 * }} bounds
 * @returns {{ x: number, y: number, zoom: number }}
 */
export function clampCamera(camera, bounds) {
  const { viewportWidth, viewportHeight, mapWidth, mapHeight } = bounds;
  const minZoom = bounds.minZoom ?? DEFAULT_MIN_ZOOM;
  const maxZoom = bounds.maxZoom ?? DEFAULT_MAX_ZOOM;
  const zoom = clampZoom(camera.zoom, minZoom, maxZoom);

  const halfViewW = viewportWidth / zoom / 2;
  const halfViewH = viewportHeight / zoom / 2;

  return {
    x: clampAxis(camera.x, halfViewW, mapWidth),
    y: clampAxis(camera.y, halfViewH, mapHeight),
    zoom,
  };
}

function clampAxis(center, halfView, mapExtent) {
  if (halfView * 2 >= mapExtent) {
    return mapExtent / 2;
  }
  const min = halfView;
  const max = mapExtent - halfView;
  return Math.min(max, Math.max(min, center));
}

/**
 * @param {{ x: number, y: number, zoom: number }} camera
 * @param {number} dxWorld
 * @param {number} dyWorld
 * @returns {{ x: number, y: number, zoom: number }}
 */
export function panCamera(camera, dxWorld, dyWorld) {
  return { x: camera.x + dxWorld, y: camera.y + dyWorld, zoom: camera.zoom };
}

/**
 * @param {{ x: number, y: number, zoom: number }} camera
 * @param {number} factor  multiplies the current zoom, e.g. 1.1 to zoom in 10%
 * @param {number} [minZoom]
 * @param {number} [maxZoom]
 * @returns {{ x: number, y: number, zoom: number }}
 */
export function zoomCamera(camera, factor, minZoom = DEFAULT_MIN_ZOOM, maxZoom = DEFAULT_MAX_ZOOM) {
  return { x: camera.x, y: camera.y, zoom: clampZoom(camera.zoom * factor, minZoom, maxZoom) };
}

/**
 * @param {{ x: number, y: number, zoom: number }} camera
 * @param {number} viewportWidth
 * @param {number} viewportHeight
 * @param {number} worldX
 * @param {number} worldY
 * @returns {{ x: number, y: number }}
 */
export function worldToScreen(camera, viewportWidth, viewportHeight, worldX, worldY) {
  return {
    x: (worldX - camera.x) * camera.zoom + viewportWidth / 2,
    y: (worldY - camera.y) * camera.zoom + viewportHeight / 2,
  };
}

/**
 * @param {{ x: number, y: number, zoom: number }} camera
 * @param {number} viewportWidth
 * @param {number} viewportHeight
 * @param {number} screenX
 * @param {number} screenY
 * @returns {{ x: number, y: number }}
 */
export function screenToWorld(camera, viewportWidth, viewportHeight, screenX, screenY) {
  return {
    x: (screenX - viewportWidth / 2) / camera.zoom + camera.x,
    y: (screenY - viewportHeight / 2) / camera.zoom + camera.y,
  };
}
