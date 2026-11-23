/**
 * The flow-context facade: turn targeting, step resolution, front class,
 * record facts, sessions and prompt variables for one turn. The modules under
 * `flow-context-*.ts` own the bodies; importers keep using this path.
 */

export type { FrontClass } from "./flow-context-front.js";
export {
  classSchema,
  escalateFrontClassToBigger,
  FrontClassError,
  frontTarget,
  readFrontClass,
} from "./flow-context-front.js";
export {
  firstBase,
  revisionBase,
} from "./flow-context-history.js";
export {
  compactSession,
  followUpSession,
  priorStepCommit,
  resumeNote,
  trivialResumeSession,
} from "./flow-context-sessions.js";
export {
  alternatePosition,
  checksDue,
  findStep,
  flowOf,
  isFixTurn,
  isRelaunchStep,
  isTrivialImplementTurn,
  stepTarget,
} from "./flow-context-step.js";
export type { TurnTarget } from "./flow-context-targets.js";
export {
  architectureTarget,
  boundaryTarget,
  noLiveTierCause,
  resolveTurn,
  subarchitectTarget,
  tierPoolKey,
} from "./flow-context-targets.js";
export { promptVars } from "./flow-context-vars.js";
