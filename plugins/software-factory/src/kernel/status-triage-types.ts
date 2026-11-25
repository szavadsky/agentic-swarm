/** The dashboard's triage view shapes. */

import type { LaunchStop } from "./launch-types.js";
import type { DrainSignal } from "./signals.js";
import type { Concern, ConcernId, SteerRoute } from "./types.js";

/** One concern a record delivered, with its source record. */
export interface StatusConcern {
  id?: ConcernId;
  slug?: string;
  step: string;
  round: number;
  kind: Concern["kind"];
  calibration: Concern["calibration"];
  text: string;
  evidence?: string;
  /** `records/<dir>` of the record that raised it. */
  record: string;
}

/**
 * One open concern the default view lists: no FYI notes, no debt the kernel
 * closed or the plan owns, and no concern a checker or merged follow-up
 * answered. Debt entries keep the id a `debtClosed` names.
 */
export interface StatusOpenConcern {
  id?: ConcernId;
  kind: Concern["kind"];
  calibration: Concern["calibration"];
  text: string;
  evidence?: string;
  /** `slug step rN` of the record that raised it. */
  source: string;
  /** `records/<dir>` of the record that raised it. */
  record?: string;
}

/** Where one steer stands between the mailbox and its answer. */
export type SteerState = "waiting" | "routed" | "answered" | "processed";

/** One steer as the dashboard panel lists it. */
export interface StatusSteer {
  id: string;
  state: SteerState;
  /** The PM's route, once one is recorded. */
  route?: SteerRoute;
  /** The latest answer this steer received. */
  answer?: string;
  /** `records/<dir>` of the record that routed or answered it. */
  record?: string;
}

/** How the last launch stopped, so the dashboard's badge follows the stop. */
export interface StatusStop {
  reason: LaunchStop;
  /** The formatted cause the launch printed, when it had one. */
  cause?: string;
  /** The signal that interrupted the launch, when one did. */
  interruptedBy?: DrainSignal;
}

/** The mailbox queues a status snapshot reads, as file names. */
export interface StatusMailbox {
  inbox: readonly string[];
  processed: readonly string[];
}
