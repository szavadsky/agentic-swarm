/** Repository identity, git dirs, artifact resolution and goal paths. */

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import type {
  ArtifactBackendConfig,
  ArtifactLocation,
  ConfigBundle,
  GoalPaths,
  GoalRoots,
  Limits,
} from "../types.js";
import { DEFAULT_PARK_AMENDS, limitsSchema } from "./run-schema.js";

export function expandHome(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/") || value.startsWith("~\\"))
    return path.join(os.homedir(), value.slice(2));
  return value;
}

function fromRoot(root: string, value: string): string {
  return path.resolve(root, expandHome(value));
}

/**
 * Stable id for one repository. Two repositories configured with the same
 * worktree root must not share a checkout, a lock or a session tree; the
 * basename keeps paths readable, the digest keeps them distinct.
 */
export function repositoryId(repoRoot: string): string {
  const root = canonicalPath(repoRoot);
  const digest = createHash("sha256").update(root).digest("hex").slice(0, 8);
  return `${path.basename(root)}-${digest}`;
}

/** The path with symlinks resolved; a missing path resolves lexically. */
function canonicalPath(target: string): string {
  try {
    return fs.realpathSync(target);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT")
      return path.resolve(target);
    throw err;
  }
}

/** The gitdir a checkout's `.git` file or directory names, when it has one. */
function gitDirOf(dir: string): string | undefined {
  const dotGit = path.join(dir, ".git");
  let stat: fs.Stats;
  try {
    stat = fs.statSync(dotGit);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
  if (stat.isDirectory()) return dotGit;
  let text: string;
  try {
    text = fs.readFileSync(dotGit, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
  const match = /^gitdir:\s*(.+)$/m.exec(text);
  return match?.[1] ? path.resolve(dir, match[1].trim()) : undefined;
}

/** The repository's common git dir, also when its main checkout is a linked worktree. */
function commonGitDir(repoRoot: string): string | undefined {
  const gitDir = gitDirOf(repoRoot);
  if (!gitDir) return undefined;
  try {
    return path.resolve(
      gitDir,
      fs.readFileSync(path.join(gitDir, "commondir"), "utf8").trim(),
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return gitDir;
  }
}

/**
 * The checkout a launch created before paths carried a repo id. It keeps
 * resolving when it is a worktree of this repository; another repository that
 * shares the worktree root may have created the same path first.
 */
function legacyCheckout(
  base: string,
  goal: string,
  repoRoot: string,
): string | undefined {
  const candidate = path.join(base, goal);
  const gitDir = gitDirOf(candidate);
  const common = commonGitDir(repoRoot);
  if (!gitDir || !common) return undefined;
  const worktrees = canonicalPath(path.join(common, "worktrees"));
  return canonicalPath(gitDir).startsWith(worktrees + path.sep)
    ? candidate
    : undefined;
}

/** True when `child` is strictly below `parent`; symlinks are not resolved. */
function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * A local path remote resolves against the repo; a scheme or scp-style remote
 * is passed through for git to handle.
 */
function resolveRemote(repoRoot: string, remote: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(remote) || /^[^/]+@[^:]+:/.test(remote))
    return remote;
  return path.resolve(repoRoot, expandHome(remote));
}

/**
 * The configured backend resolved to one root. A same-repo store must live
 * inside the repository it is committed to; a separate repository must not sit
 * inside the main checkout, where a stray `git add` would absorb it.
 */
function resolveArtifacts(
  configs: ConfigBundle,
  root: string,
  worktreeRoot: string,
): ArtifactLocation {
  const configured: ArtifactBackendConfig = configs.repo.artifacts ?? {
    backend: "folder",
  };
  const fallback =
    configured.backend === "git-repo"
      ? path.join(worktreeRoot, "artifacts")
      : configs.repo.artifactRoot;
  const location = fromRoot(root, configured.root ?? fallback);
  if (configured.backend === "same-repo" && !isInside(location, root)) {
    throw new Error(
      `artifacts.root "${location}" must be inside the repository for the same-repo backend`,
    );
  }
  if (
    configured.backend === "git-repo" &&
    (location === root || isInside(location, root))
  ) {
    throw new Error(
      `artifacts.root "${location}" must be outside the repository for the git-repo backend`,
    );
  }
  return {
    backend: configured.backend,
    root: location,
    ...(configured.remote
      ? { remote: resolveRemote(root, configured.remote) }
      : {}),
  };
}

export function resolveRoots(
  configs: ConfigBundle,
  repoRoot: string,
): GoalRoots {
  const root = path.resolve(repoRoot);
  const baseRoot = configs.run.worktreeRoot
    ? fromRoot(root, configs.run.worktreeRoot)
    : path.resolve(root, "..", ".factory-worktrees", path.basename(root));
  const worktreeRoot = path.join(baseRoot, repositoryId(root));
  return {
    repoRoot: root,
    worktreeRoot,
    sessionsDir: configs.run.sessions.dir
      ? fromRoot(root, configs.run.sessions.dir)
      : path.join(worktreeRoot, ".sessions"),
  };
}

export function resolveGoalPaths(
  configs: ConfigBundle,
  repoRoot: string,
  goal: string,
): GoalPaths {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(goal)) {
    throw new Error(
      `goal name "${goal}" must be kebab-case (a-z, 0-9, dashes)`,
    );
  }
  const roots = resolveRoots(configs, repoRoot);
  const artifacts = resolveArtifacts(
    configs,
    roots.repoRoot,
    roots.worktreeRoot,
  );
  return {
    ...roots,
    goalDir: path.join(artifacts.root, goal),
    goalCheckout:
      legacyCheckout(path.dirname(roots.worktreeRoot), goal, roots.repoRoot) ??
      path.join(roots.worktreeRoot, goal),
    integrationBranch: `factory/${goal}`,
    artifacts,
  };
}

/**
 * Everything `next` and dispatch need from the three layers. The drain limits
 * are carried here, so no caller has to reach back into the config for them.
 */
export function toLimits(configs: ConfigBundle): Limits {
  const runLimits: z.infer<typeof limitsSchema> = configs.run.limits;
  const flows: Limits["flows"] = {};
  for (const [name, flow] of Object.entries(configs.process.flows)) {
    flows[name] = flow;
  }
  return {
    flows,
    iterations: runLimits.iterations,
    concurrency: runLimits.concurrency,
    planCheckRounds: runLimits.planCheckRounds,
    resumeAttempts: runLimits.resumeAttempts ?? 2,
    parkAmends: runLimits.parkAmends ?? DEFAULT_PARK_AMENDS,
    iterationTurns: runLimits.turns,
    iterationWallMs:
      runLimits.iterationMinutes !== undefined
        ? Math.round(runLimits.iterationMinutes * 60_000)
        : runLimits.wallMinutes
          ? Math.round(runLimits.wallMinutes * 60_000)
          : undefined,
    iterationUsd: runLimits.iterationUsd,
    ...(runLimits.turnMinutes !== undefined
      ? { turnMinutes: runLimits.turnMinutes }
      : {}),
    ...(runLimits.iterationMinutes !== undefined
      ? { iterationMinutes: runLimits.iterationMinutes }
      : {}),
    ...(runLimits.steerDebounceSeconds !== undefined
      ? { steerDebounceMs: Math.round(runLimits.steerDebounceSeconds * 1000) }
      : {}),
    ...(runLimits.minTmpFreeBytes !== undefined
      ? { minTmpFreeBytes: runLimits.minTmpFreeBytes }
      : {}),
  };
}
