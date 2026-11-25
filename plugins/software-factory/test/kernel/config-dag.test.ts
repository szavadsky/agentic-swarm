import { describe, expect, it } from "bun:test";
import { architectureFlowForReason } from "../../src/kernel/architect-flow.js";
import {
  architectureFlowsSchema,
  flowSchema,
} from "../../src/kernel/config/flow-schema.js";
import { derive } from "../../src/kernel/derive.js";
import { next } from "../../src/kernel/next.js";
import type {
  FlowDefinition,
  Limits,
  ProcessConfig,
  StepRecord,
} from "../../src/kernel/types.js";
import { rec, script, task } from "./helpers.js";

function flow(steps: unknown[]): unknown {
  return { steps };
}

/** A productive step; callers add the fields each case is about. */
function step(id: string): Record<string, unknown> {
  return { id, prompt: "implementer", alias: "implementer" };
}

const RESERVED_AFTER_CASES: unknown[] = [
  flow([{ ...step("a"), after: ["resolve"] }, step("resolve")]),
  flow([{ ...step("a"), after: ["checks"] }, step("checks")]),
  flow([{ ...step("resolve"), after: ["a"] }, step("a")]),
  flow([{ ...step("checks"), after: ["a"] }, step("a")]),
];

function rejectsCycleTest(): void {
  it("rejects a cycle in the after edges, naming the flow config", () => {
    const parsed = flowSchema.safeParse(
      flow([
        step("a"),
        { ...step("b"), after: ["c"] },
        { ...step("c"), after: ["b"] },
      ]),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(
        parsed.error.issues.some((issue) =>
          issue.message.includes("must not cycle"),
        ),
      ).toBe(true);
    }
  });
}

describe("flow config DAG validation", () => {
  rejectsCycleTest();

  it("rejects an unknown predecessor and a self edge", () => {
    expect(
      flowSchema.safeParse(flow([{ ...step("a"), after: ["ghost"] }])).success,
    ).toBe(false);
    expect(
      flowSchema.safeParse(flow([{ ...step("a"), after: ["a"] }])).success,
    ).toBe(false);
  });

  it("rejects a repeated step id", () => {
    expect(flowSchema.safeParse(flow([step("a"), step("a")])).success).toBe(
      false,
    );
  });

  it("rejects after on and from the reserved checks/resolve steps", () => {
    // An after edge naming a reserved step is a silent no-op in the walk, and
    // the reserved steps carry no edges of their own: refuse both.
    for (const candidate of RESERVED_AFTER_CASES) {
      const parsed = flowSchema.safeParse(candidate);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(
          parsed.error.issues.some((issue) =>
            issue.message.includes("agent steps"),
          ),
        ).toBe(true);
      }
    }
  });

  it("accepts a parallel flow and defaults the same flow without after", () => {
    const parsed = flowSchema.safeParse(
      flow([
        step("draft"),
        { ...step("polish"), after: ["draft"] },
        {
          id: "critique",
          prompt: "reviewer",
          alias: "reviewer",
          review: true,
          changeRequests: 0,
          after: ["draft", "polish"],
        },
      ]),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.dag).toBe(true);
    const plain = flowSchema.safeParse(flow([step("draft"), step("polish")]));
    expect(plain.success).toBe(true);
    if (plain.success) expect(plain.data.dag).toBeUndefined();
  });
});

describe("architect flow config", () => {
  const custom = { id: "assess", prompt: "assess", alias: "architect" };

  it("accepts steps before and after the architect", () => {
    const parsed = architectureFlowsSchema.safeParse([
      {
        when: ["initial"],
        steps: [
          custom,
          { id: "architect" },
          {
            id: "second-review",
            prompt: "review-architect",
            alias: "reviewer-b",
          },
          { id: "planreview" },
          { id: "pm" },
        ],
      },
    ]);
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown reason", () => {
    const parsed = architectureFlowsSchema.safeParse([
      {
        when: ["cheker-done"],
        steps: [{ id: "architect" }, { id: "pm" }],
      },
    ]);
    expect(parsed.success).toBe(false);
  });

  it("rejects prompt and repair fields on a built-in step", () => {
    const candidates = [
      [
        { id: "architect", prompt: "architect", alias: "architect" },
        { id: "pm" },
      ],
      [
        { id: "architect" },
        { id: "planreview", alias: "plan-reviewer" },
        { id: "pm" },
      ],
      [{ id: "architect" }, { id: "pm", repairPrompt: "delivery-repair" }],
      [{ id: "architect" }, { id: "pm", unfinishedPrompt: "delivery-repair" }],
      [{ id: "architect" }, { id: "pm", deliverable: "a task list" }],
    ];
    for (const steps of candidates) {
      const parsed = architectureFlowsSchema.safeParse([
        { when: ["initial"], steps },
      ]);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(
          parsed.error.issues.some((issue) =>
            issue.message.includes("built-in architect flow step"),
          ),
        ).toBe(true);
      }
    }
  });
});

