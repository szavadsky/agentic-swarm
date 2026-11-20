import fs from "node:fs";
import path from "node:path";
import { runAgentTurn } from "./agent.js";
import type { IntentChange } from "./context-pack.js";
import { boundaryTarget } from "./flow-context.js";
import { formatSteerTurn, type Steer } from "./mailbox.js";
import { KERNEL_TURN_STEPS } from "./outcome.js";
import { recordDirName } from "./store.js";
import type { KernelRuntime, StepRecord, SteerRoute } from "./types.js";

/** The intent agent's record step; the steer id is its record slug. */
const INTENT_STEP = "intent";

const INTENT_FILE = "intent.md";
const DIFF_CONTEXT = 3;

function intentPath(runtime: KernelRuntime): string {
  return path.join(runtime.store.goalDir, INTENT_FILE);
}

/** The goal's intent, or null when the turn removed it. */
function readIntent(runtime: KernelRuntime): string | null {
  try {
    return fs.readFileSync(intentPath(runtime), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

interface DiffLine {
  kind: " " | "-" | "+";
  text: string;
  /** 1-based line in the pre-turn text; absent on an insertion. */
  old?: number;
  /** 1-based line in the post-turn text; absent on a deletion. */
  next?: number;
}

/** Lengths of the longest common suffix runs; the diff walks it forward. */
function lcsTable(
  before: readonly string[],
  after: readonly string[],
): number[][] {
  const table: number[][] = Array.from({ length: before.length + 1 }, () =>
    new Array<number>(after.length + 1).fill(0),
  );
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      table[i]![j] =
        before[i] === after[j]
          ? table[i + 1]![j + 1]! + 1
          : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  return table;
}

/** The next diff op: an equal line, a removal, or an insertion. */
function nextKind(
  before: readonly string[],
  after: readonly string[],
  lcs: readonly number[][],
  i: number,
  j: number,
): " " | "-" | "+" {
  if (i < before.length && j < after.length && before[i] === after[j])
    return " ";
  if (j >= after.length) return "-";
  if (i >= before.length) return "+";
  return lcs[i + 1]![j]! >= lcs[i]![j + 1]! ? "-" : "+";
}

/** Longest-common-subsequence line diff; line numbers are 1-based. */
function diffLines(
  before: readonly string[],
  after: readonly string[],
): DiffLine[] {
  const lcs = lcsTable(before, after);
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length || j < after.length) {
    const kind = nextKind(before, after, lcs, i, j);
    if (kind === " ") {
      lines.push({ kind, text: before[i]!, old: i + 1, next: j + 1 });
      i += 1;
      j += 1;
    } else if (kind === "-") {
      lines.push({ kind, text: before[i]!, old: i + 1 });
      i += 1;
    } else {
      lines.push({ kind, text: after[j]!, next: j + 1 });
      j += 1;
    }
  }
  return lines;
}

/** One changed line per hunk neighbourhood, three context lines each side. */
function hunkRanges(lines: readonly DiffLine[]): [number, number][] {
  const ranges: [number, number][] = [];
  for (const [index, line] of lines.entries()) {
    if (line.kind === " ") continue;
    const start = Math.max(0, index - DIFF_CONTEXT);
    const end = Math.min(lines.length - 1, index + DIFF_CONTEXT);
    const last = ranges.at(-1);
    if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else ranges.push([start, end]);
  }
  return ranges;
}

/** A unified diff of the two intent texts, three context lines per hunk. */
function unifiedDiff(before: string, after: string): string {
  const lines = diffLines(before.split("\n"), after.split("\n"));
  const out: string[] = ["--- intent.md", "+++ intent.md"];
  for (const [start, end] of hunkRanges(lines)) {
    let oldBefore = 0;
    let newBefore = 0;
    for (const line of lines.slice(0, start)) {
      if (line.old !== undefined) oldBefore += 1;
      if (line.next !== undefined) newBefore += 1;
    }
    const hunk = lines.slice(start, end + 1);
    const oldCount = hunk.filter((line) => line.old !== undefined).length;
    const newCount = hunk.filter((line) => line.next !== undefined).length;
    const oldStart = oldCount === 0 ? oldBefore : oldBefore + 1;
    const newStart = newCount === 0 ? newBefore : newBefore + 1;
    out.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    for (const line of hunk) out.push(`${line.kind}${line.text}`);
  }
  return out.join("\n");
}

function latestIntentRecord(
  records: readonly StepRecord[],
  steerId: string,
): StepRecord | undefined {
  return records
    .filter(
      (record) =>
        record.actor === "agent" &&
        record.step === INTENT_STEP &&
        record.slug === steerId &&
        record.endedAt,
    )
    .sort((a, b) => a.seq - b.seq)
    .at(-1);
}

/**
 * The clause that lands the pre-turn intent. A delivered outcome (and only
 * one) keeps the edit and records its diff; every other end restores the
 * file, so a half-applied amendment never reaches the architect as fact.
 */
async function settleIntent(
  runtime: KernelRuntime,
  before: string,
  outcome: { status: string } | undefined,
): Promise<{ diff?: string }> {
  const after = readIntent(runtime);
  if (outcome?.status === "done" && after !== null && after !== before) {
    return { diff: unifiedDiff(before, after) };
  }
  if (after !== before) await runtime.store.writeFile(INTENT_FILE, before);
  return {};
}

/**
 * Carries one routed steer into the goal's intent with the configured intent
 * agent: it preserves the owner's wording, consolidates superseded text and
 * adds no interpretation. A turn that delivers `done` must have changed the
 * file; the reminder asks it again, and a still-unchanged outcome fails.
 */
async function runIntentTurn(
  runtime: KernelRuntime,
  iteration: number,
  steer: Steer,
): Promise<void> {
  const file = intentPath(runtime);
  const before = fs.readFileSync(file, "utf8");
  await runAgentTurn(runtime, {
    target: boundaryTarget(runtime, INTENT_STEP, iteration),
    cwd: runtime.paths.goalCheckout,
    meta: { iteration, slug: steer.id, step: INTENT_STEP, round: 1 },
    vars: {
      iteration: String(iteration),
      intent_path: file,
      steer: formatSteerTurn([steer]),
    },
    expectation: KERNEL_TURN_STEPS.intent,
    validate: (outcome) => {
      if (outcome.status !== "done") return [];
      const after = readIntent(runtime);
      if (after === null)
        return ["the intent file is missing; restore it and carry the steer"];
      return after === before
        ? [
            "the intent is unchanged; carry the steer's words into the intent file",
          ]
        : [];
    },
    settle: async (_record, outcome) => settleIntent(runtime, before, outcome),
  });
}

/**
 * Runs the intent agent for every pending steer the PM routed to it, once per
 * steer: the steer PM calls this when it commits the route, and a boundary
 * calls it only for a route no record answers yet, so a crash between the two
 * is repaired without a second edit.
 */
export async function carryIntentSteers(
  runtime: KernelRuntime,
  opts: {
    iteration: number;
    steers: readonly Steer[];
    routes: Map<string, { route: SteerRoute }>;
    records: readonly StepRecord[];
  },
): Promise<void> {
  for (const steer of opts.steers) {
    if (opts.routes.get(steer.id)?.route !== INTENT_STEP) continue;
    // One attempt per steer: an attempt that delivered nothing is reported
    // to the architect, never retried blindly.
    if (latestIntentRecord(opts.records, steer.id) !== undefined) continue;
    await runIntentTurn(runtime, opts.iteration, steer);
  }
}

function failureText(record: StepRecord): string {
  if (record.outcome)
    return `${record.outcome.status}: ${record.outcome.summary}`;
  if (record.stop)
    return "cause" in record.stop
      ? `${record.stop.kind}: ${record.stop.cause}`
      : record.stop.kind;
  return "no outcome recorded";
}

/**
 * What the architect's pack shows for the pending steers the intent agent
 * carried: the diff its record holds, or why it carried nothing. The record
 * outlives the turn, so a later consult shows the same change while the steer
 * still waits for its answer.
 */
export function intentChanges(opts: {
  records: readonly StepRecord[];
  steers: readonly Steer[];
  routes: Map<string, { route: SteerRoute }>;
  recordsDir: string;
}): IntentChange[] {
  const changes: IntentChange[] = [];
  for (const steer of [...opts.steers].sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    if (opts.routes.get(steer.id)?.route !== INTENT_STEP) continue;
    const record = latestIntentRecord(opts.records, steer.id);
    if (!record) continue;
    const base = {
      steer: steer.id,
      relPath: steer.relPath,
      record: path.join(opts.recordsDir, recordDirName(record.seq, record)),
    };
    changes.push(
      record.diff !== undefined
        ? { ...base, diff: record.diff }
        : { ...base, failure: failureText(record) },
    );
  }
  return changes;
}
