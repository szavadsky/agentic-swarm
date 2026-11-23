/** Public result shapes of the goal, steer and validation commands. */

import type { PriceSource } from "../../kernel/openrouter.js";
import type { State } from "../../kernel/types.js";

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
