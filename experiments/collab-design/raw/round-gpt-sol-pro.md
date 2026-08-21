I’m checking the gate as two separate mechanisms: the deterministic margin verdict and the discordant-pairs diagnostic. I’m also tracing each identity and handoff claim to the exact bytes or records it would need to bind, rather than accepting “hashed” or “keyed” as sufficient.
1. **Location:** §3, “The artifact is mutated between hash and read (TOCTOU).”
   
   **Claim:** Re-hashing “before the answerer reads” catches any mutation between handoff and read.
   
   The proposed sequence still has a TOCTOU window: verify the path, then reopen or read it. An attacker or concurrent process can replace the file, retarget a symlink, or modify bytes after verification but before or during the answerer’s read. The design therefore does not catch “any mutation after handoff.”
   
   **What would have to change:** Require the runner to open the artifact once, read it into an immutable buffer or retain the same file descriptor, hash those exact bytes, and pass only those verified bytes to the answerer. Also specify symlink handling and whether concurrent writes are rejected through locking, ownership transfer, or atomic publication.

2. **Location:** §3, “that hash is recorded in the task record.”
   
   **Claim:** Matching the artifact to the recorded hash establishes handoff integrity.
   
   Nothing protects the task record itself. An actor able to replace the artifact can also replace its recorded hash, causing verification to succeed. The hash is also not bound to the task, query, attempt, builder candidate, or KB revision, so a valid artifact/hash pair can be transplanted from another task.
   
   **What would have to change:** Define an immutable or authenticated handoff record binding at least `artifactHash`, `query_id`, attempt ID, candidate `definitionHash`, KB identity/revision, and artifact schema version. State who may write it, when it becomes immutable, and how replacement or replay is detected.

3. **Location:** §3, failure-mode list.
   
   **Claim:** The named modes adequately specify handoff-immutability behavior.
   
   Several realistic modes are uncovered: artifact replacement together with hash-record replacement, symlink/path retargeting, mutation after verification, partial writes observed during hashing, unreadable files, directories or special files in place of regular files, oversized artifacts, malformed serialization, and valid bytes that parse differently under different parser or schema versions.
   
   **What would have to change:** Add explicit behavior for publication atomicity, file type, permissions/read errors, maximum byte size, parse/schema validation, symlink policy, parser/schema version, and task-record integrity.

4. **Location:** §2 and §5, builder role and structural bounds.
   
   **Claim:** Every role boundary is something the runner can check or refuse.
   
   The builder’s output contract is not mechanically defined. “Entity/relation subgraph,” “connected,” “query-linked,” and “query’s own seed entities” do not specify an artifact schema, allowed fields, seed extraction, edge direction, duplicate handling, ordering, or whether arbitrary labels, annotations, scores, and free text are permitted. A builder can encode information through node order, edge order, labels, metadata, duplicate structure, numeric fields, or prose without violating the stated graph constraints.
   
   **What would have to change:** Define a closed, versioned schema and deterministic validator: permitted node and edge fields, canonical IDs, seed derivation, edge direction semantics, duplicate rules, connectivity algorithm, bounds, serialization, and rejection of all unrecognized or free-form fields. Otherwise the substantive boundary remains an agent judgment.

5. **Location:** §2, builder visibility boundary.
   
   **Claim:** “Nothing in its inputs includes” gold `answer_ids`.
   
   This establishes only direct field omission. It does not define the builder’s actual process boundary, filesystem access, environment, tool access, cache access, fixture access, or network access. In this repository, committed heldout fixtures and scoring tools are specifically named elsewhere; prompt omission alone does not make them unreachable.
   
   **What would have to change:** Specify a mechanically enforced builder input and capability boundary comparable to the promised answerer strip boundary, including filesystem mounts, environment variables, tools, network, prior-attempt state, and exclusion of gold-bearing fixtures and oracle outputs.

