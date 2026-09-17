# Where the numbers came from

Every data row under `src/data/` carries a `source` block. It is one of exactly two
things, and there is deliberately no third option:

- **Sourced.** A wiki URL and the date it was read. The numbers in that row came off
  that page.
- **An engine default.** An `origin` of `engine-default` and a sentence saying why.
  Nobody has sourced it; these are the values this project chose and tuned against.

A row may not carry a citation it did not come from, and it may not carry nothing at
all. The validator enforces both, and a test asserts it independently.

## What is genuinely sourced

**Twelve towers.** Scout, Sniper, Soldier, Freezer, Militant, Shotgunner, Hunter,
Minigunner, Ranger, Electroshocker, Cowboy and Turret. Every upgrade level, with its
real cost, damage, rate of fire and range, read from each tower's upgrade table by
`tools/fetch-wiki-stats.mjs` and converted by `tools/generate-data-rows.mjs`.

**Ten enemies.** Normal, Speedy, Slow, Quick, Slime, Molten, Ghost, Molten Boss,
Fallen King and Fallen Swordmaster. Health, speed and cash reward read from each
enemy's infobox by `tools/fetch-wiki-enemies.mjs`.

Re-run either script to refresh. They write to `tools/wiki-cache/`, which is committed
so the conversion can be audited without a network.

## Three things the scrape taught us, recorded so nobody rediscovers them

**The column labelled "Firerate" is a cooldown in seconds, not a rate.** Scout's top
level lists damage 8, firerate 0.325 and DPS 24.62, and 8 ÷ 0.325 is 24.62. Reading it
as shots per second makes every tower in the game wrong by a reciprocal, and every
resulting number still looks plausible. The conversion happens in exactly one place so
it cannot be applied twice.

**A scripted request gets HTTP 402; the same request with a browser user agent gets
200.** That is client fingerprinting, not a paywall. It would have been very easy to
record "the source is unavailable" and move on.

**Capturing the page from standard output silently truncated it.** A 603,508 byte
article arrived as 5,627 bytes with a correct title and no tables, so every page
looked like a page with no statistics on it and the parser looked guilty of a
transport problem. The fetcher now writes to a file, checks the length, and retries,
because the truncation is intermittent rather than structural.

## What is NOT sourced, and is marked as an engine default

**Status effects.** The source game has stuns, slows, freezes, burns, poison stacking
and a reveal effect. Their exact magnitudes and durations have not been read from
anywhere; the values in `src/data/statuses/` are this project's own.

**Maps and their lanes.** `crossroads` and `riverbend` are original layouts authored
here. They are not reproductions of any map from the source game.

**Wave schedules.** Original, tuned against this engine.

**Difficulty multipliers.** The difficulty *names* follow the source game. The health
and speed multipliers, starting cash and life counts are this project's own.

**Terrain.** Which ground a tower may stand on is still hand-set per tower in
`tools/generate-data-rows.mjs`, because the page does not say.

**Enemy concealment.** The enemy infobox marks concealment with an icon rather than
the word "yes", so the scraper read every enemy as visible and grounded. That would
have been a plausible-looking lie: a hidden wave would have walked into a tower that
should not be able to see it and nothing would have failed. Those flags are hand-set
in `tools/generate-enemy-rows.mjs` instead.

**Tower detection and footprint are no longer hand-set.** They used to be, and they
were wrong, which is recorded below under the refund because it is the same story.

**Leak damage, boss abilities and enemy immunities.** Engine values.

## The six questions, and their honest state

