import { epicSummaryRelPath } from "./context-pack.js";
import type {
  ArtifactStore,
  GoalDecision,
  Outcome,
  State,
  StepRecord,
  TaskStatus,
} from "./types.js";

/** The epic summary's status vocabulary: its architect's decision, not the goal's. */
function epicStatus(decision: GoalDecision | undefined): string {
  if (decision === "done") return "epic-met";
  if (decision === "blocked") return "epic-blocked";
  return "in-progress";
}

function epicConcernLines(record: StepRecord): string[] {
  return (record.outcome?.concerns ?? []).map(
    (concern) =>
      `- [${concern.kind}/${concern.calibration}] ${concern.text}${
        concern.evidence ? ` (${concern.evidence})` : ""
      }`,
  );
}

/**
 * One epic's iteration status summary: the facts this iteration derived for the
 * epic, plus the subarchitect's own paragraph and upward brief. The script
 * owns the facts so a relaunch rewrites the same file; the paragraph is the
 * architect's, as `docs/ideology.md` requires of a status summary.
 */
function epicSummaryText(
  iteration: number,
  epic: string,
  outcome: Outcome,
  record: StepRecord,
  state: State,
): string {
  const tasks = Object.entries(state.tasks)
    .filter(([, task]) => task.epic === epic)
    .sort(([a], [b]) => a.localeCompare(b));
  const byStatus = new Map<TaskStatus, string[]>();
  for (const [slug, task] of tasks) {
    const group = byStatus.get(task.status) ?? [];
    group.push(slug);
    byStatus.set(task.status, group);
  }
  const statusLine = (status: TaskStatus): string => {
    const slugs = byStatus.get(status) ?? [];
    return `- ${status} (${slugs.length}): ${slugs.length ? slugs.join(", ") : "none"}`;
  };
  const concerns = epicConcernLines(record);
  const brief = outcome.forward;
  return [
    `# Iteration ${iteration} summary — epic \`${epic}\``,
    "",
    `status: ${epicStatus(outcome.decision)}`,
    `decision: ${outcome.decision ?? "none"}`,
    `architect: ${epic}`,
    "",
    "## Epic",
    `- summary: ${outcome.summary}`,
    "",
    "## Tasks",
    ...(
      [
        "merged",
        "finished",
        "cancelled",
        "parked",
        "running",
        "ready",
        "pending",
      ] as TaskStatus[]
    ).map(statusLine),
    "",
    "## Concerns",
    ...(concerns.length > 0 ? concerns : ["- none"]),
    "",
    "## Upward brief",
    ...(brief.length > 0 ? brief.map((line) => `- ${line}`) : ["- none"]),
    "",
  ].join("\n");
}

/**
 * Writes each subarchitect's iteration status summary. Only a completed
 * subarchitect record in this iteration produces one: an epic left out because
 * its job is done has no turn and no new summary, and another iteration's
 * summary is never overwritten.
 */
export async function writeEpicSummaries(
  store: ArtifactStore,
  input: { iteration: number; state: State; records: readonly StepRecord[] },
): Promise<string[]> {
  const latest = new Map<string, { record: StepRecord; outcome: Outcome }>();
  for (const record of input.records) {
    if (record.iteration !== input.iteration) continue;
    if (
      record.step !== "subarchitect" ||
      record.architect === undefined ||
      !record.endedAt ||
      !record.outcome
    )
      continue;
    const prior = latest.get(record.architect);
    if (!prior || prior.record.seq < record.seq)
      latest.set(record.architect, { record, outcome: record.outcome });
  }
  const written: string[] = [];
  for (const [epic, entry] of [...latest.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const rel = epicSummaryRelPath(input.iteration, epic);
    await store.writeFile(
      rel,
      epicSummaryText(
        input.iteration,
        epic,
        entry.outcome,
        entry.record,
        input.state,
      ),
    );
    written.push(rel);
  }
  return written;
}
