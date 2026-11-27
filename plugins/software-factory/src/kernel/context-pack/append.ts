/** One appender per pack section. */

import { formatCause } from "../cause.js";
import { openEpicTask } from "../derive.js";
import type { OpenDebt } from "../derive.js";
import { renderInfraSection } from "../infra.js";
import { spikeReportPath } from "../spike-report.js";
import type { WasteSpikeProposal } from "../metrics/types.js";
import type { ReportTask, State } from "../types.js";
import type {
  ContextPackInput,
  ForwardedConcern,
  PackSection,
} from "./types.js";
import { formatPlanFinding, numberedPlanFindings } from "./plan-findings.js";
import type { PromptLibrary } from "../prompts.js";

/** Headings that carry no prompt text; planReview and codeMap render theirs. */
export const SECTION_HEADINGS = {
  planCheck: "## Plan check (the evidence that summoned the architect)",
  forwarded: "## Forwarded concerns (architect/owner)",
  spikeFindings: "## Spike findings",
  pmAnswers: "## PM steer answers",
} as const satisfies Record<
  Exclude<PackSection, "planReview" | "codeMap">,
  string
>;

/** The section heading: two sections carry instruction text from prompt fragments. */
export function sectionHeading(
  section: PackSection,
  prompts: PromptLibrary,
): string {
  if (section === "planReview")
    return prompts.render("pack-plan-review", {}).trimEnd();
  if (section === "codeMap")
    return prompts.render("pack-code-map", {}).trimEnd();
  return SECTION_HEADINGS[section];
}

export function short(hash: string | undefined): string {
  return hash ? hash.slice(0, 10) : "-";
}

function formatForwarded(
  concern: ForwardedConcern,
  held: readonly string[],
): string {
  const repeats =
    concern.occurrences && concern.occurrences > 1
      ? ` x${concern.occurrences}`
      : "";
  const holds =
    held.length > 0 ? ` · holds ${[...held].sort().join(", ")}` : "";
  return `- [${concern.calibration}/${concern.kind}]${repeats} ${concern.text}${
    concern.evidence ? ` (${concern.evidence})` : ""
  }${holds} — ${concern.source}`;
}

/** One register line: the id the architect closes, then what the debt is and where it came from. */
function formatDebt(debt: OpenDebt): string {
  const id = debt.id ? `${debt.id} ` : "";
  return `- ${id}[${debt.calibration}] ${debt.text}${
    debt.evidence ? ` (${debt.evidence})` : ""
  } — ${debt.source}`;
}

/** Appends a titled section when it has entries; empty sections disappear. */
export function appendSection(
  lines: string[],
  title: string,
  entries: string[],
): void {
  if (entries.length === 0) return;
  lines.push("", title, ...entries);
}

/** The top pack's link and one-line rollup for one epic, as a line suffix. */
function epicSummarySuffix(name: string, input: ContextPackInput): string {
  if (input.epic !== undefined) return "";
  const summary = input.epicSummaries?.find((ref) => ref.epic === name);
  if (!summary) return "";
  const rollup = summary.rollup ? ` — ${summary.rollup}` : "";
  return `${rollup} — ${summary.path}`;
}

/** One epic's rollup line. */
function epicStatusLine(name: string, input: ContextPackInput): string {
  const epic = input.state.epics[name]!;
  const open = epic.tasks.filter((slug) =>
    openEpicTask(input.state.tasks[slug]),
  ).length;
  const total = epic.tasks.length;
  return `- \`${name}\`: ${epic.done ? "done" : "open"} — subarchitect ${epic.decision ?? "no turn"}; ${open} of ${total} ${total === 1 ? "task" : "tasks"} open${epicSummarySuffix(name, input)}`;
}

