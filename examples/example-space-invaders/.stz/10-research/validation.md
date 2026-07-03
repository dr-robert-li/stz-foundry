---
summary: "Validation of research claims (external/ + internal/) against ground truth: actual Playwright runs in this environment, actual Chromium binary, actual filesystem, actual WebAudio/AABB code execution. 12 confirmed, 1 refuted, 2 unverifiable-as-stated (with a critical finding on P5/FPS claim)."
---

# Validation Report

Environment used for verification: this sandbox (aarch64 Linux, 20 vCPU, NVIDIA GPU present per `lspci`),
Node v24.15.0, Playwright 1.59.1 installed at
`/home/robert_li/.npm-global/lib/node_modules/gsd-pi/node_modules/playwright`, Chromium 1217
downloaded at `~/.cache/ms-playwright/chromium-1217/chrome-linux/chrome`. `@playwright/test` is
NOT currently installed in this project (project has no `package.json` yet) but is confirmed
installable (`npm view @playwright/test version` → 1.61.1, registry reachable).

## Environment / tooling claims

| # | Claim | Verdict | Evidence |
|---|-------|---------|----------|
| E1 | Node.js is available | confirmed | `node --version` → v24.15.0 |
| E2 | Playwright is available/installable in this environment | confirmed | `playwright@1.59.1` resolves and loads via `require()`; Chromium 1217 binary present at `~/.cache/ms-playwright/chromium-1217/chrome-linux/chrome` and launches successfully in headless mode (see FPS tests below) |
| E3 | `@playwright/test` (the test-runner package with `expect()`) is present | unverifiable-as-current-state / confirmed-installable | Not found under any `node_modules` on disk (`find ... -iname "@playwright"` → empty); `npm view @playwright/test version` succeeds (1.61.1) and npm registry is reachable (`curl playwright.dev` → 200). Must be added as a devDependency when the project is scaffolded — it is not present today. |

## Claim 1 — Playwright `page.evaluate()` + non-retrying matchers (external/04-window-state-testing.md)

| Claim | Verdict | Evidence |
|---|---|---|
| `page.evaluate(() => window.gameState)` returns the JS object from the page to the Node test process | confirmed | Ran real Playwright script (`run_default.js`) against a real HTML file with `window.gameState`; `page.evaluate` returned the live object as JSON, e.g. `{"frameCount":332,"samples":[...],"medianFps":60.0,...}` |
| `expect()` matchers like `toBe`, `toEqual`, `toBeGreaterThan` are non-retrying (assert immediately, correct for in-memory state) | confirmed | Fetched https://playwright.dev/docs/test-assertions directly: page explicitly lists these under "Non-retrying assertions" and states "these assertions ... do not auto-retry," recommending `expect.poll`/`toPass` only for cases needing retry |
| Passing arguments into `page.evaluate((param) => ..., 'lives')` | unverifiable (not separately exercised) | Not run directly, but this is a documented, stable, unchanged Playwright API shape and is a trivial corollary of the confirmed `page.evaluate` behavior above; low risk |

## Claim 2 — Headless Chromium FPS and GPU flags (external/05-fps-measurement.md) — CRITICAL

| Claim | Verdict | Evidence |
|---|---|---|
| Headless Chrome defaults to software rendering, Canvas 2D ~8–15fps without GPU flags | **refuted (in this environment)** | Built a real rAF-driven canvas test (`test.html`, 55 rects/frame) and a heavier stress test (`heavy.html`, 300 shadowed arcs + text/frame). Ran with **zero launch args** (Playwright default headless): median FPS = **60** across 5×1s samples in both light and heavy scenes. No 8–15fps behavior was observed at all. |
| `--use-gl=egl` / `--enable-gpu` raises fps to 30–60fps | **refuted as stated (no measurable effect here)** | Ran identical scenes with `--use-gl=egl --enable-gpu`, `--disable-gpu`, and `--headless=old` (+ `--disable-gpu`). All four variants (no-flags, old-headless, GPU-forced, GPU-disabled) produced **the same ~60fps median**, because `requestAnimationFrame` in headless Chromium is throttled to a simulated 60Hz vsync and the raw canvas draw cost (even the 300-object heavy scene) is far below the 16.67ms frame budget on this 20-vCPU machine. The GPU flag made no observable difference — draw cost was never the bottleneck. |
| **P5 predicate (median_fps >= 50) is achievable in headless Chromium** | confirmed (empirically, on this machine) | Both light and heavy synthetic scenes hit 60fps median with no special flags. |
| The *general* claim "default headless = 8-15fps, needs GPU flags for 30-60fps" as a portable fact about headless Chromium | unverifiable / likely environment-dependent | This machine has a real NVIDIA GPU (`lspci` shows "NVIDIA Corporation Device 2e12") and 20 vCPUs — the research's cited numbers may hold on weaker/shared CI runners (e.g. GitHub Actions default runners, containers without a GPU) where rAF may not be throttled the same way or raster is genuinely CPU-bound. This was not tested since no such constrained environment was available here. **Practical implication for the plan**: do not hard-code `--use-gl=egl` as a requirement for P5 to pass — test it on the actual CI/target machine; on this dev machine it is unnecessary, and the specific 8-15fps/30-60fps numbers should not be treated as verified facts, only as one plausible failure mode to guard against with real measurement in CI. |

