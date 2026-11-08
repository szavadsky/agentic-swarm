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
 * an item with status "failed" or "abandoned". The engine calls this to mark
 * such items `blocked` and include them in the wave report. Only direct
 * failed/abandoned deps are considered here; the engine must cascade
 * transitively (a pending item whose dep was just marked blocked-by-failure
 * can never run either, so it must be marked too, to a fixpoint).
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

/**
 * Determines the next wave to execute according to wave sequence order (§8.4).
 *
 * Waves execute sequentially. A wave is active as long as any item in it
 * remains "running", or is "pending" and not blocked-by-failure (see
 * `blockedByFailure`). Pending items whose deps include a failed/abandoned
 * item can never run, so they do not keep their wave active; the engine
 * marks them `blocked` via `blockedByFailure`. When no wave has active
 * work, execution moves past it. Terminal statuses are "done", "failed",
 * "blocked", "abandoned".
 *
 * Returns the wave identifier, or null if all waves are complete or empty.
 */
export function nextWave(items: SchedItem[], order: string[]): string | null {
  let waveOrder = order;

  if (!waveOrder || waveOrder.length === 0) {
    const uniqueWaves = Array.from(new Set(items.map((i) => String(i.wave))));
    uniqueWaves.sort((a, b) => {
      const numA = Number(a);
      const numB = Number(b);
      if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
        return numA - numB;
      }
      return a.localeCompare(b);
    });
    waveOrder = uniqueWaves;
  }

  const blocked = new Set(blockedByFailure(items));

  for (const wave of waveOrder) {
    const waveItems = items.filter((i) => String(i.wave) === String(wave));
    if (waveItems.length === 0) continue;

    const hasActive = waveItems.some(
      (i) =>
        i.status === "running" ||
        (i.status === "pending" && !blocked.has(i.slug))
    );

    if (hasActive) {
      return String(wave);
    }
  }

  return null;
}

/**
 * Computes the runnable items for the active wave respecting dependencies,
 * maximum concurrency, and PM scheduling order (§8.4).
 *
 * 1. It belongs to the active wave
 * 2. Its status is "pending"
 * 3. All items listed in its `deps` have status "done"
 * 4. No UNMERGED dep sits in the active wave or a later wave (dep-wave
 *    order: such a dep cannot complete before this item runs, so the item
 *    must wait — a forward-dep scheduling fault surfaces via wave-state
 *    blocking, never by running the item early).
 * Up to (maxParallel - running) items are returned, preserving PM order.
 */
export function runnable(
  items: SchedItem[],
  wave: string,
  maxParallel: number,
  running: number
): string[] {
  const availableSlots = Math.max(0, maxParallel - running);
  if (availableSlots <= 0) {
    return [];
  }

  const normWave = (w: unknown): string => String(w);
  const waveRank = (w: unknown): number => {
    const n = typeof w === "number" ? w : Number(String(w));
    return Number.isNaN(n) ? Number.POSITIVE_INFINITY : n;
  };
  const activeRank = waveRank(wave);
  const bySlug = new Map(items.map((i) => [i.slug, i]));
  const doneSlugs = new Set(
    items.filter((i) => i.status === "done").map((i) => i.slug)
  );

  const pendingItemsInWave = items.filter(
    (i) => normWave(i.wave) === normWave(wave) && i.status === "pending"
  );

  const runnableSlugs: string[] = [];

  for (const item of pendingItemsInWave) {
    // Dep-wave order (D5): an unmerged dep in this wave or a later wave can
    // never complete before this item runs, so the item waits (forward-dep
    // fault surfaces via wave-state blocking, never by running early).
    let depWaveOrdered = true;
    for (const dep of item.deps) {
      const depItem = bySlug.get(dep);
      if (depItem && depItem.status !== "done" && waveRank(depItem.wave) >= activeRank) {
        depWaveOrdered = false;
        break;
      }
    }
    if (!depWaveOrdered) continue;
    const depsDone = item.deps.every((dep) => doneSlugs.has(dep));
    if (depsDone) {
      runnableSlugs.push(item.slug);
      if (runnableSlugs.length === availableSlots) {
        break;
      }
    }
  }

  return runnableSlugs;
}
