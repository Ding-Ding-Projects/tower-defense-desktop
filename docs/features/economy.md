# The economy

Cash is meant to flow in from four sources: a difficulty's `startingCash`, a
per-enemy `killReward`, a wave's `completionBonus`, and a tower's own
`incomePerWave`. **Status: every field involved is defined in the schema; no
concrete tower, enemy, wave table or difficulty exists as data yet, and the economy
system that would apply these fields during a match is still designed, not
implemented.**

## Behaviour

- **Starting cash.** `DifficultyDef.startingCash` is the cash a match begins with,
  before any wave has started.
- **Kill reward.** `EnemyDef.killReward` is paid when that specific enemy is
  defeated; a boss and a basic enemy can (and are expected to) carry very different
  reward values.
- **Wave completion bonus.** `WaveDef.completionBonus` is paid once every enemy in
  that wave has been dealt with (killed, or otherwise removed from play), separate
  from any per-kill reward already paid during the wave.
- **Income towers.** A `TowerLevel` can declare `incomePerWave` instead of, or in
  addition to, combat stats, making a dedicated economy tower a tower like any
  other rather than a special-cased entity.
- **Cash multiplier.** `DifficultyDef.cashMultiplier` scales cash income on top of
  the sources above, applied uniformly rather than per-source, so a harder
  difficulty's economy stays predictable relative to its base numbers.
- **Sell refund.** `TowerDef.sellRefundPercent` governs how much of a tower's total
  spend is returned when sold; the exact percentage is one of the six open
  statistical questions tracked in the data model article, not yet finalised.

## Configuration

The economy has no separate configuration surface of its own; every number that
drives it lives on the tower, enemy, wave and difficulty rows described above; see
those articles and the data model article for how those rows are authored and
validated.

## Failure modes

- **Double-counting a reward.** Because kill reward and wave completion bonus are
  paid from two different rows at two different moments, a system that pays both
  for the same event (for example, awarding the completion bonus per remaining
  enemy instead of once per wave) would silently inflate the economy; this is
  exactly the kind of thing a deterministic replay-based test is meant to catch,
  since the resulting cash total would diverge from a hand-checked expectation.
- **A cash multiplier applied twice**, once globally and once per source, would
  compound rather than simply scale, and is the kind of authoring mistake the
  economy system's own tests are meant to guard against once it exists.
- **A missing or zero `sellRefundPercent`** silently making every sale refund
  nothing, which is a plausible-looking bug precisely because "zero" is a valid
  value and not obviously wrong on inspection.

## Security considerations

Not applicable beyond the data-model article's: every number driving the economy
loads locally from the application bundle, with no network or user-supplied input
at runtime, and there is no persistent account balance or real-money value involved
anywhere in this project.

## How to verify

- `npm run typecheck` checks every economy-relevant field (`startingCash`,
  `killReward`, `completionBonus`, `incomePerWave`, `cashMultiplier`,
  `sellRefundPercent`) against the schema today.
- Once the economy system is built, the plan is a deterministic test that runs a
  fixed wave table and tower placement through the simulation and asserts the cash
  total at each wave boundary matches a recorded, hand-checked expectation.

## Suggested articles

- [Waves and difficulties](./waves-and-difficulties.md)
- [Towers and upgrades](./towers-and-upgrades.md)
- [The data model, and where the statistics come from](./data-model.md)
