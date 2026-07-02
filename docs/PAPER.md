# When does a self-improving coding harness actually improve competency? A negative result, earned

**Robert Li**
slice-tournament-zoo (STZ), 2026-06
*Part II addendum: STZ Foundry (stz-foundry 1.8.0), 2026-07 — §10–§15*

## Abstract

STZ is a contract-bounded tournament harness for agentic coding. It runs several
implementer agents against one sealed, held-out test suite, eliminates anything that trips
a hack detector, ranks the survivors with a frozen judge, and leaves a markdown audit trail
that a reviewer can replay. Version 0.9.0 adds a harness-level meta-loop: the harness can
evolve its own genome (test-author heuristics, selection weights, judge rubric, fan-out, a
mutation battery) against held-out pilot fitness, in the style of the Darwin Gödel Machine
and HarnessX.

This paper reports the question that mattered most and the answer I did not want: does the
meta-improving harness ship more correct code than the same harness without the
improvement? Across six fresh substrates and every selection signal the harness can compute,
the answer is no, and the reason is structural rather than incidental. A suite-sharpening
gain needs a correctness axis that is, at the same time, large enough to move held-out
truth, split across the blind implementer pool, and invisible to a good-faith functional
suite. Those three properties are close to mutually exclusive in practice. The
mechanism that the meta-loop is built around does work: the harness discovers a genuine
blind spot and bakes a test for it. Turning that mechanism into demonstrably better shipped
code does not follow. I describe the build, the experiments, the discipline that kept the
result honest, and the open questions.

## 1. Motivation

The recent literature on recursive self-improvement for code agents reports gains when the
improvement happens at the harness altitude rather than inside a single rollout. The Darwin
Gödel Machine evolves an archive of agent variants; HarnessX-style work substitutes one
component at a time and keeps what scores. STZ was built to test a narrower and more
practical claim: if you let the harness rewrite the parts of itself that choose a winner
and author the tests, does the winner it ships get more correct on a held-out oracle it
never trained against.

The honest version of that question has a trap in it. Suite-sharpening helps selection by
definition: add a test for behavior X and the suite now prefers candidates that satisfy X.
Showing that is not a result. The result has to be a gain on quality the harness did not
target, measured on an oracle independent of the signal it optimized. Most of the work in
this paper is about not fooling myself on that point.

## 2. What was built, and where to test it

STZ runs inside Claude Code. The orchestrator is a slash command following a procedure in
markdown; the deterministic parts (the eval gate, GRPO selection, hack detection, sealing,
the meta-loop bookkeeping) live in a TypeScript CLI called `stz bridge` that takes JSON in
and returns JSON out. Implementer agents, the judge, the test author, and the documenter
are real in-session subagents. The pipeline runs eight phases per slice: elicitation,
research, ground-truth validation, conventions, frozen test authoring, planning, an
adversarial parallel tournament, then judgment and merge with an intent-versus-as-built
spec diff as the audit record.

The 0.9.0 meta-loop is opt-in and off by default. It keeps a content-addressed archive of
harness variants in `.stz/60-harness/`, samples parents with probability proportional to
fitness over one plus child count (the DGM diversity rule), mutates one gene per child,
scores each variant on the recall-free pilots, and promotes a variant only through five
gates: it must beat the incumbent on held-out fitness, be clean on its own outputs under
the hack detector, preserve sealing integrity, preserve the bridge command surface, and
come from a generation with enough variance to rank. Any sensor that trips halts and
surfaces; nothing rewrites its own guard, which is the failure mode the DGM and code-repair
literature keep running into.

Source, install, and replay:

- npm: `npm i -g slice-tournament-zoo`, then `stz init`, `stz run`, `stz bridge ...`.
- Claude Code plugin: drives the in-session `/stz:*` commands; the npm CLI satisfies its
  bridge dependency.
- GitHub: `https://github.com/dr-robert-li/slice-tournament-zoo` (Apache 2.0). 183 tests,
  green at the time of writing; `npm test` reproduces them.
- Every experiment in this paper lives under `experiments/<task>-pilot/` with a
  pre-registration, a results document, machine-readable result JSON, and the stored blind
  specimens, so each run replays deterministically from committed artifacts. The build
  journal that this paper compresses is `docs/JOURNAL.md`.

## 3. Related work

