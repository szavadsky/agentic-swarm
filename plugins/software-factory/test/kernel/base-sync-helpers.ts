import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { executeTaskAction } from "../../src/kernel/flow.js";
import type { KernelRuntime, TaskFile } from "../../src/kernel/types.js";
import type { TmpRepo } from "../helpers/tmp-repo.js";
import { outcome } from "./s2-helpers.js";

export function head(repo: TmpRepo, dir: string): string {
  return repo.git(["rev-parse", "HEAD"], { cwd: dir }).stdout.trim();
}

/** An integration commit, as the merge queue leaves one after a task lands. */
export function commitIn(
  repo: TmpRepo,
  dir: string,
  file: string,
  content: string,
  message: string,
): string {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), content, "utf8");
  repo.git(["add", "-A"], { cwd: dir });
  repo.git(["commit", "-m", message], { cwd: dir });
  return head(repo, dir);
}

/** Scripts one implemented-then-rejected alpha turn, leaving alpha parked. */
export function parkAlpha(
  harness: FakeHarness,
  file: string,
  content: string,
): void {
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, file), content, "utf8");
    ctx.writeOutcome(outcome({ summary: "alpha implemented" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(
      outcome({ summary: "alpha is not acceptable", verdict: "reject" }),
    );
    return fakeTurnResult(req);
  });
}

/**
 * Runs a continuation's implement turn the way dispatch would, without the
 * wave end: a test that inspects the park a turn produces must not also run the
 * wave-end steward, whose turn moves the branch the assertions name.
 */
export async function runImplementStep(
  runtime: KernelRuntime,
  file: TaskFile,
  iteration: number,
): Promise<void> {
  const state = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  ).tasks[file.slug];
  if (!state) throw new Error(`no derived state for ${file.slug}`);
  await executeTaskAction(
    runtime,
    file,
    { kind: "step", slug: file.slug, step: "implement", round: state.round },
    iteration,
    state,
  );
}
