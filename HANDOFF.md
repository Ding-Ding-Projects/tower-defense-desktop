# Handoff

Written to be true at the moment of writing. Anything below that a reader cannot
verify from the repository itself is a defect in this file.

## What this is

A deterministic tower defense game for Windows, aiming at mechanical and statistical
parity with Roblox Tower Defense Simulator. Plain ES modules with JSDoc types, checked
by TypeScript with no transpile step, so one copy of the code runs in Node tests, a
browser and the desktop shell.

## State right now

Early construction. Five parallel lanes are in flight, each on its own branch and its
own linked working tree:

| Branch | Scope |
| --- | --- |
| `lane/sim` | simulation state, systems, snapshot, replay, determinism check |
| `lane/data` | cited data rows, loader, validator |
| `lane/shell` | desktop main process, build scripts, release workflow, line counter |
| `lane/render` | canvas renderer and the game interface |
| `lane/site` | landing and documentation site, embed graphic, completeness checks |

`main` carries only the foundation: the random generator, the fixed-point helpers and
the data row shapes. Nothing is playable yet and no release exists.

## Verification state

- Test suites: none written yet on `main`. Each lane writes its own.
- Continuous integration: the workflow deliberately runs no tests and no lint. It
  builds, packages, publishes and attaches evidence. That is a standing decision, not
  an oversight. Checking happens locally before a push.
- Published release: none. The site must therefore show an honest no-release state
  rather than a guessed download URL.

## Known open questions

Six statistics could not be assumed and are being sourced rather than guessed:
additional targeting modes beyond the five, the enemy mitigation model, mark and
consume synergy pairings, whether area damage falls off with distance, what Hardcore
actually changes, and the sell refund percentage. Their resolution lands in
`docs/data-sources.md`.

## Next owner

Integrate the five lanes into `main` in dependency order: data and simulation first,
then the renderer against the real simulation interface rather than its stub, then the
shell, then the site. Reconcile the renderer's expected simulation interface with what
the simulation lane actually exported before merging either.