Full data (medianFps, 5 one-second samples each):
```
light scene, no flags:              60.00  [53.6, 60.0, 60.0, 60.0, 60.0]
light scene, --headless=old:        60.00  [59.0, 60.0, 60.0, 60.0, 60.0]
light scene, --headless=old+GPU off:60.00  [60.7, 60.0, 60.0, 60.0, 60.0]
light scene, --use-gl=egl+enable-gpu:60.00 [57.6, 60.0, 60.0, 60.0, 60.0]
heavy scene (300 shadowed arcs), no flags:      60.00 [58.8, 60.0, 60.0, 60.0, 60.0]
heavy scene, --disable-gpu:                     60.00 [59.5, 60.0, 60.0, 60.0, 60.0]
heavy scene, --use-gl=egl --enable-gpu:         60.00 [59.7, 60.0, 60.0, 60.0, 60.0]
```

## Claim 3 — WebAudio API built-in, oscillator/envelope synthesis, zero deps (external/06-webaudio-synthesis.md)

| Claim | Verdict | Evidence |
|---|---|---|
| WebAudio (`AudioContext`, `OscillatorNode`, `GainNode`) is built into Chromium, no libs needed | confirmed | Ran the exact "laser/shot" oscillator+gain envelope snippet from the research doc inside real headless Chromium via Playwright; `window.gameState.hasOscillator === true`, `audioSynthOk === true`, no errors, `createOscillator`/`createGain`/`.start()`/`.stop()` all executed without throwing |
| AudioContext starts `suspended` and needs a user-gesture / `.resume()` in real browsers | confirmed | Observed `audioCtxState: "suspended"` immediately after construction, matching documented autoplay-policy behavior; the research doc's mitigation (resume on first click) is the standard, correct fix |

## Claim 4 — Manual script concatenation as single-file bundling strategy (external/07-bundling-strategy.md)

| Claim | Verdict | Evidence |
|---|---|---|
| Concatenating `src/*.js` files in dependency order into one `<script>` block inside one HTML file is a workable, zero-tooling bundling strategy | confirmed | This is standard, well-understood JS behavior (all scripts in one `<script>` tag share one global scope; no ES module semantics needed if code uses plain global namespace objects as the doc recommends) — not something that needs a live experiment; it is a correctness-by-construction claim about how `<script>` execution works, verified by inspection of the proposed pattern (global namespace objects, no `import`/`export`) which avoids the only real failure mode (duplicate top-level `const`/`let` declarations across files, or reliance on ES module scoping) |
| Recommendation (manual bundling over Vite/vite-plugin-singlefile) fits the "zero runtime deps" + "no build step for end user" constraint | confirmed | Directly matches intent.json constraints: "Deliverable is ONE self-contained HTML file... zero runtime dependencies" and "Develop as testable JS modules, then inline/bundle" — manual concatenation introduces no additional package.json runtime/build dependency beyond what's already needed for tests |

## Claim 5 — Codebase is empty (internal/01-codebase-structure.md)

| Claim | Verdict | Evidence |
|---|---|---|
| Project root contains only `.stz/`, no source code | confirmed | `find /home/robert_li/Desktop/projects/example-stz-f -mindepth 1 -not -path '*.stz*'` → empty result; `ls -la` on project root shows only `.stz/` directory |

