/** The preflight input and result. */

import type { Harness } from "../../harness/types.js";
import type { BaselineResult } from "../baseline.js";
import type { ModelCatalog } from "../preflight-aliases.js";
import type { ArtifactStore, ConfigBundle, GoalPaths } from "../types.js";

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
