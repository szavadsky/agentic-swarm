/** The CLI's goal, steer and validate commands; the implementation is split by concern under `commands/`. */

export {
  initGoal,
  readSteerSource,
  statusGoal,
  steerGoal,
} from "./commands/goal.js";
export { validateFile } from "./commands/validate.js";
