import { makeCause } from "../cause.js";
import {
  planCheckProvenance,
  stallProvenance,
  steerProvenance,
} from "../mailbox.js";
import type { PlanFile } from "../plan-file.js";
import { planCancellations } from "../plan-file.js";
import { appendCancel, scriptMeta } from "../record.js";
import {
  parseTaskFile,
  TaskFileError,
  taskStatuses,
  validateTaskGraph,
} from "../tasks.js";
import type {
  KernelRuntime,
  State,
  TaskFile,
  TaskStatus,
  TaskTypeDefinition,
} from "../types.js";

/** One plan and its bytes before a turn; an absent plan is restored by deleting it. */
export interface PlanSnapshot {
  plan: PlanFile;
  text: string;
  exists: boolean;
}

/** The plans and every task file as they stood before a turn. */
export interface TurnSnapshot {
  plans: PlanSnapshot[];
  tasks: Map<string, string>;
}

async function snapshotTasks(
  runtime: KernelRuntime,
): Promise<Map<string, string>> {
  return runtime.store.tasks.texts();
}

/** Each plan's bytes before a turn; an absent plan is restored by deleting it. */
export async function snapshotPlans(
  runtime: KernelRuntime,
  plans: readonly PlanFile[],
): Promise<PlanSnapshot[]> {
  return Promise.all(
    plans.map(async (plan) => {
      const text = await runtime.store.plans.read(plan.scope);
      return { plan, exists: text !== null, text: text ?? "" };
    }),
  );
}

export async function snapshotTurn(
  runtime: KernelRuntime,
  plans: readonly PlanFile[],
): Promise<TurnSnapshot> {
  return {
    plans: await snapshotPlans(runtime, plans),
    tasks: await snapshotTasks(runtime),
  };
}

/**
 * Restores every task file a turn changed or created, byte for byte, and
 * names what it restored. The plan is left alone: a return turn owns it, and
 * a task write is the one thing only the PM may do.
 */
export async function restoreTasks(
  runtime: KernelRuntime,
  before: Map<string, string>,
): Promise<string[]> {
  return runtime.store.tasks.restore(before);
}

/**
 * Restores every snapshotted plan a turn changed or created, byte for byte,
 * and names what it restored. `keep` skips the plan the turn owns: a consult
 * may write its own plan and nothing else. A plan the turn created is deleted
 * rather than left behind as an empty file.
 */
export async function restorePlans(
  runtime: KernelRuntime,
  snapshot: readonly PlanSnapshot[],
  keep?: (plan: PlanFile) => boolean,
): Promise<string[]> {
  const plans: string[] = [];
  for (const before of snapshot) {
    if (keep?.(before.plan)) continue;
    const textNow = await runtime.store.plans.read(before.plan.scope);
    if (!before.exists) {
      if (textNow !== null) {
        await runtime.store.plans.remove(before.plan.scope);
        plans.push(before.plan.rel);
      }
    } else if (textNow !== before.text) {
      await runtime.store.plans.write(before.plan.scope, before.text);
      plans.push(before.plan.rel);
    }
  }
  return plans.sort();
}

/**
 * Restores every plan and task file a turn changed or created, byte for byte,
 * and names what it restored. The PM task turn uses it to roll back a failed
 * rung; the steer turn uses it to undo a write that must not happen.
 */
