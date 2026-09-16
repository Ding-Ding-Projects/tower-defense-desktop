# The build and the release path

The project builds to a single unsigned Squirrel.Windows installer via
`electron-builder`, with a release workflow that is designed to publish, not to
gate on tests. **Status: `package.json` already declares the build scripts and the
`electron-builder` Squirrel configuration; the release workflow itself, the
dependency fetcher, the build verification step and the line counter named in the
project roadmap have not been written yet, and no release has ever been
published.**

## Behaviour

- **No bundler for the game code.** `src/sim` and `src/data` are plain ES modules
  with JSDoc types, checked by TypeScript with `"noEmit": true` and no transpile
  step, so the same source runs in `node --test`, a browser and the Electron main
  and renderer processes without a build step converting it into something else
  first. (This documentation site, under `site/`, is a separate, independently
  built surface with its own scripts and styles; the "no bundler" rule applies to
  its assets too, just for a different reason — nothing here needs one.)
- **Packaging target.** `package.json`'s `build` section targets
  `squirrelWindows` for `x64`, with `forceCodeSigning`, `signExecutable` and
  `signAndEditExecutable` all explicitly `false`. The installer is meant to be
  real — a genuine `Setup.exe`, a `RELEASES` file, and full `.nupkg` — and
  explicitly unsigned; Windows will show an unknown-publisher warning on first run,
  and that is expected, not a defect to hide.
- **Available scripts today.** `npm run typecheck` (TypeScript over `src/sim`,
  `src/data` and `tools`), `npm test` (`node --test tests/`, once tests exist),
  `npm run dist` (`electron-builder --win squirrel --publish never`, once there is
  something to package), and `npm run check` (typecheck, determinism check, data
  validation and tests together, once each of those exists).
- **Continuous integration runs no tests and no lint.** This is the project's own
  standing decision: a workflow is meant to build, package, publish and attach
  evidence, and nothing more. Checking happens locally, before a push, using the
  scripts above; a red local test is still a defect to fix, it is simply never a
  release gate.
- **This documentation site's own build.** `site/` has no build step of its own:
  `site/index.html` loads `site/scripts/app.js` directly as an ES module, which
  imports its sibling modules directly. `tools/check-docs-bundle.mjs` is the one
  generation step in the whole site — it turns `docs/features/*.md` into
  `site/docs-bundle.json` for the offline documentation browser described in the
  update-mechanism and this article's sibling articles.

## Configuration

Packaging configuration lives entirely in `package.json`'s `build` block; there is
no separate build-config file to keep in sync with it.

## Failure modes

- **A stale `site/docs-bundle.json`.** If a documentation article changes on disk
  but the bundle is not regenerated, the offline documentation browser silently
  serves the old copy. `tools/check-docs-bundle.mjs` exists specifically to fail
  when the committed bundle and a freshly generated one disagree, rather than
  trusting that whoever edited the article remembered to regenerate it.
- **An installer that is not actually built by the workflow that publishes it.**
  The project's own standing rule is that every published release must attach a
  genuinely built installer from that run, never a placeholder tag or an asset
  left over from a previous run.
- **A missing dependency assumed to be pre-installed on a build machine.** The
  planned one-click dependency fetcher exists to make the build reproducible from a
  clean machine rather than depending on whatever happens to already be installed.

## Security considerations

The installer is deliberately unsigned; nothing here claims otherwise, in the
installer, in a release note, or on this site's own Download tab, which shows an
explicit unsigned-installer notice rather than implying a Windows SmartScreen
warning means something is wrong. No build or release step transmits a secret,
signs with a shared or purchased certificate, or claims trust it has not earned.

## How to verify

- `npm run typecheck` today; `npm run check` once every script it composes exists.
- `node --test tests/site/` for this site's own pure logic (the contract list, the
  documentation bundle builder, language resolution and the metadata emitter).
- `node tools/check-site-contract.mjs` and `node tools/check-docs-bundle.mjs`,
  which fail non-zero and name exactly what is missing or stale.
- A real release is verified by downloading the published asset and confirming
  its version, tag and installer actually work, not by trusting that a workflow
  ran to completion.

## Suggested articles

- [The update mechanism](./update-mechanism.md)
- [Accessibility](./accessibility.md)
- [Deterministic simulation and replay](./simulation-and-replay.md)
