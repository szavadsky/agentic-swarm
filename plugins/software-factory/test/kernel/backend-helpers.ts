import { expect } from "bun:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import { steerGoal } from "../../src/cli/commands.js";
import {
  loadConfigs,
  repoConfigSchema,
  resolveGoalPaths,
} from "../../src/kernel/config.js";
import { derive } from "../../src/kernel/derive.js";
import {
  createArtifactStore,
  isPrivateArtifact,
} from "../../src/kernel/store-backend.js";
import type { ArtifactBackend, GoalPaths } from "../../src/kernel/types.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import {
  cleanup,
  DEFAULT_RUN_YAML,
  type E2EGoal,
  expectLaunch,
  outcome,
  writePlan,
} from "./e2e-helpers.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";

export const BACKENDS: readonly ArtifactBackend[] = [
  "folder",
  "same-repo",
  "git-repo",
];

const PLAN = `# Milestone 1 — files

## alpha
Create alpha.txt so the integration branch carries it.
Done when: alpha.txt exists.
`;

const ALPHA = `---
slug: alpha
title: Create alpha
kind: task
flow: implement-review
deps: []
scope: [alpha.txt]
source: Milestone 1 / alpha
---

Create alpha.txt.

Done when: alpha.txt exists.
`;

const PRIVATE_FILES: ReadonlyArray<[string, string]> = [
  ["sessions/launch/raw.jsonl", '{"raw":"agent stream"}\n'],
  ["logs/kernel.log", "raw log line\n"],
  ["raw/prompt.txt", "raw prompt\n"],
];

export interface BackendGoal extends E2EGoal {
  /** The temp parent shared by the repository, bare remote and store checkout. */
  temp: string;
  bare?: string;
  storeRoot?: string;
}

/** The backend block a repository config carries for one backend. */
function artifactsBlock(
  backend: ArtifactBackend,
  opts: {
    root?: string;
    remote?: string;
  } = {},
): Record<string, string> {
  return {
    backend,
    ...(opts.root ? { root: opts.root } : {}),
    ...(opts.remote ? { remote: opts.remote } : {}),
  };
}

/**
 * A goal whose config selects `backend`. The store is created through the
 * production factory, so the matrix exercises the same path resolution and
 * backend preparation a launch does.
 */
export async function makeBackendGoal(
  backend: ArtifactBackend,
  opts: { root?: string } = {},
): Promise<BackendGoal> {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "factory-backends-"));
  const repo = createTmpRepo();
  let bare: string | undefined;
  let storeRoot = opts.root;
  if (backend === "git-repo") {
    bare = path.join(temp, "artifacts.git");
    storeRoot = opts.root ?? path.join(temp, "artifacts-store");
    execFileSync("git", ["init", "--bare", "-b", "main", bare], {
      stdio: "ignore",
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" },
    });
  }
  repo.writeFile(
    ".factory/repo.yaml",
    yaml.stringify({
      baseBranch: "main",
      artifactRoot: ".factory/artifacts",
      ...(backend === "folder"
        ? {}
        : {
            artifacts: artifactsBlock(backend, {
              root: storeRoot,
              remote: bare,
            }),
          }),
      setup: [],
      gates: [{ id: "alpha-exists", command: "test -f alpha.txt" }],
    }),
  );
  repo.writeFile(".factory/run.yaml", DEFAULT_RUN_YAML);
  repo.commit("factory config");
  const configs = loadConfigs(repo.dir);
  const paths = resolveGoalPaths(configs, repo.dir, "demo");
  const store = createArtifactStore(paths, configs.process.taskTypes);
  await store.ensureLayout();
  await store.writeFile("intent.md", "# Goal\n\nCreate alpha.\n");
  await store.writeFile("class.yaml", "class: bigger\n");
  for (const [rel, text] of PRIVATE_FILES) await store.writeFile(rel, text);
  return {
    repo,
    goalDir: paths.goalDir,
    planPath: path.join(paths.goalDir, "plan.md"),
    tasksDir: path.join(paths.goalDir, "tasks"),
    temp,
    ...(bare ? { bare } : {}),
    ...(storeRoot ? { storeRoot } : {}),
  };
}

/** The kernel scenario: plan → task → implement → approve → merge; relaunch closes it. */
export async function runKernelScenario(goal: BackendGoal): Promise<void> {
  const harness = new FakeHarness({ id: "fake" });
  harness.script((req, ctx) => {
    writePlan(goal.goalDir, PLAN);
    ctx.writeOutcome(
      outcome({ summary: "planned alpha", decision: "continue" }),
    );
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(goal.tasksDir, "alpha.md"), ALPHA, "utf8");
    ctx.writeOutcome(outcome({ summary: "filed alpha" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "alpha added" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(
      outcome({ summary: "alpha is correct", verdict: "approve" }),
    );
    return fakeTurnResult(req);
  });
  await expectLaunch(3, goal.repo, harness);

  const second = new FakeHarness({ id: "fake" });
  second.script((req, ctx) => {
    const digest = path.join(goal.goalDir, "iterations/2/digest.md");
    expect(fs.readFileSync(digest, "utf8")).toContain("architect");
    fs.appendFileSync(digest, "\n## Loops\n- none\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "digest written" }));
    return fakeTurnResult(req);
  });
  second.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "goal met", decision: "done" }));
    return fakeTurnResult(req);
  });
  await expectLaunch(0, goal.repo, second);
}

export function tracked(repo: TmpRepo, pathspec?: string): string[] {
  const args = ["ls-files"];
  if (pathspec) args.push("--", pathspec);
  return repo
    .git(args)
    .stdout.split("\n")
    .filter((line) => line.length > 0);
}

export function historyFiles(repo: TmpRepo): string[] {
  return repo
    .git(["log", "--all", "--name-only", "--format="])
    .stdout.split("\n")
    .filter((line) => line.length > 0);
}

export function bareFiles(bare: string): string[] {
  return bareGit(bare, ["ls-tree", "-r", "--name-only", "HEAD"])
    .split("\n")
    .filter((line) => line.length > 0);
}

export function bareGit(bare: string, args: string[]): string {
  return execFileSync("git", [`--git-dir=${bare}`, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" },
  }).trim();
}

export function privateHits(files: readonly string[]): string[] {
  return files.filter(
    (file) =>
      /(^|\/)(sessions|logs|raw)\//.test(file) || /\.(jsonl|log)$/.test(file),
  );
}

/** A git command in an arbitrary checkout (the separate store repo). */
export function gitIn(dir: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" },
  }).trim();
}

export function tempGoalPaths(repo: TmpRepo): GoalPaths {
  return resolveGoalPaths(loadConfigs(repo.dir), repo.dir, "demo");
}

export function removeGoal(goal: BackendGoal): void {
  cleanup(goal);
  fs.rmSync(goal.temp, { recursive: true, force: true });
}
