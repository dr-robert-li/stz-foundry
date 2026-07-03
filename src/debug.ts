/**
 * Post-aggregation debug mode (cycle item 1).
 *
 * Dark-factory can ship a winner that passes its sealed suite yet is wrong on
 * behaviour the suite never exercised — a blind-spot defect with no post-hoc
 * remedy short of re-running the whole slice by hand. This module is the
 * deterministic core of the repair loop:
 *
 *   reproduce → mine the failing case into a SEALED regression test →
 *   seal-amend → re-run only the affected slice + its DAG dependents.
 *
 * A reported defect is a `DebugCase`: a named export, JSON-encoded argument
 * list, and the JSON-encoded value it MUST return. Cases are stored under the
 * slice's sealed tree (`30-tests/held-out/<slice>/debug-cases.json`) so they are
 * hashed by `SEAL.json` and can never be silently edited — exactly like the rest
 * of the held-out suite.
 *
 * The mine step is guarded by a TWICE-VERIFIED oracle, the same discipline as
 * `inject`/`harness-mine`: a case is only accepted if the current WINNER FAILS
 * it (the defect is real and currently uncaught) AND the test-author's REFERENCE
 * PASSES it (the case is satisfiable and correct, not a mis-stated expectation).
 * Both checks execute the impl through the shared sandbox (`runSealed`), so no
 * model-generated code runs unguarded here either.
 */
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { sandboxedNode } from "./sandbox.js";

export interface SealedResult {
  passed: number;
  total: number;
  passRate: number;
}

export interface DebugCase {
  /** The contract's exported function to call. */
  fn: string;
  /** JSON array of arguments, e.g. "[2, 3]" → fn(2, 3); "[\"hi\"]" → fn("hi"). */
  input: string;
  /** JSON-encoded expected return value (deep-equal). */
  expected: string;
  /** Why this case exists — the reported defect it pins. */
  note?: string;
}

/** Validate a case's JSON fields up front so a malformed one fails loudly, not at eval time. */
export function validateDebugCase(c: DebugCase): string | null {
  if (!c.fn || typeof c.fn !== "string") return "case needs a non-empty `fn` (the exported function name)";
  let args: unknown;
  try {
    args = JSON.parse(c.input);
  } catch {
    return `case \`input\` is not valid JSON: ${c.input}`;
  }
  if (!Array.isArray(args)) return "case `input` must be a JSON ARRAY of arguments (e.g. [2, 3])";
  try {
    JSON.parse(c.expected);
  } catch {
    return `case \`expected\` is not valid JSON: ${c.expected}`;
  }
  return null;
}

/**
 * Generate a sealed-harness-shaped ESM that checks each debug case against the
 * impl at argv[2] and prints the wire-contract JSON line the runner parses.
 * Deterministic and model-free — it is safe by construction, sealed by content.
 */
export function debugHarness(cases: DebugCase[]): string {
  return (
    `const mod = await import(process.argv[2]);\n` +
    `const cases = ${JSON.stringify(cases)};\n` +
    `function eq(a, b) {\n` +
    `  if (a === b) return true;\n` +
    `  if (a && b && typeof a === "object" && typeof b === "object") {\n` +
    `    const ka = Object.keys(a), kb = Object.keys(b);\n` +
    `    if (Array.isArray(a) !== Array.isArray(b)) return false;\n` +
    `    if (ka.length !== kb.length) return false;\n` +
    `    return ka.every((k) => eq(a[k], b[k]));\n` +
    `  }\n` +
    `  return Number.isNaN(a) && Number.isNaN(b);\n` +
    `}\n` +
    `let passed = 0, total = 0;\n` +
    `for (const c of cases) {\n` +
    `  total++;\n` +
    `  try {\n` +
    `    const fn = mod[c.fn];\n` +
    `    if (typeof fn !== "function") continue;\n` +
    `    const out = fn(...JSON.parse(c.input));\n` +
    `    if (eq(out, JSON.parse(c.expected))) passed++;\n` +
    `  } catch { /* a throw is a failed case */ }\n` +
    `}\n` +
    `const passRate = total === 0 ? 1 : passed / total;\n` +
    `console.log(JSON.stringify({ passed, total, passRate }));\n` +
    `process.exit(passRate === 1 ? 0 : 1);\n`
  );
}

/** Run debug cases against one impl through the sandbox (same seam as runSealed). */
export function runDebugCases(implPath: string, cases: DebugCase[]): SealedResult {
  if (cases.length === 0) return { passed: 0, total: 0, passRate: 1 };
  const dir = mkdtempSync(join(tmpdir(), "stz-debug-"));
  try {
    const harnessPath = join(dir, "debug-harness.mjs");
    writeFileSync(harnessPath, debugHarness(cases), "utf8");
    const abs = resolve(implPath);
    const r = sandboxedNode([harnessPath, abs], {
      readDirs: [dir, dirname(abs)],
      timeout: 20_000,
    });
    const out = (r.stdout ?? "").trim().split("\n").filter(Boolean);
    const last = out[out.length - 1] ?? "";
    try {
      const parsed = JSON.parse(last) as SealedResult;
      if (typeof parsed.passRate === "number") return parsed;
    } catch {
      /* fall through to a zeroed result — an impl that crashes fails the cases */
    }
    return { passed: 0, total: cases.length, passRate: 0 };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export interface DebugCaseVerdict {
  /** The winner currently fails this case — the defect is real and uncaught. */
  winnerFails: boolean;
  /** The reference passes this case — it is satisfiable and correctly stated. */
  referencePasses: boolean;
  /** Accepted iff both hold (the twice-verified mine oracle). */
  accepted: boolean;
  reason: string;
}

/**
 * The mine oracle. A reported case joins the sealed suite only if the winner
 * fails it (else it is not an uncaught defect — the winner already handles it)
 * and the reference passes it (else the expected value is mis-stated, not a real
 * gap). Both run through the sandbox.
 */
export function verifyDebugCase(winnerImplPath: string, referenceImplPath: string, c: DebugCase): DebugCaseVerdict {
  const bad = validateDebugCase(c);
  if (bad) return { winnerFails: false, referencePasses: false, accepted: false, reason: bad };
  const winnerFails = runDebugCases(winnerImplPath, [c]).passRate < 1;
  const referencePasses = runDebugCases(referenceImplPath, [c]).passRate === 1;
  const accepted = winnerFails && referencePasses;
  const reason = accepted
    ? "accepted: the winner fails this case (real uncaught defect) and the reference passes it (satisfiable)"
    : !winnerFails
      ? "rejected: the current winner ALREADY passes this case — it is not an uncaught defect"
      : "rejected: the reference does NOT pass this case — the expected value is mis-stated or unsatisfiable";
  return { winnerFails, referencePasses, accepted, reason };
}

/** Load a slice's debug-cases.json (empty when absent). */
export function loadDebugCases(path: string): DebugCase[] {
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as DebugCase[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
