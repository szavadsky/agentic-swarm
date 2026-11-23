/** The preflight's public surface; its checks are split under `preflight/`. */

export type { ModelCatalog } from "./preflight-aliases.js";

export type { PreflightInput } from "./preflight/types.js";
export {
  DEFAULT_MIN_TMP_FREE_BYTES,
  PreflightError,
  escalationFindings,
  fallbackAliasFindings,
  requiredAliases,
  tmpHeadroom,
} from "./preflight/checks.js";
export { acpxOptionFindings } from "./preflight/config.js";
export { preflight } from "./preflight/run.js";
