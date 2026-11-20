import type { RecordStart, TaskFile } from "../../src/kernel/types.js";

const MODEL = { id: "fake/model" };

export function start(over: Partial<RecordStart> = {}): RecordStart {
  return {
    iteration: 1,
    slug: "auth.login",
    step: "implement",
    round: 1,
    actor: "agent",
    alias: "implementer",
    model: MODEL,
    ...over,
  };
}

export function task(over: Partial<TaskFile> = {}): TaskFile {
  return {
    slug: "auth.login",
    title: "Login",
    kind: "development",
    flow: "implement-review",
    deps: [],
    scope: ["src/auth"],
    revision: 0,
    source: "Plan §auth",
    body: "why login\n\ndone when: user can log in",
    ...over,
  };
}
