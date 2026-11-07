export interface SchedItem {
  slug: string;
  wave: string;
  deps: string[];
  status: "pending" | "running" | "done" | "failed" | "blocked" | "abandoned";
}

/**
 * Determines the next wave to execute according to wave sequence order (§8.4).
 *
 * Waves execute sequentially. A wave is active as long as any item in it
 * remains "pending" or "running". When all items of a wave reach a terminal
 * status ("done", "failed", "blocked", "abandoned"), execution moves to the
 * next wave.
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

  for (const wave of waveOrder) {
    const waveItems = items.filter((i) => String(i.wave) === String(wave));
    if (waveItems.length === 0) continue;

    const hasActive = waveItems.some(
      (i) => i.status === "pending" || i.status === "running"
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
