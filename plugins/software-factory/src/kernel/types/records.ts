/** Step records, artifact references and the stores that read them. */

import type { CheckResult } from "../../core/checks/types.js";
import type {
  ModelRef,
  ServedUsage,
  SessionRef,
  Stop,
  TurnAttempt,
  Usage,
} from "../../harness/types.js";
import type { PlanFile, PlanScope } from "../plan-file.js";
import type { LaunchKind, StepActor } from "./flow.js";
import type { Outcome, RecordedOutcome } from "./outcome.js";
import type { Cause } from "./state.js";
import type { TaskFile, TaskFileFinding } from "./tasks.js";

/**
 * One append-only record, materialized from `records/<dir>/`: `started.yaml`
 * exists before a turn, `end.yaml` commits it and seals its files read-only,
 * `outcome.yaml` holds the agent's accepted outcome. Script steps have actor
 * `script` and no outcome, except `steer-routes`: it stores the accepted
 * steer-route map so the boundary never reads a failed rung's routes.
 */
export interface StepRecord {
  seq: number;
  iteration: number;
  slug?: string;
  step: string;
  round: number;
  actor: StepActor;
  /**
   * The architect that owns this record's work: `main` for goal-level work or
   * an epic's id for epic work.
   */
  architect?: string;
  /** Agent steps only; `model` is the model actually used when reported. */
  alias?: string;
  model?: ModelRef;
  /** Every retry/fallback hop the harness made for this turn. */
  attempts?: TurnAttempt[];
  /**
   * Models the turn actually served, each with its share of the tokens.
   * Measurement only: routing, admission and fallback counts keep the alias.
   */
  served?: ServedUsage[];
  /** Validator findings that triggered outcome reminders, in round order. */
  repairFindings?: string[];
  /**
   * Each repair ask this turn sent, in order: `outcome` for the outcome-only
   * repair, `unfinished` for the finish-the-task ask, `rescue` for the fresh
   * session that reads the branch's work. Old records carry none.
   */
  asks?: RepairAsk[];
  /**
   * Set when the turn delivered after its reminders: the final outcome passed
   * the same checks, so every listed finding is closed.
   */
  repairFindingsResolved?: boolean;
  /** Incident launches only: why this launch ran again. */
  launchKind?: LaunchKind;
  /** Resumed turn: unsplit input is priced as the cached prefix. */
  cachedPrefix?: boolean;
  /** Task hash at dispatch, for the frozen-task check. */
  taskHash?: string;
  /**
   * The task revision this record belongs to. A park carries the revision it
   * ended, so derive can ignore the parks of revisions the task has amended
   * past; absent reads as 0.
   */
  revision?: number;
  /** Integration head (or parked branch tip) the branch started from. */
  base?: string;
  stop?: Stop;
  usage?: Usage;
  /** Priced tokens of this turn's session-end compaction, when the harness reported them. */
  compactUsage?: Usage;
  session?: SessionRef;
  commit?: string;
  /** Spike finish only: `<commit>:<report path>`, the finding's one copy. */
  report?: string;
  /** Intent turn only: the unified diff the turn carried into the goal's intent. */
  diff?: string;
  /** Goal-checkout paths this turn declared it may write; see `RecordStart`. */
  checkoutWrites?: string[];
  /** UTF-8 bytes of the rendered prompt sent to the harness (agent steps only). */
  promptBytes?: number;
  /** Boundary roles only: UTF-8 bytes of the iteration context pack. */
  packBytes?: number;
  /** Raw stream transcript in the session store, when the harness keeps one. */
  transcript?: string;
  /** Tree of the resulting worktree, the per-step no-progress component. */
  tree?: string;
  /** base-advance only: the integration head's tree at the advance. */
  headTree?: string;
  /**
   * Resolve only: tracked paths the turn changed outside the conflict set.
   * Non-empty sends the reviewable change through the flow's review step
   * before the merge retries; empty lands the resolution on its checks.
   */
  outside?: string[];
  checks?: CheckResult[];
  /** Files and lines the turn's commit changed, measured at commit time. */
  edits?: WorkEdits;
  /** Gates run by this record; checks records only. */
  testRuns?: number;
  /** Wall time in ms; checks/commit records stamp the gate/commit run itself. */
  wallMs?: number;
  outcome?: RecordedOutcome;
  ok?: boolean;
  cause?: Cause;
  startedAt: string;
  endedAt?: string;
}

