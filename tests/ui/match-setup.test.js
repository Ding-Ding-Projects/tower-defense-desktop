/**
 * Every map and every selectable difficulty can be reached from the running program.
 *
 * None of them could. `app.js` took the first map in the loaded data and the first
 * difficulty marked selectable, both were `const`, and nothing changed either -- so one
 * of the two maps and five of the six difficulties were content that is validated, has
 * wave tables generated for it, is proven completable by the end-to-end checks, and was
 * unreachable by anybody actually playing. Restarting after a victory put you back on the
 * same combination you had just finished.
 *
 * It is the cliff-zone defect on a larger scale: content that exists and cannot be got
 * to, invisible from every direction except asking whether a player can reach it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { MatchSetup } from '../../src/ui/match-setup.js';
import { createFakeHost } from '../hud/fake-dom.js';
import { loadGameData } from '../../src/data/loader.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const gameData = loadGameData();

const maps = [...gameData.maps.values()];
const difficulties = [...gameData.difficulties.values()];
const selectable = difficulties.filter((d) => d.selectable);

function setup() {
  const { doc, host } = createFakeHost();
  const ui = new MatchSetup({ maps, difficulties }, doc);
  ui.mount(host);
  // The fake document has no custom element registry, so an `md3-dialog` it creates is a
  // plain element without the `open` and `close` the real component gains on upgrade.
  // Stood in here rather than added to the fake, because a fake DOM that quietly grows
  // one component's API starts claiming to be that component.
  ui.dialog.open = () => { ui.dialog.isOpen = true; };
  ui.dialog.close = () => { ui.dialog.isOpen = false; };
  return ui;
}

/** Every button in a group, by its accessible name. */
const namesOf = (group) => group.buttons.map((b) => b.button.getAttribute('aria-label'));

test('there is more than one of each, or none of this proves anything', () => {
  assert.ok(maps.length > 1, 'only ' + maps.length + ' map(s) on disk');
  assert.ok(selectable.length > 1, 'only ' + selectable.length + ' selectable difficulty(ies)');
});

test('every map on disk is offered', () => {
  const ui = setup();
  assert.deepEqual(
    namesOf(ui.mapButtons).sort(),
    maps.map((m) => 'Map: ' + m.displayName).sort(),
    'the setup screen offers a different set of maps from the ones that exist',
  );
});

test('every selectable difficulty is offered, and the unselectable one is not', () => {
  // Hardcore carries `selectable: false`. In the source game it is unlocked by
  // progression this project does not have, so offering it would be inventing a rule
  // rather than reading one -- and hiding it is only defensible while something else can
  // still reach it, which the end-to-end checks do.
  const ui = setup();
  assert.deepEqual(
    namesOf(ui.difficultyButtons).sort(),
    selectable.map((d) => 'Difficulty: ' + d.displayName).sort(),
  );
  const hidden = difficulties.filter((d) => !d.selectable).map((d) => d.displayName);
  for (const name of hidden) {
    assert.ok(
      !namesOf(ui.difficultyButtons).includes('Difficulty: ' + name),
      name + ' is marked unselectable and is offered anyway',
    );
  }
});

test('the difficulty hidden from the picker is still played by something', () => {
  // Otherwise `selectable: false` is indistinguishable from deleting the row, and a
  // difficulty nothing exercises is a difficulty nothing is checking.
  const hidden = difficulties.filter((d) => !d.selectable).map((d) => d.id);
  if (hidden.length === 0) return;
  const e2e = readFileSync(ROOT + 'tests/e2e/completable.test.js', 'utf8');
  for (const id of hidden) {
    assert.match(
      e2e, new RegExp("'" + id + "'"),
      id + ' is hidden from the picker and played by nothing, so nothing checks it',
    );
  }
});

test('each button says which group it belongs to', () => {
  // Two rows of buttons reading "Crossroads" and "Easy" tell a screen reader nothing
  // about which choice is which.
  const ui = setup();
  for (const name of [...namesOf(ui.mapButtons), ...namesOf(ui.difficultyButtons)]) {
    assert.match(name ?? '', /^(Map|Difficulty): \S/, 'a choice is named ' + JSON.stringify(name));
  }
});

