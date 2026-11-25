/** Snapshotting the worktree and the artifact tree for containment. */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { git } from "../../core/git/exec.js";
import { type StatusEntry, porcelainStatus } from "../../core/git/status.js";
import { isPlanPath } from "../plan-file.js";
import type {
  Cause,
  DeclaredWrite,
  KernelRuntime,
  StepRecord,
} from "../types.js";
import type { WorktreeState } from "./types.js";

/**
 * Porcelain entries outside the artifact root. A same-repo artifact commit
 * changes the main checkout's HEAD and dirty set; both are the store's writes,
 * not the operator's, so containment compares only what lies outside the store.
 * A rename stays visible because its line names a pair, not one artifact path.
 */
export function statusOutsideArtifacts(
  entries: readonly StatusEntry[],
  repoRoot: string,
  artifactRoot: string,
): readonly StatusEntry[] {
  const rel = path.relative(repoRoot, artifactRoot).split(path.sep).join("/");
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel))
    return entries;
  const inside = (file: string) => file === rel || file.startsWith(`${rel}/`);
  return entries.filter(
    (entry) => entry.from !== undefined || !inside(entry.path),
  );
}

export async function worktreeState(dir: string): Promise<WorktreeState> {
  const branch = await git(dir, ["rev-parse", "--abbrev-ref", "HEAD"], {
    allowFail: true,
  });
  const head = await git(dir, ["rev-parse", "HEAD"], { allowFail: true });
  // `normal` keeps the old collapsed untracked-directory shape while `-z`
  // avoids C-quoting paths with spaces or quotes.
  const entries = await porcelainStatus(dir, { untracked: "normal" });
  return {
    branch: branch.stdout.trim(),
    head: head.stdout.trim(),
    entries,
  };
}

/**
 * The operator's mailbox channels: a steer may arrive, be archived or answered
 * while a turn runs, and those writes are never the task's.
 */
const OPERATOR_CHANNELS = new Set([
  "mailbox/inbox",
  "mailbox/processed",
  "mailbox/outbox",
]);

/**
 * Goal-relative directories that are never artifacts: the kernel's launch logs
 * grow while a turn runs and are not its writes.
 */
const PRIVATE_DIRS = new Set(["logs"]);

