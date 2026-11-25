/**
 * Whether a relaunch may resume the iteration its predecessor left running:
 * hold readability, the steer/hold verdict, and the three iteration budgets
 * that follow a drain. The goal loop uses the answer; the helpers here never
 * append iteration records themselves.
 */
import { iterationSpend, iterationStart, settledTurns } from "./dispatch.js";
import {
  collectSteerRoutes,
  isArchitectRoute,
  readHolds,
  scanInbox,
} from "./mailbox.js";
import type { GoalRun } from "./launch-run.js";
import { loadPriceTable } from "./openrouter.js";
import { resumeVerdict } from "./resume.js";
import type { KernelRuntime, State, StepRecord } from "./types.js";
import type { ResumeGate } from "./launch-resume-types.js";

/**
 * Holds decide which ready work is runnable, so a hold read that fails refuses
 * resume instead of guessing the runnable set.
 */
async function readResumeHolds(
  runtime: KernelRuntime,
  before: State,
): Promise<ResumeGate> {
  try {
    const read = await readHolds(runtime.store, {
      knownSlugs: Object.keys(before.tasks),
    });
    const malformed = read.findings.filter((f) => f.kind === "malformed");
    if (malformed.length > 0) {
      return {
        holds: read.holds,
        refusal: `unreadable hold file: ${malformed.map((f) => `${f.file} (${f.reason})`).join("; ")}`,
      };
    }
    return { holds: read.holds };
  } catch (err) {
    return {
      holds: [],
      refusal: `holds could not be read: ${(err as Error).message}`,
    };
  }
}

/** The first spent iteration budget, in the order resume reports it. */
async function budgetRefusal(
  runtime: KernelRuntime,
  records: StepRecord[],
  iteration: number,
): Promise<string | undefined> {
  const { limits } = runtime;
  if (limits.iterationTurns !== undefined) {
    const used = settledTurns(records, iteration);
    if (used >= limits.iterationTurns) {
      return `iteration turn budget spent (${used} of ${limits.iterationTurns})`;
    }
  }
  if (limits.iterationUsd !== undefined) {
    const spent = iterationSpend(
      records,
      iteration,
      await loadPriceTable(runtime.priceSource),
      runtime.configs.run.priceIds,
    );
    if (spent >= limits.iterationUsd) {
      return `iteration USD budget spent (${spent} of ${limits.iterationUsd})`;
    }
  }
  if (limits.iterationWallMs !== undefined) {
    const elapsed = Date.now() - iterationStart(records, iteration);
    if (elapsed >= limits.iterationWallMs) {
      return `iteration wall budget spent (${elapsed}ms of ${limits.iterationWallMs}ms)`;
    }
  }
  return undefined;
}

/**
 * Why a relaunch into an interrupted iteration must not resume it, or
 * undefined when it may. Brakes follow the drain that stopped the previous
 * run; the boundary is their only resolver.
 */
export async function resumeGate(
  runtime: KernelRuntime,
  before: State,
  records: StepRecord[],
): Promise<ResumeGate> {
  const read = await readResumeHolds(runtime, before);
  if (read.refusal !== undefined) return read;
  const { holds } = read;
  const pendingSteers = new Set(
    (await scanInbox(runtime.store)).map((s) => s.id),
  );
  const verdict = resumeVerdict(
    before,
    records,
    holds,
    pendingSteers,
    runtime.limits,
  );
  if (!verdict.resume) return { holds, refusal: verdict.cause };
  if (holds.some((h) => h.goal === true && pendingSteers.has(h.steer))) {
    return { holds, refusal: "a pending steer holds the goal" };
  }
  const refusal = await budgetRefusal(runtime, records, before.iteration);
  return refusal === undefined ? { holds } : { holds, refusal };
}

/**
 * Whether this launch recovered a turn the dying process left open. The
 * relaunch continues that turn in its own worktree; it runs no digest and
 * posts no digest steer to the PM, because the evidence is the turn itself.
 */
export function interruptedRelaunch(run: GoalRun): boolean {
  return run.recoveredRecords > 0;
}

export async function processedSteers(
  store: KernelRuntime["store"],
): Promise<number> {
  return (await store.mailbox.files("processed")).length;
}

/**
 * A blocked goal is not final while a steer is waiting: the architect boundary
 * is the only steer consumer, so the next launch must resume instead of
 * stopping on the goal decision that ended the previous one.
 */
export async function steersWaiting(
  store: KernelRuntime["store"],
): Promise<boolean> {
  return (await scanInbox(store)).length > 0;
}

/**
 * A pending steer a PM turn already routed to the architect (directly, through
 * the intent agent or via a stall) has no other consumer. A resumed pass never runs a front turn, so
 * without the boundary that route would wait for a consult the launch does not
 * reach.
 */
export async function architectRouteWaiting(
  store: KernelRuntime["store"],
): Promise<boolean> {
  const pending = await scanInbox(store);
  if (pending.length === 0) return false;
  const routes = collectSteerRoutes(await store.listRecords());
  return pending.some((steer) => {
    const route = routes.get(steer.id)?.route;
    return (
      route !== undefined &&
      (route === "intent" || isArchitectRoute(route) || route === "stall")
    );
  });
}