| Question | State |
| --- | --- |
| Are there targeting modes beyond First, Last, Closest, Strongest and Weakest? | **Unresolved.** A search suggested Farthest and Random, but it blended in results from an unrelated game's wiki, so it is not trusted. Five modes ship. |
| Is enemy mitigation a flat reduction, a shield pool, a multiplier, or a mix? | **Unresolved.** The schema supports a separate shield pool and a flat reduction independently, so whichever answer arrives is a data change. Every sourced enemy currently has zero of both. |
| Which towers mark and which consume, and at what multiplier? | **Unresolved.** Modelled as a generic tag plus a bonus multiplier, so any pairing is two data rows. No pairing ships. |
| Does area damage fall off with distance? | **Unresolved.** Modelled as flat inside the radius, with falloff optional in the schema. |
| What does Hardcore change? | **Unresolved.** The shipped `hardcore` difficulty is an engine guess: more health, faster enemies, twenty lives, one tower banned. It is not a claim about the source game. |
| What is the sell refund percentage? | **Resolved: a third, truncated.** Every tower's infobox lists a base selling cost exactly equal to its base cost divided by three and truncated, across all thirteen towers with no exceptions and no rounding slack. Scout costs $125 and sells for $41; Turret costs $7,750 and sells for $2,583. It shipped at 70 percent as an engine default until the infobox was actually read. |

## What reading the infobox corrected

The upgrade table was being scraped from the start. The infobox beside it was not, and
everything it holds was being hand-written from recollection into an overlay. Most of
it was wrong, and none of it looked wrong, because a plausible number in a generated
file is indistinguishable from a sourced one.

| Field | Was | Is | Why it mattered |
| --- | --- | --- | --- |
| Sell refund | 0.7 on every tower | A third, truncated | Every refund was more than double what it should have been |
| Ranger hidden detection | Yes | Never, at any level | A detector that cannot detect |
| Turret anti-air | Yes | Never, at any level | Fliers walked past a tower listed as covering them |
| Sniper anti-air | No | From level 0 | The reverse: a real answer to fliers, switched off |
| Hidden and flying detection generally | One boolean per tower | Per level, as the page states it | Scout reads "Level 2+", so a single boolean is the wrong shape whichever way it is set |
| Footprint | 1.5 on almost everything | 1, 1.25, 1.5 or 2 as listed | Footprint decides what fits beside what |

The generator now refuses to emit a row whose detection or footprint was not read off
the page, rather than defaulting it to a quiet false, and
`tests/data/sourced-attributes.test.js` ties every shipped row back to the scrape
cache so none of this can drift back unnoticed. Both were watched failing before being
trusted.

Reading the infobox is `tools/fetch-wiki-attributes.mjs`.

## Checking the transcription against the source's own arithmetic

Every upgrade table publishes a damage-per-second column. The scraper now carries it
through unread into the cache, and `tests/data/sourced-attributes.test.js` recomputes
it from each shipped row: 83 levels, checked against a figure this project did not
compute. It is the only independent arithmetic the source offers, and it has earned
its keep four times over.

| What it caught | The symptom |
| --- | --- |
| Shotgunner fires 8 pellets per shot | The simulation fired one, so the tower did an eighth of its damage |
| Rocketeer's top level fires a salvo of 4 | Its damage per second read 21.11 against a published 84.44 |
| Gatling Gun has a magazine and a reload | Its listed `Ammo` and `Reload Time` columns were not being read at all |
| **Every burst tower fired one interval too fast** | The reload replaced the last shot's own interval instead of following it. Soldier cycled in 0.85 seconds where the source takes 1.025, so it did 3.53 damage per second against a published 2.93 |

The last of those was in the simulation, not the data, and it had been there from the
beginning. Nothing caught it because nothing checked burst timing at all: changing the
cycle moved no test in either direction. `tests/sim/burst-cadence.test.js` pins it now,
and was watched failing against the old behaviour first.

