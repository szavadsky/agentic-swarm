import type { DerivedItemState } from "./item.js";
import { blockedByFailure } from "../plan/scheduler.js";

export interface DerivedWaveState {
  wave: number;
  items: DerivedItemState[];
  runnable: DerivedItemState[];
  running: DerivedItemState[];
  ready: DerivedItemState[];
  merged: DerivedItemState[];
  failed: DerivedItemState[];
  blocked: DerivedItemState[];
  superseded: DerivedItemState[];
  isComplete: boolean;
  canMerge: boolean;
}

/**
 * Derives wave status and identifies runnable, ready, and terminal items (§8.2, §8.4).
 * A wave ends when every item is terminal (merged, failed, superseded) or human-blocked:
 * ready items merge; human-blocked items carry over.
 */
export function deriveWaveState(opts: {
  wave: number;
  items: DerivedItemState[];
  maxParallelItems?: number;
}): DerivedWaveState {
  const { wave, items } = opts;
  const waveItems = items.filter((it) => it.wave === wave || (it.wave < wave && it.status === "blocked"));

  const merged: DerivedItemState[] = [];
  const failed: DerivedItemState[] = [];
  const superseded: DerivedItemState[] = [];
  const ready: DerivedItemState[] = [];
  const running: DerivedItemState[] = [];
  const blocked: DerivedItemState[] = [];
  const runnable: DerivedItemState[] = [];
  // Index all items by slug for dependency lookup
  const allBySlug = new Map<string, DerivedItemState>();
  for (const it of items) {
    allBySlug.set(it.slug, it);
  }

  // Dependents of failed items become blocked-by-failure, cascaded transitively
  // to a fixpoint (§8.2): an item blocked this way blocks its own dependents.
  const schedItems = items.map((it) => ({
    slug: it.slug,
    wave: String(it.wave),
    deps: it.deps,
    status: it.status as "pending" | "running" | "done" | "failed" | "blocked" | "abandoned",
  }));
  const failureBlocked = new Set<string>(blockedByFailure(schedItems));
  let grew = failureBlocked.size > 0;
  while (grew) {
    grew = false;
    for (const it of items) {
      if (it.status === "pending" && !failureBlocked.has(it.slug) && it.deps.some((d) => failureBlocked.has(d))) {
        failureBlocked.add(it.slug);
        grew = true;
      }
    }
  }

  for (const it of waveItems) {
    if (it.status === "merged") {
      merged.push(it);
    } else if (it.status === "failed") {
      failed.push(it);
    } else if (it.status === "superseded") {
      superseded.push(it);
    } else if (it.status === "ready") {
      ready.push(it);
    } else if (it.status === "running") {
      running.push(it);
    } else if (it.status === "blocked") {
      blocked.push(it);
    } else if (it.status === "pending") {
      // Blocked-by-failure (transitive fixpoint computed above) routes to blocked.
      if (failureBlocked.has(it.slug)) {
        blocked.push(it);
        continue;
      }
      // Check dependencies. Dep-wave order (D5): an item never runs before
      // its deps' waves complete — verified by the branch post-mortem
      // (waves 9/10 audits correctly waited on unmerged wave-11 deps).
      let depsOk = true;
      let depBlocked = false;

      for (const depSlug of it.deps) {
        const depItem = allBySlug.get(depSlug);
        if (!depItem || depItem.status !== "merged") {
          depsOk = false;
        }
        if (depItem && (depItem.status === "failed" || depItem.status === "blocked")) {
          depBlocked = true;
        }
      }

      if (depBlocked) {
        blocked.push(it);
      } else if (depsOk) {
        runnable.push(it);
      } else {
        // Dependencies not yet merged, wait
      }
    }
  }

  // A wave is ready to merge if no items are currently runnable or running, and there is at least one ready item.
  // A wave is complete if every item in it is terminal (merged, failed, superseded) or blocked.
  // NOTE: a `ready` item is wave-terminal (it merges right after the tick
  // loop) but NOT iteration-terminal: plan-close-up must still refuse while
  // any item is merely `ready` and unmerged.
  const hasActiveWork = running.length > 0 || runnable.length > 0;
  const canMerge = !hasActiveWork && ready.length > 0;
  const isComplete = !hasActiveWork && ready.length === 0;

  return {
    wave,
    items: waveItems,
    runnable,
    running,
    ready,
    merged,
    failed,
    blocked,
    superseded,
    isComplete,
    canMerge,
  };
}

/**
 * Wave-close gate (§8.4.5): the wave's tick work is done when every wave item
 * is wave-terminal (merged/failed/blocked/superseded/ready). A `ready` item
 * still merges right after the tick loop, so it must NOT hold the wave open —
 * otherwise any ready item re-drives the wave forever and no close-up runs.
 * Awaiting-fix-round or mid-step `running`/`pending` items DO hold it open.
 */
export function isWaveTerminal(status: DerivedItemState["status"]): boolean {
  return (
    status === "merged" ||
    status === "failed" ||
    status === "blocked" ||
    status === "superseded" ||
    status === "ready"
  );
}

/**
 * Iteration-close gate (§8.4.7): plan-close-up runs ONLY when every iteration
 * item is iteration-terminal (merged/failed/blocked/superseded). A `ready`
 * item is wave-terminal but iteration-still-open (unmerged); `running` /
 * `pending` items are mid-flow. Closing with either strands work `running`.
 */
export function isIterationTerminal(status: DerivedItemState["status"]): boolean {
  return status === "merged" || status === "failed" || status === "blocked" || status === "superseded";
}

/**
 * Scans the wave items for non-terminal stragglers that would block the
 * wave-close-up gate. Returns their slugs (empty = gate passes).
 */
export function nonTerminalWaveItems(waveState: DerivedWaveState): string[] {
  return waveState.items.filter((it) => !isWaveTerminal(it.status)).map((it) => it.slug);
}
