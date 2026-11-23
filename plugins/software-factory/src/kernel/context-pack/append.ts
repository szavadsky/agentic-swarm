/** One appender per pack section. */

import { formatCause } from "../cause.js";
import { OPEN_TASK_STATUSES } from "../derive.js";
import type { OpenDebt } from "../derive.js";
import { spikeReportPath } from "../spike-report.js";
import type { WasteSpikeProposal } from "../metrics/recurring.js";
import type { Cause, TaskFile } from "../types.js";
import type { ContextPackInput, ForwardedConcern } from "./types.js";
import { formatPlanFinding, numberedPlanFindings } from "./plan-findings.js";

/** One parked task's cause as the pack reads it. */
function parkedCauseText(cause: Cause | undefined): string {
  return cause ? formatCause(cause) : "no recorded cause";
}

export function short(hash: string | undefined): string {
  return hash ? hash.slice(0, 10) : "-";
}

function formatForwarded(concern: ForwardedConcern): string {
  const repeats =
    concern.occurrences && concern.occurrences > 1
      ? ` x${concern.occurrences}`
      : "";
  return `- [${concern.calibration}/${concern.kind}]${repeats} ${concern.text}${
    concern.evidence ? ` (${concern.evidence})` : ""
  } — ${concern.source}`;
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

/** One task's status-table row. */
function taskStatusRow(task: TaskFile, input: ContextPackInput): string {
  const state = input.state.tasks[task.slug];
  const status = input.running?.includes(task.slug)
    ? "running"
    : (state?.status ?? "unknown");
  return `| ${task.slug} | ${status} | ${task.kind} | ${state?.round ?? 1} | ${state?.turns ?? 0} | ${
    task.deps.join(",") || "-"
  } | ${short(state?.commit)} |`;
}

/** One epic's rollup line. */
function epicStatusLine(name: string, input: ContextPackInput): string {
  const epic = input.state.epics[name]!;
  const open = epic.tasks.filter((slug) =>
    OPEN_TASK_STATUSES.has(input.state.tasks[slug]?.status ?? "pending"),
  ).length;
  const total = epic.tasks.length;
  return `- \`${name}\`: ${epic.done ? "done" : "open"} — subarchitect ${epic.decision ?? "no turn"}; ${open} of ${total} ${total === 1 ? "task" : "tasks"} open`;
}

/** The status table and the epic rollup. */
export function appendTaskStatus(
  lines: string[],
  input: ContextPackInput,
): void {
  const tasks = [...input.tasks].sort((a, b) => a.slug.localeCompare(b.slug));
  for (const task of tasks) lines.push(taskStatusRow(task, input));
  if (tasks.length === 0) lines.push("| (none yet) | | | | | | |");

  const epicNames = Object.keys(input.state.epics)
    .filter((name) => input.epic === undefined || name === input.epic)
    .sort();
  if (epicNames.length === 0) return;
  lines.push("", input.epic ? "## Epic" : "## Epics");
  for (const name of epicNames) lines.push(epicStatusLine(name, input));
}

/** Parked tasks with their terminal cause. */
export function parkedLines(input: ContextPackInput): string[] {
  return input.tasks
    .filter((t) => input.state.tasks[t.slug]?.status === "parked")
    .map(
      (t) =>
        `- ${t.slug}: ${parkedCauseText(input.state.tasks[t.slug]?.cause)}`,
    );
}

/** Pending/ready tasks and the deps each still waits on. */
export function pendingLines(input: ContextPackInput): string[] {
  return input.tasks
    .filter((t) => {
      const status = input.state.tasks[t.slug]?.status;
      return status === "pending" || status === "ready";
    })
    .map((t) => {
      const waiting = t.deps.filter((dep) => {
        const status = input.state.tasks[dep]?.status;
        return status !== "merged" && status !== "finished";
      });
      return `- ${t.slug}: ${waiting.length > 0 ? `waits on ${waiting.join(", ")}` : "ready"}`;
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
    "## Plan check (the evidence that summoned the architect)",
    `- iteration ${check.iteration}, verdict ${check.verdict}`,
  );
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
): void {
  const review = input.planReview;
  if (!review) return;
  lines.push(
    "",
    "## Plan review (advisory findings; mark each finding helpful or unhelpful in planReviewMarks)",
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

/** The section's first line; the kernel writes it, so a pack carrying it is left alone. */
const SPIKE_PROPOSALS_HEADING =
  "## Spike proposals (recurring waste at the configured threshold)";

/** The section naming recurring waste at the threshold; the kernel owns it, so no pack can drop it. */
export function spikeProposalsSection(
  proposals: readonly WasteSpikeProposal[],
): string {
  const lines = [
    SPIKE_PROPOSALS_HEADING,
    "- each line is a proposal, never a task: plan a spike into the cause, or a named fix",
  ];
  for (const proposal of proposals) {
    lines.push(
      `- ${proposal.label}: ${proposalWasteText(proposal)} (threshold ${proposal.threshold})`,
    );
  }
  return lines.join("\n");
}

/** The agent's pack with the kernel-owned proposals section appended when it is missing. */
export function withSpikeProposals(
  pack: string,
  input: ContextPackInput,
): string {
  const proposals = input.spikeProposals ?? [];
  if (proposals.length === 0 || pack.includes(SPIKE_PROPOSALS_HEADING)) {
    return pack;
  }
  return `${pack.trimEnd()}\n\n${spikeProposalsSection(proposals)}\n`;
}

/** Recurring waste: one proposal line per cause at or above the configured threshold. */
export function appendSpikeProposals(
  lines: string[],
  input: ContextPackInput,
): void {
  const proposals = input.spikeProposals ?? [];
  if (proposals.length === 0) return;
  lines.push("", spikeProposalsSection(proposals));
}

export function appendForwarded(
  lines: string[],
  input: ContextPackInput,
): void {
  if (input.forwarded.length === 0) return;
  lines.push("", "## Forwarded concerns (architect/owner)");
  for (const concern of input.forwarded) lines.push(formatForwarded(concern));
}

export function appendDebts(lines: string[], input: ContextPackInput): void {
  lines.push(
    "",
    "## Debt register (open debt-kind concerns; own one by citing its id in a plan bullet, or close it with `debtClosed: [{id, reason}]`)",
  );
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

export function appendCodeMap(lines: string[], input: ContextPackInput): void {
  if (!input.codeMap || input.codeMap.length === 0) return;
  lines.push("", "## Code map (shallow; read paths directly)");
  lines.push(...input.codeMap.map((entry) => `- ${entry}`));
}

export function appendInfra(lines: string[], input: ContextPackInput): void {
  lines.push("", "## Infra");
  lines.push(
    `- setup: ${input.setup.length ? input.setup.join(" && ") : "none"}`,
  );
  for (const gate of input.gates) {
    lines.push(`- gate ${gate.id}: ${gate.command}`);
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
  lines.push("", "## PM steer answers");
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
  lines.push("", "## Spike findings");
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
