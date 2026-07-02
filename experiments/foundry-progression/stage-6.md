# Stage 6 — Docs staleness sweep (v1.6.0)

**Verdict: ✅ EARNED** (deterministic, 2026-07-02)

## What was built

The final rebrand pass: every **live** doc is grep-clean of the upstream
`slice-tournament-zoo` identity —

- `README.md`: CI/license/node badges, npm install paths
  (`npm i -g stz-foundry`), plugin marketplace slug
  (`dr-robert-li/stz-foundry`), and every deep link into docs now point at
  the `stz-foundry` repo.
- `CONTRIBUTING.md`: title + clone instructions.
- `src/README.md`: module-map deep links.
- `docs/CLAUDE.md`: architecture-pattern title.
- `docs/development/local-and-testing.md`: clone instructions.

**Historical records keep the upstream name deliberately** (provenance, not
staleness): CHANGELOG entries at 0.9.6 and below (preserved verbatim by the
changelog's own contract), `docs/PAPER.md` (a dated record of the upstream
system), and everything under `experiments/`. `package.json`'s description
("the evolution of slice-tournament-zoo…") is intentional lineage.

## Eval design

- **New guard** in `test/foundry-identity.test.ts`: the live-docs list is
  asserted to never contain the upstream literal — a stale ref cannot return
  unnoticed. (The stage-0 guards for `src/update.ts` and the release
  workflow's name-pin remain.)
- **Version consistency**: `test/version.test.ts` (F19 drift guard) pins
  `package.json`, `.claude-plugin/plugin.json`, and
  `.claude-plugin/marketplace.json` to one version — all at 1.6.0.
- Full suite green.

## Results

- `grep -rn slice-tournament-zoo` over live docs: **0 matches**.
- 288 tests green; typecheck clean.
- The Foundry rebuild ledger is complete: stages 0–6 all EARNED, the
  standalone BYO-LLM harness (roadmap § "A distinct STZ-native harness")
  is built, live-proven at $0, and documented.

## Honesty caveats

- Doc *links* now point at `dr-robert-li/stz-foundry`; the GitHub repo and
  npm package must exist under those names at publish time (the stage-0
  release workflow guard already pins the npm side).
- The sweep is literal-match; a paraphrased stale reference (e.g. prose
  describing old behaviour) is out of scope and remains ordinary doc review.
