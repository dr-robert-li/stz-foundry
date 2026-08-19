/**
 * The customer-support independent replay-match oracle (Phase 14 —
 * Instrument build, Plan 14-01, REQ-68; `experiments/paired-comparison-arm/
 * PAIRED-DESIGN-PREREG.md` rev 2 §4/F-33 — FROZEN, the pre-registration of
 * record for this whole module). The extraction contract and the
 * equivalence rule are transcribed as the frozen design states them, with
 * no reinterpretation.
 *
 * ZERO SHARED HELPERS with `customer-support-warehouse.ts`'s own
 * resolution-composition step (§4: "two separately implemented code
 * paths"). This file pulls in only `RESOLUTION_FIELD_LABELS` — the three
 * field-name literals — from that module, nothing else; its own
 * normalisation function below is written fresh, never a call into a helper
 * the generator also calls (the generator has none — normalisation exists
 * ONLY here, deliberately, as the sole place raw text is interpreted).
 *
 * NO JUDGE, NO RUBRIC, ANYWHERE — a hard rule, not a preference (§4). This
 * module performs a structured field-by-field string match against a
 * pre-composed known answer; it never calls an LLM or any other model to
 * score, rate, or judge either arm's proposed resolution.
 */
import { RESOLUTION_FIELD_LABELS, type CustomerSupportResolution, type ResolutionFieldLabel } from "./customer-support-warehouse.js";

/**
 * §4's four named, mutually-exclusive, exhaustive outcome categories. Every
 * attempt decomposes into exactly one — categories 1-2 turn only on whether
 * a scoreable artifact exists at all, categories 3-4 turn only on the
 * binary match result once one exists.
 */
export type CustomerSupportOracleCategory = "no-artifact" | "non-scoreable" | "resolution-mismatch" | "resolution-match";

export interface CustomerSupportOracleResult {
  category: CustomerSupportOracleCategory;
  /** The binary score the paired rule (§5) consumes directly — 0 unless
   *  `category === "resolution-match"`. */
  score: 0 | 1;
  /** The extracted three-field candidate, present iff a scoreable artifact
   *  existed (categories 3-4); `null` for categories 1-2. */
  extracted: Record<ResolutionFieldLabel, string> | null;
}

/**
 * F-33's normalized-equality contract: lower-case, trim, collapse internal
 * whitespace to a single space — nothing else. No stemming, no synonym
 * table, no substring or set-inclusion comparison. Implemented fresh here,
 * never imported from the generator module (which has no such helper) —
 * the independence discipline this file's own doc comment states above.
 */
export function normalizeField(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

type ExtractionOutcome =
  | { outcome: "no-artifact" }
  | { outcome: "non-scoreable" }
  | { outcome: "scoreable"; fields: Record<ResolutionFieldLabel, string> };

/**
 * §4/F-33's extraction contract, transcribed verbatim: a response is
 * scoreable iff it names all three fields in a labelled, machine-extractable
 * form (`action: <value>` etc., one per line, case-insensitive labels). Any
 * field left unlabelled, absent, or ambiguous (more than one candidate
 * value under the same label) reduces the whole response to non-scoreable —
 * never resolved by guessing. A response with NO recognizable labelled line
 * at all is `no-artifact` (no identifiable resolution proposal exists),
 * distinct from a PARTIAL proposal (some labels present, at least one
 * missing or duplicated), which is `non-scoreable`.
 */
export function extractResolutionFields(rawText: string): ExtractionOutcome {
  const trimmed = rawText.trim();
  if (trimmed.length === 0) return { outcome: "no-artifact" };

  const candidates: Record<ResolutionFieldLabel, string[]> = { action: [], category: [], parameter: [] };
  const linePattern = /^\s*(action|category|parameter)\s*:\s*(.+?)\s*$/i;
  for (const line of trimmed.split("\n")) {
    const m = line.match(linePattern);
    if (!m) continue;
    const label = m[1]!.toLowerCase() as ResolutionFieldLabel;
    candidates[label].push(m[2]!);
  }

  const totalFound = RESOLUTION_FIELD_LABELS.reduce((sum, label) => sum + candidates[label].length, 0);
  if (totalFound === 0) return { outcome: "no-artifact" };

  for (const label of RESOLUTION_FIELD_LABELS) {
    if (candidates[label].length !== 1) return { outcome: "non-scoreable" };
  }

  const fields = Object.fromEntries(RESOLUTION_FIELD_LABELS.map((label) => [label, candidates[label][0]!])) as Record<
    ResolutionFieldLabel,
    string
  >;
  return { outcome: "scoreable", fields };
}

/**
 * The sole scoring entry point: extraction, then (iff scoreable) the
 * structured-match equivalence rule, all three fields required to match for
 * `resolution-match` — any single-field mismatch is `resolution-mismatch`,
 * never partial credit.
 */
export function classifyCustomerSupportResponse(
  rawText: string,
  knownResolution: CustomerSupportResolution,
): CustomerSupportOracleResult {
  const extraction = extractResolutionFields(rawText);
  if (extraction.outcome === "no-artifact") return { category: "no-artifact", score: 0, extracted: null };
  if (extraction.outcome === "non-scoreable") return { category: "non-scoreable", score: 0, extracted: null };

  const known: Record<ResolutionFieldLabel, string> = {
    action: knownResolution.action,
    category: knownResolution.category,
    parameter: knownResolution.parameter,
  };
  const matches = RESOLUTION_FIELD_LABELS.every(
    (label) => normalizeField(extraction.fields[label]) === normalizeField(known[label]),
  );

  return matches
    ? { category: "resolution-match", score: 1, extracted: extraction.fields }
    : { category: "resolution-mismatch", score: 0, extracted: extraction.fields };
}
