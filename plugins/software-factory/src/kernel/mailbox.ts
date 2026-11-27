/** The mailbox's public surface; steers, holds and routes are split under `mailbox/`. */

export type { Hold, Steer } from "./mailbox/types.js";
export {
  holdFileSchema,
  markProcessed,
  postSteer,
  scanInbox,
} from "./mailbox/steer.js";
export {
  answerFromStoredRoute,
  drainHeldNotes,
  expireHold,
  holdsDir,
  quarantineDir,
  readHolds,
  sweepHolds,
  writeOutbox,
} from "./mailbox/holds.js";
export {
  collectSteerRoutes,
  formatPmAnswers,
  formatSteerRoute,
  formatSteerTurn,
  formatSteers,
  isArchitectRoute,
  planCheckProvenance,
  selfHeldSlugs,
  stallProvenance,
  steerProvenance,
  steerResponses,
} from "./mailbox/routes.js";
