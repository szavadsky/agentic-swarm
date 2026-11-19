import yaml from "yaml";
import type { Stop, TurnAttempt, Usage } from "../harness/types.js";
import { addUsage, zeroUsage } from "../harness/usage.js";
import { type PriceTable, pricedRecord } from "./pricing.js";
import type { SummaryStatus } from "./summary.js";
import type {
  ArtifactStore,
  FlowDefinition,
  LaunchKind,
  Outcome,
  State,
  StepRecord,
} from "./types.js";

/** Incident launches by kind; `unknown` is an old record without a stored kind. */
export interface LaunchCounts {
  glitch: number;
  "change-request": number;
  failure: number;
  unknown: number;
}

/** Spend and work one role, alias or model accumulated over an iteration. */
export interface GroupMetrics {
  turns: number;
  usage: Usage;
  tokens: number;
  /** UTF-8 bytes of the rendered prompts sent for these turns. */
  promptBytes: number;
  /** Turns whose model the harness did not price and the table does not carry. */
  unpricedTurns: number;
  /** Files changed by these turns' commits. */
  edits: number;
  addedLines: number;
  removedLines: number;
  /** Gate runs credited to this group; every gate run lands on the script role. */
  testRuns: number;
  /** Incident launches for these turns, per kind. */
  launches: LaunchCounts;
}

export interface RoleMetrics extends GroupMetrics {
  role: string;
}

export interface AliasMetrics extends GroupMetrics {
  alias: string;
}

export interface ModelMetrics extends GroupMetrics {
  model: string;
}

/**
 * Incidents that consume turns and money without producing a flow step:
 * harness retries and fallback hops, outcome repairs, conflicts, failed
 * merged-result gates, gate flakes, and the park causes that are not task failures.
 */
export interface IncidentCounts {
  /** Extra calls on the same model after an infra stop. */
  infraRetries: number;
  /** Calls moved to the next model in the chain after an infra stop. */
  fallbackHops: number;
  /** Extra harness turns spent re-asking for a valid outcome. */
  outcomeRepairs: number;
  mergeConflicts: number;
  /** `merge-checks` that went red without a recorded cause. */
  mergedGateFailures: number;
  /** Gates that went red, then green on the same tree after one re-run. */
  gateFlakes: number;
  roundLimitParks: number;
  noProgressParks: number;
  /** Parks whose cause names a turn that committed no changes. */
  emptyDiffParks: number;
  /** Parks whose cause names a turn that could not fit its context. */
  overflowParks: number;
}

export interface ArchitectMetrics {
  launches: number;
  usage: Usage;
  tokens: number;
  /** 0 when no turn had a known cost, or when all known costs are 0. */
  costShare: number;
  tokenShare: number;
  unpricedTurns: number;
}

export interface IterationMetrics {
  n: number;
  status: SummaryStatus;
  turns: number;
  merged: string[];
  parked: string[];
  /** Slugs whose task files were quarantined (or reported unreadable) this iteration. */
  quarantined: string[];
  usage: Usage;
  tokens: number;
  /**
   * Priced cost per merged task, null only when nothing merged or no turn had
   * a known cost. Partial when `unpricedTurns > 0`: the numerator covers
   * priced turns only.
   */
  costPerMergedTask: number | null;
  /** List-price equivalent per merged task; same partial rule as the priced one. */
  listCostPerMergedTask: number | null;
  roles: Record<string, RoleMetrics>;
  aliases: Record<string, AliasMetrics>;
  models: Record<string, ModelMetrics>;
  architect: ArchitectMetrics;
  unpricedTurns: number;
  incidents: IncidentCounts;
  /** Parks that name no-progress or an empty diff; the loop signals in kernel-0. */
  loopIncidents: number;
  /** Steers moved from inbox to processed during this iteration. */
  humanInterventions: number;
  /**
   * Observable operator acts: processed steers plus containment
   * outside-changes and integration-moved merges. Hand fixes, promotions,
   * merges, verifications, relaunches and config edits outside the factory
   * artifacts stay in the journal; this is the lower bound the records show.
   */
  operatorActs: number;
  /** Wall ms in checks/merge-checks records; wallMs falls back to timestamps. */
  gateWallMs: number;
  /** Wall ms in commit records. */
  commitWallMs: number;
  /** Checks/merge-checks records in this iteration. */
  gateRuns: number;
  /** Gates run across those records. */
  testRuns: number;
  /** Files changed by agent-turn commits in this iteration. */
  edits: number;
  addedLines: number;
  removedLines: number;
}

