import fs from "node:fs";
import path from "node:path";
import { writeYamlAtomic } from "../core/records/io.js";
import { sealRecord } from "./store.js";
import { backfillSummaries } from "./summary.js";
import type { ArtifactStore, KernelRuntime } from "./types.js";
import { prepareIntegrationCheckout } from "./worktree.js";

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
 * sealed as well.
 */
async function settleRecords(store: ArtifactStore): Promise<number> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(store.recordsDir, {
      withFileTypes: true,
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw err;
  }
  let closed = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(store.recordsDir, entry.name);
    if (!fs.existsSync(path.join(dir, "started.yaml"))) continue;
    if (fs.existsSync(path.join(dir, "end.yaml"))) {
      await sealRecord(dir);
      continue;
    }
    await writeYamlAtomic(path.join(dir, "end.yaml"), {
      stop: { kind: "infra", cause: "crash" },
      ok: false,
      endedAt: new Date().toISOString(),
    });
    await sealRecord(dir);
    closed += 1;
  }
  return closed;
}

/**
 * Startup recovery under the goal lock: orphan records first, then the stable
 * checkout (removes stale task worktrees, resets a half-finished merge) and the
 * summaries missing from iterations that were killed.
 */
export async function recoverLaunch(runtime: KernelRuntime): Promise<number> {
  const closed = await settleRecords(runtime.store);
  await prepareIntegrationCheckout(runtime);
  await backfillSummaries(runtime);
  if (closed > 0)
    console.warn(
      `[factory] recovery closed ${closed} interrupted record(s) as infra: crash`,
    );
  return closed;
}
