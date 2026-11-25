import fs from "node:fs";
import path from "node:path";
import { commitAll } from "../core/git/commit.js";
import { git } from "../core/git/exec.js";
import { porcelainStatus } from "../core/git/status.js";
import { runAgentTurn } from "./agent.js";
import type { IntentChange } from "./context-pack.js";
import { boundaryTarget } from "./flow-context.js";
import { formatSteerTurn, type Steer } from "./mailbox.js";
import { KERNEL_TURN_STEPS } from "./outcome.js";
import { recordDirName } from "./store.js";
import type {
  KernelRuntime,
  RecordEnd,
  StepRecord,
  SteerRoute,
} from "./types.js";

/** The intent agent's record step; the steer id is its record slug. */
const INTENT_STEP = "intent";

const INTENT_FILE = "intent.md";
const DIFF_CONTEXT = 3;

/**
 * Phrases that make a path in the goal note the intent's source rather than a
 * passing file reference. The note is prose, so the pointer is read from the
 * line that names it, never guessed from a bare path.
 */
const SOURCE_MARKER =
  /\b(source of truth|authoritative|binds?|as specified in|specified in|as per)\b/i;

function intentPath(runtime: KernelRuntime): string {
  return path.join(runtime.store.goalDir, INTENT_FILE);
}

/** A repo-relative path inside the goal checkout, or undefined outside it. */
function repoRel(checkout: string, abs: string): string | undefined {
  const rel = path.relative(checkout, abs);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel))
    return undefined;
  return rel.split(path.sep).join("/");
}

interface IntentSource {
  /** Repo-relative file the note names as the source of truth. */
  rel: string;
  /** Absolute path of that file in the goal checkout. */
  abs: string;
}

