/**
 * FoundryModelLayer (stage 2 of the Foundry rebuild): the real `ModelLayer`
 * implementation over BYO-LLM providers — the piece that makes the tournament
 * runnable outside any vendor CLI. Each role (test-author, strategist,
 * specimen, judge, documenter, planner) is a `{provider, model}` pair, so
 * heterogeneous tournaments (one local Ollama model vs one hosted) fall out of
 * configuration, not code.
 *
 * Design decisions:
 *  - **The elicitor is deterministic, not an LLM.** STZ's own rule: acceptance
 *    criteria are never auto-invented (the F2 gate). The manifest's
 *    done-predicates and complexity — human-supplied — are echoed through; a
 *    model is never asked to dream up what "done" means.
 *  - **The eval runner is the real one** (`src/eval-runner.ts`): executed
 *    sealed suite, V8 coverage, source-mutation survival, plus the real
 *    hack-pattern detector. Nothing is trusted from a model's self-report.
 *  - **Prompts keep the cache-stable prefix first**: static role instructions
 *    ride `system`; per-call content (contract, strategy, code) rides the user
 *    message. No timestamps/ids in any prefix.
 *  - **Every response's usage is accumulated** on `usage` (stage 4 turns this
 *    into priced cost tracking).
 */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { sandboxedNode } from "../sandbox.js";
import type {
  DonePredicate,
  EvalResult,
  SliceManifest,
  SpecimenId,
} from "../types.js";
import type { Spec } from "../specdiff.js";
import type {
  Documenter,
  Elicitor,
  EvalRunner,
  Judge,
  ModelLayer,
  Planner,
  Specimen,
  SpecimenOutput,
  Strategist,
  TestAuthor,
} from "../mock/interfaces.js";
import type { ChatUsage, Provider } from "./provider.js";
import type { FoundryCostMeter } from "./cost.js";
import { detectHacks } from "../hack-detector.js";
import { fullEval } from "../eval-runner.js";

export interface RoleModel {
  provider: Provider;
  model: string;
  maxTokens?: number;
  /** Default 0 — tournaments want reproducibility pressure, not flair. */
  temperature?: number;
}

export interface FoundryRoles {
  testAuthor: RoleModel;
  strategist: RoleModel;
  specimen: RoleModel;
  judge: RoleModel;
  documenter: RoleModel;
  planner: RoleModel;
}

export interface FoundryLayerOptions {
  roles: FoundryRoles;
  /** Human-supplied acceptance (F2): echoed by the deterministic elicitor. */
  donePredicates?: DonePredicate[];
  complexity?: number;
  /** Fixture names the hack detector watches for (R8). */
  fixtureNames?: string[];
  /** Stage-4 cost meter: prices real usage and enforces hard caps (N5/R3). */
  meter?: FoundryCostMeter;
}

/** Extract the first fenced code block, else the whole trimmed text. */
export function extractCode(text: string): string {
  const m = text.match(/```[a-zA-Z]*\n([\s\S]*?)```/);
  return (m ? m[1]! : text).trim() + "\n";
}

/**
 * Syntax-validate generated ESM (stage-5 live-earn hardening). Local models
 * routinely emit TypeScript annotations or duplicate exports into a `.mjs`
 * file; `node --check` catches both in milliseconds and returns the parser's
 * own message so a bounded re-ask can quote it. Returns null when valid.
 */
