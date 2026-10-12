# Handoff

True at the time of writing. Anything here that a reader cannot verify from the
repository itself is a defect in this file.

## What this is

A deterministic tower defense game for Windows, aiming at mechanical and statistical
parity with Roblox Tower Defense Simulator. Plain ES modules with JSDoc types, checked
by TypeScript with no transpile step, so one copy of the code runs in Node checks, a
browser and the desktop shell.

## Verification state

Fresh local verification on 2026-10-12 started from main
`488faad216fe2f6c99eb683c5baa0be4d312fd72`: `npm run check` passed all three TypeScript
projects, determinism, data validation, site and documentation checks, and 462 tests.
The coverage guard added in this update contributes one further test. Run the command
again after changes rather than relying on a frozen test count.

All 43 current JavaScript modules under `src/render` and `src/ui` are included in the strict
TypeScript check. `tests/ui/typecheck-ratchet.test.js` protects the historical list
and scans both directories for regular `.js` files, so a new file of that format
cannot silently escape the check. Symlinks and other module extensions are not
covered by this guard; neither is present in these directories.
An intentionally unlisted module passed the old guard and failed the new guard;
the temporary module was removed afterward.

The current data manifest contains 20 towers, 10 enemies, 2 maps, 6 difficulties and
12 wave schedules. The local checks include headless match and seeded replay checks.
They do not establish that the current Windows installer launches or plays correctly.

Earlier work recorded real-shell captures and a published unsigned installer download.
Those are historical evidence, not fresh native validation of this update. Windows
packaging, installation, current release assets and live deployment were not rerun in
this Linux verification. Continuous integration runs no tests and no lint by standing
decision; checks must run locally before a push.

## Open work

`ROADMAP.md` records the current gaps. The following summarizes the committed
roadmap and `docs/data-sources.md`; external Roblox/wiki sources were not refreshed
or independently reverified in this update. In particular:

- Seven named tower additions remain blocked on missing mechanics or conflicting
  source data; the shipped roster is incomplete.
- `shieldPhase` and `heal` have no shipped enemy user, and Mortar/Ranger scatter
  effects remain unmodelled.
- A recording of the real built program remains outstanding.
- Five source-mechanics questions remain unresolved in `docs/data-sources.md`.
  The sixth, sell refund, is recorded there as one third, truncated, rather than the
  old 70 percent engine default.

Passing local checks does not close the full playable-release issue or replace the
required native Windows validation.

## Things that will bite you

- **The site's download link lags by one release.** Every push publishes a new
  release, so the link the site carries is one behind until `node
  tools/update-site-release.mjs` runs again. The alternative is the release workflow
  committing to the branch that triggers it, which is how a build loop starts.
- **The desktop runtime goes missing after a clean install** and the install exits
  zero, because the package manager blocks install scripts. `scripts/ensure-electron-binary.mjs`
  repairs it and is wired into the dependency fetcher. If the application will not
  start, run that first.
- **The wiki throttles.** The statistics fetchers retry and assert a minimum response
  length, because a truncated page arrives looking like a page with no tables on it.
- **`electron-builder` writes into `release/squirrel-windows/`**, not `release/`.
  A flat search reports that no installer was produced about an installer that was.

## Next owner

Check the open mechanics and source-data blockers in `ROADMAP.md` before adding a
tower. For an addition the current schema can represent, run
`node tools/fetch-wiki-stats.mjs <Name>`, add its entry to the overlay in
`tools/generate-data-rows.mjs`, run `node tools/generate-data-rows.mjs`, add the import
to `src/data/loader.js`, and run `npm run check`. If that sequence ever needs a change
under `src/sim`, the data shape is wrong and the shape is what changes.
