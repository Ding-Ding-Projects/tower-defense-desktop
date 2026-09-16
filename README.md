# Tower Defence Desktop

A deterministic tower defense game for Windows, built as a desktop application.

The simulation aims for mechanical and statistical parity with Roblox Tower Defense
Simulator: the same targeting modes, status effects, income model, wave structure and
difficulty behaviour, with every number sourced from the public wiki and cited in the
data files themselves.

## Status

Early construction. The simulation core lands first; the tower, enemy and map roster
arrives in tranches after it, because a new tower is meant to be a data row rather
than new code.

## Design

- **Deterministic core.** A fixed 30 Hz tick, one seeded random stream, fixed-point
  positions, and a command queue applied at tick boundaries. A match replays exactly
  from its seed and command log, which is what makes co-operative play addable later
  without a rewrite.
- **Data-driven roster.** Towers, enemies, maps, waves, difficulties and status
  effects are validated JSON. Every row carries the wiki URL and retrieval date it
  came from.
- **No bundler.** Plain ES modules with JSDoc types, checked by TypeScript without a
  transpile step, so the same code runs in Node tests, a browser and the desktop shell.

## Licence and attribution

Tower Defense Simulator is the work of its own authors. This project reimplements
game mechanics and reproduces published statistics; it ships no assets, code or
written text from that project.
