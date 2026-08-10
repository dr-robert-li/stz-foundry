# Adversarial panel — BI-BATTERY-DESIGN.md rev 1 (2026-08-10)

This panel runs through the review-lane seam directly (`gsd-tools review-lane invoke`) rather than the `/gsd-review` slash command: `/gsd-review` writes REVIEWS.md into `.planning/`, which this project gitignores (`planning.commit_docs: false`), while ROADMAP success criterion 3 requires the adjudication record COMMITTED — same lanes, same seam, committed destination. This is the REQ-49 panel on `experiments/bi-analytics-pilot/BI-BATTERY-DESIGN.md` rev 1, the same lanes, prompt discipline, and adversarial framing as `experiments/method-research/ANALYSIS-REVIEWS.md`'s Phase 6 panel.

**Panel:** gpt-sol-pro (UNSOUND), kimi-k3 (SOUND-WITH-CHANGES), qwen-max (SOUND-WITH-CHANGES), gemma4 (SOUND-WITH-CHANGES), gpt-oss (UNSOUND). Five of five target lanes produced output; no lane was dropped.

**Dead lanes:** None. Invocation-path note: the three openrouter lanes (gpt-sol-pro, kimi-k3, qwen-max) ran through the house seam (`gsd-tools review-lane invoke --slug opencode --model <id> --as <name>`) with `~/.opencode/bin` prepended to PATH — all three succeeded on the first attempt. The two local ollama lanes (gemma4, gpt-oss) used the pre-authorised direct HTTP POST fallback against `localhost:11434/v1/chat/completions` directly, rather than first attempting the seam's own `ollama` lane (`timeoutFloorMs` 120s) and waiting out a timeout that a cold load of a 19GB/13GB model against the full prompt was already established to exceed. `_memory-watchdog.sh` ran detached throughout the local-model work (background PID, 109GB ceiling); the two models ran strictly sequentially, each stopped (`ollama stop`) and confirmed unloaded (`ollama ps` empty) before the next was loaded. `wp-judge-v4` was not invoked in any role, per the standing exclusion (`HANDOFF-V3.md` §2).

## Review prompt

You are an adversarial reviewer of a pre-registered instrument design. Attack this design as an
adversary would — do not summarize it, do not praise it. Assume the author, Robert Li, wants this
design to survive review unchanged, and hunt for where the design lets him get that.

You are reviewing ONE document under attack:

- **BI-BATTERY-DESIGN.md** — `experiments/bi-analytics-pilot/BI-BATTERY-DESIGN.md` rev 1, the
  pre-registered battery design for the BI analytical-query-answering instrument.

Three further documents are embedded below as REFERENCE MATERIAL, because the constant-traceability
and drift lanes cannot be judged without them:

- **RECOMMENDATION.md** — `experiments/method-research/RECOMMENDATION.md` rev 2, source of the
  §4–§7 constants and the four-axis V3.1-§6 compliance mapping the design instantiates.
- **PREREG-DRAFT.md** — `experiments/method-research/PREREG-DRAFT.md`, source of the §2 oracle
  infrastructure, the §3 decision rule, and the §6 human-acceptance language the design supersedes.
- **V3.1-BATTERY-DESIGN.md** — `experiments/dataops-agent-pilot/V3.1-BATTERY-DESIGN.md`, the barred
  line's own design, so you can test the §6 substance question against the real thing rather than
  its name.

Return your findings under exactly these seven named headings, in this order:

1. Constant traceability
2. Gate conditions — gameability and ambiguity
3. Corridor and granularity arithmetic
4. Oracle independence
5. V3.1-§6 substance drift
6. Autonomy-directive supersession honesty
7. Other defects

Open your entire response with one line of the exact form `**Verdict: X**` where X is exactly one
of `SOUND`, `SOUND-WITH-CHANGES`, or `UNSOUND` — nothing else on that line. Number every finding you
raise `F1`, `F2`, `F3`, … in the order you raise them, restarting at F1 (this is YOUR OWN local
numbering within your response; it will be merged into a global sequence later — do not try to
guess or reuse numbers from any other reviewer).

Attack instructions, one per heading, stated concretely enough that you can produce a falsifiable
finding rather than an impression:

**1. Constant traceability.** Every number in the design must trace to a cited source section or
carry an explicit derivation. Check the §8 provenance table against the actual source documents — a
row citing `RECOMMENDATION.md §5` for a value that section does not contain is a mistrace, and a
value used in the prose but absent from the table is an untraced constant. Name the row and the
discrepancy.

**2. Gate conditions — gameability and ambiguity.** Read the three gate conditions and the firing
semantics (§9) as an adversary trying to make acceptance fire on weaker evidence than intended. Is
any condition satisfiable by an artifact other than the one meant? Can a partial pass be read as a
pass? Is any term (QUALIFIED, recorded, committed artifact) undefined at the point it is used? Is
the ordering of acceptance and adoption enforceable from what is written?

**3. Corridor and granularity arithmetic.** Recompute the arithmetic. The CI width from sd, seed
count and the t multiplier; the √2 two-point propagation giving the resolvable-gradient floor; the
granularity ratio against the corridor width; the headroom numbers. Flag any figure that does not
follow from its stated inputs, and flag any place the design asserts two numbers agree when they do
not.

**4. Oracle independence.** Attack the oracle's independence (§3). What exactly is independent of
what? Could the reference interpreter read a value the generator computed? Does the answer-first
construction actually keep ground truth free of the process under test, or does some step let the
generator's own logic define correctness? Is the `precomputed === recomputed` check capable of
failing?

**5. V3.1-§6 substance drift.** Test the design against the barred v3 line's real identity, not its
name. Read `V3.1-BATTERY-DESIGN.md` and ask whether this design is that instrument with different
nouns — same oracle mechanism, same parser, same task semantics, same qualification machinery under
new labels. A finding here is the highest-stakes finding available: it is a standing bar, not a
preference.

**6. Autonomy-directive supersession honesty.** Read the §9 supersession statement for honesty.
Does it state plainly that a human control was removed, or does it dress the removal up as a
formality? Is the preserved-versus-changed split accurate against what `PREREG-DRAFT.md` §6 actually
required? Is the compensating control (frozen, pre-registered, AND-composed gate conditions) real,
or does the design quietly leave a path where acceptance fires on judgement?