The selection layer follows GRPO from DeepSeekMath, with group-relative advantage
`A_i = (r_i - mean) / std`, and gates reasoning rewards on outcome correctness in the
spirit of Posterior-GRPO (Fan et al., 2025). The tournament shape, recursive pairwise
voting at fan-out 16 with two-way comparisons and eight votes per pair, and the sequential
refinement with four surviving summaries, come from the Meta RTV and PDR work on scaling
test-time compute for agentic coding (2026), which also reports that LLM judges run 60 to
80 percent accurate on subtle code changes. That last number turned out to predict a lot.

The held-out suite leans on property-based testing, which kills far more mutants than
example tests and catches most mutations within the first twenty inputs (OOPSLA 2025). The
anti-reward-hacking posture uses inoculation prompting from Anthropic's 2025 work on
emergent misalignment from reward hacking, and a hard cap on optimization depth motivated
by the Kernel-Bench and ALE-Bench finding that the proxy-to-real eval gap widens as agents
iterate. The audit-trail-as-deliverable design borrows event-sourced deterministic replay
from OpenHands, adapted to markdown plus git plus a per-slice state file. The harness
engineering patterns (progressive disclosure, per-worktree observability, a recurring
doc-gardener) come from the OpenAI Codex CLI write-up. The meta-loop's archive and
parent-sampling follow the Darwin Gödel Machine. Other prior art that shaped the design:
SWE-agent on tools shaping outcomes, Aider on git-native repo maps, MetaGPT and ChatDev on
multi-role decomposition, AutoCodeRover on structure-aware search, and Devin 2.0 on parallel
candidates with planner-coder-critic separation.

## 4. Method and discipline

The experimental spine is a synthetic, recall-free substrate per task. Each task has a
contract, a sealed suite that the implementers never see and that drives selection, and a
separate truth oracle that grades frozen winners and is never a selection signal. The two
must differ in mechanism and seed so a win cannot be the suite quietly reading the oracle.

Several guardrails were each bought with a mistake earlier in the project, and they are the
reason the later results are trustworthy:

- **Blindness.** Implementers, the judge, the reviser, and the test author never see the
  truth oracle. A post-hoc grep audit confirms specimens carry no suite or oracle
  constants.
- **The separation gate.** Before pre-registering a substrate, I confirm with reference
  implementations that a naive-but-plausible version fails the truth oracle and a correct
  version passes, and that a good-faith fixed suite passes both. If the substrate does not
  separate, it demonstrates nothing.
- **Pre-registration.** The design, the decision rule, and the null are committed to git
  before any blind specimen is generated. The commit is the timestamp.
- **Budget-matched comparison.** Iterate-versus-sample and variant-versus-incumbent compare
  at equal token budget, with the one-time authoring cost reported separately.
- **The symmetric-error rule.** A confounded run that leans toward "build it" is the same
  error as one that leans toward "do not build it." A confound makes a run silent, not
  supportive. The same rule applies to pressure: a positive staged to satisfy a deadline is
  the same integrity failure as a null one refuses to accept.
- **No constructed pools, no coaching.** A promotion only counts when the buggy specimen
  arises from a blind implementer, not when I insert a reference implementation or make a
  contract vague on the failing axis to manufacture errors.

## 5. Experiments and outcomes

The early pilots (cron, hexcolor, ipv4) established that STZ's selection signal beats a flat
pass rate on absolute correctness, and that a good-faith sealed suite can be hardened safely.
A SWE-Bench evaluation adapter was built and made to run on aarch64 through Epoch AI's arm64
images, but three attempts to use it to decide the convergence-loop question were each
silent because of recall contamination and the public-versus-held-out test split. Decisions
moved to the synthetic substrate.

Two convergence-loop arms closed the per-slice question. A blind, budget-matched iterate arm
on cron tied best-of-N: iteration cannot cross a gradient the sealed suite cannot see. A
judge-beyond-suite arm confirmed the judge mechanism works (a blind judge reasoned past a
fully green suite and found a spec-mandated malformed-token bug) but found the judge loop no
better than a hardened suite with best-of-N at the truth ceiling. The lesson was to relocate
the effort to suite-sharpening at the harness altitude, which became 0.9.0, and to state the
one door that could still justify a search loop: a task whose correctness is genuinely
non-enumerable.

The competency line walked through that door six times.