6. **Location:** §5 and §6, “keyed by the query’s own `query_id` field” and “`query_id` is a global id.”
   
   **Claim:** `query_id` alone is a globally safe task and oracle identity.
   
   The cited observation that sampled `row_query_id != idx` proves only that IDs are not positional indices. It does not prove uniqueness across KBs, splits, dataset revisions, or duplicate rows, nor does it prove that the ID is globally scoped over the unsplit dataset. A lookup implementation using `query_id` also does not establish that the lookup returns exactly one row.
   
   **What would have to change:** Either cite and validate a uniqueness invariant or key tasks by a compound identity such as `{dataset, revision, kb, split, query_id}`. The loader must reject zero or multiple matches rather than selecting one implicitly.

7. **Location:** §4, Decision statement.
   
   **Claim:** PrimeKG is selected over Amazon and MAG partly “on the verified 254M operational footprint (size)” and licence.
   
   A measurement for PrimeKG alone cannot support a comparative size decision over Amazon and MAG. No size evidence for either alternative is presented. The licence ground is also unresolved: the STaRK dataset card’s `cc-by-4.0` metadata and the PrimeKG software repository’s MIT licence do not establish the licence of the underlying PrimeKG dataset. The document explicitly admits that omission, then still lists “licence” as a selection ground.
   
   **What would have to change:** Remove size and licence as comparative grounds, or provide comparable processed-footprint measurements for all three KBs and authoritative licence evidence covering the actual PrimeKG data redistributed or used by this project.

8. **Location:** §6, out-of-pool prediction handling.
   
   **Claim:** The bridge must pre-filter invalid IDs and treat “a filtered-out prediction” as a scored miss.
   
   This is not deterministic for mixed predictions. Removing one invalid ID can promote later valid IDs and improve Hit@k or MRR; preserving its rank as a miss produces a different score. If all IDs are removed, the wrapper may receive an empty object, but that behavior is unspecified. Duplicate IDs, invalid scores, non-finite scores, ties, and ordering are also unspecified.
   
   **What would have to change:** Define one exact transformation and score semantics. Prefer validating the complete ranked list and failing the whole attempt as a miss if any entry is invalid, or preserve invalid entries as rank-consuming misses through a scorer representation that supports them. Specify empty-list, duplicate-ID, score-domain, tie-breaking, and JSON-order behavior.

9. **Location:** §6, oracle fail-closed contract.
   
   **Claim:** The section states the contract the Phase 21 bridge needs while leaving only implementation details open.
   
   It does not define the bridge result for non-zero exit, timeout, signal termination, empty stdout, multiple JSON values, malformed JSON, unexpected fields, missing metrics, non-finite metrics, stderr-only warnings, revision-check network failure, or receipt-construction failure. “Stdout stays empty” for one observed `IndexError` is not a complete fail-closed interface.
   
   **What would have to change:** Specify a closed outcome table mapping every subprocess and parse failure to a deterministic task miss/error record, with no stale-output fallback and no agent discretion. Define strict output-schema validation and receipt issuance only after successful validation.

10. **Location:** §6, Revision pinning.
    
    **Claim:** Comparing the Hub’s currently resolved head SHA to `HF_PIN` is a revision-pinned, fail-closed data mechanism.
    
    This checks what the live Hub currently resolves, not what bytes `load_qa` and `load_skb` actually load. A stale, corrupt, or independently populated local cache can pass the Hub assertion while supplying different bytes. Conversely, once the Hub branch advances, the historical pinned dataset becomes unusable even if the exact pinned artifact remains locally available. The cited wrong-pin experiment supports the comparison behavior, not content pinning.
    
    **What would have to change:** Load the dataset by immutable revision where possible, or verify cryptographic manifests of every local artifact actually consumed. Treat the live-head check as freshness policy, not revision pinning, and separately define offline/network-failure behavior.