**One tower is excluded, by name and with its reason.** Cowboy publishes 2.57 at level
0 from 3 damage on a 1 second interval, and its table also lists a 2 second wind-up and
a cash shot every 6. The published figure fits neither a magazine of 6 using the wind-up
as a reload, nor the wind-up amortised over any consistent number of shots: solving for
the implied extra time per cycle gives 1, 0.35, 0.35, 0.4, 0.65 and 0.65 seconds across
six levels against listed wind-ups of 2, 1.25, 1.25, 1, 1 and 1. Its wind-up is recorded
as sourced data regardless; what is not claimed is that the simulation reproduces a
number nobody has managed to derive. The check asserts the exclusion still has its
reason, so it cannot quietly become a place to put anything inconvenient.

## The wave schedule, and why it was rebuilt

The shipped game could not be finished. A headless playthrough with an ordinary
strategy lost on wave 8 or 9 on every map, every difficulty and every tower, and
the cause was arithmetic rather than tactics: the ten-wave arc paid out about
12,000 cash, the best tower in the roster converts cash into damage at roughly 6
damage per second per 1,000 spent, and wave 10 alone carried 56,864 health. That
is a finale needing about twenty times the damage the whole game had funded.

Nothing had caught it because nothing had ever played the game. Every check ran
against the synthetic fixture and the suite was green throughout.

**Enemy health and kill rewards are wiki figures and were not touched.** What was
rebuilt is what is genuinely this project's own: which enemies turn up, how many,
and what a wave pays on completion. `tools/generate-waves.mjs` builds a geometric
difficulty curve, sets the completion bonus to fund it, and computes where each
boss fits rather than declaring it; `tools/playthrough-probe.mjs` then plays the
result, and `tests/e2e/completable.test.js` makes that a gate.

Three things were tried and rejected along the way, recorded so they are not tried
again:

| Attempt | Why it failed |
| --- | --- |
| Derive the wave load from cash earned so far | The economy compounds, so the budget compounds. With the heaviest non-boss enemy at 350 health the only way to express it was hundreds of enemies per wave and bonuses in the millions |
| Pin bosses to fixed wave numbers | Molten Boss sat on wave 20 where the curve reaches about 800 against its cost of 20,741, so it was silently dropped from every table and the arc quietly had no bosses at all |
| One curve for every difficulty | The ladder came out inverted. A harder tier met the same load with fewer, tougher enemies while starting with more cash, and finished with more lives than easy |

**Two bosses do not fit and are recorded rather than forced.** Fallen Swordmaster
at 150,000 health and Fallen King at 250,000 need a wave heavier than a 40-wave
arc reaches on this economy; they are sized for a far longer game than this roster
of kill rewards can fund. Molten Boss does fit, and the generator places it where
the curve can carry it. Forcing either of the others in would recreate the exact
cliff this replaced.

The arc now runs 40 waves and every difficulty is completable. Hardcore, which
multiplies enemy health by six, bans Scout and cuts the base to twenty lives,
finishes with 9 of those 20 left.

## What stripping footnote markers revealed

The published damage-per-second column is the only independent arithmetic the source
offers, and a referenced figure is written "19 [ 2 ]", which is not a number. The cell
was being thrown away, so those levels were silently uncovered. Reading them properly
widened the cross-check from 83 levels to 97, and two of the newly visible rows
disagreed at once.

**Freezer** publishes 19 where its direct damage alone is 16. The missing 3 is its
chill, which the engine could express only as a property of the status, identically at
every level; Freezer chills for 3 at one level and 5 at the next. A tower level can now
carry its own burn figure, and the status definition is the fallback.

**Ranger** publishes 156.25 at its top level where 875 over an 8 second interval is
109.375. The missing 46.875 is 375 over the same interval: it deals 875 to what it hit
and 375 to everything else in the blast. The engine applied one figure to the whole
area. A level can now carry a separate splash figure, and a tower without one still
hits the whole area for its damage, which is what every splash tower in the roster did
before.

Both were watched failing before being trusted, and the second was written specifically
to confirm the old behaviour still holds for the towers that never had a separate
figure.

