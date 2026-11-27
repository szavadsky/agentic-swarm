/** Public result shapes of the goal, steer and validation commands. */

import type { PinGate } from "../../kernel/preflight/types.js";
import type { PriceSource } from "../../kernel/openrouter.js";
import type { ProcessConfig, State } from "../../kernel/types.js";

export interface InitResult {
  goalDir: string;
  repoConfig: string;
  repoConfigCreated: boolean;
  intentPath: string;
  intentCreated: boolean;
}

export interface StatusResult {
  goal: string;
  state: State;
  lastSummary?: string;
  goalDir: string;
  /** The status.json text `factory status --json` prints; set when asked. */
  statusJson?: string;
}

/** `factory records` filters; absent fields match every record. */
export interface RecordQuery {
  step?: string;
  role?: string;
  /** A typed cause kind; the query refuses a value the schema does not know. */
  cause?: string;
  iteration?: number;
}

export interface StatusOptions {
  json?: boolean;
  /** Price cache and fetcher for a snapshot derived before the kernel ever ran. */
  priceSource?: PriceSource;
}

export type SteerSource = { text: string; source: string };

export interface ValidateFileOptions {
  /** Flow step the outcome is given for; overrides started.yaml's step. */
  step?: string;
  /** Repo root fallback when the file lives outside any repo. */
  repo?: string;
  /** Names the run layer explicitly, including differently named files. */
  runConfig?: string;
}

export interface ValidateResult {
  findings: string[];
  /** No `--step` and no started.yaml: only step-independent checks ran. */
  stepIndependent?: boolean;
}

/** One schema-enforced file kind `factory validate` recognizes, by path. */
export type ValidateKind =
  | "task"
  | "class"
  | "outcome"
  | "hold"
  | "repo"
  | "run"
  | "process"
  | "infra";

/** One schema-enforced file for the checks `validate` and the schema gate share. */
export interface FileCheckInput {
  /** Absolute path; every finding names it. */
  file: string;
  text: string;
  kind: ValidateKind;
  /** Task types and flows; read only by the task check. */
  process: () => Pick<ProcessConfig, "taskTypes" | "flows">;
  /** Flow existence is a config check `validate` runs; a tree walk stops at the graph. */
  flows: boolean;
}

/** A directory's task findings, and the files that parsed for the gate's valid count. */
export interface TaskDirFindings {
  findings: string[];
  checked: number;
}

/** Result of one synchronous command run. */
export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** One verdict per declared gate, in the pin record's shape. */
export type GateVerdicts = Record<
  Exclude<keyof PinGate, "rev" | "at">,
  PinGate["typecheck"]
>;

export interface PromoteOptions {
  /** Repo root of the tree running promote. */
  repo: string;
  /** Commitment to promote; defaults to HEAD. */
  rev?: string;
  env?: NodeJS.ProcessEnv;
}

/** Aggregates of one harness JSONL event log, as the old jq pipes printed. */
export interface LogSummary {
  session: string;
  steps: number;
  toolCalls: number;
  errors: unknown[];
  finalText: string;
}

export interface DispatchOptions {
  /** Repo root of the checkout running dispatch. */
  root: string;
  /** Assignment name; usage and exit 1 when missing. */
  name?: string;
  /** Model; `$FACTORY_DISPATCH_MODEL` when missing. */
  model?: string;
  env?: NodeJS.ProcessEnv;
  /** Overrides the clock, for deterministic log names in tests. */
  now?: Date;
}
