# Handoff

True at the time of writing. Anything here that a reader cannot verify from the
repository itself is a defect in this file.

## What this is

A deterministic tower defense game for Windows, aiming at mechanical and statistical
parity with Roblox Tower Defense Simulator. Plain ES modules with JSDoc types, checked
by TypeScript with no transpile step, so one copy of the code runs in Node checks, a
browser and the desktop shell.

## State

**It plays.** A match runs end to end: place towers, upgrade them, sell them, change
targeting, survive waves, win or lose. Verified by launching the real shell on an
off-screen desktop and capturing the window, not by reading source.

**It ships.** Every push to `main` publishes a uniquely tagged non-draft release with a
real unsigned installer. The installer has been downloaded from the published URL and
confirmed to be 119,225,856 bytes with a valid Windows executable header.

**The site is live** at `https://ding-ding-projects.github.io/tower-defense-desktop/`,
published by its own workflow, with a download button pointing at a verified release
asset.

| | |
| --- | --- |
| Towers | 12, every upgrade level, sourced statistics |
| Enemies | 10, including 3 bosses |
| Maps | 2 |
| Difficulties | 6 |
| Wave schedules | 12 |
| Checks | 159, all passing |
| Lines | ~21,000 across 173 files, per the committed counter |

## Verification state

- `npm run check` runs the type check, the determinism check, data validation, the
  site contract, the documentation bundle and 159 tests. All pass.
- **Continuous integration runs no tests and no lint**, by standing decision. It
  builds, packages, publishes and attaches evidence. Both workflows are green.
- Determinism is proven by replaying the same seed and command log twice and comparing
  a state hash sampled every second, not by asserting it.
- Several guards have been deliberately broken, watched go red, and restored: the
  determinism grep, the state hash's coverage of the generator, the documentation
  bundle, and the download-link rule in four separate ways.

## Open work

Five roadmap items remain, and they are listed in `ROADMAP.md` rather than implied.

The two that matter most to a next owner:

1. **`src/render` and `src/ui` are outside the TypeScript check** and do not pass it:
   JSDoc generics on a constructor, a canvas context used without a null check, a pool
   whose element type does not flow through. They are covered by 51 behaviour checks,
   which is not the same thing. Bringing them in is real work.
2. **Roughly thirty further towers and many more enemies exist in the source game and
   are absent here**, deliberately, rather than approximated. Adding one is a data row
   plus a line in the hand-written manifest in `src/data/loader.js`, which fails loudly
   if a file is added and the manifest is not.

Six statistics could not be sourced and are recorded as unresolved in
`docs/data-sources.md`, with engine defaults shipped in their place and labelled as
such: extra targeting modes, the enemy mitigation model, mark-and-consume pairings,
area damage falloff, what Hardcore changes, and the sell refund percentage.

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

The engine is done; the roster is the work. Pick a tower, run
`node tools/fetch-wiki-stats.mjs <Name>`, add its entry to the overlay in
`tools/generate-data-rows.mjs`, run `node tools/generate-data-rows.mjs`, add the import
to `src/data/loader.js`, and run `npm run check`. If that sequence ever needs a change
under `src/sim`, the data shape is wrong and the shape is what changes.
