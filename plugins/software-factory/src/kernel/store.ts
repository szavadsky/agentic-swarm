import fs from "node:fs";
import path from "node:path";
import { readText, readYaml, writeTextAtomic, writeYamlAtomic } from "../core/records/io.js";
import { AsyncMutex } from "../core/mutex.js";
import { parseTaskFile, renderTaskFile } from "./tasks.js";
import type {
  ArtifactStore,
  Outcome,
  RecordEnd,
  RecordStart,
  StepRecord,
  TaskFile,
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

class FolderStore implements ArtifactStore {
  readonly goalDir: string;
  readonly tasksDir: string;
  readonly recordsDir: string;
  readonly mailboxDir: string;
  readonly iterationsDir: string;
  /** Concurrent dispatches allocate sequence numbers; one allocator per store. */
  private readonly seqLock = new AsyncMutex();

  constructor(goalDir: string) {
    this.goalDir = goalDir;
    this.tasksDir = path.join(goalDir, "tasks");
    this.recordsDir = path.join(goalDir, "records");
    this.mailboxDir = path.join(goalDir, "mailbox");
    this.iterationsDir = path.join(goalDir, "iterations");
  }

  async ensureLayout(): Promise<void> {
    await Promise.all([
      fs.promises.mkdir(this.tasksDir, { recursive: true }),
      fs.promises.mkdir(this.recordsDir, { recursive: true }),
      fs.promises.mkdir(path.join(this.mailboxDir, "inbox"), { recursive: true }),
      fs.promises.mkdir(path.join(this.mailboxDir, "processed"), { recursive: true }),
      fs.promises.mkdir(path.join(this.mailboxDir, "outbox"), { recursive: true }),
      fs.promises.mkdir(this.iterationsDir, { recursive: true }),
    ]);
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
    for (const name of await this.listDir("tasks")) {
      if (!name.endsWith(".md")) continue;
      const slug = name.slice(0, -".md".length);
      const text = await this.readFile(`tasks/${name}`);
      if (text !== null) tasks.push(parseTaskFile(text, slug));
    }
    return tasks.sort((a, b) => a.slug.localeCompare(b.slug));
  }

  async readTask(slug: string): Promise<TaskFile | null> {
    const text = await this.readFile(`tasks/${slug}.md`);
    return text === null ? null : parseTaskFile(text, slug);
  }

  async writeTask(task: TaskFile): Promise<void> {
    await writeTextAtomic(path.join(this.tasksDir, `${task.slug}.md`), renderTaskFile(task));
  }

  private async nextSeq(): Promise<number> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(this.recordsDir, { withFileTypes: true });
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
      const record: StepRecord = { ...meta, seq, startedAt: new Date().toISOString() };
      const recordDir = path.join(this.recordsDir, recordDirName(seq, meta));
      await fs.promises.mkdir(recordDir, { recursive: true });
      await writeYamlAtomic(path.join(recordDir, "started.yaml"), record);
      return { dir: recordDir, started: record };
    });
    const outcomePath = path.join(dir, "outcome.yaml");
    const finish = async (end: RecordEnd): Promise<StepRecord> => {
      if (end.outcome) await writeYamlAtomic(outcomePath, end.outcome);
      const ended = { ...end, endedAt: new Date().toISOString() };
      await writeYamlAtomic(path.join(dir, "end.yaml"), ended);
      return { ...started, ...ended };
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
      entries = await fs.promises.readdir(this.recordsDir, { withFileTypes: true });
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
        if (isENOENT(err) || (err instanceof Error && err.name === "YAMLParseError")) continue;
        throw err;
      }
      if (!isPlainObject(started) || typeof started.seq !== "number") continue;
      const base = started as unknown as StepRecord;
      let end: RecordEnd & { endedAt?: string } = {};
      try {
        end = (await readYaml(path.join(dir, "end.yaml"))) as RecordEnd & { endedAt?: string };
      } catch (err) {
        if (!isENOENT(err)) throw err;
      }
      let outcome: Outcome | undefined;
      try {
        outcome = (await readYaml(path.join(dir, "outcome.yaml"))) as Outcome;
      } catch (err) {
        if (!isENOENT(err)) throw err;
      }
      records.push({ ...base, ...end, ...(outcome ? { outcome } : {}) });
    }
    return records.sort((a, b) => a.seq - b.seq);
  }
}

export function createFolderStore(goalDir: string): ArtifactStore {
  return new FolderStore(goalDir);
}
