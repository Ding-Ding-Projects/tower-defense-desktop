/**
 * The list of render and interface modules that pass the TypeScript check only grows.
 *
 * `src/render` and `src/ui` were written while the check covered the simulation and
 * its data only, and bringing all of them in at once means 800 errors. Most are missing
 * annotations rather than defects, but roughly 280 are real: values used without a null
 * check, properties read off the wrong shape, types that do not flow.
 *
 * Rather than loosen the check until it goes quiet, or leave the whole directory
 * outside it indefinitely, `tsconfig.render.json` carries an explicit list of the files
 * that DO pass, and that list is a ratchet. A new file has to be clean. An existing
 * one gets cleaned when somebody touches it. The number can only go up.
 *
 * This check is what makes it a ratchet rather than a good intention: quietly removing
 * a file from the list to make a red check green is exactly the move it refuses.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const config = JSON.parse(readFileSync(ROOT + 'tsconfig.render.json', 'utf8'));

/**
 * Every file that has been brought into the check so far.
 *
 * Hand-written, and deliberately duplicated from the config rather than read out of it.
 * A check that reads its expectations from the thing it is checking cannot notice a
 * deletion: the list would shrink and the comparison would still pass. This copy is the
 * memory of what was true.
 */
const RATCHETED_IN = [
  'src/render/art/cache.js',
  'src/render/art/noise.js',
  'src/render/camera.js',
  'src/render/hud/a11y-mirror.js',
  'src/render/hud/derive.js',
  'src/render/hud/layout.js',
  'src/render/interpolation.js',
  'src/render/object-pool.js',
  'src/render/sim-interface.js',
  'src/render/sim-source.js',
  'src/render/view-model.js',
  'src/ui/affordability.js',
  'src/ui/hud.js',
  'src/ui/shop.js',
  'src/ui/targeting.js',
];

test('every file the ratchet has claimed is still in the TypeScript config', () => {
  const listed = new Set(config.files ?? []);
  const dropped = RATCHETED_IN.filter((file) => !listed.has(file));
  assert.deepEqual(
    dropped,
    [],
    'these files were passing the check and have been removed from it: ' + dropped.join(', '),
  );
});

test('every file the config claims actually exists', () => {
  for (const file of config.files ?? []) {
    assert.ok(existsSync(ROOT + file), file + ' is in tsconfig.render.json but not on disk');
  }
});

test('the config checks the files against the DOM, since this is the browser half', () => {
  // Without the DOM library every canvas and element reference is an unknown name, and
  // the check would pass by failing to understand the code rather than by approving it.
  const libs = config.compilerOptions?.lib ?? [];
  assert.ok(libs.includes('DOM'), 'the render check must include the DOM library, got ' + libs.join(', '));
});

test('the ratchet is wired into the typecheck script, not just sitting in a file', () => {
  const pkg = JSON.parse(readFileSync(ROOT + 'package.json', 'utf8'));
  assert.match(
    pkg.scripts.typecheck,
    /tsconfig\.render\.json/,
    'tsconfig.render.json exists but nothing runs it, which is the same as not having it',
  );
});
