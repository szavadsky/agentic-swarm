/** Shapes the config loader takes from its callers. */

export interface LoadConfigOptions {
  /** Overrides run-config launch limit (--iterations). */
  iterations?: number;
  /** Explicit run-config path; defaults to <repo>/.factory/run.yaml. */
  runConfigPath?: string;
}
