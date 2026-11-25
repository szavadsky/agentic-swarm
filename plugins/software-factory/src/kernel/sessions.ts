import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  type CacheTtl,
  type Harness,
  type ModelRef,
  portable,
  type SessionRef,
} from "../harness/types.js";
import { writeYamlAtomic } from "../core/records/io.js";
import type { Steer } from "./mailbox.js";
import type { KernelRuntime } from "./types.js";
import type { LaunchSessions, LiveSteerSink } from "./sessions-types.js";

function stamp(now: Date): string {
  return now.toISOString().replace(/[-:.]/g, "");
}

/** Sortable launch id; the random suffix separates two launches in one millisecond. */
export function newLaunchId(now = new Date()): string {
  return `${stamp(now)}-${crypto.randomBytes(3).toString("hex")}`;
}
/** Cache lifetime per retention tier: the 5-minute provider window, or 1 hour when long. */
const SESSION_CACHE_TTLS_MS: Partial<Record<CacheTtl, number>> = {
  short: 5 * 60_000,
  long: 60 * 60_000,
};

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
  const ttl = SESSION_CACHE_TTLS_MS[session.retentionTier];
  if (ttl === undefined) return false;
  const lastRequest = Date.parse(session.lastRequestStartedAt);
  if (!Number.isFinite(lastRequest)) return false;
  return now.getTime() - lastRequest < ttl;
}

/**
 * The ref when this target can resume it, or undefined with the blocker named.
 * Resume needs the harness's capability, a portability edge, the same checkout
 * and the same model: a harness session is cwd- and model-bound.
 */
export async function resumableRef(
  runtime: KernelRuntime,
  session: SessionRef,
  target: { harness: Harness; model: ModelRef },
  who: string,
): Promise<SessionRef | undefined> {
  const { harness, model } = target;
  const miss = (reason: string): undefined => {
    console.warn(`[factory] ${who} starts de novo: ${reason}`);
    return undefined;
  };
  let resume: boolean;
  try {
    resume = (await harness.caps(model)).resume;
  } catch (err) {
    return miss(
      `harness "${harness.id}" did not report its capabilities: ${(err as Error).message}`,
    );
  }
  if (!resume) return miss(`harness "${harness.id}" cannot resume a session`);
  if (!portable(session.harness, harness.id, runtime.configs.run.portability))
    return miss(
      `a "${session.harness}" session is not portable to "${harness.id}"`,
    );
  if (path.resolve(session.cwd) !== path.resolve(runtime.paths.goalCheckout))
    return miss(
      `session cwd "${session.cwd}" is not the goal checkout "${runtime.paths.goalCheckout}"`,
    );
  if (session.model.id !== model.id)
    return miss(`session model "${session.model.id}" is not "${model.id}"`);
  return session;
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

/**
 * The one live session a steer can be injected into. The inbox watch offers
 * each due steer here before waking the dispatch loop: a delivered steer is
 * answered by the running turn, and the watch wakes the loop only when no
 * session is live — that steer then queues for its own PM turn. One sink at a
 * time is the one-PM invariant, so a second registration is a kernel bug.
 */
export class LiveSteerSessions {
  private sink: LiveSteerSink | undefined;

  /** Registers the live turn; the release clears only its own sink. */
  register(sink: LiveSteerSink): () => void {
    if (this.sink !== undefined) {
      throw new Error(
        "a live steer session is already registered; only one PM turn runs at a time",
      );
    }
    this.sink = sink;
    return () => {
      if (this.sink === sink) this.sink = undefined;
    };
  }

  /** True when the steer reached the live session, false when it must queue. */
  async inject(steer: Steer): Promise<boolean> {
    const sink = this.sink;
    if (sink === undefined) return false;
    try {
      return await sink.inject(steer);
    } catch (error) {
      // Injection is best effort: a harness that refuses it must not lose the
      // steer, so the watch announces it for the next PM turn instead.
      console.warn(
        `[factory] steer "${steer.id}" not injected into the live session: ${(error as Error).message}; queued for its next PM turn`,
      );
      return false;
    }
  }
}
