/** Writing metrics.json for one iteration. */

import yaml from "yaml";
import type { ArtifactStore, TaskFile } from "../types.js";
import type { GoalMetrics, IterationMetrics, MetricsInput } from "./types.js";
import { DEFAULT_ROLE_BY_STEP } from "./record.js";
import { iterationMetrics } from "./iteration.js";
import { steerLatency } from "./steers.js";
import { totalsOf } from "./accumulate.js";

/** Every iteration number the records name, plus the one being written, sorted. */
function iterationNumbers(input: MetricsInput): number[] {
  const numbers = new Set<number>([input.iteration]);
  for (const rec of input.records) {
    if (rec.iteration > 0) numbers.add(rec.iteration);
  }
  return [...numbers].sort((a, b) => a - b);
}

/**
 * One iteration's entry: the input's own status and steer count, a past
 * iteration's preserved from the file it was written with.
 */
function iterationEntry(
  n: number,
  input: MetricsInput,
  old: Map<number, IterationMetrics>,
  roleByStep: Record<string, string>,
  tasks: readonly TaskFile[],
): IterationMetrics {
  const previous = old.get(n);
  const status =
    n === input.iteration ? input.status : (previous?.status ?? "in-progress");
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
    tasks,
  );
}

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
  // Park landings and spike kinds read the task files; an unreadable file is
  // unknown to the metric, never silently unchanged.
  const tasks = await store.listTasks();
  const steers = await steerLatency(store, input.records);
  const iterations = iterationNumbers(input).map((n) =>
    iterationEntry(n, input, old, roleByStep, tasks),
  );
  const metrics: GoalMetrics = {
    iterations,
    totals: totalsOf(iterations),
    steers,
  };

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
