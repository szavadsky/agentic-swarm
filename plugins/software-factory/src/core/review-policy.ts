import type { PipelineConfig } from "./artifacts.js";

/** Resolves dispositions a review agent may emit (§8.7, §18). */
export function resolveReviewAllowed(
  _pipeline: PipelineConfig,
  _agent: string,
  _isTriager: boolean
): string[] {
  return [];
}
