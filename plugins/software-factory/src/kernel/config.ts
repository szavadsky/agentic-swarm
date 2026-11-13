import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import yaml from "yaml";
import { DEFAULT_TIMEOUTS } from "./types.js";
import { formatFindings, type Finding } from "./findings.js";
import type {
  ConfigBundle,
  ConfigFiles,
  GoalPaths,
  Limits,
  ProcessConfig,
  RepoConfig,
  RunConfig,
} from "./types.js";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));

const identitySchema = z.object({ name: z.string().min(1), email: z.string().min(1) }).strict();
const gateSchema = z.object({ id: z.string().min(1), command: z.string().min(1) }).strict();

/** `.factory/repo.yaml` — the tracked layer: branches, paths, gates. */
export const repoConfigSchema = z
  .object({
    baseBranch: z.string().min(1).default("main"),
    artifactRoot: z.string().min(1).default(".factory/artifacts"),
    worktreeRoot: z.string().min(1).optional(),
    identity: identitySchema.optional(),
    setup: z.array(z.string().min(1)).default([]),
    gates: z.array(gateSchema).default([]),
  })
  .strict();

/** One flow step; `review` marks the step that consumes a review round. */
export const flowStepSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, "step id must be a simple name (no path separators)"),
    role: z.string().min(1),
    review: z.boolean().default(false),
  })
  .strict();

export const followUpSchema = z
  .object({
    mode: z.enum(["same-session", "de-novo", "different-model"]).default("same-session"),
    role: z.string().min(1).optional(),
  })
  .default({ mode: "same-session" });

export const flowSchema = z
  .object({
    steps: z.array(flowStepSchema).min(1),
    reviewRounds: z.number().int().positive().default(2),
    followUp: followUpSchema,
  })
  .strict();

/** Process layer: package default deep-merged with an optional repo override. */
export const processConfigSchema = z
  .object({
    flows: z.record(z.string(), flowSchema).default({}),
    roles: z
      .record(
        z.string(),
        z.object({ prompt: z.string().min(1), alias: z.string().min(1).optional() }).strict()
      )
      .default({}),
    itemTurns: z.number().int().positive().default(8),
    calibration: z.string().optional(),
    promptsDir: z.string().min(1).optional(),
  })
  .strict();

/**
 * USD per million tokens. Every rate is required: a model is either fully
 * priced or absent from the table, which is how unknown differs from $0.
 */
export const modelPriceSchema = z
  .object({
    input: z.number().nonnegative(),
    cachedInput: z.number().nonnegative(),
    output: z.number().nonnegative(),
    reasoning: z.number().nonnegative(),
  })
  .strict();

/** Run layer: not tracked; aliases, prices, limits, session store, scout pin. */
export const aliasSchema = z
  .object({
    harness: z.string().min(1),
    model: z.string().min(1),
    effort: z.string().min(1).optional(),
    fallbacks: z.array(z.string().min(1)).default([]),
    /** Run-config alias the PM ladder climbs to after this alias's tier fails. */
    escalateTo: z.string().min(1).optional(),
    /** Per-alias turn bounds; the defaults cover a full test-suite run. */
    timeouts: z
      .object({
        idleMs: z.number().int().positive().default(DEFAULT_TIMEOUTS.idleMs),
        wallMs: z.number().int().positive().default(DEFAULT_TIMEOUTS.wallMs),
      })
      .default(() => ({ ...DEFAULT_TIMEOUTS })),
  })
  .strict();

export const runConfigSchema = z
  .object({
    aliases: z.record(z.string(), aliasSchema).default({}),
    /** Model id -> USD per Mtok; harnesses that report no cost are priced from here. */
    prices: z.record(z.string(), modelPriceSchema).default({}),
    limits: z
      .object({
        concurrency: z.number().int().positive().default(2),
        perHarness: z.record(z.string(), z.number().int().positive()).default({}),
        iterations: z.number().int().positive().default(1),
        /** Optional drain limits for one iteration. */
        turns: z.number().int().positive().optional(),
        wallMinutes: z.number().positive().optional(),
        /** Optional USD brake: crossing it drains the iteration. */
        iterationUsd: z.number().positive().optional(),
      })
      .strict()
      .default(() => ({ concurrency: 2, perHarness: {}, iterations: 1 })),
    sessions: z
      .object({
        /** Empty resolves to <worktreeRoot>/.sessions, outside the repo. */
        dir: z.string().default(""),
        keepRuns: z.number().int().nonnegative().default(5),
      })
      .strict()
      .default(() => ({ dir: "", keepRuns: 5 })),
    worktreeRoot: z.string().min(1).optional(),
    scouts: z.object({ model: z.string().min(1), effort: z.string().min(1).optional() }).strict().optional(),
  })
  .strict();

export class ConfigError extends Error {
  readonly findings: Finding[];
  readonly report: string;

  constructor(findings: Finding[]) {
    const report = formatFindings(`configuration is invalid (${findings.length} violation(s)):`, findings);
    super(report);
    this.name = "ConfigError";
    this.findings = findings;
    this.report = report;
  }
}

export interface LoadConfigOptions {
  /** Overrides run-config launch limit (--iterations). */
  iterations?: number;
  /** Explicit run-config path; defaults to <repo>/.factory/run.yaml. */
  runConfigPath?: string;
}

