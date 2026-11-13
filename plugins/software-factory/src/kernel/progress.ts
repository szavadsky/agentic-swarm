import { fingerprintText } from "../core/fingerprint.js";
import type { Outcome, StepRecord, TaskKind } from "./types.js";

/**
 * One fingerprint per completed step: what ran, how it ended, and the tree it
 * left (findings for a spike). Comparing the whole history catches A, B, A, B,
 * where comparing only the previous fingerprint sees no repeat.
 */
export function stepFingerprint(
  kind: TaskKind,
  record: StepRecord,
  tree: string | undefined
): string | null {
  const outcome = record.outcome;
  if (record.stop?.kind === "infra" || record.stop?.kind === "truncated" || record.stop?.kind === "cancelled") {
    return null;
  }
  if (!outcome && record.stop?.kind !== "refusal") return null;

  const status = outcome?.status ?? "stopped";
  const verdict = outcome?.verdict ?? "-";
  let result: string | undefined;
  if (kind === "spike") {
    const concerns = (outcome?.concerns ?? []).map((c) => `${c.kind}:${c.text}`).join("\n");
    result = fingerprintText(`${outcome?.summary ?? ""}\n${concerns}`, { lowercase: false });
  } else {
    result = record.tree ?? tree ?? record.commit;
  }
  if (!result) return null;
  return fingerprintText([kind, record.step, status, verdict, result].join("\n"), { lowercase: false });
}
