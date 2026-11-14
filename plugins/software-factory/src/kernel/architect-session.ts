import path from "node:path";
import type { SessionRef } from "../harness/types.js";
import { resolveRole } from "./flow-context.js";
import type { KernelRuntime, StepRecord } from "./types.js";

/**
 * The session ref is re-derived from the last architect record, never kept in
 * memory: a relaunch reads it off disk. Resume is cwd- and model-bound, and
 * only when the harness says it can.
 */
export async function resumableSession(
  runtime: KernelRuntime,
  records: StepRecord[]
): Promise<SessionRef | undefined> {
  const last = records
    .filter((r) => r.step === "architect" && r.session && r.endedAt)
    .sort((a, b) => a.seq - b.seq)
    .at(-1);
  if (!last?.session) return undefined;
  const { harness, model } = resolveRole(runtime, "architect");
  let resume = false;
  try {
    resume = (await harness.caps(model)).resume;
  } catch {
    return undefined;
  }
  if (!resume) return undefined;
  const session = last.session;
  if (session.harness !== harness.id) return undefined;
  if (path.resolve(session.cwd) !== path.resolve(runtime.paths.goalCheckout)) return undefined;
  if (session.model.id !== model.id) return undefined;
  return session;
}
