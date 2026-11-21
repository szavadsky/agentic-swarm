/** The omp turn's public launch and finish shapes. */

import type {
  AdapterTurnResult,
  ModelRef,
  ServedUsage,
  TurnAttempt,
  TurnRequest,
  Usage,
} from "../../types.js";
import type { OmpRpc } from "../rpc.js";
import type { OmpRuntime } from "../runtime.js";
import type { OmpStats } from "../usage.js";

export interface TurnLaunch {
  rpc?: OmpRpc;
  error?: unknown;
  attempts: TurnAttempt[];
  resumeDir: string;
}

export interface PromptExchange {
  promptResult: any;
  promptFailed: Error | undefined;
}

/** Everything the turn learned once the prompt exchange is over. */
export interface OmpTurnFinish {
  runtime: OmpRuntime;
  req: TurnRequest;
  model: ModelRef;
  rpc: OmpRpc;
  baseline: OmpStats | undefined;
  startedAtMs: number;
  promptResult: any;
  promptFailed: Error | undefined;
  abortReason: "idle" | "wall" | undefined;
  aborted: boolean;
  lastModelEventAtMs: number | undefined;
  retainedFrames: any[];
  resume: string | undefined;
  resumeDir: string;
  attempts: TurnAttempt[];
}

export interface EndedUsage {
  served: ServedUsage[] | undefined;
  usage: Usage;
}

/** The launched RPC state, or the failure that ends the turn. */
export interface LaunchState {
  live: OmpRpc | undefined;
  baseline: OmpStats | undefined;
  resumeDir: string;
  attempts: TurnAttempt[];
  failure: AdapterTurnResult | undefined;
}
