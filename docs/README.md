# Documentation

One article per feature, each covering behaviour, configuration, failure modes,
security considerations and how to verify it, and each ending with a short list of
suggested next articles. These are the same articles the site's Documentation tab
loads offline from `site/docs-bundle.json` (generated from the files below by
`tools/check-docs-bundle.mjs`) — reading them here on GitHub and reading them in
the built site or the packaged desktop application shows the same content.

Every article is written to be honest about what actually exists in the repository
right now versus what is designed but not yet built. This project is early
construction (see the root `HANDOFF.md` and `ROADMAP.md`); most game mechanics
described below are still schema and intent, not running code, and each article
says so plainly rather than implying otherwise.

## Features

| Article | Covers |
| --- | --- |
| [`simulation-and-replay.md`](./features/simulation-and-replay.md) | The fixed-tick, seeded, fixed-point deterministic simulation, and replay from a seed and command log |
| [`data-model.md`](./features/data-model.md) | The validated data-row schema every tower, enemy, map, wave table and difficulty is built from, and its provenance requirement |
| [`towers-and-upgrades.md`](./features/towers-and-upgrades.md) | Tower placement, targeting, per-level stats, auras, abilities and income |
| [`enemies-and-statuses.md`](./features/enemies-and-statuses.md) | Enemy stats, detection and traversal flags, boss abilities, and status effects |
| [`maps-and-placement.md`](./features/maps-and-placement.md) | Lanes, waypoints, placement zones and footprint collision |
| [`waves-and-difficulties.md`](./features/waves-and-difficulties.md) | Wave groups and timing, and per-difficulty scaling and restrictions |
| [`economy.md`](./features/economy.md) | Starting cash, kill reward, wave completion bonus, income towers and the cash multiplier |
| [`accessibility.md`](./features/accessibility.md) | What this site ships today versus what the desktop game interface still needs to build |
| [`build-and-release.md`](./features/build-and-release.md) | The no-bundler build, the unsigned Squirrel.Windows packaging target, and the release workflow |
| [`update-mechanism.md`](./features/update-mechanism.md) | The intended Chrome-style automatic update flow, not yet built |

Two more articles are expected here as the other parallel lanes land, and are
intentionally not linked above until they exist, so this index never points at a
file that is not there yet:

- **`interface.md`** — the desktop game's own Material Design 3 shop, tower panel
  and heads-up display; owned and written by the interface/renderer lane, not this
  one.
- **`../data-sources.md`** (repository root, not under `features/`) — the six open
  statistical questions referenced throughout the articles above (additional
  targeting modes, the enemy mitigation model, mark-and-consume synergy, area
  damage falloff, what Hardcore actually changes, and the sell refund percentage),
  owned by the data lane.

## Scope of the language modes

This documentation is written in English. The site around it (navigation, feature
summaries, settings, the landing page) supports English, Cantonese and a bilingual
mode; full article-body translation is out of scope for now given the volume of
technical text involved; if that changes, this note will be removed rather than
left stale.

## Completeness

`tools/check-docs-bundle.mjs` regenerates the bundle from every file under
`docs/features/*.md` and fails if the committed `site/docs-bundle.json` does not
match — an article added or edited here without regenerating the bundle is caught
by that check, not discovered later by someone noticing the site looks out of date.
