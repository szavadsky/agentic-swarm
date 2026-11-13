import yaml from "yaml";
import { addUsage, zeroUsage } from "../harness/usage.js";
import type { Usage } from "../harness/types.js";
import type { ArtifactStore, FlowDefinition, State, StepRecord } from "./types.js";
import type { SummaryStatus } from "./summary.js";

export interface RoleMetrics {
  role: string;
  turns: number;
  usage: Usage;
  tokens: number;
}

export interface ArchitectMetrics {
  launches: number;
  usage: Usage;
  tokens: number;
  /** 0 when every recorded turn was free (cost 0); tokens then carry the signal. */
  costShare: number;
  tokenShare: number;
}

export interface IterationMetrics {
  n: number;
  status: SummaryStatus;
  turns: number;
  merged: string[];
  parked: string[];
  usage: Usage;
  tokens: number;
  /** null when the iteration merged nothing. */
  costPerMergedTask: number | null;
  roles: Record<string, RoleMetrics>;
  architect: ArchitectMetrics;
  /** Parks whose cause names no-progress; the only loop signal in kernel-0. */
  loopIncidents: number;
  /** Steers moved from inbox to processed during this iteration. */
  humanInterventions: number;
}

export interface MetricsTotals extends Omit<IterationMetrics, "n" | "status"> {
  iterations: number;
}

export interface GoalMetrics {
  iterations: IterationMetrics[];
  totals: MetricsTotals;
}

/** Step id -> role across every configured flow; metrics name roles, not steps. */
export function rolesByStep(flows: Record<string, FlowDefinition>): Record<string, string> {
  const roles: Record<string, string> = {};
  for (const flow of Object.values(flows)) {
    for (const step of flow.steps) roles[step.id] = step.role;
  }
  return roles;
}

export const DEFAULT_ROLE_BY_STEP: Record<string, string> = {
  architect: "architect",
  pm: "pm",
  digest: "digest",
  implement: "implementer",
  review: "reviewer",
};

function tokenTotal(usage: Usage): number {
  return (
    usage.in +
    usage.cacheRead +
    usage.cacheWrite5m +
    usage.cacheWrite1h +
    usage.out +
    usage.reasoningOut
  );
}

function settled(usage: Usage): Usage {
  return { ...usage, costUsd: usage.costUsd ?? 0 };
}

function emptyArchitect(): ArchitectMetrics {
  return { launches: 0, usage: settled(zeroUsage()), tokens: 0, costShare: 0, tokenShare: 0 };
}

function width(part: number, total: number): number {
  return total > 0 ? part / total : 0;
}

function computeIteration(
  n: number,
  status: SummaryStatus,
  records: StepRecord[],
  roleByStep: Record<string, string>,
  humanInterventions: number
): IterationMetrics {
  const recs = records.filter((r) => r.iteration === n && r.endedAt && r.actor === "agent");
  let usage = zeroUsage();
  const roles: Record<string, RoleMetrics> = {};
  const architect: ArchitectMetrics = emptyArchitect();

  for (const rec of recs) {
    const part = settled(rec.usage ?? zeroUsage());
    usage = addUsage(usage, part);
    const role = roleByStep[rec.step] ?? DEFAULT_ROLE_BY_STEP[rec.step] ?? rec.step;
    const entry = roles[role] ?? { role, turns: 0, usage: settled(zeroUsage()), tokens: 0 };
    entry.turns += 1;
    entry.usage = settled(addUsage(entry.usage, part));
    entry.tokens += tokenTotal(part);
    roles[role] = entry;

    if (role === "architect" || rec.step === "architect") {
      architect.launches += 1;
      architect.usage = settled(addUsage(architect.usage, part));
      architect.tokens += tokenTotal(part);
    }
  }

  const all = records.filter((r) => r.iteration === n);
  const merged = all.filter((r) => r.step === "merge" && r.ok === true).map((r) => r.slug!).sort();
  const parked = all.filter((r) => r.step === "park" && r.endedAt).map((r) => r.slug!).sort();
  const loopIncidents = all.filter(
    (r) => r.step === "park" && r.endedAt && /no[- ]progress/i.test(r.cause ?? "")
  ).length;
  const tokens = tokenTotal(usage);
  const finalUsage = settled(usage);

  architect.costShare = width(architect.usage.costUsd ?? 0, finalUsage.costUsd ?? 0);
  architect.tokenShare = width(architect.tokens, tokens);
  return {
    n,
    status,
    turns: recs.length,
    merged,
    parked,
    usage: finalUsage,
    tokens,
    costPerMergedTask: merged.length > 0 ? (finalUsage.costUsd ?? 0) / merged.length : null,
    roles,
    architect,
    loopIncidents,
    humanInterventions,
  };
}

