import fs from "node:fs";
import path from "node:path";
import { writeYamlAtomic } from "../core/records/io.js";
import { backfillSummaries } from "./summary.js";
import { prepareIntegrationCheckout } from "./worktree.js";
import type { ArtifactStore, KernelRuntime } from "./types.js";

/**
 * A record directory with `started.yaml` and no `end.yaml` is a turn cut off by
 * the process dying. Close it as `infra: crash`; `derive` then ignores it and
 * redispatches the same step. Never invent an outcome, usage or commit.
 */
export async function closeInterruptedRecords(store: ArtifactStore): Promise<number> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(store.recordsDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw err;
  }
  let closed = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(store.recordsDir, entry.name);
    if (!fs.existsSync(path.join(dir, "started.yaml"))) continue;
    if (fs.existsSync(path.join(dir, "end.yaml"))) continue;
    await writeYamlAtomic(path.join(dir, "end.yaml"), {
      stop: { kind: "infra", cause: "crash" },
      ok: false,
      endedAt: new Date().toISOString(),
    });
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
  const closed = await closeInterruptedRecords(runtime.store);
  await prepareIntegrationCheckout(runtime);
  await backfillSummaries(runtime);
  if (closed > 0) console.warn(`[factory] recovery closed ${closed} interrupted record(s) as infra: crash`);
  return closed;
}
