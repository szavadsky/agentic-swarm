import type {
  BoundaryStep,
  RecordStart,
  StepRecord,
  TaskFile,
  TurnSpec,
} from "../../src/kernel/types.js";

/** Boundary prompts and aliases the direct-runtime fixtures wire their run config for. */
export const TEST_BOUNDARY: Record<BoundaryStep, TurnSpec> = {
  architect: { prompt: "architect", alias: "architect" },
  digest: { prompt: "digest", alias: "digest" },
  front: { prompt: "front", alias: "front" },
  plancheck: { prompt: "plan-checker", alias: "plan-checker" },
  planreview: { prompt: "reviewer", alias: "plan-reviewer" },
  pm: { prompt: "pm", alias: "pm" },
  steward: { prompt: "steward", alias: "steward" },
};

export function task(slug: string, patch: Partial<TaskFile> = {}): TaskFile {
  return {
    slug,
    title: slug,
    kind: "development",
    flow: "implement-review",
    deps: [],
    scope: [],
    revision: 0,
    source: "test",
    body: "Do it.\nDone when: it works.",
    ...patch,
  };
}

export function rec(seq: number, patch: Partial<StepRecord> = {}): StepRecord {
  return {
    seq,
    iteration: 1,
    slug: "a",
    step: "implement",
    round: 1,
    actor: "agent",
    alias: "implementer",
    model: { id: "fake" },
    startedAt: new Date(0).toISOString(),
    endedAt: new Date(1000).toISOString(),
    ...patch,
  };
}

export function script(
  seq: number,
  patch: Partial<StepRecord> = {},
): StepRecord {
  return rec(seq, {
    actor: "script",
    alias: undefined,
    model: undefined,
    ...patch,
  });
}

export function recordStart(patch: Partial<RecordStart> = {}): RecordStart {
  return {
    iteration: 1,
    step: "implement",
    round: 1,
    actor: "agent",
    alias: "implementer",
    model: { id: "fake" },
    ...patch,
  };
}
