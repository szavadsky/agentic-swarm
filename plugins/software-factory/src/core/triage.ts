import type { ReviewSuggestion, StoredConcernArtifact } from "./artifacts.js";
import type { Repo } from "./git/repo.js";

/** Exact-id reviewer triage over review suggestions (§8.7, §18). */
export interface TriagePartition {
  triage: ReviewSuggestion[];
  findings: ReviewSuggestion[];
  fixRequired: boolean;
}
export interface ReviewTriageOutcome extends TriagePartition {
  routed: ReviewSuggestion[];
  dismissed: ReviewSuggestion[];
  mailboxIds: string[];
}
export interface ReviewTriageContext {
  taskDir: string; taskWt: string; repo: Repo; suggestions: ReviewSuggestion[];
  concernIds: Iterable<string>; isTriager: boolean; item?: string; now?: () => Date;
}
/** Contract violation that must fail the review step instead of being journaled. */
export class TriageValidationError extends Error {}
export function partitionReviewSuggestions(suggestions: ReviewSuggestion[], concernIds: Iterable<string>, isTriager: boolean): TriagePartition {
  return { triage: [], findings: [...suggestions], fixRequired: false };
}
export function concernMailboxId(concernId: string): string {
  return `q-concern-${concernId}`;
}
export function isDebtConcern(c: Pick<StoredConcernArtifact, "kind" | "status" | "disposition">): boolean {
  return false;
}
export function renderConcernsYaml(concerns: StoredConcernArtifact[], maxBytes = 8000): string {
  return "";
}
export async function applyReviewTriage(ctx: ReviewTriageContext): Promise<ReviewTriageOutcome> {
  return { ...partitionReviewSuggestions(ctx.suggestions, ctx.concernIds, ctx.isTriager), routed: [], dismissed: [], mailboxIds: [] };
}
