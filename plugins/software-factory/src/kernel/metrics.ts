import yaml from "yaml";
import type { ArtifactStore, State, StepRecord } from "./types.js";
import type { Usage } from "../harness/types.js";
import type { SummaryStatus } from "./summary.js";

export interface IterationMetrics {
  n: number;
  status: SummaryStatus;
  turns: number;
  merged: string[];
  parked: string[];
  usage: Usage;
}

export interface GoalMetrics {
  iterations: IterationMetrics[];
  totals: { turns: number; merged: number; parked: number; usage: Usage };
}

function zeroUsage(): Usage {
  return { in: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0, out: 0, reasoningOut: 0 };
}

function addUsage(total: Usage, part: Usage | undefined): Usage {
  if (!part) return total;
  return {
    in: total.in + part.in,
    cacheRead: total.cacheRead + part.cacheRead,
    cacheWrite5m: total.cacheWrite5m + part.cacheWrite5m,
    cacheWrite1h: total.cacheWrite1h + part.cacheWrite1h,
    out: total.out + part.out,
    reasoningOut: total.reasoningOut + part.reasoningOut,
    costUsd: (total.costUsd ?? 0) + (part.costUsd ?? 0) || undefined,
  };
}

function computeIteration(n: number, status: SummaryStatus, records: StepRecord[], state: State): IterationMetrics {
  const recs = records.filter((r) => r.iteration === n);
  let usage = zeroUsage();
  let turns = 0;
  for (const rec of recs) {
    if (rec.actor !== "agent" || !rec.endedAt) continue;
    turns += 1;
    usage = addUsage(usage, rec.usage);
  }
  return {
    n,
    status,
    turns,
    merged: recs.filter((r) => r.step === "merge" && r.ok === true).map((r) => r.slug!).sort(),
    parked: recs.filter((r) => r.step === "park").map((r) => r.slug!).sort(),
    usage,
  };
}

/** Rewrites metrics.yaml atomically; the nth entry is replaced, not duplicated. */
export async function writeMetrics(
  store: ArtifactStore,
  input: { iteration: number; status: SummaryStatus; records: StepRecord[]; state: State }
): Promise<void> {
  const existingText = await store.readFile("metrics.yaml");
  let metrics: GoalMetrics = { iterations: [], totals: { turns: 0, merged: 0, parked: 0, usage: zeroUsage() } };
  if (existingText) {
    try {
      const parsed = yaml.parse(existingText) as GoalMetrics;
      if (parsed?.iterations) metrics = parsed;
    } catch {
      // A corrupt metrics file is reporting state, never execution state: rebuild it.
    }
  }
  const entry = computeIteration(input.iteration, input.status, input.records, input.state);
  metrics.iterations = [...metrics.iterations.filter((i) => i.n !== entry.n), entry].sort((a, b) => a.n - b.n);
  metrics.totals = {
    turns: metrics.iterations.reduce((n, i) => n + i.turns, 0),
    merged: metrics.iterations.reduce((n, i) => n + i.merged.length, 0),
    parked: metrics.iterations.reduce((n, i) => n + i.parked.length, 0),
    usage: metrics.iterations.reduce((u, i) => addUsage(u, i.usage), zeroUsage()),
  };
  const text = yaml.stringify(metrics);
  await store.writeFile("metrics.yaml", text);
  await store.writeFile("mailbox/outbox/metrics.yaml", text);
}
