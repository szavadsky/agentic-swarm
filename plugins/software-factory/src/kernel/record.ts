import type { CheckResult } from "../core/checks/types.js";
import type { ArtifactStore, Outcome, RecordStart } from "./types.js";

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

/** Script step that records a gate run; `ok` is the phase signal `derive` reads. */
export async function appendChecks(
  store: ArtifactStore,
  meta: { iteration: number; slug: string; round: number },
  checks: CheckResult[]
): Promise<void> {
  await store.appendRecord(scriptMeta(meta.iteration, "checks", meta), {
    ok: checks.every((c) => c.ok),
    checks,
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

/** Normalized concern text for prompts; outcome concerns carry no ids in KERNEL0. */
export function formatConcerns(outcome: Outcome): string {
  const lines = outcome.concerns.map(
    (c) => `- [${c.kind}/${c.calibration}] ${c.text}${c.evidence ? ` (${c.evidence})` : ""}`
  );
  lines.push(...outcome.forward.map((f) => `- forward: ${f}`));
  return lines.length > 0 ? lines.join("\n") : "";
}
