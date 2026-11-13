import type { CheckResult } from "../core/checks/types.js";
import type { ArtifactStore, Concern, Outcome, RecordStart } from "./types.js";

export function scriptMeta(
  iteration: number,
  step: string,
  opts: { slug?: string; round?: number } = {}
): RecordStart {
  return {
    iteration,
    step,
    round: opts.round ?? 1,
    actor: "script",
    ...(opts.slug ? { slug: opts.slug } : {}),
  };
}

/**
 * Script step that records a gate run; `ok` is the phase signal `derive` reads.
 * Merge-result gates use step `merge-checks` so the branch-check reducer ignores
 * them: the merge record that follows owns that failure.
 */
export async function appendChecks(
  store: ArtifactStore,
  meta: { iteration: number; slug: string; round: number },
  checks: CheckResult[],
  opts: { step?: string } = {}
): Promise<void> {
  await store.appendRecord(scriptMeta(meta.iteration, opts.step ?? "checks", meta), {
    ok: checks.every((c) => c.ok),
    checks,
  });
}

/** Mechanical commit record: the resulting tree feeds no-progress fingerprints. */
export async function appendCommit(
  store: ArtifactStore,
  meta: { iteration: number; slug: string; round: number },
  commit: string,
  tree: string
): Promise<void> {
  await store.appendRecord(scriptMeta(meta.iteration, "commit", meta), { ok: true, commit, tree });
}

/** The last-round reviewer concerns, recorded as debt once the item merges. */
export async function appendDebt(
  store: ArtifactStore,
  meta: { iteration: number; slug: string; round: number },
  concerns: Concern[],
  fallback: string
): Promise<void> {
  // Concerns already marked debt live on the review record; only the rest need
  // converting, or the summary would report the same debt twice.
  const unconverted = concerns.filter((c) => c.kind !== "debt");
  const debt: Concern[] =
    unconverted.length > 0
      ? unconverted.map((c) => ({
          kind: "debt",
          calibration: c.calibration,
          text: c.text,
          ...(c.evidence ? { evidence: c.evidence } : {}),
        }))
      : concerns.length === 0
        ? [{ kind: "debt", calibration: "architect", text: fallback }]
        : [];
  if (debt.length === 0) return;
  await store.appendRecord(scriptMeta(meta.iteration, "debt", meta), {
    ok: true,
    outcome: { status: "done", summary: "last-round review concerns recorded as debt", concerns: debt, forward: [] },
  });
}

export async function appendPark(
  store: ArtifactStore,
  meta: { iteration: number; slug: string; round: number },
  cause: string
): Promise<void> {
  await store.appendRecord(scriptMeta(meta.iteration, "park", meta), { ok: true, cause });
}

export async function appendFinish(
  store: ArtifactStore,
  meta: { iteration: number; slug: string; round: number },
  commit?: string
): Promise<void> {
  await store.appendRecord(scriptMeta(meta.iteration, "finish", meta), { ok: true, commit });
}

/** A pending task the architect dropped from the plan; the slug stays spent. */
export async function appendCancel(
  store: ArtifactStore,
  meta: { iteration: number; slug: string; round: number },
  cause: string
): Promise<void> {
  await store.appendRecord(scriptMeta(meta.iteration, "cancel", meta), { ok: true, cause });
}

/** Normalized concern text for prompts; outcome concerns carry no ids in KERNEL0. */
export function formatConcerns(outcome: Outcome): string {
  const lines = outcome.concerns.map(
    (c) => `- [${c.kind}/${c.calibration}] ${c.text}${c.evidence ? ` (${c.evidence})` : ""}`
  );
  lines.push(...outcome.forward.map((f) => `- forward: ${f}`));
  return lines.length > 0 ? lines.join("\n") : "";
}
