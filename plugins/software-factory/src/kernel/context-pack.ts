// biome-ignore-all lint/complexity: split-rest
import type { ConcernKind } from "../core/concern-types.js";
import { concernFingerprint } from "../core/concerns.js";
import { formatCause, makeCause } from "./cause.js";
import type { BaseGateState } from "./baseline.js";
import { OPEN_TASK_STATUSES, type OpenDebt } from "./derive.js";
import type { Steer } from "./mailbox.js";
import { KERNEL_STEPS } from "./types.js";
import type {
  Cause,
  PlanCheckEvidence,
  PlanReviewFinding,
  State,
  StepRecord,
  TaskFile,
} from "./types.js";

export interface ForwardedConcern {
  source: string;
  calibration: string;
  kind: string;
  text: string;
  evidence?: string;
  /** Repeat count for the same fingerprint, e.g. the same risk raised twice. */
  occurrences?: number;
}

/** Whose pack reads a record: the goal's architect or one epic's. */
export type ConcernAudience = { kind: "goal" } | { kind: "epic"; epic: string };

/** The scope a pack reader sees, for filtering records before they render. */
export interface ConcernScope {
  /** Every task, so a record's slug maps to the epic that owns it. */
  tasks?: readonly TaskFile[];
  /** Absent keeps every record, the depth-1 pack. */
  audience?: ConcernAudience;
}

/** Task slug -> owning epic, from every task file. */
function epicByTask(tasks: readonly TaskFile[]): Map<string, string> {
  const bySlug = new Map<string, string>();
  for (const task of tasks) {
    if (task.epic !== undefined) bySlug.set(task.slug, task.epic);
  }
  return bySlug;
}

/**
 * A goal-level record is readable at every level. A task's record belongs to
 * its task's epic; a subarchitect's record is that epic's brief upward, so the
 * goal architect reads it too. One epic never reads another's task records.
 */
function visibleToAudience(
  record: StepRecord,
  bySlug: ReadonlyMap<string, string>,
  audience: ConcernAudience,
): boolean {
  if (record.step === "subarchitect")
    return audience.kind === "goal" || record.architect === audience.epic;
  const epic = record.slug ? bySlug.get(record.slug) : undefined;
  if (epic === undefined) return true;
  return audience.kind === "epic" && audience.epic === epic;
}

/** The records one pack may read: everything `audience` is allowed to see. */
export function recordsForAudience(
  records: readonly StepRecord[],
  tasks: readonly TaskFile[],
  audience: ConcernAudience,
): StepRecord[] {
  const bySlug = epicByTask(tasks);
  return records.filter((record) =>
    visibleToAudience(record, bySlug, audience),
  );
}

/** The latest plan-check turn's report, for the architect that it summoned. */
export interface PlanCheckPack {
  iteration: number;
  verdict: string;
  evidence: PlanCheckEvidence[];
}

/** The latest plan-review round's advisory findings, for the next architect turn. */
export interface PlanReviewPack {
  iteration: number;
  /** The reviewer aliases that delivered findings, in run order. */
  reviewers: string[];
  /** Technical concerns; the architect marks them first. */
  technical: PlanReviewFinding[];
  /** Plan-and-dependency notes; numbered after the technical concerns. */
  planNotes: PlanReviewFinding[];
}

/** One plan-review finding, numbered as the architect marks it. */
export interface NumberedPlanFinding extends PlanReviewFinding {
  /** 1-based across both lists: technical first, then plan notes. */
  number: number;
  kind: "technical" | "planNote";
}

/** The findings in mark order: technical concerns first, then plan notes. */
export function numberedPlanFindings(
  findings: Pick<PlanReviewPack, "technical" | "planNotes">,
): NumberedPlanFinding[] {
  return [
    ...findings.technical.map((finding) => ({
      ...finding,
      kind: "technical" as const,
    })),
    ...findings.planNotes.map((finding) => ({
      ...finding,
      kind: "planNote" as const,
    })),
  ].map((finding, index) => ({ ...finding, number: index + 1 }));
}