/** Directory entries, or undefined when the directory vanished. */
function readEntries(abs: string): fs.Dirent[] | undefined {
  try {
    return fs.readdirSync(abs, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

/** A file's hash, or undefined when another writer removed it. */
function fileHash(abs: string): string | undefined {
  try {
    return createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
  } catch (err) {
    // Another writer may remove a file between readdir and read.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

function walkArtifacts(
  abs: string,
  rel: string,
  files: Map<string, string>,
): void {
  const entries = readEntries(abs);
  if (!entries) return;
  for (const entry of entries) {
    const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
    if (OPERATOR_CHANNELS.has(childRel) || PRIVATE_DIRS.has(childRel)) continue;
    const childAbs = path.join(abs, entry.name);
    if (entry.isDirectory()) {
      walkArtifacts(childAbs, childRel, files);
    } else if (entry.isFile()) {
      const hash = fileHash(childAbs);
      if (hash !== undefined) files.set(childRel, hash);
    }
  }
}

/** Hashes of every goal artifact except the operator's mailbox channels. */
export function artifactState(dir: string): Map<string, string> {
  const files = new Map<string, string>();
  walkArtifacts(dir, "", files);
  return files;
}

const RECORD_DIR = /^records\/(\d{5})-/;
const RECORD_FILE = /^(records\/[^/]+)\//;

/** The sequence encoded in a record's goal-relative path, if it names one. */
function recordSeqOf(rel: string): number | undefined {
  const match = RECORD_DIR.exec(rel);
  return match?.[1] ? Number(match[1]) : undefined;
}

/** The record directory a goal-relative path lives in, if it names one. */
function recordDirOf(rel: string): string | undefined {
  return RECORD_FILE.exec(rel)?.[1];
}

/** Records that started before the snapshot and had not closed when it was taken. */
export function recordsInFlight(
  records: readonly StepRecord[],
  at: string,
): Set<number> {
  return new Set(
    records
      .filter((r) => r.startedAt <= at && (!r.endedAt || r.endedAt >= at))
      .map((r) => r.seq),
  );
}

/**
 * A steer turn owns the goal surface it edits: the PM writes the plan, task
 * files and holds, and the intent agent writes the intent. Either may run while
 * a task turn is in flight, so its writes are not the task's.
 */
export function steerTurnWroteDuring(
  records: readonly StepRecord[],
  at: string,
  now: string,
): boolean {
  return records.some(
    (r) =>
      (r.step === "pm" ||
        r.step === "pm-validate" ||
        r.step === "steer-reconcile" ||
        r.step === "intent") &&
      r.startedAt <= now &&
      (!r.endedAt || r.endedAt >= at),
  );
}

/** The goal-checkout paths a record active at `at` declared it writes. */
export function checkoutWritesAt(
  records: readonly StepRecord[],
  at: string,
): Set<string> {
  const paths = new Set<string>();
  for (const record of records) {
    if (record.startedAt > at) continue;
    if (record.endedAt !== undefined && record.endedAt < at) continue;
    for (const rel of record.checkoutWrites ?? []) paths.add(rel);
  }
  return paths;
}

/**
 * The goal-checkout paths a record still open now declared it writes. The
 * intent turn records its repo source before it starts, so a task settling
 * beside it does not read that source's edit or commit as its own; once the
 * record closes, its commit is on the record and its path is not exempt.
 */
export function openCheckoutWrites(
  records: readonly StepRecord[],
  now: string,
): Set<string> {
  const paths = new Set<string>();
  for (const record of records) {
    if (record.endedAt !== undefined || record.startedAt > now) continue;
    for (const rel of record.checkoutWrites ?? []) paths.add(rel);
  }
  return paths;
}

/**
 * Porcelain entries without entries whose exact path is an explained write.
 * A rename is not exempt: its entry names a pair, not the declared path.
 */
export function statusWithoutPaths(
  entries: readonly StatusEntry[],
  exempt: ReadonlySet<string>,
): readonly StatusEntry[] {
  if (exempt.size === 0) return entries;
  return entries.filter(
    (entry) => entry.from !== undefined || !exempt.has(entry.path),
  );
}

function steerTurnOwned(rel: string): boolean {
  return (
    isPlanPath(rel) ||
    rel === "intent.md" ||
    rel.startsWith("tasks/") ||
    rel.startsWith("mailbox/holds/")
  );
}

/**
 * A kernel write is declared before its bytes land. It explains a change only
 * when its bytes landed at or after the snapshot: one that finished before the
 * turn started is already in the before state, so a later change to the same
 * path is the turn's. A write still in flight at the check has no end yet and
 * is the kernel's half-written file. The atomic writer leaves its temporary
 * sibling beside the target; both names are the declared path.
 */
function kernelDeclared(
  rel: string,
  writes: readonly DeclaredWrite[],
  at: string,
): boolean {
  return writes.some(
    (write) =>
      (write.endedAt === undefined || write.endedAt >= at) &&
      (write.rel === rel || rel.startsWith(`${write.rel}.tmp.`)),
  );
}

/**
 * A turn may write only its own outcome file. A record directory that belongs
 * to a record the snapshot never saw (this turn's own included) or still open
 * at the snapshot is the script's or another turn's; a directory no record
 * explains, and a seen unsealed record's files, are the turn's write. A record
 * sealed at the snapshot is history and is never attributed. Unseen means a
 * higher sequence, never a later timestamp: a sibling that opens across the
 * snapshot's record read stamps before it but lands after.
 */
export function artifactBreaches(
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
  opts: {
    at: string;
    maxSeq: number;
    inFlight: ReadonlySet<number>;
    sealed: ReadonlySet<string>;
    records: readonly StepRecord[];
    declared: readonly DeclaredWrite[];
    steerActive: boolean;
  },
): string[] {
  const live = new Map<number, StepRecord>();
  for (const record of opts.records) live.set(record.seq, record);
  const ignored = (rel: string): boolean => {
    if (kernelDeclared(rel, opts.declared, opts.at)) return true;
    if (opts.steerActive && steerTurnOwned(rel)) return true;
    const dir = recordDirOf(rel);
    if (dir !== undefined && opts.sealed.has(dir)) return true;
    const seq = recordSeqOf(rel);
    if (seq === undefined) return false;
    // The store allocates sequences under one lock, so a record the read
    // missed has a higher sequence than every record it saw. It exists by
    // check time; a forged directory names no record and still breaches.
    if (seq > opts.maxSeq) return live.has(seq);
    if (!live.has(seq)) return false;
    return opts.inFlight.has(seq);
  };
  const changed: string[] = [];
  for (const [rel, hash] of after) {
    if (ignored(rel)) continue;
    const previous = before.get(rel);
    if (previous === undefined) changed.push(`created ${rel}`);
    else if (previous !== hash) changed.push(`changed ${rel}`);
  }
  for (const rel of before.keys()) {
    if (!after.has(rel) && !ignored(rel)) changed.push(`removed ${rel}`);
  }
  return changed;
}

export function summarizePaths(paths: readonly string[]): string {
  const shown = paths.slice(0, 5).join(", ");
  return paths.length > 5 ? `${shown} and ${paths.length - 5} more` : shown;
}

/** An outside change the task did not make: a visible record, never a park. */
export async function appendContainmentIncident(
  runtime: KernelRuntime,
  taskWorktree: string,
  records: readonly StepRecord[] | undefined,
  cause: Cause,
): Promise<void> {
  const slug = path.basename(taskWorktree);
  const all = records ?? (await runtime.store.listRecords());
  const own = all.filter((r) => r.slug === slug);
  const latest = own.at(-1);
  const iteration =
    latest?.iteration ?? all.reduce((max, r) => Math.max(max, r.iteration), 0);
  await runtime.store.appendRecord(
    {
      iteration,
      step: "containment",
      round: latest?.round ?? 1,
      actor: "script",
      slug,
    },
    { ok: true, cause },
  );
}
