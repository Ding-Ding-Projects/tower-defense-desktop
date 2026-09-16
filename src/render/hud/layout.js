/**
 * Pure rectangle layout helpers for the canvas-drawn interface layer.
 *
 * Every function here takes a `{x, y, width, height}` rect and returns new
 * rect(s); none of them touch a canvas, a DOM node, `window`, or a device
 * pixel ratio. That is deliberate: it is what keeps every widget in this
 * directory resolution-independent (the same layout maths produce correct
 * rects whether the viewport is 320px or 3840px wide) and unit-testable
 * without a browser at all.
 *
 * @typedef {{x: number, y: number, width: number, height: number}} Rect
 */

/**
 * Shrinks a rect by padding, CSS-shorthand style: one value pads every side,
 * two values are (vertical, horizontal), four are (top, right, bottom, left).
 * Never produces a negative width/height; a padding larger than the rect
 * collapses that axis to zero rather than going negative.
 * @param {Rect} rect
 * @param {...number} amounts
 * @returns {Rect}
 */
export function inset(rect, ...amounts) {
  let top;
  let right;
  let bottom;
  let left;
  if (amounts.length === 0) {
    top = right = bottom = left = 0;
  } else if (amounts.length === 1) {
    top = right = bottom = left = amounts[0];
  } else if (amounts.length === 2) {
    [top, left] = amounts;
    bottom = top;
    right = left;
  } else {
    [top, right, bottom, left] = amounts;
  }
  const width = Math.max(0, rect.width - left - right);
  const height = Math.max(0, rect.height - top - bottom);
  return { x: rect.x + left, y: rect.y + top, width, height };
}

/**
 * Splits a rect into a horizontal row of cells, left to right. Each entry in
 * `sizes` is either a fixed pixel width, or `null`/`undefined` to share the
 * space left over after every fixed cell and every gap, split evenly among
 * every flexible entry. A gap is placed between cells only, never at the
 * outer edges.
 * @param {Rect} rect
 * @param {(number|null|undefined)[]} sizes
 * @param {number} [gap]
 * @returns {Rect[]}
 */
export function row(rect, sizes, gap = 0) {
  return layoutAxis(rect, sizes, gap, 'x', 'width');
}

/**
 * Splits a rect into a vertical stack of cells, top to bottom. Same sizing
 * rules as {@link row}.
 * @param {Rect} rect
 * @param {(number|null|undefined)[]} sizes
 * @param {number} [gap]
 * @returns {Rect[]}
 */
export function stack(rect, sizes, gap = 0) {
  return layoutAxis(rect, sizes, gap, 'y', 'height');
}

/**
 * Split a rectangle along one axis. A null size means "take what is left", shared
 * equally between every null.
 * @param {Rect} rect
 * @param {(number|null|undefined)[]} sizes
 * @param {number} gap
 * @param {'x'|'y'} axisKey
 * @param {'width'|'height'} sizeKey
 * @returns {Rect[]}
 */
function layoutAxis(rect, sizes, gap, axisKey, sizeKey) {
  const count = sizes.length;
  if (count === 0) return [];
  const totalGap = gap * (count - 1);
  let fixedTotal = 0;
  let flexCount = 0;
  for (const size of sizes) {
    if (size == null) flexCount += 1;
    else fixedTotal += size;
  }
  const remaining = Math.max(0, rect[sizeKey] - totalGap - fixedTotal);
  const flexSize = flexCount > 0 ? remaining / flexCount : 0;
  const result = [];
  let cursor = rect[axisKey];
  for (const size of sizes) {
    const cellSize = Math.max(0, size == null ? flexSize : size);
    const cellRect = axisKey === 'x'
      ? { x: cursor, y: rect.y, width: cellSize, height: rect.height }
      : { x: rect.x, y: cursor, width: rect.width, height: cellSize };
    result.push(cellRect);
    cursor += cellSize + gap;
  }
  return result;
}

/**
 * Splits a rect in two at `ratio` (0..1 of the primary axis, clamped), with
 * an optional gap carved out between the two pieces.
 * @param {Rect} rect
 * @param {number} ratio
 * @param {number} [gap]
 * @param {'horizontal'|'vertical'} [direction]
 * @returns {[Rect, Rect]}
 */
export function split(rect, ratio, gap = 0, direction = 'horizontal') {
  const clamped = Math.min(1, Math.max(0, ratio));
  if (direction === 'vertical') {
    const total = Math.max(0, rect.height - gap);
    const firstHeight = total * clamped;
    return [
      { x: rect.x, y: rect.y, width: rect.width, height: firstHeight },
      { x: rect.x, y: rect.y + firstHeight + gap, width: rect.width, height: total - firstHeight },
    ];
  }
  const total = Math.max(0, rect.width - gap);
  const firstWidth = total * clamped;
  return [
    { x: rect.x, y: rect.y, width: firstWidth, height: rect.height },
    { x: rect.x + firstWidth + gap, y: rect.y, width: total - firstWidth, height: rect.height },
  ];
}

/**
 * True when (x, y) falls within rect, inclusive of the edges. The one shared
 * hit-testing primitive every widget and every panel in this directory uses,
 * so "is this click inside this rect" is answered identically everywhere.
 * @param {Rect|null|undefined} rect
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function containsPoint(rect, x, y) {
  if (!rect) return false;
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}