## Claim 6 — rAF + fixed-timestep accumulator yields deterministic physics (external/01-canvas-game-loop.md)

| Claim | Verdict | Evidence |
|---|---|---|
| Fixed-timestep accumulator produces a deterministic sequence of update() calls independent of frame-render timing jitter | confirmed | Built a real accumulator loop (`FIXED=16.6667ms`, `x += 2` per fixed update) driven by real Playwright/rAF wall-clock timing across two independent browser runs. The recorded position sequence (`positions[]`, first 50 fixed-updates) was **byte-for-byte identical** across both runs (`positions match: true`), and `x` remained an exact multiple of 2 in both runs — i.e., per-step state transitions are deterministic. (Total step *count* over a fixed wall-clock window varied by 1, 116 vs 117 updates, because real wall-clock scheduling isn't perfectly reproducible — this is expected and is exactly why Playwright tests should assert on state *after a known number of simulated inputs/frames*, not on raw wall-clock-driven step counts, matching the research doc's own "Test Timing" guidance to manually step or use a deterministic input sequence.) |

## Claim 3b (implicit) — AABB collision formula correctness (external/03-collision-detection.md)

| Claim | Verdict | Evidence |
|---|---|---|
| `a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height > b.y` correctly detects rectangle overlap and excludes edge-touching | confirmed | Ran the exact formula in `node -e` with 4 test cases (overlapping, edge-touching, far apart, corner-overlap) — all assertions passed as expected: overlap→true, edge-touch→false, far-apart→false, corner-overlap→true |

## Claim 7 — Space Invaders arcade mechanics (external/02-space-invaders-mechanics.md)

| Claim | Verdict | Evidence |
|---|---|---|
| 5×11 grid, 10/20/30 points by row, "speed increases as aliens die" hardware quirk, 4 shields | unverifiable (not independently re-derived from primary arcade source in this session) | These are well-established, widely corroborated facts about the 1978 Taito/Midway arcade game (consistent with Wikipedia and Shmups Wiki as cited in the doc); no contradicting primary source was found, but this session did not independently fetch shmups.wiki or Wikipedia to re-confirm cited numbers — treated as low-risk since the intent.json itself directly restates the same defaults ("5x11 alien grid, 3 starting lives, alien points 10/20/30 by row, UFO bonus 50-300") as a locked project constraint, so correctness of the historical claim is secondary to matching the intent's own explicit numbers |

## Summary

- **Confirmed**: 14 (E1, E2, Claim1-evaluate, Claim1-matchers, P5-achievable-here, WebAudio built-in, AudioContext suspended behavior, bundling strategy correctness, bundling fits constraints, codebase empty, determinism, AABB formula, arcade defaults match intent.json)
- **Refuted**: 2 (default headless = 8-15fps; GPU flags needed to reach 30-60fps — both refuted *in this environment*, see critical note below)
- **Unverifiable**: 3 (`@playwright/test` current presence — but confirmed installable; `page.evaluate` with argument-passing variant; portability of the specific 8-15fps/30-60fps numbers to other/weaker CI machines; independent primary-source re-verification of arcade historical trivia)

## Critical finding requiring attention

**P5 (`median_fps >= 50`) is empirically achievable in this environment with zero special Chromium flags** — measured 60fps median on both a light (55-object) and heavy (300-object, shadows+text) synthetic canvas scene, with or without `--use-gl=egl`/`--enable-gpu`/`--disable-gpu`. This is good news for the plan's viability, but the specific numeric claims in `05-fps-measurement.md` ("headless defaults to 8–15fps without GPU flags") were NOT reproduced here and should not be treated as verified. Two possibilities: (a) this machine's GPU/CPU headroom makes the software-render path fast enough regardless, or (b) modern Playwright's default ("new") headless mode behaves differently than the old `--headless` mode the cited sources tested against. **Recommendation**: when the actual game is built, re-measure `median_fps` on whatever machine/CI will run the sealed P5 test — do not assume `--use-gl=egl` is required, but do not assume it's safe to skip measuring either, since the target CI machine may differ from this dev sandbox (fewer cores, no GPU, containerized/shared CPU).
