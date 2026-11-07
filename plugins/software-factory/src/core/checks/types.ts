import type { Repo } from "../git/repo.js";
import type {
  ProjectConfig,
  PipelineConfig,
  InfraArtifact,
  GatesBaselineArtifact,
  DeveloperTarget,
  PipelineLimits,
} from "../artifacts.js";

export interface CheckContext {
  repo: Repo;
  wt: string;
  base: string;
  head?: string;
  project: ProjectConfig;
  pipeline: PipelineConfig;
  infra?: InfraArtifact;
  baseline?: GatesBaselineArtifact;
  kind?: string;
  item?: string;
  task?: string;
  taskWt?: string;
  target?: DeveloperTarget;
  checkTimeoutSec?: number;
  testFirstCommit?: string;
  limits: PipelineLimits;
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
