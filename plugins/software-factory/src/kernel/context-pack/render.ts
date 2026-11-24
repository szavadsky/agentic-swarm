/** Pack paths and the two renderers. */

import { makeCause } from "../cause.js";
import type { ContextPackInput } from "./types.js";
import type { PackSection } from "./sections.js";
import {
  appendAgedReady,
  appendBaseGates,
  appendCodeMap,
  appendDebts,
  appendForwarded,
  appendInfra,
  appendIntentChanges,
  appendOpenRecords,
  appendPlanCheck,
  appendPlanReview,
  appendPmAnswers,
  appendSection,
  appendSpikeFindings,
  appendSpikeProposals,
  appendSteers,
  appendTaskFiles,
  appendTaskStatus,
  appendWaste,
  parkedLines,
  pendingLines,
  SECTION_HEADINGS,
  short,
} from "./append.js";

/** Goal-relative path the boundary renders an iteration's pack to. */
export function contextPackRelPath(iteration: number): string {
  return `iterations/${iteration}/context-pack.md`;
}

/** Goal-relative path the script writes an iteration's full derived status to. */
export function contextDataRelPath(iteration: number): string {
  return `iterations/${iteration}/context-data.json`;
}

/** Goal-relative path an iteration's guaranteed summary is written to. */
export function summaryRelPath(iteration: number): string {
  return `iterations/${iteration}/summary.md`;
}

/** Goal-relative path one subarchitect's iteration status summary is written to. */
export function epicSummaryRelPath(iteration: number, epic: string): string {
  return `iterations/${iteration}/epics/${epic}/summary.md`;
}

/** Goal-relative path one subarchitect's iteration pack is written to. */
export function epicContextPackRelPath(
  iteration: number,
  epic: string,
): string {
  return `iterations/${iteration}/epics/${epic}/context-pack.md`;
}

/** Short hash, or "not recorded" when the pack input has no hash. */
function recordedHash(hash: string | undefined): string {
  return hash ? short(hash) : "not recorded";
}

/**
 * The longest one-line brief the index prints. A cap shortens the text only;
 * the pointer line that follows it always renders.
 */
export const PACK_BRIEF_SUMMARY_MAX = 280;

function cappedSummary(summary: string): string {
  const text = summary.trim().replace(/\s+/g, " ");
  if (text.length <= PACK_BRIEF_SUMMARY_MAX) return text;
  return `${text.slice(0, PACK_BRIEF_SUMMARY_MAX - 1)}…`;
}

/**
 * Appends one section whole, or — when the preparer briefed it — its heading,
 * the preparer's one-line summary and the pointer to the full status data.
 * A section the input would not render stays absent rather than becoming an
 * empty brief.
 */
function appendWholeOrBrief(
  lines: string[],
  section: PackSection,
  input: ContextPackInput,
  append: (out: string[]) => void,
): void {
  const brief = input.briefs?.find((entry) => entry.section === section);
  if (!brief) {
    append(lines);
    return;
  }
  const full: string[] = [];
  append(full);
  if (full.length === 0) return;
  if (!input.dataPath) {
    throw new Error(`pack brief for \`${section}\` needs the status data path`);
  }
  lines.push(
    "",
    SECTION_HEADINGS[section],
    `- ${cappedSummary(brief.summary)}`,
    `- full: ${input.dataPath} (#${section})`,
  );
}

/**
 * Deterministic index, never pasted content (KERNEL0 §5): status, hashes,
 * rounds, infra commands and paths the architect can drill into. The render
 * reads no clock; volatile admission facts (a pending hold, a pool's reset
 * time) arrive through the input, so the same input renders the same pack.
 * One renderer for every pack: a section the preparer briefed renders its
 * heading, one line and a pointer, and every other section renders whole.
 * Uncapped: the status table and every pointer section render whole unless a
 * brief replaces them, and a capped summary never drops its pointer.
 */
export function renderContextPack(input: ContextPackInput): string {
  const epicScope = input.epic ? `, epic \`${input.epic}\`` : "";
  const lines: string[] = [
    `# Context pack — goal ${input.goal}${epicScope}, iteration ${input.iteration}`,
    "",
    "## Paths",
    `- intent: ${input.intentPath}`,
    `- plan (architect edits this): ${input.planPath}`,
    `- goal checkout: ${input.checkout} (branch ${input.integrationBranch} at ${short(input.headHash)})`,
    `- hashes: goal-start ${recordedHash(input.goalStartHash)}, last iteration ${recordedHash(input.lastIterationHash)}, head ${short(input.headHash)}`,
    `- records: ${input.recordsDir}`,
    `- previous iteration summary: ${input.previousSummary ?? "none"}`,
    `- previous-launch digest: ${input.digestPath ?? "none"}`,
    `- run config: ${input.runConfigPath ?? "none"}`,
    "",
    "## Task status",
    "| slug | status | kind | round | turns | deps | commit |",
    "|---|---|---|---|---|---|---|",
  ];
  appendTaskStatus(lines, input);
  appendSection(
    lines,
    "## Parked by cause (terminal; continue via a new slug)",
    parkedLines(input),
  );
  appendSection(lines, "## Pending", pendingLines(input));
  appendIndexBody(lines, input);
  return `${lines.join("\n")}\n`;
}

