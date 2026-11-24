import { formatCause, readCause } from "../../src/kernel/cause.js";
import type {
  ArchitectureConfig,
  BoundaryStep,
  Cause,
  RecordStart,
  StepRecord,
  TaskFile,
  TurnSpec,
} from "../../src/kernel/types.js";

/**
 * A typed cause fixture from the text a record would carry: the same mapping
 * the store applies to records written before causes were typed, so a fixture's
 * kind cannot drift from the producer's.
 */
export function cause(text: string): Cause {
  const parsed = readCause(text);
  if (!parsed) throw new Error(`test cause ${JSON.stringify(text)} is empty`);
  return parsed;
}

/** Rendered cause text for assertions; an absent cause renders empty. */
export function causeText(value: Cause | undefined): string {
  return value ? formatCause(value) : "";
}

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
  intent: { prompt: "intent", alias: "intent", deliverable: "intent edit" },
  packprep: {
    prompt: "pack-preparer",
    alias: "pack-preparer",
    deliverable: "pack briefs",
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

/** A test task; a legacy `scope` patch is accepted and dropped, as the parser does. */
export function task(
  slug: string,
  patch: Partial<TaskFile> & { scope?: string[] } = {},
): TaskFile {
  const { scope: _legacyScope, ...rest } = patch;
  return {
    slug,
    title: slug,
    kind: "development",
    flow: "implement-review",
    deps: [],
    revision: 0,
    source: "test",
    body: "Do it.\nDone when: it works.",
    ...rest,
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