/** One finding line: `<n>. <plan line> — <what would satisfy it>`. */
export function formatPlanFinding(finding: NumberedPlanFinding): string {
  return `${finding.number}. ${finding.planLine} — ${finding.finding}`;
}

/** A spike's finding: its sealed report, or the outcome summary for a legacy spike. */
export interface SpikeFinding {
  slug: string;
  finding: string;
}

/**
 * One pending steer the intent agent carried into the goal's intent, or tried
 * and failed to carry. The architect plans from the diff and sees the steer
 * itself in the pending list.
 */
export interface IntentChange {
  steer: string;
  /** Goal-relative steer file, for the architect to read beside the diff. */
  relPath: string;
  /** Absolute record directory of the intent turn. */
  record: string;
  /** Unified diff the turn carried; absent when it carried nothing. */
  diff?: string;
  /** Why the turn carried nothing; the steer still needs the architect. */
  failure?: string;
}

/**
 * A ready task that started no task turn in the segment before this pack, and
 * what withheld it. Dispatch decides admission from these facts; the pack only
 * reports them, so an aging task cannot stay invisible across boundaries.
 */
export interface ReadyAgingTask {
  slug: string;
  /** Causes in the pack's reporting order; empty when none is recorded. */
  causes: string[];
}

export interface ReadyAgingInput {
  tasks: readonly TaskFile[];
  state: State;
  records: readonly StepRecord[];
  /** The segment whose turns are counted; the pack that reports it follows. */
  segment: number;
  /** Steers still pending: a processed steer's hold no longer decides admission. */
  pendingSteers: readonly string[];
  holds: readonly { steer: string; slugs: readonly string[] }[];
  /** Ready tasks whose next agent step has no live tier, by slug. */
  unavailableAliases?: ReadonlyMap<string, string>;
}

/** One parked task's cause as the pack reads it. */
function parkedCauseText(cause: Cause | undefined): string {
  return cause ? formatCause(cause) : "no recorded cause";
}

export interface ContextPackInput {
  goal: string;
  iteration: number;
  /** The one epic this pack serves; absent for the goal architect's pack. */
  epic?: string;
  intentPath: string;
  planPath: string;
  checkout: string;
  integrationBranch: string;
  headHash: string;
  recordsDir: string;
  tasksDir: string;
  previousSummary?: string;
  /** The previous iteration summary's `## Waste` section, carried into the pack. */
  previousWaste?: string;
  digestPath?: string;
  tasks: TaskFile[];
  state: State;
  /** Findings of spikes that produced one; the architect plans from them. */
  spikeFindings?: SpikeFinding[];
  running?: string[];
  /** Shallow directory index of the goal checkout, already grouped. */
  codeMap?: string[];
  /** Steers routed to the architect; PM-handled steers are answered elsewhere, never here. */
  steers: Steer[];
  /** The PM's hold per steer; the pack shows each steer's held slugs under it. */
  holds?: { steer: string; slugs: readonly string[]; goal: boolean }[];
  /** The PM's routed answers, one line per steer, for architect context. */
  pmAnswers?: string[];
  /** Pending steers the intent agent carried or failed to carry before this pack. */
  intentChanges?: IntentChange[];
  setup: string[];
  gates: { id: string; command: string }[];
  /** Last recorded pre-flight base run; absent when it was skipped. */
  baseGates?: BaseGateState;
  forwarded: ForwardedConcern[];
  /** Every open debt-kind concern, the register's whole content. */
  debts: OpenDebt[];
  /** Absolute path of the run config the launch loaded; absent when not recorded. */
  runConfigPath?: string;
  /** Records with started.yaml but no end.yaml, as paths the architect can drill into. */
  openRecords?: string[];
  /** The latest plan-check report; absent when the checker never ran. */
  planCheck?: PlanCheckPack;
  /** The latest plan-review findings; absent when the reviewer never ran. */
  planReview?: PlanReviewPack;
  /** Ready tasks with no turn in the previous segment; absent before one exists. */
  agedReady?: ReadyAgingTask[];
}

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

