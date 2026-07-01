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
  "It must: (1) dynamically import the module at process.argv[2]; (2) run its test cases " +
  "against the imported functions; (3) print AS ITS FINAL STDOUT LINE exactly one JSON object " +
  '{"passed":N,"total":M,"passRate":R} where R === N/M; (4) call process.exit(0) if R === 1, else process.exit(1). ' +
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
      const text = await this.ask(
        "testAuthor",
        "You are a frozen test author for an adversarial coding tournament. You write a SEALED " +
          "held-out test harness the implementers will never see. Be adversarial: cover edge cases, " +
          "rejection cases for invalid input the contract implies, and discriminating inputs that " +
          "separate a correct implementation from a plausible-but-wrong one. Stay strictly within " +
          "the contract: never fail behaviour the contract leaves open. " +
          SEALED_HARNESS_CONTRACT +
          " Reply with ONLY the harness code in a single fenced code block.",
        `Contract:\n${manifest.contract}\n\nDone predicates:\n` +
          manifest.donePredicates.map((d) => `- ${d.expr} (${d.kind})`).join("\n"),
      );
      return {
        sealed: { "held-out/sealed.mjs": extractCode(text) },
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
      const text = await this.ask(
        "specimen",
        "You are one competing implementer in an adversarial tournament. Implement the contract " +
          "as ONE self-contained Node.js ESM file (.mjs) using the assigned strategy. Export exactly " +
          "the functions the contract names (named exports). Satisfy the SPIRIT of the contract — " +
          "your output is graded by a sealed suite you cannot see and inspected for grader-gaming " +
          "patterns; special-casing suspected test inputs disqualifies you. No dependencies, no " +
          "network, no filesystem. Reply with ONLY the code in a single fenced code block.",
        `Contract:\n${manifest.contract}\n\nStrategy: ${strategy}\n` +
          (refinement ? `\nRefinement context from prior failed round:\n${refinement}\n` : ""),
      );
      return {
        specimen: id,
        files: { "impl.mjs": extractCode(text) },
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
