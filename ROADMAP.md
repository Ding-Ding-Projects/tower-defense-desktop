# Roadmap

Ticked means finished, verified, and where it claims something visible, captured from
the real built program. Work that is written but unverified stays unticked with its
state named beside it. A roadmap full of optimistic ticks is worse than no roadmap.

## Phase 1: foundation

- [x] Deterministic random generator with serialisable state
- [x] Fixed-point arithmetic for positions and distances
- [x] Data row shapes for every entity kind, with a required source block
- [x] Public repository created and first commits published
- [ ] Simulation state, command queue and fixed-rate tick
- [ ] Snapshot, restore and stable state hashing
- [ ] Replay from seed plus command log, with hash-sequence equality proven twice

## Phase 2: mechanics

- [ ] Pathing along lane waypoints with per-enemy speed and deterministic offset
- [ ] Status effects with per-status stacking rules, immunities and expiry
- [ ] Aura recomputation of effective tower stats each tick
- [ ] Targeting: first, last, closest, strongest, weakest, with deterministic ties
- [ ] Hidden versus detection, and flying versus anti-air
- [ ] Firing: rate, cooldown, spin-up, burst and reload, hitscan and projectile
- [ ] Area damage, pierce and chain
- [ ] Damage order: shield, then flat reduction, then hit points
- [ ] Tag-based synergy bonuses
- [ ] Tower abilities on cooldown
- [ ] Enemy and boss abilities, including health-threshold triggers
- [ ] Economy: starting cash, wave bonus, kill reward, economy towers
- [ ] Wave director with intermission, groups and boss waves
- [ ] Placement: terrain, polygons, footprint collision, shared caps
- [ ] Win and loss conditions

## Phase 3: the roster

- [ ] Status effect rows, each cited
- [ ] First tranche of towers, each cited
- [ ] First tranche of enemies including bosses, each cited
- [ ] Two maps with real lanes and placement zones
- [ ] Every difficulty as its own row
- [ ] Wave tables per map and difficulty
- [ ] Six open statistical questions resolved or recorded as unresolved
- [ ] Data validator with referential integrity and geometry checks

## Phase 4: the program

- [ ] Canvas renderer with interpolation decoupled from the simulation rate
- [ ] Procedural sprites cached to offscreen canvases, with pooled projectiles
- [ ] Material Design 3 interface: shop, tower panel, heads-up display
- [ ] Every state real: wave start, clear, victory, defeat, pause, settings
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

- [ ] Landing and documentation site with every feature present
- [ ] A documentation article per feature
- [ ] Social embed graphic with server-rendered metadata
- [ ] Offline in-app documentation browser with a completeness check
- [ ] Real captures of the real built program in the readme
- [ ] Screen recording of the real built program

## Deliberately not doing

- Co-operative multiplayer in this release. The simulation is built deterministic and
  command-driven so it can be added without a rewrite, but nothing ships with it.
