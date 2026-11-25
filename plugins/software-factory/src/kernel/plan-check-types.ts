/** The plan checker's turn and round. */

import { type PlanCheckPmResult } from "./pm.js";
import {
  type Outcome,
  type PlanCheckEvidence,
  type PlanCheckFollowUp,
  type PlanCheckVerdict,
} from "./types.js";

export interface PlanCheckTurn {
  verdict: PlanCheckVerdict;
  evidence: PlanCheckEvidence[];
  followUps: PlanCheckFollowUp[];
  outcome?: Outcome;
  /** An infrastructure stop: the iteration falls through to the boundary. */
  infra?: { cause: string };
}

export interface PlanCheckRound {
  turn: PlanCheckTurn;
  /** Follow-up slugs the PM continued; non-empty means dispatch has work. */
  continued: string[];
  /** `checked` when no follow-up PM turn ran; otherwise that ladder's exit. */
  status: PlanCheckPmResult["status"] | "checked";
  /** Baseline findings the PM could not fix; `architect` only. */
  findings: string[];
}