export function configFilePaths(repoRoot: string, opts: LoadConfigOptions = {}): ConfigFiles {
  const root = path.resolve(repoRoot);
  return {
    repo: path.join(root, ".factory", "repo.yaml"),
    processDefault: path.join(packageRoot, "config", "process.yaml"),
    processOverride: path.join(root, ".factory", "process.yaml"),
    run: path.resolve(
      opts.runConfigPath ?? globalThis.process.env.FACTORY_RUN_CONFIG ?? path.join(root, ".factory", "run.yaml")
    ),
  };
}

interface Layer {
  data?: unknown;
  findings: Finding[];
}

function readLayer(file: string): Layer {
  if (!fs.existsSync(file)) return { findings: [] };
  try {
    return { data: yaml.parse(fs.readFileSync(file, "utf8")) ?? undefined, findings: [] };
  } catch (err) {
    return {
      findings: [{ file, key: "(yaml)", message: (err as Error).message.split("\n")[0] ?? "parse error" }],
    };
  }
}

function parseLayer<T>(
  schema: z.ZodType<T>,
  data: unknown,
  fileFor: string | ((issuePath: PropertyKey[]) => string),
  findings: Finding[]
): T | undefined {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;
  for (const issue of result.error.issues) {
    findings.push({
      file: typeof fileFor === "string" ? fileFor : fileFor(issue.path),
      key: issue.path.length > 0 ? issue.path.join(".") : "(root)",
      message: issue.message,
    });
  }
  return undefined;
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

function processFileFor(data: unknown, issuePath: PropertyKey[], files: ConfigFiles): string {
  const key = issuePath[0];
  if (typeof key === "string" && data && typeof data === "object" && key in data) {
    return files.processOverride;
  }
  return files.processDefault;
}

/**
 * Loads the three layers into one report. Missing files take schema defaults;
 * a missing run config leaves aliases empty so pre-flight names the roles
 * instead of inventing a harness.
 */
export function loadConfigs(repoRoot: string, opts: LoadConfigOptions = {}): ConfigBundle {
  const files = configFilePaths(repoRoot, opts);
  const findings: Finding[] = [];
  const repoLayer = readLayer(files.repo);
  const baseLayer = readLayer(files.processDefault);
  const overrideLayer = readLayer(files.processOverride);
  const runLayer = readLayer(files.run);
  findings.push(...repoLayer.findings, ...baseLayer.findings, ...overrideLayer.findings, ...runLayer.findings);

  const repo = parseLayer(repoConfigSchema, repoLayer.data, files.repo, findings);
  const processMerged = deepMerge(baseLayer.data ?? {}, overrideLayer.data);
  const processData = parseLayer(
    processConfigSchema,
    processMerged,
    (issuePath) => processFileFor(overrideLayer.data, issuePath, files),
    findings
  );
  const run = parseLayer(runConfigSchema, runLayer.data, files.run, findings);
  if (processData) {
    for (const [name, flow] of Object.entries(processData.flows)) {
      if (flow.followUp?.mode === "different-model" && !flow.followUp.role) {
        findings.push({
          file: processFileFor(overrideLayer.data, ["flows", name], files),
          key: `flows.${name}.followUp.role`,
          message: "follow-up mode different-model needs a role",
        });
      }
    }
  }
  if (findings.length > 0) throw new ConfigError(findings);

  if (opts.iterations !== undefined) run!.limits.iterations = opts.iterations;
  return {
    repo: repo as RepoConfig,
    process: processData as ProcessConfig,
    run: run as RunConfig,
    files,
  };
}

function expandHome(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) return path.join(os.homedir(), value.slice(2));
  return value;
}

function fromRoot(root: string, value: string): string {
  return path.resolve(root, expandHome(value));
}

export function resolveGoalPaths(configs: ConfigBundle, repoRoot: string, goal: string): GoalPaths {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(goal)) {
    throw new Error(`goal name "${goal}" must be kebab-case (a-z, 0-9, dashes)`);
  }
  const root = path.resolve(repoRoot);
  const configuredWorktree = configs.run.worktreeRoot ?? configs.repo.worktreeRoot;
  const worktreeRoot = configuredWorktree
    ? fromRoot(root, configuredWorktree)
    : path.resolve(root, "..", ".factory-worktrees", path.basename(root));
  return {
    repoRoot: root,
    goalDir: fromRoot(root, path.join(expandHome(configs.repo.artifactRoot), goal)),
    goalCheckout: path.join(worktreeRoot, goal),
    integrationBranch: `factory/${goal}`,
    worktreeRoot,
    sessionsDir: configs.run.sessions.dir
      ? fromRoot(root, configs.run.sessions.dir)
      : path.join(worktreeRoot, ".sessions"),
  };
}

/**
 * Everything `next` and dispatch need from the three layers. The drain limits
 * are carried here, so no caller has to reach back into the config for them.
 */
export function toLimits(configs: ConfigBundle): Limits {
  const flows: Limits["flows"] = {};
  for (const [name, flow] of Object.entries(configs.process.flows)) {
    flows[name] = flow;
  }
  return {
    itemTurns: configs.process.itemTurns,
    flows,
    iterations: configs.run.limits.iterations,
    concurrency: configs.run.limits.concurrency,
    perHarness: configs.run.limits.perHarness,
    iterationTurns: configs.run.limits.turns,
    iterationWallMs: configs.run.limits.wallMinutes
      ? Math.round(configs.run.limits.wallMinutes * 60_000)
      : undefined,
    iterationUsd: configs.run.limits.iterationUsd,
  };
}

export { packageRoot };
