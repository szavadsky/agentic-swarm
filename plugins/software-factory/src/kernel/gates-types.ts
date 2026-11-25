/** The gate types: what a producer's output normalises into, and one declared gate run. */

import type { CheckResult } from "../core/checks/types.js";
import type { ProcessResult } from "../core/proc.js";

/** What a gate producer knows about its own run but the signature reader cannot. */
export interface GateCheckMeta {
  /** Absolute directories the gate ran from; their prefixes are not identity. */
  roots: string[];
  /** The output is the tail of a longer report; its head is gone. */
  truncated: boolean;
}

export interface CappedGateOutput {
  output: string;
  /** The head was dropped; a bun report resumes at its next file header. */
  truncated: boolean;
}

/** A check that could not run; the baseline never records one as red. */
export interface GateInfra {
  kind: "infra";
  cause: string;
}

/** One gate's declared artifacts, already read and root-normalised by the caller. */
export interface GateArtifacts {
  /** The gate's exit code; null when it was killed or timed out. */
  exitCode: number | null;
  /** The raw report texts the gate declared and wrote, keyed by format. */
  junit?: string;
  ctrf?: string;
  sarif?: string;
  /** The capped, root-normalised gate output. */
  log: string;
}

export interface GateReports {
  contents: Pick<GateArtifacts, "junit" | "ctrf" | "sarif">;
  error?: string;
  /** A test report's failing cases are part of the verdict; SARIF is not. */
  testReport: boolean;
}

/** One declared gate run: its command result and the check built from it. */
export interface DeclaredGateRun {
  res: ProcessResult;
  check: CheckResult;
}
