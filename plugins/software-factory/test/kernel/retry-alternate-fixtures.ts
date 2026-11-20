import type { KernelRuntime, StepRecord } from "../../src/kernel/types.js";
import { rec } from "./helpers.js";
import { outcome } from "./s2-helpers.js";

export const aliases = {
  architect: { harness: "fake", model: "fake-architect" },
  pm: { harness: "fake", model: "fake-pm" },
  digest: { harness: "fake", model: "fake-digest" },
  implementer: { harness: "fake", model: "fake-impl" },
  "implementer-alt": { harness: "fake", model: "fake-alt-impl" },
  reviewer: { harness: "fake", model: "fake-review" },
  steward: { harness: "fake", model: "fake-steward" },
  "plan-checker": { harness: "fake", model: "fake-check" },
  intent: { harness: "fake", model: "fake-intent" },
  "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
  "pack-preparer": { harness: "fake", model: "fake-pack-prep" },
};

/** Alternates only on the productive step; the reviewer keeps its single alias. */
export const process = {
  flows: {
    "implement-review": {
      steps: [
        {
          id: "implement",
          prompt: "implementer",
          alias: "implementer",
          alternates: ["implementer-alt"],
        },
        {
          id: "review",
          prompt: "reviewer",
          alias: "reviewer",
          review: true,
          changeRequests: 2,
        },
      ],
    },
  },
};

export function flowOf(runtime: KernelRuntime) {
  return runtime.configs.process.flows["implement-review"]!;
}

export const failedOutcome = () =>
  outcome({ status: "failed", summary: "no plan" }) as StepRecord["outcome"];

/** A step record of the task under test. */
export const stepRec = (seq: number, patch: Partial<StepRecord> = {}) =>
  rec(seq, { slug: "task", ...patch });
