/**
 * One place for every colour the art library draws with, plus the small colour
 * maths every drawing module needs (shading, alpha blending, mixing). Every
 * other file in src/render/art imports its colours from here instead of
 * hard-coding a hex string, so the whole game reads as one coherent palette
 * under one light direction instead of six modules each guessing their own.
 *
 * Functional data colours (health bars, shield bars, status tints) are kept
 * in their own section, separate from scenery colours: a health bar communicates
 * game state and must stay legible and consistent, while grass and soil tones
 * exist purely for atmosphere and can vary across a tile without meaning anything.
 */

/**
 * The light every rim-lit surface (tower turrets, rocks, enemy shells) is lit
 * from. Up and to the left, like most top-down game art. Kept as a unit vector
 * plus a screen-space angle so a caller can pick whichever is more convenient.
 */
export const LIGHT_DIRECTION = Object.freeze({ x: -0.55, y: -0.83 });
export const LIGHT_ANGLE_RADIANS = Math.atan2(LIGHT_DIRECTION.y, LIGHT_DIRECTION.x);

export const TERRAIN = Object.freeze({
  grassBase: '#3c5f3a',
  grassDark: '#2c4a2b',
  grassLight: '#4f7a4a',
  soilBase: '#5a4632',
  soilDark: '#41321f',
  soilLight: '#6f5a3f',
  rock: '#7a7a76',
  rockDark: '#565650',
  rockHighlight: '#9a9a92',
  tuft: '#5c8a4f',
  tuftDark: '#3f6338',
  vignette: '#05070a',
});

export const PATH = Object.freeze({
  shadow: 'rgba(10, 12, 8, 0.35)',
  earthBase: '#7a6142',
  earthDark: '#5a4630',
  earthLight: '#8f7350',
  edge: '#4a3a26',
  rut: '#3d2f1e',
  direction: 'rgba(232, 214, 178, 0.55)',
});

/** One accent colour per tower role, derived from levelDef fields. */
export const TOWER_ROLE = Object.freeze({
  single: '#6750a4',
  aoe: '#b3261e',
  chain: '#e0a72e',
  pierce: '#9a5b12',
  support: '#1d6f8c',
});

export const TOWER = Object.freeze({
  plinth: '#3a3a40',
  plinthDark: '#26262b',
  base: '#4a4a52',
  baseDark: '#323238',
  armor: '#5f5f68',
  armorRivet: '#232327',
  turretMetal: '#8a8a92',
  barrel: '#2b2b30',
  barrelHighlight: '#4a4a52',
  rimLight: 'rgba(255, 255, 255, 0.55)',
  antiAirSpike: '#c9d6e0',
  sensorLens: '#7fd8ff',
  shadow: 'rgba(6, 8, 12, 0.4)',
});

export const ENEMY = Object.freeze({
  // Moved off the path's own brown. At #8a6a52 against an earth base of #7a6142 a
  // walker was within about 21 of the road it was walking on, which reads as a smudge
  // moving over dirt rather than as a figure. Cooler and darker separates it from the
  // path without turning it into a colour nothing in this world would wear.
  normal: '#4e4a44',
  quick: '#4f6f8a',
  // The worst offender of the lot: at #7a5a48 a runner was a distance of 9 from the
  // path base, which is to say invisible on the road it spends its whole life on.
  fast: '#a8603f',
  boss: '#8c1d1d',
  bossDark: '#5c1010',
  bossPlate: '#3a1414',
  flying: '#c9a76b',
  hidden: '#bcd6e6',
  // Darker and more opaque than it was. An outline is what separates a figure from
  // whatever it happens to be standing on, and at 0.55 it was doing that job only
  // against the lightest patches of grass.
  outline: 'rgba(14, 10, 7, 0.85)',
  shield: '#8ecbe8',
  shieldDark: '#4c8fb0',
  defensePlate: '#8a8a86',
  defensePlateDark: '#55554f',
  eye: '#ffe066',
  eyeDim: '#c9d6e0',
  skinWarm: '#ffb98a',
  clothFold: 'rgba(0, 0, 0, 0.18)',
  metal: '#7d828c',
  metalDark: '#4b4e56',
  metalHighlight: 'rgba(255, 255, 255, 0.75)',
  machineHull: '#5c6470',
  machineHullDark: '#383e47',
  track: '#26282c',
  trackTread: '#4a4d54',
  rivet: '#1c1d20',
  wing: 'rgba(214, 224, 236, 0.85)',
  wraithEdge: 'rgba(200, 230, 255, 0.55)',
  wraithEchoA: 'rgba(120, 200, 255, 0.18)',
  wraithEchoB: 'rgba(220, 160, 255, 0.16)',
  scorch: 'rgba(20, 16, 14, 0.4)',
  crack: 'rgba(15, 10, 8, 0.7)',
  bounceLight: 'rgba(255, 232, 200, 0.16)',
  shadow: 'rgba(6, 8, 12, 0.5)',
});

