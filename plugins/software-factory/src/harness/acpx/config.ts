import { z } from "zod";

/** Effort as an acpx session config option plus optional model-id suffix split. */
export const acpxEffortSchema = z
  .object({
    configId: z.string().min(1),
    levels: z.array(z.string().min(1)).min(1),
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
  })
  .strict();

/**
 * One acpx harness from the run config: naming plus opaque run config, no code.
 * `agent` is the positional subcommand, or the raw `--agent` command when `raw`
 * is set. Justification: the owner's no-code rule.
 */
export const acpxConfigSchema = z
  .object({
    agent: z.string().min(1),
    raw: z.boolean().optional(),
    /**
     * The agent accepts `/compact` as an adapter slash command. Declared per
     * harness because ACP has no compaction method and only pi, codex and
     * opencode are verified to handle it (acpx probe §5).
     */
    compact: z.boolean().optional(),
    /** Extra global args, before the agent selection. */
    args: z.array(z.string()).optional(),
    /** Extra env for the acpx child processes. */
    env: z.record(z.string(), z.string()).optional(),
    effort: acpxEffortSchema.optional(),
    usage: acpxUsageSchema.optional(),
  })
  .strict();

export type AcpxUsageFields = z.infer<typeof acpxUsageFieldsSchema>;
export type AcpxConfig = z.infer<typeof acpxConfigSchema>;

/** Harness configuration carried through `TurnRequest.opaque`. */
export type AcpxTurnOpaque = AcpxConfig;
