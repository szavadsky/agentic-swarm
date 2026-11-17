import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { executeTaskAction } from "../../src/kernel/flow.js";
import type {
  Action,
  KernelRuntime,
  TaskFile,
} from "../../src/kernel/types.js";
import type { TmpRepo } from "../helpers/tmp-repo.js";
import { outcome } from "./s2-helpers.js";

let counterSeq = 0;

/** Unique flag file a flake gate toggles; outside every worktree. */
export function freshCounter(): string {
  counterSeq += 1;
  return path.join(os.tmpdir(), `kept-land-flake-${process.pid}-${counterSeq}`);
}

export function rmCounter(counter: string): void {
  if (fs.existsSync(counter)) fs.rmSync(counter, { force: true });
}

/**
 * A gate that stays green on task branches and runs `body` only in merge
 * scratch, where HEAD is the squash commit. Lets a test park on a red
 * merged result and decide what the boundary re-run sees.
 */
export function mergeOnlyGate(slug: string, body: string): string {
  return `if git log -1 --format=%s | grep -q "^factory: merge ${slug}$"; then ${body}; fi; exit 0`;
}

/**
 * A merge-gate body that reds the first `reds` merge runs, then stays
 * green.
 */
export function flakeRedTimes(counter: string, reds: number): string {
  return `n=$(cat "${counter}" 2>/dev/null || echo 0); if [ "$n" -lt ${reds} ]; then echo $((n + 1)) > "${counter}"; echo flake-red-$n; exit 1; fi; exit 0`;
}

/**
 * A merge-gate body that reds the two dispatch merge runs, then stays
 * green. Dispatch allows one gate fix: the first red sends the fix, the
 * second parks, and the boundary re-run sees green. A single red no longer
 * parks — a deferred empty fix with green checks carries on to merge.
 */
export function flakeRedTwice(counter: string): string {
  return flakeRedTimes(counter, 2);
}

export function planFor(slugs: string[]): string {
  return `# Milestone 1\n\n${slugs.map((slug) => `## ${slug}\nDo ${slug}.\n`).join("\n")}`;
}

export function writePlan(runtime: KernelRuntime, slugs: string[]): void {
  fs.writeFileSync(
    path.join(runtime.store.goalDir, "plan.md"),
    planFor(slugs),
    "utf8",
  );
}

export function scriptContinueBoundary(
  harness: FakeHarness,
  runtime: KernelRuntime,
): void {
  harness.script((req, ctx) => {
    fs.appendFileSync(
      path.join(runtime.store.goalDir, "plan.md"),
      "\n## architect edit\n",
      "utf8",
    );
    ctx.writeOutcome(outcome({ summary: "continue", decision: "continue" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "tasks unchanged" }));
    return fakeTurnResult(req);
  });
}

export async function stateOf(runtime: KernelRuntime) {
  return derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );
}

export function scriptImplementApprove(
  harness: FakeHarness,
  file: string,
  content: string,
): void {
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, file), content, "utf8");
    ctx.writeOutcome(outcome({ summary: "implemented" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });
}

/**
 * Runs the task's scripted steps, then lands a concurrent commit: the head
 * moves after the branch checks ran, so the squash tree differs from the
 * checked tree and the merge gates run instead of being skipped. The landing
 * happens between turns: a commit during a turn is a containment refusal.
 */
export async function implementThenLand(
  runtime: KernelRuntime,
  file: TaskFile,
  steps: string[],
  repo: TmpRepo,
): Promise<void> {
  for (const step of steps) {
    const state = await stateOf(runtime);
    const action: Action = { kind: "step", slug: file.slug, step, round: 1 };
    await executeTaskAction(runtime, file, action, 1, state.tasks[file.slug]!);
  }
  const checkout = runtime.paths.goalCheckout;
  fs.writeFileSync(
    path.join(checkout, "concurrent.txt"),
    "concurrent.txt\n",
    "utf8",
  );
  repo.git(["add", "concurrent.txt"], { cwd: checkout });
  repo.git(["commit", "-m", "concurrent landing"], { cwd: checkout });
}
