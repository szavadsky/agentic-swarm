import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { z } from "zod";
import { KeyedMutex } from "../core/mutex.js";
import { writeYamlAtomic } from "../core/records/io.js";
import { issueText } from "./findings.js";
import { statedWaitMs } from "../harness/stated-wait.js";
import type { GoalPaths, RunConfig } from "./types.js";
import type { PoolReset, PoolResets, PoolCall } from "./quota-pools-types.js";
export type { PoolCall, PoolReset } from "./quota-pools-types.js";

/**
 * Minutes a pool stays skipped after a quota stop when neither the stop's
 * reset text nor the run config names a window. The harness contract carries a
 * provider reset only when the provider states one, so five hours is the
 * shortest common subscription window and the fallback.
 */
export const DEFAULT_POOL_RESET_MINUTES = 300;

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
 * `quota-pools.yaml` at the root of the machine's session store:
 * `<sessions.dir>/quota-pools.yaml`. Pool keys name subscriptions or
 * harness+model combinations, not goals, so one file carries every goal's
 * latch: a pool a goal exhausted is skipped by the next goal on this machine
 * and outlives the launch and the goal that recorded it.
 */
export function quotaPoolsPath(paths: Pick<GoalPaths, "sessionsDir">): string {
  return path.join(paths.sessionsDir, QUOTA_POOLS_FILE);
}

/** Serializes writers per file: two quota stops in one dispatch must not overwrite each other. */
const writes = new KeyedMutex();

/**
 * The machine's pool latches. A missing file is an empty set. A latch whose
 * reset already passed stays, because it means the pool's next call is its one
 * probe; only a served probe clears it.
 */
export async function loadPoolResets(
  paths: Pick<GoalPaths, "sessionsDir">,
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
    const findings = parsed.error.issues.map((issue) => issueText(issue));
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
    pools.set(pool, { resetAt });
  }
  return pools;
}

/**
 * True while the pool serves no one: its reset time is ahead, or a probe is in
 * flight. An unknown pool is available.
 */
export function poolExhausted(
  pools: ReadonlyMap<string, PoolReset>,
  pool: string,
  now = Date.now(),
): boolean {
  const stored = pools.get(pool);
  return (
    stored !== undefined && (stored.probing === true || stored.resetAt > now)
  );
}

/**
 * Decides one tier call for `pool`: a latch refuses it, and a latch whose
 * interval has passed yields exactly one probe. The claim lands in memory
 * before the call, so every other leg reads the pool as latched and the pool
 * is probed once per interval instead of by every turn that finds it due.
 */
export function takePoolCall(
  pools: PoolResets,
  pool: string,
  now = Date.now(),
): PoolCall {
  const stored = pools.get(pool);
  if (stored === undefined) return { kind: "free" };
  if (stored.probing === true || stored.resetAt > now)
    return { kind: "latched" };
  const claim: PoolReset = { resetAt: stored.resetAt, probing: true };
  pools.set(pool, claim);
  return { kind: "probe", claim };
}

/**
 * Settles a probe: a served probe clears the latch, an inconclusive one leaves
 * the pool due, and a quota stop has already replaced the claim with its own
 * reset. A later latch another leg stored is never dropped. Returns whether the
 * claim was still the pool's state.
 */
export function settlePoolProbe(
  pools: PoolResets,
  pool: string,
  claim: PoolReset,
  served: boolean,
): boolean {
  if (pools.get(pool) !== claim) return false;
  if (served) pools.delete(pool);
  else pools.set(pool, { resetAt: claim.resetAt });
  return true;
}

/**
 * The pool's retry interval in minutes: its `quota.perSubscription` entry when
 * the run config names one, else `quota.resetMinutes`, else the common
 * subscription window.
 */
export function poolResetMinutes(
  run: Pick<RunConfig, "quota">,
  pool: string,
): number {
  return (
    run.quota?.perSubscription?.[pool] ??
    run.quota?.resetMinutes ??
    DEFAULT_POOL_RESET_MINUTES
  );
}

/**
 * The reset time a quota stop stores: the provider's stated wait when the
 * stop text names one (`Resets in 130h19m23s` or `retry-after-ms=38240413`),
 * capped by `quota.maxResetMinutes` when the run config sets a cap; otherwise
 * the `pool`'s own interval from `quota.perSubscription`, or the run config's
 * `resetMinutes`. An unparseable text falls back like no text at all.
 */
export function poolResetAt(
  run: Pick<RunConfig, "quota">,
  now = Date.now(),
  resetText?: string,
  pool = "",
): number {
  const stated = statedWaitMs(resetText);
  if (stated !== undefined) {
    const cap = run.quota?.maxResetMinutes;
    const wait = cap === undefined ? stated : Math.min(stated, cap * 60_000);
    return now + wait;
  }
  return now + poolResetMinutes(run, pool) * 60_000;
}

/**
 * Latches `pool` until the later of any stored reset and `resetAt`, and returns
 * the stored value. A probe's claim is no reset evidence, so a quota answer
 * replaces it: a stated reset shorter than the interval wins. Synchronous, so a
 * reader sees the latch before any write.
 */
export function latchPool(
  pools: PoolResets,
  pool: string,
  resetAt: number,
): number {
  const stored = pools.get(pool);
  const next =
    stored === undefined || stored.probing === true
      ? resetAt
      : Math.max(stored.resetAt, resetAt);
  pools.set(pool, { resetAt: next });
  return next;
}

/**
 * Latches one pool and writes every latched pool, so a relaunch reads the same
 * set. The latch lands in memory before the file lock and the snapshot is taken
 * inside it, so an in-flight reader sees the pool dead without waiting for the
 * write, and concurrent stops keep each other's pool.
 */
export async function markPoolExhausted(opts: {
  paths: Pick<GoalPaths, "sessionsDir">;
  pools: PoolResets;
  pool: string;
  resetAt: number;
}): Promise<void> {
  latchPool(opts.pools, opts.pool, opts.resetAt);
  await writePoolResets(opts.paths, opts.pools);
}

/**
 * Writes the latch set so a relaunch or another goal reads the same pools. The
 * snapshot is taken inside the lock, so concurrent writers keep each other's
 * pools. A probe in flight keeps the reset the pool was latched with: another
 * launch reads the pool as due and takes its own probe.
 */
export async function writePoolResets(
  paths: Pick<GoalPaths, "sessionsDir">,
  pools: PoolResets,
): Promise<void> {
  const file = quotaPoolsPath(paths);
  await writes.runExclusive(file, async () => {
    const stored: Record<string, { resetAt: string }> = {};
    for (const [pool, latch] of pools) {
      stored[pool] = { resetAt: new Date(latch.resetAt).toISOString() };
    }
    await writeYamlAtomic(file, { pools: stored });
  });
}
