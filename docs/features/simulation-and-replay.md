# Deterministic simulation and replay

The simulation is designed to run on a fixed 30 Hz tick, a single seeded random
stream and fixed-point positions, so a match can be replayed exactly from its seed
and a log of the commands a player issued. **Status: the random generator and the
fixed-point helpers are implemented (`src/sim/core/rng.js`, `src/sim/core/fixed.js`);
the tick loop, command queue, snapshot and replay themselves are still designed, not
yet built.** Nothing below claims a feature that does not exist in the repository
yet; where it describes intended behaviour it says so plainly.

## Behaviour

- **One seeded stream.** `createRng(seed)` returns a small serialisable state object;
  every random draw anywhere in the simulation is meant to pull from this one
  stream, in an order fixed by system execution order rather than by map iteration
  order, so two runs with the same seed draw the same numbers in the same sequence.
  `Math.random` is banned under `src/sim`, and a planned `tools/check-determinism.mjs`
  is meant to fail the build if it reappears.
- **Fixed-point positions.** Positions and distances are integers in 1/1024
  map-unit steps (`toFixed` / `fromFixed` in `src/sim/core/fixed.js`), because
  repeated floating-point addition over a long match accumulates rounding error
  that eventually diverges two replays of the same command log; a boss losing
  `0.30000000004` hit points a tick is exactly the kind of divergence integers
  cannot produce. Range checks use squared distance (`distanceSquared`) so most
  comparisons never need a square root at all; `isqrt` exists for the rare place a
  real distance is required.
- **Fixed tick, command queue (planned).** The simulation is designed to advance in
  fixed 1/30-second steps regardless of render frame rate, with player actions
  (placing a tower, selling, using an ability) queued and applied only at a tick
  boundary. This is what keeps a replay's outcome independent of exactly when, in
  wall-clock time, an input arrived.
- **Snapshot, restore and hashing (planned).** A match's entire state is meant to
  serialise to one snapshot and restore from it exactly, with a stable hash over
  that state so two runs can be compared by hash sequence instead of a full state
  diff.
- **Replay from seed and command log (planned).** Given a seed and the recorded
  command log, the simulation is meant to reproduce byte-identical results, proven
  by running the same seed and log twice and comparing the resulting hash
  sequences rather than trusting that it "looks the same".

## Configuration

- A match's seed is the only external input the random stream takes. There is no
  per-system seed and no reseeding mid-match; everything traces back to one number.
- Fixed-point precision is a compile-time constant (`FIXED_SHIFT = 10`, i.e. 1024
  steps per map unit) rather than a runtime setting, because changing it mid-match
  would itself be a source of replay divergence.

## Failure modes

- **A stray `Math.random()` call.** This is the single most likely way determinism
  breaks: a call added under `src/sim` that does not go through the shared RNG
  stream. The planned determinism check exists specifically to catch this before it
  reaches a release.
- **Float creeping into position math.** Any code path that reads a fixed-point
  value with `fromFixed`, does arithmetic on the resulting float, and writes it back
  without re-quantising reintroduces the rounding error fixed-point was chosen to
  avoid.
- **Iteration-order dependence.** A system that iterates a `Map` or an array whose
  order is not itself deterministic (for example, insertion order that depends on
  spawn timing across two different runs) can call the RNG in a different order
  between two "identical" matches even with the same seed, producing different
  draws from the same stream.

## Security considerations

The simulation runs entirely locally inside the desktop application; it has no
network input and does not execute untrusted code. The determinism guarantee is a
gameplay and testing property (an exact replay for a bug report, a deterministic
verification of statistics), not a security boundary.

## How to verify

- `node --test` over the random generator: same seed, same sequence of draws;
  different seeds, different sequences (with a high-probability check, since RNG
  collisions are not literally impossible).
- Once the tick loop and command queue exist, the plan is a test that runs the same
  seed and command log twice and asserts the resulting state hashes are equal.
- `npm run check:determinism` is reserved in `package.json` for the planned
  determinism checker; until `tools/check-determinism.mjs` exists, that script has
  nothing to run.

## Suggested articles

- [The data model, and where the statistics come from](./data-model.md)
- [Towers and upgrades](./towers-and-upgrades.md)
- [The build and the release path](./build-and-release.md)
