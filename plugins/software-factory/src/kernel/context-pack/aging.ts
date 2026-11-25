/** Ready-task aging. */

import { KERNEL_STEPS } from "../types.js";
import type { StepRecord, TaskFile } from "../types.js";
import { openConcernIds } from "./misc.js";
import type { AgingContext, ReadyAgingInput, ReadyAgingTask } from "./types.js";

/** Boundary and architecture roles run between segments and never start a task turn. */
const KERNEL_STEP_IDS: ReadonlySet<string> = new Set(KERNEL_STEPS);

/** Notes one record's task start or terminal dep landing for the segment. */
function noteSegmentRecord(
  record: StepRecord,
  segment: number,
  started: Set<string>,
  terminal: Map<string, string>,
): void {
  if (record.iteration !== segment) return;
  if (
    record.actor === "agent" &&
    record.slug &&
    !KERNEL_STEP_IDS.has(record.step)
  ) {
    started.add(record.slug);
  }
  if (record.actor !== "script" || !record.slug || !record.endedAt) return;
  if (record.step === "merge" && record.ok === true)
    terminal.set(record.slug, "merged");
  else if (record.step === "finish" && record.ok === true)
    terminal.set(record.slug, "finished");
}

/** The agent turns a segment started, per slug, and the deps it landed. */
function segmentStarts(
  records: readonly StepRecord[],
  segment: number,
): {
  started: Set<string>;
  terminal: Map<string, string>;
} {
  const started = new Set<string>();
  const terminal = new Map<string, string>();
  for (const record of records) {
    noteSegmentRecord(record, segment, started, terminal);
  }
  return { started, terminal };
}

/** A live hold's owner -> the slugs it holds; a stale hold decides nothing. */
function heldBy(
  holds: ReadyAgingInput["holds"],
  pending: ReadonlySet<string>,
  openConcerns: ReadonlySet<string>,
): Map<string, string[]> {
  const bySteer = new Map<string, string[]>();
  for (const hold of holds) {
    const owner = pending.has(hold.steer)
      ? `steer ${hold.steer}`
      : openConcerns.has(hold.steer)
        ? `concern ${hold.steer}`
        : undefined;
    if (owner === undefined) continue;
    for (const slug of hold.slugs) {
      bySteer.set(slug, [...(bySteer.get(slug) ?? []), owner]);
    }
  }
  return bySteer;
}

/** Why one ready task started no turn this segment. */
function agingCauses(
  task: TaskFile,
  heldBy: ReadonlyMap<string, string[]>,
  context: AgingContext,
): string[] {
  const causes: string[] = [];
  const owners = [...new Set(heldBy.get(task.slug) ?? [])].sort();
  if (owners.length > 0) causes.push(`held by ${owners.join(", ")}`);
  for (const dep of [...new Set(task.deps)].sort()) {
    const end = context.terminal.get(dep);
    if (end) causes.push(`dep ${dep} ${end} in iteration ${context.segment}`);
  }
  const alias = context.unavailableAliases?.get(task.slug);
  if (alias !== undefined) causes.push(alias);
  return causes;
}

/**
 * The ready tasks that started no task turn in `segment`, with what withheld
 * them: a pending steer's hold, an open concern's hold, a dep that only landed
 * in that segment, or a next step whose alias has no live tier. Reporting only:
 * the hold deadlock itself is derived elsewhere.
 */
export function readyAging(input: ReadyAgingInput): ReadyAgingTask[] {
  const { started, terminal } = segmentStarts(input.records, input.segment);
  const ready = new Set(
    input.tasks
      .filter((task) => input.state.tasks[task.slug]?.status === "ready")
      .map((task) => task.slug),
  );
  const held = heldBy(
    input.holds,
    new Set(input.pendingSteers),
    openConcernIds(input.records),
  );
  const context: AgingContext = {
    terminal,
    segment: input.segment,
    unavailableAliases: input.unavailableAliases,
  };
  const aged: ReadyAgingTask[] = [];
  for (const task of [...input.tasks].sort((a, b) =>
    a.slug.localeCompare(b.slug),
  )) {
    if (!ready.has(task.slug) || started.has(task.slug)) continue;
    aged.push({ slug: task.slug, causes: agingCauses(task, held, context) });
  }
  return aged;
}
