/**
 * The derive-task facade: the default flow catalog and `reduceTask`. The
 * record rules live in `derive-task-{facts,state,gates,turn,verdict,reduce}.ts`.
 */

export { DEFAULT_FLOWS } from "./derive-task-facts.js";
export { reduceTask } from "./derive-task-reduce.js";
