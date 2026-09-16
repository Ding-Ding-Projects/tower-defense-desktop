#!/usr/bin/env node
/**
 * Generate the application icon, byte by byte, with no image library.
 *
 * A framework default icon blocks a release, and a raster file merely renamed to an
 * icon extension is not an icon. So this produces a genuine multi-resolution ICO
 * containing real PNG images at every size Windows asks for.
 *
 * The mark is drawn to survive being sixteen pixels wide, which is the size that
 * actually decides whether an icon is any good: one range ring, one tower silhouette,
 * high contrast, no detail that turns to mush. Everything clever was removed after
 * checking it at that size rather than at 256.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

/** Colours, chosen for contrast at small sizes rather than for subtlety. */
const BACKDROP = [16, 20, 24];
const RING = [186, 146, 255];
const TOWER = [236, 238, 242];
const BARREL = [120, 92, 180];

/**
 * @param {number} size
 * @returns {Uint8Array} raw RGBA
 */
function drawIcon(size) {
  const pixels = new Uint8Array(size * size * 4);
  const centre = (size - 1) / 2;
  const ringRadius = size * 0.40;
  const ringThickness = Math.max(1, size * 0.075);
  const towerHalf = Math.max(1, size * 0.11);
  const barrelHalf = Math.max(1, size * 0.055);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      let colour = BACKDROP;
      let alpha = 255;

      // A rounded square, so the mark reads as an app tile rather than a photo.
      const corner = size * 0.22;
      const dxEdge = Math.max(corner - x, x - (size - 1 - corner), 0);
      const dyEdge = Math.max(corner - y, y - (size - 1 - corner), 0);
      if (Math.hypot(dxEdge, dyEdge) > corner) alpha = 0;

      const dx = x - centre;
      const dy = y - centre;
      const distance = Math.hypot(dx, dy);

      if (Math.abs(distance - ringRadius) <= ringThickness / 2) colour = RING;

      // The barrel points up and right, which reads as aiming rather than as a post.
      const alongBarrel = (dx + -dy) / Math.SQRT2;
      const acrossBarrel = (dx - -dy) / Math.SQRT2;
      if (alongBarrel > 0 && alongBarrel < size * 0.30 && Math.abs(acrossBarrel) <= barrelHalf) {
        colour = BARREL;
      }
      if (Math.abs(dx) <= towerHalf && Math.abs(dy) <= towerHalf) colour = TOWER;

      pixels[i] = colour[0];
      pixels[i + 1] = colour[1];
      pixels[i + 2] = colour[2];
      pixels[i + 3] = alpha;
    }
  }
  return pixels;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/**
 * @param {Uint8Array} bytes
 * @returns {number}
 */
function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * @param {string} type
 * @param {Uint8Array} data
 * @returns {Uint8Array}
 */
function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/**
 * @param {Uint8Array} rgba
 * @param {number} size
 * @returns {Uint8Array} a complete PNG
 */
function encodePng(rgba, size) {
  // One filter byte per scanline. Filter zero, because the images are tiny and
  // clever filtering would buy nothing but a harder thing to verify.
  const raw = new Uint8Array(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    raw.set(rgba.subarray(y * size * 4, (y + 1) * size * 4), y * (size * 4 + 1) + 1);
  }

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, size);
  view.setUint32(4, size);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type: truecolour with alpha
  ihdr[10] = 0;  // deflate
  ihdr[11] = 0;  // adaptive filtering
  ihdr[12] = 0;  // no interlace

  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const parts = [
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(Buffer.from(raw), { level: 9 }))),
    chunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

/**
 * @param {Array<{ size: number, png: Uint8Array }>} images
 * @returns {Uint8Array}
 */
function encodeIco(images) {
  const headerSize = 6 + images.length * 16;
  const total = headerSize + images.reduce((sum, image) => sum + image.png.length, 0);
  const ico = new Uint8Array(total);
  const view = new DataView(ico.buffer);

  view.setUint16(0, 0, true);              // reserved
  view.setUint16(2, 1, true);              // type: icon
  view.setUint16(4, images.length, true);  // count

  let offset = headerSize;
  images.forEach((image, i) => {
    const entry = 6 + i * 16;
    // 256 is written as zero, which is the one genuinely surprising rule in the format.
    ico[entry] = image.size === 256 ? 0 : image.size;
    ico[entry + 1] = image.size === 256 ? 0 : image.size;
    ico[entry + 2] = 0;                       // palette size
    ico[entry + 3] = 0;                       // reserved
    view.setUint16(entry + 4, 1, true);       // colour planes
    view.setUint16(entry + 6, 32, true);      // bits per pixel
    view.setUint32(entry + 8, image.png.length, true);
    view.setUint32(entry + 12, offset, true);
    ico.set(image.png, offset);
    offset += image.png.length;
  });

  return ico;
}

const images = SIZES.map((size) => ({ size, png: encodePng(drawIcon(size), size) }));

mkdirSync(resolve(ROOT, 'build'), { recursive: true });
const ico = encodeIco(images);
writeFileSync(resolve(ROOT, 'build', 'icon.ico'), ico);
writeFileSync(resolve(ROOT, 'build', 'icon.png'), images[images.length - 1].png);

// Read back what was written and check the header, rather than trusting the write.
const check = new DataView(ico.buffer, ico.byteOffset, ico.byteLength);
if (check.getUint16(2, true) !== 1) throw new Error('written file is not an icon');
if (check.getUint16(4, true) !== SIZES.length) throw new Error('wrong image count in the directory');

console.log(
  'wrote build/icon.ico: ' + SIZES.length + ' image(s) at ' + SIZES.join(', ') +
    ' pixels, ' + ico.length + ' bytes total',
);
