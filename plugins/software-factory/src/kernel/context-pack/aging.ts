/** Ready-task aging. */

import { KERNEL_STEPS } from "../types.js";
import type { StepRecord, TaskFile } from "../types.js";
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

function sharedAreas(a: readonly string[], b: readonly string[]): string[] {
  const left = new Set(
    a.map((area) => area.trim()).filter((area) => area !== ""),
  );
  if (left.size === 0) return [];
  const shared = new Set<string>();
  for (const raw of b) {
    const area = raw.trim();
    if (area !== "" && left.has(area)) shared.add(area);
  }
  return [...shared].sort();
}

/**
 * The ready tasks that started no task turn in `segment`, with what withheld
 * them: a pending steer's hold, a dep that only landed in that segment, a
 * declared-area clash with live work, or a next step whose alias has no live
 * tier. Reporting only: the hold deadlock itself is derived elsewhere.
 */
/** A pending steer -> the slugs it holds. */
function heldBySteers(
  holds: ReadyAgingInput["holds"],
  pending: ReadonlySet<string>,
): Map<string, string[]> {
  const heldBy = new Map<string, string[]>();
  for (const hold of holds) {
    if (!pending.has(hold.steer)) continue;
    for (const slug of hold.slugs) {
      heldBy.set(slug, [...(heldBy.get(slug) ?? []), hold.steer]);
    }
  }
  return heldBy;
}

/** Why one ready task started no turn this segment. */
function agingCauses(
  task: TaskFile,
  heldBy: ReadonlyMap<string, string[]>,
  context: AgingContext,
): string[] {
  const causes: string[] = [];
  const steers = [...new Set(heldBy.get(task.slug) ?? [])].sort();
  if (steers.length > 0) {
    causes.push(
      `${steers.length === 1 ? "held by steer" : "held by steers"} ${steers.join(", ")}`,
    );
  }
  for (const dep of [...new Set(task.deps)].sort()) {
    const end = context.terminal.get(dep);
    if (end) causes.push(`dep ${dep} ${end} in iteration ${context.segment}`);
  }
  for (const other of context.ordered) {
    if (other.slug === task.slug || !context.active.has(other.slug)) continue;
    for (const area of sharedAreas(task.scope, other.scope)) {
      causes.push(`area "${area}" clashes with ${other.slug}`);
    }
  }
  const alias = context.unavailableAliases?.get(task.slug);
  if (alias !== undefined) causes.push(alias);
  return causes;
}

export function readyAging(input: ReadyAgingInput): ReadyAgingTask[] {
  const { started, terminal } = segmentStarts(input.records, input.segment);
  const ready = new Set(
    input.tasks
      .filter((task) => input.state.tasks[task.slug]?.status === "ready")
      .map((task) => task.slug),
  );
  const heldBy = heldBySteers(input.holds, new Set(input.pendingSteers));
  // A live-area clash is either a task that ran in the segment or one still
  // ready beside this one; a merged task's area is history.
  const active = new Set([...started, ...ready]);
  const ordered = [...input.tasks].sort((a, b) => a.slug.localeCompare(b.slug));
  const context: AgingContext = {
    terminal,
    active,
    ordered,
    segment: input.segment,
    unavailableAliases: input.unavailableAliases,
  };
  const aged: ReadyAgingTask[] = [];
  for (const task of ordered) {
    if (!ready.has(task.slug) || started.has(task.slug)) continue;
    aged.push({ slug: task.slug, causes: agingCauses(task, heldBy, context) });
  }
  return aged;
}
