#!/usr/bin/env node
// `npx stz` / `stz` entrypoint.
//
// Two modes, in this order:
//
//  1. **Published package** — `dist/cli.js` exists (built by `npm run build`,
//     which `prepublishOnly` enforces). Imported directly in THIS process: no
//     subprocess, no `npx`, no network, no `tsx`. A fresh environment needs
//     nothing but Node 20+.
//  2. **Source checkout** — no `dist/`, so fall back to running the TypeScript
//     entry through `tsx`. This keeps `git clone && npx stz …` working with no
//     build step, which is how the source-available template repo is used.
//
// The fallback is why `tsx` did not disappear entirely — it moved to
// devDependencies. It is a contributor tool, not a runtime dependency of the
// shipped package.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const built = join(here, "..", "dist", "cli.js");

if (existsSync(built)) {
  // In-process: the CLI reads process.argv itself and sets its own exit code.
  // Spawning here would add startup latency and a second process whose signals
  // we would then have to forward.
  await import(pathToFileURL(built).href);
} else {
  const { spawnSync } = await import("node:child_process");
  const cli = join(here, "..", "src", "cli.ts");
  const r = spawnSync("npx", ["tsx", cli, ...process.argv.slice(2)], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  process.exit(r.status ?? 1);
}