export function checkEsmSyntax(code: string): string | null {
  const dir = mkdtempSync(join(tmpdir(), "stz-syntax-"));
  try {
    const p = join(dir, "candidate.mjs");
    writeFileSync(p, code, "utf8");
    const r = sandboxedNode(["--check", p], { readDirs: [dir], timeout: 10_000 });
    return r.status === 0 ? null : (r.stderr || "syntax check failed").slice(0, 500);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Sealed-harness self-check (stage-5 live-earn hardening): the harness must be
 * *executable by Node* and speak the wire contract (final stdout line =
 * `{"passed","total","passRate"}`) even against a trivial dummy impl — a
 * harness that crashes on import (the observed deno-URL-import failure) would
 * otherwise zero every specimen and burn the whole escalation budget on a
 * defective instrument. Pass/fail against the dummy is irrelevant; only
 * executability + parseable verdict are checked. Returns null when sane.
 */
export function contractExportNames(contract: string): string[] {
  const names = new Set<string>();
  for (const m of contract.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g)) names.add(m[1]!);
  for (const m of contract.matchAll(/export\s+const\s+(\w+)/g)) names.add(m[1]!);
  return [...names];
}

/**
 * Reference smoke gate (the upstream stz-test-author contract, ported): the
 * sealed suite is only accepted if the author's own reference implementation
 * PASSES it. Catches the over-strict-suite class observed live (a suite that
 * invents expectations beyond the contract zeroes every faithful specimen and
 * burns the escalation budget). Returns null when the reference passes, else
 * the harness's own output for the bounded re-ask to quote.
 */
export function referenceSmokeCheck(harnessCode: string, referenceCode: string): string | null {
  const dir = mkdtempSync(join(tmpdir(), "stz-smoke-"));
  try {
    const harnessPath = join(dir, "sealed.mjs");
    const refPath = join(dir, "reference.mjs");
    writeFileSync(harnessPath, harnessCode, "utf8");
    writeFileSync(refPath, referenceCode, "utf8");
    const r = sandboxedNode([harnessPath, refPath], { readDirs: [dir], timeout: 20_000 });
    const lines = (r.stdout ?? "").trim().split("\n").filter(Boolean);
    const last = lines[lines.length - 1] ?? "";
    try {
      const parsed = JSON.parse(last) as { passRate?: unknown };
      if (parsed.passRate === 1) return null;
    } catch {
      /* fall through */
    }
    return (
      "the author's own reference implementation FAILED the harness — harness output:\n" +
      (r.stdout ?? "").slice(0, 800) +
      ((r.stderr ?? "") ? `\nstderr: ${(r.stderr ?? "").slice(0, 300)}` : "")
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Reference export gate: the smoke gate is only meaningful when the reference
 * actually exports the contract's names — a reference that default-exports (or
 * misnames) makes every harness case throw "x is not a function", which the
 * smoke gate would misattribute to the HARNESS and re-ask the wrong side
 * (observed live: ornith:9b default-exported slugify and burned both harness
 * re-asks on a defect the harness never had). Returns null when sane.
 */
export function referenceExportCheck(referenceCode: string, exportNames: string[]): string | null {
  if (exportNames.length === 0) return null;
  const dir = mkdtempSync(join(tmpdir(), "stz-ref-exports-"));
  try {
    const refPath = join(dir, "reference.mjs");
    const probePath = join(dir, "probe.mjs");
    writeFileSync(refPath, referenceCode, "utf8");
    writeFileSync(
      probePath,
      `const m = await import(process.argv[2]);\n` +
        `const missing = ${JSON.stringify(exportNames)}.filter((n) => typeof m[n] !== "function");\n` +
        `if (missing.length) { console.error("missing named export(s): " + missing.join(", ")); process.exit(1); }\n`,
      "utf8",
    );
    const r = sandboxedNode([probePath, refPath], { readDirs: [dir], timeout: 20_000 });
    if (r.status === 0) return null;
    return (
      "the reference implementation does not expose the contract's named exports: " +
      (r.stderr || "import failed").slice(0, 300)
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function harnessSelfCheck(harnessCode: string, exportNames: string[] = []): string | null {
  const syntax = checkEsmSyntax(harnessCode);
  if (syntax) return syntax;
  const dir = mkdtempSync(join(tmpdir(), "stz-harness-check-"));
  try {
    const harnessPath = join(dir, "sealed.mjs");
    const dummyPath = join(dir, "dummy.mjs");
    writeFileSync(harnessPath, harnessCode, "utf8");
    // A dummy exporting the contract's names as identity-ish no-ops: a
    // defensive harness (typeof-checks its imports) must still reach its
    // verdict line; the dummy is EXPECTED to fail the tests themselves.
    const dummy =
      exportNames.map((n) => `export function ${n}(...a) { return a[0]; }`).join("\n") +
      "\nexport default ((...a) => a[0]);\n";
    writeFileSync(dummyPath, dummy, "utf8");
    const r = sandboxedNode([harnessPath, dummyPath], { readDirs: [dir], timeout: 20_000 });
    const lines = (r.stdout ?? "").trim().split("\n").filter(Boolean);
    const last = lines[lines.length - 1] ?? "";
    try {
      const parsed = JSON.parse(last) as { passRate?: unknown };
      if (typeof parsed.passRate === "number") return null;
      // Parsed but mistyped — name the real defect so the re-ask can fix it
      // (observed live: passRate emitted as a rounded STRING via toFixed).
      return (
        `harness printed a final JSON line but passRate is ${JSON.stringify(parsed.passRate)} ` +
        `(a ${typeof parsed.passRate}) — it must be the raw NUMBER passed/total, not a string, ` +
        `never rounded or toFixed`
      );
    } catch {
      /* fall through */
    }
    return (
      `harness did not print a final JSON line {"passed","total","passRate"} ` +
      `(stdout tail: ${JSON.stringify(last).slice(0, 200)}; stderr: ${(r.stderr ?? "").slice(0, 200)})`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Parse "- claim" / "* claim" / bare lines into spec claims. */
function extractClaims(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*[-*\d.]+\s*/, "").trim())
    .filter((l) => l.length > 0 && !l.startsWith("```") && !l.startsWith("#"));
}

const SPECIMEN_IDS = "abcdefghijklmnop";

/** The sealed-harness wire contract the eval runner executes (eval-runner.ts). */
const SEALED_HARNESS_CONTRACT =
  "The harness is ONE Node.js ESM file. It is invoked as: node sealed.mjs <absolute-path-to-impl.mjs>. " +
  "It must: (1) dynamically import the module at process.argv[2] — its first line is EXACTLY " +
  "`const mod = await import(process.argv[2]);` (a static `import … from process.argv[2]` is a " +
  "SyntaxError); (2) run its test cases against the imported functions; (3) print AS ITS FINAL " +
  'STDOUT LINE exactly one JSON object {"passed":N,"total":M,"passRate":R} where R === N/M — ' +
  "all three are raw JSON numbers (passRate = passed/total, never a string, never rounded or toFixed); " +
  "(4) call process.exit(0) if R === 1, else process.exit(1). " +
  "Never import any test library. Never read the network or filesystem beyond the impl import.";

export class FoundryModelLayer implements ModelLayer {
  /** Accumulated provider usage for the whole run (stage-4 pricing input). */
  readonly usage: Array<{ role: string; model: string; usage: ChatUsage }> = [];
  private specimenOrdinal = 0;

  constructor(private opts: FoundryLayerOptions) {}

  /** Escalation round advanced (orchestrator calls on retry/replan). */
  nextRound(): void {
    this.specimenOrdinal = 0;
  }

  private async ask(
    roleName: keyof FoundryRoles,
    system: string,
    user: string,
  ): Promise<string> {
    const role = this.opts.roles[roleName];
    const res = await role.provider.chat({
      model: role.model,
      system,
      messages: [{ role: "user", content: user }],
      maxTokens: role.maxTokens ?? 4096,
      temperature: role.temperature ?? 0,
    });
    this.usage.push({ role: roleName, model: role.model, usage: res.usage });
    // Cost cap check AFTER recording: the crossing call throws, the spend stays
    // on the record (CostCapExceededError propagates as the kill-switch, R3).
    this.opts.meter?.add(roleName, role.model, res.usage);
    return res.text;
  }

  // F2: deterministic — predicates are human-supplied, never model-invented.
  elicitor: Elicitor = {
    elicit: async (request: string) => ({
      questionnaire: { request, scope: "single-repo", mode: "foundry" },
      donePredicates: this.opts.donePredicates ?? [],
      complexity: this.opts.complexity ?? 2,
    }),
  };

  testAuthor: TestAuthor = {
    authorTests: async (manifest: SliceManifest) => {
      const system =
        "You are a frozen test author for an adversarial coding tournament. You write a SEALED " +
        "held-out test harness the implementers will never see. Be adversarial: cover edge cases, " +
        "rejection cases for invalid input the contract implies, and discriminating inputs that " +
        "separate a correct implementation from a plausible-but-wrong one. Stay strictly within " +
        "the contract: never fail behaviour the contract leaves open. " +
        SEALED_HARNESS_CONTRACT +
        " Write PLAIN JavaScript (no TypeScript annotations). Import NOTHING except node built-ins " +
        "via the node: prefix. Reply with ONLY the harness code in a single fenced code block.";
      const user =
        `Contract:\n${manifest.contract}\n\nDone predicates:\n` +
        manifest.donePredicates.map((d) => `- ${d.expr} (${d.kind})`).join("\n");
      const exportNames = contractExportNames(manifest.contract);

      let code = extractCode(await this.ask("testAuthor", system, user));
      let defect = harnessSelfCheck(code, exportNames);
      if (defect) {
        // ONE bounded re-ask quoting the validator's message (never a loop) —
        // a defective instrument would zero every specimen (observed live:
        // a deno-URL import crashed Node and burned the escalation budget).
        code = extractCode(
          await this.ask(
            "testAuthor",
            system,
            `${user}\n\nYour previous harness failed validation and was rejected:\n${defect}\n` +
              "Produce a corrected harness. Reply with ONLY the code in a single fenced code block.",
          ),
        );
        defect = harnessSelfCheck(code, exportNames);
        if (defect) {
          throw new Error(`test author produced an unusable sealed harness twice: ${defect}`);
        }
      }

      // Reference smoke gate: ask the author for its own reference impl and
      // require the harness to pass it (satisfiability proof — the upstream
      // stz-test-author contract). One bounded harness re-ask on failure.
      const refSystem =
        "You are the same frozen test author. Now write the REFERENCE implementation of the " +
        "contract — the straightforward, contract-faithful implementation your sealed harness must " +
        "accept. PLAIN JavaScript, one self-contained Node.js ESM file, named exports per the " +
        "contract, no dependencies. The contract's TypeScript signature is documentation ONLY — " +
        "Node cannot parse type annotations: write `export function f(s) {` never " +
        "`export function f(s: string): string {`. Reply with ONLY the code in a single fenced code block.";
      let ref = extractCode(await this.ask("testAuthor", refSystem, `Contract:\n${manifest.contract}`));
      const refSyntax = checkEsmSyntax(ref);
      if (refSyntax) {
        ref = extractCode(
          await this.ask(
            "testAuthor",
            refSystem,
            `Contract:\n${manifest.contract}\n\nYour previous code failed to parse:\n${refSyntax}\n` +
              "Produce corrected PLAIN JavaScript. Reply with ONLY the code in a single fenced code block.",
          ),
        );
      }
      // The smoke gate is only as good as its reference: a reference missing
      // the contract's named exports fails every case and frames the harness.
      let refDefect = referenceExportCheck(ref, exportNames);
      if (refDefect) {
        ref = extractCode(
          await this.ask(
            "testAuthor",
            refSystem,
            `Contract:\n${manifest.contract}\n\nYour previous reference was rejected:\n${refDefect}\n` +
              "Export the contract's functions as NAMED exports. Reply with ONLY the corrected code " +
              "in a single fenced code block.",
          ),
        );
        refDefect = referenceExportCheck(ref, exportNames);
        if (refDefect) throw new Error(`test author produced an unusable reference twice: ${refDefect}`);
      }

      // TWO bounded re-asks: local authors routinely invent expectations the
      // contract never mandates (hyphen-trimming, accent transliteration —
      // both observed live); the derivation instruction below fixes most of
      // them, and a second round is far cheaper than killing the run.
      let smoke = referenceSmokeCheck(code, ref);
      for (let round = 0; smoke && round < 2; round++) {
        code = extractCode(
          await this.ask(
            "testAuthor",
            system,
            `${user}\n\nYour previous harness was rejected by the reference smoke gate: ${smoke}\n` +
              "The harness may only test behaviour the contract mandates — never invented " +
              "expectations. For EVERY failing case above, recompute the expected value by " +
              "mechanically applying ONLY the contract's stated rules, step by step; if the " +
              "contract does not mandate a transformation (e.g. trimming legal characters, " +
              "collapsing legal duplicates, transliterating accents), the harness must NOT " +
              "expect it — either correct that case's expected value or delete the case. " +
              "Fix the HARNESS (not the reference). Reply with ONLY the corrected " +
              "harness code in a single fenced code block.",
          ),
        );
        const recheck = harnessSelfCheck(code, exportNames);
        if (recheck) throw new Error(`re-asked sealed harness is unusable: ${recheck}`);
        smoke = referenceSmokeCheck(code, ref);
      }
      if (smoke) throw new Error(`sealed harness failed the reference smoke gate 3 times: ${smoke}`);

      return {
        sealed: { "held-out/sealed.mjs": code },
        rubric:
          "correctness against the sealed suite, contract fidelity, edge-case handling, code clarity",
      };
    },
  };

  strategist: Strategist = {
    strategies: async (manifest: SliceManifest, n: number) => {
      const text = await this.ask(
        "strategist",
        "You are a strategy-diversification agent. Given an interface contract, name N genuinely " +
          "distinct implementation strategies (different algorithmic approaches, not synonyms). " +
          "Reply with exactly N lines, one short kebab-case strategy label per line, nothing else.",
        `N = ${n}\n\nContract:\n${manifest.contract}`,
      );
      const labels = text
        .split("\n")
        .map((l) => l.replace(/^\s*[-*\d.]+\s*/, "").trim().toLowerCase().replace(/\s+/g, "-"))
        .filter((l) => l.length > 0 && l.length < 60);
      const fallback = ["iterator-based", "stream-based", "batch-based", "recursive", "table-driven", "functional"];
      const out = labels.slice(0, n);
      for (let i = 0; out.length < n; i++) out.push(fallback[i % fallback.length]!);
      return out;
    },
  };

  specimen: Specimen = {
    implement: async (manifest, strategy, refinement) => {
      const id = SPECIMEN_IDS[this.specimenOrdinal % SPECIMEN_IDS.length]! as SpecimenId;
      this.specimenOrdinal++;
      const system =
        "You are one competing implementer in an adversarial tournament. Implement the contract " +
        "as ONE self-contained Node.js ESM file (.mjs) using the assigned strategy. Write PLAIN " +
        "JavaScript — NO TypeScript type annotations. Export exactly the functions the contract " +
        "names (named exports), each defined ONCE. Satisfy the SPIRIT of the contract — " +
        "your output is graded by a sealed suite you cannot see and inspected for grader-gaming " +
        "patterns; special-casing suspected test inputs disqualifies you. No dependencies, no " +
        "network, no filesystem. Reply with ONLY the code in a single fenced code block.";
      const user =
        `Contract:\n${manifest.contract}\n\nStrategy: ${strategy}\n` +
        (refinement ? `\nRefinement context from prior failed round:\n${refinement}\n` : "");

      let code = extractCode(await this.ask("specimen", system, user));
      const defect = checkEsmSyntax(code);
      if (defect) {
        // ONE bounded re-ask; if still broken, ship it anyway — the gate culls
        // it (specimens are expendable; only the harness may halt a run).
        code = extractCode(
          await this.ask(
            "specimen",
            system,
            `${user}\nYour previous code failed to parse as JavaScript:\n${defect}\n` +
              "Produce corrected PLAIN JavaScript. Reply with ONLY the code in a single fenced code block.",
          ),
        );
      }
      return {
        specimen: id,
        files: { "impl.mjs": code },
        strategy,
      } satisfies SpecimenOutput;
    },
  };

  // The REAL eval gate: executed sealed suite + V8 coverage + mutation + hacks.
  evalRunner: EvalRunner = {
    evaluate: async (output: SpecimenOutput, sealed): Promise<EvalResult> => {
      const dir = mkdtempSync(join(tmpdir(), "stz-foundry-eval-"));
      try {
        const sealedEntries = Object.entries(sealed);
        const [sealedRel, sealedContents] = sealedEntries[0] ?? ["held-out/sealed.mjs", ""];
        const sealedPath = join(dir, sealedRel.endsWith(".mjs") ? sealedRel : `${sealedRel}.mjs`);
        mkdirSync(dirname(sealedPath), { recursive: true });
        writeFileSync(sealedPath, sealedContents, "utf8");

        const implRel =
          Object.keys(output.files).find((f) => f.endsWith(".mjs") || f.endsWith(".js")) ??
          Object.keys(output.files)[0]!;
        const implPath = join(dir, "specimens", output.specimen, implRel);
        mkdirSync(dirname(implPath), { recursive: true });
        for (const [rel, contents] of Object.entries(output.files)) {
          const p = join(dir, "specimens", output.specimen, rel);
          mkdirSync(dirname(p), { recursive: true });
          writeFileSync(p, contents, "utf8");
        }

        const hackFindings = detectHacks(output.specimen, output.files, {
          fixtureNames: this.opts.fixtureNames ?? [],
        });
        const e = fullEval(sealedPath, implPath);
        return {
          specimen: output.specimen,
          passedGate: e.testPassRate === 1 && hackFindings.length === 0,
          testPassRate: e.testPassRate,
          coverage: e.coverage,
          mutationScore: e.mutationScore,
          hackFindings,
        } satisfies EvalResult;
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };

  judge: Judge = {
    vote: async (a, b, _sealed): Promise<SpecimenId> => {
      const text = await this.ask(
        "judge",
        "You are a frozen pairwise judge in an adversarial coding tournament. Compare two " +
          "implementations of the same contract on: contract fidelity, edge-case handling, " +
          "clarity, and absence of grader-gaming. Reply with EXACTLY one character: A or B.",
        `Implementation A (specimen-${a.specimen}, strategy ${a.strategy}):\n` +
          `\`\`\`js\n${Object.values(a.files)[0] ?? ""}\`\`\`\n\n` +
          `Implementation B (specimen-${b.specimen}, strategy ${b.strategy}):\n` +
          `\`\`\`js\n${Object.values(b.files)[0] ?? ""}\`\`\``,
      );
      const m = text.trim().toUpperCase().match(/\b([AB])\b/);
      if (m?.[1] === "A") return a.specimen;
      if (m?.[1] === "B") return b.specimen;
      // Unparseable vote → deterministic tie-break, never a crash mid-tournament.
      return a.specimen < b.specimen ? a.specimen : b.specimen;
    },
  };

  documenter: Documenter = {
    asBuilt: async (winner: SpecimenOutput): Promise<Spec> => {
      const text = await this.ask(
        "documenter",
        "You are a documenter. Given winning implementation code, state its as-built behavioural " +
          "claims as a short markdown bullet list (one claim per line, no headings, no prose).",
        `Winning implementation (strategy ${winner.strategy}):\n\`\`\`js\n${Object.values(winner.files)[0] ?? ""}\`\`\``,
      );
      return { claims: extractClaims(text) };
    },
  };

  planner: Planner = {
    intentSpec: async (manifest: SliceManifest): Promise<Spec> => {
      const text = await this.ask(
        "planner",
        "You are a planner. Given an interface contract, state the intended behavioural claims as " +
          "a short markdown bullet list (one claim per line, no headings, no prose). Claims must be " +
          "checkable against a built implementation.",
        `Contract:\n${manifest.contract}\n\nDone predicates:\n` +
          manifest.donePredicates.map((d) => `- ${d.expr}`).join("\n"),
      );
      return { claims: extractClaims(text) };
    },
  };
}
