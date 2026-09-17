# Render lane: canvas renderer and game interface

Owns `src/render/**`, `src/ui/**`, `index.html`, `styles.css`, `tests/ui/**`.

## Architecture

```
src/render/sim-interface.js  documented contract (typedefs + SIM_TICK_HZ) this lane expects from src/sim
src/render/sim-source.js     the seam: adapts the real src/sim to the shape above

src/render/interpolation.js  lerp / lerpAngle / computeAlpha / SnapshotBuffer  (pure, tested)
src/render/camera.js         pan / zoom / clamp-to-map / world<->screen        (pure, tested)
src/render/object-pool.js    fixed-capacity pool used by projectiles/particles (pure, tested)
src/render/view-model.js     two snapshots + alpha -> render-ready ViewModel   (pure, tested)
src/render/art/*             procedural terrain, path, tower and enemy sprites, cached
src/render/particles.js      pooled hit particles + floating damage numbers
src/render/renderer.js       CanvasRenderer: draws a ViewModel each frame
src/render/loop.js           requestAnimationFrame loop, decoupled from the 30 Hz sim tick

src/ui/affordability.js      shop/upgrade/sell derivation                     (pure, tested)
src/ui/targeting.js          the 5-mode targeting cycle                       (pure, tested)
src/ui/components/           md3-button, md3-icon-button, md3-switch, md3-dialog (real MD3 primitives)
src/ui/titlebar.js, shop.js, hud.js, selected-tower-panel.js, game-states.js, pause-settings.js
src/ui/app.js                bootstrap: wires all of the above into index.html
```

Pure logic (`interpolation.js`, `camera.js`, `object-pool.js`, `view-model.js`,
`affordability.js`, `targeting.js`) is covered by `tests/ui/*.test.js` under
`node --test`. Canvas drawing, DOM wiring and `app.js` are runtime/integration
code and are verified by driving the real built app headlessly and capturing screenshots of
it, not by a unit test — you cannot meaningfully assert on canvas pixels with
`node --test`, and the instructions for this lane say so explicitly.

## The sim contract (proposal for the simulation lane)

`src/sim/core/match.js` and `src/sim/state/snapshot.js` are the real simulation,
and `sim-source.js` adapts them to the shape documented in `sim-interface.js`.
This lane was originally built against a local stub implementing the same shape;
the stub has been removed now that the thing it stood in for exists. The contract
it was written against is this:

- `createMatch({ seed, mapId, difficultyId, gameData }) -> state`
- `submitCommand(state, command)` — enqueues only, never mutates synchronously
- `tick(state)` — advances exactly one 30 Hz step
- `snapshot(state) -> Snapshot` — a plain, JSON-serialisable object; positions are
  fixed-point integers (`src/sim/core/fixed.js`), converted with `fromFixed` only
  in the renderer, never earlier

`Snapshot` carries `tick`, `simTimeSeconds`, `cash`, `lives`, `waveIndex`,
`phase` (`'intermission'|'active'|'victory'|'defeat'`),
`intermissionSecondsRemaining`, `mapId`, `difficultyId`, and arrays of
`towers` / `enemies` / `projectiles`, each entity carrying a stable `id` (used
for interpolation identity across ticks) plus fixed-point `x`/`y`. It also
carries `events`: one-shot occurrences since the previous snapshot
(`damageDealt`, `kill`, `leak`, `towerFired`, `abilityCast`, `towerPlaced`,
`towerSold`) that drive floating damage numbers, hit particles, muzzle flashes
and the leak flash. Full field list is the JSDoc in `sim-interface.js`.

That list is now held to what actually happens, in three directions at once,
because for a long time it was fiction in both. `abilityCast`, `towerPlaced`
and `towerSold` were declared here and emitted by nothing. `towerFired` was the
reverse: the renderer had a branch for it driving `drawMuzzleFlash`, a finished
piece of art that had never once been called, and this union did not list it at
all. Nothing was red, because `_handleEvent` took its event as `any` — which
turns a comparison against a type outside the union from a compile error into a
comparison that is simply never true, and reads on the page as a feature.

`tests/render/event-coverage.test.js` holds the set the simulation emits, the
set this union declares, the second copy of that union inside the simulation,
and the set the renderer draws for, and fails when any two disagree. It also
requires the handler to keep its real type, since the `any` is what made the
drift invisible. `tests/sim/events.test.js` then plays the shipped game and
counts what arrives, because four lists of strings agreeing proves only that
four lists agree.

`Command` is a closed union: `placeTower`, `sellTower`, `upgradeTower`,
`setTargetingMode`, `castAbility`, `skipIntermission`. The renderer and UI never
call anything else on simulation state, and never read simulation state outside
of `snapshot()`'s return value.

**When `src/sim` lands**, the whole migration is editing `sim-source.js`:

```js
export { createMatch, submitCommand, tick } from '../sim/core/match.js';
export { snapshot } from '../sim/state/snapshot.js';
```

`getGameData()` (currently `getStubGameData` from the stub) will need a real
equivalent once `src/data`'s loader exists too — right now the stub hands back
a `Map`-shaped `GameData` with exactly one tower and one enemy so the shop,
selected-tower panel and renderer have something real to iterate.

## Interpolation model

The simulation ticks at a fixed 30 Hz; the render loop runs on
`requestAnimationFrame` at whatever the monitor's refresh rate is.
`SnapshotBuffer` keeps the last two snapshots and their wall-clock arrival
times; `computeAlpha(now, prevAt, nextAt)` turns "now" into a 0..1 blend factor,
clamped. Deliberately: once `now` passes the newer snapshot's arrival time
(the sim tick is running late relative to the render loop), alpha clamps at 1
and the renderer holds the last known position rather than extrapolating a
guess. That is a held frame under jitter, never a wrong one.

