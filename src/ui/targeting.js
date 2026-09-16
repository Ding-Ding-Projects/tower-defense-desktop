/**
 * Pure logic for the five targeting modes every tower supports: cycling through
 * them (the selected-tower panel's targeting control is a cycling toggle button,
 * not five separate buttons, so a narrow panel never clips) and their display
 * labels.
 */

/** @type {import('../data/schema/types.js').TargetingMode[]} */
export const ALL_TARGETING_MODES = ['first', 'last', 'closest', 'strongest', 'weakest'];

const LABELS = {
  first: 'First',
  last: 'Last',
  closest: 'Closest',
  strongest: 'Strongest',
  weakest: 'Weakest',
};

/**
 * @param {import('../data/schema/types.js').TargetingMode} currentMode
 * @param {import('../data/schema/types.js').TargetingMode[]} [allowedModes]
 * @param {1|-1} [direction]
 * @returns {import('../data/schema/types.js').TargetingMode}
 */
export function cycleTargetingMode(currentMode, allowedModes = ALL_TARGETING_MODES, direction = 1) {
  if (!allowedModes || allowedModes.length === 0) {
    throw new Error('cycleTargetingMode: allowedModes must be non-empty');
  }
  const currentIndex = allowedModes.indexOf(currentMode);
  const fromIndex = currentIndex === -1 ? 0 : currentIndex;
  const nextIndex = (fromIndex + direction + allowedModes.length) % allowedModes.length;
  return allowedModes[nextIndex];
}

/**
 * @param {import('../data/schema/types.js').TargetingMode} mode
 * @returns {string}
 */
export function targetingModeLabel(mode) {
  return LABELS[mode] ?? mode;
}