**Ace Pilot needed a third.** It carries a gun AND a bomb on its own cooldown, and its
published figure is the two added: at level 5, 14 damage every 0.12 seconds plus a 45
bomb every 1.5 seconds is exactly 146.67. A tower level can now carry a second weapon
that runs on its own clock, which is checked both ways and does not touch a tower that
has none. What distinguishes a bomb from an ordinary blast in the data is simply that
the page gives it a cooldown of its own; where the splash has no separate cooldown, as
on Ranger, it is a blast around the shot and is read as one.

Ace Pilot also caught the scraper preferring a splash column over a normal one, which
read its bomb as its entire output and silently dropped the two levels where the bomb
does not exist yet and the cell reads N/A.

## The rest of the roster, and why each one is still absent

Every remaining tower was fetched and its page read. They are not all the same kind of
missing, and lumping them together as "not done yet" would hide the fact that some are
a line of data and others need the engine to grow a feature it does not have.

### Shipped since

Paintballer, Demoman, Mortar and Rocketeer are in the game, and so is Farm. Their tables head the damage
column "Splash Damage" and carry the blast size in "Explosion Range", which is read
rather than hand-written, and each reproduces its page's damage-per-second column at
every level.

Farm needed a second reader rather than a wider column list. Its table carries no
damage, no rate and no range at all, so the damage-shaped extractor passed straight
over it and reported the page as having no statistics; it is not a tower with missing
numbers, it is a different kind of tower. The engine already had `incomePerWave`, so
once the income column is read it is a data row like any other. The validator's rule
that a fire rate of zero never shoots now asks whether the tower earns instead, and
still bites for anything that is supposed to shoot.

### The critical-hit model, added for a tower that still does not ship

Warden's published damage per second is 1.1667 times what its damage and swing rate
alone produce, and the reason is a critical hit the table prints the damage of but not
the frequency of. That frequency follows from three figures the page does print: if a
crit lands every N hits the average per hit is `damage + (critDamage - damage) / N`, and
the published rate is that average over the swing interval. Solving across Warden's five
levels gives 2.9985, 2.9985, 3.0030, 3.0004 and 2.9996.

So a crit lands on a **cadence**, every third hit, not on a die roll. That is not a
concession to determinism: the simulation has a seeded stream and could roll
reproducibly. A probability would not produce the same integer at five different levels.

The engine uses the page's own crit damage rather than multiplying, because at Warden's
level 2 the listed crit is 23 where 15 times 1.5 is 22.5, and it is the 23 that
reproduces the published rate. A damage aura scales the crit in proportion, so a support
tower does not quietly stop helping on every third swing.

The tower itself is held back by the contradiction above. The mechanic is implemented,
checked, and waiting.

### Blocked on an engine feature, not on data

| Tower | What it needs |
| --- | --- |
| Warden | **The engine can model it now; the source contradicts itself.** Its upgrade table lists $1,000 to place with 6 base damage, and its own infobox lists $1,850 with 12. A row built from two readings that disagree is a row nobody can trust, so it does not ship and the generator refuses it by name. |
| Accelerator | A charge-up beam. Its table has no rate column at all, only charge-up, tick and overcharge. |
| Pyromancer | Burn damage, burn time, tick rate and defence melt as one coherent status. The status registry can carry a burn, but not the defence melt. |
| Military Base | Friendly units. It spawns them; nothing in the simulation fights on the player's side. |
| Medic | Healing and shield recharge for other towers. Auras can buff a stat; nothing repairs. |

### Page layout not yet understood

Commander and Pursuit have no table carrying a level column in the shape the others
use. Ace Pilot could not be fetched at all. All three need a second look rather than a
guess.

### The rule that governs all of it

Adding a tower is a data row plus a line in the hand-written manifest in
`src/data/loader.js`. Both halves are now checked: `tests/data/manifest-complete.test.js`
compares the files on disk against the manifest in both directions, so a generated row
that never reaches the game turns it red rather than shipping a shop one tower short.