/** The tracked checkout file a backticked token names, or undefined. */
async function trackedSource(
  checkout: string,
  token: string,
): Promise<IntentSource | undefined> {
  const rel = token.trim().replace(/^\.\//, "");
  if (rel === "" || path.isAbsolute(rel)) return undefined;
  const abs = path.resolve(checkout, rel);
  if (repoRel(checkout, abs) === undefined) return undefined;
  try {
    if (!fs.statSync(abs).isFile()) return undefined;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
  const listed = await git(
    checkout,
    ["ls-files", "--error-unmatch", "--", rel],
    { allowFail: true },
  );
  return listed.code === 0 ? { rel, abs } : undefined;
}

/**
 * The repo file a pointer note names as the intent's source of truth, or
 * undefined when the note is the intent itself. Only a backticked, tracked,
 * checkout-relative path on a line that calls it the source counts: a plain
 * mention of another repo file never redirects the intent turn.
 */
async function intentSource(
  runtime: KernelRuntime,
  note: string,
): Promise<IntentSource | undefined> {
  const checkout = path.resolve(runtime.paths.goalCheckout);
  for (const line of note.split("\n")) {
    if (!SOURCE_MARKER.test(line)) continue;
    for (const match of line.matchAll(/`([^`\n]+)`/g)) {
      const source = await trackedSource(checkout, match[1]!);
      if (source !== undefined) return source;
    }
  }
  return undefined;
}

function readFile(abs: string): string | null {
  try {
    return fs.readFileSync(abs, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** Checkout entries besides the edited file and the goal note. */
async function foreignChanges(
  runtime: KernelRuntime,
  turn: IntentTurn,
): Promise<string[]> {
  const entries = await porcelainStatus(runtime.paths.goalCheckout);
  const kept = new Set<string>(turn.dirtyBefore);
  if (turn.repoRel !== undefined) kept.add(turn.repoRel);
  const noteRel = repoRel(runtime.paths.goalCheckout, turn.notePath);
  if (noteRel !== undefined) kept.add(noteRel);
  return entries.map((entry) => entry.path).filter((rel) => !kept.has(rel));
}

/** Puts a tracked path back to HEAD and removes the turn's untracked files. */
async function revertForeignChanges(
  runtime: KernelRuntime,
  rels: readonly string[],
): Promise<void> {
  if (rels.length === 0) return;
  const checkout = runtime.paths.goalCheckout;
  const entries = (await porcelainStatus(checkout)).filter((entry) =>
    rels.includes(entry.path),
  );
  const tracked = entries
    .filter((entry) => !entry.code.startsWith("??"))
    .map((entry) => entry.from ?? entry.path);
  if (tracked.length > 0)
    await git(checkout, ["checkout", "HEAD", "--", ...tracked]);
  for (const entry of entries) {
    if (!entry.code.startsWith("??")) continue;
    fs.rmSync(path.join(checkout, entry.path), { force: true });
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

/** A unified diff of two intent texts, three context lines per hunk. */
function unifiedDiff(before: string, after: string, rel: string): string {
  const lines = diffLines(before.split("\n"), after.split("\n"));
  const out: string[] = [`--- ${rel}`, `+++ ${rel}`];
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

interface IntentTurn {
  /** The goal's pointer note; never edited when it names a repo source. */
  notePath: string;
  noteBefore: string;
  /** The file the turn edits: the note itself, or the repo file it names. */
  file: string;
  /** Repo-relative name of `file` in the diff header. */
  rel: string;
  before: string;
  /** The edited file's checkout-relative path; absent when it is the note. */
  repoRel?: string;
  /** Checkout paths already dirty before the turn; never blamed on it. */
  dirtyBefore: readonly string[];
  steer: string;
}

/**
 * The clause that lands the pre-turn intent. A delivered outcome (and only
 * one) keeps the edit, records its diff and commits a repo source on the goal
 * branch; every other end restores both files and any foreign edit, so a
 * half-applied amendment never reaches the architect as fact.
 */
async function settleIntent(
  runtime: KernelRuntime,
  turn: IntentTurn,
  outcome: { status: string } | undefined,
): Promise<RecordEnd> {
  const after = readFile(turn.file);
  const noteChanged =
    turn.repoRel !== undefined && readFile(turn.notePath) !== turn.noteBefore;
  const foreign = await foreignChanges(runtime, turn);
  const carried =
    outcome?.status === "done" &&
    after !== null &&
    after !== turn.before &&
    !noteChanged &&
    foreign.length === 0;
  if (!carried) {
    if (after !== turn.before) fs.writeFileSync(turn.file, turn.before, "utf8");
    if (noteChanged) fs.writeFileSync(turn.notePath, turn.noteBefore, "utf8");
    await revertForeignChanges(runtime, foreign);
    return {};
  }
  const diff = unifiedDiff(turn.before, after, turn.rel);
  if (turn.repoRel === undefined) return { diff };
  const commit = await commitAll(
    runtime.repo,
    runtime.paths.goalCheckout,
    `factory: ${turn.steer} intent change`,
    { paths: [turn.repoRel] },
  );
  return commit === null ? { diff } : { diff, commit };
}

/** Findings for a delivered intent edit that is missing, unchanged or foreign. */
async function intentFindings(
  runtime: KernelRuntime,
  turn: IntentTurn,
  outcome: { status: string },
): Promise<string[]> {
  if (outcome.status !== "done") return [];
  const after = readFile(turn.file);
  if (after === null)
    return [
      `the intent file ${turn.rel} is missing; restore it and carry the steer`,
    ];
  if (after === turn.before)
    return [
      `the intent ${turn.rel} is unchanged; carry the steer's words into it`,
    ];
  if (
    turn.repoRel !== undefined &&
    readFile(turn.notePath) !== turn.noteBefore
  ) {
    // The repair ask starts from the note the owner wrote, not the agent's
    // stray edit; the source edit is left for the retry to keep or redo.
    fs.writeFileSync(turn.notePath, turn.noteBefore, "utf8");
    return [
      "the goal note is a pointer; leave it untouched and edit the repo file it names",
    ];
  }
  const foreign = await foreignChanges(runtime, turn);
  return foreign.length === 0
    ? []
    : [`the intent turn changed ${foreign.join(", ")}; edit only ${turn.rel}`];
}

/**
 * Carries one routed steer into the goal's intent with the configured intent
 * agent: it preserves the owner's wording, consolidates superseded text and
 * adds no interpretation. When the goal note points at a tracked repo file as
 * the intent's source of truth, the turn edits that file and consolidates it
 * on the goal branch; the note stays untouched. A turn that delivers `done`
 * must have changed the intent; the reminder asks it again, and a still-
 * unchanged outcome fails.
 */
async function runIntentTurn(
  runtime: KernelRuntime,
  iteration: number,
  steer: Steer,
): Promise<void> {
  const notePath = intentPath(runtime);
  const noteBefore = fs.readFileSync(notePath, "utf8");
  const source = await intentSource(runtime, noteBefore);
  const file = source?.abs ?? notePath;
  const dirtyBefore = (await porcelainStatus(runtime.paths.goalCheckout)).map(
    (entry) => entry.path,
  );
  const turn: IntentTurn = {
    notePath,
    noteBefore,
    file,
    rel: source?.rel ?? INTENT_FILE,
    before: fs.readFileSync(file, "utf8"),
    ...(source ? { repoRel: source.rel } : {}),
    dirtyBefore,
    steer: steer.id,
  };
  await runAgentTurn(runtime, {
    target: boundaryTarget(runtime, INTENT_STEP, iteration),
    cwd: runtime.paths.goalCheckout,
    meta: {
      iteration,
      slug: steer.id,
      step: INTENT_STEP,
      round: 1,
      // The source path is declared before the turn so a task settling beside
      // it reads the edit and its commit as the intent turn's, not its own.
      ...(source ? { checkoutWrites: [source.rel] } : {}),
    },
    vars: {
      iteration: String(iteration),
      intent_path: file,
      steer: formatSteerTurn([steer]),
    },
    expectation: KERNEL_TURN_STEPS.intent,
    validate: (outcome) => intentFindings(runtime, turn, outcome),
    settle: async (_record, outcome) => settleIntent(runtime, turn, outcome),
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
