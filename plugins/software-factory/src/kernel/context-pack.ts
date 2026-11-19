// biome-ignore-all lint/complexity: split-rest
import type { ConcernKind } from "../core/concern-types.js";
import { concernFingerprint } from "../core/concerns.js";
import type { BaseGateState } from "./baseline.js";
import type { OpenDebt } from "./derive.js";
import type { Steer } from "./mailbox.js";
import { BOUNDARY_STEPS } from "./types.js";
import type {
  PlanCheckEvidence,
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

/** The latest plan-check turn's report, for the architect that it summoned. */
export interface PlanCheckPack {
  iteration: number;
  verdict: string;
  evidence: PlanCheckEvidence[];
}

/** The latest plan-review turn's advisory findings, for the next architect turn. */
export interface PlanReviewPack {
  iteration: number;
  /** The resolved reviewer alias, e.g. `plan-reviewer`. */
  alias: string;
  /** The reviewer's numbered findings, one paragraph or list. */
  summary: string;
}

/** A spike's finding: its sealed report, or the outcome summary for a legacy spike. */
export interface SpikeFinding {
  slug: string;
  finding: string;
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

export interface ContextPackInput {
  goal: string;
  iteration: number;
  intentPath: string;
  planPath: string;
  checkout: string;
  integrationBranch: string;
  headHash: string;
  recordsDir: string;
  tasksDir: string;
  previousSummary?: string;
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

const CODE_MAP_ENTRIES = 40;

/** Goal-relative path the boundary renders an iteration's pack to. */
export function contextPackRelPath(iteration: number): string {
  return `iterations/${iteration}/context-pack.md`;
}

/** Goal-relative path an iteration's guaranteed summary is written to. */
export function summaryRelPath(iteration: number): string {
  return `iterations/${iteration}/summary.md`;
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
  const lines: string[] = [
    `# Context pack — goal ${input.goal}, iteration ${input.iteration}`,
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

  const parked = input.tasks
    .filter((t) => input.state.tasks[t.slug]?.status === "parked")
    .map(
      (t) =>
        `- ${t.slug}: ${input.state.tasks[t.slug]?.cause ?? "no recorded cause"}`,
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

  if (input.planReview) {
    lines.push(
      "",
      "## Plan review (advisory findings; mark each finding helpful or unhelpful in planReviewMarks)",
      `- iteration ${input.planReview.iteration}, reviewer \`${input.planReview.alias}\``,
      "",
      input.planReview.summary,
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

/** Boundary roles run between segments and never start a task turn. */
const BOUNDARY_STEP_IDS: ReadonlySet<string> = new Set(BOUNDARY_STEPS);

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
      !BOUNDARY_STEP_IDS.has(record.step)
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
 */
export function shallowCodeMap(
  paths: string[],
  maxEntries = CODE_MAP_ENTRIES,
): string[] {
  const counts = new Map<string, number>();
  for (const raw of paths) {
    const clean = raw.replace(/\\/g, "/").replace(/^\.\//, "");
    if (!clean) continue;
    const parts = clean.split("/");
    if (parts[0] === "node_modules" || parts[0] === ".git") continue;
    const key = parts.length === 1 ? "(root)" : `${parts[0]}/${parts[1]}/`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const entries = [...counts.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  const kept = entries
    .slice(0, maxEntries)
    .map(([key, n]) => `${key} — ${n} file${n === 1 ? "" : "s"}`);
  if (entries.length > maxEntries)
    kept.push(`… ${entries.length - maxEntries} more groups`);
  return kept;
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
 * Collects forwarded concerns from records, deduplicated by the kept concern
 * fingerprint. The same text raised every round is one line with a count; an
 * owner calibration outranks an architect one. FYI entries do not travel here;
 * the debt register lists them.
 */
export function forwardedConcerns(records: StepRecord[]): ForwardedConcern[] {
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
    if (!rec.outcome) continue;
    for (const concern of rec.outcome.concerns) {
      if (concern.calibration === "fyi") continue;
      const source = `${rec.slug ?? "goal"} ${rec.step} r${rec.round}`;
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
      const source = `${rec.slug ?? "goal"} ${rec.step} r${rec.round}`;
      const fingerprint = fingerprintOf("forward", forwarded);
      add(
        { source, calibration: "architect", kind: "forward", text: forwarded },
        fingerprint,
      );
    }
  }
  return [...byFingerprint.values()];
}
