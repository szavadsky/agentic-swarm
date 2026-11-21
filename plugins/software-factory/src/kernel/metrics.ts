/** The metrics aggregation's public surface; recording and summing are split under `metrics/`. */

export type {
  GoalMetrics,
  GroupMetrics,
  IncidentCounts,
  IterationMetrics,
  MetricsTotals,
  PlanReviewMarkCounts,
} from "./metrics/types.js";
export {
  DEFAULT_ROLE_BY_STEP,
  costText,
  deriveLaunchKind,
  launchKindOf,
  rolesByStep,
} from "./metrics/record.js";
export { iterationMetrics } from "./metrics/iteration.js";
export { totalsOf } from "./metrics/accumulate.js";
export { writeMetrics } from "./metrics/write.js";