/** The repair asks a turn may send, in the order it sends them. */
export type RepairAsk = "outcome" | "unfinished" | "rescue";

/** Work one turn committed: files changed plus added/removed lines. */
export interface WorkEdits {
  files: number;
  added: number;
  removed: number;
}

/** Input of one turn/script step, written before the turn starts. */
export interface RecordStart {
  iteration: number;
  slug?: string;
  step: string;
  round: number;
  actor: StepActor;
  /**
   * When the work actually began. A live turn omits it and the store stamps
   * now; an append that records work already run passes it so `startedAt`,
   * `endedAt` and `wallMs` span the real window.
   */
  startedAt?: string;
  /** The architect that owns this record's work; see `StepRecord.architect`. */
  architect?: string;
  alias?: string;
  model?: ModelRef;
  taskHash?: string;
  /** The task revision this record belongs to; absent reads as 0. */
  revision?: number;
  base?: string;
  /** The session this turn resumes, written before the turn runs so a hard death keeps it. */
  session?: SessionRef;
  /** Merge steps: the planned squash commit, written before the ref moves. */
  commit?: string;
  /**
   * Goal-checkout paths this turn writes, declared before it starts so a task
   * settling beside it does not read the edit or its commit as its own.
   */
  checkoutWrites?: string[];
}

/** Settled fields written atomically as `end.yaml`. */
export interface RecordEnd {
  /** Set when the harness reports the model actually used (S1 contract). */
  model?: ModelRef;
  stop?: Stop;
  usage?: Usage;
  /** Raw session-end compaction tokens from the settle; the agent turn prices them. */
  compactUsage?: Usage;
  session?: SessionRef;
  /** Resumed turn: unsplit input is priced as the cached prefix. */
  cachedPrefix?: boolean;
  /** Rendered prompt and, for the boundary roles, context-pack size. */
  promptBytes?: number;
  packBytes?: number;
  transcript?: string;
  attempts?: TurnAttempt[];
  /** Per-model split of a turn whose harness resolved its model natively. */
  served?: ServedUsage[];
  /** Validator findings that triggered outcome reminders, in round order. */
  repairFindings?: string[];
  /** Each repair ask this turn sent, in order; absent when it sent none. */
  asks?: RepairAsk[];
  /**
   * Set when the turn delivered after its reminders: the final outcome passed
   * the same checks, so every listed finding is closed.
   */
  repairFindingsResolved?: boolean;
  /** Incident launches only: why this launch ran again. */
  launchKind?: LaunchKind;
  commit?: string;
  /** Spike finish only: `<commit>:<report path>`, the finding's one copy. */
  report?: string;
  /** Intent turn only: the unified diff the turn carried into the goal's intent. */
  diff?: string;
  tree?: string;
  /** base-advance only: the integration head's tree at the advance. */
  headTree?: string;
  /** Resolve only: paths the turn changed outside the conflict set. */
  outside?: string[];
  checks?: CheckResult[];
  edits?: WorkEdits;
  testRuns?: number;
  wallMs?: number;
  outcome?: Outcome;
  ok?: boolean;
  cause?: Cause;
}

/** Handle for an in-flight turn; the directory exists but has no end. */
export interface TurnRecord {
  dir: string;
  meta: StepRecord;
  /** Absolute path the agent writes its outcome file to. */
  outcomePath: string;
  /** Writes outcome, then end.yaml, then seals the record read-only. */
  finish(end: RecordEnd): Promise<StepRecord>;
}

