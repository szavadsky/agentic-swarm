/** The task area: listing, findings, sweep and turn-write restore. */

import fs from "node:fs";
import path from "node:path";
import { writeTextAtomic } from "../../core/records/io.js";
import { makeCause } from "../cause.js";
import { parseTaskFile, renderTaskFile, TaskFileError } from "../tasks.js";
import type {
  StepRecord,
  TaskFile,
  TaskFileFinding,
  TaskStatus,
  TaskStore,
} from "../types.js";
import { isENOENT } from "./folder-core.js";
import { FolderRecordStore } from "./folder-records.js";

export class FolderTaskStore extends FolderRecordStore {
  protected taskArea(): TaskStore {
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
}
