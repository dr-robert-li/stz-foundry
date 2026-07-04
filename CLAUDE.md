# STZ Foundry — project instructions

## README rule (user directive, locked 2026-07-04)

The README must stay **succinct and readable by layperson operators**. When
editing it:

- Short sections, one-line command descriptions, no dense config prose.
- Mechanism detail belongs in `docs/development/*.md` (dark-factory.md,
  bridge-cli.md, …) or the command docs — never inlined into the README.
- Quickstart 1 keeps its shape: "two commands" (`/stz-f:new`,
  `/stz-f:pipeline --auto`) + *Good to know* bullets + the
  standalone-invocation guidance.

## Architecture rule

Exact decisions (selection, pricing, gating, greenfield/brownfield calls) live
in deterministic TypeScript (`src/`), never in agent prose. Command markdown
(`commands/*.md`) orchestrates; the bridge decides.

## Quality bar

`npm test` (full suite green) + `npm run typecheck` before every commit; every
behavioural change lands with the test that proves it. Version bumps must keep
`package.json`, `.claude-plugin/plugin.json`, and
`.claude-plugin/marketplace.json` in sync (the drift-guard test enforces it).
