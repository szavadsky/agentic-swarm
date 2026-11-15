import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
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
