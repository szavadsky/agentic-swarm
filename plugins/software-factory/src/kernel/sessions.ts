import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { SessionRef } from "../harness/types.js";
import { writeYamlAtomic } from "../core/records/io.js";

export interface LaunchSessions {
  launchId: string;
  dir: string;
}

function stamp(now: Date): string {
  return now.toISOString().replace(/[-:.]/g, "");
}

/** Sortable launch id; the random suffix separates two launches in one millisecond. */
export function newLaunchId(now = new Date()): string {
  return `${stamp(now)}-${crypto.randomBytes(3).toString("hex")}`;
}
/** Cache lifetime per retention tier: the 5-minute provider window, or 1 hour when long. */
export const SESSION_CACHE_TTLS_MS = {
  short: 5 * 60_000,
  long: 60 * 60_000,
} as const;

/**
 * True while the session's cached prefix is still hot: a compaction now reads
 * the transcript at cache-read price. The stamp is the last model-stream
 * activity (or the turn's end when none arrived), not the turn's start: a long
 * turn refreshes the cache as it runs. A cold compaction costs full input
 * price — as much as the cold resume it was meant to avoid — so the kernel
 * skips it and keeps the uncompacted ref.
 */
export function sessionCacheHot(
  session: Pick<SessionRef, "lastRequestStartedAt" | "retentionTier">,
  now: Date = new Date(),
): boolean {
  const lastRequest = Date.parse(session.lastRequestStartedAt);
  if (!Number.isFinite(lastRequest)) return false;
  return (
    now.getTime() - lastRequest < SESSION_CACHE_TTLS_MS[session.retentionTier]
  );
}

async function directories(dir: string): Promise<string[]> {
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

/**
 * `<sessions.dir>/<goal>/<launch-id>/`, newest first, only the last `keepRuns`
 * kept. A marker records which launch owns the transcripts and raw agent I/O.
 */
export async function createLaunchSessions(
  sessionsRoot: string,
  goal: string,
  keepRuns: number,
  meta: { repo: string; now?: Date },
): Promise<LaunchSessions> {
  const now = meta.now ?? new Date();
  const launchId = newLaunchId(now);
  const goalRoot = path.join(sessionsRoot, goal);
  const dir = path.join(goalRoot, launchId);
  await fs.promises.mkdir(dir, { recursive: true });
  await writeYamlAtomic(path.join(dir, "launch.yaml"), {
    launchId,
    goal,
    repo: meta.repo,
    pid: process.pid,
    startedAt: now.toISOString(),
  });

  const names = (await directories(goalRoot)).sort().reverse();
  for (const name of names.slice(Math.max(1, keepRuns))) {
    await fs.promises.rm(path.join(goalRoot, name), {
      recursive: true,
      force: true,
    });
  }
  return { launchId, dir };
}
