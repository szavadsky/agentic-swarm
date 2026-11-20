/**
 * The launch's public shape: the options a caller passes, the factory that
 * builds harnesses for it, and the result it stops with. The launch modules
 * share these types; `launch.ts` re-exports them as the public face.
 */
import type { Harness, ModelRef } from "../harness/types.js";
import type { PriceSource } from "./openrouter.js";
import type { ModelCatalog } from "./preflight.js";
import type { DrainController, DrainSignal } from "./signals.js";
import type { HarnessConfig, State } from "./types.js";

/** A launch refused before its first turn: configuration, intent or run lock. */
export class LaunchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LaunchError";
  }
}

export interface HarnessFactoryContext {
  /** Per-launch store: `<sessions.dir>/<goal>/<launch-id>/`. */
  sessionDir: string;
  scouts?: ModelRef;
  /** Run-config harness entries; each acpx entry binds one harness id. */
  harnesses?: Record<string, HarnessConfig>;
  /** Provider cache window from `sessions.retention`; omp overlay and session stamp share it. */
  retention?: "short" | "long";
  /** Run-config `envAllowlist`: names a harness child inherits on top of the base set. */
  envAllowlist?: readonly string[];
  /** Artifact LSP enabled by the run config: the canonical config each omp turn installs. */
  lsp?: { config: string };
}

export type HarnessFactory = (
  context: HarnessFactoryContext,
) => Record<string, Harness> | Promise<Record<string, Harness>>;

export interface RunGoalOptions {
  repo: string;
  goal: string;
  iterations?: number;
  runConfigPath?: string;
  /** Inject ready harnesses (fake harness in tests); skips the factory. */
  harnesses?: Record<string, Harness>;
  harnessFactory?: HarnessFactory;
  modelCatalog?: ModelCatalog;
  binaries?: Record<string, string | undefined>;
  signals?: DrainController;
  baseGates?: boolean;
  /** Price cache and fetcher; undefined means the shared cache plus network. */
  priceSource?: PriceSource;
}

export type LaunchStop =
  | "done"
  | "blocked"
  | "iteration-limit"
  | "interrupted"
  | "infra";

export interface LaunchResult {
  goal: string;
  iterations: number;
  state: State;
  lastSummary?: string;
  stop: LaunchStop;
  /** Why the launch stopped: the pre-iteration failure, or the infrastructure stop that ended it. */
  cause?: string;
  interruptedBy?: DrainSignal;
  recoveredRecords: number;
}
