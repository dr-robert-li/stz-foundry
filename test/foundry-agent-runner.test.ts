/**
 * The tracer (Phase 1 — Agentic eval seam, Plan 01-01): one battery, one
 * task, one `output-assertion` check, an `execution`-rooted receipt, run end
 * to end through `runAgentBattery` against a stubbed in-process agent, whose
 * `EvalResult` the existing UNMODIFIED selection path (`evalGate`/
 * `evalReward`/`select`) consumes. No network, no daemon.
 */
import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fakeServer, closeAllFakeServers } from "./helpers/fake-server.js";
import { runAgentBattery, observeCheck } from "../src/foundry/agent-runner.js";
import { makeBattery } from "../src/foundry/battery-types.js";
import { evalGate, evalReward, select } from "../src/selection.js";
import { FoundryCostMeter } from "../src/foundry/cost.js";
import type { PredicateCheck } from "../src/contract/contract-types.js";
import type { ChatRequest, ChatResponse, Provider } from "../src/foundry/provider.js";

const check = (over: Partial<PredicateCheck>): PredicateCheck => ({
  checkId: "c",
  kind: "output-assertion",
  expect: "x",
  description: "d",
  ...over,
});

const tmpDirs: string[] = [];
async function tmp(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), "stz-agent-runner-"));
  tmpDirs.push(d);
  return d;
}

