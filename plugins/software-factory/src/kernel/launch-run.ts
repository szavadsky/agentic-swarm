/**
 * The launch's two mutable records: the goal-wide `GoalRun` (counters, stop
 * state) and one iteration's `IterationRun` (resume decision, front/boundary/
 * dispatch results). The shape lives in `launch-run-types.ts`; the phase
 * modules fill it and the goal loop owns it.
 */

export type { GoalRun, IterationRun } from "./launch-run-types.js";
