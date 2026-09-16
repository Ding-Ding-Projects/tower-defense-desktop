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
- [x] First tranche of towers, each cited (12 of roughly 40)
- [x] First tranche of enemies including bosses, each cited (10, including 3 bosses)
- [x] Two maps with real lanes and placement zones
- [x] Every difficulty as its own row
- [x] Wave tables per map and difficulty
- [x] Six open statistical questions resolved or recorded as unresolved
- [x] Data validator with referential integrity and geometry checks

## Phase 4: the program

- [x] Canvas renderer with interpolation decoupled from the simulation rate
- [x] Procedural sprites cached to offscreen canvases, with pooled projectiles
- [x] Material Design 3 interface: shop, tower panel, heads-up display
- [x] Every state real: wave start, clear, victory, defeat, pause, settings
- [ ] Frameless window with a custom title bar
- [ ] Verified at 100, 125, 150 and 200 percent display scale with no clipping
- [ ] Keyboard reachable end to end with visible focus and correct roles

## Phase 5: shipping

- [ ] One-click dependency fetcher with pinned versions and recorded digests
- [ ] One-click build script that verifies its own output is not stale
- [ ] One-click installer script producing an unsigned Squirrel package
- [ ] Original application icon at every required resolution
- [ ] Release workflow publishing a uniquely tagged non-draft release
- [ ] Committed line counter reporting agent-written versus person-written lines
- [ ] First real release published with a working installer attached

## Phase 6: the record

- [x] Landing and documentation site with every feature present
- [x] A documentation article per feature
- [x] Social embed graphic with server-rendered metadata
- [x] Offline in-app documentation browser with a completeness check
- [ ] Real captures of the real built program in the readme
- [ ] Screen recording of the real built program

## Known open gaps

- [ ]  and  are outside the TypeScript check. They were written on a
  branch while the check covered only the simulation and its data, and they do not
  pass it: JSDoc generics on a constructor, a canvas context used without a null
  check, and a pool whose element type does not flow through. They are covered by 51
  behaviour checks, which is not the same thing. Bringing them in is real work and is
  recorded here rather than hidden by loosening the check until it goes quiet.

## Deliberately not doing

- Co-operative multiplayer in this release. The simulation is built deterministic and
  command-driven so it can be added without a rewrite, but nothing ships with it.
