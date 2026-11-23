#!/usr/bin/env bun
/**
 * `bootstrap/dispatch.sh`'s entry: the logic lives in
 * `src/cli/commands/bootstrap-dispatch.ts`; this file resolves the running
 * tree and exits with the run's code. Usage: bun scripts/bootstrap-dispatch.ts
 * <assignment> [model]
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  DispatchError,
  dispatchAssignment,
} from "../src/cli/commands/bootstrap-dispatch.js";

/** The git toplevel of the checkout this script runs from. */
function repoRoot(): string {
  const res = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: path.join(path.dirname(import.meta.path), ".."),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (res.status !== 0)
    throw new DispatchError("not inside a git repository", res.status ?? 1);
  return res.stdout.trim();
}

if (import.meta.main) {
  dispatchAssignment({
    root: repoRoot(),
    name: process.argv[2],
    model: process.argv[3],
  })
    .then((code) => process.exit(code))
    .catch((err) => {
      if (err instanceof DispatchError) {
        console.error(`dispatch: ${err.message}`);
        process.exit(err.exitCode);
      }
      console.error(`dispatch: ${(err as Error).message}`);
      process.exit(1);
    });
}