**streamStats** (single-pass variance, where the naive sum-of-squares formula loses to
catastrophic cancellation). Separation gate clean. All fifteen blind Haiku specimens across
three seeds wrote Welford's algorithm and scored truth 1.0. Recall saturation: nothing to
select on. The machinery ran end to end and correctly declined.

**shuffle** (uniform permutation, where `sort` with a random comparator is biased). A
fingerprint-only probe found five of five blind specimens wrote correct Fisher-Yates.
Saturated again.

**weightedSample** (weighted sampling without replacement, recall-resistant because the
Efraimidis-Spirakis key scheme is not reflexively memorized). Separation gate the cleanest
yet: the naive `weight times random` heuristic passed the good-faith fixed suite and scored
0.09 on the property suite, 0.16 on truth. Eight blind specimens, all correct, by a mix of
algorithms. Out-of-recall did not produce failure: with a precise contract the implementers
reasoned to correct code rather than recalling it.

**expr-eval** (Python-precedence arithmetic, where `**` is right-associative and binds
tighter than unary minus). The first substrate where blind specimens genuinely erred. All
five made the identical unary-`**` mistake and all five got right-associativity right. The
errors were correlated. A homogeneous pool of capable implementers makes the same mistake,
and you cannot select your way out of a bug every candidate shares.

**cron capstone.** cron is the one substrate with a real natural split: a malformed-token
bug (`5abc` accepted via integer truncation) that a permissive suite swallows. The flagship
automated mechanism ran end to end for the first time. `harness-mine` twice-verified the
blind spot (it survives the permissive suite and is killed by the sharpened one), and the
mutator was baked into the battery. But measured on the functional truth oracle, not the
axis that was sharpened, the sharper genome's selected winner tied the incumbent (0.9767).
Sharpening changed which winner was shipped without shipping a better one. The five-gate
promotion correctly declined.

**The numeric selection arms.** If selection cannot ship the truth-best specimen, ask
whether evolving the selection weights can. On the cron pool the truth-best specimen (c5,
truth 1.0) is the argmax of no computable proxy, and a grid over every weight tuple ships at
best the baseline number. Adding mutation-kill, the proxy designed to encode correctness,
did not change it: mutation-kill tied the truth-best with the truth-worst. The reason is
structural. Every numeric proxy (pass, coverage, kill) is derived from the sealed suite, and
the truth-best specimen's advantage lives outside the sealed suite by construction. It is
sealed-worse and truth-better. No sealed-derived weighting can reach it.

