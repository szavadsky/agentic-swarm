import { epicSummaryRelPath, type EpicSummaryRef } from "./context-pack.js";
import { reportView } from "./report-view.js";
import type {
  ArtifactStore,
  GoalDecision,
  Outcome,
  State,
  StepRecord,
  TaskStatus,
} from "./types.js";

/**
 * The epic summary's status vocabulary: its architect's decision, not the
 * goal's. `epic-met` waits for the epic's last task to land, so a `done`
 * recorded while work is still open reports in progress.
 */
function epicStatus(
  state: State,
  epic: string,
  decision: GoalDecision | undefined,
): string {
  if (state.epics[epic]?.done) return "epic-met";
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

/** One line: whitespace collapsed, ends trimmed. */
function oneLine(text: string): string {
  return text.trim().replace(/\s+/g, " ");
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
  const tasks = reportView({ state }).tasks.filter(
    (task) => task.epic === epic,
  );
  const statusLine = (status: TaskStatus): string => {
    const slugs = tasks
      .filter((task) => task.status === status)
      .map((task) => task.slug);
    return `- ${status} (${slugs.length}): ${slugs.length ? slugs.join(", ") : "none"}`;
  };
  const concerns = epicConcernLines(record);
  const brief = outcome.forward;
  return [
    `# Iteration ${iteration} summary — epic \`${epic}\``,
    "",
    `status: ${epicStatus(state, epic, outcome.decision)}`,
    `decision: ${outcome.decision ?? "none"}`,
    `architect: ${epic}`,
    "",
    "## Epic",
    `- summary: ${oneLine(outcome.summary)}`,
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
 * The one-line rollup an epic's iteration summary carries under `## Epic`: the
 * line the writer above put there, read back for the top pack's link.
 */
function epicSummaryRollup(text: string): string | undefined {
  const lines = text.split("\n");
  const heading = lines.indexOf("## Epic");
  if (heading < 0) return undefined;
  for (const line of lines.slice(heading + 1)) {
    if (line.startsWith("## ")) return undefined;
    if (!line.startsWith("- summary: ")) continue;
    const rollup = oneLine(line.slice("- summary: ".length));
    return rollup === "" ? undefined : rollup;
  }
  return undefined;
}

/**
 * Each epic's latest iteration summary before `iteration`, newest first, and
 * its one-line rollup. An epic left out because its job is done keeps the
 * iteration that finished it: the top pack links that summary, not a missing
 * one. Epics with no summary stay absent.
 */
export async function latestEpicSummaries(
  store: ArtifactStore,
  iteration: number,
  state: Pick<State, "epics">,
): Promise<EpicSummaryRef[]> {
  const refs: EpicSummaryRef[] = [];
  for (const epic of Object.keys(state.epics).sort()) {
    for (let n = iteration - 1; n >= 1; n--) {
      const rel = epicSummaryRelPath(n, epic);
      const text = await store.readFile(rel);
      if (text === null) continue;
      const rollup = epicSummaryRollup(text);
      refs.push({
        epic,
        path: store.pathOf({ area: "goal", rel }),
        ...(rollup ? { rollup } : {}),
      });
      break;
    }
  }
  return refs;
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
