import type { ArtifactStore, GoalDecision, State, StepRecord } from "./types.js";

export type SummaryStatus = "goal-met" | "in-progress" | "blocked-by-user" | "stopped-with-debt";

export interface SummaryInput {
  iteration: number;
  state: State;
  records: StepRecord[];
  decision?: GoalDecision;
  /** Boundary/launch cause shown as a remarkable (PM validation, crash). */
  cause?: string;
  /** Crash or drain override; the architect decision wins when present. */
  status?: SummaryStatus;
}

function defaultStatus(decision: GoalDecision | undefined): SummaryStatus {
  if (decision === "done") return "goal-met";
  if (decision === "blocked") return "blocked-by-user";
  return "in-progress";
}

/**
 * The guaranteed remarkable: exactly one summary per iteration, written even
 * when the iteration crashed. Everything here is derived from records, so a
 * recovery run produces the same facts.
 */
export async function writeIterationSummary(
  store: ArtifactStore,
  input: SummaryInput
): Promise<string> {
  const { iteration } = input;
  const recs = input.records.filter((r) => r.iteration === iteration);
  const architect = recs.filter((r) => r.step === "architect" && r.outcome).at(-1);
  const status = input.decision
    ? defaultStatus(input.decision)
    : (input.status ?? defaultStatus(undefined));

  const merged = recs.filter((r) => r.step === "merge" && r.ok === true).map((r) => r.slug!);
  const finished = recs.filter((r) => r.step === "finish" && r.ok === true).map((r) => r.slug!);
  const parked = input.state.tasks;
  const parkedSlugs = Object.keys(parked)
    .filter((slug) => parked[slug]!.status === "parked")
    .sort();

  const remarkable: string[] = [];
  if (input.cause) remarkable.push(`boundary: ${input.cause}`);
  if (architect?.outcome) {
    remarkable.push(`architect: ${architect.outcome.summary}`);
    remarkable.push(...architect.outcome.forward);
    for (const concern of architect.outcome.concerns) {
      if (concern.calibration === "fyi") continue;
      remarkable.push(`[${concern.kind}/${concern.calibration}] ${concern.text}`);
    }
  }
  for (const rec of recs) {
    if (!rec.outcome) continue;
    for (const concern of rec.outcome.concerns) {
      if (concern.calibration === "fyi") continue;
      remarkable.push(
        `[${concern.kind}/${concern.calibration}] ${rec.slug ?? rec.step}: ${concern.text}`
      );
    }
  }
  for (const slug of parkedSlugs) {
    remarkable.push(`parked ${slug}: ${parked[slug]!.cause ?? "no recorded cause"}`);
  }

  const assumed = recs.flatMap((r) =>
    (r.outcome?.concerns ?? [])
      .filter((c) => c.kind === "choice")
      .map((c) => `- ${c.text}${c.evidence ? ` (${c.evidence})` : ""}`)
  );
  const debt = recs.flatMap((r) =>
    (r.outcome?.concerns ?? [])
      .filter((c) => c.kind === "debt")
      .map((c) => `- ${c.text}${c.evidence ? ` (${c.evidence})` : ""}`)
  );

  const lines = [
    `# Iteration ${iteration} summary`,
    "",
    `status: ${status}`,
    "",
    "## Outcome",
    `- merged: ${merged.length ? merged.join(", ") : "none"}`,
    `- spikes finished: ${finished.length ? finished.join(", ") : "none"}`,
    `- parked: ${parkedSlugs.length ? parkedSlugs.join(", ") : "none"}`,
    `- agent turns: ${recs.filter((r) => r.actor === "agent" && r.endedAt).length}`,
    "",
    "## Remarkable",
    ...(remarkable.length ? remarkable.map((r) => `- ${r}`) : ["- none"]),
    "",
    "## Assumed",
    ...(assumed.length ? assumed : ["- none recorded"]),
    "",
    "## Debt",
    ...(debt.length ? debt.map((d) => `opened ${d}`) : ["- opened: none", "- closed: none"]),
    "",
  ];
  const rel = `iterations/${iteration}/summary.md`;
  await store.writeFile(rel, lines.join("\n"));
  return rel;
}
