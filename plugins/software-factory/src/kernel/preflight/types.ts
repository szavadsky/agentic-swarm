/** The preflight input and result. */

import type { z } from "zod";
import type { Harness } from "../../harness/types.js";
import type { BaselineResult } from "../baseline.js";
import type { Finding } from "../findings.js";
import type { ModelCatalog } from "../preflight-aliases.js";
import type { pinGateSchema } from "./pin.js";
import type {
  ArtifactStore,
  ConfigBundle,
  ConfigFiles,
  GoalPaths,
  GoalRoots,
} from "../types.js";

/** One pin's gate result, read back from its `gate.yaml`. */
export type PinGate = z.infer<typeof pinGateSchema>;

export interface PreflightInput {
  configs: ConfigBundle;
  paths: GoalPaths;
  store: ArtifactStore;
  harnesses: ReadonlyMap<string, Harness>;
  /** Resolved harness executables; omitted skips the binary check. */
  binaries?: Record<string, string | undefined>;
  catalog?: ModelCatalog;
  /** Tests may skip the scratch-worktree gate run. */
  baseGates?: boolean;
}

export interface PreflightResult {
  base?: BaselineResult;
}

/**
 * What the checks that read no model may look at. An omitted input skips the
 * checks that need it: `validate` has no goal store and judges a scratch file
 * without a repository, so it passes neither.
 */
export interface NonModelInput {
  configs: ConfigBundle;
  files: ConfigFiles;
  /**
   * Harnesses a launch must find an executable for, mapped to the resolved
   * executable. The map's keys are the check's harness list: both callers name
   * only the harnesses a launch registers (omp plus declared acpx adapters).
   */
  binaries?: Record<string, string | undefined>;
  /**
   * The harness ids the caller knows a launch registers. `validate` names omp
   * plus the acpx adapters its run config declares; omitted skips the
   * registration and portability checks.
   */
  harnesses?: ReadonlySet<string>;
  /** The repository roots; omitted skips the root checks. */
  roots?: GoalRoots;
  /** The goal's artifact store; omitted skips the task-file checks. */
  store?: ArtifactStore;
}

export interface NonModelResult {
  findings: Finding[];
  /** Harnesses whose executable could not be found. */
  unavailable: Set<string>;
}
