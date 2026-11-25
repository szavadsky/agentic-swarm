/**
 * The turn's wall-clock account: a harness turn that outlives the wall bound
 * keeps running after the agent's race synthesizes its timeout result, so the
 * tracker sees the orphan and waits a bounded grace for it before a reset.
 */
import type { Harness, TurnRequest, TurnResult } from "../harness/types.js";
import type { TimeoutTracker } from "./flow-types.js";

/**
 * Bound on settling orphaned turns after the wall bound fired: the agent
 * already aborted the harness child, so a cooperative orphan is gone long
 * before this; a hung one must not hang the launch. A constant, not a knob.
 */
export const TIMEOUT_SETTLE_GRACE_MS = 5_000;

/** Wraps every tier harness with one shared orphan account for the turn. */
export function trackHarnessTimeouts(
  inners: readonly Harness[],
): TimeoutTracker {
  let sawTimeout = false;
  let pending = 0;
  const orphans = new Set<Promise<TurnResult>>();
  const wrap = (inner: Harness): Harness => ({
    id: inner.id,
    caps: (model) => inner.caps(model),
    turn: (req: TurnRequest): Promise<TurnResult> => {
      const wallMs = req.timeouts.wallMs;
      const start = Date.now();
      pending += 1;
      let tracked: Promise<TurnResult>;
      try {
        tracked = inner.turn(req).then(
          (result) => {
            pending -= 1;
            orphans.delete(tracked);
            if (wallMs > 0 && Date.now() - start >= wallMs) sawTimeout = true;
            return result;
          },
          (err: unknown) => {
            pending -= 1;
            orphans.delete(tracked);
            if (wallMs > 0 && Date.now() - start >= wallMs) sawTimeout = true;
            throw err;
          },
        );
      } catch (err) {
        pending -= 1;
        throw err;
      }
      orphans.add(tracked);
      return tracked;
    },
    ...(inner.compact ? { compact: (ref) => inner.compact!(ref) } : {}),
  });
  return {
    harnesses: inners.map(wrap),
    timedOut: () => sawTimeout || pending > 0,
    waitSettled: async () => {
      const pendingTurns = [...orphans];
      if (pendingTurns.length === 0) return;
      let grace: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          Promise.allSettled(pendingTurns),
          new Promise<void>((resolve) => {
            grace = setTimeout(resolve, TIMEOUT_SETTLE_GRACE_MS);
          }),
        ]);
      } finally {
        if (grace) clearTimeout(grace);
      }
    },
  };
}
