import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { appendJournal } from "./journal.js";
import { writeYamlAtomic } from "./records/io.js";
import { git } from "./git/exec.js";
import { commitAll } from "./git/commit.js";
import type { PipelineConfig } from "./artifacts.js";
import type { Repo } from "./git/repo.js";

export const DEFAULT_MIN_FREE_DISK_MB = 2048;

export type DiskSpaceProbe = (targetPath: string) => number | Promise<number>;

export interface DiskPathCheck {
  name: string;
  path: string;
  freeMb: number;
  thresholdMb: number;
  ok: boolean;
}

export interface DiskSpaceCheckResult {
  ok: boolean;
  minFreeDiskMb: number;
  paths: DiskPathCheck[];
  failingPaths: DiskPathCheck[];
}

/**
 * Finds the nearest ancestor directory that exists on disk.
 */
export function findExistingAncestor(p: string): string {
  let curr = path.resolve(p);
  while (!fs.existsSync(curr)) {
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return curr;
}

/**
 * Default probe using standard fs.statfsSync.
 */
export function defaultDiskSpaceProbe(targetPath: string): number {
  const existing = findExistingAncestor(targetPath);
  const stats = fs.statfsSync(existing);
  const freeBytes = Number(stats.bavail) * Number(stats.bsize);
  return Math.floor(freeBytes / (1024 * 1024));
}

let activeDiskSpaceProbe: DiskSpaceProbe = defaultDiskSpaceProbe;

export function getDiskSpaceProbe(): DiskSpaceProbe {
  return activeDiskSpaceProbe;
}

export function setDiskSpaceProbe(probe: DiskSpaceProbe): void {
  activeDiskSpaceProbe = probe;
}

export function resetDiskSpaceProbe(): void {
  activeDiskSpaceProbe = defaultDiskSpaceProbe;
}

/**
 * Resolves the filesystems/directories that must be monitored for free space:
 * 1. worktreeRoot filesystem (where task & item worktrees live)
 * 2. .factory-runtime/tmp (TMPDIR used for children processes)
 * 3. main repo filesystem
 * 4. parent system temp dir (os.tmpdir() and /tmp)
 */
export function resolveDiskSpaceTargets(options: {
  repoRoot: string;
  worktreeRoot?: string;
  runtimeTmpDir?: string;
}): Array<{ name: string; path: string }> {
  const repoRoot = path.resolve(options.repoRoot);
  const wtRoot = path.resolve(repoRoot, options.worktreeRoot ?? "../repo.factory-wt");
  const childTmp = options.runtimeTmpDir ?? path.join(wtRoot, ".factory-runtime", "tmp");
  const sysTmp = path.resolve(os.tmpdir());

  const targets: Array<{ name: string; path: string }> = [
    { name: "worktreeRoot", path: wtRoot },
    { name: ".factory-runtime/tmp", path: childTmp },
    { name: "repoRoot", path: repoRoot },
    { name: "tmpdir", path: sysTmp },
  ];

  const posixTmp = "/tmp";
  if (fs.existsSync(posixTmp)) {
    const resolvedPosix = path.resolve(posixTmp);
    if (resolvedPosix !== sysTmp) {
      targets.push({ name: "/tmp", path: resolvedPosix });
    }
  }

  return targets;
}

/**
 * Checks free disk space on all monitored filesystems against minFreeDiskMb.
 */
export async function checkDiskSpace(options: {
  repoRoot: string;
  worktreeRoot?: string;
  runtimeTmpDir?: string;
  minFreeDiskMb?: number;
  probe?: DiskSpaceProbe;
}): Promise<DiskSpaceCheckResult> {
  const threshold = options.minFreeDiskMb ?? DEFAULT_MIN_FREE_DISK_MB;
  const probe = options.probe ?? getDiskSpaceProbe();
  const targets = resolveDiskSpaceTargets({
    repoRoot: options.repoRoot,
    worktreeRoot: options.worktreeRoot,
    runtimeTmpDir: options.runtimeTmpDir,
  });

  const paths: DiskPathCheck[] = [];
  const failingPaths: DiskPathCheck[] = [];

  for (const target of targets) {
    let freeMb: number;
    try {
      freeMb = await probe(target.path);
    } catch (err: any) {
      throw new Error(
        `Failed to probe free disk space for ${target.name} (${target.path}): ${err?.message ?? err}`
      );
    }

    const ok = freeMb >= threshold;
    const check: DiskPathCheck = {
      name: target.name,
      path: target.path,
      freeMb,
      thresholdMb: threshold,
      ok,
    };
    paths.push(check);
    if (!ok) {
      failingPaths.push(check);
    }
  }

  return {
    ok: failingPaths.length === 0,
    minFreeDiskMb: threshold,
    paths,
    failingPaths,
  };
}

export class LowDiskSpaceStopError extends Error {
  readonly code = "LOW_DISK_SPACE";
  readonly details: DiskSpaceCheckResult;

  constructor(message: string, details: DiskSpaceCheckResult) {
    super(message);
    this.name = "LowDiskSpaceStopError";
    this.details = details;
  }
}

/**
 * Asserts that sufficient disk space exists. If below threshold:
 * 1. Journals low_disk_space in {taskDir}/journal.ndjson
 * 2. Writes low-disk-space.yaml into steer/tousertoreview/
 * 3. Commits to task worktree if available
 * 4. Throws LowDiskSpaceStopError
 */
export async function assertDiskSpace(options: {
  repoRoot: string;
  worktreeRoot?: string;
  runtimeTmpDir?: string;
  pipeline?: PipelineConfig;
  task?: string;
  taskDir?: string;
  taskWt?: string;
  repo?: Repo;
  probe?: DiskSpaceProbe;
}): Promise<void> {
  const minFreeDiskMb =
    (options.pipeline?.limits?.minFreeDiskMb as number | undefined) ?? DEFAULT_MIN_FREE_DISK_MB;

  const result = await checkDiskSpace({
    repoRoot: options.repoRoot,
    worktreeRoot: options.worktreeRoot,
    runtimeTmpDir: options.runtimeTmpDir,
    minFreeDiskMb,
    probe: options.probe,
  });

  if (result.ok) {
    return;
  }

  const failingReport = result.failingPaths
    .map((p) => `${p.name} (${p.path}): ${p.freeMb} MB free`)
    .join(", ");
  const allReport = result.paths
    .map((p) => `${p.name} (${p.path}): ${p.freeMb} MB free`)
    .join(", ");

  const message = `Low disk space: free space is below ${minFreeDiskMb} MB threshold on: ${failingReport}`;

  if (options.taskDir) {
    // 1. Journal low_disk_space event
    try {
      await appendJournal(options.taskDir, {
        type: "low_disk_space",
        task: options.task,
        minFreeDiskMb,
        paths: result.paths.map((p) => ({
          name: p.name,
          path: p.path,
          freeMb: p.freeMb,
          ok: p.ok,
        })),
        failingPaths: result.failingPaths.map((p) => ({
          name: p.name,
          path: p.path,
          freeMb: p.freeMb,
        })),
      });
    } catch {
      // Best-effort journal write
    }

    // 2. Write stable-id tousertoreview item
    try {
      const steerDir = path.join(options.taskDir, "steer", "tousertoreview");
      await fs.promises.mkdir(steerDir, { recursive: true });
      const qPath = path.join(steerDir, "low-disk-space.yaml");

      await writeYamlAtomic(qPath, {
        id: "low-disk-space",
        ref: options.task ?? "task",
        disposition: "human-stop",
        question: `Low disk space detected: free space is below ${minFreeDiskMb} MB threshold. Monitored paths: ${allReport}. Free disk space before proceeding.`,
        blocks: ["task"],
        status: "open",
        createdAt: new Date().toISOString(),
      });
    } catch {
      // Best-effort question write
    }

    // 3. Commit question to task worktree if available
    if (options.taskWt && options.repo) {
      try {
        await git(options.taskWt, ["add", "-A"], { allowFail: true });
        await commitAll(options.repo, options.taskWt, "factory: raise low-disk-space question");
      } catch {
        // Ignore git errors during disk-space shortage
      }
    }
  }

  throw new LowDiskSpaceStopError(message, result);
}
