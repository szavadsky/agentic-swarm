/**
 * The acpx run-config shapes, inferred from the zod schemas the config module
 * declares, so the schema stays the one source of truth.
 */

import type { z } from "zod";
import type { acpxConfigSchema, acpxUsageFieldsSchema } from "./config.js";

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
