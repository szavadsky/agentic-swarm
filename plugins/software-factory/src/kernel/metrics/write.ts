/** Writing metrics.json for one iteration. */

import yaml from "yaml";
import type { ArtifactStore } from "../types.js";
import type { GoalMetrics, MetricsInput } from "./types.js";
import { DEFAULT_ROLE_BY_STEP } from "./record.js";
import { iterationMetrics } from "./iteration.js";
import { totalsOf } from "./accumulate.js";

/**
 * Rebuilds every iteration entry from records (status and steer counts are the
 * only facts records cannot carry for past iterations, so they are preserved).
 * Writes `iterations/<n>/metrics.yaml`, root `metrics.yaml` and the outbox
 * reference to it.
 */
export async function writeMetrics(
  store: ArtifactStore,
  input: MetricsInput,
): Promise<void> {
  const existingText = await store.readFile("metrics.yaml");
  let existing: GoalMetrics | undefined;
  if (existingText) {
    try {
      existing = yaml.parse(existingText) as GoalMetrics;
    } catch {
      existing = undefined;
    }
  }
  const old = new Map((existing?.iterations ?? []).map((i) => [i.n, i]));
  const roleByStep = { ...DEFAULT_ROLE_BY_STEP, ...(input.roleByStep ?? {}) };
  const numbers = new Set<number>([input.iteration]);
  for (const rec of input.records)
    if (rec.iteration > 0) numbers.add(rec.iteration);

  const iterations = [...numbers]
    .sort((a, b) => a - b)
    .map((n) => {
      const previous = old.get(n);
      const status =
        n === input.iteration
          ? input.status
          : (previous?.status ?? "in-progress");
      const human =
        n === input.iteration
          ? (input.humanInterventions ?? 0)
          : (previous?.humanInterventions ?? 0);
      return iterationMetrics(
        n,
        status,
        input.records,
        roleByStep,
        human,
        input.prices ?? {},
        input.priceIds,
      );
    });
  const metrics: GoalMetrics = { iterations, totals: totalsOf(iterations) };

  for (const iteration of iterations) {
    await store.iterations.write(
      iteration.n,
      "metrics.yaml",
      yaml.stringify(iteration),
    );
  }
  const text = yaml.stringify(metrics);
  await store.writeFile("metrics.yaml", text);
  // The outbox notifies the owner; the metrics themselves have one copy above.
  await store.mailbox.write("outbox", "metrics.yaml", "metrics.yaml\n");
}
