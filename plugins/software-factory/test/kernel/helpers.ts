import type {
  ArchitectureConfig,
  BoundaryStep,
  RecordStart,
  StepRecord,
  TaskFile,
  TurnSpec,
} from "../../src/kernel/types.js";

/** Boundary prompts and aliases the direct-runtime fixtures wire their run config for. */
export const TEST_BOUNDARY: Record<BoundaryStep, TurnSpec> = {
  architect: {
    prompt: "architect",
    alias: "architect",
    repairPrompt: "architect-repair",
    deliverable: "plan edit or stop decision",
  },
  digest: { prompt: "digest", alias: "digest" },
  front: {
    prompt: "front",
    alias: "front",
    deliverable: "class, task, and pack",
  },
  plancheck: {
    prompt: "plan-checker",
    alias: "plan-checker",
    deliverable: "plan verdict",
  },
  pm: { prompt: "pm", alias: "pm", deliverable: "task files" },
  steward: {
    prompt: "steward",
    alias: "steward",
    deliverable: "merge resolution",
  },
};

/** The architecture flow the direct-runtime fixtures run. */
export const TEST_ARCHITECTURE: ArchitectureConfig = {
  planReview: { prompt: "review-architect" },
  reviewers: ["plan-reviewer"],
  architectReturn: "on-technical-concerns",
  planReturn: { prompt: "architect-review-return" },
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