/** The status table and the epic rollup. */
export function appendTaskStatus(
  lines: string[],
  input: ContextPackInput,
  rows: readonly ReportTask[],
  deps: ReadonlyMap<string, readonly string[]>,
): void {
  for (const row of rows)
    lines.push(
      `| ${row.slug} | ${row.status} | ${row.kind} | ${row.round} | ${row.turns} | ${(deps.get(row.slug) ?? []).join(",") || "-"} | ${short(row.commit)} |`,
    );
  if (rows.length === 0) lines.push("| (none yet) | | | | | | |");

  const epicNames = Object.keys(input.state.epics)
    .filter((name) => input.epic === undefined || name === input.epic)
    .sort();
  if (epicNames.length === 0) return;
  lines.push("", input.epic ? "## Epic" : "## Epics");
  for (const name of epicNames) lines.push(epicStatusLine(name, input));
}

/** Parked tasks with their terminal cause. */
export function parkedLines(parked: readonly ReportTask[]): string[] {
  return parked.map(
    (task) =>
      `- ${task.slug}: ${task.cause ? formatCause(task.cause) : "no recorded cause"}`,
  );
}

/** Pending/ready tasks and the deps each still waits on. */
export function pendingLines(
  state: State,
  pending: readonly ReportTask[],
  deps: ReadonlyMap<string, readonly string[]>,
): string[] {
  return pending.map((task) => {
    const waiting = (deps.get(task.slug) ?? []).filter((dep) => {
      const status = state.tasks[dep]?.status;
      return status !== "merged" && status !== "finished";
    });
    return `- ${task.slug}: ${waiting.length > 0 ? `waits on ${waiting.join(", ")}` : "ready"}`;
  });
}

/** Ready tasks with no turn in the last segment and why they sat. */
export function appendAgedReady(
  lines: string[],
  input: ContextPackInput,
): void {
  if (input.agedReady === undefined) return;
  lines.push("", "## Ready, no turn in the last segment");
  if (input.agedReady.length === 0) {
    lines.push("- none");
    return;
  }
  for (const task of [...input.agedReady].sort((a, b) =>
    a.slug.localeCompare(b.slug),
  )) {
    lines.push(
      `- ${task.slug}: ${
        task.causes.length > 0
          ? task.causes.join("; ")
          : "no blocking cause recorded"
      }`,
    );
  }
}

export function appendPlanCheck(
  lines: string[],
  input: ContextPackInput,
): void {
  const check = input.planCheck;
  if (!check) return;
  lines.push(
    "",
    SECTION_HEADINGS.planCheck,
    `- iteration ${check.iteration}, verdict ${check.verdict}`,
  );
  if (check.reason) {
    lines.push(`- checker did not run: ${check.reason}`);
    return;
  }
  if (check.evidence.length === 0) {
    lines.push("- no evidence recorded");
    return;
  }
  for (const entry of check.evidence) {
    lines.push(`- ${entry.item} (${entry.status}): ${entry.evidence}`);
  }
}

