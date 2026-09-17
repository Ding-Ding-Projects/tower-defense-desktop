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
- [x] First tranche of towers, each cited (20 of the 85 the wiki files under
      Category:Towers, read 2026-09-17; eight of those are Golden variants of towers
      already in the list, and the remainder mixes base-game with limited-event towers
      in a way the categories do not separate cleanly, so "20 of 85" is the honest
      figure rather than a smaller flattering one)
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
- [x] Tables that open with a spanning caption row are read, and a tower whose page
      declares branching upgrade paths is refused rather than shipped as one branch
- [x] Explosions capped at the Max Hits their pages state (Paintballer 8, Ranger 3);
      both shipped uncapped and so hit everything in radius
- [x] Freezer's Frost Grenade, the roster's first ability
- [x] Ranger's wave-start range buff, the roster's first aura
- [x] Enemy concealment and flight read from the infobox instead of defaulted
- [x] Every engine mechanic is used by a shipped tower or carries a written reason it
      is not, checked by `tests/data/mechanic-coverage.test.js`
- [x] Where a tower may be built read from the page instead of hand-written as `ground`
      for all twenty, which had left every cliff zone on both maps unbuildable
- [x] Boss abilities read from the page prose where the page gives numbers: the Fallen
      King's Fallen Comet, and the Fallen Swordmaster's real 75,000 threshold
- [x] Targeting modes refused at validation rather than throwing mid-match
- [x] The seams between the interface and the simulation are checked: events, command
      names, phase names, and status colours

## Phase 4: the program

- [x] Canvas renderer with interpolation decoupled from the simulation rate
- [x] Procedural sprites cached to offscreen canvases, with pooled projectiles
- [x] Material Design 3 interface: shop, tower panel, heads-up display
- [x] Shop cards and the upgrade panel draw the real tower sprite, not a lettered box
- [x] Every tower visually distinct, including towers sharing all mechanical stats
- [x] Every state real: wave start, clear, victory, defeat, pause, settings
- [x] Frameless window with a custom title bar, verified in the running program
- [x] The capture matrix is written down and reproducible. `--window-size=WxH` puts the
      window at an exact size, refusing anything below the supported minimum, and
      `tools/capture-matrix.mjs` holds the list of sizes and launches each in turn. It
      deliberately does not take the pictures: captures go through the project's own
      off-screen route, and a script quietly grabbing frames another way would be
      producing evidence from a route nobody agreed to trust. What it removes is the
      part that was actually unreliable, which was that the sizes used to be whatever
      the desktop happened to be that day. The layout itself is verified without any of
      it by `tests/hud/viewport-fit.test.js`; these captures are evidence of what it
      looks like, not proof that it fits
- [x] Verified at 100, 125, 150 and 200 percent interface scale with no clipping, by
      `tests/hud/viewport-fit.test.js`, which draws the real interface layer with a
      tower selected (the tightest the layout gets) and bounds every drawing
      coordinate. The contract it enforces is about logical area: the interface needs
      960 by 600 to lay out in, so 200 percent scale needs a 1920 by 1200 window.
      `uiScale` is currently pinned to 1 in app.js, so the larger steps guard a
      preference that is not exposed yet. Finding this needed two corrections to the
      check itself: the first version read `fillRect` and found six rectangles in the
      whole interface, because almost all of it is drawn as paths; the second compared
      pre-scale coordinates against the full window, so every scale above 1 passed
      trivially. Once it was measuring the right thing it found real clipping, and the
      sidebar now gives the upgrade panel the height it measures instead of half
- [x] Keyboard reachable end to end, checked by `tests/hud/keyboard-reach.test.js`.
      The interface is painted on a canvas, so nothing in it is focusable on its own
      and reachability rests entirely on the hidden mirror of real buttons. The check
      sweeps the viewport with hit tests and asserts that every action a click can
      produce is also one the mirror offers, which is the one failure the arrangement
      invites: a control added to the drawing and forgotten in the mirror works
      perfectly with a mouse and does not exist at all without one. Proven by removing
      the tower panel from the mirror and watching it name the three controls that
      became unreachable. It also checks every mirrored control is a real button with a
      usable name, that a disabled control is announced as disabled rather than only
      greyed, that the pause control renames itself so its name matches what it does,
      and that a modal overlay replaces the controls behind it rather than leaving them
      reachable

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
- [ ] Screen recording of the real built program. Blocked on two specific things rather
      than on effort, so they are written down: the sanctioned capture route records a
      MONITOR, and the program is driven on an off-screen desktop, which is not a
      monitor and cannot be recorded that way without putting the window on the visible
      desktop. Assembling a frame sequence from the per-window captures that DO work
      would produce a genuine recording, and there is no encoder installed to turn those
      frames into a file. Still images of the real program are captured and embedded
      already; a sequence of them is not a recording and is not going to be called one. What the stills cannot show is the effects layer, since a muzzle flash lives 120ms
      and an impact spark 220ms, so that is proven instead by
      `tests/render/art-reached.test.js` driving the real renderer through a real match

