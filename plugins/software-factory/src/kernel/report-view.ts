/** The one derived view every report renderer reads: tasks, their groups and distance. */

import { materialOpenDebts, type OpenDebt } from "./derive.js";
import { recordDirName } from "./store.js";
import type {
  ReportDebt,
  ReportTask,
  ReportTaskGroups,
  ReportView,
  State,
  StepRecord,
  TaskFile,
} from "./types.js";

/** What a report carries into the derivation. */
interface ReportViewInput {
  state: State;
  /** Task files carrying titles, kinds and deps; a missing one falls back to state. */
  tasks?: readonly TaskFile[];
  /** Every record; supplies each row's link and the open debt. */
  records?: readonly StepRecord[];
  /** The slugs to list; absent lists every derived task state. */
  slugs?: readonly string[];
  /** Slugs the kernel runs now; they report `running` over their derived status. */
  running?: readonly string[];
}

/** Every listed task row, sorted by slug, each linking its latest record. */
function taskRows(input: ReportViewInput): ReportTask[] {
  const files = new Map((input.tasks ?? []).map((task) => [task.slug, task]));
  const latest = new Map<string, StepRecord>();
  for (const record of [...(input.records ?? [])].sort(
    (a, b) => a.seq - b.seq,
  )) {
    if (record.slug) latest.set(record.slug, record);
  }
  const slugs = input.slugs ?? Object.keys(input.state.tasks);
  return [...slugs]
    .sort((a, b) => a.localeCompare(b))
    .map((slug) => {
      const task = files.get(slug);
      const derived = input.state.tasks[slug];
      const record = latest.get(slug);
      return {
        slug,
        title: task?.title ?? slug,
        status: input.running?.includes(slug)
          ? "running"
          : (derived?.status ?? "pending"),
        kind: derived?.kind ?? task?.kind ?? "development",
        epic: derived?.epic,
        round: derived?.round ?? 1,
        turns: derived?.turns ?? 0,
        commit: derived?.commit,
        cause: derived?.cause,
        supersededBy: derived?.supersededBy,
        record: record
          ? `records/${recordDirName(record.seq, record)}`
          : undefined,
      };
    });
}

/** The rows grouped by the status each report names. */
function taskGroups(tasks: readonly ReportTask[]): ReportTaskGroups {
  const withStatus = (...statuses: ReportTask["status"][]) =>
    tasks.filter((task) => statuses.includes(task.status));
  const allParked = withStatus("parked");
  return {
    open: withStatus("pending", "ready", "running"),
    pending: withStatus("pending", "ready"),
    merged: withStatus("merged"),
    finished: withStatus("finished"),
    parked: allParked.filter((task) => !task.supersededBy),
    allParked,
    superseded: allParked.filter((task) => task.supersededBy),
    cancelled: withStatus("cancelled"),
  };
}

/** One open debt as the reports name it, with the record its id names. */
function debtEntry(debt: OpenDebt): ReportDebt {
  const dir = debt.id?.slice(0, debt.id.indexOf("#"));
  return {
    id: debt.id,
    text: debt.text,
    evidence: debt.evidence,
    calibration: debt.calibration,
    source: debt.source,
    iteration: debt.iteration,
    record: dir ? `records/${dir}` : undefined,
  };
}

/** Task rows, their groups and the distance: the one view a report reads. */
export function reportView(input: ReportViewInput): ReportView {
  const tasks = taskRows(input);
  const groups = taskGroups(tasks);
  return {
    tasks,
    groups,
    distance: {
      pending: groups.pending.map((task) => task.slug),
      parks: groups.parked.map((task) => task.slug),
      openDebt: materialOpenDebts(input.records ?? []).map(debtEntry),
    },
  };
}
