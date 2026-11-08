import type { PipelineConfig } from "./artifacts.js";

/** Builtin review dispositions when the pipeline config sets no policy (§8.7). */
export const BUILTIN_REVIEW_DISPOSITIONS = [
  "fix",
  "optional",
  "architect",
  "human-awareness",
  "human-async",
] as const;

/**
 * Agents that triage worker concerns and may dismiss them (§8.7, §18):
 * the step's reviewer plus plan and close-up reviewers.
 */
export function isTriagerAgent(agent: string): boolean {
  return (
    agent === "reviewer" ||
    agent === "plan-reviewer" ||
    agent === "wave-close-up" ||
    agent === "plan-close-up"
  );
}

/**
 * Resolves dispositions a review agent may emit (§8.7, §18).
 * Precedence: per-agent list > default > legacy `allowedDispositions` alias > builtin.
 * Triagers additionally get `dismiss`; non-triagers never do.
 */
export function resolveReviewAllowed(
  pipeline: PipelineConfig,
  agent: string,
  isTriager: boolean
): string[] {
  const policy = pipeline.reviewPolicy;
  const configured = [policy?.[agent], policy?.default, policy?.allowedDispositions].find(
    (list): list is string[] => Array.isArray(list) && list.length > 0
  );
  const dispositions = Array.from(
    new Set<string>(configured ?? BUILTIN_REVIEW_DISPOSITIONS)
  );
  if (!isTriager) return dispositions.filter((d) => d !== "dismiss");
  return dispositions.includes("dismiss")
    ? dispositions
    : [...dispositions, "dismiss"];
}
