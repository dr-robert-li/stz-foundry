# Stage 0 — Identity rebrand + new-npm-package CI/CD (v1.0.0)

**Verdict: ✅ EARNED** (deterministic, 2026-07-02)

## What was built

The project identity moved from `slice-tournament-zoo` 0.9.6 to `stz-foundry`
1.0.0 — a **new npm package**, not a new version of the old one — and the
release pipeline was rebuilt so it is *mechanically incapable* of overwriting
the upstream npm release.

- `package.json`: name `stz-foundry`, version `1.0.0`, repo/homepage/bugs →
  `dr-robert-li/stz-foundry`, second bin alias `stz-foundry` (same entrypoint,
  so a machine with the old global package installed can still reach the new
  CLI without a bin collision).
- `src/version.ts`: `PACKAGE_NAME = "stz-foundry"` — the single code constant
  every update-check and remediation string derives from (the F19 seam; no
  other module re-types the name).
- `.claude-plugin/{plugin,marketplace}.json`: 1.0.0, Foundry descriptions
  (the existing drift-guard test re-pins all three manifests to one version).
- `.github/workflows/release.yml` (the CI/CD redo): added a **name guard** —
  the publish job hard-fails unless `package.json.name === "stz-foundry"` —
  and all release-notes links now point at the new package. Trusted-Publishing
  setup steps for the new package are documented in the workflow header
  (one-time npmjs.com configuration; cannot be done from CI).
- CLI banner / AGENTS.md template / `src/update.ts` header: identity text.

## Eval design

Deterministic, no LLM. Instrument: `test/foundry-identity.test.ts` plus the
pre-existing guards, all run by the full suite:

1. **Identity pin** — `PACKAGE_NAME === "stz-foundry"`, major ≥ 1.
2. **Bin duality** — both `stz` and `stz-foundry` resolve to `bin/stz.mjs`.
3. **No-overwrite guard is real** — the release workflow *contains* the name
   guard string and contains no upstream publish-target reference. (Guards the
   guard: a future edit that drops it fails the suite, not just the release.)
4. **No stale literals in the update path** — `src/update.ts` contains no
   `slice-tournament-zoo` literal, so every remediation command a user is told
   to run derives from the pinned constant.
5. **Pre-existing drift guard** (`test/version.test.ts`) — package.json,
   plugin.json, marketplace.json share one version; registry URL builds from
   the constant. Re-pinned to the new name.

## Results

- Typecheck clean; **249/249 tests green** (245 inherited + 4 new stage-0).
- `registryLatestUrl()` now resolves `https://registry.npmjs.org/stz-foundry/latest`
  — `stz update` checks the new package, never the old one.
- The one thing this stage cannot earn from inside the repo: the npm-side
  Trusted Publishing registration for the new package name (owner-only,
  documented in the workflow header). Until then, pushing a `v*` tag will fail
  at the publish step — fail-closed, which is the intended posture.

## Honesty caveats

- The name guard proves the *workflow text* is safe; the npm registry itself
  is the final arbiter (publishing `stz-foundry` cannot touch
  `slice-tournament-zoo` regardless — distinct package names are distinct
  registry objects; the guard defends against a future accidental rename-back).
- Docs (README, ROADMAP, development docs) still carry upstream identity in
  places; that is stage 6's sweep, deliberately last so it can also cover
  everything stages 1–5 add.
