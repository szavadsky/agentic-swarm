/** The preflight's public surface; its checks are split under `preflight/`. */

export type { ModelCatalog } from "./preflight-aliases.js";

export type { PreflightInput } from "./preflight/types.js";
// The pin gate refuses a launch, not a config; it lives with the checks.
export { pinBuildOf, pinRefusal } from "./preflight/pin.js";
export {
  DEFAULT_MIN_TMP_FREE_BYTES,
  PreflightError,
  fallbackAliasFindings,
  tmpHeadroom,
} from "./preflight/checks.js";
export { acpxOptionFindings, usedHarnesses } from "./preflight/config.js";
export { nonModelFindings } from "./preflight/non-model.js";
export { preflight } from "./preflight/run.js";
