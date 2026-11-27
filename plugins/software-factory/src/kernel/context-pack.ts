/** The context pack's public surface; its appenders and renderers are split under `context-pack/`. */

export type {
  ConcernAudience,
  ContextPackInput,
  EpicSummaryRef,
  IntentChange,
  PlanCheckPack,
  PlanReviewPack,
  SpikeFinding,
} from "./context-pack/types.js";
export { goalDebtRecords, recordsForAudience } from "./context-pack/debt.js";
export {
  formatOpenConcern,
  formatPlanFinding,
  numberedPlanFindings,
} from "./context-pack/plan-findings.js";
export {
  contextDataRelPath,
  contextPackRelPath,
  epicContextPackRelPath,
  epicSummaryRelPath,
  PACK_BRIEF_SUMMARY_MAX,
  renderContextData,
  renderContextPack,
  summaryRelPath,
} from "./context-pack/render.js";
export { readyAging } from "./context-pack/aging.js";
export {
  forwardedConcerns,
  openConcernIds,
  openConcerns,
  shallowCodeMap,
} from "./context-pack/misc.js";
