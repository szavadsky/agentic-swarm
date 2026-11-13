import { concernFingerprint } from "../core/concerns.js";
import type { ConcernKind } from "../core/concern-types.js";
import type { BaseGateState } from "./baseline.js";
import type { State, StepRecord, TaskFile } from "./types.js";
import type { Steer } from "./mailbox.js";

export interface ForwardedConcern {
  source: string;
  calibration: string;
  kind: string;
  text: string;
  evidence?: string;
  /** Repeat count for the same fingerprint, e.g. the same risk raised twice. */
  occurrences?: number;
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
  running?: string[];
  /** Shallow directory index of the goal checkout, already grouped. */
  codeMap?: string[];
  steers: Steer[];
  setup: string[];
  gates: { id: string; command: string }[];
  /** Last recorded pre-flight base run; absent when it was skipped. */
  baseGates?: BaseGateState;
  forwarded: ForwardedConcern[];
  maxBytes?: number;
}

const DEFAULT_MAX_BYTES = 8000;
const CODE_MAP_ENTRIES = 40;

function short(hash: string | undefined): string {
  return hash ? hash.slice(0, 10) : "-";
}

/**
 * Deterministic index, never pasted content (KERNEL0 §5): status, hashes,
 * rounds, infra commands and paths the architect can drill into. No clock,
 * no timestamps, so the same derived state renders the same pack.
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
    "",
    "## Task status",
    "| slug | status | kind | round | turns | deps | commit |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const task of [...input.tasks].sort((a, b) => a.slug.localeCompare(b.slug))) {
    const state = input.state.tasks[task.slug];
    const status = input.running?.includes(task.slug) ? "running" : (state?.status ?? "unknown");
    lines.push(
      `| ${task.slug} | ${status} | ${task.kind} | ${state?.round ?? 1} | ${state?.turns ?? 0} | ${
        task.deps.join(",") || "-"
      } | ${short(state?.commit)} |`
    );
  }
  if (input.tasks.length === 0) lines.push("| (none yet) | | | | | | |");

  const parked = input.tasks
    .filter((t) => input.state.tasks[t.slug]?.status === "parked")
    .map((t) => `- ${t.slug}: ${input.state.tasks[t.slug]?.cause ?? "no recorded cause"}`);
  if (parked.length > 0) lines.push("", "## Parked by cause (terminal; continue via a new slug)", ...parked);

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

  if (input.forwarded.length > 0) {
    lines.push("", "## Forwarded concerns (architect/owner)");
    for (const concern of input.forwarded) {
      const repeats = concern.occurrences && concern.occurrences > 1 ? ` x${concern.occurrences}` : "";
      lines.push(
        `- [${concern.calibration}/${concern.kind}]${repeats} ${concern.text}${
          concern.evidence ? ` (${concern.evidence})` : ""
        } — ${concern.source}`
      );
    }
  }

  if (input.codeMap && input.codeMap.length > 0) {
    lines.push("", "## Code map (shallow; read paths directly)");
    lines.push(...input.codeMap.map((entry) => `- ${entry}`));
  }

  lines.push("", "## Infra");
  lines.push(`- setup: ${input.setup.length ? input.setup.join(" && ") : "none"}`);
  for (const gate of input.gates) lines.push(`- gate ${gate.id}: ${gate.command}`);

  lines.push("", "## Base gates");
  if (!input.baseGates) {
    lines.push("- not recorded");
  } else if (input.baseGates.ok) {
    lines.push(`- base ${short(input.baseGates.commit)}: green`);
  } else {
    lines.push(
      `- base ${short(input.baseGates.commit)} was red before any task (pre-existing; not a task finding):`
    );
    for (const check of input.baseGates.checks.filter((c) => !c.ok)) {
      lines.push(`  - ${check.name}: ${check.summary}`);
    }
  }

  lines.push("", "## Pending steers");
  lines.push(
    input.steers.length > 0
      ? input.steers.map((s) => `- ${s.id}: ${s.relPath}`).join("\n")
      : "- none"
  );

  lines.push("", "## Task files");
  for (const task of [...input.tasks].sort((a, b) => a.slug.localeCompare(b.slug))) {
    lines.push(`- ${task.slug}: ${input.tasksDir}/${task.slug}.md`);
  }

  return capPack(lines.join("\n") + "\n", input.maxBytes ?? DEFAULT_MAX_BYTES);
}

export function capPack(text: string, maxBytes: number): string {
  const buf = Buffer.from(text, "utf8");
  if (buf.length <= maxBytes) return text;
  const suffix = "\n[pack truncated: size cap reached; drill into the paths above]\n";
  const keep = Math.max(0, maxBytes - Buffer.byteLength(suffix));
  return buf.subarray(0, keep).toString("utf8").replace(/\uFFFD+$/g, "") + suffix;
}

/**
 * Groups repository-relative paths into a shallow directory index. The
 * architect gets shapes and paths, never file bodies; scouting reads them.
 */
export function shallowCodeMap(paths: string[], maxEntries = CODE_MAP_ENTRIES): string[] {
  const counts = new Map<string, number>();
  for (const raw of paths) {
    const clean = raw.replace(/\\/g, "/").replace(/^\.\//, "");
    if (!clean) continue;
    const parts = clean.split("/");
    if (parts[0] === "node_modules" || parts[0] === ".git") continue;
    const key = parts.length === 1 ? "(root)" : `${parts[0]}/${parts[1]}/`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const entries = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const kept = entries.slice(0, maxEntries).map(([key, n]) => `${key} — ${n} file${n === 1 ? "" : "s"}`);
  if (entries.length > maxEntries) kept.push(`… ${entries.length - maxEntries} more groups`);
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
 * owner calibration outranks an architect one. FYI entries do not travel.
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
    if (calibrationRank(concern.calibration) >= calibrationRank(existing.calibration)) {
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
      const fingerprint = fingerprintOf(concern.kind, concern.text, concern.evidence);
      add(
        {
          source,
          calibration: concern.calibration,
          kind: concern.kind,
          text: concern.text,
          evidence: concern.evidence,
        },
        fingerprint
      );
    }
    for (const forwarded of rec.outcome.forward) {
      const source = `${rec.slug ?? "goal"} ${rec.step} r${rec.round}`;
      const fingerprint = fingerprintOf("forward", forwarded);
      add({ source, calibration: "architect", kind: "forward", text: forwarded }, fingerprint);
    }
  }
  return [...byFingerprint.values()].slice(-20);
}