function totalsOf(iterations: IterationMetrics[]): MetricsTotals {
  let usage = zeroUsage();
  let tokens = 0;
  let turns = 0;
  let merged = 0;
  let parked = 0;
  let loopIncidents = 0;
  let humanInterventions = 0;
  const roles: Record<string, RoleMetrics> = {};
  const architect = emptyArchitect();

  for (const iteration of iterations) {
    usage = addUsage(usage, iteration.usage);
    tokens += iteration.tokens;
    turns += iteration.turns;
    merged += iteration.merged.length;
    parked += iteration.parked.length;
    loopIncidents += iteration.loopIncidents;
    humanInterventions += iteration.humanInterventions;
    for (const entry of Object.values(iteration.roles)) {
      const total = roles[entry.role] ?? { role: entry.role, turns: 0, usage: settled(zeroUsage()), tokens: 0 };
      total.turns += entry.turns;
      total.usage = settled(addUsage(total.usage, entry.usage));
      total.tokens += entry.tokens;
      roles[entry.role] = total;
    }
    architect.launches += iteration.architect.launches;
    architect.usage = settled(addUsage(architect.usage, iteration.architect.usage));
    architect.tokens += iteration.architect.tokens;
  }

  const finalUsage = settled(usage);
  architect.costShare = width(architect.usage.costUsd ?? 0, finalUsage.costUsd ?? 0);
  architect.tokenShare = width(architect.tokens, tokens);
  return {
    iterations: iterations.length,
    turns,
    merged: mergedList(iterations),
    parked: parkedList(iterations),
    usage: finalUsage,
    tokens,
    costPerMergedTask: merged > 0 ? (finalUsage.costUsd ?? 0) / merged : null,
    roles,
    architect,
    loopIncidents,
    humanInterventions,
  };
}

function mergedList(iterations: IterationMetrics[]): string[] {
  return iterations.flatMap((i) => i.merged).sort();
}

function parkedList(iterations: IterationMetrics[]): string[] {
  return iterations.flatMap((i) => i.parked).sort();
}

export interface MetricsInput {
  iteration: number;
  status: SummaryStatus;
  records: StepRecord[];
  state?: State;
  /** Step id -> role, from the process flow config. */
  roleByStep?: Record<string, string>;
  humanInterventions?: number;
}

/**
 * Rebuilds every iteration entry from records (status and steer counts are the
 * only facts records cannot carry for past iterations, so they are preserved).
 * Writes `iterations/<n>/metrics.yaml`, root `metrics.yaml` and the outbox copy.
 */
export async function writeMetrics(store: ArtifactStore, input: MetricsInput): Promise<void> {
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
  for (const rec of input.records) if (rec.iteration > 0) numbers.add(rec.iteration);

  const iterations = [...numbers]
    .sort((a, b) => a - b)
    .map((n) => {
      const previous = old.get(n);
      const status = n === input.iteration ? input.status : (previous?.status ?? "in-progress");
      const human = n === input.iteration ? (input.humanInterventions ?? 0) : (previous?.humanInterventions ?? 0);
      return computeIteration(n, status, input.records, roleByStep, human);
    });
  const metrics: GoalMetrics = { iterations, totals: totalsOf(iterations) };

  for (const iteration of iterations) {
    await store.writeFile(`iterations/${iteration.n}/metrics.yaml`, yaml.stringify(iteration));
  }
  const text = yaml.stringify(metrics);
  await store.writeFile("metrics.yaml", text);
  await store.writeFile("mailbox/outbox/metrics.yaml", text);
}