## Known open gaps

- [ ] Seven towers remain blocked on engine features, each recorded by name in
  `docs/data-sources.md` with the exact blocker: Accelerator (a charge-up beam with no
  rate column), Military Base and Commander's Support Caravan (friendly units nothing
  can fight for), Medic (healing, which no aura can express), Warden (its own page
  contradicts itself about its cost and damage), Pursuit (branching upgrade paths, and a
  tower that drives around), DJ Booth (player-selected buff tracks).

- [ ] Two enemy ability kinds, `shieldPhase` and `heal`, have no shipped user. Both are
  recorded in the mechanic inventory rather than left as silent dead branches, which is
  exactly the shape `buffPulse` had. `stun` was on this list until the Fallen King gained
  its sourced Fallen Comet, and `shieldPhase` joined it the same day, when the invented
  shield phase that was its only user came off.

- [ ] Mortar's cluster munition and Ranger's Explosive Impact scatter are unmodelled.
  The sub-explosion positions are not published, so modelling them would be invention
  rather than reading.

- [x] Riverbend's water zone removed. The wiki's API settles it: Category:Water and
      Category:Air have no members at all, so there is no water placement in the source
      game and the zone was a promise nothing could keep


- [x] Every file in `src/render` and `src/ui` passes the TypeScript check. It is a
  ratchet: `tsconfig.render.json` lists them, it runs as part of `npm run typecheck`,
  and `tests/ui/typecheck-ratchet.test.js` refuses to let one be quietly dropped from
  that list to make a red check green.

  Nothing it found was a missing annotation. Each of these produced no error, no crash
  and no red check:

  - `sim-interface.js` had a `@typedef` whose type expression spanned several lines,
    which does not parse, so `Command` did not exist and every signature mentioning it
    had silently lost its type.
  - **The simulation emitted no events at all.** The renderer has carried the whole
    feedback layer since the first pass, and the view model read `next.events ?? []` and
    got the empty array every tick of every match ever played.
  - **The wave completion bonus was paid and never reported**, so the wave-clear card's
    line announcing it read zero and never appeared once.
  - `app.js` called `interfaceLayer.dismissOverlay` and `onPhaseChange`, neither of
    which existed. Both optional-chained, so both did nothing and raised nothing.
  - `fromTowerDefId` and `remainingSeconds` were declared across two type files each and
    emitted by nothing; the view model copied undefined into properties with no consumer.
  - Snapshot ids were declared as strings and emitted as numbers, throughout.
  - `renderer.js` never checked the 2D context for null, and set `dpr`, `cssWidth` and
    `cssHeight` only in `resize()`, so drawing first gives NaN coordinates and a blank
    frame with nothing to say about it.
  - An effect's lifetime was optional and divided by unconditionally, so it would never
    expire and would be redrawn forever.
  - All four Material Design components read `this.shadowRoot` to use the root they had
    just created, and cached unguarded `querySelector` results.
  - `object-pool.js` declared its type parameter where TypeScript rejects it, so `T`
    existed nowhere and both pools handed out untyped objects.
  - `Widget` never declared the `_draw` its own `draw` calls; `Button` took its types
    from its default values, so `action` was typed `null`.
  - The tower panel built a control labelled `x ? undefined : undefined`; the shop's
    entry map declared five of the seven fields it stores.
  - `colorDistance` had adopted `mixColors`' documentation; `hash2` was annotated as
    taking a number while callers pass strings; `fbm2D` derived octave seeds by an
    expression that was addition for one type and concatenation for the other.

## Deliberately not doing

- Co-operative multiplayer in this release. The simulation is built deterministic and
  command-driven so it can be added without a rewrite, but nothing ships with it.
