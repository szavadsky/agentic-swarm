/** The alias checks' public surface; model, tier and portability checks are split under `preflight-aliases/`. */

export type { AliasContext, ModelCatalog } from "./preflight-aliases/types.js";
export {
  checkAlias,
  checkPortability,
  checkScouts,
} from "./preflight-aliases/checks.js";