export interface MetricsTotals extends Omit<IterationMetrics, "n" | "status"> {
  iterations: number;
}

export interface GoalMetrics {
  iterations: IterationMetrics[];
  totals: MetricsTotals;
}

/** Step id -> prompt (the role) across every configured flow; metrics name roles, not steps. */
export function rolesByStep(
  flows: Record<string, FlowDefinition>,
): Record<string, string> {
  const roles: Record<string, string> = {};
  for (const flow of Object.values(flows)) {
    for (const step of flow.steps) {
      if (step.prompt) roles[step.id] = step.prompt;
    }
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

/** Known zero stays $0.0000; unknown never does; a partial sum says so. */
export function costText(
  costUsd: number | undefined,
  unpricedTurns: number,
): string {
  const unknown = `${unpricedTurns} unpriced ${unpricedTurns === 1 ? "turn" : "turns"}`;
  if (unpricedTurns === 0) return `$${(costUsd ?? 0).toFixed(4)}`;
  if (costUsd === undefined) return `unknown (${unknown})`;
  return `$${costUsd.toFixed(4)} (partial; ${unknown})`;
}

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

function emptyArchitect(): ArchitectMetrics {
  return {
    launches: 0,
    usage: zeroUsage(),
    tokens: 0,
    costShare: 0,
    tokenShare: 0,
    unpricedTurns: 0,
  };
}

function emptyIncidents(): IncidentCounts {
  return {
    infraRetries: 0,
    fallbackHops: 0,
    outcomeRepairs: 0,
    mergeConflicts: 0,
    mergedGateFailures: 0,
    gateFlakes: 0,
    roundLimitParks: 0,
    noProgressParks: 0,
    emptyDiffParks: 0,
    overflowParks: 0,
  };
}

function width(part: number, total: number): number {
  return total > 0 ? part / total : 0;
}

function sameModel(
  left: { id: string; effort?: string },
  right: { id: string; effort?: string },
): boolean {
  return left.id === right.id && (left.effort ?? "") === (right.effort ?? "");
}

function addTurn<T extends GroupMetrics>(
  entry: T,
  part: Usage,
  unpriced: number,
  promptBytes: number,
  work: { edits: number; added: number; removed: number } = {
    edits: 0,
    added: 0,
    removed: 0,
  },
  launch: LaunchKind | "unknown" | undefined = undefined,
): void {
  entry.turns += 1;
  entry.unpricedTurns += unpriced;
  entry.usage = addUsage(entry.usage, part);
  entry.tokens += tokenTotal(part);
  entry.promptBytes += promptBytes;
  entry.edits += work.edits;
  entry.addedLines += work.added;
  entry.removedLines += work.removed;
  if (launch) entry.launches[launch] += 1;
}

function emptyLaunches(): LaunchCounts {
  return { glitch: 0, "change-request": 0, failure: 0, unknown: 0 };
}

function emptyGroup(): Omit<GroupMetrics, "turns"> & { turns: number } {
  return {
    turns: 0,
    usage: zeroUsage(),
    tokens: 0,
    promptBytes: 0,
    unpricedTurns: 0,
    edits: 0,
    addedLines: 0,
    removedLines: 0,
    testRuns: 0,
    launches: emptyLaunches(),
  };
}

function wallMsOf(rec: StepRecord): number {
  if (rec.wallMs !== undefined) return Math.max(0, rec.wallMs);
  if (!rec.endedAt) return 0;
  const start = Date.parse(rec.startedAt);
  const end = Date.parse(rec.endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, end - start);
}

function isOutsideAct(rec: StepRecord): boolean {
  if (rec.step === "containment" && rec.cause?.startsWith("outside-change:"))
    return true;
  if (rec.step === "merge" && rec.cause?.startsWith("integration moved:"))
    return true;
  return false;
}

/**
 * An infra stop followed by a different model or harness: the tier walk moved
 * on because retries could not cure the stop.
 */
export function hasFallbackHop(
  attempts: readonly TurnAttempt[] | undefined,
): boolean {
  if (!attempts) return false;
  for (let i = 1; i < attempts.length; i += 1) {
    const previous = attempts[i - 1]!;
    const next = attempts[i]!;
    if (previous.stop.kind !== "infra") continue;
    if (
      sameModel(previous.model, next.model) &&
      previous.harness === next.harness
    ) {
      continue;
    }
    return true;
  }
  return false;
}

/**
 * Retries, fallbacks and outcome repairs all live in one `attempts` array.
 * Inside a harness turn attempts continue only after an infra stop; a call
 * that follows any other stop is the separate repair turn `agent.ts` appends.
 */
export function countOutcomeRepairs(
  attempts: readonly TurnAttempt[] | undefined,
): number {
  if (!attempts) return 0;
  let repairs = 0;
  for (let i = 1; i < attempts.length; i += 1) {
    if (attempts[i - 1]!.stop.kind !== "infra") repairs += 1;
  }
  return repairs;
}

/**
 * The launch kind a turn's own facts give, none for a normal turn. A turn that
 * delivered after a reminder delivered: its repair finding is recorded, so it
 * is no failure. A cancellation is the operator stopping the turn, not the
 * model failing.
 */
export function launchKindOf(rec: {
  stop?: Stop;
  outcome?: Outcome;
  attempts?: readonly TurnAttempt[];
  repairFindings?: readonly string[];
}): LaunchKind | undefined {
  if (rec.stop?.kind === "infra") return "glitch";
  if (hasFallbackHop(rec.attempts)) return "glitch";
  if (rec.outcome?.verdict === "changes") return "change-request";
  if (rec.outcome?.status === "failed" || rec.outcome?.status === "blocked") {
    return "failure";
  }
  if (rec.stop?.kind === "cancelled") return undefined;
  if (rec.outcome === undefined && (rec.repairFindings?.length ?? 0) > 0) {
    return "failure";
  }
  return undefined;
}

/**
 * One record's launch kind for the per-agent counts. A stored kind wins; an
 * old incident record without one counts as unknown; a normal turn counts
 * nowhere. Parks are incidents with stored kinds; other script records are not
 * launches.
 */
export function deriveLaunchKind(
  rec: StepRecord,
): LaunchKind | "unknown" | undefined {
  if (rec.launchKind) return rec.launchKind;
  if (rec.actor === "script") {
    return rec.step === "park" && rec.endedAt ? "unknown" : undefined;
  }
  if (!rec.endedAt) return undefined;
  // A launch that left a kind was an incident; an old record never stored it.
  if (launchKindOf(rec)) return "unknown";
  // Older still: a repair turn whose record carries no finding text.
  if (!rec.outcome && countOutcomeRepairs(rec.attempts) > 0) return "unknown";
  return undefined;
}

function attemptIncidents(recs: StepRecord[], incidents: IncidentCounts): void {
  for (const rec of recs) {
    const attempts = rec.attempts ?? [];
    incidents.outcomeRepairs += countOutcomeRepairs(attempts);
    for (let i = 1; i < attempts.length; i += 1) {
      const previous = attempts[i - 1]!;
      const next = attempts[i]!;
      if (previous.stop.kind !== "infra") continue;
      if (
        sameModel(previous.model, next.model) &&
        previous.harness === next.harness
      ) {
        incidents.infraRetries += 1;
      } else {
        incidents.fallbackHops += 1;
      }
    }
  }
}

function parkIncidents(all: StepRecord[], incidents: IncidentCounts): void {
  for (const rec of all) {
    if (rec.step === "merge" && rec.cause?.startsWith("conflict:")) {
      incidents.mergeConflicts += 1;
    } else if (rec.step === "merge-checks" && rec.ok === false && !rec.cause) {
      incidents.mergedGateFailures += 1;
    } else if (rec.step === "gate-flake" && rec.endedAt) {
      incidents.gateFlakes += 1;
    } else if (rec.step === "park" && rec.endedAt) {
      const cause = rec.cause ?? "";
      if (/^review round limit reached/i.test(cause))
        incidents.roundLimitParks += 1;
      else if (/no[- ]progress/i.test(cause)) incidents.noProgressParks += 1;
      // An empty-diff park is a loop signal: the turn consumed budget without
      // producing work. A spike's empty turn is a normal `finish` record, not a
      // park, so it never reaches this count.
      else if (/^empty-diff:/i.test(cause)) incidents.emptyDiffParks += 1;
      else if (/^overflow\b/i.test(cause)) incidents.overflowParks += 1;
    }
  }
}

/** One iteration's spend and incidents, shared by `metrics.yaml` and its summary. */
export function iterationMetrics(
  n: number,
  status: SummaryStatus,
  records: StepRecord[],
  roleByStep: Record<string, string>,
  humanInterventions: number,
  prices: PriceTable,
  priceIds?: Record<string, string>,
): IterationMetrics {
  const recs = records.filter(
    (r) => r.iteration === n && r.endedAt && r.actor === "agent",
  );
  let usage = zeroUsage();
  let unpricedTurns = 0;
  let edits = 0;
  let addedLines = 0;
  let removedLines = 0;
  const roles: Record<string, RoleMetrics> = {};
  const aliases: Record<string, AliasMetrics> = {};
  const models: Record<string, ModelMetrics> = {};
  const architect: ArchitectMetrics = emptyArchitect();

  for (const rec of recs) {
    const priced = pricedRecord(rec, prices, priceIds);
    const part = priced.usage;
    const unpriced = priced.costKnown ? 0 : 1;
    const promptBytes = rec.promptBytes ?? 0;
    const work = {
      edits: rec.edits?.files ?? 0,
      added: rec.edits?.added ?? 0,
      removed: rec.edits?.removed ?? 0,
    };
    usage = addUsage(usage, part);
    unpricedTurns += unpriced;
    edits += work.edits;
    addedLines += work.added;
    removedLines += work.removed;

    const role =
      roleByStep[rec.step] ?? DEFAULT_ROLE_BY_STEP[rec.step] ?? rec.step;
    const launch = deriveLaunchKind(rec);
    const roleEntry = roles[role] ?? { role, ...emptyGroup() };
    addTurn(roleEntry, part, unpriced, promptBytes, work, launch);
    roles[role] = roleEntry;

    // Records written before aliases existed fall back to the role name, so a
    // spend row always names a grouping the run config can resolve.
    const alias = rec.alias ?? role;
    const aliasEntry = aliases[alias] ?? { alias, ...emptyGroup() };
    addTurn(aliasEntry, part, unpriced, promptBytes, work, launch);
    aliases[alias] = aliasEntry;

    if (priced.served) {
      // A turn that served several models counts once per model it served, but
      // its work and prompt belong to the record: they land on the record's own
      // model row so a native hop does not double-count committed work.
      const ownsWork = priced.served.some(
        (entry) => entry.model.id === rec.model?.id,
      )
        ? rec.model!.id
        : priced.served[0]!.model.id;
      for (const entry of priced.served) {
        const modelEntry = models[entry.model.id] ?? {
          model: entry.model.id,
          ...emptyGroup(),
        };
        const owner = entry.model.id === ownsWork;
        addTurn(
          modelEntry,
          entry.usage,
          entry.costKnown ? 0 : 1,
          owner ? promptBytes : 0,
          owner ? work : undefined,
          owner ? launch : undefined,
        );
        models[entry.model.id] = modelEntry;
      }
    } else {
      const model = rec.model?.id ?? "unknown";
      const modelEntry = models[model] ?? { model, ...emptyGroup() };
      addTurn(modelEntry, part, unpriced, promptBytes, work, launch);
      models[model] = modelEntry;
    }

    if (role === "architect" || rec.step === "architect") {
      architect.launches += 1;
      architect.unpricedTurns += unpriced;
      architect.usage = addUsage(architect.usage, part);
      architect.tokens += tokenTotal(part);
    }
  }

  const all = records.filter((r) => r.iteration === n);
  const merged = all
    .filter((r) => r.step === "merge" && r.ok === true)
    .map((r) => r.slug!)
    .sort();
  const parked = all
    .filter((r) => r.step === "park" && r.endedAt)
    .map((r) => r.slug!)
    .sort();
  const quarantined = all
    .filter((r) => r.step === "task-quarantine" && r.endedAt)
    .map((r) => r.slug!)
    .sort();
  const incidents = emptyIncidents();
  attemptIncidents(recs, incidents);
  parkIncidents(all, incidents);
  const tokens = tokenTotal(usage);

  // Gate/commit wall and test runs come from the script records' own stamps;
  // a gate's test runs are the script's work, not the agent turn it verifies.
  let gateWallMs = 0;
  let commitWallMs = 0;
  let gateRuns = 0;
  let testRuns = 0;
  for (const rec of all) {
    if (!rec.endedAt) continue;
    if (rec.step === "checks" || rec.step === "merge-checks") {
      gateWallMs += wallMsOf(rec);
      gateRuns += 1;
      const runs = rec.testRuns ?? rec.checks?.length ?? 0;
      testRuns += runs;
      const scriptRole = roles["script"] ?? {
        role: "script",
        ...emptyGroup(),
      };
      scriptRole.testRuns += runs;
      roles["script"] = scriptRole;
    } else if (rec.step === "commit") {
      commitWallMs += wallMsOf(rec);
    }
  }
  const operatorActs = humanInterventions + all.filter(isOutsideAct).length;

  architect.costShare = width(architect.usage.costUsd ?? 0, usage.costUsd ?? 0);
  architect.tokenShare = width(architect.tokens, tokens);
  return {
    n,
    status,
    turns: recs.length,
    merged,
    parked,
    quarantined,
    usage,
    tokens,
    costPerMergedTask:
      merged.length > 0 && usage.costUsd !== undefined
        ? usage.costUsd / merged.length
        : null,
    listCostPerMergedTask:
      merged.length > 0 && usage.listCostUsd !== undefined
        ? usage.listCostUsd / merged.length
        : null,
    roles,
    aliases,
    models,
    architect,
    unpricedTurns,
    incidents,
    loopIncidents: incidents.noProgressParks + incidents.emptyDiffParks,
    humanInterventions,
    operatorActs,
    gateWallMs,
    commitWallMs,
    gateRuns,
    testRuns,
    edits,
    addedLines,
    removedLines,
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
  let operatorActs = 0;
  let gateWallMs = 0;
  let commitWallMs = 0;
  let gateRuns = 0;
  let testRuns = 0;
  let edits = 0;
  let addedLines = 0;
  let removedLines = 0;
  let unpricedTurns = 0;
  const roles: Record<string, RoleMetrics> = {};
  const aliases: Record<string, AliasMetrics> = {};
  const models: Record<string, ModelMetrics> = {};
  const incidents = emptyIncidents();
  const architect = emptyArchitect();

  const sumGroup = <T extends GroupMetrics>(
    total: T,
    entry: GroupMetrics,
  ): void => {
    total.turns += entry.turns;
    total.usage = addUsage(total.usage, entry.usage);
    total.tokens += entry.tokens;
    total.promptBytes += entry.promptBytes;
    total.unpricedTurns += entry.unpricedTurns;
    total.edits += entry.edits;
    total.addedLines += entry.addedLines;
    total.removedLines += entry.removedLines;
    total.testRuns += entry.testRuns;
    total.launches.glitch += entry.launches.glitch;
    total.launches["change-request"] += entry.launches["change-request"];
    total.launches.failure += entry.launches.failure;
    total.launches.unknown += entry.launches.unknown;
  };
  for (const iteration of iterations) {
    usage = addUsage(usage, iteration.usage);
    tokens += iteration.tokens;
    turns += iteration.turns;
    merged += iteration.merged.length;
    parked += iteration.parked.length;
    loopIncidents += iteration.loopIncidents;
    humanInterventions += iteration.humanInterventions;
    operatorActs += iteration.operatorActs;
    gateWallMs += iteration.gateWallMs;
    commitWallMs += iteration.commitWallMs;
    gateRuns += iteration.gateRuns;
    testRuns += iteration.testRuns;
    edits += iteration.edits;
    addedLines += iteration.addedLines;
    removedLines += iteration.removedLines;
    unpricedTurns += iteration.unpricedTurns;
    for (const entry of Object.values(iteration.roles)) {
      const total = roles[entry.role] ?? { role: entry.role, ...emptyGroup() };
      sumGroup(total, entry);
      roles[entry.role] = total;
    }
    for (const entry of Object.values(iteration.aliases)) {
      const total = aliases[entry.alias] ?? {
        alias: entry.alias,
        ...emptyGroup(),
      };
      sumGroup(total, entry);
      aliases[entry.alias] = total;
    }
    for (const entry of Object.values(iteration.models ?? {})) {
      const total = models[entry.model] ?? {
        model: entry.model,
        ...emptyGroup(),
      };
      sumGroup(total, entry);
      models[entry.model] = total;
    }
    for (const key of Object.keys(incidents) as (keyof IncidentCounts)[]) {
      incidents[key] += iteration.incidents[key];
    }
    architect.launches += iteration.architect.launches;
    architect.usage = addUsage(architect.usage, iteration.architect.usage);
    architect.tokens += iteration.architect.tokens;
    architect.unpricedTurns += iteration.architect.unpricedTurns;
  }

  architect.costShare = width(architect.usage.costUsd ?? 0, usage.costUsd ?? 0);
  architect.tokenShare = width(architect.tokens, tokens);
  return {
    iterations: iterations.length,
    turns,
    merged: mergedList(iterations),
    parked: parkedList(iterations),
    quarantined: quarantinedList(iterations),
    usage,
    tokens,
    costPerMergedTask:
      merged > 0 && usage.costUsd !== undefined ? usage.costUsd / merged : null,
    listCostPerMergedTask:
      merged > 0 && usage.listCostUsd !== undefined
        ? usage.listCostUsd / merged
        : null,
    roles,
    aliases,
    models,
    architect,
    unpricedTurns,
    incidents,
    loopIncidents,
    humanInterventions,
    operatorActs,
    gateWallMs,
    commitWallMs,
    gateRuns,
    testRuns,
    edits,
    addedLines,
    removedLines,
  };
}

function mergedList(iterations: IterationMetrics[]): string[] {
  return iterations.flatMap((i) => i.merged).sort();
}

function parkedList(iterations: IterationMetrics[]): string[] {
  return iterations.flatMap((i) => i.parked).sort();
}

function quarantinedList(iterations: IterationMetrics[]): string[] {
  return iterations.flatMap((i) => i.quarantined).sort();
}

export interface MetricsInput {
  iteration: number;
  status: SummaryStatus;
  records: StepRecord[];
  state?: State;
  /** Step id -> role, from the process flow config. */
  roleByStep?: Record<string, string>;
  /** OpenRouter price table, loaded once per write. */
  prices?: PriceTable;
  /** Harness model id -> OpenRouter model id, from the run config. */
  priceIds?: Record<string, string>;
  humanInterventions?: number;
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
    await store.writeFile(
      `iterations/${iteration.n}/metrics.yaml`,
      yaml.stringify(iteration),
    );
  }
  const text = yaml.stringify(metrics);
  await store.writeFile("metrics.yaml", text);
  // The outbox notifies the owner; the metrics themselves have one copy above.
  await store.writeFile("mailbox/outbox/metrics.yaml", "metrics.yaml\n");
}
