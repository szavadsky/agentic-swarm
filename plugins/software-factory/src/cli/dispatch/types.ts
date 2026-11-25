/** The CLI's public argument and dependency shapes. */

import type { Harness } from "../../harness/types.js";
import type { HarnessFactory } from "../../kernel/launch.js";
import type { ModelCatalog } from "../../kernel/preflight.js";
import type { PriceSource } from "../../kernel/openrouter.js";
import type { DrainController } from "../../kernel/signals.js";

export interface ParsedArgs {
  command?: string;
  repo: string;
  goal?: string;
  iterations?: number;
  runConfig?: string;
  pinGateOverride?: string;
  intent?: string;
  file?: string;
  step?: string;
  /** Output directory for `factory schemas`. */
  out?: string;
  /** `factory status --json`: print the machine-readable snapshot. */
  json?: boolean;
  /** `factory prompts --dry-run`: render every prompt for the loaded config. */
  dryRun?: boolean;
  help: boolean;
  version: boolean;
}

export interface CliDeps {
  /** Ready harnesses (fake harness in tests); disables the real CLI checks. */
  harnesses?: Record<string, Harness>;
  harnessFactory?: HarnessFactory;
  modelCatalog?: ModelCatalog;
  binaries?: Record<string, string | undefined>;
  signals?: DrainController;
  /** Price cache and fetcher; undefined means the shared cache plus network. */
  priceSource?: PriceSource;
}

export interface ValueFlag {
  name: string;
  apply: (result: ParsedArgs, value: string) => void;
}

export type CommandHandler = (
  parsed: ParsedArgs,
  deps: CliDeps,
) => number | Promise<number>;