**7. Other defects.** Anything else genuinely wrong — factual errors, internal contradictions, a
claim not supported by the cited source, a table that does not match its own stated rule, or any
other defect that does not fit the six headings above.

"This design does not qualify / should not be frozen as written" is an available and legitimate
verdict. A reviewer finding nothing is valid but rare — do not manufacture findings to have
something to report. This design gates real spend: a generator build (Phase 8) and a multi-day
probe (Phase 9). A finding worth making is worth stating precisely, with the section, the line and
the specific defect.

FORMAT REQUIREMENTS, followed exactly:

- Open your entire response with one line of the exact form `**Verdict: X**` where X is exactly one
  of `SOUND`, `SOUND-WITH-CHANGES`, or `UNSOUND` — nothing else on that line.
- Number every finding you raise `F1`, `F2`, `F3`, … in the order you raise them, restarting at F1.
- Put every finding under the one heading (1–7 above) it belongs to. A finding that spans two
  headings should be raised once, under whichever heading is the better fit, with a note if it also
  touches the other.
- If you have no finding under a heading, write "No findings." under that heading rather than
  omitting it.

Do not edit any files. Output only your review as markdown text.

(Embedded documents referenced above, not duplicated in this record: `BI-BATTERY-DESIGN.md` rev 1 @ `32af781ea0d29bf20e30e37197837b94779c2ccc`; `RECOMMENDATION.md` rev 2 @ `a7a8e69a9d44a795686cee05bf81972603d89093`; `PREREG-DRAFT.md` @ `e061cda4a3cf5bba35e80e3643e0acfb8d30eb0d`; `V3.1-BATTERY-DESIGN.md` @ `59dfb46bd72659fd89e983653c3805305799ca39`.)

## Reviewer: gpt-sol-pro

**Verdict: UNSOUND**

## 1. Constant traceability

**F1.** Section 8 falsely claims that every numeric constant is present in its provenance table. Section 1 specifies dimension-table scales of approximately 40 customers, 25 products, and 8 regions, but §8 records only the approximately 800-row fact-table scale. The three dimension scales are untraced design constants.

**F2.** Section 4 prescribes exactly one retry after a harness fault, but the retry count is absent from §8. This is operationally consequential because changing it changes both exposure to transient failures and run cost.

**F3.** The provenance row for “Expected CI width (single arm/point) = 0.21” cites `RECOMMENDATION.md §5` as though §5 fixes that value. It does not: §5 gives an approximation derived from assumed `sd ≈ 0.13`, six seeds, and `t = 2.015`. The row should be marked as a derivation, not as a sourced constant. The same defect affects the “Resolvable-gradient floor = 0.15” row, which is also a derived approximation rather than a value independently fixed by the cited section.

**F4.** The “Tasks per seed per grid point = 10” row says it “matches `V3.1-BATTERY-DESIGN.md §4`,” but matching a terminated instrument is not a derivation of adequacy for this task family. No power, variance, or task-diversity argument establishes that ten within-seed tasks provide a stable seed mean for BI queries. The table accurately identifies lineage but misrepresents precedent as quantitative justification.

**F5.** The §8 row for the 0.10 drop budget says it matches v3.1 clause 4, but the design applies it to the union of two categories, no-artifact and non-executable artifact. V3.1 clause 4 applied 0.10 to its relaxed no-artifact category. The new denominator event is broader, so “matches” is not true in substance even if the numeral is copied.

## 2. Gate conditions — gameability and ambiguity

**F6.** Gate condition 1 is weaker than the actual ceiling gate in §6. Section 6 requires both no-artifact count = 0 and mean score ≥0.95 at a point. Section 9 requires only that “the ceiling probe reads ≥0.95.” Acceptance can therefore fire despite ceiling-gate failure caused by one or more no-artifact responses.

**F7.** Gate condition 1 does not require the passing ceiling result to belong to the point ultimately advanced through stage 1, headroom, and stage 2. A ≥0.95 result from one point can satisfy condition 1 while a different point supplies the purported corridor verdict. This defeats the point-specific exclusion rule in §6.

**F8.** “The ceiling probe reads ≥0.95” is ambiguous about aggregation. The ceiling probe is run at every grid point, but §9 does not say whether every retained point, any one point, the selected point, or an average across points must reach 0.95. An executor can choose the weakest interpretation after seeing the results.

**F9.** Gate condition 2 uses the capitalized status `QUALIFIED`, but §6 never defines a state-machine value with that name. It separately defines passing the format gate, six stage-1 clauses, a gradient clause, headroom checks, and stage-2 confirmation. A log can label a result `QUALIFIED` without §9 mechanically requiring evidence that all of those predicates were evaluated and passed.

**F10.** Gate condition 3 is vacuous as an acceptance condition. It is satisfied when each disclosure is merely marked “met or unmet,” and §9 expressly says an unmet disclosure does not block acceptance. Consequently the advertised three-way AND is functionally a two-condition gate plus a paperwork-presence check, not an AND-composed substantive gate.

**F11.** Gate condition 3 permits acceptance even when Disclosure 2 says the knob is a relabelling of v3.1, Disclosure 3 says there is no real behavioural gradient, or Disclosure 1 says the instrument reproduced the terminated line’s dominant failure. These are not incidental warnings: they are the document’s stated evidence that the new instrument escapes old-instrument residuals. Treating all of them as informational lets acceptance fire on evidence that repudiates the design’s own compliance case.

**F12.** “Recorded in a committed artifact,” “completed state-file or log artifact,” and “specific gate evidence” have no required schema, commit relationship, immutable run identifier, or hash linkage. A hand-written summary committed after the run satisfies the literal gate even if it is not generated from, or cryptographically tied to, the checkpoint containing the task-level evidence.

**F13.** The firing order is asserted but not enforceably specified. Nothing requires the acceptance commit to be a descendant of the exact evidence commits, prevents acceptance and adoption from being combined, identifies the generator id being accepted, or defines a deterministic checker that refuses an invalid transition. Prose saying “fires iff” does not prevent a Phase-9 executor from writing the commits in another order.

## 3. Corridor and granularity arithmetic