function short(hash: string | undefined): string {
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

/**
 * Deterministic index, never pasted content (KERNEL0 §5): status, hashes,
 * rounds, infra commands and paths the architect can drill into. The render
 * reads no clock; volatile admission facts (a pending hold, a pool's reset
 * time) arrive through the input, so the same input renders the same pack.
 * Uncapped: the status table and every pointer section render whole on every
 * pack.
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
    `- records: ${input.recordsDir}`,
    `- previous iteration summary: ${input.previousSummary ?? "none"}`,
    `- previous-launch digest: ${input.digestPath ?? "none"}`,
    `- run config: ${input.runConfigPath ?? "none"}`,
    "",
    "## Task status",
    "| slug | status | kind | round | turns | deps | commit |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const task of [...input.tasks].sort((a, b) =>
    a.slug.localeCompare(b.slug),
  )) {
    const state = input.state.tasks[task.slug];
    const status = input.running?.includes(task.slug)
      ? "running"
      : (state?.status ?? "unknown");
    lines.push(
      `| ${task.slug} | ${status} | ${task.kind} | ${state?.round ?? 1} | ${state?.turns ?? 0} | ${
        task.deps.join(",") || "-"
      } | ${short(state?.commit)} |`,
    );
  }
  if (input.tasks.length === 0) lines.push("| (none yet) | | | | | | |");

  const epicNames = Object.keys(input.state.epics)
    .filter((name) => input.epic === undefined || name === input.epic)
    .sort();
  if (epicNames.length > 0) {
    lines.push("", input.epic ? "## Epic" : "## Epics");
    for (const name of epicNames) {
      const epic = input.state.epics[name]!;
      const open = epic.tasks.filter((slug) =>
        OPEN_TASK_STATUSES.has(input.state.tasks[slug]?.status ?? "pending"),
      ).length;
      const total = epic.tasks.length;
      lines.push(
        `- \`${name}\`: ${epic.done ? "done" : "open"} — subarchitect ${epic.decision ?? "no turn"}; ${open} of ${total} ${total === 1 ? "task" : "tasks"} open`,
      );
    }
  }

  const parked = input.tasks
    .filter((t) => input.state.tasks[t.slug]?.status === "parked")
    .map(
      (t) =>
        `- ${t.slug}: ${parkedCauseText(input.state.tasks[t.slug]?.cause)}`,
    );
  if (parked.length > 0)
    lines.push(
      "",
      "## Parked by cause (terminal; continue via a new slug)",
      ...parked,
    );

  const pending = input.tasks
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
  if (pending.length > 0) lines.push("", "## Pending", ...pending);

  if (input.agedReady !== undefined) {
    lines.push("", "## Ready, no turn in the last segment");
    if (input.agedReady.length === 0) {
      lines.push("- none");
    } else {
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
  }

  if (input.planCheck) {
    lines.push(
      "",
      "## Plan check (the evidence that summoned the architect)",
      `- iteration ${input.planCheck.iteration}, verdict ${input.planCheck.verdict}`,
    );
    if (input.planCheck.evidence.length === 0)
      lines.push("- no evidence recorded");
    else
      for (const entry of input.planCheck.evidence)
        lines.push(`- ${entry.item} (${entry.status}): ${entry.evidence}`);
  }

  const review = input.planReview;
  if (review) {
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

  if (input.previousWaste) {
    lines.push(
      "",
      "## Waste (previous iteration summary)",
      ...input.previousWaste.split("\n"),
    );
  }

  if (input.forwarded.length > 0) {
    lines.push("", "## Forwarded concerns (architect/owner)");
    for (const concern of input.forwarded) lines.push(formatForwarded(concern));
  }

  lines.push(
    "",
    "## Debt register (open debt-kind concerns; own one by citing its id in a plan bullet, or close it with `debtClosed: [{id, reason}]`)",
  );
  if (input.debts.length === 0) lines.push("- none open");
  else for (const debt of input.debts) lines.push(formatDebt(debt));

  lines.push("", "## Open records (started, no end)");
  if (!input.openRecords || input.openRecords.length === 0)
    lines.push("- none");
  else for (const record of input.openRecords) lines.push(`- ${record}`);

  if (input.codeMap && input.codeMap.length > 0) {
    lines.push("", "## Code map (shallow; read paths directly)");
    lines.push(...input.codeMap.map((entry) => `- ${entry}`));
  }

  lines.push("", "## Infra");
  lines.push(
    `- setup: ${input.setup.length ? input.setup.join(" && ") : "none"}`,
  );
  for (const gate of input.gates)
    lines.push(`- gate ${gate.id}: ${gate.command}`);

  lines.push("", "## Base gates");
  if (!input.baseGates) {
    lines.push("- not recorded");
  } else if (input.baseGates.ok) {
    lines.push(`- base ${short(input.baseGates.commit)}: green`);
  } else {
    lines.push(
      `- base ${short(input.baseGates.commit)} was red before any task (pre-existing; not a task finding):`,
    );
    for (const check of input.baseGates.checks.filter((c) => !c.ok)) {
      lines.push(`  - ${check.name}: ${check.summary}`);
    }
  }

  lines.push("", "## Pending steers");
  if (input.steers.length === 0) {
    lines.push("- none");
  } else {
    const heldBySteer = new Map(
      (input.holds ?? []).map((hold) => [hold.steer, hold]),
    );
    for (const steer of input.steers) {
      lines.push(
        `- ${steer.id}: ${steer.relPath}${steer.urgent ? " (urgent)" : ""}`,
      );
      const hold = heldBySteer.get(steer.id);
      if (hold?.goal) lines.push(`  - holds: goal`);
      else if (hold && hold.slugs.length > 0)
        lines.push(`  - holds: ${[...hold.slugs].sort().join(", ")}`);
    }
  }

  lines.push("", "## PM steer answers");
  lines.push(
    input.pmAnswers && input.pmAnswers.length > 0
      ? input.pmAnswers.join("\n")
      : "- none",
  );

  if (input.intentChanges && input.intentChanges.length > 0) {
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

  if (input.spikeFindings && input.spikeFindings.length > 0) {
    lines.push("", "## Spike findings");
    for (const { slug, finding } of [...input.spikeFindings].sort((a, b) =>
      a.slug.localeCompare(b.slug),
    )) {
      lines.push(`- ${slug}:`, ...finding.split("\n").map((l) => `  ${l}`));
    }
  }

  lines.push("", "## Task files");
  for (const task of [...input.tasks].sort((a, b) =>
    a.slug.localeCompare(b.slug),
  )) {
    lines.push(`- ${task.slug}: ${input.tasksDir}/${task.slug}.md`);
  }

  return lines.join("\n") + "\n";
}

/**
 * The derived state behind the pack as JSON: every task, hold, debt and
 * pointer, with no cap. The pack preparer reads it to decide what the index
 * keeps in full and what it names with a pointer and a summary; the fallback
 * render above consumes the same input.
 */
export function renderContextData(input: ContextPackInput): string {
  const statuses = [...input.tasks]
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
  const parked = statuses
    .filter((task) => task.status === "parked")
    .map((task) => ({
      slug: task.slug,
      cause: task.cause ?? makeCause("unknown", "no recorded cause"),
    }));
  const pending = statuses
    .filter((task) => task.status === "pending" || task.status === "ready")
    .map((task) => {
      const waitsOn = task.deps.filter((dep) => {
        const status = input.state.tasks[dep]?.status;
        return status !== "merged" && status !== "finished";
      });
      return { slug: task.slug, waitsOn };
    });
  const heldBySteer = new Map(
    (input.holds ?? []).map((hold) => [hold.steer, hold]),
  );
  const steers = input.steers.map((steer) => {
    const hold = heldBySteer.get(steer.id);
    return {
      id: steer.id,
      path: steer.relPath,
      urgent: steer.urgent,
      holds: hold ? (hold.goal ? "goal" : [...hold.slugs].sort()) : [],
    };
  });
  const data = {
    goal: input.goal,
    iteration: input.iteration,
    epic: input.epic ?? null,
    paths: {
      intent: input.intentPath,
      plan: input.planPath,
      checkout: input.checkout,
      integrationBranch: input.integrationBranch,
      headHash: input.headHash,
      records: input.recordsDir,
      tasks: input.tasksDir,
      previousSummary: input.previousSummary ?? null,
      previousWaste: input.previousWaste ?? null,
      previousDigest: input.digestPath ?? null,
      runConfig: input.runConfigPath ?? null,
    },
    tasks: statuses,
    epics: input.state.epics,
    parked,
    pending,
    agedReady: input.agedReady ?? null,
    planCheck: input.planCheck ?? null,
    planReview: input.planReview ?? null,
    forwarded: input.forwarded,
    debts: input.debts,
    openRecords: input.openRecords ?? [],
    codeMap: input.codeMap ?? [],
    infra: { setup: input.setup, gates: input.gates },
    baseGates: input.baseGates ?? null,
    steers,
    pmAnswers: input.pmAnswers ?? [],
    spikeFindings: [...(input.spikeFindings ?? [])].sort((a, b) =>
      a.slug.localeCompare(b.slug),
    ),
    taskFiles: [...input.tasks]
      .sort((a, b) => a.slug.localeCompare(b.slug))
      .map((task) => ({
        slug: task.slug,
        path: `${input.tasksDir}/${task.slug}.md`,
      })),
  };
  return `${JSON.stringify(data, null, 2)}\n`;
}

/** Boundary and architecture roles run between segments and never start a task turn. */
const KERNEL_STEP_IDS: ReadonlySet<string> = new Set(KERNEL_STEPS);

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
    if (record.iteration !== segment) continue;
    if (
      record.actor === "agent" &&
      record.slug &&
      !KERNEL_STEP_IDS.has(record.step)
    ) {
      started.add(record.slug);
    }
    if (record.actor === "script" && record.slug && record.endedAt) {
      if (record.step === "merge" && record.ok === true)
        terminal.set(record.slug, "merged");
      else if (record.step === "finish" && record.ok === true)
        terminal.set(record.slug, "finished");
    }
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
export function readyAging(input: ReadyAgingInput): ReadyAgingTask[] {
  const { started, terminal } = segmentStarts(input.records, input.segment);
  const ready = new Set(
    input.tasks
      .filter((task) => input.state.tasks[task.slug]?.status === "ready")
      .map((task) => task.slug),
  );
  const pending = new Set(input.pendingSteers);
  const heldBy = new Map<string, string[]>();
  for (const hold of input.holds) {
    if (!pending.has(hold.steer)) continue;
    for (const slug of hold.slugs)
      heldBy.set(slug, [...(heldBy.get(slug) ?? []), hold.steer]);
  }
  // A live-area clash is either a task that ran in the segment or one still
  // ready beside this one; a merged task's area is history.
  const active = new Set([...started, ...ready]);
  const ordered = [...input.tasks].sort((a, b) => a.slug.localeCompare(b.slug));
  const aged: ReadyAgingTask[] = [];
  for (const task of ordered) {
    if (!ready.has(task.slug) || started.has(task.slug)) continue;
    const causes: string[] = [];
    const steers = [...new Set(heldBy.get(task.slug) ?? [])].sort();
    if (steers.length > 0)
      causes.push(
        `${steers.length === 1 ? "held by steer" : "held by steers"} ${steers.join(", ")}`,
      );
    for (const dep of [...new Set(task.deps)].sort()) {
      const end = terminal.get(dep);
      if (end) causes.push(`dep ${dep} ${end} in iteration ${input.segment}`);
    }
    for (const other of ordered) {
      if (other.slug === task.slug || !active.has(other.slug)) continue;
      for (const area of sharedAreas(task.scope, other.scope))
        causes.push(`area "${area}" clashes with ${other.slug}`);
    }
    const alias = input.unavailableAliases?.get(task.slug);
    if (alias !== undefined) causes.push(alias);
    aged.push({ slug: task.slug, causes });
  }
  return aged;
}

/**
 * Groups repository-relative paths into a shallow directory index. The
 * architect gets shapes and paths, never file bodies; scouting reads them.
 * Every group is kept: the pack preparer decides what the index shows.
 */
export function shallowCodeMap(paths: string[]): string[] {
  const counts = new Map<string, number>();
  for (const raw of paths) {
    const clean = raw.replace(/\\/g, "/").replace(/^\.\//, "");
    if (!clean) continue;
    const parts = clean.split("/");
    if (parts[0] === "node_modules" || parts[0] === ".git") continue;
    const key = parts.length === 1 ? "(root)" : `${parts[0]}/${parts[1]}/`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, n]) => `${key} — ${n} file${n === 1 ? "" : "s"}`);
}

