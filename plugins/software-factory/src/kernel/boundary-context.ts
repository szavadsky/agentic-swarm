/**
 * The consult's record and file facts: previous summaries and waste, plan
 * text ownership, snapshots and code maps, open records, spike linkage and
 * answers, unavailable aliases, holds, the epic register and foreign plan
 * reconciliation.
 */
import fs from "node:fs";
import { git } from "../core/git/exec.js";
import { recordedGoalStart } from "./baseline.js";
import { formatCause, makeCause } from "./cause.js";
import { epicSummaryRelPath, type SpikeFinding } from "./context-pack.js";
import { OPEN_TASK_STATUSES } from "./derive.js";
import { stepTarget } from "./flow-context.js";
import {
  expireHold,
  type Hold,
  readHolds,
  selfHeldSlugs,
  steerProvenance,
} from "./mailbox.js";
import { next } from "./next.js";
import { type PlanFile, resolvePlan } from "./plan-file.js";
import { type PlanSnapshot, type PmRung, restorePlans } from "./pm.js";
import { scriptMeta } from "./record.js";
import {
  type EpicRow,
  parseArchitectRegister,
  sagaPassPlan,
  type SagaPassPlan,
} from "./register.js";
import { spikeFinding } from "./spike-report.js";
import type {
  ArtifactStore,
  KernelRuntime,
  State,
  StepRecord,
  TaskFile,
} from "./types.js";
import { summaryWaste } from "./waste-summary.js";

export async function previousSummary(
  store: ArtifactStore,
  iteration: number,
): Promise<string | undefined> {
  if (iteration <= 0) return undefined;
  const text = await store.iterations.read(iteration, "summary.md");
  return text === null
    ? undefined
    : store.iterations.path(iteration, "summary.md");
}

/** The previous summary's waste section, so the next consult's pack carries it. */
export async function previousWaste(
  store: ArtifactStore,
  iteration: number,
): Promise<string | undefined> {
  if (iteration <= 0) return undefined;
  const text = await store.iterations.read(iteration, "summary.md");
  return text === null ? undefined : summaryWaste(text);
}

/** The head that iteration's pack recorded, the commit the iteration started from. */
export async function recordedIterationHead(
  store: ArtifactStore,
  iteration: number,
): Promise<string | undefined> {
  if (iteration <= 0) return undefined;
  const text = await store.iterations.read(iteration, "context-data.json");
  if (text === null) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    console.warn(
      `[factory] iteration ${iteration}: context-data.json is not valid JSON: ${(err as Error).message}`,
    );
    return undefined;
  }
  const headHash = (parsed as { paths?: { headHash?: unknown } } | null)?.paths
    ?.headHash;
  return typeof headHash === "string" ? headHash : undefined;
}

/** The pack's historical hashes: where the goal started and where its last iteration started. */
export interface RecordedPackHashes {
  goalStartHash: string | undefined;
  lastIterationHash: string | undefined;
}

/**
 * Both historical hashes, read from records rather than the checkout: the goal
 * start from the earliest pre-flight base (after iteration 1, from the head
 * iteration 1's pack recorded when no base was gated), the last iteration from
 * the head its pack recorded, the commit it started from.
 */
export async function recordedPackHashes(
  store: ArtifactStore,
  records: readonly StepRecord[],
  iteration: number,
): Promise<RecordedPackHashes> {
  const goalStartHash =
    recordedGoalStart(records) ??
    (iteration > 1 ? await recordedIterationHead(store, 1) : undefined);
  const lastIterationHash = await recordedIterationHead(store, iteration - 1);
  return { goalStartHash, lastIterationHash };
}

/** The previous iteration's summary for one epic, when it has one. */
export async function previousEpicSummary(
  store: ArtifactStore,
  iteration: number,
  epic: string,
): Promise<string | undefined> {
  if (iteration <= 0) return undefined;
  const rel = epicSummaryRelPath(iteration, epic);
  return (await store.readFile(rel)) === null
    ? undefined
    : store.pathOf({ area: "goal", rel });
}