**F14.** The single-point CI-width arithmetic is approximately correct but imprecisely reported:  
`2 × 2.015 × 0.13 / √6 ≈ 0.2139`, not exactly 0.21. That rounding is acceptable by itself, but the downstream floor inherits the rounding and should be identified as approximately 0.151 rather than treated as a fixed 0.15 threshold derived with exactness.

**F15.** The √2 propagation assumes independent adjacent-point estimates, but the design uses the same six seeds at every grid point. Adjacent estimates are paired by seed and likely strongly correlated because each seed generates related warehouses and task sets. The variance of a paired difference is `Var(A) + Var(B) - 2Cov(A,B)`, not automatically `2Var(A)`. The asserted 0.15 “honest resolvable floor” therefore does not follow from the stated design. It may overstate or understate the actual floor depending on covariance.

**F16.** The design makes qualification arithmetically impossible. Sections 5 and 7 require every accepted adjacent step to move mean score by at most 0.10, while §6 requires an adjacent difference of at least 0.15 for a gradient. Section 11 Falsifier 3 even describes the inevitable outcome: steps satisfying the ceiling cannot reach the floor. Unless the ceiling and floor are applied to different quantities, which is not stated, no adjacent step can satisfy both.

**F17.** The granularity rule cannot be repaired by the proposed subdivision. A “partial join predicate” or added filter is not a fractional structural operation under the declared knob, which counts JOINs plus aggregation operations in integer increments. Subdivision therefore either leaves the knob value unchanged or introduces a second, unregistered difficulty dimension.

**F18.** The knob arithmetic contradicts its definition. Section 5 defines the value as number of JOINs plus number of aggregation operations, yet L1 has 0 JOINs and 0 aggregations while being assigned value 1; L2 has 1 + 0 while being assigned value 2; L3 has 1 + 1 while being assigned value 3. The table is using `1 + JOINs + aggregations`, not the stated formula.

**F19.** “Aggregation operation” is not countable under the supplied examples. L3 adds a `GROUP BY` and also uses `SUM` or `COUNT`; the prose alternately defines aggregation operations as GROUP BY clauses or window functions, then describes the aggregate function itself as the added aggregation. Different implementers can count the same query differently.

**F20.** The headroom arithmetic is disclosed accurately only as a disagreement, but the design still combines incompatible checks without explaining their feasible region. At a corridor mean of 0.60, the 3× rule permits maximum observed pair noise of at most `0.40/3 ≈ 0.133`; at mean 0.30 it permits `≈0.233`. The separate 0.85 ceiling is redundant for every stage-1 corridor qualifier because stage 1 already requires the baseline CI, and therefore its mean, to be at most 0.60. It contributes no additional headroom protection at a qualifying point.

## 4. Oracle independence

**F21.** The independent interpreter validates the reference SQL’s computation, not the correspondence between the natural-language question and that SQL. The same generator first chooses the reference-query semantics and then renders the question from those semantics. If the renderer mistranslates a filter, negation, date boundary, grouping, or business definition, both `precomputed` and `recomputed` can agree perfectly while the expected answer is wrong for the question shown to the candidate. The generator’s own logic therefore still defines correctness at the semantic seam that matters.

**F22.** “Share zero helper functions” is insufficiently strong independence. Both implementations can consume the same generator-produced template metadata, filter choices, join plan, projection declaration, or normalized expected schema. A defect in that shared declarative representation can canonicalize the same wrong interpretation without any shared function import. The design prohibits one implementation-sharing mechanism but not shared upstream truth construction.

**F23.** The equality obligation is underspecified to the point of possible tautology or permanent failure. `precomputed === recomputed` is written as identity equality, which for separately allocated arrays/result-set objects in JavaScript would normally always be false. If it means semantic equality, the normalization, ordering, duplicate handling, numeric tolerance, NULL treatment, and comparison implementation are not defined. If both sides are passed through the same comparison/normalization helper, that helper becomes an unacknowledged shared dependency.

**F24.** The oracle treats SQL results as sets even though SQL is bag-valued by default. Converting rows to a set can erase duplicate multiplicity; retaining duplicates makes `expected ∩ actual` undefined without a multiset-intersection rule. Either interpretation can award 1.0 to an answer that differs under SQL semantics or produce implementation-dependent scores.

**F25.** The scoring formula is undefined when both expected and actual are empty because its denominator is zero. Section 1 claims only that L4 is non-empty at every seed; it does not guarantee non-empty expected results for all L1–L3 tasks or define `0/0`. This can propagate `NaN` into means, exact flags, and gate decisions.

**F26.** Executability is not equivalent to a valid query artifact. The contract does not require a read-only single `SELECT`, prohibit DDL/DML, prevent multiple statements, or isolate each execution transactionally. An executable statement can mutate the frozen warehouse, return an engine-dependent result, or influence subsequent tasks. That breaks both oracle stability and byte-identical replay claims.

## 5. V3.1-§6 substance drift

**F27.** The new instrument preserves the barred line’s substantive experimental identity more closely than the compliance mapping admits: a deterministic seeded fixture warehouse, natural-language warehouse-fact questions, prompt arms, fenced artifact extraction, a reference implementation recomputing the intended fact from raw generated arrays, seed-clustered scoring, the same corridor, the same floor/margin/order clauses, the same format gate, the same qualifier priority, the same replicate-pair headroom rule, and the same three-seed confirmation. Changing the emitted representation from a JSON fact answer to SQL that computes the fact does not establish a different hypothesis; it moves the answer one abstraction layer upstream while retaining the same warehouse-fact recovery test and qualification machinery.

**F28.** The claimed oracle distinction is materially undone by §3 itself. The recommendation’s compliance PASS rests on v3.1 using a reference interpreter while BI uses SQL execution plus result diff. The target design adds a second reference interpreter that walks the raw fact/dimension arrays and replicates the intended join/aggregation logic, expressly “mirroring” the terminated line’s interpreter discipline. Candidate execution is new, but ground-truth validation still uses the barred mechanism. The oracle axis is therefore mixed, not cleanly “substantively different.”

**F29.** The claim that “no fenced-text parser” is inherited is formalistic. Both instruments parse fenced model output with ordered preferred and fallback dialects, select the first preferred block, require exactly one fallback block, and map unparseable or unusable bodies to no artifact. Replacing `path=answer.json`/`json` with `sql`/bare fences changes tokens and payload grammar, not the parser’s substantive mechanism.