export async function restoreTurn(
  runtime: KernelRuntime,
  snapshot: TurnSnapshot,
): Promise<{ plans: string[]; tasks: string[] }> {
  return {
    plans: await restorePlans(runtime, snapshot.plans),
    tasks: await restoreTasks(runtime, snapshot.tasks),
  };
}
function parseTasks(
  texts: Map<string, string>,
  taskTypes: Record<string, TaskTypeDefinition> | undefined,
): {
  tasks: TaskFile[];
  findings: string[];
} {
  const tasks: TaskFile[] = [];
  const findings: string[] = [];
  for (const [slug, text] of [...texts.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    try {
      tasks.push(parseTaskFile(text, slug, taskTypes));
    } catch (err) {
      findings.push(
        err instanceof TaskFileError
          ? err.message
          : `task "${slug}" is unreadable`,
      );
    }
  }
  return { tasks, findings };
}

/** The frozen set: reconcile restores these and the PM may not edit them. */
export function isFrozenStatus(status: TaskStatus | "new"): boolean {
  return status === "merged" || status === "finished";
}

function frozenSlugs(state: State): string[] {
  return Object.entries(state.tasks)
    .filter(([, task]) => isFrozenStatus(task.status))
    .map(([slug]) => slug)
    .sort();
}

function cancelledSlugs(state: State): string[] {
  return Object.entries(state.tasks)
    .filter(([, task]) => task.status === "cancelled")
    .map(([slug]) => slug)
    .sort();
}

/**
 * Undoes what the PM may not do and reports it: plan edits are restored,
 * merged/finished task files are restored byte for byte. A second failure is
 * handled by the caller as a blocked iteration.
 */
async function reconcile(
  runtime: KernelRuntime,
  opts: { iteration: number; state: State; round: number },
  plansBefore: readonly PlanSnapshot[],
  taskSnapshot: Map<string, string>,
): Promise<string[]> {
  const findings = await planRestoreFindings(runtime, plansBefore);
  const texts = await runtime.store.tasks.texts();
  findings.push(
    ...(await frozenTaskFindings(runtime, opts.state, taskSnapshot, texts)),
  );
  findings.push(
    ...(await cancelledTaskFindings(runtime, opts.state, taskSnapshot, texts)),
  );
  findings.push(
    ...(await deletedTaskFindings(runtime, opts.state, taskSnapshot, texts)),
  );
  if (findings.length > 0) {
    await runtime.store.appendRecord(
      scriptMeta(opts.iteration, "pm-reconcile", { round: opts.round }),
      { ok: false, cause: makeCause("invalid-outcome", findings.join("; ")) },
    );
  }
  return findings;
}

/** Restores every plan the turn edited or created and names what it restored. */
async function planRestoreFindings(
  runtime: KernelRuntime,
  plansBefore: readonly PlanSnapshot[],
): Promise<string[]> {
  const findings: string[] = [];
  for (const before of plansBefore) {
    const textNow = await runtime.store.plans.read(before.plan.scope);
    if (!before.exists) {
      if (textNow !== null) {
        await runtime.store.plans.remove(before.plan.scope);
        findings.push(
          `${before.plan.rel} was created during the PM turn; removed: only the architect edits the plan`,
        );
      }
    } else if (textNow !== before.text) {
      await runtime.store.plans.write(before.plan.scope, before.text);
      findings.push(
        `${before.plan.rel} changed during the PM turn; restored: only the architect edits the plan`,
      );
    }
  }
  return findings;
}

/** Restores every frozen task file the turn edited or created. */
async function frozenTaskFindings(
  runtime: KernelRuntime,
  state: State,
  taskSnapshot: Map<string, string>,
  texts: Map<string, string>,
): Promise<string[]> {
  const findings: string[] = [];
  for (const slug of frozenSlugs(state)) {
    const original = taskSnapshot.get(slug);
    const now = texts.get(slug);
    if (original === undefined) {
      if (now !== undefined) {
        findings.push(
          `frozen task "${slug}" appeared; frozen slugs are immutable`,
        );
      }
      continue;
    }
    if (now === original) continue;
    await runtime.store.tasks.writeText(slug, original);
    findings.push(
      `frozen task "${slug}" was edited; restored: merged work is history, rework needs a new slug`,
    );
  }
  return findings;
}

/** Restores every spent (cancelled) task file the turn edited. */
async function cancelledTaskFindings(
  runtime: KernelRuntime,
  state: State,
  taskSnapshot: Map<string, string>,
  texts: Map<string, string>,
): Promise<string[]> {
  const findings: string[] = [];
  for (const slug of cancelledSlugs(state)) {
    const original = taskSnapshot.get(slug);
    if (original === undefined) continue;
    if (texts.get(slug) === original) continue;
    await runtime.store.tasks.writeText(slug, original);
    findings.push(
      `cancelled task "${slug}" was edited; restored: a spent slug cannot be reused`,
    );
  }
  return findings;
}

/** Restores every task file the turn deleted and names its provenance. */
async function deletedTaskFindings(
  runtime: KernelRuntime,
  state: State,
  taskSnapshot: Map<string, string>,
  texts: Map<string, string>,
): Promise<string[]> {
  const frozen = new Set(frozenSlugs(state));
  const cancelled = new Set(cancelledSlugs(state));
  const findings: string[] = [];
  for (const [slug, original] of taskSnapshot) {
    if (texts.has(slug) || frozen.has(slug) || cancelled.has(slug)) continue;
    let source = "";
    try {
      source = parseTaskFile(
        original,
        slug,
        runtime.configs.process.taskTypes,
      ).source;
    } catch {
      continue;
    }
    await runtime.store.tasks.writeText(slug, original);
    findings.push(deletionFinding(slug, source));
  }
  return findings;
}

function deletionFinding(slug: string, source: string): string {
  const steer = steerProvenance(source);
  if (steer) {
    return `steer task "${slug}" was deleted; restored: a task with provenance steer ${steer} is not in the plan and the PM must leave it`;
  }
  const stall = stallProvenance(source);
  if (stall) {
    return `stall task "${slug}" was deleted; restored: a task with provenance stall ${stall} is not in the plan and the PM must leave it`;
  }
  const check = planCheckProvenance(source);
  if (check) {
    return `plan-check task "${slug}" was deleted; restored: a task with provenance plan-check ${check} is not in the plan and the PM must leave it`;
  }
  return `task "${slug}" was deleted; restored: a task leaves only through the plan's cancelled line or a PM decision`;
}
/**
 * What the task graph itself raises, before any turn's outcome is read: the
 * reconcile findings, the parse findings and the graph validation. The PM
 * ladder takes it once as the baseline, so a finding no rung can fix never
 * costs a rung.
 */
export async function graphFindings(
  runtime: KernelRuntime,
  opts: { iteration: number; state: State; round: number },
  plansBefore: readonly PlanSnapshot[],
  taskSnapshot: Map<string, string>,
): Promise<string[]> {
  const findings = await reconcile(runtime, opts, plansBefore, taskSnapshot);
  const { tasks, findings: parseFindings } = parseTasks(
    await runtime.store.tasks.texts(),
    runtime.configs.process.taskTypes,
  );
  findings.push(...parseFindings);
  findings.push(
    ...validateTaskGraph(tasks, { status: taskStatuses(opts.state) }),
  );
  return [...new Set(findings)];
}

/** A finding's identity: the baseline compare ignores order and whitespace. */
export function findingKey(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/** The findings present now that the baseline did not already raise. */
export function introducedFindings(
  findings: string[],
  baselineKeys: ReadonlySet<string>,
): string[] {
  return findings.filter((finding) => !baselineKeys.has(findingKey(finding)));
}

/** The baseline findings the graph still raises: the ones no rung can fix. */
export function unfixedBaseline(
  baseline: string[],
  findings: string[],
): string[] {
  const present = new Set(findings.map(findingKey));
  return baseline.filter((finding) => present.has(findingKey(finding)));
}

/** Whether a cancellation line in this plan may retire the task it names. */
function planOwnsTask(plan: PlanFile, task: Pick<TaskFile, "epic">): boolean {
  if (plan.scope.kind === "goal") return true;
  return task.epic === plan.scope.epic;
}

/**
 * Applies every active plan's explicit cancellations. A task whose bullet
 * disappears stays open: only the architect's `cancelled:` line or a PM leave
 * decision retires it, so dropping a bullet never silently strands a branch or
 * spends a slug. An epic plan retires only its own tasks; the goal plan may
 * retire any. A merged or finished task is history and a cancelled slug is
 * spent, so neither is touched again.
 */
export async function cancelPlanNamed(
  runtime: KernelRuntime,
  state: State,
  plans: readonly PlanSnapshot[],
  iteration: number,
): Promise<void> {
  const applied = new Set<string>();
  for (const before of plans) {
    if (!before.exists) continue;
    for (const [slug, reason] of planCancellations(before.text)) {
      const task = state.tasks[slug];
      if (
        task === undefined ||
        task.status === "cancelled" ||
        isFrozenStatus(task.status) ||
        applied.has(slug) ||
        !planOwnsTask(before.plan, task)
      )
        continue;
      applied.add(slug);
      await appendCancel(
        runtime.store,
        { iteration, slug, round: task.round, architect: task.epic },
        makeCause("note", reason),
      );
    }
  }
}

/** The task files a turn left, parsed, with the parse findings. */
export async function readTasks(runtime: KernelRuntime): Promise<{
  tasks: TaskFile[];
  findings: string[];
}> {
  return parseTasks(
    await runtime.store.tasks.texts(),
    runtime.configs.process.taskTypes,
  );
}

/** What a PM turn left behind: the reconcile findings, its texts and tasks. */
export interface ReconciledTurn {
  findings: string[];
  texts: Map<string, string>;
  tasks: TaskFile[];
  parseFindings: string[];
}

/**
 * Undoes what the PM may not do, then parses and validates the task graph the
 * turn left. Every PM route validates the same three things before it reads
 * the outcome, so the shared prefix is one call.
 */
export async function reconcileTurn(
  runtime: KernelRuntime,
  opts: { iteration: number; state: State; round: number },
  plansBefore: readonly PlanSnapshot[],
  taskSnapshot: Map<string, string>,
): Promise<ReconciledTurn> {
  const findings = await reconcile(runtime, opts, plansBefore, taskSnapshot);
  const texts = await runtime.store.tasks.texts();
  const { tasks, findings: parseFindings } = parseTasks(
    texts,
    runtime.configs.process.taskTypes,
  );
  findings.push(...parseFindings);
  findings.push(
    ...validateTaskGraph(tasks, { status: taskStatuses(opts.state) }),
  );
  return { findings, texts, tasks, parseFindings };
}
