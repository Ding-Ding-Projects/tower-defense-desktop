# Waves and difficulties

A `WaveTable` is a per-map, per-difficulty list of `WaveDef` rows, each made of
timed `WaveGroup` entries; a `DifficultyDef` is a separate row that scales cash and
enemy stats and can disallow specific towers outright. **Status: both shapes are
fully defined in `src/data/schema/types.js`; no concrete wave table or difficulty
exists as data yet, and the wave director that would read these fields is still
designed, not implemented.**

## Behaviour

- **Wave groups.** A `WaveGroup` names an `enemyId`, a `count`, a
  `spawnIntervalSeconds` between individual spawns within the group, a
  `startDelaySeconds` before the group begins, and which `lane` it spawns into. A
  wave can contain several groups spawning on independent timers and lanes at once.
- **Wave structure.** A `WaveDef` has an `index`, an `intermissionSeconds` before
  it starts, a `completionBonus` paid once every enemy in the wave is dealt with,
  and its list of groups.
- **Wave tables are keyed by map and difficulty.** The frozen `GameData.waveTables`
  registry is keyed `${mapId}:${difficultyId}`, so the same map can have a
  completely different wave table per difficulty rather than one table that is
  merely rescaled.
- **Difficulty scaling.** A `DifficultyDef` carries `startingCash`,
  `cashMultiplier`, `enemyHpMultiplier` and `enemySpeedMultiplier`, applied on top
  of a wave table's and an enemy's own base numbers. `selectable` marks whether a
  difficulty can be chosen directly (a difficulty that exists only as an internal
  step, for instance, could be `selectable: false`).
- **Lives override.** `livesOverride` lets a difficulty replace a map's own
  `baseLives` outright (`null` means "use the map's own value"); this is one of the
  concrete mechanisms behind the open question of what the Hardcore difficulty
  actually changes.
- **Disallowed towers.** `disallowedTowers` is a list of tower ids a difficulty
  forbids placing at all, which is a second concrete mechanism under the same
  open question.
- **Win and loss.** A match is meant to be won once every wave in the table is
  cleared, and lost once lives reach zero; lives start from either the map's
  `baseLives` or the active difficulty's `livesOverride`.

## Configuration

Wave tables and difficulties are pure data, validated the same way every other row
is (see the data model article). Balancing a difficulty is meant to mean editing
its multipliers, not writing code.

## Failure modes

- **A wave group naming an enemy id or a lane id that does not exist** in the
  target map's `MapDef` or the loaded enemy registry, which the planned validator's
  referential-integrity check is meant to catch.
- **A wave table missing for a selectable difficulty on a given map**, which would
  leave that map/difficulty combination with nothing to play, and is exactly the
  kind of gap a completeness check over `${mapId}:${difficultyId}` keys is meant to
  surface before release rather than a player discovering it mid-session.
- **A `disallowedTowers` entry that names a tower id that does not exist**, the
  same class of dangling-reference error as elsewhere in the data model.

## Security considerations

Not applicable beyond the data-model article's: wave and difficulty data loads
locally from the application bundle, with no network or user-supplied input at
runtime.

## How to verify

- `npm run typecheck` checks every `WaveDef`, `WaveGroup`, `WaveTable` and
  `DifficultyDef` field against the schema today.
- Once wave tables exist as data and the wave director is built, the plan is a test
  that runs a fixed wave table against the deterministic simulation and asserts the
  spawn sequence, timing and completion bonus match a recorded expectation.

## Suggested articles

- [The economy](./economy.md)
- [Maps and placement](./maps-and-placement.md)
- [The data model, and where the statistics come from](./data-model.md)