export function appendPlanReview(
  lines: string[],
  input: ContextPackInput,
  prompts: PromptLibrary,
): void {
  const review = input.planReview;
  if (!review) return;
  lines.push(
    "",
    sectionHeading("planReview", prompts),
    `- iteration ${review.iteration}, reviewers ${review.reviewers
      .map((alias) => `\`${alias}\``)
      .join(", ")}`,
    "- findings are numbered technical first, then plan notes",
    ...numberedPlanFindings(review).map(formatPlanFinding),
  );
}

export function appendWaste(lines: string[], input: ContextPackInput): void {
  if (!input.previousWaste) return;
  lines.push(
    "",
    "## Waste (previous iteration summary)",
    ...input.previousWaste.split("\n"),
  );
}

/** The cause's wasted turns, named by the iteration that carried each. */
function proposalWasteText(proposal: {
  count: number;
  iterations: readonly number[];
}): string {
  const places =
    proposal.iterations.length === 1
      ? `iteration ${proposal.iterations[0]}`
      : `iterations ${proposal.iterations.join(", ")}`;
  return `${proposal.count} wasted turn${proposal.count === 1 ? "" : "s"} in ${places}`;
}

/** The section's first line; the script writes it, so no pack can drop it. */
const SPIKE_PROPOSALS_HEADING =
  "## Spike proposals (recurring waste at the configured threshold)";

/** The section naming recurring waste at the threshold; no pack can drop it. */
export function spikeProposalsSection(
  proposals: readonly WasteSpikeProposal[],
  prompts: PromptLibrary,
): string {
  const lines = [
    SPIKE_PROPOSALS_HEADING,
    prompts.render("pack-spike-proposals", {}).trimEnd(),
  ];
  for (const proposal of proposals) {
    lines.push(
      `- ${proposal.label}: ${proposalWasteText(proposal)} (threshold ${proposal.threshold})`,
    );
  }
  return lines.join("\n");
}

/** Recurring waste: one proposal line per cause at or above the configured threshold. */
export function appendSpikeProposals(
  lines: string[],
  input: ContextPackInput,
  prompts: PromptLibrary,
): void {
  const proposals = input.spikeProposals ?? [];
  if (proposals.length === 0) return;
  lines.push("", spikeProposalsSection(proposals, prompts));
}

/**
 * The forwarded concerns. A concern the wave-end PM marked blocking carries
 * the tasks its hold withholds; one it passed on renders unchanged.
 */
export function appendForwarded(
  lines: string[],
  input: ContextPackInput,
): void {
  if (input.forwarded.length === 0) return;
  const heldBy = new Map(
    (input.holds ?? [])
      .filter((hold) => hold.slugs.length > 0)
      .map((hold) => [hold.steer, hold.slugs]),
  );
  lines.push("", SECTION_HEADINGS.forwarded);
  for (const concern of input.forwarded) {
    lines.push(formatForwarded(concern, heldBy.get(concern.id) ?? []));
  }
}

export function appendDebts(
  lines: string[],
  input: ContextPackInput,
  prompts: PromptLibrary,
): void {
  lines.push("", prompts.render("pack-debt-register", {}).trimEnd());
  if (input.debts.length === 0) {
    lines.push("- none open");
    return;
  }
  for (const debt of input.debts) lines.push(formatDebt(debt));
}

export function appendOpenRecords(
  lines: string[],
  input: ContextPackInput,
): void {
  lines.push("", "## Open records (started, no end)");
  if (!input.openRecords || input.openRecords.length === 0) {
    lines.push("- none");
    return;
  }
  for (const record of input.openRecords) lines.push(`- ${record}`);
}

export function appendCodeMap(
  lines: string[],
  input: ContextPackInput,
  prompts: PromptLibrary,
): void {
  if (!input.codeMap || input.codeMap.length === 0) return;
  lines.push("", sectionHeading("codeMap", prompts));
  lines.push(...input.codeMap.map((entry) => `- ${entry}`));
}

export function appendInfra(lines: string[], input: ContextPackInput): void {
  lines.push("", ...renderInfraSection(input.setup, input.gates).split("\n"));
}

const TEST_RUNTIME_ROW_CAP = 20;

function formatDurationMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function formatDeltaMs(deltaMs: number): string {
  if (deltaMs > 0) return `+${formatDurationMs(deltaMs)}`;
  if (deltaMs < 0) return `-${formatDurationMs(-deltaMs)}`;
  return "0ms";
}

function pluralTests(count: number): string {
  return `${count} ${count === 1 ? "test" : "tests"}`;
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

export function appendTestRuntimes(
  lines: string[],
  input: ContextPackInput,
): void {
  const comparison = input.testRuntimes;
  if (!comparison) return;
  lines.push("", "## Test runtimes (current vs goal start)");
  const { goalStart, current, deltaMs, deltaPct, rows } = comparison;
  if (!current) {
    lines.push(
      `- goal-start: ${formatDurationMs(goalStart.totalMs)} across ${pluralTests(goalStart.testCount)} (${goalStart.step})`,
      "- current: not recorded",
    );
    return;
  }
  const pct =
    deltaPct === null
      ? ""
      : `, ${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%`;
  lines.push(
    `- total: ${formatDurationMs(current.totalMs)} across ${pluralTests(current.testCount)} vs goal-start ${formatDurationMs(goalStart.totalMs)} across ${pluralTests(goalStart.testCount)} (${formatDeltaMs(deltaMs ?? 0)}${pct})`,
    "| test | current | goal-start | delta |",
    "|---|---|---|---|",
  );
  for (const row of rows.slice(0, TEST_RUNTIME_ROW_CAP)) {
    const cur = row.currentMs !== null ? formatDurationMs(row.currentMs) : "-";
    const base =
      row.goalStartMs !== null ? formatDurationMs(row.goalStartMs) : "-";
    const delta =
      row.currentMs === null
        ? "removed"
        : row.goalStartMs === null
          ? "new"
          : formatDeltaMs(row.deltaMs ?? 0);
    lines.push(
      `| ${escapeTableCell(row.name)} | ${cur} | ${base} | ${delta} |`,
    );
  }
  if (rows.length > TEST_RUNTIME_ROW_CAP) {
    lines.push(
      `- ... +${rows.length - TEST_RUNTIME_ROW_CAP} more tests (full list in context-data.json)`,
    );
  }
}

export function appendBaseGates(
  lines: string[],
  input: ContextPackInput,
): void {
  lines.push("", "## Base gates");
  const base = input.baseGates;
  if (!base) {
    lines.push("- not recorded");
    return;
  }
  if (base.ok) {
    lines.push(`- base ${short(base.commit)}: green`);
    return;
  }
  lines.push(
    `- base ${short(base.commit)} was red before any task (pre-existing; not a task finding):`,
  );
  for (const check of base.checks.filter((c) => !c.ok)) {
    lines.push(`  - ${check.name}: ${check.summary}`);
  }
}

export function appendSteers(lines: string[], input: ContextPackInput): void {
  lines.push("", "## Pending steers");
  if (input.steers.length === 0) {
    lines.push("- none");
    return;
  }
  const heldBySteer = new Map(
    (input.holds ?? []).map((hold) => [hold.steer, hold]),
  );
  for (const steer of input.steers) {
    lines.push(
      `- ${steer.id}: ${steer.relPath}${steer.urgent ? " (urgent)" : ""}`,
    );
    const hold = heldBySteer.get(steer.id);
    if (hold?.goal) lines.push("  - holds: goal");
    else if (hold && hold.slugs.length > 0) {
      lines.push(`  - holds: ${[...hold.slugs].sort().join(", ")}`);
    }
  }
}

export function appendPmAnswers(
  lines: string[],
  input: ContextPackInput,
): void {
  lines.push("", SECTION_HEADINGS.pmAnswers);
  lines.push(
    input.pmAnswers && input.pmAnswers.length > 0
      ? input.pmAnswers.join("\n")
      : "- none",
  );
}

export function appendIntentChanges(
  lines: string[],
  input: ContextPackInput,
): void {
  if (!input.intentChanges || input.intentChanges.length === 0) return;
  lines.push(
    "",
    "## Intent changes (carried by the intent agent; the plan follows the diff)",
  );
  for (const change of input.intentChanges) {
    lines.push(
      `- ${change.steer} (${change.relPath}) — intent turn ${change.record}`,
    );
    if (change.diff !== undefined) {
      lines.push("", "```diff", ...change.diff.split("\n"), "```");
    } else {
      lines.push(
        `  - not carried: ${change.failure ?? "no outcome recorded"}; the steer still needs the architect`,
      );
    }
  }
}

export function appendSpikeFindings(
  lines: string[],
  input: ContextPackInput,
): void {
  if (!input.spikeFindings || input.spikeFindings.length === 0) return;
  lines.push("", SECTION_HEADINGS.spikeFindings);
  for (const { slug, finding } of [...input.spikeFindings].sort((a, b) =>
    a.slug.localeCompare(b.slug),
  )) {
    lines.push(
      `- ${slug}: ${spikeReportPath(slug)} (${Buffer.byteLength(finding, "utf8")} bytes)`,
    );
  }
}

export function appendTaskFiles(
  lines: string[],
  input: ContextPackInput,
): void {
  lines.push("", "## Task files");
  for (const task of [...input.tasks].sort((a, b) =>
    a.slug.localeCompare(b.slug),
  )) {
    lines.push(`- ${task.slug}: ${input.tasksDir}/${task.slug}.md`);
  }
}
