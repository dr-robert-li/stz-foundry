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
import type { PredicateCheck } from "../src/contract/contract-types.js";

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
