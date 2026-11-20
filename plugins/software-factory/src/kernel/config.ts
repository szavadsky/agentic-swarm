import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "yaml";
import { z } from "zod";
import { acpxConfigSchema } from "../harness/acpx/config.js";
import { type Finding, formatFindings } from "./findings.js";
import { DEFAULT_POOL_RESET_MINUTES } from "./quota-pools.js";
import type {
  BoundaryStep,
  ConfigBundle,
  ConfigFiles,
  GoalPaths,
  Limits,
  ProcessConfig,
  RepoConfig,
  RunConfig,
} from "./types.js";
import { BOUNDARY_STEPS, DEFAULT_TIMEOUTS } from "./types.js";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));

const identitySchema = z
  .object({ name: z.string().min(1), email: z.string().min(1) })
  .strict();
/**
 * A gate path that must stay inside its worktree. Absolute, `~` and `..`
 * paths would let two concurrent gate runs share one directory (which is what
 * `env` exists to prevent) or write and read outside the tree.
 */
function worktreePath(label: string) {
  return z
    .string()
    .min(1)
    .refine(
      (value) =>
        !path.isAbsolute(value) &&
        !value.startsWith("~") &&
        !value.split(/[\\/]/).includes(".."),
      { message: `${label} must be worktree-relative (no absolute, ~ or ..)` },
    );
}
const gateEnvDirSchema = worktreePath("env dirs");
const gateJunitPathSchema = worktreePath("junit path");
const gateSchema = z
  .object({
    id: z.string().min(1),
    command: z.string().min(1),
    serial: z.array(z.string().min(1)).default([]),
    env: z
      .record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), gateEnvDirSchema)
      .optional(),
    format: z
      .object({
        junit: gateJunitPathSchema.optional(),
        pattern: z.enum(["pytest", "jest", "cargo"]).optional(),
      })
      .strict()
      .refine((val) => val.junit !== undefined || val.pattern !== undefined, {
        message: "format must contain junit or pattern",
      })
      .optional(),
  })
  .strict();

