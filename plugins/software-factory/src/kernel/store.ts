import fs from "node:fs";
import path from "node:path";
import { AsyncMutex } from "../core/mutex.js";
import {
  readText,
  readYaml,
  writeTextAtomic,
  writeYamlAtomic,
} from "../core/records/io.js";
import { readCause } from "./cause.js";
import { makeCause } from "./cause.js";
import {
  existingPlans,
  goalPlan,
  planFilesOnDisk,
  type PlanScope,
  registeredPlans,
  resolvePlan,
} from "./plan-file.js";
import { parseTaskFile, renderTaskFile, TaskFileError } from "./tasks.js";
import {
  ArtifactRef,
  ArtifactStore,
  DeclaredWrite,
  IterationStore,
  MailboxQueue,
  MailboxStore,
  PlanStore,
  RecordDir,
  RecordEnd,
  RecordStart,
  RecordStore,
  StepRecord,
  TaskFile,
  TaskFileFinding,
  TaskStatus,
  TaskStore,
  TaskTypeDefinition,
  TurnRecord,
} from "./types.js";
import type { RecordedOutcome } from "./types.js";

const RECORD_DIR = /^(\d{5})-/;

/**
 * Parsed records by absolute record directory, kept for the process: a record
 * with a committed `end.yaml` is sealed history (`record-seal`), so its parse
 * never changes again. Every dispatch pass lists the same directories; without
 * this each pass re-read and re-parsed the whole history.
 *
 * `sealRecord`/`unsealRecord` drop the entry, so the kernel's own rewrite of a
 * sealed record is read fresh. A record read before its end lands is not
 * cached; the read after the seal caches it.
 */
const sealedRecords = new Map<string, StepRecord>();

function recordCacheKey(dir: string): string {
  return path.resolve(dir);
}

function forgetSealedRecord(dir: string): void {
  sealedRecords.delete(recordCacheKey(dir));
}

