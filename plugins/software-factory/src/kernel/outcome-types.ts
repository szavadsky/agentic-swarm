/** The outcome's expectation, delivery source and validation options. */

import type { KernelStep, Outcome, StepRecord } from "./types.js";

export type OutcomeExpectation = "any" | "review" | "qa" | "architect";

export interface OutcomeSource {
  outcome: Outcome;
  /** Where it came from; `file` is the prompt-named path. */
  source: "file" | "fenced";
}

/**
 * Kernel turn steps that run outside any configured flow, mapped to the outcome
 * expectation they enforce.
 */
export const KERNEL_TURN_STEPS = {
  architect: "architect",
  digest: "any",
  front: "any",
  intent: "any",
  packprep: "any",
  plancheck: "any",
  planreturn: "any",
  planreview: "any",
  pm: "any",
  steward: "any",
  subarchitect: "architect",
} as const satisfies Record<KernelStep, OutcomeExpectation>;

export type KernelTurnStep = keyof typeof KERNEL_TURN_STEPS;

export interface ExpectationOptions {
  /** A review's or QA's last call: a change request is not accepted then. */
  lastCall?: boolean;
  /**
   * Records read before this turn, so a `debtClosed` id can be checked against
   * the ids ingest assigned. Absent when no record tree is reachable (a
   * standalone outcome file): the id check cannot run then.
   */
  records?: readonly StepRecord[];
  /**
   * The record this outcome belongs to, when `records` contains it: its
   * concerns are ingested only when the turn seals it, so its own ids are not
   * closable from this outcome.
   */
  excludeRecordId?: string;
}