/** `.factory/repo.yaml` — the tracked layer: branches, paths, gates. */
export const repoConfigSchema = z
  .object({
    baseBranch: z.string().min(1).default("main"),
    artifactRoot: z.string().min(1).default(".factory/artifacts"),
    identity: identitySchema.optional(),
    setup: z.array(z.string().min(1)).default([]),
    gates: z.array(gateSchema).default([]),
    cleanliness: z
      .object({
        maxFileSizeBytes: z.number().int().positive().optional(),
        allowedExtensions: z.array(z.string().min(1)).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/** One step's prompt template and run-config alias. */
export const turnSchema = z
  .object({
    prompt: z.string().min(1),
    alias: z.string().min(1),
    /** Prompt template for the missing-outcome repair ask; defaults to `delivery-repair`. */
    repairPrompt: z.string().min(1).optional(),
    /** Product the turn must deliver; defaults by expectation, else `outcome`. */
    deliverable: z.string().min(1).optional(),
  })
  .strict();

export const followUpSchema = z
  .object({
    mode: z
      .enum(["same-session", "de-novo", "different-model"])
      .default("same-session"),
    alias: z.string().min(1).optional(),
    /** Resume the step's last session across a model switch when portable. */
    keepSession: z.boolean().optional(),
  })
  .strict()
  .refine(
    (followUp) => followUp.mode !== "different-model" || !!followUp.alias,
    {
      message: "a different-model follow-up needs an alias",
      path: ["alias"],
    },
  )
  .refine(
    (followUp) =>
      followUp.keepSession === undefined || followUp.mode === "different-model",
    {
      message: "keepSession needs a different-model follow-up",
      path: ["keepSession"],
    },
  );

/** One flow step; `review` marks the step that consumes a review round. */
export const flowStepSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .regex(
        /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/,
        "step id must be a simple name (no path separators)",
      ),
    prompt: z.string().min(1).optional(),
    alias: z.string().min(1).optional(),
    /** Prompt template for the missing-outcome repair ask; defaults to `delivery-repair`. */
    repairPrompt: z.string().min(1).optional(),
    /** Product the turn must deliver; defaults by expectation, else `outcome`. */
    deliverable: z.string().min(1).optional(),
    review: z.boolean().default(false),
    /** QA acceptance step: its own schema, verdict and gate handoff. */
    qa: z.boolean().default(false),
    /** Review, QA and checks steps: change requests honored before the last call. */
    changeRequests: z.number().int().nonnegative().optional(),
    /** Aliases later attempts run on after failure-kind launches, in order. */
    alternates: z.array(z.string().min(1)).optional(),
    /** How this step's later turn follows the one it repairs. */
    followUp: followUpSchema.optional(),
  })
  .strict()
  .refine(
    (step) =>
      step.id === "checks" ||
      (step.prompt !== undefined && step.alias !== undefined),
    {
      message: "a step other than checks needs a prompt and an alias",
      path: ["prompt"],
    },
  )
  .refine((step) => step.alternates === undefined || step.alias !== undefined, {
    message: "alternates need a step alias to alternate with",
    path: ["alternates"],
  })
  .refine((step) => !(step.review && step.qa), {
    message: "a step is either a review or a QA acceptance step, not both",
    path: ["qa"],
  });

export const flowSchema = z
  .object({
    steps: z.array(flowStepSchema).min(1),
  })
  .strict();

/**
 * One task type: the flow a task runs, whether it is a spike or development
 * work, and the kernel output schema its turns deliver. The type owns all
 * three so a task file cannot pair a spike kind with a review-only flow.
 */
export const taskTypeSchema = z
  .object({
    flow: z.string().min(1),
    kind: z.enum(["spike", "development"]),
    schema: z.string().min(1),
  })
  .strict();

/** Every boundary step names its prompt and alias; unknown steps are refused. */
export const boundarySchema = z
  .object(
    Object.fromEntries(
      BOUNDARY_STEPS.map((step) => [step, turnSchema]),
    ) as Record<BoundaryStep, typeof turnSchema>,
  )
  .strict();

/** A repo override may retarget one boundary step without restating the rest. */
export const boundaryOverrideSchema = z
  .object(
    Object.fromEntries(
      BOUNDARY_STEPS.map((step) => [step, turnSchema.optional()]),
    ) as Record<BoundaryStep, z.ZodOptional<typeof turnSchema>>,
  )
  .strict();

/**
 * An architecture prompt: the reviewers supply the aliases, the architect
 * boundary step supplies the return's alias.
 */
const promptSpecSchema = turnSchema.omit({ alias: true });

/** The plan review flow: its prompt, reviewers, and the architect's return. */
export const architectureSchema = z
  .object({
    planReview: promptSpecSchema,
    reviewers: z.array(z.string().min(1)).min(1),
    architectReturn: z.enum(["on-technical-concerns", "never"]),
    planReturn: promptSpecSchema.optional(),
  })
  .strict()
  .refine(
    (architecture) =>
      architecture.architectReturn === "never" ||
      architecture.planReturn !== undefined,
    {
      message: "an architect return needs a planReturn prompt",
      path: ["planReturn"],
    },
  );

/** A repo override may retarget one architecture key without restating the rest. */
export const architectureOverrideSchema = z
  .object({
    planReview: promptSpecSchema.optional(),
    reviewers: z.array(z.string().min(1)).min(1).optional(),
    architectReturn: z.enum(["on-technical-concerns", "never"]).optional(),
    planReturn: promptSpecSchema.optional(),
  })
  .strict();

/** The hierarchy knob: depth 1 (the norm) or 2, and the epic architect's prompt. */
export const hierarchySchema = z
  .object({
    depth: z.union([z.literal(1), z.literal(2)]),
    subarchitect: promptSpecSchema,
  })
  .strict();

/** A repo override may set the depth without restating the prompt. */
export const hierarchyOverrideSchema = z
  .object({
    depth: z.union([z.literal(1), z.literal(2)]).optional(),
    subarchitect: promptSpecSchema.optional(),
  })
  .strict();

/** Process layer: package default deep-merged with an optional repo override. */
export const processConfigSchema = z
  .object({
    flows: z.record(z.string(), flowSchema).default({}),
    taskTypes: z.record(z.string(), taskTypeSchema).default({}),
    boundary: boundarySchema,
    /** The plan review flow that completes before the PM derives tasks. */
    architecture: architectureSchema,
    /** Depth and the epic architect's prompt; depth 1 is one architect. */
    hierarchy: hierarchySchema.default({
      depth: 1,
      subarchitect: {
        prompt: "subarchitect",
        repairPrompt: "architect-repair",
        deliverable: "epic plan edit or stop decision",
      },
    }),
    /** Repair template a step renders when it names none. */
    repairPrompt: z.string().min(1).optional(),
    reminders: z.number().int().nonnegative().default(1),
    calibration: z.string().optional(),
    promptsDir: z.string().min(1).optional(),
    presets: z
      .record(
        z.string(),
        z
          .object({
            calibration: z.string().min(1),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

/**
 * A repo process override on its own: every top-level block the package
 * default already supplies is optional here, and boundary entries merge one by
 * one. The merged layer parses with `processConfigSchema`, so an override that
 * leaves a boundary step out still resolves the package default.
 */
export const processOverrideSchema = processConfigSchema.extend({
  boundary: boundaryOverrideSchema.optional(),
  architecture: architectureOverrideSchema.optional(),
  hierarchy: hierarchyOverrideSchema.optional(),
});

/** Run layer: not tracked; aliases, price ids, limits, session store, scout pin. */
export const fallbackSchema = z.union([
  z
    .object({
      /** Run-config alias whose whole ladder this tier reuses. */
      alias: z.string().min(1),
    })
    .strict(),
  z
    .object({
      /** Harness id; defaults to the alias's harness. */
      harness: z.string().min(1).optional(),
      model: z.string().min(1),
      /** Effort level; defaults to the alias's resolved effort. */
      effort: z.string().min(1).optional(),
      /** Quota pool this tier draws on; defaults to the alias's subscription. */
      subscription: z.string().min(1).optional(),
    })
    .strict(),
]);

/** One rotation entry: replaces the alias primary on the iterations that select it. */
export const aliasEntrySchema = z
  .object({
    harness: z.string().min(1),
    model: z.string().min(1),
    effort: z.string().min(1).optional(),
  })
  .strict();

export const aliasSchema = z
  .object({
    harness: z.string().min(1),
    model: z.string().min(1),
    effort: z.string().min(1).optional(),
    /**
     * Per-iteration primaries: iteration N resolves `rotate[N % rotate.length]`.
     * Absent or empty keeps the alias on its own harness and model.
     */
    rotate: z.array(aliasEntrySchema).default([]),
    /** Quota pool this alias draws on; absent means throttled only overall. */
    subscription: z.string().min(1).optional(),
    fallbacks: z.array(fallbackSchema).default([]),
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

/**
 * A harness entry binds an adapter (`acpx`), overrides the executable a native
 * adapter runs (omp), or carries opaque adapter options; at least one is needed.
 */
export const harnessEntrySchema = z
  .object({
    acpx: acpxConfigSchema.optional(),
    /**
     * Executable the factory spawns: acpx for an acpx harness (a raw agent
     * names its own executable in `acpx.agent`), omp for the native adapter.
     * Absent resolves through PATH.
     */
    binary: z.string().min(1).optional(),
    /**
     * Adapter-specific keys, never interpreted by the kernel: acpx reads
     * `args`/`env`, omp merges the rest into its launch overlay.
     */
    options: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .refine(
    (entry) =>
      entry.acpx !== undefined ||
      entry.binary !== undefined ||
      entry.options !== undefined,
    "harness entry needs an acpx binding, a binary override or options",
  );

const concurrencySchema = z
  .object({
    overall: z.number().int().positive().default(2),
    /** Quota-pool name -> parallel sessions; pools are named on aliases. */
    perSubscription: z
      .record(z.string(), z.number().int().positive())
      .default({}),
    /** Model id -> parallel sessions; empty means no per-model cap. */
    perModel: z.record(z.string(), z.number().int().positive()).default({}),
  })
  .strict()
  .default(() => ({ overall: 2, perSubscription: {}, perModel: {} }));

/** Amends one parked slug may receive per iteration when the run config says nothing. */
export const DEFAULT_PARK_AMENDS = 1;

const limitsSchema = z
  .object({
    concurrency: concurrencySchema,
    iterations: z.number().int().positive().default(1),
    /** Plan-checker rounds one consult owns; exhausted rounds consult the architect. */
    planCheckRounds: z.number().int().positive().default(2),
    resumeAttempts: z.number().int().nonnegative().optional(),
    /** Amends one parked slug may receive per iteration; a further amend is refused. */
    parkAmends: z.number().int().nonnegative().optional(),
    /** Optional drain limits for one iteration. */
    turns: z.number().int().positive().optional(),
    wallMinutes: z.number().positive().optional(),
    /** Optional USD brake: crossing it drains the iteration. */
    iterationUsd: z.number().positive().optional(),
    turnMinutes: z.number().positive().optional(),
    iterationMinutes: z.number().positive().optional(),
    minTmpFreeBytes: z.number().int().nonnegative().optional(),
  })
  .strict()
  .default(() => ({
    concurrency: { overall: 2, perSubscription: {}, perModel: {} },
    iterations: 1,
    planCheckRounds: 2,
  }));

export const runConfigSchema = z
  .object({
    aliases: z.record(z.string(), aliasSchema).default({}),
    /** Harness id -> adapter binding; a harness id is a config name. */
    harnesses: z.record(z.string(), harnessEntrySchema).default({}),
    /**
     * Names a spawned harness or agent may inherit from the factory's own
     * environment, on top of the base toolchain set (PATH, HOME, bun/node
     * caches, temp dirs). Values set in a harness entry's `options.env` pass
     * regardless; nothing else inherited reaches a child.
     */
    envAllowlist: z.array(z.string().min(1)).default([]),
    /**
     * Harness model id -> OpenRouter model id, for ids matching cannot
     * resolve. Explicit wins over matching; ids across providers cannot be
     * derived, so an unmatchable live model is mapped here, not guessed.
     */
    priceIds: z.record(z.string(), z.string().min(1)).default({}),
    limits: limitsSchema,
    sessions: z
      .object({
        /** Empty resolves to <worktreeRoot>/.sessions, outside the repo. */
        dir: z.string().default(""),
        keepRuns: z.number().int().nonnegative().default(5),
        /** Provider cache window for omp sessions: 5 minutes, or 1 hour when long. */
        retention: z.enum(["short", "long"]).default("short"),
      })
      .strict()
      .default(() => ({ dir: "", keepRuns: 5, retention: "short" as const })),
    /**
     * Quota-pool cooldown. A quota stop's stated reset ("Resets in 130h") sets
     * the pool's cooldown, capped by `maxResetMinutes` when set; without a
     * stated reset the window is `resetMinutes` from the stop.
     */
    quota: z
      .object({
        resetMinutes: z.number().positive().default(DEFAULT_POOL_RESET_MINUTES),
        maxResetMinutes: z.number().positive().optional(),
      })
      .strict()
      .default(() => ({ resetMinutes: DEFAULT_POOL_RESET_MINUTES })),
    worktreeRoot: z.string().min(1).optional(),
    /**
     * Enable artifact LSP where the harness supports it. omp runs without
     * `--no-lsp` and installs the artifact config into each turn's cwd;
     * harnesses without an LSP surface ignore it and keep the validation
     * command.
     */
    lsp: z.boolean().default(false),
    scouts: z
      .object({
        model: z.string().min(1),
        effort: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    preset: z.string().min(1).optional(),
    /** Directional harness edges across which a session may be resumed. */
    portability: z
      .array(
        z.object({ from: z.string().min(1), to: z.string().min(1) }).strict(),
      )
      .default([]),
  })
  .strict();

export class ConfigError extends Error {
  readonly findings: Finding[];
  readonly report: string;

  constructor(findings: Finding[]) {
    const report = formatFindings(
      `configuration is invalid (${findings.length} violation(s)):`,
      findings,
    );
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

export function configFilePaths(
  repoRoot: string,
  opts: LoadConfigOptions = {},
): ConfigFiles {
  const root = path.resolve(repoRoot);
  return {
    repo: path.join(root, ".factory", "repo.yaml"),
    processDefault: path.join(packageRoot, "config", "process.yaml"),
    processOverride: path.join(root, ".factory", "process.yaml"),
    run: path.resolve(
      opts.runConfigPath ??
        globalThis.process.env.FACTORY_RUN_CONFIG ??
        path.join(root, ".factory", "run.yaml"),
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
    return {
      data: yaml.parse(fs.readFileSync(file, "utf8")) ?? undefined,
      findings: [],
    };
  } catch (err) {
    return {
      findings: [
        {
          file,
          key: "(yaml)",
          message: (err as Error).message.split("\n")[0] ?? "parse error",
        },
      ],
    };
  }
}

function parseLayer<T>(
  schema: z.ZodType<T>,
  data: unknown,
  fileFor: string | ((issue: z.core.$ZodIssue) => string),
  findings: Finding[],
): T | undefined {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;
  for (const issue of result.error.issues) {
    findings.push({
      file: typeof fileFor === "string" ? fileFor : fileFor(issue),
      key: issue.path.length > 0 ? issue.path.join(".") : "(root)",
      message: issue.message,
    });
  }
  return undefined;
}

interface MergeOptions {
  /** A `null` in the overlay removes the inherited key instead of replacing it. */
  nullDeletes?: boolean;
}

/** Arrays replace; plain objects merge key by key; null deletes when asked. */
function deepMerge(
  base: unknown,
  override: unknown,
  opts: MergeOptions = {},
): unknown {
  if (override === undefined) return base;
  if (Array.isArray(base) || Array.isArray(override)) return override;
  if (
    base &&
    override &&
    typeof base === "object" &&
    typeof override === "object"
  ) {
    const out: Record<string, unknown> = {
      ...(base as Record<string, unknown>),
    };
    for (const [key, value] of Object.entries(
      override as Record<string, unknown>,
    )) {
      if (value === null && opts.nullDeletes) {
        delete out[key];
        continue;
      }
      out[key] = deepMerge(out[key], value, opts);
    }
    return out;
  }
  return override;
}

/**
 * The file an issue came from. A path issue names its first segment; an
 * unrecognized root key (`path` empty, the key in `keys`) falls back to the
 * unknown keys, so a retired key in the repo override is blamed there rather
 * than on the package default it no longer belongs to.
 */
function processFileFor(
  data: unknown,
  issue: { path: PropertyKey[]; keys?: PropertyKey[] },
  files: ConfigFiles,
): string {
  const named = issue.path.length > 0 ? [issue.path[0]] : (issue.keys ?? []);
  if (
    data &&
    typeof data === "object" &&
    named.some((key) => typeof key === "string" && key in data)
  ) {
    return files.processOverride;
  }
  return files.processDefault;
}

/**
 * The process layer alone: package default deep-merged with the repo override.
 * Exported for callers that read process vocabulary without validating a
 * repo/run config they do not own.
 */
export function loadProcessConfig(repoRoot: string): ProcessConfig {
  const files = configFilePaths(repoRoot);
  const findings: Finding[] = [];
  const process = processLayer(files, findings);
  if (findings.length > 0) throw new ConfigError(findings);
  return process as ProcessConfig;
}

function processLayer(
  files: ConfigFiles,
  findings: Finding[],
): ProcessConfig | undefined {
  const baseLayer = readLayer(files.processDefault);
  const overrideLayer = readLayer(files.processOverride);
  findings.push(...baseLayer.findings, ...overrideLayer.findings);
  const processData = parseLayer(
    processConfigSchema,
    deepMerge(baseLayer.data ?? {}, overrideLayer.data),
    (issue) => processFileFor(overrideLayer.data, issue, files),
    findings,
  );
  if (!processData) return undefined;
  return processData as ProcessConfig;
}

/**
 * The run layer is one file or an `extends` chain: the file itself, its base,
 * the base's base. `null` in a child removes an inherited key, so a variant
 * states its differences instead of restating a whole alias, harness entry or
 * price row.
 */
interface RunSource {
  file: string;
  /** The file's own data, `extends` removed. */
  data: unknown;
}

/**
 * The run-layer files that make one config, outermost first. A missing file
 * contributes nothing (schema defaults stand in); an unreadable file, a
 * missing base or a cycle returns undefined with a finding naming the file.
 */
function resolveRunSources(
  file: string,
  findings: Finding[],
  chain: string[] = [],
): RunSource[] | undefined {
  const visited = [...chain, file];
  const layer = readLayer(file);
  findings.push(...layer.findings);
  if (layer.data === undefined) return [];
  if (
    layer.data === null ||
    typeof layer.data !== "object" ||
    Array.isArray(layer.data)
  ) {
    findings.push({
      file,
      key: "(root)",
      message: "expected a run config mapping",
    });
    return undefined;
  }
  const { extends: parent, ...own } = layer.data as Record<string, unknown>;
  const sources: RunSource[] = [{ file, data: own }];
  if (parent === undefined) return sources;
  if (typeof parent !== "string" || parent.trim() === "") {
    findings.push({
      file,
      key: "extends",
      message: "expected a non-empty run-config path",
    });
    return undefined;
  }
  const parentFile = path.resolve(path.dirname(file), expandHome(parent));
  if (visited.includes(parentFile)) {
    findings.push({
      file,
      key: "extends",
      message: `extends cycle: ${[...visited, parentFile].join(" -> ")}`,
    });
    return undefined;
  }
  if (!fs.existsSync(parentFile)) {
    findings.push({
      file,
      key: "extends",
      message: `base run config not found: ${parentFile}`,
    });
    return undefined;
  }
  const base = resolveRunSources(parentFile, findings, visited);
  if (!base) return undefined;
  return [...sources, ...base];
}

/** Root base first, overlay last; later files win and `null` removes a key. */
function mergeRunSources(sources: RunSource[]): unknown {
  let merged: Record<string, unknown> = {};
  for (const source of [...sources].reverse()) {
    merged = deepMerge(merged, source.data, {
      nullDeletes: true,
    }) as Record<string, unknown>;
  }
  return merged;
}

/**
 * The file an issue belongs to: the outermost file that declares the issue's
 * first path segment, else the root base. A typo in an overlay is blamed on
 * the overlay, not on the base it did not touch.
 */
function runFileFor(
  sources: RunSource[],
  issue: { path: PropertyKey[]; keys?: PropertyKey[] },
  fallback: string,
): string {
  const named = issue.path.length > 0 ? [issue.path[0]] : (issue.keys ?? []);
  for (const source of sources) {
    // Every source passed resolveRunSources' mapping check.
    const data = source.data as Record<string, unknown>;
    if (named.some((key) => typeof key === "string" && key in data)) {
      return source.file;
    }
  }
  return sources[sources.length - 1]?.file ?? fallback;
}

/** One run layer: its `extends` chain resolved, then validated as a whole. */
function runLayer(file: string, findings: Finding[]): RunConfig | undefined {
  const sources = resolveRunSources(file, findings);
  if (!sources) return undefined;
  return parseLayer(
    runConfigSchema,
    mergeRunSources(sources),
    (issue) => runFileFor(sources, issue, file),
    findings,
  );
}

/**
 * Resolves and validates one run config, base chain included. The operator
 * entry point: `--validate` and the schema gate read a file the same way the
 * launch does.
 */
export function loadRunConfig(file: string): RunConfig {
  const resolved = path.resolve(file);
  const findings: Finding[] = [];
  if (!fs.existsSync(resolved)) {
    findings.push({ file: resolved, key: "(file)", message: "no such file" });
    throw new ConfigError(findings);
  }
  const run = runLayer(resolved, findings);
  if (!run || findings.length > 0) throw new ConfigError(findings);
  return run;
}

/**
 * Loads the three layers into one report. Missing files take schema defaults;
 * a missing run config leaves aliases empty so pre-flight names the aliases
 * the process config requires instead of inventing a harness.
 */
export function loadConfigs(
  repoRoot: string,
  opts: LoadConfigOptions = {},
): ConfigBundle {
  const files = configFilePaths(repoRoot, opts);
  const findings: Finding[] = [];
  const repoLayer = readLayer(files.repo);
  findings.push(...repoLayer.findings);

  const repo = parseLayer(
    repoConfigSchema,
    repoLayer.data,
    files.repo,
    findings,
  );
  const processData = processLayer(files, findings);
  const run = runLayer(files.run, findings);
  if (processData && run?.preset && processData.presets) {
    if (
      Object.keys(processData.presets).length > 0 &&
      !(run.preset in processData.presets)
    ) {
      findings.push({
        file: files.run,
        key: "preset",
        message: `preset "${run.preset}" is not defined in process config`,
      });
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
  const root = path.resolve(repoRoot);
  const baseRoot = configs.run.worktreeRoot
    ? fromRoot(root, configs.run.worktreeRoot)
    : path.resolve(root, "..", ".factory-worktrees", path.basename(root));
  const worktreeRoot = path.join(baseRoot, repositoryId(root));
  return {
    repoRoot: root,
    goalDir: fromRoot(
      root,
      path.join(expandHome(configs.repo.artifactRoot), goal),
    ),
    goalCheckout:
      legacyCheckout(baseRoot, goal, root) ?? path.join(worktreeRoot, goal),
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
    ...(runLimits.minTmpFreeBytes !== undefined
      ? { minTmpFreeBytes: runLimits.minTmpFreeBytes }
      : {}),
  };
}

export { packageRoot };
