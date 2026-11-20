/**
 * The launch facade: the public option/result types, the goal entry point and
 * the iteration status helper. Orchestration lives in `launch-goal.ts`, the
 * resume gate in `launch-resume.ts` and iteration facts in `launch-facts.ts`.
 */

export { statusForIteration } from "./launch-facts.js";
export { runGoal } from "./launch-goal.js";
export type {
  HarnessFactory,
  HarnessFactoryContext,
  LaunchResult,
} from "./launch-types.js";
