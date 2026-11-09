export interface SchedItem {
  slug: string;
  wave: string;
  deps: string[];
  status: "pending" | "running" | "done" | "failed" | "blocked" | "abandoned";
}

/**
 * Returns the slugs of pending items blocked by a failed dependency (§8.2).
 *
 * A pending item is blocked-by-failure iff any slug in its `deps` refers to
 * an item with status "failed" or "abandoned". Only direct
 * failed/abandoned deps are considered here; callers cascade transitively
 * to a fixpoint (see `deriveWaveState`, the live caller: a pending item
 * whose dep was just marked blocked-by-failure can never run either, so it
 * is marked too).
 *
 * Scheduling vocabulary (`nextWave`/`runnable`) was removed: wave order and
 * readiness now derive in `deriveWaveState` (`src/core/derive/wave.ts`),
 * whose `runnable`/`running`/`waiting` buckets replace them.
 *
 * Preserves input (PM) order.
 */
export function blockedByFailure(items: SchedItem[]): string[] {
  const failedSlugs = new Set(
    items
      .filter((i) => i.status === "failed" || i.status === "abandoned")
      .map((i) => i.slug)
  );
  if (failedSlugs.size === 0) {
    return [];
  }
  return items
    .filter(
      (i) => i.status === "pending" && i.deps.some((d) => failedSlugs.has(d))
    )
    .map((i) => i.slug);
}

