import fs from "node:fs";
import path from "node:path";
import { commitAll } from "../core/git/commit.js";
import { git } from "../core/git/exec.js";
import { porcelainStatus } from "../core/git/status.js";
import { type AgentTurnResult, runAgentTurn } from "./agent.js";
import type { IntentChange } from "./context-pack.js";
import { boundaryTarget } from "./flow-context.js";
import { unifiedDiff } from "./intent-diff.js";
import { intentProse, parseIntentSlugs } from "./intent-slugs.js";
import { formatSteerTurn, type Steer } from "./mailbox.js";
import { KERNEL_TURN_STEPS } from "./outcome.js";
import { recordDirName } from "./store.js";
import type {
  KernelRuntime,
  RecordEnd,
  StepRecord,
  SteerRoute,
} from "./types.js";

/** The intent agent's record step; a steer id names a carried steer's record. */
const INTENT_STEP = "intent";

const INTENT_FILE = "intent.md";

/**
 * The front's triage note: a bigger goal's intent carries no slug annotation,
 * so the architect has no per-slug intent status to validate against it.
 */
const SLUG_TRIAGE_NOTE =
  "the goal intent carries no [[Slug]] annotations; add them in place";

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
  /** What the commit message names: the steer id, or the front's triage. */
  label: string;
  /** An annotation turn: the front found the intent has no slug annotation. */
  annotate?: boolean;
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
    `factory: ${turn.label} intent change`,
    { paths: [turn.repoRel] },
  );
  return commit === null ? { diff } : { diff, commit };
}

/**
 * A triage edit adds slugs in place: at least one annotation, and not a word
 * changed. The prose comparison is the deterministic form of "no
 * interpretation": the intent's words, headings and requirements survive.
 */
function annotationFindings(turn: IntentTurn, after: string): string[] {
  if (parseIntentSlugs(after).length === 0) {
    return [
      `the intent ${turn.rel} still has no [[Slug]] annotation; mark each separately analyzable slice`,
    ];
  }
  if (intentProse(after) !== intentProse(turn.before)) {
    return [
      `the intent ${turn.rel} changed beyond its slug annotations; add annotations in place and keep every word`,
    ];
  }
  return [];
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
      turn.annotate
        ? `the intent file ${turn.rel} is missing; restore it and add the slug annotations`
        : `the intent file ${turn.rel} is missing; restore it and carry the steer`,
    ];
  if (after === turn.before)
    return [
      turn.annotate
        ? `the intent ${turn.rel} is unchanged; add a [[Slug]] annotation to each separately analyzable slice`
        : `the intent ${turn.rel} is unchanged; carry the steer's words into it`,
    ];
  if (turn.annotate) {
    const findings = annotationFindings(turn, after);
    if (findings.length > 0) return findings;
  }
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

/** What one intent-agent turn carries: a routed steer, or the front's triage note. */
interface IntentTurnRequest {
  /** The steer id; absent on a triage turn, which is neither a task nor a steer. */
  slug?: string;
  /** The prompt's `steer`: the formatted steer, or `none` on a triage turn. */
  steer: string;
  /** The front's note on a triage turn; absent when carrying a steer. */
  triageNote?: string;
}

/**
 * One intent turn with the configured intent agent: it preserves the owner's
 * wording, consolidates superseded text and adds no interpretation. When the
 * goal note points at a tracked repo file as the intent's source of truth, the
 * turn edits that file and consolidates it on the goal branch; the note stays
 * untouched. A triage turn adds slug annotations in place instead of carrying
 * a steer, and runs only on an intent with none. A turn that delivers `done`
 * must have changed the intent; the reminder asks it again, and a still-
 * unchanged outcome fails.
 */
async function runIntentTurn(
  runtime: KernelRuntime,
  iteration: number,
  request: IntentTurnRequest,
): Promise<AgentTurnResult | undefined> {
  const annotate = request.triageNote !== undefined;
  const notePath = intentPath(runtime);
  const noteBefore = annotate
    ? readFile(notePath)
    : fs.readFileSync(notePath, "utf8");
  // A goal with no intent page has nothing to annotate.
  if (noteBefore === null) return undefined;
  const source = await intentSource(runtime, noteBefore);
  const file = source?.abs ?? notePath;
  const before = fs.readFileSync(file, "utf8");
  // An annotated intent needs no triage; a relaunch after the annotation is a no-op.
  if (annotate && parseIntentSlugs(before).length > 0) return undefined;
  const dirtyBefore = (await porcelainStatus(runtime.paths.goalCheckout)).map(
    (entry) => entry.path,
  );
  const turn: IntentTurn = {
    notePath,
    noteBefore,
    file,
    rel: source?.rel ?? INTENT_FILE,
    before,
    ...(source ? { repoRel: source.rel } : {}),
    dirtyBefore,
    label: request.slug ?? "front triage",
    ...(annotate ? { annotate } : {}),
  };
  return await runAgentTurn(runtime, {
    target: boundaryTarget(runtime, INTENT_STEP),
    cwd: runtime.paths.goalCheckout,
    meta: {
      iteration,
      ...(request.slug ? { slug: request.slug } : {}),
      step: INTENT_STEP,
      round: 1,
      // The source path is declared before the turn so a task settling beside
      // it reads the edit and its commit as the intent turn's, not its own.
      ...(source ? { checkoutWrites: [source.rel] } : {}),
    },
    vars: {
      iteration: String(iteration),
      intent_path: file,
      steer: request.steer,
      annotate: annotate ? "true" : "false",
      triage_note: request.triageNote ?? "",
    },
    expectation: KERNEL_TURN_STEPS.intent,
    validate: (outcome) => intentFindings(runtime, turn, outcome),
    settle: async (_record, outcome) => settleIntent(runtime, turn, outcome),
  });
}

/**
 * The front's slug triage: a bigger goal whose intent carries no `[[Slug]]`
 * annotation gets one intent turn that adds them in place. Returns undefined
 * when the intent is absent or already annotated; otherwise the turn's stop
 * when it did not deliver, so the front phase reports it instead of letting
 * the architect read an intent it cannot key a status by.
 */
export async function triageIntentSlugs(
  runtime: KernelRuntime,
  iteration: number,
): Promise<{ cause: string; blocked: boolean } | undefined> {
  const result = await runIntentTurn(runtime, iteration, {
    steer: "none",
    triageNote: SLUG_TRIAGE_NOTE,
  });
  if (result === undefined || result.outcome?.status === "done")
    return undefined;
  const outcome = result.outcome;
  return {
    cause: outcome
      ? `slug triage ended ${outcome.status}: ${outcome.summary}`
      : "slug triage produced no outcome",
    blocked: outcome?.status === "blocked",
  };
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
    await runIntentTurn(runtime, opts.iteration, {
      slug: steer.id,
      steer: formatSteerTurn([steer]),
    });
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