afterEach(async () => {
  closeAllFakeServers();
  await Promise.all(tmpDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("runAgentBattery (tracer)", () => {
  it("runs a one-task battery end to end and the unmodified selection path consumes it", async () => {
    const srv = await fakeServer(() => ({
      status: 200,
      json: {
        model: "test-model",
        choices: [{ message: { content: "```path=out.txt\nok\n```" } }],
      },
    }));

    const battery = makeBattery({
      id: "battery-01",
      tasks: [
        {
          id: "t1",
          prompt: "write out.txt containing the text ok",
          checks: [
            {
              checkId: "t1-out",
              kind: "output-assertion",
              input: "out.txt",
              expect: "ok",
              description: "out.txt contains ok",
            },
          ],
        },
      ],
      receipt: { kind: "execution", acceptedBy: "Dr. Robert Li", lineage: [] },
    });

    const run = await runAgentBattery(
      { id: "cand-a", systemPrompt: "you write files as fenced blocks marked path=<file>" },
      battery,
      { provider: { kind: "openai", baseUrl: srv.url, model: "test-model" } },
    );

    expect(run.tasks[0]?.pass).toBe(true);
    expect(run.result.testPassRate).toBe(1);
    expect(run.result.passedGate).toBe(true);
    expect(run.result.specimen).toBe("cand-a");
    expect(run.receipt.kind).toBe("execution");
    expect(run.provider.baseUrl).toBe(srv.url);

    // The structural-compatibility proof is executable, not prose (REQ-14):
    // the unmodified selection path consumes `run.result` directly.
    const gate = evalGate([run.result]);
    expect(gate.passers).toEqual(["cand-a"]);
    expect(gate.eliminated).toEqual([]);

    const reward = evalReward(run.result);
    expect(Number.isFinite(reward)).toBe(true);
    expect(reward).toBeGreaterThanOrEqual(0);
    expect(reward).toBeLessThanOrEqual(1);

    const { judgment } = select([run.result], []);
    expect(judgment.winner).toBe("cand-a");
  });

  it("a battery whose receipt roots in anchored-judge cannot be constructed", () => {
    let thrown: unknown;
    try {
      makeBattery({
        id: "battery-02",
        tasks: [
          {
            id: "t1",
            prompt: "irrelevant — construction fails before any task runs",
            checks: [
              { checkId: "c1", kind: "output-assertion", expect: "x", description: "d" },
            ],
          },
        ],
        receipt: { kind: "anchored-judge", acceptedBy: "Dr. Robert Li", lineage: [] },
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toContain("anchored-judge");
    expect(message).toContain("exogenous");
  });

  it("an escaping artifact key becomes an attributable task failure, never a thrown run", async () => {
    const srv = await fakeServer(() => ({
      status: 200,
      json: {
        model: "test-model",
        choices: [{ message: { content: "```path=../../escape.txt\nhax\n```" } }],
      },
    }));

    const battery = makeBattery({
      id: "battery-escape",
      tasks: [
        {
          id: "t1",
          prompt: "irrelevant — the response artifact key escapes the containment base",
          checks: [
            { checkId: "c1", kind: "output-assertion", expect: "x", description: "d" },
          ],
        },
      ],
      receipt: { kind: "execution", acceptedBy: "Dr. Robert Li", lineage: [] },
    });

    const run = await runAgentBattery(
      { id: "cand-a", systemPrompt: "you write files as fenced blocks marked path=<file>" },
      battery,
      { provider: { kind: "openai", baseUrl: srv.url, model: "test-model" } },
    );

    expect(run.tasks).toHaveLength(1);
    expect(run.tasks[0]?.pass).toBe(false);
    expect(run.tasks[0]?.status).toBe("error");
    expect(run.tasks[0]?.failureReason).toMatch(/path-traversal guard/);
  });

  it("with artifactDir supplied, a passing task's artifacts land under <artifactDir>/<taskId>/", async () => {
    const srv = await fakeServer(() => ({
      status: 200,
      json: {
        model: "test-model",
        choices: [{ message: { content: "```path=out.txt\nok\n```" } }],
      },
    }));
    const artifactDir = await tmp();

    const battery = makeBattery({
      id: "battery-materialize",
      tasks: [
        {
          id: "t1",
          prompt: "write out.txt containing the text ok",
          checks: [
            {
              checkId: "t1-out",
              kind: "output-assertion",
              input: "out.txt",
              expect: "ok",
              description: "out.txt contains ok",
            },
          ],
        },
      ],
      receipt: { kind: "execution", acceptedBy: "Dr. Robert Li", lineage: [] },
    });

    const run = await runAgentBattery(
      { id: "cand-a", systemPrompt: "you write files as fenced blocks marked path=<file>" },
      battery,
      { provider: { kind: "openai", baseUrl: srv.url, model: "test-model" }, artifactDir },
    );

    expect(run.tasks[0]?.pass).toBe(true);
    expect(await readFile(join(artifactDir, "t1", "out.txt"), "utf8")).toBe("ok");
  });
});

describe("observeCheck — output-assertion", () => {
  it("the satisfied case: named artifact's trimmed content equals expect", () => {
    const c = check({ kind: "output-assertion", input: "out.txt", expect: "ok" });
    expect(observeCheck(c, { "out.txt": "  ok  " }, "raw")).toBe("ok");
  });
  it("the violated case: named artifact's trimmed content differs from expect", () => {
    const c = check({ kind: "output-assertion", input: "out.txt", expect: "ok" });
    expect(observeCheck(c, { "out.txt": "not-ok" }, "raw")).toBe("not-ok");
  });
  it("input absent: observed is the trimmed raw response text", () => {
    const c = check({ kind: "output-assertion", expect: "ok" });
    expect(observeCheck(c, {}, "  ok  ")).toBe("ok");
  });
  it("the missing-artifact case: named artifact absent gives undefined, never an empty string", () => {
    const c = check({ kind: "output-assertion", input: "out.txt", expect: "ok" });
    expect(observeCheck(c, {}, "raw")).toBeUndefined();
  });
});

describe("observeCheck — file-invariant", () => {
  it("the satisfied case: path present in the artifact map gives \"true\"", () => {
    const c = check({ kind: "file-invariant", input: "flag.txt", expect: "true" });
    expect(observeCheck(c, { "flag.txt": "anything" }, "")).toBe("true");
  });
  it("the violated case: path absent from the artifact map gives \"false\"", () => {
    const c = check({ kind: "file-invariant", input: "flag.txt", expect: "true" });
    expect(observeCheck(c, {}, "")).toBe("false");
  });
  it("the missing-artifact case: input absent gives undefined", () => {
    const c = check({ kind: "file-invariant", expect: "true" });
    expect(observeCheck(c, { "flag.txt": "x" }, "")).toBeUndefined();
  });
});

describe("observeCheck — json-invariant", () => {
  it("the satisfied case: value at the dotted path, stringified, equals expect", () => {
    const c = check({ kind: "json-invariant", input: "data.json#a.b", expect: "1" });
    expect(observeCheck(c, { "data.json": '{"a":{"b":1}}' }, "")).toBe("1");
  });
  it("the violated case: a different value at the dotted path", () => {
    const c = check({ kind: "json-invariant", input: "data.json#a.b", expect: "1" });
    expect(observeCheck(c, { "data.json": '{"a":{"b":2}}' }, "")).toBe("2");
  });
  it("the missing-artifact case: named artifact absent gives undefined", () => {
    const c = check({ kind: "json-invariant", input: "data.json#a.b", expect: "1" });
    expect(observeCheck(c, {}, "")).toBeUndefined();
  });
  it("unparseable JSON gives undefined", () => {
    const c = check({ kind: "json-invariant", input: "data.json#a.b", expect: "1" });
    expect(observeCheck(c, { "data.json": "not json" }, "")).toBeUndefined();
  });
  it("a dotted path that does not resolve gives undefined", () => {
    const c = check({ kind: "json-invariant", input: "data.json#a.missing", expect: "1" });
    expect(observeCheck(c, { "data.json": '{"a":{"b":1}}' }, "")).toBeUndefined();
  });
  it("a malformed input with no # gives undefined", () => {
    const c = check({ kind: "json-invariant", input: "data.json", expect: "1" });
    expect(observeCheck(c, { "data.json": '{"a":1}' }, "")).toBeUndefined();
  });
});

describe("observeCheck — diff-constraint", () => {
  it("the satisfied case: sorted, newline-joined artifact keys equal expect", () => {
    const c = check({ kind: "diff-constraint", expect: "a.txt\nb.txt" });
    expect(observeCheck(c, { "b.txt": "y", "a.txt": "x" }, "")).toBe("a.txt\nb.txt");
  });
  it("the violated case: a different key set", () => {
    const c = check({ kind: "diff-constraint", expect: "a.txt\nb.txt" });
    expect(observeCheck(c, { "c.txt": "z" }, "")).toBe("c.txt");
  });
  it("the missing-artifact case: an empty artifact map gives undefined, never an empty string", () => {
    const c = check({ kind: "diff-constraint", expect: "a.txt\nb.txt" });
    expect(observeCheck(c, {}, "")).toBeUndefined();
  });
});

describe("runAgentBattery — all four predicate kinds through one battery", () => {
  it("scores one task per kind, all passing", async () => {
    const srv = await fakeServer((_req, body) => {
      const messages = (body as { messages: { content: string }[] }).messages;
      const prompt = messages[messages.length - 1]?.content ?? "";
      const content = (() => {
        if (prompt.includes("TASK_OUTPUT")) return "```path=out.txt\nok\n```";
        if (prompt.includes("TASK_FILE")) return "```path=flag.txt\nyes\n```";
        if (prompt.includes("TASK_JSON")) return '```path=data.json\n{"a":{"b":1}}\n```';
        if (prompt.includes("TASK_DIFF")) return "```path=a.txt\nx\n```\n```path=b.txt\ny\n```";
        throw new Error(`unexpected prompt: ${prompt}`);
      })();
      return { status: 200, json: { model: "test-model", choices: [{ message: { content } }] } };
    });

    const battery = makeBattery({
      id: "battery-four-kinds",
      tasks: [
        {
          id: "t-output",
          prompt: "TASK_OUTPUT: write out.txt containing ok",
          checks: [
            { checkId: "c-output", kind: "output-assertion", input: "out.txt", expect: "ok", description: "d" },
          ],
        },
        {
          id: "t-file",
          prompt: "TASK_FILE: write flag.txt",
          checks: [
            { checkId: "c-file", kind: "file-invariant", input: "flag.txt", expect: "true", description: "d" },
          ],
        },
        {
          id: "t-json",
          prompt: "TASK_JSON: write data.json with a.b = 1",
          checks: [
            { checkId: "c-json", kind: "json-invariant", input: "data.json#a.b", expect: "1", description: "d" },
          ],
        },
        {
          id: "t-diff",
          prompt: "TASK_DIFF: write a.txt and b.txt",
          checks: [
            { checkId: "c-diff", kind: "diff-constraint", expect: "a.txt\nb.txt", description: "d" },
          ],
        },
      ],
      receipt: { kind: "execution", acceptedBy: "Dr. Robert Li", lineage: [] },
    });

    const run = await runAgentBattery(
      { id: "cand-a", systemPrompt: "you write files as fenced blocks marked path=<file>" },
      battery,
      { provider: { kind: "openai", baseUrl: srv.url, model: "test-model" } },
    );

    expect(run.result.testPassRate).toBe(1);
    for (const t of run.tasks) expect(t.pass).toBe(true);
  });
});

describe("runAgentBattery — vacuity guards", () => {
  it("a battery whose tasks all produce no artifacts fails closed", async () => {
    const srv = await fakeServer(() => ({
      status: 200,
      json: {
        model: "test-model",
        choices: [{ message: { content: "just prose, no fenced path= block anywhere" } }],
      },
    }));

    const battery = makeBattery({
      id: "battery-vacuous",
      tasks: [
        {
          id: "t1",
          prompt: "prompt 1",
          checks: [
            { checkId: "c1", kind: "file-invariant", input: "must-not-exist-1.txt", expect: "false", description: "d" },
          ],
        },
        {
          id: "t2",
          prompt: "prompt 2",
          checks: [
            { checkId: "c2", kind: "file-invariant", input: "must-not-exist-2.txt", expect: "false", description: "d" },
          ],
        },
      ],
      receipt: { kind: "execution", acceptedBy: "Dr. Robert Li", lineage: [] },
    });

    const run = await runAgentBattery(
      { id: "cand-a", systemPrompt: "you write files as fenced blocks marked path=<file>" },
      battery,
      { provider: { kind: "openai", baseUrl: srv.url, model: "test-model" } },
    );

    // Without the guard, both negative file-invariants would score "false"
    // (the file genuinely doesn't exist) and testPassRate would read 1.
    expect(run.result.passedGate).toBe(false);
    expect(run.result.gateBlockedReason).toBeTruthy();
    expect(run.result.gateBlockedReason).toMatch(/artifact/i);
    const gate = evalGate([run.result]);
    expect(gate.passers).toEqual([]);
    expect(gate.eliminated).toEqual([{ specimen: "cand-a", reason: expect.stringContaining("gate-fail") }]);
  });

  it("a failed task is a scored failure, not a dropped row", async () => {
    class FlakyProvider implements Provider {
      readonly kind = "openai" as const;
      readonly baseUrl = "scripted://local";
      async chat(req: ChatRequest): Promise<ChatResponse> {
        const user = req.messages[req.messages.length - 1]?.content ?? "";
        if (user.includes("TASK_2")) {
          throw new Error("provider request failed (500, non-retryable)");
        }
        return {
          text: "```path=out.txt\nok\n```",
          model: req.model,
          usage: { inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0 },
        };
      }
    }

    const battery = makeBattery({
      id: "battery-partial-fail",
      tasks: [
        {
          id: "t1",
          prompt: "TASK_1: write out.txt containing ok",
          checks: [
            { checkId: "c1", kind: "output-assertion", input: "out.txt", expect: "ok", description: "d" },
          ],
        },
        {
          id: "t2",
          prompt: "TASK_2: this one always fails at the provider",
          checks: [
            { checkId: "c2", kind: "output-assertion", input: "out.txt", expect: "ok", description: "d" },
          ],
        },
      ],
      receipt: { kind: "execution", acceptedBy: "Dr. Robert Li", lineage: [] },
    });

    const run = await runAgentBattery(
      { id: "cand-a", systemPrompt: "you write files as fenced blocks marked path=<file>" },
      battery,
      { providerImpl: new FlakyProvider() },
    );

    expect(run.tasks).toHaveLength(2);
    expect(run.records).toHaveLength(2);
    expect(run.tasks[0]?.pass).toBe(true);
    expect(run.tasks[1]?.status).toBe("error");
    expect(run.tasks[1]?.pass).toBe(false);
    expect(run.tasks[1]?.failureReason).not.toBeNull();
    // NOT 1 — a mutant computing the denominator over surviving/ok records
    // only would read 1 here (task 1 the sole "ok" record, passing).
    expect(run.result.testPassRate).toBe(0.5);
    expect(run.result.passedGate).toBe(false);
  });

  it("every result carries its OracleReceipt, including a failed task's", async () => {
    class AlwaysFailsProvider implements Provider {
      readonly kind = "openai" as const;
      readonly baseUrl = "scripted://local";
      async chat(): Promise<ChatResponse> {
        throw new Error("provider unreachable");
      }
    }

    const receipt = { kind: "execution" as const, acceptedBy: "Dr. Robert Li", lineage: [] };
    const battery = makeBattery({
      id: "battery-receipt-carry",
      tasks: [
        {
          id: "t1",
          prompt: "irrelevant — the provider always throws",
          checks: [
            { checkId: "c1", kind: "output-assertion", expect: "x", description: "d" },
          ],
        },
      ],
      receipt,
    });

    const run = await runAgentBattery(
      { id: "cand-a", systemPrompt: "irrelevant" },
      battery,
      { providerImpl: new AlwaysFailsProvider() },
    );

    expect(run.receipt).toEqual(receipt);
    expect(run.tasks[0]?.status).toBe("error");
    expect(run.tasks[0]?.receipt).toEqual(receipt);
  });
});

describe("runAgentBattery — wall-clock kill and cost cap (01-04)", () => {
  it("a task exceeding its wall-clock cap is killed and recorded", async () => {
    let calls = 0;
    const srv = await fakeServer(() => {
      calls++;
      if (calls === 1) {
        return {
          status: 200,
          json: { model: "test-model", choices: [{ message: { content: "```path=out.txt\nok\n```" } }] },
        };
      }
      return null; // never answer — task 2 wedges forever
    });

    const battery = makeBattery({
      id: "battery-wedged",
      tasks: [
        {
          id: "t1",
          prompt: "TASK_1: write out.txt containing ok",
          checks: [
            { checkId: "c1", kind: "output-assertion", input: "out.txt", expect: "ok", description: "d" },
          ],
        },
        {
          id: "t2",
          prompt: "TASK_2: this task's provider call is never answered",
          checks: [
            { checkId: "c2", kind: "output-assertion", input: "out.txt", expect: "ok", description: "d" },
          ],
        },
      ],
      receipt: { kind: "execution", acceptedBy: "Dr. Robert Li", lineage: [] },
    });

    const run = await runAgentBattery(
      { id: "cand-a", systemPrompt: "you write files as fenced blocks marked path=<file>" },
      battery,
      { provider: { kind: "openai", baseUrl: srv.url, model: "test-model" }, taskTimeoutMs: 150 },
    );

    expect(run.tasks).toHaveLength(2);
    expect(run.records[1]?.status).toBe("timeout");
    expect(run.records[1]?.killReason).toMatch(/stuck-killed/);
    expect(run.tasks[1]?.pass).toBe(false);
    expect(run.tasks[1]?.failureReason).not.toBeNull();
    expect(run.result.testPassRate).toBe(0.5);
    expect(run.result.passedGate).toBe(false);
    expect(run.bounds.taskTimeoutMs).toBe(150);
  });

  it("a cost cap breach halts with spend recorded and remaining tasks attributed", async () => {
    const srv = await fakeServer(() => ({
      status: 200,
      json: {
        model: "test-model",
        choices: [{ message: { content: "```path=out.txt\nok\n```" } }],
        usage: { prompt_tokens: 10, completion_tokens: 10 },
      },
    }));

    const battery = makeBattery({
      id: "battery-cost-cap",
      tasks: [
        {
          id: "t1",
          prompt: "TASK_1",
          checks: [{ checkId: "c1", kind: "output-assertion", input: "out.txt", expect: "ok", description: "d" }],
        },
        {
          id: "t2",
          prompt: "TASK_2",
          checks: [{ checkId: "c2", kind: "output-assertion", input: "out.txt", expect: "ok", description: "d" }],
        },
        {
          id: "t3",
          prompt: "TASK_3",
          checks: [{ checkId: "c3", kind: "output-assertion", input: "out.txt", expect: "ok", description: "d" }],
        },
      ],
      receipt: { kind: "execution", acceptedBy: "Dr. Robert Li", lineage: [] },
    });

    // Priced absurdly high so task 1's own 20-token call alone crosses maxUsd.
    const meter = new FoundryCostMeter(
      { "test-model": { inputPerMTok: 1_000_000_000, outputPerMTok: 1_000_000_000 } },
      { maxUsd: 1 },
    );

    const run = await runAgentBattery(
      { id: "cand-a", systemPrompt: "you write files as fenced blocks marked path=<file>" },
      battery,
      { provider: { kind: "openai", baseUrl: srv.url, model: "test-model" }, costMeter: meter },
    );

    expect(run.records).toHaveLength(3);
    for (const t of run.tasks) {
      expect(t.status).toBe("error");
      expect(t.failureReason).toMatch(/cap/i);
    }
    expect(meter.totals().usd).toBeGreaterThan(0);
    expect(run.cost?.usd).toBeGreaterThan(0);
  });

  it("token usage is metered per call", async () => {
    const srv = await fakeServer(() => ({
      status: 200,
      json: {
        model: "test-model",
        choices: [{ message: { content: "```path=out.txt\nok\n```" } }],
        usage: { prompt_tokens: 5, completion_tokens: 5 },
      },
    }));

    const battery = makeBattery({
      id: "battery-metered",
      tasks: [
        {
          id: "t1",
          prompt: "TASK_1",
          checks: [{ checkId: "c1", kind: "output-assertion", input: "out.txt", expect: "ok", description: "d" }],
        },
        {
          id: "t2",
          prompt: "TASK_2",
          checks: [{ checkId: "c2", kind: "output-assertion", input: "out.txt", expect: "ok", description: "d" }],
        },
      ],
      receipt: { kind: "execution", acceptedBy: "Dr. Robert Li", lineage: [] },
    });

    const meter = new FoundryCostMeter({ "test-model": { inputPerMTok: 1, outputPerMTok: 1 } });

    const run = await runAgentBattery(
      { id: "cand-a", systemPrompt: "you write files as fenced blocks marked path=<file>" },
      battery,
      { provider: { kind: "openai", baseUrl: srv.url, model: "test-model" }, costMeter: meter },
    );

    expect(run.result.testPassRate).toBe(1);
    expect(meter.totals().calls).toBe(2);
    expect(meter.bySpecimen()["cand-a"]?.calls).toBe(2);
  });
});
