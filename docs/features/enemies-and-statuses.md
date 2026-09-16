# Enemies and status effects

An enemy is an `EnemyDef` row: base stats, flags for how it can be targeted, a list
of immunities and a list of abilities. A status effect is a separate `StatusDef`
row that any tower or ability can apply by id, rather than being bound to one
specific tower. **Status: both shapes are fully defined in
`src/data/schema/types.js`; no concrete enemy exists as data yet, and the systems
that would apply damage, statuses and abilities are still designed, not
implemented.**

## Behaviour

- **Base stats.** `maxHp`, `shieldHp`, `defense` (a flat reduction applied per hit,
  after shield), `speed`, `leakDamage` (base lives lost if it reaches the end of
  its lane) and `killReward`.
- **Detection and traversal flags.** `hidden` (needs a tower that detects hidden
  enemies), `flying` (needs a tower that hits air) and `boss`.
- **Damage order.** The schema's own comment on `defense` states the intended
  resolution order explicitly: shield is depleted first, then the flat `defense`
  reduction is applied, and only then does the remainder come off `maxHp`. This
  fixed order is what makes a shielded, armoured enemy behave identically across
  two runs with the same seed and inputs, rather than depending on which system
  happened to run first.
- **Immunities.** `immunities` is a list of status ids an enemy simply ignores;
  applying a status the enemy is immune to is meant to be a no-op, not an error.
- **Abilities.** `EnemyAbilityDef` covers `summon`, `stun`, `shieldPhase`, `heal`
  and `speedPhase`, each on its own cooldown. Some carry an `hpThreshold` (a
  fraction from 0 to 1) meant to fire the ability once when the enemy's health
  drops below that fraction, which is how a boss's phase change is expressed as
  data rather than a scripted cutscene.
- **Status effects.** A `StatusDef` has a `category` (`stun`, `slow`, `dot`,
  `debuff` or `buff`), a `stackingRule` (`refresh`, `stack` or `highest`, with an
  optional `maxStacks`), and category-specific fields: `speedMultiplier` for slow
  and freeze effects, `damagePerTick` or `percentMaxHpPerTick` for damage-over-time,
  `preventsAction` for stun, and `revealsHidden` for an "exposed" effect that lets a
  hidden enemy be targeted regardless of detection. A generic `tag` field lets a
  status participate in tower synergy the same way an enemy's tag does.

## Configuration

Enemies and statuses are pure data, validated the same way towers are (see the data
model article). A new status effect is meant to be a new `StatusDef` row that any
number of towers can reference by id; it is never redefined per tower.

## Failure modes

- **A stacking rule with no `maxStacks` where one is clearly needed** (for example
  a `stack` rule on a damage-over-time effect with no upper bound) is a design smell
  the planned validator is meant to at least warn about, since an unbounded stack of
  percentage-based damage-over-time can dominate every other mechanic in the game.
- **An immunity list referencing a status id that does not exist**, caught by the
  planned validator's referential-integrity check, the same way a dangling tower
  reference is.
- **An `hpThreshold` ability that never fires** because the threshold is above the
  enemy's effective maximum health once shield and defense are accounted for, which
  is a data authoring mistake rather than a schema violation.

## Security considerations

Not applicable beyond the data-model article's: enemy and status data loads locally
from the application bundle, with no network or user-supplied input at runtime.

## How to verify

- `npm run typecheck` checks every `EnemyDef`, `EnemyAbilityDef` and `StatusDef`
  field against the schema today.
- Once enemies exist as data and the damage and status systems are built, the plan
  is deterministic tests: apply a known sequence of hits and statuses to a fixed
  enemy row, and assert the resulting health and status state match a recorded
  expectation, with the shield-then-defense-then-hp order specifically covered.

## Suggested articles

- [Towers and upgrades](./towers-and-upgrades.md)
- [The data model, and where the statistics come from](./data-model.md)
- [Waves and difficulties](./waves-and-difficulties.md)
