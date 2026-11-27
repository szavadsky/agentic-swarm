/** The record area: record directory names, sealing and the append-only stream. */

import fs from "node:fs";
import path from "node:path";
import { readYaml, writeYamlAtomic } from "../../core/records/io.js";
import { readCause } from "../cause.js";
import type {
  RecordDir,
  RecordedOutcome,
  RecordEnd,
  RecordStart,
  RecordStore,
  StepRecord,
  TaskStatus,
  TurnRecord,
} from "../types.js";
import { migrateStallRoutes } from "../types/outcome.js";
import { FolderStoreCore, isENOENT } from "./folder-core.js";

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

  // Old outcomes spell the retired park action `continue`; read it as the
  // current `replace`, exactly as outcome ingest does.
  const outcome = {
    ...(migrateStallRoutes(raw) as Record<string, unknown>),
  } as any;

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

export class FolderRecordStore extends FolderStoreCore {
  protected recordArea(): RecordStore {
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

  protected recordDirOf(record: StepRecord): string {
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
        startedAt: meta.startedAt ?? new Date().toISOString(),
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
}
