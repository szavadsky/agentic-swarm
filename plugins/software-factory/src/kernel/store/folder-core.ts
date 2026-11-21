/** The folder store's base: goal paths, goal-dir IO, the kernel write ledger and backend persistence. */

import fs from "node:fs";
import path from "node:path";
import { AsyncMutex } from "../../core/mutex.js";
import { readText, writeTextAtomic } from "../../core/records/io.js";
import type {
  ArtifactRef,
  DeclaredWrite,
  TaskTypeDefinition,
} from "../types.js";
import type { ArtifactWriter } from "./types.js";

export function isENOENT(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === "ENOENT";
}

/** Subclasses add one artifact area each; the final class installs them all. */
export abstract class FolderStoreCore {
  readonly goalDir: string;
  readonly tasksDir: string;
  readonly recordsDir: string;
  readonly mailboxDir: string;
  readonly iterationsDir: string;
  /** Directory holding all goals; its `.gitignore` keeps records out of git. */
  protected readonly artifactRoot?: string;
  /** Backend persistence; absent is the plain gitignored folder backend. */
  protected readonly writer?: ArtifactWriter;
  /** Process task types; a file naming one resolves its flow and kind here. */
  protected readonly taskTypes: Record<string, TaskTypeDefinition>;
  /** Concurrent dispatches allocate sequence numbers; one allocator per store. */
  protected readonly seqLock = new AsyncMutex();
  /** Goal-dir writes declared by the kernel, so containment can tell them from a turn's. */
  protected readonly writes: DeclaredWrite[] = [];

  protected constructor(
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
  }

  protected async persist(): Promise<void> {
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
  protected declare(rel: string): DeclaredWrite {
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

  protected async removeGoalFile(rel: string): Promise<void> {
    const write = this.declare(rel);
    try {
      await fs.promises.rm(path.join(this.goalDir, rel), { force: true });
    } finally {
      write.endedAt = new Date().toISOString();
    }
    await this.persist();
  }

  /** Reads an absolute path; null when absent. */
  protected async readOptional(file: string): Promise<string | null> {
    try {
      return await readText(file);
    } catch (err) {
      if (isENOENT(err)) return null;
      throw err;
    }
  }
}
