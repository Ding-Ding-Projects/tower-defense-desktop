# Roadmap

Ticked means finished, verified, and where it claims something visible, captured from
the real built program. Work that is written but unverified stays unticked with its
state named beside it. A roadmap full of optimistic ticks is worse than no roadmap.

## Phase 1: foundation

- [x] Deterministic random generator with serialisable state
- [x] Fixed-point arithmetic for positions and distances
- [x] Data row shapes for every entity kind, with a required source block
- [x] Public repository created and first commits published
- [x] Simulation state, command queue and fixed-rate tick
- [x] Snapshot, restore and stable state hashing
- [x] Replay from seed plus command log, with hash-sequence equality proven twice

## Phase 2: mechanics

- [x] Pathing along lane waypoints with per-enemy speed and deterministic offset
- [x] Status effects with per-status stacking rules, immunities and expiry
- [x] Aura recomputation of effective tower stats each tick
- [x] Targeting: first, last, closest, strongest, weakest, with deterministic ties
- [x] Hidden versus detection, and flying versus anti-air
- [x] Firing: rate, cooldown, spin-up, burst and reload, hitscan and projectile
- [x] Area damage, pierce and chain
- [x] Damage order: shield, then flat reduction, then hit points
- [x] Tag-based synergy bonuses
- [x] Tower abilities on cooldown
- [x] Enemy and boss abilities, including health-threshold triggers
- [x] Economy: starting cash, wave bonus, kill reward, economy towers
- [x] Wave director with intermission, groups and boss waves
- [x] Placement: terrain, polygons, footprint collision, shared caps
- [x] Win and loss conditions

## Phase 3: the roster

- [x] Status effect rows, each cited
- [x] First tranche of towers, each cited (17 of roughly 40)
- [x] Tower detection, footprint and sell refund read off the page instead of hand-written
- [x] Every shipped level cross-checked against its page's own damage-per-second column
      (83 levels; Cowboy excluded by name, with its arithmetic recorded)
- [x] First tranche of enemies including bosses, each cited (10, including 3 bosses)
- [x] Two maps with real lanes and placement zones
- [x] Every difficulty as its own row
- [x] Wave tables per map and difficulty, generated from a curve the economy can fund
- [x] The game is completable end to end on every difficulty, proven by a real playthrough
- [x] Six open statistical questions resolved or recorded as unresolved
- [x] Data validator with referential integrity and geometry checks

## Phase 4: the program

- [x] Canvas renderer with interpolation decoupled from the simulation rate
- [x] Procedural sprites cached to offscreen canvases, with pooled projectiles
- [x] Material Design 3 interface: shop, tower panel, heads-up display
- [x] Shop cards and the upgrade panel draw the real tower sprite, not a lettered box
- [x] Every tower visually distinct, including towers sharing all mechanical stats
- [x] Every state real: wave start, clear, victory, defeat, pause, settings
- [ ] Frameless window with a custom title bar
- [ ] Verified at 100, 125, 150 and 200 percent display scale with no clipping
- [ ] Keyboard reachable end to end with visible focus and correct roles

## Phase 5: shipping

- [x] One-click dependency fetcher with pinned versions and recorded digests
- [x] One-click build script that verifies its own output is not stale
- [x] One-click installer script producing an unsigned Squirrel package
- [x] Original application icon at every required resolution
- [x] Release workflow publishing a uniquely tagged non-draft release
- [x] Committed line counter reporting agent-written versus person-written lines
- [x] First real release published with a working installer attached

## Phase 6: the record

- [x] Landing and documentation site with every feature present
- [x] A documentation article per feature
- [x] Social embed graphic with server-rendered metadata
- [x] Offline in-app documentation browser with a completeness check
- [x] Real captures of the real built program in the readme
- [ ] Screen recording of the real built program

## Known open gaps

- [ ] Most of `src/render` and `src/ui` are still outside the TypeScript check. They
  were written while it covered the simulation and its data only, and bringing the
  whole of both directories in at once reports 800 errors: about 520 are missing
  annotations rather than defects, and roughly 280 are real (values used without a null
  check, properties read off the wrong shape, types that do not flow through). They are
  covered by behaviour checks, which is not the same thing.

  It is now a ratchet rather than an open hole. `tsconfig.render.json` carries an
  explicit list of the files that DO pass, runs as part of `npm run typecheck`, and
  `tests/ui/typecheck-ratchet.test.js` refuses to let a file be quietly dropped from
  that list to make a red check green. Fifteen of the forty-three are in. The rest go
  in one at a time.

  Bringing them in keeps paying for itself, and none of what it found was an
  annotation problem:

  - `sim-interface.js` had a `@typedef` whose type expression spanned several lines,
    which does not parse. The compiler stopped at the first line break and then could
    not find `Command` at all, so every signature mentioning it had silently lost its
    type.
  - `object-pool.js` declared its type parameter on the constructor, which TypeScript
    rejects outright. `T` then existed nowhere, so both pools in `particles.js` were
    handing out untyped objects with nothing objecting.
  - `Widget` never declared the `_draw` its own `draw` calls, so a subclass that
    forgot to provide one would have failed at run time in silence.
  - `Button` took its parameter types from its own default values, so `action` was
    typed `null` and every real action assigned to it was an error nobody was shown.
  - `hash2` was annotated as taking a numeric seed while callers pass a composed
    string to get two independent streams out of one seed.
  - Fixed-point coordinates were declared as plain numbers with the truth in a comment
    beside them.

## Deliberately not doing

- Co-operative multiplayer in this release. The simulation is built deterministic and
  command-driven so it can be added without a rewrite, but nothing ships with it.
