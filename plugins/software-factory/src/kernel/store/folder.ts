/** The folder backend's final class: plans, mailbox, iterations and the store factory. */

import fs from "node:fs";
import path from "node:path";
import { readText } from "../../core/records/io.js";
import {
  existingPlans,
  goalPlan,
  planFilesOnDisk,
  type PlanScope,
  registeredPlans,
  resolvePlan,
} from "../plan-file.js";
import type {
  ArtifactStore,
  IterationStore,
  MailboxQueue,
  MailboxStore,
  PlanStore,
  RecordStore,
  TaskStore,
  TaskTypeDefinition,
} from "../types.js";
import type { ArtifactWriter } from "./types.js";
import { isENOENT } from "./folder-core.js";
import { FolderTaskStore } from "./folder-tasks.js";

class FolderStore extends FolderTaskStore implements ArtifactStore {
  readonly records: RecordStore;
  readonly tasks: TaskStore;
  readonly plans: PlanStore;
  readonly mailbox: MailboxStore;
  readonly iterations: IterationStore;

  constructor(
    goalDir: string,
    artifactRoot: string | undefined,
    taskTypes: Record<string, TaskTypeDefinition>,
    writer?: ArtifactWriter,
  ) {
    super(goalDir, artifactRoot, taskTypes, writer);
    this.records = this.recordArea();
    this.tasks = this.taskArea();
    this.plans = this.planArea();
    this.mailbox = this.mailboxArea();
    this.iterations = this.iterationArea();
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
