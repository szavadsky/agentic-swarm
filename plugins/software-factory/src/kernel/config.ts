/** The config loader's public surface; the schemas, loaders and path resolution are split under `config/`. */

export { packageRoot, repoConfigSchema } from "./config/repo-schema.js";
export { architectureSchema } from "./config/flow-schema.js";
export { pmSchema } from "./config/pm-schema.js";
export {
  DEFAULT_PARK_AMENDS,
  processConfigSchema,
  processOverrideSchema,
  runConfigSchema,
} from "./config/run-schema.js";
export { ConfigError, configFilePaths } from "./config/load.js";

export { loadConfigs, loadProcessConfig, loadRunConfig } from "./config/run.js";
export { repositoryId, resolveGoalPaths, toLimits } from "./config/paths.js";
