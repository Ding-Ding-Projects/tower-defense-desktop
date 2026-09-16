#!/usr/bin/env node
/**
 * Generates social-preview.png: a real, product-specific 1200x630 embed graphic for
 * this repository, built entirely from a hand-written pixel buffer and Node's own
 * `zlib` module — no image library, no network fetch, no CDN, no AI image
 * generator. It draws the game's own subject matter (a lane, towers with range
 * rings, enemy markers) and a pixel-font wordmark, then encodes real PNG chunks by
 * hand. Run with `node tools/generate-social-preview.mjs`; it is a one-off content
 * generator, not something the site or its tests run at build time.
 */

import { deflateSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.resolve(__dirname, '..', 'social-preview.png');

const WIDTH = 1200;
const HEIGHT = 630;

// RGBA pixel buffer.
const buf = new Uint8Array(WIDTH * HEIGHT * 4);

function setPixel(x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
  const i = (y * WIDTH + x) * 4;
  buf[i] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
  buf[i + 3] = a;
}

function blendPixel(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
  const i = (y * WIDTH + x) * 4;
  const alpha = a / 255;
  buf[i] = Math.round(buf[i] * (1 - alpha) + r * alpha);
  buf[i + 1] = Math.round(buf[i + 1] * (1 - alpha) + g * alpha);
  buf[i + 2] = Math.round(buf[i + 2] * (1 - alpha) + b * alpha);
  buf[i + 3] = 255;
}

function fillRect(x0, y0, w, h, r, g, b, a = 255) {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) blendPixel(x, y, r, g, b, a);
  }
}

function fillCircleOutline(cx, cy, radius, thickness, r, g, b, a) {
  for (let y = -radius; y <= radius; y += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      const d = Math.sqrt(x * x + y * y);
      if (d <= radius && d >= radius - thickness) blendPixel(cx + x, cy + y, r, g, b, a);
    }
  }
}

function fillTriangle(cx, topY, halfWidth, height, r, g, b, a = 255) {
  for (let row = 0; row < height; row += 1) {
    const t = row / height;
    const w = Math.round(halfWidth * t);
    for (let x = -w; x <= w; x += 1) blendPixel(cx + x, topY + row, r, g, b, a);
  }
}

// --- Background: a vertical gradient from deep teal to a slightly brighter teal,
// the same colour family the site's own default accent uses. ---
for (let y = 0; y < HEIGHT; y += 1) {
  const t = y / HEIGHT;
  const r = Math.round(12 + t * 8);
  const g = Math.round(30 + t * 26);
  const b = Math.round(28 + t * 18);
  for (let x = 0; x < WIDTH; x += 1) setPixel(x, y, r, g, b, 255);
}

// --- A faint grid, evoking the placement grid a tower defense map is built on. ---
for (let x = 0; x < WIDTH; x += 40) fillRect(x, 0, 1, HEIGHT, 255, 255, 255, 10);
for (let y = 0; y < HEIGHT; y += 40) fillRect(0, y, WIDTH, 1, 255, 255, 255, 10);

// --- The lane: a horizontal path band with waypoint markers, roughly where a
// bottom lane would sit on a real map. ---
const laneY = 470;
const laneHeight = 64;
fillRect(0, laneY, WIDTH, laneHeight, 61, 46, 33, 255);
fillRect(0, laneY, WIDTH, 4, 90, 68, 48, 255);
fillRect(0, laneY + laneHeight - 4, WIDTH, 4, 40, 30, 22, 255);
for (let x = 20; x < WIDTH; x += 90) {
  fillRect(x, laneY + laneHeight / 2 - 3, 46, 6, 214, 189, 152, 200);
}

// --- Enemy markers walking the lane: small diamonds. ---
const enemyXs = [180, 340, 560, 760, 980];
for (const ex of enemyXs) {
  const ey = laneY + laneHeight / 2;
  for (let dy = -10; dy <= 10; dy += 1) {
    const w = 10 - Math.abs(dy);
    fillRect(ex - w, ey + dy, w * 2, 1, 224, 90, 74, 255);
  }
}

// --- Towers: triangles with a translucent range ring, placed just above the lane. ---
const towerXs = [260, 520, 880];
for (const tx of towerXs) {
  const baseY = laneY - 26;
  fillCircleOutline(tx, baseY, 78, 2, 234, 247, 242, 40);
  fillTriangle(tx, baseY - 56, 30, 56, 46, 196, 168, 255);
  fillRect(tx - 8, baseY - 12, 16, 16, 30, 96, 82, 255);
}

// --- A 5x7 pixel font, just the glyphs the wordmark needs. Each glyph is 7 rows of
// a 5-bit string; "1" is an ink pixel. ---
const FONT = {
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  N: ['10001', '11001', '10101', '10101', '10011', '10001', '10001'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

function textWidth(text, scale) {
  return text.length * (5 + 1) * scale - scale;
}

function drawText(text, startX, startY, scale, r, g, b, a = 255) {
  let x = startX;
  for (const ch of text) {
    const glyph = FONT[ch];
    if (glyph) {
      for (let row = 0; row < 7; row += 1) {
        for (let col = 0; col < 5; col += 1) {
          if (glyph[row][col] === '1') {
            fillRect(x + col * scale, startY + row * scale, scale, scale, r, g, b, a);
          }
        }
      }
    }
    x += (5 + 1) * scale;
  }
  return x;
}

const line1 = 'TOWER DEFENCE';
const line2 = 'DESKTOP';
const scale1 = 6;
const scale2 = 7;

const line1X = Math.round((WIDTH - textWidth(line1, scale1)) / 2);
const line1Y = 120;
const line2X = Math.round((WIDTH - textWidth(line2, scale2)) / 2);
const line2Y = line1Y + 7 * scale1 + 34;

// Drop shadow, then the actual ink, for legibility against the gradient.
drawText(line1, line1X + 4, line1Y + 4, scale1, 0, 0, 0, 90);
drawText(line1, line1X, line1Y, scale1, 234, 247, 242, 255);
drawText(line2, line2X + 5, line2Y + 5, scale2, 0, 0, 0, 90);
drawText(line2, line2X, line2Y, scale2, 165, 232, 210, 255);

// --- PNG encoding: build raw scanlines (filter byte 0 + RGBA row), deflate them,
// and hand-assemble the IHDR / IDAT / IEND chunks with real CRC32 checksums. ---

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBytes, data, crc]);
}

const rawRowBytes = WIDTH * 4 + 1;
const raw = Buffer.alloc(rawRowBytes * HEIGHT);
for (let y = 0; y < HEIGHT; y += 1) {
  const rowStart = y * rawRowBytes;
  raw[rowStart] = 0; // filter type: none
  const pixelRowStart = y * WIDTH * 4;
  buf.subarray(pixelRowStart, pixelRowStart + WIDTH * 4).forEach((byte, idx) => {
    raw[rowStart + 1 + idx] = byte;
  });
}

const idatData = deflateSync(raw, { level: 9 });

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(WIDTH, 0);
ihdr.writeUInt32BE(HEIGHT, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type: RGBA
ihdr[10] = 0; // compression
ihdr[11] = 0; // filter
ihdr[12] = 0; // interlace

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const png = Buffer.concat([
  signature,
  chunk('IHDR', ihdr),
  chunk('IDAT', idatData),
  chunk('IEND', Buffer.alloc(0)),
]);

await writeFile(OUT_PATH, png);
console.log(`social-preview.png: wrote ${png.length} bytes (${WIDTH}x${HEIGHT}) to ${OUT_PATH}`);
