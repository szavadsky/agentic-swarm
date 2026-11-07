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
      // Check dependencies
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
