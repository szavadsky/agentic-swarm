#!/usr/bin/env bun
/**
 * `bootstrap/promote.sh`'s entry: the logic lives in
 * `src/cli/commands/promote.ts`; this file resolves the running tree and
 * exits with promote's code. Usage: bun scripts/promote.ts [rev]
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { PromoteError, promotePin } from "../src/cli/commands/promote.js";

/** The git toplevel of the checkout this script runs from. */
function main(): number {
  const res = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: path.join(path.dirname(import.meta.path), ".."),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (res.status !== 0)
    throw new PromoteError("not inside a git repository", res.status ?? 1);
  const repo = res.stdout.trim();
  return promotePin({ repo, rev: process.argv[2] });
}

if (import.meta.main) {
  try {
    process.exit(main());
  } catch (err) {
    if (err instanceof PromoteError) {
      console.error(`promote: ${err.message}`);
      process.exit(err.exitCode);
    }
    console.error(`promote: ${(err as Error).message}`);
    process.exit(1);
  }
}
