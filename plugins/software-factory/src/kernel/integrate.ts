import { git } from "../core/git/exec.js";
import { commitAll } from "../core/git/commit.js";
import { runGates } from "./gates.js";
import { appendChecks, appendPark, scriptMeta } from "./record.js";
import { taskBranchName } from "./worktree.js";
import type { KernelRuntime, TaskFile } from "./types.js";

async function checkoutClean(runtime: KernelRuntime): Promise<void> {
  await git(runtime.paths.goalCheckout, ["reset", "--hard", "HEAD"], { allowFail: true });
  await git(runtime.paths.goalCheckout, ["clean", "-fd"], { allowFail: true });
}

/**
 * Serial squash-merge onto the integration branch: apply the task diff in the
 * goal checkout, gate the merged result, then commit. A red merge is taken
 * back out and parked with its evidence; S2 adds the one fix round.
 */
export async function mergeTask(
  runtime: KernelRuntime,
  task: TaskFile,
  iteration: number,
  round: number
): Promise<void> {
  const branch = taskBranchName(runtime, task.slug);
  const checkout = runtime.paths.goalCheckout;
  const records = await runtime.store.listRecords();
  if (records.some((r) => r.slug === task.slug && r.step === "merge" && r.ok === true)) return;
  await checkoutClean(runtime);

  const base = records
    .filter((r) => r.slug === task.slug && r.step === "implement" && r.base)
    .sort((a, b) => a.seq - b.seq)[0]?.base;
  const ahead = base
    ? Number((await git(checkout, ["rev-list", "--count", `${base}..${branch}`], { allowFail: true })).stdout.trim() || 0)
    : 0;

  const merge = await git(checkout, ["merge", "--squash", branch], { allowFail: true });
  if (merge.code !== 0) {
    await checkoutClean(runtime);
    const cause = `merge conflict with the integration head: ${merge.stderr.trim().slice(-500)}`;
    await storeMerge(runtime, task, iteration, round, false, cause);
    await appendPark(runtime.store, { iteration, slug: task.slug, round }, cause);
    return;
  }

  const checks = await runGates(runtime, checkout);
  await appendChecks(runtime.store, { iteration, slug: task.slug, round }, checks);
  const red = checks.filter((c) => !c.ok);
  if (red.length > 0) {
    await checkoutClean(runtime);
    const cause = `merged-result gates failed: ${red.map((c) => c.name).join(", ")}`;
    await storeMerge(runtime, task, iteration, round, false, cause);
    await appendPark(runtime.store, { iteration, slug: task.slug, round }, cause);
    return;
  }

  const staged = await git(checkout, ["diff", "--cached", "--quiet"], { allowFail: true });
  if (staged.code === 0) {
    // A crash after the merge commit but before its record must not duplicate
    // or park the merge: the branch may still carry work already integrated.
    await checkoutClean(runtime);
    if (ahead === 0) {
      const cause = "task branch has no commits since dispatch";
      await storeMerge(runtime, task, iteration, round, false, cause);
      await appendPark(runtime.store, { iteration, slug: task.slug, round }, cause);
      return;
    }
    const head = (await git(checkout, ["rev-parse", "HEAD"])).stdout.trim();
    await storeMerge(runtime, task, iteration, round, true, undefined, head);
    return;
  }
  const commit = await commitAll(runtime.repo, checkout, `factory: merge ${task.slug}`);
  if (!commit) {
    await storeMerge(runtime, task, iteration, round, false, "squash merge produced no changes");
    await appendPark(runtime.store, { iteration, slug: task.slug, round }, "squash merge produced no changes");
    return;
  }
  await storeMerge(runtime, task, iteration, round, true, undefined, commit);
}

async function storeMerge(
  runtime: KernelRuntime,
  task: TaskFile,
  iteration: number,
  round: number,
  ok: boolean,
  cause?: string,
  commit?: string
): Promise<void> {
  await runtime.store.appendRecord(scriptMeta(iteration, "merge", { slug: task.slug, round }), {
    ok,
    commit,
    cause,
  });
}
