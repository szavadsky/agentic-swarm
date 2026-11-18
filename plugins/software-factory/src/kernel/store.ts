import fs from "node:fs";
import path from "node:path";
import { AsyncMutex } from "../core/mutex.js";
import {
  readText,
  readYaml,
  writeTextAtomic,
  writeYamlAtomic,
} from "../core/records/io.js";
import { terminalFactFromRecords } from "./derive-task.js";
import { parseTaskFile, renderTaskFile, TaskFileError } from "./tasks.js";
import type {
  ArtifactStore,
  Outcome,
  RecordEnd,
  RecordStart,
  StepRecord,
  TaskFile,
  TaskStatus,
  TaskTypeDefinition,
  TurnRecord,
} from "./types.js";

const RECORD_DIR = /^(\d{5})-/;

function isENOENT(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === "ENOENT";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordDirName(seq: number, meta: RecordStart): string {
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
}

/** Reopen a sealed record for a kernel-owned rewrite; seal it after. */
export async function unsealRecord(dir: string): Promise<void> {
  await chmodRecord(dir, 0o644);
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

class FolderStore implements ArtifactStore {
  readonly goalDir: string;
  readonly tasksDir: string;
  readonly recordsDir: string;
  readonly mailboxDir: string;
  readonly iterationsDir: string;
  /** Directory holding all goals; its `.gitignore` keeps records out of git. */
  private readonly artifactRoot?: string;
  /** Process task types; a file naming one resolves its flow and kind here. */
  private readonly taskTypes: Record<string, TaskTypeDefinition>;
  /** Concurrent dispatches allocate sequence numbers; one allocator per store. */
  private readonly seqLock = new AsyncMutex();

  constructor(
    goalDir: string,
    artifactRoot?: string,
    taskTypes: Record<string, TaskTypeDefinition> = {},
  ) {
    this.goalDir = goalDir;
    this.tasksDir = path.join(goalDir, "tasks");
    this.recordsDir = path.join(goalDir, "records");
    this.mailboxDir = path.join(goalDir, "mailbox");
    this.iterationsDir = path.join(goalDir, "iterations");
    this.artifactRoot = artifactRoot;
    this.taskTypes = taskTypes;
  }

  async ensureLayout(): Promise<void> {
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
    try {
      return await readText(path.join(this.goalDir, rel));
    } catch (err) {
      if (isENOENT(err)) return null;
      throw err;
    }
  }

  async writeFile(rel: string, text: string): Promise<void> {
    await writeTextAtomic(path.join(this.goalDir, rel), text);
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
    let records: StepRecord[] | undefined;
    for (const name of await this.listDir("tasks")) {
      if (!name.endsWith(".md")) continue;
      const slug = name.slice(0, -".md".length);
      const text = await this.readFile(`tasks/${name}`);
      if (text === null) continue;
      try {
        tasks.push(parseTaskFile(text, slug, this.taskTypes));
      } catch (err) {
        if (!(err instanceof TaskFileError)) throw err;
        records ??= await this.listRecords();
        const terminal = terminalFactFromRecords(records, slug)?.status ?? null;
        // Quarantine reports land on the current iteration so the summary
        // and metrics for this launch name the vanished task; iteration 0
        // is invisible to every operator surface.
        const iteration = records.reduce(
          (max, record) => Math.max(max, record.iteration),
          1,
        );
        if (isTerminalHistory(terminal)) {
          await this.reportTerminalHistory(
            name,
            slug,
            terminal,
            err.message,
            records,
            iteration,
          );
        } else {
          await this.quarantineTask(name, slug, err.message, iteration);
        }
      }
    }
    return tasks.sort((a, b) => a.slug.localeCompare(b.slug));
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
    try {
      await fs.promises.rename(path.join(this.tasksDir, name), target);
    } catch (err) {
      // A concurrent listing already quarantined it; nothing left to report.
      if (isENOENT(err)) return;
      throw err;
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
        cause: `task file "${name}" quarantined at ${destination}: ${reason}`,
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
        record.step === "task-quarantine" && record.cause?.startsWith(marker),
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
        cause: `${marker}; left in tasks/ because its slug already has a terminal record (${status}): ${reason}`,
      },
    );
  }

  async readTask(slug: string): Promise<TaskFile | null> {
    const text = await this.readFile(`tasks/${slug}.md`);
    return text === null ? null : parseTaskFile(text, slug, this.taskTypes);
  }

  async writeTask(task: TaskFile): Promise<void> {
    await writeTextAtomic(
      path.join(this.tasksDir, `${task.slug}.md`),
      renderTaskFile(task),
    );
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
    return { dir, meta: started, outcomePath, finish };
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
      let started: unknown;
      try {
        started = await readYaml(path.join(dir, "started.yaml"));
      } catch (err) {
        // A directory without a usable started.yaml is not a record.
        if (
          isENOENT(err) ||
          (err instanceof Error && err.name === "YAMLParseError")
        )
          continue;
        throw err;
      }
      if (!isPlainObject(started) || typeof started.seq !== "number") continue;
      const base = started as unknown as StepRecord;
      // end.yaml is script-written but a torn write must degrade to an orphan,
      // never kill the launch; outcome.yaml is agent-written and may be
      // truncated or malformed — the turn's repair flow owns that, not rehydration.
      let end: RecordEnd & { endedAt?: string } = {};
      try {
        end = (await readYaml(path.join(dir, "end.yaml"))) as RecordEnd & {
          endedAt?: string;
        };
      } catch (err) {
        if (
          !isENOENT(err) &&
          !(err instanceof Error && err.name === "YAMLParseError")
        )
          throw err;
      }
      let outcome: Outcome | undefined;
      try {
        outcome = (await readYaml(path.join(dir, "outcome.yaml"))) as Outcome;
      } catch (err) {
        if (
          !isENOENT(err) &&
          !(err instanceof Error && err.name === "YAMLParseError")
        )
          throw err;
      }
      records.push({ ...base, ...end, ...(outcome ? { outcome } : {}) });
    }
    return records.sort((a, b) => a.seq - b.seq);
  }
}

/** `artifactRoot` (the goal's parent) receives a `.gitignore` so records stay out of git. */
export function createFolderStore(
  goalDir: string,
  artifactRoot?: string,
  taskTypes: Record<string, TaskTypeDefinition> = {},
): ArtifactStore {
  return new FolderStore(goalDir, artifactRoot, taskTypes);
}