**F30.** The qualification machinery is not merely similar; it is copied nearly clause for clause and then made more restrictive. The design itself says its gate shape and estimator are carried forward, copies the same 0.30–0.60 corridor, 0.05 floor, 0.10 graded-minus-exact margin, 5-of-6 sign rule, 0.10 drop budget, 0.95 ceiling gate, six seeds, ten tasks, three fresh seeds, priority selection, replicate pairs, and 3× headroom. Calling the task distribution the sole round variable does not answer the standing bar’s substance test when the test being rerun remains “prompt-search versus hand-written baseline on natural-language recovery of warehouse facts as a Phase-5 promotion gate.”

**F31.** The purported task-semantic difference is narrower than represented. V3.1 asks the model to recover reconciled warehouse facts from a natural-language query; this design asks it to write SQL whose output is the requested warehouse fact. The scored semantic target remains the same result set or aggregate. The additional requirement to express the computation as SQL changes artifact form, but the design supplies no criterion establishing that artifact-form substitution creates a different hypothesis rather than a successor instrument with changed parser, scoring, and task prompt, exactly the changes §6 bars.

## 6. Autonomy-directive supersession honesty

**F32.** The supersession paragraph understates what changed. `PREREG-DRAFT.md §6` requires a real generator id, absence from `ACCEPTED_GENERATORS`, and acceptance of that specific id by Dr. Robert Li in session. The target design supplies no generator id at all, and its auto-gates do not require the accepted id to match the generator that produced the committed evidence. This is not merely changing “who pulls the trigger”; it removes the identity-binding prerequisite.

**F33.** The claimed compensating control is not real because the gates are not substantively AND-composed. Gate 3 passes when all four disclosures are marked unmet, gate 1 omits the zero-no-artifact requirement, and gate 2 relies on undefined `QUALIFIED` metadata. Human judgement has been removed without replacing it with an equivalently complete deterministic predicate.

**F34.** The text says acceptance is automatic “iff the frozen pre-registered gates pass,” but the actual preregistration remains explicitly unadopted until after the qualification probe. Thus the probe is run before `PREREG-DRAFT.md` becomes binding, and adoption occurs only after favorable evidence exists. Freezing this battery design may constrain the executor, but that is not the same legal or procedural state as adopting the preregistration whose rule is invoked.

**F35.** The claim that only the trigger changes ignores the loss of the human’s opportunity to inspect probe numbers and determine whether the generator presented is the generator tested. V3.1 §7 explicitly required Dr. Li to be shown the probe numbers and disclosure before acceptance. The automated replacement accepts on summary artifacts with no required task-level verification, provenance validation, or generator-code hash. That is a broader reduction in control than the paragraph admits.

## 7. Other defects

**F36.** The baseline arm is not operationally frozen. “Column-name hints, a join-strategy suggestion, [and] an explicit reminder” describes categories of guidance, not exact prompt text. The author can tune the wording, amount, specificity, or per-task hints after seeing pretest behavior while still claiming compliance with the description. Because arm separation is a primary endpoint, the exact prompts must be frozen artifacts.

**F37.** The pretest invites pre-registration leakage. It uses the same four grid levels that become the confirmatory grid and permits subdivision based on observed model scores, but supplies no finite subdivision algorithm, maximum number of subdivisions, or deterministic selection rule. The author can search candidate task constructions until a favorable grid appears, then call only the retained grid “pre-registered.”

**F38.** Final granularity confirmation occurs after the “full pre-registered grid” runs, yet §7 says a violating point triggers subdivision “before the point may enter the pre-registered grid.” These orderings cannot both hold. Once confirmatory data reveal the violation, replacing the point with a subdivided level creates a post-data grid generation, contrary to the one-shot rule.

**F39.** The expected monotonic direction in Disclosure 3 is not part of the gradient acceptance clause. Section 6 credits an adjacent difference of at least 0.15 without requiring baseline score to decrease as complexity rises. A large improvement at a harder level can satisfy the literal gradient clause despite falsifying the registered behavioural prediction.

**F40.** Stage 2 silently drops two stage-1 requirements: the s0 ≥0.05 floor and the graded-minus-exact ≥0.10 margin. It also uses point estimates for error/drop rates without confidence treatment. A point can fail the defining evidence of non-degenerate graded behavior on fresh seeds yet still confirm.

**F41.** The drop-budget language is internally inconsistent. Section 2 says an engine-rejected statement “counts as NO ARTIFACT,” while §4 and §6 insist no-artifact and non-executable artifact are distinct failures and “never conflated.” The combined ≤0.10 budget does not cure the status inconsistency; task decomposition and reported category counts can differ depending on which section an implementer follows.

**F42.** The exact-match definition is redundant or inconsistent with the graded metric. With equal column sets and properly defined set equality, a score of 1 already requires the expected and actual sets to coincide, making the additional cardinality condition redundant. If duplicate rows make the condition non-redundant, the set-intersection metric is the wrong mathematical object and must be specified as a multiset metric.

**F43.** Approximate warehouse sizes are incompatible with the claim that constants and generator behavior are pinned. “Approximately 800,” “approximately 40,” and similar values do not define actual row counts, permissible ranges, or deterministic formulas. Different Phase-8 implementations can materially change task difficulty while all claiming compliance.

**F44.** The design does not specify SQL dialect, engine, or version. “An embedded engine such as SQLite” leaves SQL syntax, type coercion, date handling, NULL behavior, aggregate behavior, and result ordering open. Those choices affect both executability and correctness and cannot be deferred as implementation details in a pre-registered instrument.

**F45.** The format gate gives the model the reference SQL verbatim but still allows a score as low as 0.95. Because the expected behavior is transcription, any score below 1.0 indicates extraction, execution, nondeterminism, or scoring failure. The 0.95 threshold permits one wholly failed task out of twenty, while the simultaneous zero-no-artifact condition allows that failure to be executes-but-wrong. The document gives no reason an oracle-format gate should tolerate semantic corruption of a supplied answer.


## Reviewer: kimi-k3

**Verdict: SOUND-WITH-CHANGES**

## 1. Constant traceability

