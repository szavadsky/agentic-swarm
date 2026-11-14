import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadConfigs, resolveGoalPaths, toLimits } from "../../src/kernel/config.js";
import type { ModelPrice } from "../../src/kernel/pricing.js";
import { loadPrompts } from "../../src/kernel/prompts.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { prepareIntegrationCheckout } from "../../src/kernel/worktree.js";
import type { KernelRuntime, Outcome, TaskFile } from "../../src/kernel/types.js";

export interface FlowRepoOptions {
  gates?: { id: string; command: string }[];
  setup?: string[];
  /** Raw `.factory/process.yaml` override. */
  process?: Record<string, unknown>;
  limits?: Record<string, unknown>;
  /** Model id -> USD per Mtok, for harnesses that report no cost. */
  prices?: Record<string, ModelPrice>;
  aliases?: Record<
    string,
    {
      harness: string;
      model: string;
      effort?: string;
      fallbacks?: string[];
      timeouts?: { idleMs: number; wallMs: number };
    }
  >;
  goal?: string;
  /** `.factory/repo.yaml` identity for commits the engine authors. */
  identity?: { name: string; email: string };
}

export interface FlowRepo {
  repo: TmpRepo;
  goalDir: string;
  goal: string;
}

export function outcome(patch: Record<string, unknown> = {}): Outcome {
  return {
    status: "done",
    summary: "ok",
    concerns: [],
    forward: [],
    ...patch,
  } as Outcome;
}

export function setupFlowRepo(opts: FlowRepoOptions = {}): FlowRepo {
  const goal = opts.goal ?? "demo";
  const repo = createTmpRepo();
  const gates = opts.gates ?? [{ id: "readme", command: "test -f README.md" }];
  repo.writeFile(
    ".factory/repo.yaml",
    yaml.stringify({
      baseBranch: "main",
      artifactRoot: ".factory/artifacts",
      setup: opts.setup ?? [],
      gates,
      ...(opts.identity ? { identity: opts.identity } : {}),
    })
  );
  const aliases = opts.aliases ?? {
    architect: { harness: "fake", model: "fake-architect" },
    pm: { harness: "fake", model: "fake-pm" },
    implementer: { harness: "fake", model: "fake-impl" },
    reviewer: { harness: "fake", model: "fake-review" },
  };
  repo.writeFile(
    ".factory/run.yaml",
    yaml.stringify({
      aliases,
      ...(opts.prices ? { prices: opts.prices } : {}),
      limits: { iterations: 1, concurrency: 1, ...(opts.limits ?? {}) },
    })
  );
  if (opts.process) {
    repo.writeFile(".factory/process.yaml", yaml.stringify(opts.process));
  }
  repo.commit("factory config");
  const goalDir = path.join(repo.dir, ".factory/artifacts", goal);
  fs.mkdirSync(goalDir, { recursive: true });
  fs.writeFileSync(path.join(goalDir, "intent.md"), "# Goal\n\nTest goal.\n", "utf8");
  return { repo, goalDir, goal };
}

export async function makeRuntime(
  repo: TmpRepo,
  goal: string,
  harnesses: Record<string, FakeHarness>
): Promise<KernelRuntime> {
  const configs = loadConfigs(repo.dir);
  const paths = resolveGoalPaths(configs, repo.dir, goal);
  const store = createFolderStore(paths.goalDir, path.dirname(paths.goalDir));
  await store.ensureLayout();
  const runtime: KernelRuntime = {
    paths,
    configs,
    repo: new Repo({
      mainRoot: repo.dir,
      worktreeRoot: paths.worktreeRoot,
      identity: configs.repo.identity,
    }),
    store,
    harnesses: new Map(Object.entries(harnesses)),
    prompts: loadPrompts(configs.process, repo.dir),
    limits: toLimits(configs),
  };
  await prepareIntegrationCheckout(runtime);
  return runtime;
}

export async function writeTask(runtime: KernelRuntime, task: TaskFile): Promise<void> {
  await runtime.store.writeTask(task);
}

export function goalCheckout(repo: TmpRepo, goal: string): string {
  return resolveGoalPaths(loadConfigs(repo.dir), repo.dir, goal).goalCheckout;
}

export function cleanupFlowRepo(repo: TmpRepo): void {
  const worktreeRoot = path.resolve(repo.dir, "..", ".factory-worktrees", path.basename(repo.dir));
  try {
    repo.cleanup();
  } finally {
    fs.rmSync(worktreeRoot, { recursive: true, force: true });
  }
}

/** A handler that writes one file per task and approves its review. */
export function filePerTaskHandler(counter: { active: number; max: number }, delayMs = 20) {
  return async (req: Parameters<FakeHarness["turn"]>[0], ctx: { writeOutcome(value: unknown): void }) => {
    counter.active += 1;
    counter.max = Math.max(counter.max, counter.active);
    try {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      const slug = path.basename(req.cwd!);
      if (req.prompt.startsWith("You review")) {
        ctx.writeOutcome(outcome({ summary: `${slug} review`, verdict: "approve" }));
      } else {
        fs.writeFileSync(path.join(req.cwd!, `${slug}.txt`), `${slug}\n`, "utf8");
        ctx.writeOutcome(outcome({ summary: `${slug} implemented` }));
      }
      return fakeTurnResult(req);
    } finally {
      counter.active -= 1;
    }
  };
}