**The judge selection arm.** The judge is the only selection signal not derived from the
sealed suite, so it was the one structurally possible path to a positive. On the cron pool,
five frozen blind judges shipped c4, at full-contract truth 0.9643, below the numeric
baseline's expected 0.9732 and below the reachable ceiling of 0.9821. The judges reasoned
well and found real bugs in other candidates, but they rewarded visible defensive rigor
(c4's explicit Feb-30 guard) over the candidates that actually passed more held-out cases.

**The heterogeneous pool.** The last open cell mixes model strengths so the pool splits.
Adding two Sonnet and two Opus specimens to the eight Haiku gave a twelve-candidate cron
pool in which the Opus specimen o2 was perfect on full-contract truth and also sealed-best.
Five judges unanimously shipped o2, a lift of +0.0214 over the numeric baseline's expected
0.9786. A positive, on the literal re-ranking control. It is confounded three ways. It comes
from the default harness's judge stage, not from anything the meta-loop evolved. The win is
the strongest model's specimen, which is both most correct and most impressive, so part of
what is being measured is Opus beating Haiku. And it does not survive the contrast with the
homogeneous pool, where the judge shipped a worse candidate than numeric selection. The
judge signal is noisy and not reliably truth-tracking. It landed on the truth-best only
where the truth-best was also the best-looking candidate. (The judge is not pure appearance
either: it separated o2 from a near-identical Opus sibling by their one hidden functional
difference, unanimously, which is weak evidence of a real but unreliable correctness signal.)

## 6. Findings

**The structural law.** A suite-sharpening competency gain needs a correctness axis that is
substantial, split across the blind pool, and invisible to a good-faith functional suite, at
the same time. These three rarely co-occur, for three independent reasons. A substantial
axis comes from the core of the task, and a capable model either gets the core or does not,
as one decision, so the pool does not split. A split is a near coin-flip, which is by
definition a peripheral edge case, which carries little weight in held-out truth. And an axis
that a good-faith functional suite misses is one that normal inputs do not exercise, which
again makes it small. Six substrates are consistent with this, and the reasoning explains
why it is a regularity rather than bad luck.

**Sealed-derived blindness.** Every numeric selection proxy is a function of the sealed
suite, and the residual held-out truth lives outside the sealed suite. Reweighting cannot
recover a signal that none of the proxies carry.

**The judge is the only non-sealed signal, and it is unreliable.** It can reason past a green
suite, which is real, but as a selection signal it tracks visible thoroughness more than
held-out correctness, consistent with the 60-to-80-percent judge accuracy in the RTV work.
It helps when the most correct candidate is also the most impressive and hurts when those
diverge.

**The mechanism works; the competency claim does not follow.** `harness-mine` discovers and
twice-verifies a genuine blind spot and bakes a test for it. That is a true and useful
property. It is not the same as the harness shipping reliably better code, and the two were
kept separate throughout.

## 7. Discussion

The practical reading is that the value of harness self-improvement on these tasks is
one-time authoring rather than per-slice search, which is what the judge-beyond-suite arm
already suggested and what the competency line confirms with a mechanism. Bake a discovered
bug class into the test author once and every future suite is born catching it at near-zero
marginal cost. That is worth having. It is not a closed feedback loop that lifts correctness
on quality nobody encoded.

The result also says something about evaluation. A held-out oracle that excludes the axis
you sharpened will report a null by construction, and an oracle that includes it will report
a circular positive. The only honest measurement of a selection gene is on full-contract
truth with a train/test split across slices, and even then the gene has to be the kind that
can move the metric. A battery gene cannot; a selection gene can in principle but is starved
by sealed-derived proxies; the judge can in principle but is too noisy.

Two scope limits matter. Every competency arm used small, capable, mostly homogeneous Haiku
pools, so the correct claim is about these substrates and this pool, not a universal
impossibility. And the parser family is narrow, so the non-transfer of one blind spot across
cron, ipv4, and hexcolor is evidence about that family rather than a law about all parsers.

## 8. Open questions

- **A correctness-tracking judge.** The one remaining lever is a judge rubric that scores
  held-out correctness rather than visible rigor. The appearance bias looks intrinsic to LLM
  code judging, and tuning rubrics until a known specimen wins is shopping, so this needs a
  pre-registered protocol with a held-out test set rather than a quick fix.
- **A non-sealed-derived numeric proxy.** Is there a cheap, per-specimen signal that
  correlates with held-out truth without being a function of the sealed suite? If not, the
  ceiling on numeric selection is structural and worth stating as such.
- **Frontier-versus-frontier at scale.** The heterogeneous result is confounded by model
  strength. A pool of equally strong, genuinely diverse implementers on a task at their real
  competence frontier, with full-contract truth and a train/test split, is the experiment
  that could still separate "the harness selects better" from "the strong model wrote better
  code." It is materially larger than anything here.
- **Cross-slice amortization, properly measured.** The amortization claim (one discovery
  hardens a family) failed on this parser family because the blind spots were not shared. A
  family deliberately chosen to share a recurring, subtle bug class would test it fairly.
- **SWE-Bench as a deciding instrument.** The adapter runs on arm64, but recall and the
  public-versus-held-out split kept it demonstration-only. A clean per-instance sealed suite
  authored blind to the oracle would let a real benchmark decide the build, at the cost of
  the train-on-test risk that has to be controlled.

### 8.1 The 0.9.6 contract plane — a different signal class, earned then wired

Every negative in §6 concerns signals *derived from the sealed suite* — iterate-to-green,
judge-beyond-suite, numeric-gene reweighting. All are functions of what a functional
suite can see. 0.9.6 introduces a signal that is not: **typed contract predicates**,
including architectural/`diff-constraint` classes ("no new dependency", "only files
under X change") that no functional test can express *by construction*, because they are
properties of the change, not behaviours of the program. This is not a re-derivation of
the earned negatives; it changes the selection *object*, not the weight (the numeric-gene
negative already ruled out reweighting).

The claim is deliberately narrow and honestly bounded:
- **Earned (mechanism, on substrates):** an accepted predicate separates a naive impl
  from a good-faith suite (Phase 1), and *changes tournament selection* against STZ's own
  multi-objective reward — verified that `codeHealth` is literally blind to `package.json`
  so the win is not redundant with the shipped reward (Phase 3). Human acceptance is the
  sole path to trusted state (the α>0 exogenous signal); an agent role is rejected as
  approver in code.
- **NOT shown:** any field-scale outcome on a real held-out issue stream. Every earn rides
  two hand-picked toy axes (dependency, file-scope), not a distribution. Two candidate
  positives were *rejected* mid-build as manufactured — a rigged separation substrate
  (ipv4 octet-range, which a good-faith suite catches) and an amortization-fallacy cost
  claim (retrieval "6× cheaper", circular at n=1). The symmetric-error rule cuts both
  ways: refusing a staged positive and preserving a real one are the same discipline.

The plane is wired into `select()` behind a **default-off flag**; flag-off is
byte-identical to 0.9.5 (integration-tested), so the capability is dormant until a human
turns it on with an accepted contract — the boundedness is the point. Phase-by-phase
build/eval/verdicts (including deferred and mechanism-only) are in
`experiments/0.9.6-progression/`. The open cell of §8 remains open: this earns the
*mechanism* of the missing signal class, not the field win that would close it.

## 9. Reproducibility

Each substrate under `experiments/` ships a `PREREG.md` committed before specimens, a
`PILOT-RESULTS.md` or `RESULTS.md`, a `results/*.json`, and the stored blind specimens.
`experiments/EXPERIMENT-SUMMARY.md` is the cross-arm finding;
`experiments/HANDOFF-CURRENT.md` is the resume document; `docs/JOURNAL.md` is the
first-person log. The deterministic spine and its tests are in `src/` and `test/`. The
harness genome, archive, and bridge commands are documented in `docs/CLAUDE.md` (F19) and
`docs/ROADMAP.md`. Install and run per Section 2.

## References

1. DeepSeekMath, GRPO. verl documentation. https://verl.readthedocs.io/en/latest/algo/grpo.html
2. Fan et al. Posterior-GRPO (P-GRPO), Aug 2025. https://arxiv.org/html/2508.05170v2
3. Meta. Scaling Test-Time Compute for Agentic Coding (RTV + PDR), Apr 2026. https://www.swiftscholar.net/paper/69eab9ef84947a5132b6304c
4. Anthropic. Natural Emergent Misalignment from Reward Hacking, Nov 2025. https://www.anthropic.com/research/emergent-misalignment-reward-hacking
5. Reward Hacking in Self-Improving Code Agents (Kernel-Bench / ALE-Bench), 2025. https://arxiv.org/html/2601.20103v1
6. Empirical Evaluation of Property-Based Testing in Python, OOPSLA 2025. https://cseweb.ucsd.edu/~mcoblenz/assets/pdf/OOPSLA_2025_PBT.pdf
7. OpenHands (paper + V1 SDK). https://arxiv.org/pdf/2407.16741.pdf
8. OpenAI Codex CLI, Harness Engineering, Feb 2026. https://openai.com/index/harness-engineering/
9. SWE-agent, ACI design. https://github.com/SWE-agent/SWE-agent/blob/main/docs/background/aci.md
10. Aider architecture. https://agentwiki.org/aider
11. MetaGPT. https://github.com/geekan/MetaGPT
12. ChatDev, arXiv 2307.07924. https://arxiv.org/html/2307.07924v5
13. AutoCodeRover, arXiv 2404.05427. https://arxiv.org/abs/2404.05427
14. Cognition, Devin 2.0, Mar 2025. https://cognition.ai/blog/devin-2
15. Darwin Gödel Machine; HarnessX; SIA. Harness-level recursive self-improvement (2024-2026), as surveyed in `docs/ROADMAP.md`.
16. Epoch AI. arm64 images for SWE-bench Verified. `ghcr.io/epoch-research/swe-bench.eval.arm64.*`


---

# Part II — From research harness to standalone foundry: the rebuild, the live earns, and the first end-to-end field run

*Added 2026-07. Part I (§1-§9) is preserved verbatim as the earned record of the
0.x research programme; its negative results are load-bearing inputs to
everything below and are not re-litigated. Part II covers the 1.x rebuild of
STZ into **STZ Foundry** (`stz-foundry`), the live local-model earns that
hardened it, and the first complete dark-factory field run.*

## 10. The Foundry rebuild (1.0.0 → 1.8.0)

Part I's harness ran only inside an agent host (Claude Code), so every
tournament was bound to one vendor's CLI and one billing plane. The largest
unbuilt roadmap item was a **standalone BYO-LLM harness**: a runner that owns
the spawn-and-collect loop and talks to models directly. The rebuild kept the
0.x discipline — each stage must EARN its existence with a deterministic eval
(and, where marked, a live local-inference run at $0 marginal cost) before the
next stage is built; a stage that cannot be earned is frozen as a documented
negative. The stage ledger is `experiments/foundry-progression/` (stages 0–6,
all earned):

- **Stage 0** — identity rebrand + release CI that can never overwrite the
  upstream npm package (a hard name guard, pinned by test).
- **Stage 1** — the provider seam: one adapter each for the Anthropic Messages
  API and OpenAI-compatible chat completions (which buys Ollama, vLLM, and
  LiteLLM for free). Bounded retries; prompt caching mandatory on the
  Anthropic path; zero dependencies.
- **Stage 2** — `FoundryModelLayer`: the real `ModelLayer` over providers, so
  the SAME deterministic pipeline (eval gate, GRPO selection, hack detection,
  escalation FSM) that Part I earned runs unchanged over direct HTTP models.
  Live earn: a full mini-tournament on a local 30 B model, $0.
- **Stage 3** — genuine specimen concurrency with a bounded pool, per-specimen
  wall-clock stuck-kill, and crash containment.
- **Stage 4** — real-usage cost governance: per-model pricing, per-role
  aggregation, hard token/USD caps enforced at the single seam every LLM call
  passes through; unknown models are reported, never guessed.
- **Stage 5** — the standalone CLI (`stz foundry init|run`): a secret-free
  config (API keys by env-var name only; a config embedding a key is
  rejected), per-role model overrides, and the full tournament with a
  per-role cost report. Live earn on local Ollama, discussed next.
- **Stage 6** — documentation staleness sweep with a regression guard.

Distribution updated accordingly: `npm i -g stz-foundry` (CLI: `stz`,
`stz-f`, `stz-foundry`); Claude Code plugin `stz-f` driving the `/stz-f:*`
commands; releases cut by a one-button gate → lockstep-version → tag → npm
Trusted Publishing (OIDC + provenance) → GitHub release pipeline.

## 11. What the live earns taught: the instrument is a moving part

The stage-5 live earn — small local models (9 B–30 B) driving every role on a
workstation already saturated by a concurrent training job — was the most
productive failure series of the rebuild. Every failure fell into one of two
classes, and learning to tell them apart is itself a finding:

**Class 1 — instrument defects, fixed in the instrument.** Five distinct
defects surfaced only under live conditions, each converted into a
deterministic guard or a sharper frozen prompt, all regression-tested:

1. *Transport truncation masquerading as model failure.* A non-streaming
   local completion answers only after full generation; the HTTP client's
   300-second header timeout killed long generations and surfaced as a
   spurious "network error" retry-storm — which had earlier been
   mis-attributed to the model producing empty output. The provider now
   speaks raw `node:http` with no client timeout (the cost caps are the real
   bound). Lesson: on slow inference, transport defaults are part of the
   experiment.
2. *The reference framing the harness.* A reference implementation that
   default-exports makes every harness case throw, and the smoke gate blamed
   (and re-asked) the harness — burning its bounded repair budget on the
   wrong side. A probe-import export check now validates the reference before
   the smoke gate runs, and re-asks the REFERENCE.
3. *Syntactic failure modes of small models* (static `import` of a runtime
   path; TypeScript annotations copied verbatim from the contract into
   plain-JS files). Fixed by dictating the exact first line and giving literal
   do/don't examples in the frozen prompts — validator messages alone were
   too terse for a small model to act on.
4. *Wire-format drift* (`passRate` emitted as a rounded string via
   `toFixed`). The self-check now names the actual defect
   ("parsed-but-mistyped") instead of a generic failure, so the bounded
   re-ask can fix it.
5. *Invented expectations* — the test author asserting transformations the
   contract never mandates (trimming legal characters, transliterating
   accents). The reference smoke gate caught this every time; the fix that
   finally converged was a re-ask instructing the author to *recompute each
   failing expectation by mechanically applying only the contract's stated
   rules, or delete the case*, plus a second bounded round.

**Class 2 — model ceilings, correctly rejected rather than patched.** One
local model persistently invented expectations beyond the contract across
both re-asks. The gate killed both harnesses. The fix was a stronger
test-author model, not a weaker gate — the asymmetry Part I §6 predicted
(the sealed suite is the selection signal; a defective instrument zeroes
every specimen) held exactly, and the validators' job is to make the
distinction legible instead of burning the escalation budget on it.

The composite lesson extends Part I's "selection-signal quality is the
lever": **for a local-model foundry, suite-authoring strength is the binding
constraint.** Specimens can be small (a 9 B model won tournaments); the test
author could not be. The economical configuration that emerged — a stronger
model on the frozen test-author role, small models everywhere else — is now
directly expressible via per-role overrides in `foundry.json`.

A second field lesson concerned **shared workspaces**: a re-invoked
test-author deleted the cross-family reference (`reference-b/`) it is
deliberately blind to, "tidying" an unrecognized sibling directory. The
blindness that makes the cross-check meaningful is exactly what made the
directory look like a stray. Specimens already had an ownership boundary
("write only your directory"); the reference authors did not. All frozen
roles now carry one, worded to preserve the blindness. Deliberate
information asymmetries need matching write-boundary asymmetries.

## 12. Field demonstration: a complete dark-factory run (example-stz-f)

The first end-to-end field run took a one-line intent — "a playable Space
Invaders as a single self-contained HTML file" — through the full pipeline in
dark-factory mode (autonomous, human gates skipped): elicitation with five
machine-checkable done-predicates, research with ground-truth validation (14
claims confirmed, 2 refuted, 3 unverifiable), conventions + four ADRs, a
two-layer test strategy (Node `vm` unit/property layer for coverage and
mutation; sealed Playwright e2e as the P1–P5 authority), a six-slice DAG, and
N=4 tournaments per slice. Artifacts: `example-stz-f/.stz/` (SUMMARY.md is
the narrative record). Outcome: **all six slices done and faithful, 18
specimens culled, one human adjudication, a shipped game passing all five
predicates.**

Three observations carry evidentiary weight:

**The gate caught a real, ship-blocking bug — cleanly.** In slice-05 the
contract pinned that a bullet hitting a shield cell "reduces integrity and is
consumed" — spent cells keep absorbing. One specimen implemented the more
"realistic" opposite (destroyed cells become holes), documented its choice,
and failed the sealed suite while the sole contract-faithful specimen passed.
This is the Part I mechanism doing its field job: a plausible, well-reasoned,
wrong-per-contract implementation eliminated by a suite its author never saw.

**The crosscheck halt is the most valuable autonomous behavior observed.**
In slice-02 the two independently-authored references diverged (16/16 vs
12/16). The factory did not guess: it halted the slice with a failure report
offering three one-step resolutions. Adjudication took one human decision —
one root cause was a genuine specification gap (whether array membership
alone makes a bullet "live"; the ADR pinned the field contract but not the
element contract), the other a real bug in reference B (dt-scaled movement
violating the fixed-timestep ADR). The surfaced rule became an explicit
convention restated in every downstream slice manifest. This validates the
design stance Part I could only assert: test-DESIGN ambiguity is the one
signal an autonomous run must defer, because "fixing" it autonomously means
choosing an interpretation and baking it into the selection instrument for
every later slice. (The run also exposed two robustness gaps since fixed:
that halt class was not durably persisted to state — now the `slice-halt`
bridge primitive — and a linear six-slice DAG let the one halt starve four
downstream slices — now the fan-out-by-default `sequencing` knob, alongside
a user-set `retryPolicy` for the no-passers halt class, which remains
policy-bounded and distinct from the always-human crosscheck class.)

**Judge preference dominates when the gate saturates — as Part I predicted.**
In three of six slices, all (or all-but-one) specimens passed the sealed
suite at 1.00, and the tournament ranking was decided purely by the judge's
code-quality/convention preference. Part I §6 found the judge noisy and
appearance-weighted as a *correctness* signal; the field run shows its
benign counterpart: at correctness ties it functions as a style/convention
tie-breaker, which is defensible — provided the audit record labels those
rankings as preference, not defect (the summary does). The practical rule:
read `testPassRate` before reading the ranking.

## 13. Where the tournament beats a linear pipeline — and where it does not

Six substrates (Part I), six live-earn slices, and one field project support
a placement rule.

**Strong fit — correctness is decidable and defects are expensive:**

- *Contract-shaped units with sharp pass/fail:* parsers, validators, codecs,
  pricing/billing logic, protocol handlers, game/simulation state machines.
  A linear pipeline ships the first thing that compiles; the tournament makes
  N attempts race a suite none of them wrote. The slice-05 shield bug is the
  canonical field case.
- *Self-grading risk:* a linear agent writes the code AND the tests that
  bless it. The frozen author / sealed suite / crosscheck stack exists
  because self-graded agents game their graders (Part I, R1/L1-L4).
- *Audit-required environments:* the `.stz/` trail (who competed, why losers
  lost, judge votes, spec-diff, cost) is the deliverable; a linear pipeline
  cannot reconstruct it retroactively.
- *Ambiguity you want surfaced, not guessed:* the crosscheck halt converts a
  specification gap into a durable, adjudicable artifact *before* anything is
  graded against a possibly-biased suite.
- *Cheap-inference regimes:* with local models via the foundry runner,
  redundancy is nearly free — N mediocre specimens + a sharp gate beat one
  attempt at $0, provided the test-author role gets the strong model (§11).
- *Lights-out batch work over a DAG*, with the halt semantics of §12.

**Poor fit — use a linear pipeline:**

- Spec-discovery work (UI feel, exploratory design): no machine-checkable
  predicate → no gate → the tournament degenerates to expensive dice rolls.
  Part I's rule survives contact with the field: *if you cannot write a
  sealed suite for it, STZ has no lever.*
- Single-obvious-path changes: every specimen writes the same code; the N×
  multiplier buys selection pressure over nothing.
- Deep-context refactors of large existing codebases: specimens work from
  the contract surface; a linear agent steeped in full repo context wins.
- Saturated-gate regimes (slice-03/04/06): when every specimen passes, you
  are paying tournament prices for a style preference. Detectable in the
  audit trail; a future economizer could shrink N when a slice's predicted
  difficulty is low.

## 14. What's next

- **Field-scale contract plane.** §8.1's open cell stands: the 0.9.6 typed
  predicates earned mechanism, not field outcome. The Space Invaders run
  suggests the natural experiment — architectural predicates ("zero runtime
  dependencies", "only files under src/ change") on a real issue stream,
  measured against the linear baseline.
- **Retry-policy telemetry.** The `retryPolicy` knobs (bounded/unbounded
  retries and replans) are new; nothing yet measures where extra rounds
  actually recover a winner vs burn budget — the Part I iterate-arm result
  (iteration cannot cross a gradient the sealed suite cannot see) predicts
  low recovery except where the refinement context changes the strategy mix.
  Instrument it before recommending defaults beyond 2+1.
- **Fan-out economics.** `sequencing: fanout` multiplies concurrent cost by
  frontier width × N with no throttle. A `maxParallelSlices` cap and
  difficulty-scaled N (shrink the tournament when the gate is predicted to
  saturate) are the obvious next knobs; the saturated slices of §12 supply
  the training signal.
- **Test-author strength on local stacks.** §11's binding-constraint finding
  is one data point on one slice family. A systematic sweep (author model ×
  specimen model × contract complexity) would turn it into a placement rule
  with numbers.
- **A calibrated tie-breaker.** Part I's judge-calibration gate (0.9.5)
  guards promotions; the field run suggests a cheaper use — at gate
  saturation, rank ties by measured judge reliability on the task family, or
  simply ship the cheapest passer and say so in the audit trail.
- **The Part I open cells stand.** Frontier-versus-frontier at scale,
  cross-slice amortization on a family that genuinely shares a bug class,
  and a non-sealed-derived numeric proxy remain open; the foundry makes the
  first two materially cheaper to run (local fleets, $0 marginal).

## 15. Reproducibility (Part II)

The rebuild ledger is `experiments/foundry-progression/` (stages 0–6, each
with its earn record; the stage-5 live run's complete audit tree is committed
under `live/stage5-workdir/`). The field demonstration's full `.stz/` tree —
including the slice-02 failure report and its resolution, the slice-05
pressure log, and per-role cost — lives in the `example-stz-f` project
(SUMMARY.md is the entry point). The deterministic spine, the escalation
FSM with its policy bounds, the `slice-halt` primitive, and the provider
seam are all pinned by the test suite (`npm test`, 299 green at 1.8.0).
Install: `npm i -g stz-foundry`; plugin: `/plugin install stz-f`;
standalone: `stz foundry init && stz foundry run <manifest>`.
