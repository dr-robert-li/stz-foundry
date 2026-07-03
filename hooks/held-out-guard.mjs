#!/usr/bin/env node
/**
 * PreToolUse ownership guard for the sealed held-out tree (#2).
 *
 * The orchestration half is prose: specimen/test-author/cross-reference work is
 * markdown run by an LLM, and "don't delete a sibling's files" is a prompt rule
 * a model can violate — which is exactly how a test-author respawn once deleted
 * the cross-reference's `held-out/reference-b/`. `seal-verify` DETECTS that
 * drift after the fact; this hook PREVENTS it, in code, before the tool runs.
 *
 * Rule: deny any Bash tool call that destroys or moves-away a path under
 * `.stz/30-tests/held-out/`. The held-out suite and its reference dirs are only
 * ever WRITTEN fresh by their owning agent (via the Write tool, which this hook
 * leaves alone) — no agent legitimately `rm`/`mv`/truncates them. The one
 * sanctioned post-freeze change is the bridge `seal-amend` command, which this
 * hook also allows. Everything else touching held-out destructively is blocked.
 *
 * Claude Code contract: read the tool payload on stdin; exit 0 to allow, exit 2
 * to BLOCK (stderr is shown to the model). Fail-open on any parse error — a
 * broken guard must never wedge the session (seal-verify remains the backstop).
 */
import { readFileSync } from "node:fs";

const HELD_OUT = "30-tests/held-out";
/** Destructive verbs that must never target the sealed tree. */
const DESTRUCTIVE = /\b(rm|rmdir|unlink|shred|truncate)\b|\bfind\b[^|;&]*-delete|\bmv\b/;
/** A `>`/`>>` redirect writing INTO held-out truncates/overwrites a sealed file. */
const REDIRECT_INTO = />>?\s*[^|;&]*30-tests\/held-out/;
/** The one sanctioned mutation path — the bridge amend command is allowed. */
const SANCTIONED = /\bseal-amend\b/;

function read() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

const payload = read();
if (!payload) process.exit(0); // fail-open

const tool = payload.tool_name ?? payload.toolName ?? "";
const input = payload.tool_input ?? payload.toolInput ?? {};

// Only shell commands are guarded; Write/Edit creating fresh files is fine.
if (tool !== "Bash") process.exit(0);
const cmd = String(input.command ?? "");

const touchesHeldOut = cmd.includes(HELD_OUT);
if (!touchesHeldOut || SANCTIONED.test(cmd)) process.exit(0);

if (DESTRUCTIVE.test(cmd) || REDIRECT_INTO.test(cmd)) {
  process.stderr.write(
    "BLOCKED by STZ held-out ownership guard: this command deletes, moves, or truncates a path under " +
      ".stz/30-tests/held-out/ — the sealed suite and its reference implementations. Those files are " +
      "written once by their owning agent and never removed by a sibling. If a prior round left a stale " +
      "reference dir, leave it: `seal`/`seal-verify` reconcile it, and the one sanctioned post-freeze " +
      "change is `stz bridge seal-amend --reason ...`. Do NOT rm/mv/truncate the held-out tree.\n",
  );
  process.exit(2);
}
process.exit(0);