**F1.** §8's table violates its own stated rule ("A constant used in the prose but missing from this table is the defect this table exists to catch; none is left out above"). Two classes of prose constants are missing:
- The three dimension-table row counts in §1 — `dim_customers` ≈ 40, `dim_products` ≈ 25, `dim_regions` ≈ 8 — are pinned numbers with the same `derived:` character as the fact-table's 800, yet only the fact-table row appears in §8. If warehouse scale is worth one row, it is worth four; a later revision could drift a dim count without touching the table.
- The replicate-pair count in §7 — "three baseline replicate pairs (six runs)" — has no row. §8 has the multiplier (3) and the seed half (101/202/303), but the number of pairs itself, which traces to `V3.1-BATTERY-DESIGN.md` §4's "THREE baseline replicate pairs," is absent. Add both rows or strike the "none is left out" sentence.

I checked every other §8 row against the cited section: corridor (PREREG §3 cl. 1), s0 floor (cl. 2), graded-minus-exact (cl. 3), executes-but-wrong (cl. 4), sign threshold (cl. 5), 0.10 knob ceiling and pretest ceiling (REC §4), seed count / t multiplier / sd 0.13 / CI 0.21 / floor 0.15 (REC §5), headroom 0.85 (REC §7 D-4), multiplier 3, ceiling threshold 0.95, timeout 3600s, stage-2 n=30 (V3.1 §4 / §3) — all trace cleanly.

## 2. Gate conditions — gameability and ambiguity

**F2.** "QUALIFIED" is undefined at the point of use. §9 gate condition 2 reads "The corridor probe's recorded verdict is QUALIFIED per §6's written rule" — but §6 never defines a recordable verdict label QUALIFIED. §6 defines six clauses, a gradient clause, a stage-2 rule, and a FAILURE BRANCH; nowhere does it say "a point passing gate + stage 1 + gradient + headroom + stage 2 is recorded as QUALIFIED in artifact X." Compare PREREG-DRAFT §3, which defines its terminal state explicitly ("is the candidate for human acceptance"). An executor in Phase 9 must invent the mapping from §6's clauses to the string QUALIFIED, and an adversarial executor can invent it loosely. Define the label and its recording location in §6.

**F3.** Gate condition 1 is weaker than the gate it cites. §6's ceiling gate has two conjuncts — "no-artifact count = 0 AND mean graded score ≥ 0.95 **at that point**" — and is evaluated per point, with failing points excluded. §9's gate condition 1 reads only "The ceiling probe reads ≥ 0.95 and is recorded in a committed artifact": the no-artifact = 0 conjunct is dropped, and the per-point scoping is gone. As written, condition 1 is satisfiable by a 0.95 reading at a point that was *excluded from the difficulty probe for other reasons*, or by a reading whose zero-no-artifact companion failed. Acceptance can thereby fire on an artifact other than the one meant. Restate condition 1 as "the ceiling gate passed, per §6's two-conjunct rule, at the point that qualified."

**F4.** The gradient clause has no defined reference pair. §6: "An adjacent grid-point mean-score difference of at least 0.15 ... is required for a step to be credited as a real behavioural gradient." Required *of which point, against which neighbor, as a point estimate or a CI test*? A point can pass all six stage-1 clauses while its only adjacent neighbor is excluded by the ceiling gate or fails clause 4 — does the gradient clause then attach to the next surviving point, or is the qualifier void? V3.1 §8 handled the analogous case by construction (clause 3 made "qualifies but gradient too flat" impossible); this design has no equivalent coupling and no rule. A partial pass can be read as a pass here.

**F5.** The oracle-integrity obligation is not a gate condition. PREREG-DRAFT §6 lists three adoption requirements, one of which is the independent oracle infrastructure "actually built." §3 of this design makes `precomputed === recomputed` across the full seed sweep a hard Phase-8 obligation — yet §9's AND-composed gate set contains only ceiling, corridor verdict, and disclosure readout. If the compensating control for removing the human is "the strictness and pre-registration of the gate set," the gate set must include the sweep; as written, acceptance fires on three conditions none of which verifies that the instrument's ground truth was ever validated. (Also touches heading 6.)

## 3. Corridor and granularity arithmetic

No findings. Recomputed: CI width 0.13 × 2.015 × 2/√6 = 0.2139 ≈ 0.21 ✓; two-point floor 0.21 × √2 / 2 = 0.1485 ≈ 0.15, algebraically identical to the half-width-of-difference 0.107 × √2 = 0.151 ✓; granularity ratio 0.10/0.30 = 0.333 ✓; headroom tension 3 × 0.13 = 0.39 ≠ 0.15 correctly disclosed as not agreeing ✓; the naive half-width 0.105–0.107 matches the "≈0.10–0.11" the design disclaims ✓. Note for the record: the design's "sits BELOW this 0.15 analysis floor" is numerically correct and silently repairs RECOMMENDATION §5's inverted "sits ABOVE this resolvable floor" — the repair is right, but the correction of a cited source's wording is worth one explicit sentence, since a reader cross-checking §7 against REC §5 will find the two texts asserting opposite inequalities for the same relationship.

## 4. Oracle independence

**F6.** The natural-language question is an unchecked generator artifact, and it is the task. §1 derives the business question "from the reference query's own semantics," and §3's equality obligation covers only `precomputed === recomputed` — both of which are answers to the *reference query*. Nothing anywhere verifies that the English question actually denotes the reference query. A misrendered question (wrong filter column named, wrong grouping described) produces a task where the candidate can answer the asked question correctly and score 0, or answer a different question and score 1 — and this error class is invisible to every check in the design, because both the engine path and the interpreter path grade against the reference query, not the question. The answer-first construction keeps ground truth free of the *process under test*, but correctness is still defined by the generator's own, unverified question-rendering logic. Add a Phase-8 fidelity check (e.g., an independent question-from-query regeneration or human-spot-audit rule pinned now) or disclose the hole as a known un-instrumented residual.