`view-model.js#buildViewModel(prev, next, alpha)` is the pure function that
turns that blend into render-ready positions, matching entities between the two
snapshots by `id`. An entity present only in `next` (just spawned) renders at
its exact spawn position with no lerp; an entity missing from `next` (died,
leaked, sold) simply is not in the output.

## Material Design 3

There is no MD3 component library dependency available to this lane (it does
not own `package.json` and no dependency may be added there), so
`src/ui/components/` implements the primitives this project actually needs as
real custom elements with shadow DOM and real underlying browser controls:

- `md3-button` — a real `<button>` inside shadow DOM: filled/tonal/outlined/text
  variants, a real state layer, `:focus-visible` ring, native disabled/keyboard
  semantics.
- `md3-icon-button` — same, compact and circular, procedural inline-SVG glyphs
  (no fetched icon font), requires `aria-label`.
- `md3-switch` — a real `<input type="checkbox" role="switch">` under a styled
  track/thumb.
- `md3-dialog` — wraps the real `<dialog>` element, so modal focus trapping,
  ESC-to-close and backdrop are the browser's, not reimplemented.

Sliders (settings volume) use a real native `<input type="range">` styled with
`accent-color`, which is a genuine browser slider primitive, not a styled div.
Colour, typography, shape and elevation are CSS custom properties in
`styles.css` (`--md-sys-color-*`, `--md-sys-shape-*`), with a
`prefers-color-scheme: dark` block for dark theme. Functional data colours
(health bar red/yellow/green, targeting/role tints on tower sprites) are exempt
from the "chrome must be MD3" rule as data encodings, per the shared
instructions.

## Keyboard and accessibility

- Canvas: focusable (`tabindex="0"`), arrow keys pan, `+`/`-` zoom, `Escape`
  cancels placement or clears the current selection.
- Every button is a real `<button>` under the hood (keyboard-activatable,
  focus-visible ring, correct disabled semantics via the `disabled` property).
- `prefers-reduced-motion: reduce` disables CSS transitions globally and turns
  off particle emission in the renderer (`renderer.reducedMotion`); the settings
  dialog also exposes an explicit in-app override switch, seeded from the OS
  preference.
- The shop, selected-tower panel and HUD are never blank: every disabled shop
  entry carries a real reason (`"Need 40 more cash"`, `"Pool limit reached (2)"`,
  `"Not allowed on this difficulty"`), and every wave/victory/defeat state is a
  real dialog with real copy, never an empty overlay.

## Layout and clipping

Declared minimum window: 960 x 600 CSS px (`html, body { min-width; min-height }`
in `styles.css`). The sidebar narrows at `max-width: 1040px` rather than
clipping. Verify at 100%, 125%, 150% and 200% display scale and at the declared
minimum size before calling a layout change done — this lane does not ship a
capture harness of its own; use the project's `diagnose-built-ui-layout` /
`verify-desktop-material-change` route once the desktop shell lane's build is
wired up.

## What is stubbed, and why

- **Nothing, any more.** The simulation stub that used to stand in here was one
  tower, one enemy and one lane, and its own note said it was not meant to
  survive contact with the real `src/sim`. It did not: the real simulation is
  wired in and the stub has been removed, along with a superseded sprite module
  that the art directory replaced. Both are in the Git history if a reason to
  want them back ever appears.
- **Game data** (`getStubGameData`): a two-entry `GameData`-shaped `Map` set,
  standing in for `src/data`'s loader and validator, which do not exist yet
  either.
- **Difficulty-based `disallowedTowers`**: `app.js` currently always passes `[]`
  to the shop panel because no difficulty data exists yet; `deriveShopEntryState`
  already supports the real list and is tested against it.

## Watched Chuts

`deriveSellValue` and the `clampCamera` map-bigger-than-viewport test both
failed for real during development before being fixed: the first was a genuine
floating-point bug in this lane's own code (`Math.floor(spent * (percent /
100))` lost a cent to `70 / 100` not being exact in a double; fixed by
multiplying the integers first), the second was a bug in the test's own
assertion (it asserted the clamp-branch formula on an axis that actually hit
the centering branch). Both were watched red, fixed, and watched green again.
`cycleTargetingMode` was also deliberately sabotaged (the wrap-around branch
short-circuited to always return the current mode) to confirm its guard
actually fails when the implementation is wrong, then restored.

## What a still capture cannot show

The feedback layer is mostly made of effects that last a fraction of a second: a muzzle
flash lives 120ms, an impact spark 220ms. Catching one in a screenshot is luck, and a
capture that happens to miss them all is not evidence that they are absent.

So the proof is not a picture. `tests/render/art-reached.test.js` plays a real match on
the shipped data, one tick at a time, feeds every snapshot event into the real renderer
against a recording canvas, and fails if any effect the renderer can draw is never
produced, if any effect produced is never drawn, or if a full match never reaches one.
The captures in the readme are illustration; that check is the evidence.

A screen recording would show the whole layer at once and remains the honest gap. It is
recorded in `ROADMAP.md` as blocked rather than skipped: the capture route records
monitors, the program runs on an off-screen desktop, and no encoder is installed.

## Suggested articles

- [The deterministic simulation and replay](simulation-and-replay.md) — what the interface is actually reading, and why it may only read.
- [Towers and upgrades](towers-and-upgrades.md) — where the shop's costs, stats and disabled reasons come from.
- [Maps and placement](maps-and-placement.md) — the terrain rules behind every refused placement.
- [Accessibility](accessibility.md) — the keyboard, focus and motion rules this surface has to meet.