test('exactly one choice in each group is marked as the current one', () => {
  const ui = setup();
  const pressed = (group) =>
    group.buttons.filter((b) => b.button.getAttribute('aria-pressed') === 'true');
  assert.equal(pressed(ui.mapButtons).length, 1);
  assert.equal(pressed(ui.difficultyButtons).length, 1);
});

test('choosing moves the mark, rather than only changing how it looks', () => {
  // The visual state is a `variant` attribute, which is invisible to anything not
  // looking at the screen. aria-pressed is what carries the choice to everyone else.
  const ui = setup();
  const second = ui.difficultyButtons.buttons[1];
  second.button.dispatchEvent({ type: 'click' });

  assert.equal(ui.selectedDifficultyId, second.def.id, 'the choice was not recorded');
  assert.equal(second.button.getAttribute('aria-pressed'), 'true');
  assert.equal(second.button.getAttribute('variant'), 'filled');

  const others = ui.difficultyButtons.buttons.filter((b) => b !== second);
  for (const other of others) {
    assert.equal(
      other.button.getAttribute('aria-pressed'), 'false',
      other.def.id + ' is still marked as chosen as well',
    );
  }
});

test('starting announces the pairing that was actually chosen', () => {
  const ui = setup();
  ui.mapButtons.buttons[1].button.dispatchEvent({ type: 'click' });
  ui.difficultyButtons.buttons[1].button.dispatchEvent({ type: 'click' });

  /** @type {any} */
  let announced = null;
  ui._host.addEventListener('match-setup-start', (e) => { announced = e.detail; });
  ui.startButton.dispatchEvent({ type: 'click' });

  assert.ok(announced, 'starting announced nothing, so app.js is never told what to build');
  assert.equal(announced.mapId, maps[1].id);
  assert.equal(announced.difficultyId, selectable[1].id);
});

test('every offered pairing has a wave table, so none of them is unplayable', () => {
  // A pairing the picker offers and the data cannot fund is a match that starts with
  // nothing to fight. The tables are generated per map AND per difficulty, so the count
  // that matters is the product, not either list on its own.
  const missing = [];
  for (const map of maps) {
    for (const difficulty of selectable) {
      const table = gameData.waveTables.get(map.id + ':' + difficulty.id);
      if (!table || table.waves.length === 0) missing.push(map.id + ':' + difficulty.id);
    }
  }
  assert.deepEqual(missing, [], 'these pairings can be chosen and have no waves: ' + missing.join(', '));
});

test('app.js reaches the setup screen instead of replaying the same match', () => {
  const source = readFileSync(ROOT + 'src/ui/app.js', 'utf8');
  // Both openings, checked separately. A single `assert.match` for `matchSetup.open()`
  // reads as though it covers this and does not: the call appears twice, so deleting the
  // one at startup left the other in the restart handler and the check stayed green.
  const afterLoop = source.slice(source.indexOf('loop.start();'));
  assert.ok(
    afterLoop.includes('matchSetup.open()'),
    'nothing opens the setup screen at startup, so the first match is whatever loaded first',
  );
  const restart = source.slice(
    source.indexOf("addEventListener('game-state-restart'"),
    source.indexOf("addEventListener('match-setup-start'"),
  );
  assert.ok(
    restart.includes('matchSetup.open()'),
    'restarting does not return to the setup screen, so play again means replay the same match',
  );
  assert.match(
    source, /addEventListener\('match-setup-start'/,
    'nothing listens for a chosen pairing, so choosing one does nothing',
  );
  assert.doesNotMatch(
    source, /const mapDef =/,
    'the map is a constant again, so it cannot be changed once the window is open',
  );
});

test('the new module is in the typecheck ratchet', () => {
  const config = JSON.parse(readFileSync(ROOT + 'tsconfig.render.json', 'utf8'));
  assert.ok(
    (config.files ?? []).includes('src/ui/match-setup.js'),
    'match-setup.js is not checked, and a new file has to be clean',
  );
  assert.ok(readdirSync(ROOT + 'src/ui/').includes('match-setup.js'));
});
