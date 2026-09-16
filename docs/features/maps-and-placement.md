# Maps and placement

A map is a `MapDef` row: one or more lanes an enemy walks along, and one or more
placement zones a tower can be built in. **Status: the shape is fully defined in
`src/data/schema/types.js`; no concrete map exists as data yet, and the pathing and
placement systems that would read these fields are still designed, not
implemented.**

## Behaviour

- **Lanes.** A `Lane` is an id plus an ordered list of `Waypoint` (`x`, `y`) points.
  An enemy is meant to walk the waypoints in order at its own `speed`, with a small
  deterministic per-enemy offset planned so a group of identical enemies spawned
  together does not render as a single file glued to one exact line.
- **Placement zones.** A `PlacementZone` is an id, a `terrain` (`ground`, `water`
  or `cliff`) and a `polygon` (an array of `[x, y]` pairs). A tower may only be
  placed in a zone whose terrain is in its own `allowedTerrain` list.
- **Footprint collision.** A tower's `footprintRadius` (declared on the `TowerDef`,
  not the map) is meant to prevent two towers being placed close enough to overlap,
  checked against every other tower already placed in the same zone.
- **Base lives.** `baseLives` is the map's starting life total, before any
  difficulty-level override (see the waves and difficulties article for
  `DifficultyDef.livesOverride`).
- **Map extent.** `width` and `height` bound the playable area the renderer and the
  placement system both work within.

## Configuration

Maps are pure data. A new map is meant to be a new `MapDef` row with its own lanes
and placement zones; there is no per-map code.

## Failure modes

- **A self-intersecting or degenerate placement polygon**, which the planned
  validator's geometry check is meant to reject at load time rather than letting a
  tower be placed somewhere the polygon's own shape does not really contain.
- **A lane with fewer than two waypoints**, which cannot describe a path at all.
- **A placement zone whose terrain no tower in the current roster can ever use**,
  which is not necessarily wrong (a map may deliberately have a water zone before
  any water tower exists) but is worth the validator flagging as a warning rather
  than staying silent about.
- **Two lanes that cross without an intended interaction.** The schema does not
  itself define lane-crossing behaviour; if a map's lanes cross, that is an
  authoring decision the map's own geometry makes, not something the placement
  system arbitrates.

## Security considerations

Not applicable beyond the data-model article's: map data loads locally from the
application bundle, with no network or user-supplied input at runtime.

## How to verify

- `npm run typecheck` checks every `MapDef`, `Lane`, `Waypoint` and
  `PlacementZone` field against the schema today.
- Once maps exist as data and the pathing and placement systems are built, the plan
  is a test that walks a known lane at a fixed speed and asserts the enemy's
  position at each tick matches a recorded expectation, plus a placement test that
  confirms a tower cannot be placed outside its allowed terrain or overlapping
  another tower's footprint.

## Suggested articles

- [Waves and difficulties](./waves-and-difficulties.md)
- [The data model, and where the statistics come from](./data-model.md)
- [Enemies and status effects](./enemies-and-statuses.md)
