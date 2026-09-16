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

**Terrain, detection and concealment flags.** Which ground a tower may stand on,
whether it sees hidden enemies, and whether it can hit fliers are hand-set per tower
in `tools/generate-data-rows.mjs`. The enemy infobox marks concealment with an icon
rather than the word "yes", so the scraper read every enemy as visible and grounded.
That would have been a plausible-looking lie: a hidden wave would have walked into a
tower that should not be able to see it and nothing would have failed. They are
hand-set in `tools/generate-enemy-rows.mjs` instead.

**Leak damage, boss abilities and enemy immunities.** Engine values.

## The six questions, and their honest state

| Question | State |
| --- | --- |
| Are there targeting modes beyond First, Last, Closest, Strongest and Weakest? | **Unresolved.** A search suggested Farthest and Random, but it blended in results from an unrelated game's wiki, so it is not trusted. Five modes ship. |
| Is enemy mitigation a flat reduction, a shield pool, a multiplier, or a mix? | **Unresolved.** The schema supports a separate shield pool and a flat reduction independently, so whichever answer arrives is a data change. Every sourced enemy currently has zero of both. |
| Which towers mark and which consume, and at what multiplier? | **Unresolved.** Modelled as a generic tag plus a bonus multiplier, so any pairing is two data rows. No pairing ships. |
| Does area damage fall off with distance? | **Unresolved.** Modelled as flat inside the radius, with falloff optional in the schema. |
| What does Hardcore change? | **Unresolved.** The shipped `hardcore` difficulty is an engine guess: more health, faster enemies, twenty lives, one tower banned. It is not a claim about the source game. |
| What is the sell refund percentage? | **Unresolved.** Every tower ships at 70 percent, an engine default. |

## What has not been fetched at all

Roughly thirty further towers exist in the source game, along with a great many more
enemies and every map. They are absent rather than approximated. Adding one is a data
row plus a line in the hand-written manifest in `src/data/loader.js`, which fails
loudly if a file is added and the manifest is not.
