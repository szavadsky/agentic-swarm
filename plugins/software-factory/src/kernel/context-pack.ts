import type { State, StepRecord, TaskFile } from "./types.js";
import type { Steer } from "./mailbox.js";

export interface ForwardedConcern {
  source: string;
  calibration: string;
  kind: string;
  text: string;
  evidence?: string;
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
  tasks: TaskFile[];
  state: State;
  running?: string[];
  steers: Steer[];
  setup: string[];
  gates: { id: string; command: string }[];
  forwarded: ForwardedConcern[];
  maxBytes?: number;
}

const DEFAULT_MAX_BYTES = 8000;

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
  if (parked.length > 0) lines.push("", "## Parked (terminal; continue via a new slug)", ...parked);

  if (input.forwarded.length > 0) {
    lines.push("", "## Forwarded concerns");
    for (const concern of input.forwarded) {
      lines.push(
        `- [${concern.calibration}/${concern.kind}] ${concern.text}${concern.evidence ? ` (${concern.evidence})` : ""} — ${concern.source}`
      );
    }
  }

  lines.push("", "## Infra");
  lines.push(`- setup: ${input.setup.length ? input.setup.join(" && ") : "none"}`);
  for (const gate of input.gates) lines.push(`- gate ${gate.id}: ${gate.command}`);

  lines.push("", "## Steers");
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

/** Collects architect/owner-calibrated concerns and reviewer forwards from records. */
export function forwardedConcerns(records: StepRecord[], sinceIteration: number): ForwardedConcern[] {
  const out: ForwardedConcern[] = [];
  for (const rec of records) {
    if (!rec.outcome || rec.iteration < sinceIteration) continue;
    for (const concern of rec.outcome.concerns) {
      if (concern.calibration === "fyi") continue;
      out.push({
        source: `${rec.slug ?? "goal"} ${rec.step} r${rec.round}`,
        calibration: concern.calibration,
        kind: concern.kind,
        text: concern.text,
        evidence: concern.evidence,
      });
    }
    for (const forwarded of rec.outcome.forward) {
      out.push({
        source: `${rec.slug ?? "goal"} ${rec.step} r${rec.round}`,
        calibration: "forward",
        kind: "forward",
        text: forwarded,
      });
    }
  }
  return out.slice(-20);
}