function calibrationRank(calibration: string): number {
  return calibration === "owner" ? 2 : calibration === "architect" ? 1 : 0;
}

/**
 * The kept fingerprint function hashes the kind string; the kernel's kinds are
 * the manifesto's four (`debt|risk|uncertainty|choice`), so the stored v2 enum
 * is only a type-level stand-in here. Same text and evidence, same identity.
 */
function fingerprintOf(kind: string, text: string, evidence?: string): string {
  return concernFingerprint({
    kind: kind as ConcernKind,
    summary: text,
    ...(evidence ? { location: { file: evidence } } : {}),
  });
}

/**
 * Collects forwarded concerns from the records an audience may read,
 * deduplicated by the kept concern fingerprint. The same text raised every
 * round is one line with a count; an owner calibration outranks an architect
 * one. FYI entries do not travel here; the debt register lists them. Without
 * an audience, every record counts: the depth-1 pack's single architect.
 */
export function forwardedConcerns(
  records: StepRecord[],
  scope: ConcernScope = {},
): ForwardedConcern[] {
  const bySlug = epicByTask(scope.tasks ?? []);
  const visible = (record: StepRecord): boolean => {
    if (scope.audience === undefined) return true;
    // A subarchitect's concerns are its brief upward, never its own input.
    if (scope.audience.kind === "epic" && record.step === "subarchitect")
      return false;
    return visibleToAudience(record, bySlug, scope.audience);
  };
  const byFingerprint = new Map<string, ForwardedConcern>();
  const add = (concern: ForwardedConcern, fingerprint: string): void => {
    const existing = byFingerprint.get(fingerprint);
    if (!existing) {
      byFingerprint.set(fingerprint, { ...concern, occurrences: 1 });
      return;
    }
    existing.occurrences = (existing.occurrences ?? 1) + 1;
    if (
      calibrationRank(concern.calibration) >=
      calibrationRank(existing.calibration)
    ) {
      existing.calibration = concern.calibration;
      existing.kind = concern.kind;
      existing.text = concern.text;
      existing.evidence = concern.evidence;
    }
    existing.source = concern.source;
  };

  for (const rec of records) {
    if (!rec.outcome || !visible(rec)) continue;
    for (const concern of rec.outcome.concerns) {
      if (concern.calibration === "fyi") continue;
      const source = `${rec.slug ?? rec.architect ?? "goal"} ${rec.step} r${rec.round}`;
      const fingerprint = fingerprintOf(
        concern.kind,
        concern.text,
        concern.evidence,
      );
      add(
        {
          source,
          calibration: concern.calibration,
          kind: concern.kind,
          text: concern.text,
          evidence: concern.evidence,
        },
        fingerprint,
      );
    }
    for (const forwarded of rec.outcome.forward) {
      const source = `${rec.slug ?? rec.architect ?? "goal"} ${rec.step} r${rec.round}`;
      const fingerprint = fingerprintOf("forward", forwarded);
      add(
        { source, calibration: "architect", kind: "forward", text: forwarded },
        fingerprint,
      );
    }
  }
  return [...byFingerprint.values()];
}