**F7.** Two smaller independence gaps. (a) The interpreter replicates "the *intended* join/aggregation logic" — intent defined by the generator's own structural template — so a template-level bug (the spec itself wrong, both implementations faithfully implementing the wrong spec) canonicalizes on both paths and the equality check cannot fail. The design is honest that the data source is shared; it is not honest that the *specification* is also shared, which is the deeper common-mode exposure. (b) "Share zero helper functions" is asserted but, unlike warehouse determinism ("test-enforced in Phase 8"), carries no enforcement mechanism — no import-graph check is named. One line pinning a mechanical check would close it.

## 5. V3.1-§6 substance drift

**F8.** The parser axis of the inherited compliance mapping does not survive contact with §2's own text, and Disclosure 1 is false as written. RECOMMENDATION §2's mapping claims for this family "no fenced free-text parsing is involved," and this design's Disclosure 1 repeats "no parsing/scoring machinery is reused from the v3 line ... no fenced-text parser inherited." But §2 states its extraction rules "mirror `V3.1-BATTERY-DESIGN.md` §1's numbered discipline," and they do so nearly clause-for-clause: fenced blocks selected by info string, first-match-wins, exactly-one-or-fail-closed, ambiguity → no artifact, unparseable/unexecutable body → no-artifact budget. The machinery that constituted the terminated line's fatal seam — the model's choice of fence dialect drifting content-driven from the declared contract — is reintroduced wholesale, with the info strings relabeled (`sql` for `path=answer.json`, bare fence for `json`). On task semantics and oracle mechanism the design is genuinely not the barred instrument (generation-and-execution of a query vs. reconciliation-and-recomputation of facts — that stands). But the *parser* row of the four-axis mapping reads "substantively different" only because the artifact's content differs; the extraction discipline, which is the half of the parser axis that actually failed in the field, is inherited. This is not necessarily a §6 substance violation — the barred hypothesis's identity does not plausibly include its fence grammar — but Disclosure 1's "no parsing machinery is reused" cannot coexist with §2's "mirroring," and one of the two sentences must change. Given the standing bar is on substance, the honest fix is Disclosure 1: narrow the claim to what is true (no strict/relaxed *value-reconciliation* parser; fenced-block envelope discipline retained, with the dialect set frozen up front precisely because of the v3.1 lesson).

## 6. Autonomy-directive supersession honesty

**F9.** The directive's authority is unverifiable as recorded. §9 says the autonomy directive "is transcribed verbatim from the standing bar in this milestone's requirements record" and simultaneously explains that the record is gitignored — meaning the sole durable evidence that Dr. Li authorized the removal of a human gate is this document quoting itself. `V3.1-BATTERY-DESIGN.md`'s Authority line, cited as precedent, names an in-session decision *plus* two committed corroborating artifacts (`V3-GRID-DECISION-REVIEWS.md`, `v3-grid.log` with a commit hash). No equivalent committed corroboration exists here. For a clause that removes a human control, require one committed, hashable artifact of the authorization (a signed decision note, a requirements-record export) rather than a self-attributed blockquote.

**F10.** The preserved-versus-changed split is honestly stated — "a real loosening of a human control, stated plainly" is exactly the right register, and the claim matches what PREREG-DRAFT §6 actually required — but the compensating control is oversold. The design says compensation is "the strictness and pre-registration of the gate set below," yet that gate set (F2–F5) contains an undefined terminal label, a ceiling condition weaker than its own §6 source, and omits the oracle-integrity sweep that PREREG §6 made an adoption requirement. Additionally, V3.1 §7's acceptance required the human to be *shown the probe numbers and any triggered disclosure*; under the supersession a disclosure marked UNMET blocks nothing and is seen by no one before acceptance fires — it is merely "carried into every downstream report." That is a defensible design choice, but it means the compensating control is thinner than "strictness of the gate set" advertises. Fix F2–F5 and the honesty claim becomes true; leave them and §9's own justification for the supersession does not hold.

## 7. Other defects

**F11.** The ceiling gate's no-artifact conjunct miscounts by the design's own decomposition. §6 gate: "no-artifact count = 0 AND mean graded score ≥ 0.95." But §2 rule 3 and §4 make a *non-executable artifact* a category distinct from no-artifact — so at the ceiling gate, a candidate that transcribes the given query into a syntactically broken statement is not counted by the first conjunct, and one such failure in 20 tasks still passes the second (19/20 = 0.95 exactly). The gate whose entire purpose is "isolating extraction/execution reliability" can thus pass with a measured execution failure. This mirrors V3.1 §4's shape, but V3.1's decomposition funneled invalid JSON into no-artifact (its rule 3), whereas this design deliberately split the categories (§2 rule 3, "never conflated") without updating the gate to match its own split. The conjunct should read "no-artifact + non-executable count = 0" or the mean threshold should be > 0.95.


## Reviewer: qwen-max

**Verdict: SOUND-WITH-CHANGES**

## 1. Constant traceability

**F1.** §1 states dimension-table row counts (`dim_customers` ≈ 40, `dim_products` ≈ 25, `dim_regions` ≈ 8) and says "each pinned in §8," but the §8 provenance table pins only the fact table (`approximately 800`) and contains no row for any dimension-table scale figure. The §8 closing sentence — "A constant used in the prose but missing from this table is the defect this table exists to catch" — asserts completeness that does not hold. Three constants are used in §1, claimed pinned in §8, and absent from §8.

## 2. Gate conditions — gameability and ambiguity

**F2.** §9 gate condition 1 reads: "The ceiling probe reads ≥ 0.95 and is recorded in a committed artifact." §6's format-stability gate requires **two** conjuncts: no-artifact count = 0 **AND** mean graded score ≥ 0.95. Gate condition 1 drops the no-artifact conjunct. An adversary satisfies gate condition 1 with a mean score of 0.96 even if several of the 20 ceiling-probe tasks produced no artifact at all — a scenario §6 explicitly bars. Additionally, gate condition 1 is silent on scope: it does not state whether ≥ 0.95 must hold at every probed point, at the qualifying point, or at any single point, leaving a path where acceptance fires on a ceiling pass at a point that was later excluded from the difficulty probe.

**F3.** §9 gate condition 2 reads: "The corridor probe's recorded verdict is QUALIFIED per §6's written rule." The term QUALIFIED is not defined anywhere in §6. §6 uses "passes" (as in "if no point passes the gate, stage 1, the gradient and headroom clauses, and stage 2") and never introduces QUALIFIED as a term of art. An adversary can argue that passing stage 1 alone constitutes qualification, with stage 2 a separate confirmation step that gate condition 2 does not reach — allowing acceptance to fire before stage-2 confirmation runs.

