import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import yaml from "yaml";
import type { ConfigBundle, GoalPaths, Limits, ProcessConfig, RepoConfig, RunConfig } from "./types.js";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));

const identitySchema = z.object({ name: z.string(), email: z.string() });

/** `.factory/repo.yaml` — the tracked layer: branches, paths, gates. */
export const repoConfigSchema = z.object({
  baseBranch: z.string().min(1).default("main"),
  artifactRoot: z.string().min(1).default(".factory/artifacts"),
  worktreeRoot: z.string().optional(),
  identity: identitySchema.optional(),
  setup: z.array(z.string().min(1)).default([]),
  gates: z
    .array(z.object({ id: z.string().min(1), command: z.string().min(1) }))
    .default([]),
});

/** One flow step; `review` marks the step that consumes a review round. */
export const flowStepSchema = z.object({
  id: z.string().min(1),
  role: z.string().min(1),
  review: z.boolean().default(false),
});

export const flowSchema = z.object({
  steps: z.array(flowStepSchema).min(1),
  reviewRounds: z.number().int().positive().default(2),
});

/** Process layer: package default deep-merged with an optional repo override. */
export const processConfigSchema = z.object({
  flows: z.record(z.string(), flowSchema).default({}),
  roles: z
    .record(z.string(), z.object({ prompt: z.string().min(1), alias: z.string().optional() }))
    .default({}),
  itemTurns: z.number().int().positive().default(8),
  calibration: z.string().optional(),
  promptsDir: z.string().optional(),
});

/** Run layer: not tracked; aliases, limits, session store. */
export const aliasSchema = z.object({
  harness: z.string().min(1),
  model: z.string().min(1),
  effort: z.string().optional(),
  fallbacks: z.array(z.string()).default([]),
});

export const runConfigSchema = z.object({
  aliases: z.record(z.string(), aliasSchema).default({}),
  limits: z
    .object({
      concurrency: z.number().int().positive().default(2),
      perHarness: z.record(z.string(), z.number().int().positive()).default({}),
      iterations: z.number().int().positive().default(1),
    })
    .default(() => ({ concurrency: 2, perHarness: {}, iterations: 1 })),
  sessions: z
    .object({
      /** Empty resolves to <worktreeRoot>/.sessions, outside the repo. */
      dir: z.string().default(""),
      keepRuns: z.number().int().nonnegative().default(5),
    })
    .default(() => ({ dir: "", keepRuns: 5 })),
  worktreeRoot: z.string().optional(),
});

function readYamlFile(filePath: string): unknown {
  if (!fs.existsSync(filePath)) return undefined;
  return yaml.parse(fs.readFileSync(filePath, "utf8")) ?? undefined;
}

/** Arrays replace; plain objects merge key by key. */
function deepMerge(base: unknown, override: unknown): unknown {
  if (override === undefined) return base;
  if (Array.isArray(base) || Array.isArray(override)) return override;
  if (base && override && typeof base === "object" && typeof override === "object") {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
      out[key] = deepMerge(out[key], value);
    }
    return out;
  }
  return override;
}

export interface LoadConfigOptions {
  /** Overrides run-config launch limit (--iterations). */
  iterations?: number;
  /** Explicit run-config path; defaults to <repo>/.factory/run.yaml. */
  runConfigPath?: string;
}

/**
 * Loads the three layers. Missing files fall back to schema defaults; a
 * missing run config leaves aliases empty so pre-flight can name what is
 * unresolved instead of inventing a harness.
 */
export function loadConfigs(repoRoot: string, opts: LoadConfigOptions = {}): ConfigBundle {
  const repo = repoConfigSchema.parse(readYamlFile(path.join(repoRoot, ".factory", "repo.yaml")) ?? {});
  const processBase = readYamlFile(path.join(packageRoot, "config", "process.yaml"));
  const processOverride = readYamlFile(path.join(repoRoot, ".factory", "process.yaml"));
  const processConfig = processConfigSchema.parse(deepMerge(processBase ?? {}, processOverride) ?? {});
  const runPath =
    opts.runConfigPath ?? globalThis.process.env.FACTORY_RUN_CONFIG ?? path.join(repoRoot, ".factory", "run.yaml");
  const run = runConfigSchema.parse(readYamlFile(runPath) ?? {});
  if (opts.iterations !== undefined) run.limits.iterations = opts.iterations;
  return {
    repo: repo as RepoConfig,
    process: processConfig as ProcessConfig,
    run: run as RunConfig,
  };
}

export function resolveGoalPaths(configs: ConfigBundle, repoRoot: string, goal: string): GoalPaths {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(goal)) {
    throw new Error(`goal name "${goal}" must be kebab-case (a-z, 0-9, dashes)`);
  }
  const root = path.resolve(repoRoot);
  const worktreeRoot = path.resolve(
    root,
    configs.run.worktreeRoot ?? configs.repo.worktreeRoot ?? path.join("..", ".factory-worktrees", path.basename(root))
  );
  return {
    repoRoot: root,
    goalDir: path.resolve(root, configs.repo.artifactRoot, goal),
    goalCheckout: path.join(worktreeRoot, goal),
    integrationBranch: `factory/${goal}`,
    worktreeRoot,
    sessionsDir: configs.run.sessions.dir
      ? path.resolve(root, configs.run.sessions.dir)
      : path.join(worktreeRoot, ".sessions"),
  };
}

export function toLimits(configs: ConfigBundle): Limits {
  const flows: Limits["flows"] = {};
  for (const [name, flow] of Object.entries(configs.process.flows)) {
    flows[name] = { reviewRounds: flow.reviewRounds };
  }
  return {
    itemTurns: configs.process.itemTurns,
    flows,
    iterations: configs.run.limits.iterations,
    concurrency: configs.run.limits.concurrency,
    perHarness: configs.run.limits.perHarness,
  };
}

export { packageRoot };
