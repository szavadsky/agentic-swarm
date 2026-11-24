/** The agent turn's public spec, result and internal turn state. */

import type { z } from "zod";
import type {
  LiveAgents,
  ModelRef,
  ServedUsage,
  SessionRef,
  Stop,
  TurnAttempt,
  TurnResult,
  Usage,
} from "../../harness/types.js";
import type { TurnTarget } from "../flow-context.js";
import type { OutcomeExpectation } from "../outcome.js";
import type { pricedServed } from "../pricing.js";
import type {
  KernelRuntime,
  Outcome,
  RecordEnd,
  RecordStart,
  RepairAsk,
  StepRecord,
  TurnRecord,
} from "../types.js";
import type { measurePack } from "./chain.js";

export interface AgentTurnSpec {
  target: TurnTarget;
  cwd: string;
  /** iteration/slug/step/round/taskHash/base; actor, alias, model come from the target. */
  meta: Omit<RecordStart, "actor" | "alias" | "model">;
  vars: Record<string, string>;
  expectation: OutcomeExpectation;
  /**
   * The step's contract beyond the outcome schema: findings that send the
   * delivered outcome back for repair, like a schema failure. A step whose
   * contract reads artefacts the turn wrote returns them asynchronously.
   */
  validate?: (outcome: Outcome) => string[] | Promise<string[]>;
  /**
   * Implement turns only: renders the fresh-session ask that rescues a turn
   * whose branch holds work but delivered no valid outcome. Returns `null`
   * when the branch carries nothing against its base. The kernel writes the
   * record's outcome path into `vars` before the ask is rendered.
   */
  rescue?: (findings: readonly string[]) => Promise<string | null>;
  /**
   * The task type's output schema; defaults to the kernel outcome schema for
   * kernel turns and legacy tasks.
   */
  outcomeSchema?: z.ZodType<Outcome>;
  /** Review steps only: the last call refuses a `changes` verdict. */
  lastCall?: boolean;
  session?: SessionRef;
  timeouts?: { idleMs: number; wallMs: number };
  /** Outcome reminders after the first attempt; defaults to process `reminders`. */
  repairTurns?: number;
  /**
   * Per-turn adapter options that override the tier's. The omp hierarchy uses
   * it for the transient subarchitect agent definitions; every other adapter
   * ignores keys it does not know.
   */
  opaque?: unknown;
  /** Steerable harnesses only: the live children handle is passed through. */
  onLive?: (agents: LiveAgents) => void;
  /**
   * Runs after the turn and before the end record commits. `settle` sees the
   * accepted outcome and the live session, so it can compact and return the
   * compacted ref that must be stored (mechanical commits ignore the extras).
   */
  settle?: (
    record: StepRecord,
    outcome: Outcome | undefined,
    session: SessionRef | undefined,
  ) => Promise<RecordEnd>;
  /**
   * Sleeps out the detector's one settle re-read of the outcome path. Tests
   * inject a recorder instead of waiting.
   */
  sleep?: (ms: number) => Promise<void>;
}

export interface AgentTurnResult {
  record: StepRecord;
  /** Absent when an infra/refusal/cancelled stop ended the turn before delivery. */
  outcome?: Outcome;
  text: string;
}

export type Tier = TurnTarget["tiers"][number];

export interface ChainState {
  attempts: TurnAttempt[];
  served: ServedUsage[];
  servedOpen: boolean;
  usage: Usage | undefined;
}

export interface ChainResult {
  result: TurnResult;
  endIndex: number;
  attempts: TurnAttempt[];
  usage: Usage;
  served?: ServedUsage[];
}

export interface AgentTurnState {
  runtime: KernelRuntime;
  spec: AgentTurnSpec;
  started: TurnRecord;
  outcomePath: string;
  prompt: string;
  promptBytes: number;
  pack: Awaited<ReturnType<typeof measurePack>>;
  timeouts: { idleMs: number; wallMs: number };
  planWho: string;
  planBefore: string | null;
  deliverable: string;
  repairPrompt: string;
  maxRepairs: number;
  repairs: number;
  outcomeSettled: boolean;
  /** The last settled read returned no outcome and no halted stop ended it. */
  outcomeAbsent: boolean;
  repairFindings: string[];
  /** Each repair ask sent, in order. */
  asks: RepairAsk[];
  lastResult: TurnResult;
  attempts: TurnAttempt[];
  stop: Stop;
  usage: Usage;
  served: ServedUsage[];
  servedOpen: boolean;
  session: SessionRef | undefined;
  text: string;
  tierIndex: number;
  outcome: Outcome | null;
  findings: string[];
}

export interface TurnPreparation {
  prompt: string;
  promptBytes: number;
  pack: Awaited<ReturnType<typeof measurePack>>;
  timeouts: { idleMs: number; wallMs: number };
  planWho: string;
  planBefore: string | null;
}

export interface TurnPricing {
  actualModel: ModelRef;
  cachedPrefix: boolean | undefined;
  pricedAttempts: TurnAttempt[];
  pricedSplit: ReturnType<typeof pricedServed> | undefined;
  pricedTop: Usage;
  pricedCompact: Usage | undefined;
}