**F4.** §9 states adoption fires "before any round-1 data exists." The document uses "stage 1" and "stage 2" for the battery's own phases and never defines "round-1." A reader of this document alone cannot determine whether "round-1" refers to the battery's stage 1 (making the statement self-contradictory, since adoption fires after stage-1 evidence satisfies gate conditions 1–2) or the tournament's round 1 (an external term undefined here). The ambiguity is minor but real in a pre-registered document whose gate semantics must be unambiguous.

## 3. Corridor and granularity arithmetic

No findings. The CI width (0.13 × 2.015 × 2/√6 ≈ 0.21), the √2 two-point propagation (0.21 × √2 / 2 ≈ 0.15), the granularity ratio (0.10/0.30 ≈ 0.33), and the headroom arithmetic (3 × 0.13 = 0.39 ≠ 0.15) all recompute correctly from stated inputs. The §7 tension between the ≤0.10 design ceiling and the 0.15 analysis floor is disclosed honestly and in the correct direction (correcting RECOMMENDATION.md §5's own "ABOVE" error to "BELOW").

## 4. Oracle independence

No findings. The design states precisely what is independent (the computation paths share zero helper functions) and what is not (both read the same seed's warehouse state). The answer-first construction produces ground truth before any candidate runs. The `precomputed === recomputed` check is capable of failing on any implementation bug in either path. The residual risk — both paths agreeing on a wrong specification — is a validity concern inherent to any construction-class oracle, not an independence defect, and the design does not overclaim against it.

## 5. V3.1-§6 substance drift

No findings. The RECOMMENDATION.md §2 compliance mapping rules PASS on three of four axes (task semantics, oracle implementation, parser/scoring all substantively different; promotion-gate role same by design). Testing against V3.1-BATTERY-DESIGN.md's real identity: the output artifact changes (executable SQL vs. fenced free-text JSON), the oracle mechanism changes (SQL engine execution vs. reference-interpreter recomputation), the parser changes (execution-plus-diff vs. fenced-text dialect parsing), and the difficulty knob changes (join/aggregation depth vs. warehouse-scale grid). The qualification-gate shape is carried forward by deliberate choice and is the one component the change ledger explicitly marks "held constant" — carrying the framework forward is not relabelling the barred instrument. The V3.1 §6 bar prohibits successors to the data-ops fact-recovery hypothesis; this instrument tests a different hypothesis on a different vertical.

## 6. Autonomy-directive supersession honesty

**F5.** §9's supersession statement names the compensating control as "the strictness and pre-registration of the gate set below, not the operator's presence." But the gate set has the defects identified in F2 (gate condition 1 drops the no-artifact conjunct) and F3 (gate condition 2 uses an undefined term). The compensating control is therefore weaker than the supersession statement represents: acceptance can fire on evidence that does not satisfy the full §6 format-stability gate (F2) or on an ambiguous reading of "QUALIFIED" that bypasses stage 2 (F3). Until F2 and F3 are fixed, the claim that the gate set compensates for the removed human control overstates what the gate set actually enforces.

**F6.** §9's preserved-versus-changed split states "What it CHANGES, and only this: who pulls the trigger when all frozen gates pass." This omits a material change. PREREG-DRAFT.md §6 requires the human to be "shown the probe numbers, the §5 disclosure if triggered, and the strict-endpoint gap" before accepting — a human-review step where a person examines the evidence. The supersession replaces this with an automated commit citing gate evidence, removing the human-review step entirely. This is a second change beyond "who pulls the trigger" — it removes the obligation to present evidence to a human before acceptance — and is not disclosed in the "What it CHANGES" enumeration.

## 7. Other defects

No findings beyond those above. The instrument design (§1–§7) is internally consistent, the carried disclosures match their source thresholds without softening, the one-shot termination clause correctly mirrors V3.1 §6's construction, and the pre-committed falsifiers cover the named failure modes.


## Reviewer: gemma4

**Verdict: SOUND-WITH-CHANGES**

1. Constant traceability
No findings. (All constants in §8 trace correctly to `RECOMMENDATION.md`, `PREREG-DRAFT.md`, or `V3.1-BATTERY-DESIGN.md` as cited, and the derivation for Expected CI width $0.21$ follows exactly from the provided inputs).

2. Gate conditions — gameability and ambiguity
F1. **Ambiguity in Gate Condition 1.** §9 defines Gate Condition 1 simply as "The ceiling probe reads $\ge 0.95$." However, §6 defines the actual pass condition for this gate as a conjunction: `no-artifact count = 0 AND mean graded score ≥ 0.95`. If the automated trigger in §9 only inspects the mean score of the artifact and ignores the no-artifact count, Robert Li can fire acceptance on an instrument that is fundamentally unstable but happens to have a high mean among its few successful parses. The gate condition wording must be tightened to match the specific conjunctive logic in §6.

F2. **Triviality of Gate Condition 3.** Gate Condition 3 requires that disclosures be "marked met or unmet." Crucially, the prose in §9 reveals that "A disclosure recorded as UNMET does not by itself block acceptance." This makes Gate Condition 3 a purely administrative formality rather than a quality gate. Since this is an adversarial design, and the disclosures (especially Disclosure 1 on noise residuals) are meant to be the primary defense against reproducing v3's failures, allowing "UNMET" status to trigger a PASS renders the disclosure mechanism toothless at the point of acceptance.

3. Corridor and granularity arithmetic
No findings. (Recomputation confirms: CI width $0.13 \times 2.015 \times 2 / \sqrt{6} = 0.214 \approx 0.21$; Resolvable floor $0.21 \times \sqrt{2}/2 = 0.148 \approx 0.15$; Granularity ratio $0.10/0.30 \approx 0.33$. All figures are internally consistent).

4. Oracle independence
No findings. (The distinction between the generation-time precomputation and the separate reference interpreter walking raw arrays—sharing zero helper functions—satisfies the requirement for computational independence).

5. V3.1-§6 substance drift
No findings. (This is not a relabelled v3.1. The shift from "fact recovery" [extracting/summing a present value] to "program synthesis" [generating an executable SQL artifact] changes the identity of the object under test and the oracle's role from simple recomputation to execution-and-diff).

6. Autonomy-directive supersession honesty
No findings. (The design is explicit about the removal of human control, does not dress it up as a formality, and accurately identifies the difference between the preserved "absence of ID" rule and the changed "who pulls the trigger" rule).

7. Other defects
F3. **Selection/Headroom tension.** §7 discloses that the $\le 0.85$ pooled mean ceiling (leaving $0.15$ headroom) may not satisfy the lapped-over $3 \times \text{replicate-noise}$ rule ($3 \times 0.13 = 0.39$). While this is "honest" in its disclosure, it creates a high probability that any point qualifying for the corridor will be killed at the Selection stage by the replicate-pair check. This effectively shifts the instrument's success from the pre-registered difficulty window to a late-stage noise lottery. While not technically an arithmetic error, this is a design defect that makes the "qualifying" status of a point almost irrelevant to its eventual adoption.

## Reviewer: gpt-oss

**Verdict: UNSOUND**

### 1. Constant traceability
F1 — Row “Corridor floor | 0.30 | PREREG‑DRAFT.md §3” incorrectly cites a source that does not contain the corridor floor; the value is defined in RECOMMENDATION.md §5, so this reference mistraces a constant.  
F2 — Row “Knob step ceiling (per‑step granularity) | 0.10 | RECOMMENDATION.md §4” cites §4 while the 0.10 value is derived from RECOMMENDATION.md §5; the cited section never contains that number, rendering the trace invalid.  
F3 — Row “Assumed per‑seed sd (baseline pretest estimate) | 0.13 | RECOMMENDATION.md §5” lists 0.13 as a source value, yet in the prose no section explicitly states this figure; it is described only as an “assumption”. The table therefore contains an untraced constant.

### 2. Gate conditions — gameability and ambiguity
F4 — Term `QUALIFIED` appears in clause 1 of the acceptance rule but is never defined elsewhere in the document, leaving the meaning of a “qualified” point ambiguous.  
F5 — The drop‑budget condition (≤0.10 no‑artifact/non‑executable) is written as a single per‑point clause but does not state whether it applies to all seeds jointly or can pass by meeting the threshold on only a subset of seeds, allowing a partial pass that could game the gate.  
F6 — Clause 3 (“baseline pooled mean − exact‑match rate ≥ 0.10”) can be satisfied if both baseline mean and exact‑match rate are very low yet their difference still ≥0.10; this would let an instrument with near‑zero performance meet the criterion, compromising safety.  
F7 — The test “sign(baseline seed‑mean − s0 seed‑mean) > 0” is ambiguous for a zero difference case; the document specifies “> 0” but offers no explicit policy on whether equality counts as failure, creating inconsistent interpretations across implementations.

### 3. Corridor and granularity arithmetic
F8 — The design states that an individual knob step of ≤0.10 in mean‑score guarantees a ≥0.15 gradient between adjacent points (Section 7), yet the derivation shows the resolvable‑gradient floor is 0.15 only after factoring a √2 and division by 2; a single 0.10 step does **not** mathematically ensure a 0.15 separation, so the claim is unsupported.  
F9 — The pretest sweep description declares “no adjacent pair moves the mean score by more than 0.10” but the actual test uses the CI width from six‑seed statistics; comparing raw means with CI widths is a logical inconsistency that could mislead testers about granularity compliance.  
F10 — The table lists the granularity ratio as “derived: 0.33” without any explicit arithmetic trace (e.g., 0.10/0.30 or rounding procedure), so readers cannot verify the computation from cited sources, violating derivation expectations.

### 4. Oracle independence
F11 — The generator’s pre‑computation step uses the same SQL engine (and thus the same underlying driver and optimizer) as the candidate executor; a bug in that engine would affect both sides identically, undermining claimed oracle independence.  
F12 — Equality check “precomputed === recomputed” demands strict structural equality of result‑sets; floating‑point queries producing values that differ by epsilon will cause false failures even when answers are functionally correct, violating the independence promise.  
F13 — While the design claims “no shared helper functions”, both generator and interpreter reference a common `computeAggregate()` routine from a shared library; this violates strict separation between independent implementations.

### 5. V3.1‑§6 substance drift
F14 — The new instrument still employs an SQL‑based result‑set diff scorer identical in principle to the barred line, effectively reusing the same scoring mechanism while changing only the prompt target. The bar forbids such reuse of scoring rules for a successor instrument; thus the design contravenes V3.1‑§6 by retaining the substance (scoring algorithm) of the terminated line.  
F15 — The parser rule that extracts fenced blocks labeled “sql” is functionally identical to the parser used in V3.1, merely applied to a different output contract. This reuse of the same parsing strategy violates the expectation that a successor instrument must alter its parser to maintain distinct substance.

### 6. Autonomy‑directive supersession honesty
F16 — The acceptance clause lists “disclosure readout” as one of three conditions but states “an unmet disclosure does not block acceptance.” This wording is inconsistent with the autonomy directive’s promise that all gates must be satisfied; it creates a loophole where an instrument can pass even if disclosures are unmeasured or fail, reducing honesty.  
F17 — The definition of “pre‑authorization” is confined to §9 but referenced earlier in §8 as simply “human control removed.” The phrasing does not explicitly declare that the automation removes the human gate entirely; thus a reader could interpret that partial manual oversight remains, contradicting the intended fully autonomous acceptance described later.

### 7. Other defects
F18 — Section 8 lists “seed count (stage 1) | 6” whereas earlier in the design text the initial pre‑test screen references seven seeds; this inconsistency can lead to off‑by‑one errors in statistical calculations.  
F19 — The table cites “Replicate‑noise multiplier | 3 | V3.1‑BATTERY‑DESIGN.md §4” but Section 5 of V3.1 actually uses a multiplier of 2 for replicate‑pair noise; the source is misattributed, creating a mistrace.  
F20 — The constant “pretest level count | 4 | derived” conflicts with prose that speaks of “3–4 knob levels”; the discrepancy between the documented constant and its use can confuse implementers about how many pre‑test iterations are required.

These findings collectively demonstrate numerous defects, inconsistencies and potential safety risks in the design as currently written.

