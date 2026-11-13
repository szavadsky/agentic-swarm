import type { Repo } from "../git/repo.js";

export interface InfraGate {
  id: string;
  command: string;
}

export interface TestRunnerConfig {
  command: string;
  selectorArgs?: string[];
  junitArg?: string;
}

/** Infra artifact produced by the infra step: setup commands and quality gates. */
export interface InfraArtifact {
  setup: string[];
  gates: InfraGate[];
  testRunner: TestRunnerConfig;
  notes?: string[];
}

export interface GateBaselineEntry {
  id: string;
  command?: string;
  status: "pass" | "fail" | "flaky";
  durationMs?: number;
  details?: string;
  mutatesWorktree?: boolean;
  failingTests?: string[];
  collectionErrors?: string[];
  improvements?: string[];
}

export interface GatesBaselineArtifact {
  timestamp?: string;
  gates: GateBaselineEntry[];
}

export type DeveloperTarget =
  | { selectors: string[]; expectRed: string[] }
  | { gate: string }
  | { command: string; customTarget: boolean };

export interface CustomCheckConfig {
  run: string;
  expect?: "pass" | "fail";
  cwd?: "item" | "task";
  timeoutSec?: number;
  phase?: "before" | "after";
  onFail?: "retry-step" | "fix-loop" | "consult" | "feed";
}

/** Project settings the checks read; the kernel config layer supplies these. */
export interface CheckProjectConfig {
  orchestrationFolder?: string;
  worktreeRoot?: string;
  paths?: {
    tests?: string | string[];
    prod?: string | string[];
  };
}

export interface CheckLimits {
  gateRetries?: number;
  gateTimeoutSec?: number;
  stubMaxProdLines?: number;
  storyMaxProdLines?: number;
  simpleMaxProdLines?: number;
  minFreeDiskMb?: number;
  [key: string]: unknown;
}

/** Process settings the checks read; the kernel config layer supplies these. */
export interface CheckPipelineConfig {
  checks?: Record<string, CustomCheckConfig>;
  limits?: CheckLimits;
  [key: string]: unknown;
}

export interface CheckContext {
  repo: Repo;
  wt: string;
  base: string;
  head?: string;
  project: CheckProjectConfig;
  pipeline: CheckPipelineConfig;
  infra?: InfraArtifact;
  baseline?: GatesBaselineArtifact;
  kind?: string;
  item?: string;
  task?: string;
  taskDir?: string;
  taskWt?: string;
  target?: DeveloperTarget;
  checkTimeoutSec?: number;
  testFirstCommit?: string;
  limits: CheckLimits;
  outputBytes: number;
}

export interface CheckResult {
  name: string;
  ok: boolean;
  summary: string;
  output: string;
  fingerprint: string;
  details?: unknown;
  flaky?: string[];
  skipped?: boolean;
  mutatesWorktree?: boolean;
  improvements?: string[];
}

/**
 * Trims a text string to at most maxBytes (UTF-8) taking the trailing portion.
 */
export function tailCap(text: string, maxBytes: number): string {
  if (!text) return "";
  const buf = Buffer.from(text, "utf8");
  if (buf.length <= maxBytes) return text;
  return buf.subarray(buf.length - maxBytes).toString("utf8");
}