11. **Location:** §6, Receipt discipline.
    
    **Claim:** The stated `OracleReceipt` lineage provides the required provenance for “each scored prediction.”
    
    The shown lineage identifies the source and revision but does not bind the receipt to the concrete query, prediction list, metrics, scorer version, or candidate attempt. The same valid receipt can therefore be attached to another result unless those bindings exist elsewhere, which the document does not say.
    
    **What would have to change:** Require the scored-result record or receipt to cryptographically bind the compound query identity, normalized prediction payload, returned metrics, scorer/wrapper version, dataset revision, and attempt/candidate identity. If the existing receipt cannot hold these fields, define a separately hashed scoring record referenced by it.

12. **Location:** §7, primary-gate explanation.
    
    **Claim:** The inequality “fires exactly when the null arm scores close to or above the graph arm.”
    
    The inequality itself is in the correct bypass-defense direction: `graph_hit@1 - null_hit@1 >= δ1` passes only when graph exceeds null by the margin. But the quoted explanation reverses what “fires” means. When null is close to or above graph, the displayed inequality is false; the gate fails rather than the inequality firing. That wording is dangerous in a design intended for literal transcription.
    
    **What would have to change:** State mechanically: `PASS iff graphHits - nullHits >= 6; otherwise FAIL`. Avoid “fires” for the primary condition, or define it unambiguously as “failure fires when `graphHits - nullHits < 6`.”

13. **Location:** §7, secondary check and margins.
    
    **Claim:** Making `δ2` one query smaller than `δ1` makes the secondary “more sensitive” and avoids requiring a “strictly larger swing than the primary.”
    
    The two thresholds operate in opposite directions and do not compete on a common swing. Any harmful difference satisfying `nullHits - graphHits >= 5` already fails the primary by at least 11 queries relative to its `+6` pass boundary. The secondary cannot expose a primary PASS that is harmful, and because it cannot alter the verdict, it is only a severity annotation on an already failed primary result. Calling it “more sensitive” than the primary is therefore misleading.
    
    **What would have to change:** Describe the secondary as a directional diagnostic within primary failures, and justify `5` as the chosen harmful-effect threshold on its own evidence. If “do no harm” is intended as an independent acceptance condition, make it verdict-bearing and define how it combines with the primary.

14. **Location:** §7, margin justification and §10 overturn criterion.
    
    **Claim:** Six queries lies within a research-recommended 4–8 range representing practical meaning versus ordinary run-to-run variance.
    
    No source, run, variance estimate, or calculation is supplied for that range. Section 10 then puts the burden on reviewers to produce evidence to overturn values for which the design itself supplies no evidence. A fixed 75-query deterministic count does not by itself establish robustness to stochastic agent variance.
    
    **What would have to change:** Cite the research artifact and its derivation, or run and preregister repeated-seed variance estimation before fixing the margins. Otherwise label both values arbitrary policy choices rather than evidence-based thresholds.

15. **Location:** §7, critical-value table.
    
    **Claim:** The pinned `[20,75]` table follows the stated exact condition and its boundaries.
    
    The listed values are internally consistent with the stated condition; for example, the endpoints are correctly `c(20)=15` and `c(75)=47`, and the full sequence matches the smallest-integer rule. The defect is operational rather than arithmetic: the design says Phase 23 will “transcribe” 56 constants but does not require code to regenerate or mechanically verify them against the formula. A single transcription error would silently alter significance behavior.
    
    **What would have to change:** Require a test that derives every row with exact integer arithmetic and compares it to the pinned table, including rejection below 20 and above 75. Better, generate the values deterministically at build/test time if pinning a literal table is not itself required.

16. **Location:** §8, chosen encoding and relationship to `componentVariantId`.
    
    **Claim:** `componentVariantId` remains unchanged and is “still called once per role to produce each of the two 32-byte digests the outer hash consumes.”
    
    The cited implementation returns `.digest("hex").slice(0, 16)`, a 16-hex-character, 8-byte-equivalent identifier, not a full 32-byte digest. The same function cannot both remain unchanged and supply the full raw digests required by the chosen construction. Elsewhere the section correctly describes those truncated values as diagnostics only, creating an internal implementation contradiction.
    
    **What would have to change:** Introduce a deterministic full-digest function returning 32 raw bytes, use it for the outer composition, and keep `componentVariantId` only for the existing truncated diagnostics. Specify the exact API and byte encoding.