/** Every registered plan's text: the ownership view a debt register reads. */
export async function ownedPlanText(runtime: KernelRuntime): Promise<string> {
  const plans = runtime.store.plans.existing();
  const texts = await Promise.all(
    plans.map((plan) => runtime.store.plans.read(plan.scope)),
  );
  return texts.filter((text): text is string => text !== null).join("\n");
}

export function rungTrace(rungs: PmRung[]): string {
  return rungs
    .map(
      (rung) =>
        `rung ${rung.round} ${rung.alias} (${rung.model}): ${rung.failure}`,
    )
    .join("; ");
}

/** Today's infra cause: the classified cause plus the scrubbed error tail. */
export function infraCause(stop: { cause: string; details?: string }): string {
  return stop.details ? `${stop.cause}: ${stop.details}` : stop.cause;
}

export async function taskSnapshot(
  store: ArtifactStore,
): Promise<Map<string, string>> {
  return store.tasks.texts();
}

export function snapshotDiff(
  before: Map<string, string>,
  after: Map<string, string>,
): string | null {
  const names = new Set([...before.keys(), ...after.keys()]);
  for (const name of [...names].sort()) {
    if (before.get(name) !== after.get(name)) return name;
  }
  return null;
}

/**
 * Record directories with `started.yaml` and no `end.yaml`: turns cut off
 * before they committed, as absolute paths the architect can drill into.
 */
export async function openRecords(
  store: KernelRuntime["store"],
): Promise<string[]> {
  return (await store.records.dirs())
    .filter((dir) => dir.started && !dir.ended)
    .map((dir) => dir.path);
}

export function spikeLinkedTasks(
  tasks: TaskFile[],
  steerId: string,
): TaskFile[] {
  return tasks.filter((task) => steerProvenance(task.source) === steerId);
}

/**
 * Expires a hold naming a task its own steer created. Such a hold can never
 * lapse: a spike steer is answered only when that task ends, so the hold waits
 * for the steer while the task waits for the hold. A pre-fix PM wrote these;
 * the boundary clears one before dispatch reads holds again, and the spike it
 * created can then run and answer its steer.
 */
export async function expireSelfHolds(
  runtime: KernelRuntime,
  tasks: readonly TaskFile[],
  iteration: number,
): Promise<void> {
  let holds: Hold[];
  try {
    ({ holds } = await readHolds(runtime.store));
  } catch (err) {
    console.warn(
      `[factory] holds unreadable for self-hold expiry: ${(err as Error).message}`,
    );
    return;
  }
  for (const hold of holds) {
    const own = selfHeldSlugs(hold.steer, hold.slugs, tasks);
    if (own.length === 0) continue;
    await expireHold(runtime.store, hold.steer);
    await runtime.store.appendRecord(
      scriptMeta(iteration, "hold-self-expire", { slug: hold.steer }),
      {
        ok: false,
        cause: makeCause(
          "steer",
          `${JSON.stringify(hold.steer)} hold named task(s) it creates: ${own.join(", ")}; hold expired so the task can run`,
        ),
      },
    );
  }
}

export function spikeTerminal(state: State, linked: TaskFile[]): boolean {
  if (linked.length === 0) return false;
  return linked.every((task) => {
    const status = state.tasks[task.slug]?.status;
    return (
      status === "merged" ||
      status === "finished" ||
      status === "parked" ||
      status === "cancelled"
    );
  });
}

export async function spikeAnswer(
  store: ArtifactStore,
  records: StepRecord[],
  state: State,
  linked: TaskFile[],
): Promise<string> {
  const parts = await Promise.all(
    linked.map(async (task) => {
      const finding = await spikeFinding(store, records, task.slug);
      if (finding) return `${task.slug}: ${finding}`;
      const cause = state.tasks[task.slug]?.cause;
      return cause
        ? `${task.slug}: ${formatCause(cause)}`
        : `${task.slug}: no outcome recorded`;
    }),
  );
  return parts.join("; ");
}

export async function spikeFindings(
  store: ArtifactStore,
  records: StepRecord[],
  tasks: TaskFile[],
): Promise<SpikeFinding[]> {
  const findings: SpikeFinding[] = [];
  for (const task of tasks) {
    if (task.kind !== "spike") continue;
    const finding = await spikeFinding(store, records, task.slug);
    if (finding) findings.push({ slug: task.slug, finding });
  }
  return findings;
}

