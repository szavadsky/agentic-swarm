import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { z } from "zod";
import { KeyedMutex } from "../core/mutex.js";
import { writeYamlAtomic } from "../core/records/io.js";
import type { GoalPaths, RunConfig } from "./types.js";

/** Pool key -> epoch ms at which the pool may serve again. */
export type PoolResets = Map<string, number>;

/**
 * Minutes a pool stays skipped after a quota stop when neither the stop's
 * reset text nor the run config names a window. The harness contract carries a
 * provider reset only when the provider states one, so five hours is the
 * shortest common subscription window and the fallback.
 */
export const DEFAULT_POOL_RESET_MINUTES = 300;

/** "Resets in 130h19m23s" / "Resets in 33m53s": the provider's stated window. */
const RESET_TEXT =
  /resets?\s+in\s+(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m)?/i;

const QUOTA_POOLS_FILE = "quota-pools.yaml";

const poolsFileSchema = z
  .object({
    pools: z.record(
      z.string(),
      z.object({ resetAt: z.string().min(1) }).strict(),
    ),
  })
  .strict();

/** A `quota-pools.yaml` the session store cannot read. */
export class QuotaPoolsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaPoolsError";
  }
}

/**
 * `quota-pools.yaml` beside the launch directories in the goal's session
 * store: `<sessions.dir>/<goal>/`. Launch rotation only removes directories,
 * so a pool's reset outlives the launch that recorded it.
 */
export function quotaPoolsPath(
  paths: Pick<GoalPaths, "sessionsDir" | "goalDir">,
): string {
  return path.join(
    paths.sessionsDir,
    path.basename(paths.goalDir),
    QUOTA_POOLS_FILE,
  );
}

/** Serializes writers per file: two quota stops in one dispatch must not overwrite each other. */
const writes = new KeyedMutex();

/**
 * The session store's pool resets, with the ones already past dropped. A
 * missing file is an empty set: the first launch of a goal has no history.
 */
export async function loadPoolResets(
  paths: Pick<GoalPaths, "sessionsDir" | "goalDir">,
  now = Date.now(),
): Promise<PoolResets> {
  const file = quotaPoolsPath(paths);
  let text: string;
  try {
    text = await fs.promises.readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return new Map();
    throw err;
  }
  let raw: unknown;
  try {
    raw = yaml.parse(text);
  } catch (err) {
    throw new QuotaPoolsError(
      `${file} is not valid YAML: ${(err as Error).message}`,
    );
  }
  const parsed = poolsFileSchema.safeParse(raw);
  if (!parsed.success) {
    const findings = parsed.error.issues.map(
      (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
    );
    throw new QuotaPoolsError(`${file} is invalid: ${findings.join("; ")}`);
  }
  const pools: PoolResets = new Map();
  for (const [pool, entry] of Object.entries(parsed.data.pools)) {
    const resetAt = Date.parse(entry.resetAt);
    if (!Number.isFinite(resetAt)) {
      throw new QuotaPoolsError(
        `${file}: pool "${pool}" has an unreadable resetAt "${entry.resetAt}"`,
      );
    }
    if (resetAt > now) pools.set(pool, resetAt);
  }
  return pools;
}

/** True while the pool's stored reset time is ahead; an unknown pool is available. */
export function poolExhausted(
  pools: ReadonlyMap<string, number>,
  pool: string,
  now = Date.now(),
): boolean {
  const resetAt = pools.get(pool);
  return resetAt !== undefined && resetAt > now;
}

/**
 * The reset time a quota stop stores: the provider's stated window when the
 * stop text names one, capped by `quota.maxResetMinutes` when the run config
 * sets a cap; otherwise the run config's `resetMinutes`. An unparseable text
 * falls back like no text at all.
 */
export function poolResetAt(
  run: Pick<RunConfig, "quota">,
  now = Date.now(),
  resetText?: string,
): number {
  const stated = resetMinutesFromText(resetText);
  if (stated !== undefined) {
    const cap = run.quota?.maxResetMinutes;
    const minutes = cap === undefined ? stated : Math.min(stated, cap);
    return now + minutes * 60_000;
  }
  const minutes = run.quota?.resetMinutes ?? DEFAULT_POOL_RESET_MINUTES;
  return now + minutes * 60_000;
}

/** The provider's stated reset in minutes; undefined when the text names none. */
function resetMinutesFromText(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const match = RESET_TEXT.exec(text);
  if (!match) return undefined;
  const hours = match[1] === undefined ? 0 : Number(match[1]);
  const minutes = match[2] === undefined ? 0 : Number(match[2]);
  const total = hours * 60 + minutes;
  return Number.isFinite(total) && total > 0 ? total : undefined;
}

/**
 * Latches one pool until `resetAt` and writes every latched pool, so a
 * relaunch reads the same set. The snapshot is taken inside the lock, after
 * the latch, so concurrent stops keep each other's pool.
 */
export async function markPoolExhausted(opts: {
  paths: Pick<GoalPaths, "sessionsDir" | "goalDir">;
  pools: PoolResets;
  pool: string;
  resetAt: number;
}): Promise<void> {
  const file = quotaPoolsPath(opts.paths);
  await writes.runExclusive(file, async () => {
    opts.pools.set(opts.pool, opts.resetAt);
    const pools: Record<string, { resetAt: string }> = {};
    for (const [pool, resetAt] of opts.pools) {
      pools[pool] = { resetAt: new Date(resetAt).toISOString() };
    }
    await writeYamlAtomic(file, { pools });
  });
}
