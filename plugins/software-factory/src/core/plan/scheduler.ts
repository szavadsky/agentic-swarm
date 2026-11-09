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
 * Wave scheduling vocabulary (`nextWave`/`runnable`) is shared with derive
 * callers: wave order and readiness also derive in `deriveWaveState`
 * (`src/core/derive/wave.ts`), whose `runnable`/`running`/`waiting` buckets
 * mirror them.
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
 * Expands blocked slugs to a fixpoint over declared `deps` (§8.2): a pending
 * item depending on any blocked slug can never run, so it is blocked too.
 * Mutates `blocked` in place and returns it.
 */
export function cascadePendingBlocked<T extends { slug: string; deps: string[]; status: string }>(
  items: T[],
  blocked: Set<string>
): Set<string> {
  let grew = blocked.size > 0;
  while (grew) {
    grew = false;
    for (const item of items) {
      if (item.status !== "pending" || blocked.has(item.slug) || !item.deps.some((d) => blocked.has(d))) {
        continue;
      }
      blocked.add(item.slug);
      grew = true;
    }
  }
  return blocked;
}

/**
 * Returns the slugs blocked by routed concern blockers (adr-routing-derived-state).
 *
 * `concernBlocked` names items that routed blocker concerns affect. A pending
 * affected item is blocked, and pending items depending on any blocked slug are
 * blocked transitively to a fixpoint. The result unions with `blockedByFailure`
 * so callers see one failure/concern picture. Refs naming no item, terminal
 * items, and non-pending work are ignored. Preserves input (PM) order.
 */
export function blockedByConcern(items: SchedItem[], concernBlocked: Iterable<string>): string[] {
  const bySlug = new Map(items.map((i) => [i.slug, i]));
  const blocked = new Set(blockedByFailure(items));
  for (const slug of concernBlocked) {
    if (bySlug.get(slug)?.status === "pending") {
      blocked.add(slug);
    }
  }
  // Already-blocked items seed the cascade too: a pending dependent of a
  // blocked item can never run, so it derives `blocked` (matches the wave's
  // depBlocked mapping). Without this, callers that pass already-blocked
  // inputs (iteration gate re-derives) lose the transitive closure.
  // Only `pending` items are ever newly marked (see cascadePendingBlocked):
  // running/ready/merged work is never retro-blocked.
  for (const item of items) {
    if (item.status === "blocked") {
      blocked.add(item.slug);
    }
  }
  cascadePendingBlocked(items, blocked);
  return items.filter((i) => blocked.has(i.slug)).map((i) => i.slug);
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
 * An item is runnable iff:
 * 1. It belongs to the active wave
 * 2. Its status is "pending"
 * 3. All items listed in its `deps` have status "done"
 *
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

  const doneSlugs = new Set(
    items.filter((i) => i.status === "done").map((i) => i.slug)
  );

  const pendingItemsInWave = items.filter(
    (i) => String(i.wave) === String(wave) && i.status === "pending"
  );

  const runnableSlugs: string[] = [];

  for (const item of pendingItemsInWave) {
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
