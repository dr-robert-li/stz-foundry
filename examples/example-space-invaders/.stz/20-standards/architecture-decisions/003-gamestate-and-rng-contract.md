---
summary: "ADR: window.gameState is a live, mutated-in-place, JSON-serializable snapshot object matching a fixed field contract; all randomness routes through a seedable SI.RNG instead of Math.random(), so sealed Playwright tests get reproducible, assertable state."
---

# ADR-003: `window.gameState` contract + seedable RNG

## Status
Accepted.

## Context
The intent's sealed tests (P1-P4) assert on "game state exposed on `window`" via
Playwright's `page.evaluate(() => window.gameState)` (confirmed working pattern,
`.stz/10-research/external/04-window-state-testing.md` and validation Claim 1).
For those assertions to be meaningful and stable:
1. The object Playwright reads must actually reflect current game state at the
   moment of the call (not a stale copy captured once at startup).
2. Its shape must be predictable enough that test authors (a separate slice) can
   write assertions without reverse-engineering internals.
3. Anything non-deterministic in game rules (UFO spawn timing/value, which alien
   fires) would make P1-P4 flaky unless it's controllable from a test.

## Decision
**gameState**: `main.js` sets `window.gameState = SI.Game.state` once, and
`SI.Game.update()` always mutates that same object's fields in place (arrays are
replaced wholesale per update — e.g. `state.aliens = state.aliens.filter(...)` —
rather than mutating array contents in a way that could leave stale entries).
Never `window.gameState = {...newObject}` after bootstrap — that would break the
live reference Playwright expects to keep re-reading. The field contract is fixed
in `conventions.md` (`state`, `score`, `lives`, `wave`, `fps`, `player`, `aliens`,
`playerBullets`, `alienBullets`, `shields`, `ufo`); fields may be added, not
renamed or removed, without a corresponding update to conventions.md.

**RNG**: `SI.RNG` is a small seedable PRNG (e.g. mulberry32 or sfc32 — a ~10-line
function, no dependency) exposing `SI.RNG.seed(n)` and `SI.RNG.next()` (0..1,
same interface as `Math.random()`). Every place the game needs randomness (UFO
appearance timing, UFO bonus value in the 50-300 range, which column of aliens
fires next) calls `SI.RNG.next()`, never `Math.random()`. Tests that need a
specific random outcome call `SI.RNG.seed(n)` before driving the game; tests that
don't care about randomness still get full determinism for a given seed, which
the game can default to a fixed value (e.g. `Date.now()`-seeded only in
production init, but always overridable) so P1-P3 (which don't depend on UFO/RNG
timing) never see nondeterminism from `SI.RNG` regardless of seed.

## Consequences
- Test authors can write `page.evaluate(() => window.gameState.score)` and trust
  it reflects the current frame with no extra plumbing.
- UFO-bonus and alien-fire-selection tests (P4) become reproducible by seeding
  `SI.RNG` from the test before triggering the relevant event.
- `SI.RNG` is on the critical "no shipped dependency" path — must stay a small
  hand-written function, not an npm PRNG package, per the zero-dependency rule.
- Locks in a specific shape early; changing `gameState` field names later is a
  breaking change against sealed tests and must be avoided rather than fixed
  after the fact.
