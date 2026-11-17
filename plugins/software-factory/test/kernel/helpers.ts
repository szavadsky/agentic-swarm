import type {
  RecordStart,
  StepRecord,
  TaskFile,
} from "../../src/kernel/types.js";

export function task(slug: string, patch: Partial<TaskFile> = {}): TaskFile {
  return {
    slug,
    title: slug,
    kind: "task",
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