/**
 * One kernel write under the goal dir, declared before its bytes land. The
 * kernel's store is the declaration point: a goal artifact change the ledger
 * does not explain belongs to the turn in flight, never to the kernel.
 */
export interface DeclaredWrite {
  /** Goal-relative path with `/` separators. */
  rel: string;
  /** When the write settled; absent while it is in flight at the check. */
  endedAt?: string;
}

/** The directory a goal artifact lives in; `goal` owns the files no sub-store does. */
export type ArtifactArea =
  | "goal"
  | "records"
  | "tasks"
  | "plans"
  | "mailbox"
  | "iterations";

/** One goal artifact, addressed by the store that owns it. */
export interface ArtifactRef {
  readonly area: ArtifactArea;
  /** Path inside the area's directory; empty names that directory. */
  readonly rel?: string;
}

/** One record directory and whether its start/end committed. */
export interface RecordDir {
  /** Directory name, `NNNNN-i<iteration>[-<slug>]-<step>-r<round>`. */
  name: string;
  /** Absolute directory path. */
  path: string;
  started: boolean;
  ended: boolean;
}

/** The files a record directory owns; nothing else is a record. */
export type RecordFile = "started.yaml" | "outcome.yaml" | "end.yaml";

export interface RecordStore {
  /** Absolute directory the record owns; prompts and briefs carry it. */
  dir(record: StepRecord): string;
  /** Absolute path of one of the record's files. */
  file(record: StepRecord, name: RecordFile): string;
  /**
   * The reviewer prompt's `checks_log`: the record's own directory, which the
   * store materialized when the record started.
   */
  checksLog(record: StepRecord): string;
  /** Every record directory on disk, in name order. */
  dirs(): Promise<RecordDir[]>;
  /** Includes unfinished records (started, no end); sorted by seq. */
  list(): Promise<StepRecord[]>;
  start(meta: RecordStart): Promise<TurnRecord>;
  append(meta: RecordStart, end: RecordEnd): Promise<StepRecord>;
  /** Writes an end for a record a dead process left open, then seals it. */
  close(name: string, end: RecordEnd): Promise<void>;
  /** Makes an ended record's files read-only. */
  seal(name: string): Promise<void>;
}

export interface TaskStore {
  /** Absolute directory holding the task files. */
  readonly dir: string;
  /** Absolute path of one task file; prompts carry it. */
  path(slug: string): string;
  /** Raw task texts by slug, sorted. */
  texts(): Promise<Map<string, string>>;
  list(): Promise<TaskFile[]>;
  read(slug: string): Promise<TaskFile | null>;
  write(task: TaskFile): Promise<void>;
  /** Writes one file byte for byte: a kernel restore. */
  writeText(slug: string, text: string): Promise<void>;
  /** Restores what a turn changed or created; names the slugs it put back. */
  restore(before: Map<string, string>): Promise<string[]>;
  findings(): Promise<TaskFileFinding[]>;
  /** Quarantines malformed files and records each; one listing's sweep. */
  sweep(iteration: number): Promise<void>;
}

export interface PlanStore {
  /** Absolute path of the goal's plan file; prompts carry it. */
  readonly path: string;
  /** Every plan the register names, goal plan first. */
  registered(): PlanFile[];
  /** The registered plans whose file exists, in register order. */
  existing(): PlanFile[];
  /** Every plan file on disk (goal plus `epics/*.md`), the ownership view. */
  filesOnDisk(): PlanFile[];
  /** A scope's bytes; the goal plan when no scope is named. */
  read(scope?: PlanScope): Promise<string | null>;
  exists(scope?: PlanScope): Promise<boolean>;
  /** Kernel write: declares the path and replaces the file atomically. */
  write(scope: PlanScope, text: string): Promise<void>;
  /** Deletes the plan; absent is a no-op. */
  remove(scope?: PlanScope): Promise<void>;
}

/** The files one iteration directory owns. */
export type IterationFile =
  | "context-pack.md"
  | "context-data.json"
  | "summary.md"
  | "digest.md"
  | "intent-status.json"
  | "metrics.yaml"
  | "plan-bullets.json";

