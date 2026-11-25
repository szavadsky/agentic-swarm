/** The alias checks' public surface; model and tier checks are split under `preflight-aliases/`. */

export type { AliasContext, ModelCatalog } from "./preflight-aliases/types.js";
export {
  checkAlias,
  checkScouts,
} from "./preflight-aliases/checks.js";