function isENOENT(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === "ENOENT";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * One record's stored outcome, read for the kernel: missing arrays defaulted
 * and every concern given its kernel id `<recordId>#<n>`. The id is assigned
 * here, at ingest, and always overwrites anything the agent wrote: the record
 * directory names the record, and the concern's position in it is stable.
 */
function normalizeOutcome(raw: unknown, recordId: string): RecordedOutcome {
  if (!isPlainObject(raw)) {
    return {
      status: "failed",
      summary: "Invalid outcome: not an object",
      concerns: [],
      forward: [],
    };
  }

  const outcome = { ...raw } as any;

  // Normalize
  const concerns: unknown[] = Array.isArray(outcome.concerns)
    ? outcome.concerns
    : [];
  outcome.concerns = concerns.map((concern, index) => ({
    ...(isPlainObject(concern) ? concern : {}),
    id: `${recordId}#${index + 1}`,
  }));
  outcome.forward = Array.isArray(outcome.forward) ? outcome.forward : [];
  outcome.status =
    typeof outcome.status === "string" ? outcome.status : "failed";
  outcome.summary =
    typeof outcome.summary === "string"
      ? outcome.summary
      : "Missing or invalid summary";

  return outcome;
}

/** One record directory's name: `NNNNN-i<iteration>[-<slug>]-<step>-r<round>`. */
export function recordDirName(seq: number, meta: RecordStart): string {
  const slug = meta.slug ? `-${meta.slug}` : "";
  return `${String(seq).padStart(5, "0")}-i${meta.iteration}${slug}-${meta.step}-r${meta.round}`;
}

/**
 * Goal-relative directories of records whose `end.yaml` commits them. Their
 * files are history: a stale writer's path there is never a turn's breach.
 */
export function sealedRecordDirs(records: readonly StepRecord[]): Set<string> {
  const dirs = new Set<string>();
  for (const record of records) {
    if (record.endedAt !== undefined)
      dirs.add(`records/${recordDirName(record.seq, record)}`);
  }
  return dirs;
}

/** The files the store owns in a record directory; nothing else is a record. */
const RECORD_FILES = ["started.yaml", "outcome.yaml", "end.yaml"] as const;

async function chmodRecord(dir: string, mode: number): Promise<void> {
  for (const name of RECORD_FILES) {
    try {
      await fs.promises.chmod(path.join(dir, name), mode);
    } catch (err) {
      // outcome.yaml is absent on a script step; the rest exist from start.
      if (!isENOENT(err)) throw err;
    }
  }
}

/**
 * A record is history once `end.yaml` lands: its files are read-only, so a
 * resumed turn still holding the record's stale outcome path gets a write
 * error instead of rewriting it. Only the kernel reopens one, for a rewrite
 * it owns, and seals it again.
 */
export async function sealRecord(dir: string): Promise<void> {
  await chmodRecord(dir, 0o444);
  forgetSealedRecord(dir);
}

/** Reopen a sealed record for a kernel-owned rewrite; seal it after. */
export async function unsealRecord(dir: string): Promise<void> {
  await chmodRecord(dir, 0o644);
  forgetSealedRecord(dir);
}

/**
 * A broken file for a merged, finished or cancelled slug is history: it
 * must stay in `tasks/` so the record keeps the only file it names.
 * Terminal facts come from `derive-task`, the single source.
 */

function isTerminalHistory(
  status: TaskStatus | null,
): status is "merged" | "finished" | "cancelled" {
  return status === "merged" || status === "finished" || status === "cancelled";
}

/**
 * A record file that is absent or torn reads as `undefined`: a torn write must
 * degrade to an orphan, never kill the launch. Any other error propagates.
 */
async function readOptionalYaml(file: string): Promise<unknown> {
  try {
    return await readYaml(file);
  } catch (err) {
    if (
      isENOENT(err) ||
      (err instanceof Error && err.name === "YAMLParseError")
    )
      return undefined;
    throw err;
  }
}

/**
 * One record directory's record; null when the directory is not a record.
 * `sealed` means `end.yaml` committed: the parse is safe to keep.
 */
async function readRecordDir(
  dir: string,
  name: string,
): Promise<{ record: StepRecord; sealed: boolean } | null> {
  const started = await readOptionalYaml(path.join(dir, "started.yaml"));
  if (!isPlainObject(started) || typeof started.seq !== "number") return null;
  // end.yaml is script-written; outcome.yaml is agent-written and may be
  // truncated or malformed — the turn's repair flow owns that, not rehydration.
  const end = await readOptionalYaml(path.join(dir, "end.yaml"));
  const delivered = await readOptionalYaml(path.join(dir, "outcome.yaml"));
  const ended = (end ?? {}) as RecordEnd & { endedAt?: string };
  const record: StepRecord = {
    ...(started as unknown as StepRecord),
    ...ended,
  };
  // Old records store a message; this is the one ingest point that turns it
  // into a typed cause. A typed cause passes through unchanged.
  record.cause = readCause(ended.cause);
  // Script steps carry their outcome in end.yaml; an agent's own
  // outcome.yaml wins when both exist.
  const stored = delivered ?? record.outcome;
  if (stored !== undefined) {
    record.outcome = normalizeOutcome(stored, name);
  }
  return {
    record,
    sealed: isPlainObject(end) && typeof end.endedAt === "string",
  };
}

/**
 * A backend's persistence hook. The store hands it every settled mutation, so
 * artifacts are durable where the backend keeps them before the next write.
 * `prepare` runs before the goal layout is created: it clones or initializes a
 * separate repository and installs that backend's ignore file.
 */
export interface ArtifactWriter {
  prepare(): Promise<void>;
  /** Commits the artifact tree; null when nothing changed. */
  commit(goal: string): Promise<string | null>;
  /** Commit SHAs this writer made, oldest first. */
  readonly commits: string[];
}

class FolderStore implements ArtifactStore {
  readonly goalDir: string;
  readonly tasksDir: string;
  readonly recordsDir: string;
  readonly mailboxDir: string;
  readonly iterationsDir: string;
  readonly records: RecordStore;
  readonly tasks: TaskStore;
  readonly plans: PlanStore;
  readonly mailbox: MailboxStore;
  readonly iterations: IterationStore;
  /** Directory holding all goals; its `.gitignore` keeps records out of git. */
  private readonly artifactRoot?: string;
  /** Backend persistence; absent is the plain gitignored folder backend. */
  private readonly writer?: ArtifactWriter;
  /** Process task types; a file naming one resolves its flow and kind here. */
  private readonly taskTypes: Record<string, TaskTypeDefinition>;
  /** Concurrent dispatches allocate sequence numbers; one allocator per store. */
  private readonly seqLock = new AsyncMutex();
  /** Goal-dir writes declared by the kernel, so containment can tell them from a turn's. */
  private readonly writes: DeclaredWrite[] = [];

  constructor(
    goalDir: string,
    artifactRoot: string | undefined,
    taskTypes: Record<string, TaskTypeDefinition>,
    writer?: ArtifactWriter,
  ) {
    this.goalDir = goalDir;
    this.tasksDir = path.join(goalDir, "tasks");
    this.recordsDir = path.join(goalDir, "records");
    this.mailboxDir = path.join(goalDir, "mailbox");
    this.iterationsDir = path.join(goalDir, "iterations");
    this.artifactRoot = artifactRoot;
    this.writer = writer;
    this.taskTypes = taskTypes;
    this.records = this.recordArea();
    this.tasks = this.taskArea();
    this.plans = this.planArea();
    this.mailbox = this.mailboxArea();
    this.iterations = this.iterationArea();
  }

  committed(): readonly string[] {
    return this.writer?.commits ?? [];
  }

  /** Makes the artifacts durable; every mutation ends here before it returns. */
  private async persist(): Promise<void> {
    if (!this.writer) return;
    await this.writer.commit(path.basename(this.goalDir));
  }

  pathOf(ref: ArtifactRef): string {
    const root =
      ref.area === "records"
        ? this.recordsDir
        : ref.area === "tasks"
          ? this.tasksDir
          : ref.area === "mailbox"
            ? this.mailboxDir
            : ref.area === "iterations"
              ? this.iterationsDir
              : this.goalDir;
    return ref.rel === undefined || ref.rel === ""
      ? root
      : path.join(root, ref.rel);
  }

  async localPath(ref: ArtifactRef): Promise<string> {
    const file = this.pathOf(ref);
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    return file;
  }

  private recordArea(): RecordStore {
    return {
      dir: (record) => this.recordDirOf(record),
      file: (record, name) => path.join(this.recordDirOf(record), name),
      checksLog: (record) => this.recordDirOf(record),
      dirs: () => this.recordDirs(),
      list: () => this.listRecords(),
      start: (meta) => this.startRecord(meta),
      append: (meta, end) => this.appendRecord(meta, end),
      close: (name, end) => this.closeRecord(name, end),
      seal: (name) => sealRecord(path.join(this.recordsDir, name)),
    };
  }

  private taskArea(): TaskStore {
    return {
      dir: this.tasksDir,
      path: (slug) => path.join(this.tasksDir, `${slug}.md`),
      texts: () => this.taskTexts(),
      list: () => this.listTasks(),
      read: (slug) => this.readTask(slug),
      write: (task) => this.writeTask(task),
      writeText: (slug, text) => this.writeTaskText(slug, text),
      restore: (before) => this.restoreTasks(before),
      findings: () => this.scanTaskFindings(),
      sweep: (iteration) => this.sweepTasks(iteration),
    };
  }

  private planArea(): PlanStore {
    const file = (scope: PlanScope) => resolvePlan(this.goalDir, scope);
    return {
      path: goalPlan(this.goalDir).path,
      registered: () => registeredPlans(this.goalDir),
      existing: () => existingPlans(registeredPlans(this.goalDir)),
      filesOnDisk: () => planFilesOnDisk(this.goalDir),
      read: (scope = { kind: "goal" }) => this.readFile(file(scope).rel),
      exists: async (scope = { kind: "goal" }) =>
        fs.existsSync(file(scope).path),
      write: (scope, text) => this.writeFile(file(scope).rel, text),
      remove: (scope = { kind: "goal" }) =>
        this.removeGoalFile(file(scope).rel),
    };
  }

  private mailboxArea(): MailboxStore {
    const dir = (queue: MailboxQueue): string =>
      path.join(this.mailboxDir, queue);
    return {
      holds: dir("holds"),
      quarantine: dir("quarantine"),
      rel: (queue, name) =>
        name === undefined ? `mailbox/${queue}` : `mailbox/${queue}/${name}`,
      read: (queue, name) => this.readOptional(path.join(dir(queue), name)),
      write: (queue, name, text) =>
        this.writeFile(`mailbox/${queue}/${name}`, text),
      publish: (name, text) => this.publishSteer(name, text),
      move: (from, fromName, to, toName) =>
        this.moveMailbox(from, fromName, to, toName),
      remove: (queue, name) => this.removeGoalFile(`mailbox/${queue}/${name}`),
      files: (queue) => this.mailboxFiles(queue),
      sizes: (queue) => this.mailboxSizes(queue),
    };
  }

  private iterationArea(): IterationStore {
    return {
      rel: (iteration, file) => `iterations/${iteration}/${file}`,
      path: (iteration, file) =>
        path.join(this.iterationsDir, String(iteration), file),
      read: (iteration, file) =>
        this.readOptional(
          path.join(this.iterationsDir, String(iteration), file),
        ),
      write: (iteration, file, text) =>
        this.writeFile(`iterations/${iteration}/${file}`, text),
    };
  }

  async ensureLayout(): Promise<void> {
    await this.writer?.prepare();
    await Promise.all([
      fs.promises.mkdir(this.tasksDir, { recursive: true }),
      fs.promises.mkdir(this.recordsDir, { recursive: true }),
      fs.promises.mkdir(path.join(this.mailboxDir, "inbox"), {
        recursive: true,
      }),
      fs.promises.mkdir(path.join(this.mailboxDir, "processed"), {
        recursive: true,
      }),
      fs.promises.mkdir(path.join(this.mailboxDir, "outbox"), {
        recursive: true,
      }),
      fs.promises.mkdir(this.iterationsDir, { recursive: true }),
    ]);
    await this.ensureArtifactIgnore();
    await this.persist();
  }

  /**
   * Goal records are not repository content (KERNEL0 §5). A local `.gitignore`
   * at the artifact root makes a stray `git add` skip every goal directory;
   * never replaces an existing file and never writes into a git root.
   */
  private async ensureArtifactIgnore(): Promise<void> {
    const root = this.artifactRoot;
    if (!root) return;
    if (fs.existsSync(path.join(root, ".git"))) return;
    const ignore = path.join(root, ".gitignore");
    if (fs.existsSync(ignore)) return;
    await fs.promises.mkdir(root, { recursive: true });
    await fs.promises.writeFile(
      ignore,
      "# Factory goal records live here; keep them out of the repository.\n*\n",
      "utf8",
    );
  }

  async readFile(rel: string): Promise<string | null> {
    return this.readOptional(path.join(this.goalDir, rel));
  }

  /**
   * Declares a goal-dir write before its bytes land and stamps its end when
   * the attempt settles. A declaration is the kernel's claim on the path: a
   * change the ledger explains is never the turn's, and a change it does not
   * explain still is.
   */
  private declare(rel: string): DeclaredWrite {
    const write: DeclaredWrite = { rel: rel.split(path.sep).join("/") };
    this.writes.push(write);
    return write;
  }

  declaredWrites(): readonly DeclaredWrite[] {
    return this.writes;
  }

  async writeFile(rel: string, text: string): Promise<void> {
    const write = this.declare(rel);
    try {
      await writeTextAtomic(path.join(this.goalDir, rel), text);
    } finally {
      write.endedAt = new Date().toISOString();
    }
    await this.persist();
  }

  async listDir(rel: string): Promise<string[]> {
    try {
      const entries = await fs.promises.readdir(path.join(this.goalDir, rel));
      return entries.sort();
    } catch (err) {
      if (isENOENT(err)) return [];
      throw err;
    }
  }

  async listTasks(): Promise<TaskFile[]> {
    const tasks: TaskFile[] = [];
    for (const [slug, text] of await this.taskTexts()) {
      try {
        tasks.push(parseTaskFile(text, slug, this.taskTypes));
      } catch (err) {
        if (!(err instanceof TaskFileError)) throw err;
      }
    }
    return tasks.sort((a, b) => a.slug.localeCompare(b.slug));
  }

  private async taskTexts(): Promise<Map<string, string>> {
    const texts = new Map<string, string>();
    for (const name of await this.listDir("tasks")) {
      if (!name.endsWith(".md")) continue;
      const text = await this.readFile(`tasks/${name}`);
      if (text !== null) texts.set(name.slice(0, -".md".length), text);
    }
    return texts;
  }

  async scanTaskFindings(): Promise<TaskFileFinding[]> {
    const findings: TaskFileFinding[] = [];
    for (const [slug, text] of await this.taskTexts()) {
      try {
        parseTaskFile(text, slug, this.taskTypes);
      } catch (err) {
        if (!(err instanceof TaskFileError)) throw err;
        findings.push({
          slug,
          file: `tasks/${slug}.md`,
          kind: err.kind,
          reason: err.message,
        });
      }
    }
    return findings;
  }

  async sweepTasks(iteration: number): Promise<void> {
    const records = await this.listRecords();
    for (const finding of await this.scanTaskFindings()) {
      if (finding.kind !== "malformed") continue;
      const name = path.basename(finding.file);
      const taskRecords = records.filter((r) => r.slug === finding.slug);
      const status = taskRecords.some((r) => r.step === "merge")
        ? "merged"
        : taskRecords.some((r) => r.step === "finish")
          ? "finished"
          : taskRecords.some((r) => r.step === "cancel")
            ? "cancelled"
            : undefined;

      if (status) {
        await this.reportTerminalHistory(
          name,
          finding.slug,
          status,
          finding.reason,
          records,
          iteration,
        );
      } else {
        await this.quarantineTask(
          name,
          finding.slug,
          finding.reason,
          iteration,
        );
      }
    }
  }

  /**
   * An unreadable task file is moved out of `tasks/` and reported: one
   * half-written file must not wedge every launch that lists tasks. The file is
   * kept under `tasks/quarantine/` for the operator; a name already there gets
   * a numeric suffix rather than overwriting the earlier casualty.
   */
  private async quarantineTask(
    name: string,
    slug: string,
    reason: string,
    iteration: number,
  ): Promise<void> {
    const dir = path.join(this.tasksDir, "quarantine");
    await fs.promises.mkdir(dir, { recursive: true });
    const stem = name.slice(0, -".md".length);
    let target = path.join(dir, name);
    for (let copy = 2; fs.existsSync(target); copy++) {
      target = path.join(dir, `${stem}-${copy}.md`);
    }
    // The rename is a kernel write on both ends: the file leaves `tasks/` and
    // lands under the quarantine dir.
    const removed = this.declare(
      path.relative(this.goalDir, path.join(this.tasksDir, name)),
    );
    const created = this.declare(path.relative(this.goalDir, target));
    try {
      await fs.promises.rename(path.join(this.tasksDir, name), target);
    } catch (err) {
      // A concurrent listing already quarantined it; nothing left to report.
      if (isENOENT(err)) return;
      throw err;
    } finally {
      const endedAt = new Date().toISOString();
      removed.endedAt = endedAt;
      created.endedAt = endedAt;
    }
    const destination = path.relative(this.goalDir, target);
    await this.appendRecord(
      {
        iteration,
        slug,
        step: "task-quarantine",
        round: 1,
        actor: "script",
      },
      {
        ok: false,
        cause: makeCause(
          "quarantine",
          `task file "${name}" quarantined at ${destination}: ${reason}`,
        ),
      },
    );
  }

  /**
   * A slug with a merged, finished or cancelled record keeps its broken file:
   * moving it would leave the terminal record with no file, and a later file
   * reusing the slug would inherit that record. Report it once so repeated
   * listings do not pile up records.
   */
  private async reportTerminalHistory(
    name: string,
    slug: string,
    status: TaskStatus,
    reason: string,
    records: StepRecord[],
    iteration: number,
  ): Promise<void> {
    const marker = `task file "${name}" is unreadable`;
    const alreadyReported = records.some(
      (record) =>
        record.step === "task-quarantine" &&
        record.cause?.kind === "quarantine" &&
        record.cause.detail.startsWith(marker),
    );
    if (alreadyReported) return;
    await this.appendRecord(
      {
        iteration,
        slug,
        step: "task-quarantine",
        round: 1,
        actor: "script",
      },
      {
        ok: false,
        cause: makeCause(
          "quarantine",
          `${marker}; left in tasks/ because its slug already has a terminal record (${status}): ${reason}`,
        ),
      },
    );
  }

  async readTask(slug: string): Promise<TaskFile | null> {
    const text = await this.readFile(`tasks/${slug}.md`);
    return text === null ? null : parseTaskFile(text, slug, this.taskTypes);
  }

  async writeTask(task: TaskFile): Promise<void> {
    await this.writeTaskText(task.slug, renderTaskFile(task));
  }

  private async writeTaskText(slug: string, text: string): Promise<void> {
    const write = this.declare(`tasks/${slug}.md`);
    try {
      await writeTextAtomic(path.join(this.tasksDir, `${slug}.md`), text);
    } finally {
      write.endedAt = new Date().toISOString();
    }
    await this.persist();
  }

  /**
   * Restores the task files a turn changed, byte for byte, and deletes the
   * files it created. Names the slugs it put back.
   */
  private async restoreTasks(before: Map<string, string>): Promise<string[]> {
    const texts = await this.taskTexts();
    const changed = new Set<string>();
    for (const [slug, original] of before) {
      if (texts.get(slug) === original) continue;
      await this.writeTaskText(slug, original);
      changed.add(slug);
    }
    for (const slug of texts.keys()) {
      if (before.has(slug)) continue;
      await this.removeGoalFile(`tasks/${slug}.md`);
      changed.add(slug);
    }
    return [...changed].sort();
  }

  /** Deletes a goal-relative file as a declared kernel write; absent is a no-op. */
  private async removeGoalFile(rel: string): Promise<void> {
    const write = this.declare(rel);
    try {
      await fs.promises.rm(path.join(this.goalDir, rel), { force: true });
    } finally {
      write.endedAt = new Date().toISOString();
    }
    await this.persist();
  }

  /** Reads an absolute path; null when absent. */
  private async readOptional(file: string): Promise<string | null> {
    try {
      return await readText(file);
    } catch (err) {
      if (isENOENT(err)) return null;
      throw err;
    }
  }

  private recordDirOf(record: StepRecord): string {
    return path.join(this.recordsDir, recordDirName(record.seq, record));
  }

  private async recordDirs(): Promise<RecordDir[]> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(this.recordsDir, {
        withFileTypes: true,
      });
    } catch (err) {
      if (isENOENT(err)) return [];
      throw err;
    }
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .map((name) => {
        const dir = path.join(this.recordsDir, name);
        return {
          name,
          path: dir,
          started: fs.existsSync(path.join(dir, "started.yaml")),
          ended: fs.existsSync(path.join(dir, "end.yaml")),
        };
      });
  }

  private async closeRecord(name: string, end: RecordEnd): Promise<void> {
    const dir = path.join(this.recordsDir, name);
    await writeYamlAtomic(path.join(dir, "end.yaml"), {
      ...end,
      endedAt: new Date().toISOString(),
    });
    await sealRecord(dir);
    await this.persist();
  }

  private async nextSeq(): Promise<number> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(this.recordsDir, {
        withFileTypes: true,
      });
    } catch (err) {
      if (isENOENT(err)) return 0;
      throw err;
    }
    let max = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const match = RECORD_DIR.exec(entry.name);
      if (match?.[1]) max = Math.max(max, Number(match[1]));
    }
    return max;
  }

  async startRecord(meta: RecordStart): Promise<TurnRecord> {
    await fs.promises.mkdir(this.recordsDir, { recursive: true });
    const { dir, started } = await this.seqLock.runExclusive(async () => {
      const seq = (await this.nextSeq()) + 1;
      const record: StepRecord = {
        ...meta,
        seq,
        startedAt: new Date().toISOString(),
      };
      const recordDir = path.join(this.recordsDir, recordDirName(seq, meta));
      await fs.promises.mkdir(recordDir, { recursive: true });
      await writeYamlAtomic(path.join(recordDir, "started.yaml"), record);
      return { dir: recordDir, started: record };
    });
    await this.persist();
    const outcomePath = path.join(dir, "outcome.yaml");
    const finish = async (end: RecordEnd): Promise<StepRecord> => {
      // A kernel-owned rewrite reopens a sealed record and seals it again.
      await unsealRecord(dir);
      try {
        if (end.outcome) await writeYamlAtomic(outcomePath, end.outcome);
        const ended = { ...end, endedAt: new Date().toISOString() };
        await writeYamlAtomic(path.join(dir, "end.yaml"), ended);
        return { ...started, ...ended };
      } finally {
        await sealRecord(dir);
      }
    };
    return {
      dir,
      meta: started,
      outcomePath,
      finish: async (end) => {
        const record = await finish(end);
        await this.persist();
        return record;
      },
    };
  }

  async appendRecord(meta: RecordStart, end: RecordEnd): Promise<StepRecord> {
    const turn = await this.startRecord(meta);
    return turn.finish(end);
  }

  async listRecords(): Promise<StepRecord[]> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(this.recordsDir, {
        withFileTypes: true,
      });
    } catch (err) {
      if (isENOENT(err)) return [];
      throw err;
    }
    const records: StepRecord[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(this.recordsDir, entry.name);
      const cached = sealedRecords.get(recordCacheKey(dir));
      if (cached) {
        records.push(cached);
        continue;
      }
      const loaded = await readRecordDir(dir, entry.name);
      if (loaded === null) continue;
      if (loaded.sealed) {
        sealedRecords.set(recordCacheKey(dir), loaded.record);
      }
      records.push(loaded.record);
    }
    return records.sort((a, b) => a.seq - b.seq);
  }

  /**
   * A steer is published the way every writer must: a private file on the same
   * filesystem, then a rename, so a reader never sees a partial inbox file.
   */
  private async publishSteer(name: string, text: string): Promise<void> {
    const tmp = path.join(this.mailboxDir, ".tmp");
    await fs.promises.mkdir(tmp, { recursive: true });
    const temp = path.join(
      tmp,
      `${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`,
    );
    await fs.promises.writeFile(temp, text, "utf8");
    const target = path.join(this.mailboxDir, "inbox", name);
    const write = this.declare(`mailbox/inbox/${name}`);
    try {
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await fs.promises.rename(temp, target);
    } finally {
      write.endedAt = new Date().toISOString();
    }
    await this.persist();
  }

  private async moveMailbox(
    from: MailboxQueue,
    fromName: string,
    to: MailboxQueue,
    toName: string,
  ): Promise<boolean> {
    const source = path.join(this.mailboxDir, from, fromName);
    const target = path.join(this.mailboxDir, to, toName);
    const removed = this.declare(`mailbox/${from}/${fromName}`);
    const created = this.declare(`mailbox/${to}/${toName}`);
    try {
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await fs.promises.rename(source, target);
      await this.persist();
      return true;
    } catch (err) {
      // A concurrent reader moved it first; the caller has nothing left to do.
      if (isENOENT(err)) return false;
      throw err;
    } finally {
      const endedAt = new Date().toISOString();
      removed.endedAt = endedAt;
      created.endedAt = endedAt;
    }
  }

  private async mailboxFiles(queue: MailboxQueue): Promise<string[]> {
    return [...(await this.mailboxSizes(queue)).keys()];
  }

  private async mailboxSizes(
    queue: MailboxQueue,
  ): Promise<Map<string, number>> {
    const dir = path.join(this.mailboxDir, queue);
    const sizes = new Map<string, number>();
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (isENOENT(err)) return sizes;
      throw err;
    }
    for (const entry of entries) {
      if (!entry.isFile() || entry.name.startsWith(".")) continue;
      try {
        sizes.set(
          entry.name,
          (await fs.promises.stat(path.join(dir, entry.name))).size,
        );
      } catch (err) {
        if (!isENOENT(err)) throw err;
      }
    }
    return new Map([...sizes.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }
}

/**
 * A goal-root file no area owns, such as a pre-canonical spike's `finish/`
 * copy. The backend owns the goal's layout; the caller names the file.
 */
export async function readGoalFile(
  goalDir: string,
  rel: string,
): Promise<string | null> {
  try {
    return await readText(path.join(goalDir, rel));
  } catch (err) {
    if (isENOENT(err)) return null;
    throw err;
  }
}

/** `artifactRoot` (the goal's parent) receives a `.gitignore` so records stay out of git. */
export function createFolderStore(
  goalDir: string,
  artifactRoot: string | undefined,
  taskTypes: Record<string, TaskTypeDefinition>,
  writer?: ArtifactWriter,
): ArtifactStore {
  return new FolderStore(goalDir, artifactRoot, taskTypes, writer);
}