export interface IterationStore {
  /** Goal-relative path of one iteration file. */
  rel(iteration: number, file: IterationFile): string;
  /** Absolute path of one iteration file; prompts carry it. */
  path(iteration: number, file: IterationFile): string;
  read(iteration: number, file: IterationFile): Promise<string | null>;
  write(iteration: number, file: IterationFile, text: string): Promise<void>;
}

/** The mailbox queues a steer moves through. */
export type MailboxQueue =
  | "inbox"
  | "processed"
  | "outbox"
  | "holds"
  | "quarantine";

export interface MailboxStore {
  /** Absolute holds directory: where the PM writes one file per steer. */
  readonly holds: string;
  /** Absolute quarantine directory for holds that decide nothing. */
  readonly quarantine: string;
  /** Goal-relative path of a queue, or a file in it; prompts carry it. */
  rel(queue: MailboxQueue, name?: string): string;
  /** Reads a queue file; null when absent. */
  read(queue: MailboxQueue, name: string): Promise<string | null>;
  /** Writes a queue file atomically; materializes the queue directory. */
  write(queue: MailboxQueue, name: string, text: string): Promise<void>;
  /** Publishes a steer through the private tmp dir, then renames it in. */
  publish(name: string, text: string): Promise<void>;
  /** Renames between queues; false when the source is gone. */
  move(
    from: MailboxQueue,
    fromName: string,
    to: MailboxQueue,
    toName: string,
  ): Promise<boolean>;
  /** Removes a queue file; absent is a no-op. */
  remove(queue: MailboxQueue, name: string): Promise<void>;
  /** Non-dot files directly in a queue, sorted. */
  files(queue: MailboxQueue): Promise<string[]>;
  /** Sizes of those files, by name, for the inbox settle check. */
  sizes(queue: MailboxQueue): Promise<Map<string, number>>;
}

export interface ArtifactStore {
  readonly goalDir: string;
  /** The store's areas, each owning its files and the paths they live at. */
  readonly records: RecordStore;
  readonly tasks: TaskStore;
  readonly plans: PlanStore;
  readonly mailbox: MailboxStore;
  readonly iterations: IterationStore;
  /**
   * Absolute path of an artifact without touching the disk. Prompts carry it;
   * a writer uses `localPath` so its parent exists.
   */
  pathOf(ref: ArtifactRef): string;
  /** Absolute path of an artifact, its parent directory created. */
  localPath(ref: ArtifactRef): Promise<string>;
  /**
   * Raw directories below are the folder backend's layout, kept for the
   * unchanged suite; kernel modules reach artifacts through the areas above.
   */
  readonly tasksDir: string;
  readonly recordsDir: string;
  readonly mailboxDir: string;
  readonly iterationsDir: string;
  ensureLayout(): Promise<void>;
  /** Goal-relative read; null when absent. */
  readFile(rel: string): Promise<string | null>;
  /** Goal-relative write; declares the path in the kernel write ledger. */
  writeFile(rel: string, text: string): Promise<void>;
  /** Goal-relative directory listing, sorted; empty when absent. */
  listDir(rel: string): Promise<string[]>;
  listTasks(): Promise<TaskFile[]>;
  scanTaskFindings(): Promise<TaskFileFinding[]>;
  sweepTasks(iteration: number): Promise<void>;
  readTask(slug: string): Promise<TaskFile | null>;
  writeTask(task: TaskFile): Promise<void>;
  startRecord(meta: RecordStart): Promise<TurnRecord>;
  appendRecord(meta: RecordStart, end: RecordEnd): Promise<StepRecord>;
  /** Includes unfinished records (started, no end); sorted by seq. */
  listRecords(): Promise<StepRecord[]>;
  /**
   * Every goal-dir write this process's kernel declared, in order. Process
   * local: one launch owns a goal (the run lock), so no other process writes
   * its artifacts while a turn is contained.
   */
  declaredWrites(): readonly DeclaredWrite[];
}
