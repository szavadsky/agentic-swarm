import { z } from "zod";

/** Effort as a live acpx session config option plus optional model-id suffix split. */
export const acpxEffortSchema = z
  .object({
    configId: z.string().min(1),
    /** Base model ids whose `-<level>` suffix splits to effort. */
    modelBases: z.record(z.string(), z.array(z.string().min(1))).optional(),
  })
  .strict();

/** Token field aliases on the prompt result usage object. */
export const acpxUsageFieldsSchema = z
  .object({
    input: z.array(z.string().min(1)).optional(),
    cacheRead: z.array(z.string().min(1)).optional(),
    cacheWrite: z.array(z.string().min(1)).optional(),
    output: z.array(z.string().min(1)).optional(),
    thought: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const acpxUsageSchema = z
  .object({
    cache: z.boolean().optional(),
    fields: acpxUsageFieldsSchema.optional(),
    /**
     * Adapter slash command whose reply carries the session's cumulative token
     * totals. Agents whose prompt result has no usage need `/session` here
     * (acpx-verify.md §1).
     */
    command: z
      .string()
      .min(2)
      .regex(
        /^\//,
        "usage command must be an adapter slash command (leading /)",
      )
      .optional(),
  })
  .strict();

/**
 * One acpx harness binding from the run config, no code. `agent` is the
 * positional subcommand, or the raw `--agent` command when `raw` is set;
 * process `args`/`env` ride the harness entry's opaque `options`.
 * Justification: the owner's no-code rule.
 */
export const acpxConfigSchema = z
  .object({
    agent: z.string().min(1),
    raw: z.boolean().optional(),
    /**
     * The agent accepts `/compact` as an adapter slash command. Declared per
     * harness because ACP has no compaction method; the verified set and the
     * forwarding refusal are recorded in config/acpx-verify.md.
     */
    compact: z.boolean().optional(),
    effort: acpxEffortSchema.optional(),
    usage: acpxUsageSchema.optional(),
  })
  .strict();

export type AcpxUsageFields = z.infer<typeof acpxUsageFieldsSchema>;
export type AcpxConfig = z.infer<typeof acpxConfigSchema>;

/**
 * Effective config after the harness entry's opaque `options` are merged in:
 * `args` run before the agent selection, `env` is added to the acpx children.
 */
export type AcpxRunConfig = AcpxConfig & {
  args?: string[];
  env?: Record<string, string>;
};

/** Harness configuration carried through `TurnRequest.opaque`. */
export type AcpxTurnOpaque = AcpxConfig;