17. **Location:** §8, “two distinct prompt pairs” identity guarantee.
    
    **Claim:** Fixed-length hash-of-hashes prevents distinct prompt pairs from sharing a `definitionHash`.
    
    It prevents delimiter-boundary ambiguity, but not hash collisions. The outer ID is truncated to 64 bits, so collisions are guaranteed over the full input domain and become plausible under birthday scaling around \(2^{32}\) candidates. Inner SHA-256 collisions are also theoretically possible. More concretely, the document does not specify prompt-to-byte encoding: if implemented with Node’s default UTF-8 conversion, distinct JavaScript strings containing different unpaired UTF-16 surrogates can be encoded using the same replacement character and therefore hash identically before cryptography is involved.
    
    **What would have to change:** Replace the absolute uniqueness claim with a collision-resistance claim, define UTF-8 encoding and a policy rejecting unpaired surrogates or define hashing over a canonical UTF-16 representation, and either retain the full 256-bit outer digest or add deterministic collision detection against the canonical prompt-pair payload.

18. **Location:** §8, canonical candidate identity.
    
    **Claim:** “Same pair, same id” is fully specified by hashing the two prompt texts.
    
    It is unspecified whether line endings, Unicode normalization, byte-order marks, trailing whitespace, prompt templates, role system text, model/tool configuration, or serialization versions are identity-bearing. Two operationally identical prompts may receive different IDs, while two identical visible prompt strings executed under materially different role scaffolding may receive the same ID.
    
    **What would have to change:** Define the exact candidate-definition payload and canonical serialization. Include every execution input that selection treats as part of the candidate, or explicitly state that those inputs are globally frozen and identify the mechanism enforcing that freeze.

19. **Location:** §1 and §9, freeze ancestry.
    
    **Claim:** A committed test can prove the freeze commit is a strict ancestor of every commit touching the Phase 20–22 modules.
    
    Section 9 pins filenames but explicitly leaves directories unsettled, while also saying the guard needs “concrete watched paths.” A filename-only convention cannot reliably identify renamed files, alternate modules, generated wrappers, or implementation placed under an unexpected subtree. Git ancestry also proves ordering only for commits the test successfully discovers; it does not prove that all semantically relevant implementation commits touched one of the guessed names.
    
    **What would have to change:** Pin full repository-relative paths before freeze, define rename handling, and make the guard inspect all commits affecting those paths. Add a deterministic implementation-surface manifest or architectural import check so equivalent code cannot evade the guard by using another filename.

20. **Location:** §1, Amendment protocol.
    
    **Claim:** The freeze ensures the panel-attacked design cannot be changed without equivalent scrutiny.
    
    The protocol permits either a new panel or merely “a documented amendment entry naming what changed and why.” The second branch allows substantive inequalities, contracts, hashes, or boundaries to change without panel review, defeating the stated reason for freezing the design.
    
    **What would have to change:** Restrict amendment entries without panel review to explicitly defined non-substantive corrections, enforced by a deterministic classification rule if possible. Require a new panel and new freeze commit for every behavioral or contractual change.

21. **Location:** §5, `runAgentBattery` reuse.
    
    **Claim:** The existing driver can be reused unchanged while “the same dispatcher that runs one task per candidate today runs one task per STaRK query here.”
    
    The design has two independent dimensions: prompt-pair candidates and 75 queries. It never specifies whether a battery is one candidate across 75 query tasks, 75 tasks each containing all candidates, or a candidate-query Cartesian product. This affects task identity, scheduling, retries, artifact paths, aggregation, leakage between attempts, and what “one task per candidate today” means.
    
    **What would have to change:** Define the deterministic expansion from candidates and query fixtures into attempt IDs, including ordering, retry identity, isolation, aggregation, and artifact ownership. If `runAgentBattery` cannot express that expansion without changed semantics, remove the “unchanged” claim.

Total findings: 21
