import type { Concern, ConcernSource, RemarkableDecision, ReviewSuggestion, StoredConcernArtifact } from "./artifacts.js";
import type { Repo } from "./git/repo.js";

export type ConcernInput = Pick<Concern, "kind" | "summary" | "location" | "affects"> &
  Partial<Pick<Concern, "detail" | "severity">>;
export interface ConcernStoreContext { taskDir: string; taskWt: string; repo: Repo; now?: () => Date }
export interface ConcernResolution { id: string; action: "resolve" | "carry" | "propagate"; note?: string }

export function concernFingerprint(_concern: ConcernInput): string {
  return "";
}
export async function aggregateConcerns(
  _ctx: ConcernStoreContext & { source: ConcernSource },
  _concerns: ConcernInput[],
  _remarkables: RemarkableDecision[] = []
): Promise<StoredConcernArtifact[]> {
  return [];
}
export async function listOpenConcerns(_taskDir: string): Promise<StoredConcernArtifact[]> {
  return [];
}
export async function applyConcernTriage(
  _ctx: ConcernStoreContext & { suggestions: ReviewSuggestion[]; isTriager: boolean }
): Promise<StoredConcernArtifact[]> {
  return [];
}
export async function applyCloseupResolutions(
  _ctx: ConcernStoreContext & { resolutions: ConcernResolution[]; by: string }
): Promise<StoredConcernArtifact[]> {
  return [];
}
export function partitionSuggestions(
  _suggestions: ReviewSuggestion[],
  _concernIds: Iterable<string>
): { triage: ReviewSuggestion[]; findings: ReviewSuggestion[] } {
  return { triage: [], findings: [] };
}
export async function reconcileConcerns(_ctx: ConcernStoreContext): Promise<StoredConcernArtifact[]> {
  return [];
}