/**
 * The dead-alias cause for every ready task whose next action is an agent
 * step. Tier selection is admission's own predicate, so the pack names the
 * cause dispatch would book instead of guessing it from the alias config.
 */
export function unavailableAliases(
  runtime: KernelRuntime,
  tasks: readonly TaskFile[],
  state: State,
  records: readonly StepRecord[],
): Map<string, string> {
  const causes = new Map<string, string>();
  const bySlug = new Map(tasks.map((task) => [task.slug, task]));
  for (const action of next(state, runtime.limits, new Set())) {
    if (action.kind !== "step") continue;
    const task = bySlug.get(action.slug);
    const taskState = state.tasks[action.slug];
    if (!task || !taskState) continue;
    const target = stepTarget(runtime, task, taskState, action.step, records);
    if (target.unavailable !== undefined)
      causes.set(action.slug, target.unavailable);
  }
  return causes;
}

/** The plan one epic's subarchitect owns. */
export function epicPlan(goalDir: string, epic: string): PlanFile {
  return resolvePlan(goalDir, { kind: "epic", epic });
}

/**
 * Whether the top architect may leave an epic's subarchitect out: its derived
 * epic state is done, which needs no subarchitect veto and no open task. A task
 * that becomes ready or parked brings the consult back; a merely registered
 * epic with no turn yet has no state entry and is not done.
 */
export function epicJobDone(state: State, epic: string): boolean {
  return state.epics[epic]?.done === true;
}

/**
 * The register as the boundary reads it. Depth 1 never reads one, so today's
 * single-architect goal is unchanged. History never blocks an edit: only an
 * open task naming an unknown or closed epic is a finding. Plan presence is
 * checked after the consult because the first turn creates the epic plan.
 */
export function parseRegister(
  plan: PlanFile,
  depth: 1 | 2,
  tasks: readonly TaskFile[],
  state: State,
): { epics: EpicRow[]; findings: string[] } {
  if (depth === 1) return { epics: [], findings: [] };
  const rows = tasks.flatMap((task) => {
    const status = state.tasks[task.slug]?.status;
    if (status === undefined || !OPEN_TASK_STATUSES.has(status)) return [];
    return [{ slug: task.slug, ...(task.epic ? { epic: task.epic } : {}) }];
  });
  return parseArchitectRegister(fs.readFileSync(plan.path, "utf8"), {
    depth,
    tasks: rows,
    exists: () => true,
  });
}

/**
 * The pass order this iteration runs, read before the top turn from the
 * register the previous top turn wrote. A goal with no plan yet or at depth 1
 * has no epic passes; the top turn and its direction pass still run.
 */
export function boundaryPassPlan(input: {
  plan: PlanFile;
  depth: 1 | 2;
  tasks: readonly TaskFile[];
  state: State;
  records: readonly StepRecord[];
}): SagaPassPlan {
  const started = input.records.some((record) => record.step === "architect");
  const epics =
    input.depth === 2 && fs.existsSync(input.plan.path)
      ? parseRegister(input.plan, input.depth, input.tasks, input.state).epics
      : [];
  return sagaPassPlan({
    started,
    epics,
    epicDone: (epic) => epicJobDone(input.state, epic),
  });
}

/**
 * Rolls back every plan a turn changed or created beyond the ones it owns and
 * names what it restored. A plan that appeared during the turn is deleted, so
 * a consult cannot seed a second scope's plan behind its owner's back. The
 * architect turn keeps the steered epics' plans too: their subarchitects wrote
 * them inside that same session.
 */
export async function discardForeignPlanWrites(
  runtime: KernelRuntime,
  snapshot: readonly PlanSnapshot[],
  keepRels: readonly string[],
): Promise<string[]> {
  const keep = new Set(keepRels);
  const restored = await restorePlans(runtime, snapshot, (plan) =>
    keep.has(plan.rel),
  );
  const known = new Set(snapshot.map((entry) => entry.plan.rel));
  for (const plan of runtime.store.plans.filesOnDisk()) {
    if (keep.has(plan.rel) || known.has(plan.rel)) continue;
    await runtime.store.plans.remove(plan.scope);
    restored.push(plan.rel);
  }
  return restored.sort();
}
