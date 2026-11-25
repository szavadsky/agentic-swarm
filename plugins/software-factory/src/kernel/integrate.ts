/** The integration's public surface; the merge and kept-land paths are split under `integrate/`. */

export type {
  GoalHeadJudgement,
  MergeResult,
} from "./integrate/types.js";
export { judgeGoalHead, mergeTask } from "./integrate/merge-checks.js";
export { runKeptLand } from "./integrate/kept-land.js";
