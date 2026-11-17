import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import {
  type FakeTurnHandler,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { holdsDir } from "../../src/kernel/mailbox.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import { outcome } from "./s2-helpers.js";

export const PLAN = `# Milestone 1 — files

## alpha
Create alpha.txt.

## beta
Create beta.txt after alpha.

## delta
Create delta.txt.

## gamma
Create gamma.txt.
`;

export function writePlan(runtime: KernelRuntime): void {
  fs.writeFileSync(path.join(runtime.store.goalDir, "plan.md"), PLAN, "utf8");
}

/** The delivery guard needs a plan edit behind every architect continue. */
export function editPlan(runtime: KernelRuntime): void {
  fs.appendFileSync(
    path.join(runtime.store.goalDir, "plan.md"),
    "\n## architect edit\n",
    "utf8",
  );
}

export function writeHold(
  runtime: KernelRuntime,
  steer: string,
  slugs: string[],
  goal = false,
): void {
  const dir = holdsDir(runtime.store);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${steer}.yaml`),
    yaml.stringify({ slugs, goal }),
    "utf8",
  );
}

export async function tasks(runtime: KernelRuntime) {
  return derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );
}

export function implementer(
  file: string,
  before?: (cwd: string) => Promise<void> | void,
): FakeTurnHandler {
  return async (req, ctx) => {
    await before?.(req.cwd!);
    fs.writeFileSync(path.join(req.cwd!, file), `${file}\n`, "utf8");
    ctx.writeOutcome(outcome({ summary: `${file} implemented` }));
    return fakeTurnResult(req);
  };
}

export function approver(summary: string): FakeTurnHandler {
  return (req, ctx) => {
    ctx.writeOutcome(outcome({ summary, verdict: "approve" }));
    return fakeTurnResult(req);
  };
}
