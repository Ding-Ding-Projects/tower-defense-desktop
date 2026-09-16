# Towers and upgrades

A tower is a `TowerDef` row: a placement rule, a list of targeting modes it can use,
and an ordered list of `TowerLevel` rows describing what it does at each upgrade
level. **Status: the shape is fully defined in `src/data/schema/types.js`; no
concrete tower exists as data yet, and the combat systems that would read these
fields (targeting, firing, area/pierce/chain, auras, abilities) are still designed,
not implemented.**

## Behaviour

- **Placement.** `allowedTerrain` (`ground`, `water`, `cliff`) restricts where a
  tower can stand; `footprintRadius` is meant to prevent two towers overlapping;
  `placementPool` and `maxCount` let towers share a cap (several towers sharing one
  pool share its limit, rather than each having an independent count) or be
  uncapped (`maxCount: null`).
- **Targeting.** Each tower declares which of the five targeting modes it can use
  (`first`, `last`, `closest`, `strongest`, `weakest`); the sixth-and-beyond
  question of whether more modes exist is one of the open statistical questions
  tracked in the data model article.
- **Per-level stats.** Every `TowerLevel` is a complete row: `cost` to reach that
  level from the previous one, `damage`, `fireRate`, `range`, and whether it
  `detectsHidden` or `hitsAir`. Optional fields layer on more specific behaviour:
  `spinUpSeconds` (time to reach full fire rate after acquiring a target),
  `burstCount` and `reloadSeconds` (fire a burst, then pause), `projectileSpeed`
  (omitted means the shot is hitscan), `aoeRadius`, `pierceCount`, `chainCount` and
  `chainRadius`, `appliesStatuses` with `statusDurationSeconds`, and
  `bonusVsTag: { tag, damageMultiplier }` for tag-based synergy.
- **Income towers.** A level can carry `incomePerWave` instead of, or alongside,
  combat stats, for towers whose job is generating cash rather than dealing
  damage.
- **Auras.** A level can carry an `AuraDef`: a `stat` it affects (`damage`,
  `fireRate`, `range` or `income`), a `mode` (`additive`, `multiplicative` or
  `highest`), a `radius` and a `value`. Effective stats are meant to be recomputed
  from the live set of nearby auras every tick rather than mutated in place, so
  stacking multiple auras is a pure function of the current board and a replay can
  re-derive it exactly rather than depending on the order auras were placed in.
- **Abilities.** A level can carry an `AbilityDef`: an id, a display name, a
  cooldown, an effect kind (`damageBurst`, `healBase`, `buffPulse` or
  `stunPulse`), a magnitude, and optionally a radius and duration.
- **Sell.** `sellRefundPercent` on the tower row is meant to govern how much of the
  total spent on a tower is returned when it is sold; the exact percentage is one
  of the six open statistical questions, not yet finalised.

## Configuration

Towers are pure data: adding one is meant to be adding a JSON file with a `source`
block per statistic, not writing code. The intended validation path is the planned
data validator described in the data model article.

## Failure modes

- **A level with contradictory fields**, for example `projectileSpeed` set on a
  tower described as hitscan, or `burstCount` with no `reloadSeconds`, is the kind
  of shape error the schema cannot catch by itself (both are individually valid
  optional fields) and the planned validator is meant to flag as suspicious.
- **An aura loop or an unbounded stack.** Because effective stats are recomputed
  from the live aura set every tick, a tower whose aura affects a stat that in turn
  changes what auras are active nearby would need to converge in one pass; the
  design intent is that aura effects are read-only inputs to the recomputation, not
  values auras themselves depend on, specifically to avoid this.
- **A `bonusVsTag` with no matching tag anywhere in the enemy roster**, which the
  planned validator's referential-integrity check is meant to catch, since a bonus
  that can never apply is very likely a typo.

## Security considerations

Not applicable beyond the data-model article's: tower data loads locally from the
application bundle, with no network or user-supplied input at runtime.

## How to verify

- `npm run typecheck` checks every `TowerDef` and `TowerLevel` field against the
  schema today.
- Once towers exist as data and the combat systems are built, the plan is
  determinism tests that place a tower, run several ticks with a fixed seed, and
  assert the resulting damage and target sequence match a recorded expectation.

## Suggested articles

- [The data model, and where the statistics come from](./data-model.md)
- [Enemies and status effects](./enemies-and-statuses.md)
- [The economy](./economy.md)
