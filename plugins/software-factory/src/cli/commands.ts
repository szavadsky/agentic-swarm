/** The CLI's goal, records, steer and validate commands; the implementation is split by concern under `commands/`. */

export {
  initGoal,
  readSteerSource,
  statusGoal,
  steerGoal,
} from "./commands/goal.js";
export { queryRecords } from "./commands/records.js";
export { validateFile } from "./commands/validate.js";
