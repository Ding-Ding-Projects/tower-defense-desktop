# The data model, and where the statistics come from

Towers, enemies, maps, waves, difficulties and status effects are all meant to be
validated JSON rows rather than code, defined by the JSDoc typedefs in
`src/data/schema/types.js`. **Status: the shapes are fully defined and type-checked;
no concrete tower, enemy, map or wave-table JSON exists in the repository yet, and
the validator that will load and check those rows (`tools/validate-data.mjs`, wired
into `npm run validate:data`) has not been written.** The goal named in the
project's own README is that adding a new tower should be adding a data row, never a
change to `src/sim`.

## Behaviour

- **Every row is typed, not just shaped by convention.** `TowerDef`, `EnemyDef`,
  `MapDef`, `WaveTable`, `DifficultyDef` and `StatusDef` are JSDoc typedefs checked
  by TypeScript in `--checkJs` mode with no transpile step, so a system reading a
  field no row actually has is a type error, not a runtime surprise discovered
  during a match.
- **Every top-level row carries a `Source`.** A required `source` block records the
  wiki URL a statistic was read from and the date it was retrieved
  (`wikiUrl`, `retrievedAt`, with optional `wikiRevision` and `notes`). This exists
  because the project claims statistical parity with a live game that receives
  balance patches: a number with no citation is treated as a rumour, not a fact,
  and is not accepted into the roster.
- **Synergy is generic, not hardcoded.** A tower's bonus against another tower's tag
  (`bonusVsTag: { tag, damageMultiplier }`) and an aura's target stat
  (`AuraDef.stat`) are both open-ended strings and enums rather than a fixed list of
  named tower pairs, so a new combination is meant to be two data rows, not a new
  branch in the damage system.
- **Six statistics are explicitly unresolved rather than guessed.** Additional
  targeting modes beyond the five named in the schema, the exact enemy mitigation
  model, mark-and-consume synergy pairings, whether area damage falls off with
  distance, what the Hardcore difficulty actually changes, and the sell refund
  percentage are all open questions being sourced rather than assumed. Their
  resolution is tracked in `docs/data-sources.md` in the project root (owned by the
  data lane, not this documentation set).

## Configuration

There is no runtime configuration for the data model itself; the schema is fixed.
What is configurable is the content: every tower, enemy, map, wave table and
difficulty is a plain JSON file that the planned loader reads into the frozen
`GameData` registries (`Map<string, TowerDef>` and so on) described in the schema's
`GameData` typedef.

## Failure modes

- **An uncited number.** A row missing its `source` block, or one whose `source` is
  a placeholder rather than a real wiki URL and retrieval date, is a data defect:
  the whole point of the field is that a statistic can be traced back to where it
  came from.
- **A dangling reference.** A tower's `placementPool`, an enemy's status id in
  `immunities`, or a wave group's `enemyId` that does not match any loaded row is
  meant to be caught by the planned validator's referential-integrity check before
  the game ever starts, rather than surfacing as a crash mid-match.
- **An invalid placement polygon.** A `PlacementZone.polygon` that is not a simple,
  non-self-intersecting shape is a geometry error the planned validator is meant to
  reject at load time.
- **A guessed statistic entering the roster.** The project's own standing rule is
  that the six open questions above get resolved from a real source or explicitly
  recorded as unresolved — never quietly assumed so a tower "looks about right".

## Security considerations

Data files are loaded from the application's own bundled files, not fetched from
the network at runtime, so there is no remote data-injection surface. The main risk
is content-level, not security-level: an uncited or fabricated statistic silently
undermining the project's own claim of parity with the source game.

## How to verify

- `npm run typecheck` runs TypeScript in check-only mode over `src/data/**/*.js`,
  which is what actually enforces every row against its typedef today.
- Once written, `npm run validate:data` is meant to load every row, check every
  `source` block is present and every cross-reference resolves, and report every
  violation rather than stopping at the first one.
- Until real tower, enemy, map and wave-table rows exist, there is nothing yet for
  the validator to validate; this article will be updated once that changes.

## Suggested articles

- [Towers and upgrades](./towers-and-upgrades.md)
- [Enemies and status effects](./enemies-and-statuses.md)
- [Maps and placement](./maps-and-placement.md)
- [Waves and difficulties](./waves-and-difficulties.md)