/** Everything after the status table: whole unless the preparer briefed it. */
function appendIndexBody(lines: string[], input: ContextPackInput): void {
  appendAgedReady(lines, input);
  appendWholeOrBrief(lines, "planCheck", input, (out) =>
    appendPlanCheck(out, input),
  );
  appendWholeOrBrief(lines, "planReview", input, (out) =>
    appendPlanReview(out, input),
  );
  appendWaste(lines, input);
  appendSpikeProposals(lines, input);
  appendWholeOrBrief(lines, "forwarded", input, (out) =>
    appendForwarded(out, input),
  );
  appendDebts(lines, input);
  appendOpenRecords(lines, input);
  appendWholeOrBrief(lines, "codeMap", input, (out) =>
    appendCodeMap(out, input),
  );
  appendInfra(lines, input);
  appendBaseGates(lines, input);
  appendSteers(lines, input);
  appendWholeOrBrief(lines, "pmAnswers", input, (out) =>
    appendPmAnswers(out, input),
  );
  appendIntentChanges(lines, input);
  appendWholeOrBrief(lines, "spikeFindings", input, (out) =>
    appendSpikeFindings(out, input),
  );
  appendTaskFiles(lines, input);
}

/**
 * The derived state behind the pack as JSON: every task, hold, debt and
 * pointer, with no cap. The pack preparer reads it and returns the sections it
 * judges better as a brief; the render above places them and consumes the same
 * input. Every brief's pointer names this file and its section.
 */
/** Every task with its derived run-state, sorted by slug. */
function contextTaskStatuses(input: ContextPackInput) {
  return [...input.tasks]
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((task) => {
      const state = input.state.tasks[task.slug];
      return {
        slug: task.slug,
        title: task.title,
        scope: task.scope,
        status: input.running?.includes(task.slug)
          ? "running"
          : (state?.status ?? "unknown"),
        kind: task.kind,
        round: state?.round ?? 1,
        turns: state?.turns ?? 0,
        deps: task.deps,
        commit: state?.commit ?? null,
        cause: state?.cause ?? null,
      };
    });
}

/** Parked tasks with the cause a reader needs, defaulted when none recorded. */
function contextParked(statuses: ReturnType<typeof contextTaskStatuses>) {
  return statuses
    .filter((task) => task.status === "parked")
    .map((task) => ({
      slug: task.slug,
      cause: task.cause ?? makeCause("unknown", "no recorded cause"),
    }));
}

/** Pending/ready tasks and the deps still keeping them waiting. */
function contextPending(
  input: ContextPackInput,
  statuses: ReturnType<typeof contextTaskStatuses>,
) {
  return statuses
    .filter((task) => task.status === "pending" || task.status === "ready")
    .map((task) => {
      const waitsOn = task.deps.filter((dep) => {
        const status = input.state.tasks[dep]?.status;
        return status !== "merged" && status !== "finished";
      });
      return { slug: task.slug, waitsOn };
    });
}

/** Steers with the hold that blocks them, when one does. */
function contextSteers(input: ContextPackInput) {
  const heldBySteer = new Map(
    (input.holds ?? []).map((hold) => [hold.steer, hold]),
  );
  return input.steers.map((steer) => {
    const hold = heldBySteer.get(steer.id);
    return {
      id: steer.id,
      path: steer.relPath,
      urgent: steer.urgent,
      holds: hold ? (hold.goal ? "goal" : [...hold.slugs].sort()) : [],
    };
  });
}

/** The document's path block; an absent optional path stays null. */
function contextPaths(input: ContextPackInput) {
  return {
    intent: input.intentPath,
    plan: input.planPath,
    checkout: input.checkout,
    integrationBranch: input.integrationBranch,
    headHash: input.headHash,
    goalStartHash: input.goalStartHash ?? null,
    lastIterationHash: input.lastIterationHash ?? null,
    records: input.recordsDir,
    tasks: input.tasksDir,
    previousSummary: input.previousSummary ?? null,
    previousWaste: input.previousWaste ?? null,
    previousDigest: input.digestPath ?? null,
    runConfig: input.runConfigPath ?? null,
  };
}

/** Spike findings sorted by slug. */
function contextSpikeFindings(input: ContextPackInput) {
  return [...(input.spikeFindings ?? [])].sort((a, b) =>
    a.slug.localeCompare(b.slug),
  );
}

/** Task files sorted by slug, each at its goal-relative path. */
function contextTaskFiles(input: ContextPackInput) {
  return [...input.tasks]
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((task) => ({
      slug: task.slug,
      path: `${input.tasksDir}/${task.slug}.md`,
    }));
}

export function renderContextData(input: ContextPackInput): string {
  const statuses = contextTaskStatuses(input);
  const parked = contextParked(statuses);
  const pending = contextPending(input, statuses);
  const steers = contextSteers(input);
  const data = {
    goal: input.goal,
    iteration: input.iteration,
    epic: input.epic ?? null,
    paths: contextPaths(input),
    tasks: statuses,
    epics: input.state.epics,
    parked,
    pending,
    agedReady: input.agedReady ?? null,
    planCheck: input.planCheck ?? null,
    planReview: input.planReview ?? null,
    spikeProposals: input.spikeProposals ?? [],
    forwarded: input.forwarded,
    debts: input.debts,
    openRecords: input.openRecords ?? [],
    codeMap: input.codeMap ?? [],
    infra: { setup: input.setup, gates: input.gates },
    baseGates: input.baseGates ?? null,
    steers,
    pmAnswers: input.pmAnswers ?? [],
    spikeFindings: contextSpikeFindings(input),
    taskFiles: contextTaskFiles(input),
  };
  return `${JSON.stringify(data, null, 2)}\n`;
}