/** Enemy alpha applied to a `hidden` body fill so it reads as a faint refractive shimmer, not a flat translucent copy of the solid body. */
export const HIDDEN_ALPHA = 0.22;

export const EFFECTS = Object.freeze({
  muzzleCore: '#fff6d8',
  muzzleEdge: '#ffb648',
  trail: '#f7d548',
  spark: '#ffe08a',
  explosionCore: '#fff2c2',
  explosionMid: '#ff8a3d',
  explosionEdge: 'rgba(179, 38, 30, 0)',
  shockwave: 'rgba(255, 176, 90, 0.65)',
  frost: 'rgba(150, 214, 255, 0.55)',
  frostCrystal: 'rgba(224, 245, 255, 0.85)',
  ember: '#ff9a3c',
  emberDim: '#c74a1a',
  leakFlash: 'rgba(179, 38, 30, 0.25)',
});

/** Functional data colours: what a value means, never scenery. */
export const DATA = Object.freeze({
  healthHigh: '#4caf50',
  healthMid: '#ffb300',
  healthLow: '#e53935',
  healthTrack: '#2b2d33',
  shieldBar: '#8ecbe8',
});

export const STATUS_TINT = Object.freeze({
  burn: '#ff7a3d',
  freeze: '#8fd6ff',
  poison: '#7fc94a',
  stun: '#f2d43d',
  slow: '#8fa8ff',
  haste: '#ffe08a',
  exposed: '#e8a0ff',
});

/**
 * @param {string} hex  '#rrggbb'
 * @param {number} amount  -1..1; negative darkens toward black, positive lightens toward white
 * @returns {string} 'rgb(r, g, b)'
 */
export function shade(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const adjust = (channel) => clampByte(channel + (amount > 0 ? (255 - channel) * amount : channel * amount));
  return `rgb(${adjust(r)}, ${adjust(g)}, ${adjust(b)})`;
}

/**
 * @param {string} hex
 * @param {number} alpha  0..1
 * @returns {string} 'rgba(r, g, b, a)'
 */
export function withAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${clamp01(alpha)})`;
}

/**
 * @param {string} hexA
 * @param {string} hexB
 * @param {number} t  0..1, 0 is hexA
 * @returns {string} 'rgb(r, g, b)'
 */
export function colorDistance(hexA, hexB) {
  // Plain Euclidean distance in RGB. Not a perceptual metric, and it does not need to
  // be: it exists to catch a figure painted almost exactly the colour of the ground it
  // walks on, which is a gap of single digits, not a subtle one.
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

export function mixHex(hexA, hexB, t) {
  // The hex-returning sibling of mixColors, and it exists for a specific reason:
  // withAlpha and shade parse hex and nothing else, so a colour that has been through
  // mixColors comes back as 'rgb(...)' and quietly breaks the moment anything downstream
  // tries to fade it. A mixed colour that is going to be mixed again has to stay hex.
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const c = clamp01(t);
  const channel = (from, to) => {
    const value = Math.round(from + (to - from) * c);
    return Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0');
  };
  return '#' + channel(a.r, b.r) + channel(a.g, b.g) + channel(a.b, b.b);
}

export function mixColors(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const c = clamp01(t);
  const r = Math.round(a.r + (b.r - a.r) * c);
  const g = Math.round(a.g + (b.g - a.g) * c);
  const bl = Math.round(a.b + (b.b - a.b) * c);
  return `rgb(${r}, ${g}, ${bl})`;
}

function hexToRgb(hex) {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  const num = parseInt(clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean, 16);
  return { r: (num >> 16) & 0xff, g: (num >> 8) & 0xff, b: num & 0xff };
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}
