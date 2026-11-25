/** Recurring waste read from the goal's metrics: the next pack's spike proposals. */

import yaml from "yaml";
import type { ArtifactStore } from "../types.js";
import { WASTE_REASON_LABEL, WASTE_REASONS } from "../waste.js";
import type {
  IterationWaste,
  WasteSpikeMetrics,
  WasteSpikeProposal,
} from "./types.js";

/** Wasted turns of one cause across iterations at which the pack proposes a spike. */
export const DEFAULT_WASTE_SPIKE_THRESHOLD = 2;

/** A metrics entry the proposals can read: numeric `n`, numeric waste counts. */
function isIterationWaste(value: unknown): value is IterationWaste {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const { n, waste } = value as { n?: unknown; waste?: unknown };
  if (typeof n !== "number" || !Number.isFinite(n)) return false;
  if (waste === undefined) return true;
  if (waste === null || typeof waste !== "object" || Array.isArray(waste)) {
    return false;
  }
  const { counts } = waste as { counts?: unknown };
  if (counts === undefined) return true;
  if (counts === null || typeof counts !== "object" || Array.isArray(counts)) {
    return false;
  }
  return Object.values(counts).every(
    (count) => typeof count === "number" && Number.isFinite(count),
  );
}

/**
 * The goal's `metrics.yaml`, read for waste counts; undefined before the first
 * iteration wrote one. Proposals are advisory, so malformed, non-metrics or
 * structurally invalid content is logged and read as no metrics; the next
 * metrics write rebuilds the file.
 */
export async function readWasteMetrics(
  store: ArtifactStore,
): Promise<WasteSpikeMetrics | undefined> {
  const text = await store.readFile("metrics.yaml");
  if (text === null || text.trim() === "") return undefined;
  let parsed: unknown;
  try {
    parsed = yaml.parse(text);
  } catch {
    parsed = undefined;
  }
  const iterations =
    parsed !== null && typeof parsed === "object"
      ? (parsed as { iterations?: unknown }).iterations
      : undefined;
  if (!Array.isArray(iterations) || !iterations.every(isIterationWaste)) {
    console.warn(
      `[factory] ${store.pathOf({ area: "goal", rel: "metrics.yaml" })} is not factory metrics; no spike proposals`,
    );
    return undefined;
  }
  return { iterations: iterations as IterationWaste[] };
}

/**
 * Causes whose wasted turns, summed across the goal's iterations, reach the
 * threshold. One entry per cause: distinct causes never combine, a cause above
 * the threshold still yields one entry, and one below it yields none.
 */
export function wasteSpikeProposals(
  metrics: WasteSpikeMetrics | undefined,
  threshold: number,
): WasteSpikeProposal[] {
  if (!metrics) return [];
  return WASTE_REASONS.map((reason) => {
    let count = 0;
    const iterations: number[] = [];
    for (const iteration of metrics.iterations) {
      const wasted = iteration.waste?.counts?.[reason] ?? 0;
      if (wasted <= 0) continue;
      count += wasted;
      iterations.push(iteration.n);
    }
    return {
      reason,
      label: WASTE_REASON_LABEL[reason],
      count,
      iterations,
      threshold,
    };
  }).filter((proposal) => proposal.count >= threshold);
}
