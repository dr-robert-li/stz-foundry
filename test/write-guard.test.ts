/**
 * The repo's ONE path-containment guard, tested directly (Phase 1 —
 * Agentic eval seam, Plan 01-03). Before this task the guard had no direct
 * test anywhere in `test/` — it was covered only incidentally through
 * `src/mock/orchestrator.ts`'s two call sites, never in isolation.
 */
import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { resolveContained, writeSpecimenFiles } from "../src/write-guard.js";

const dirs: string[] = [];
async function tmp(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), "stz-write-guard-"));
  dirs.push(d);
  return d;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("resolveContained", () => {
  it("returns the joined absolute path for a contained relative key", async () => {
    const base = await tmp();
    expect(resolveContained(base, "a/b.txt")).toBe(resolve(base, "a/b.txt"));
  });

  it("throws matching /path-traversal guard/ for an escaping relative key", async () => {
    const base = await tmp();
    expect(() => resolveContained(base, "../../etc/passwd")).toThrow(/path-traversal guard/);
  });

  it("throws for an absolute key (resolve neutralizes it to itself)", async () => {
    const base = await tmp();
    expect(() => resolveContained(base, "/tmp/x")).toThrow(/path-traversal guard/);
  });

  it("throws for a key that dips out and back via ..", async () => {
    const base = await tmp();
    expect(() => resolveContained(base, "a/../../x")).toThrow(/path-traversal guard/);
  });

  it("accepts a key with .. that normalizes back inside the base", async () => {
    const base = await tmp();
    expect(resolveContained(base, "a/../b.txt")).toBe(resolve(base, "b.txt"));
  });
});

describe("writeSpecimenFiles", () => {
  it("writes files into dir", async () => {
    const base = await tmp();
    await writeSpecimenFiles(base, { "a/b.txt": "x" });
    expect(await readFile(join(base, "a", "b.txt"), "utf8")).toBe("x");
  });

  it("throws on an escaping key and writes nothing outside dir", async () => {
    const base = await tmp();
    const outer = await tmp();
    const escapingKey = `../${outer.split(sep).pop()}/pwned.txt`;
    await expect(writeSpecimenFiles(base, { [escapingKey]: "x" })).rejects.toThrow(
      /path-traversal guard/,
    );
    expect(await readdir(outer)).toEqual([]);
  });
});
