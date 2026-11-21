/** Process, fallback, alias, harness and run schemas. */

import { z } from "zod";
import { acpxConfigSchema } from "../../harness/acpx/config.js";
import { DEFAULT_POOL_RESET_MINUTES } from "../quota-pools.js";
import { DEFAULT_TIMEOUTS } from "../types.js";
import {
  architectureOverrideSchema,
  architectureSchema,
  boundaryOverrideSchema,
  boundarySchema,
  flowSchema,
  hierarchyOverrideSchema,
  hierarchySchema,
  taskTypeSchema,
} from "./flow-schema.js";

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
     * Adapter-specific keys, opaque to the kernel except pre-flight's shape
     * check of the acpx `args`/`env`; omp merges the rest into its launch
     * overlay.
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

export const limitsSchema = z
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