describe("architect flow step requirements", () => {
  it("rejects a custom step without a prompt or alias", () => {
    expect(
      architectureFlowsSchema.safeParse([
        {
          when: ["initial"],
          steps: [{ id: "assess" }, { id: "architect" }, { id: "pm" }],
        },
      ]).success,
    ).toBe(false);
    expect(
      architectureFlowsSchema.safeParse([
        {
          when: ["initial"],
          steps: [
            { id: "assess", prompt: "assess" },
            { id: "architect" },
            { id: "pm" },
          ],
        },
      ]).success,
    ).toBe(false);
  });

  it("requires one architect and a closing pm step", () => {
    expect(
      architectureFlowsSchema.safeParse([
        { when: ["initial"], steps: [{ id: "pm" }] },
      ]).success,
    ).toBe(false);
    expect(
      architectureFlowsSchema.safeParse([
        { when: ["initial"], steps: [{ id: "architect" }] },
      ]).success,
    ).toBe(false);
  });
});

describe("architect flow selection", () => {
  it("falls back to the initial flow when no reason matches", () => {
    const process = {
      architecture: {
        flows: [
          {
            when: ["initial"],
            steps: [{ id: "architect" }, { id: "pm" }],
          },
          {
            when: ["steer"],
            steps: [{ id: "architect" }, { id: "planreview" }, { id: "pm" }],
          },
        ],
      },
    } as unknown as ProcessConfig;
    expect(architectureFlowForReason(process, "concerns")).toEqual(
      process.architecture.flows![0]!,
    );
    expect(
      architectureFlowForReason(process, "steer").steps.map((s) => s.id),
    ).toEqual(["architect", "planreview", "pm"]);
  });
});

function records(): {
  flowDef: FlowDefinition;
  limits: Limits;
  implement: (seq: number, round?: number) => StepRecord;
  check: (seq: number) => StepRecord;
  review: (
    seq: number,
    verdict: "approve" | "changes" | "reject",
    round?: number,
  ) => StepRecord;
  polish: (seq: number, round?: number) => StepRecord;
} {
  const flowDef: FlowDefinition = {
    dag: true,
    steps: [
      { id: "draft", prompt: "implementer", alias: "implementer", after: [] },
      { id: "polish", prompt: "implementer", alias: "implementer", after: [] },
      {
        id: "critique",
        prompt: "reviewer",
        alias: "reviewer",
        review: true,
        changeRequests: 0,
        after: ["draft", "polish"],
      },
    ],
  };
  const limits: Limits = {
    flows: { "draft-polish-critique": flowDef },
    iterations: 1,
    concurrency: { overall: 1, perSubscription: {}, perModel: {} },
    planCheckRounds: 2,
  };
  return {
    flowDef,
    limits,
    implement: (seq, round = 1) =>
      rec(seq, {
        step: "draft",
        round,
        outcome: {
          status: "done",
          summary: "drafted",
          concerns: [],
          forward: [],
        },
      }),
    check: (seq) => script(seq, { step: "checks", ok: true, checks: [] }),
    review: (seq, verdict, round = 1) =>
      rec(seq, {
        step: "critique",
        round,
        outcome: {
          status: "done",
          summary: "review",
          concerns: [],
          forward: [],
          verdict,
        },
      }),
    polish: (seq, round = 1) =>
      rec(seq, {
        step: "polish",
        round,
        outcome: {
          status: "done",
          summary: "polished",
          concerns: [],
          forward: [],
        },
      }),
  };
}

describe("next with DAG phases", () => {
  it("derives the ready step from ready edges, checks at the tail", () => {
    const { flowDef, limits, implement, check, polish, review } = records();
    const flows = { "draft-polish-critique": flowDef };
    const state = derive(
      [task("a", { flow: "draft-polish-critique" })],
      [],
      flows,
    );
    expect(next(state, limits, new Set())).toEqual([
      { kind: "step", slug: "a", step: "draft", round: 1 },
    ]);
    const afterDraft = derive(
      [task("a", { flow: "draft-polish-critique" })],
      [implement(1)],
      flows,
    );
    // A productive turn's gates ran inline: the phase is already polish in
    // the records derived here, without a separate checks record.
    expect(afterDraft.tasks.a!.phase).toBe("polish");
    const afterChecks = derive(
      [task("a", { flow: "draft-polish-critique" })],
      [implement(1), check(2)],
      flows,
    );
    expect(afterChecks.tasks.a!.phase).toBe("polish");
    const afterPolish = derive(
      [task("a", { flow: "draft-polish-critique" })],
      [implement(1), check(2), polish(3)],
      flows,
    );
    // Polish is the last productive step: the tail's checks record is the
    // synthetic one the task file hands derive; it settles the phase to
    // checks here, and only an advancing checks verdict at the flow's end
    // moves it to the merge.
    expect(afterPolish.tasks.a!.phase).toBe("checks");
    const ready = derive(
      [task("a", { flow: "draft-polish-critique" })],
      [implement(1), check(2), polish(3), check(4)],
      flows,
    );
    expect(ready.tasks.a!.phase).toBe("critique");
    expect(next(ready, limits, new Set())).toEqual([
      { kind: "step", slug: "a", step: "critique", round: 1 },
    ]);
    const afterReview = derive(
      [task("a", { flow: "draft-polish-critique" })],
      [implement(1), check(2), polish(3), check(4), review(5, "approve")],
      flows,
    );
    expect(afterReview.tasks.a!.phase).toBe("merge");
    expect(next(afterReview, limits, new Set())).toEqual([
      { kind: "merge", slug: "a" },
    ]);
  });
});
