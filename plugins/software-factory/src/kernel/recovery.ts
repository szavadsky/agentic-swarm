import path from "node:path";
import { backfillSummaries } from "./summary.js";
import type { ArtifactStore, KernelRuntime } from "./types.js";
import { prepareIntegrationCheckout } from "./worktree.js";

interface SettledRecords {
  closed: number;
}

/**
 * A record directory with `started.yaml` and no `end.yaml` is a turn cut off by
 * the process dying. Close it as a bare `infra: crash` with no cause, details,
 * usage, prompt bytes or outcome. Repeat rule: the bare seal is a free
 * interruption, redispatched like an orphan — the count is by step, not by
 * actor, so only a crash the turn itself reported (cause, details, usage or
 * prompt bytes, from harness or script) counts as a turn and parks
 * `infra-repeat` after two repeats on the same step. Never invent an outcome,
 * usage or commit. Still free: quota/rate/network/auth/overflow/glitch stops
 * and drain (tasks never started). Every record that already has `end.yaml`
 * is sealed too, so history written before records were read-only becomes
 * sealed as well. An interrupted agent turn's worktree is kept: the sweep
 * removes terminal tasks only, so the relaunch continues that turn in the
 * tree it was already working in.
 */
async function settleRecords(store: ArtifactStore): Promise<SettledRecords> {
  let closed = 0;
  for (const dir of await store.records.dirs()) {
    if (!dir.started) continue;
    if (dir.ended) {
      await store.records.seal(dir.name);
      continue;
    }
    await store.records.close(dir.name, {
      stop: { kind: "infra", cause: "crash" },
      ok: false,
    });
    closed += 1;
  }
  return { closed };
}

/**
 * Startup recovery under the goal lock: orphan records first, then the stable
 * checkout (removes stale task worktrees, keeps an interrupted agent turn's
 * tree, resets a half-finished merge) and the summaries missing from
 * iterations that were killed.
 */
export async function recoverLaunch(runtime: KernelRuntime): Promise<number> {
  const settled = await settleRecords(runtime.store);
  await prepareIntegrationCheckout(runtime);
  await backfillSummaries(runtime);
  if (settled.closed > 0)
    console.warn(
      `[factory] recovery closed ${settled.closed} interrupted record(s) as infra: crash`,
    );
  return settled.closed;
}
