import { describe, expect, it } from "bun:test";
import { derive } from "../../src/kernel/derive.js";
import { fixDispositions } from "../../src/kernel/flow-context-history.js";
import { promptVars } from "../../src/kernel/flow-context-vars.js";
import type { KernelRuntime, StepRecord } from "../../src/kernel/types.js";
import { rec, script, task } from "./helpers.js";

const cleanlinessRedCheck = (
  seq: number,
  output = "Large file: data.bin (2000000 bytes)",
): StepRecord =>
  script(seq, {
    step: "checks",
    ok: false,
    checks: [
      {
        name: "cleanliness",
        ok: false,
        summary: "failed",
        output,
        fingerprint: "cleanliness",
      },
    ],
  });

const doneCheck = (seq: number): StepRecord =>
  script(seq, {
    step: "checks",
    ok: true,
    checks: [
      {
        name: "cleanliness",
        ok: true,
        summary: "pass",
        output: "Clean",
        fingerprint: "cleanliness",
      },
    ],
    startedAt: new Date(seq).toISOString(),
  });

const implement = (
  seq: number,
  round = 1,
  patch: Partial<StepRecord> = {},
): StepRecord =>
  rec(seq, {
    step: "implement",
    round,
    startedAt: new Date(seq).toISOString(),
    outcome: {
      status: "done",
      summary: "implemented",
      concerns: [],
      forward: [],
    },
    ...patch,
  });

const sharedTasks = [task("a")];
const sharedFlows = {
  "implement-review": {
    steps: [
      { id: "implement", prompt: "implementer", alias: "implementer" },
      { id: "review", prompt: "reviewer", alias: "reviewer", review: true },
    ],
  },
} as any;

describe("cleanliness revision hit -> revision -> pass", () => {
  it("covers hit -> revision -> pass", () => {
    // 1. Implement turn 1
    const t1 = implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" });
    // 2. Checks hit cleanliness
    const c2 = cleanlinessRedCheck(2);

    const s1 = derive(sharedTasks, [t1, c2], sharedFlows);
    expect(s1.tasks.a!.phase).toBe("implement");
    expect(s1.tasks.a!.round).toBe(1);
    expect(s1.tasks.a!.cleanlinessRevision).toBe(true);
    expect(s1.tasks.a!.gateFix).toBeUndefined();

    // 3. Revision turn fixes the issue (tree-2)
    const t3 = implement(3, 1, { tree: "tree-2", commit: "c2", base: "c0" });
    // 4. Checks pass
    const c4 = doneCheck(4);

    const s2 = derive(sharedTasks, [t1, c2, t3, c4], sharedFlows);
    expect(s2.tasks.a!.phase).toBe("review");
    expect(s2.tasks.a!.round).toBe(1);
    expect(s2.tasks.a!.cleanlinessRevision).toBeUndefined();
  });
});

describe("cleanliness revision author justification", () => {
  it("author justifies the hit: no re-loop, the reviewer sees the justification", () => {
    // 1. Implement turn 1
    const t1 = implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" });
    // 2. Checks hit cleanliness
    const c2 = cleanlinessRedCheck(2, "Large file: data.json (2000000 bytes)");

    const s1 = derive(sharedTasks, [t1, c2], sharedFlows);
    expect(s1.tasks.a!.cleanlinessRevision).toBe(true);

    // 3. Revision turn justifies the hit
    const t3 = implement(3, 1, {
      tree: "tree-1",
      commit: "c1",
      base: "c0",
      outcome: {
        status: "done",
        summary: "kept data.json for benchmark",
        concerns: [],
        forward: [],
        replies: [{ finding: 1, reply: "legitimate benchmark data file" }],
      },
    });

    // 4. Checks run again and cleanliness still flags data.json
    const c4 = cleanlinessRedCheck(4, "Large file: data.json (2000000 bytes)");

    // No re-loop! Advances to review
    const s2 = derive(sharedTasks, [t1, c2, t3, c4], sharedFlows);
    expect(s2.tasks.a!.phase).toBe("review");
    expect(s2.tasks.a!.cleanlinessRevision).toBeUndefined();
    expect(s2.tasks.a!.park).toBeUndefined();

    // The reviewer sees the justification via fixDispositions in round 1
    const dispositions = fixDispositions(
      [t1, c2, t3, c4],
      "a",
      sharedFlows["implement-review"],
      1,
      s2.tasks.a,
    );
    expect(dispositions).toContain("kept data.json for benchmark");
    expect(dispositions).toContain(
      "- finding 1: legitimate benchmark data file",
    );
  });
});

describe("cleanliness revision author summary-only justification", () => {
  it("author justifies the hit with summary only: reaches the reviewer", () => {
    // 1. Implement turn 1
    const t1 = implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" });
    // 2. Checks hit cleanliness
    const c2 = cleanlinessRedCheck(2, "Large file: data.json (2000000 bytes)");

    // 3. Revision turn justifies the hit with summary only (no replies)
    const t3 = implement(3, 1, {
      tree: "tree-1",
      commit: "c1",
      base: "c0",
      outcome: {
        status: "done",
        summary: "legitimate benchmark data file",
        concerns: [],
        forward: [],
      },
    });

    // 4. Checks run again and cleanliness still flags data.json
    const c4 = cleanlinessRedCheck(4, "Large file: data.json (2000000 bytes)");

    // No re-loop! Advances to review with cleanlinessJustified
    const s = derive(sharedTasks, [t1, c2, t3, c4], sharedFlows);
    expect(s.tasks.a!.phase).toBe("review");
    expect(s.tasks.a!.cleanlinessJustified).toBe(true);

    // The reviewer sees the justification via fixDispositions in round 1
    const dispositions = fixDispositions(
      [t1, c2, t3, c4],
      "a",
      sharedFlows["implement-review"],
      1,
      s.tasks.a,
    );
    expect(dispositions).toBe("legitimate benchmark data file");
  });
});

describe("cleanliness revision round 1 non-cleanliness multi-turn", () => {
  it("non-cleanliness multi-turn round 1 (implement -> gate fix -> review) leaves fix_dispositions empty", () => {
    // 1. Implement turn 1
    const t1 = implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" });
    // 2. Non-cleanliness gate fails (e.g. typecheck)
    const c2 = script(2, {
      step: "checks",
      ok: false,
      checks: [
        {
          name: "typecheck",
          ok: false,
          summary: "failed",
          output: "TS2322: Type 'string' is not assignable to type 'number'",
          fingerprint: "typecheck",
        },
      ],
      startedAt: new Date(2).toISOString(),
    });
    // 3. Gate fix turn
    const t3 = implement(3, 1, {
      tree: "tree-2",
      commit: "c2",
      base: "c0",
      outcome: {
        status: "done",
        summary: "fixed typecheck",
        concerns: [],
        forward: [],
      },
    });
    // 4. Checks pass
    const c4 = doneCheck(4);

    const s = derive(sharedTasks, [t1, c2, t3, c4], sharedFlows);
    expect(s.tasks.a!.phase).toBe("review");
    expect(s.tasks.a!.cleanlinessJustified).toBeUndefined();

    const dispositions = fixDispositions(
      [t1, c2, t3, c4],
      "a",
      sharedFlows["implement-review"],
      1,
      s.tasks.a,
    );
    expect(dispositions).toBe("");
  });
});

describe("cleanliness revision second hit and no hit", () => {
  it("second hit after the revision: normal change-request route, not a second revision prompt", () => {
    // 1. Implement turn 1
    const t1 = implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" });
    // 2. Cleanliness hit
    const c2 = cleanlinessRedCheck(2);

    // 3. Revision turn without justification (empty diff, no replies)
    const t3 = implement(3, 1, {
      tree: "tree-1",
      commit: "c1",
      base: "c0",
      outcome: {
        status: "done",
        summary: "",
        concerns: [],
        forward: [],
        replies: [],
      },
    });

    // 4. Cleanliness still hits
    const c4 = cleanlinessRedCheck(4);

    const s = derive(sharedTasks, [t1, c2, t3, c4], sharedFlows);
    // Second hit does not get another cleanlinessRevision prompt; takes normal gateFix / park route
    expect(s.tasks.a!.cleanlinessRevision).toBeUndefined();
  });

  it("no hit: unchanged flow, no extra turn", () => {
    const t1 = implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" });
    const c2 = doneCheck(2);

    const s = derive(sharedTasks, [t1, c2], sharedFlows);
    expect(s.tasks.a!.phase).toBe("review");
    expect(s.tasks.a!.cleanlinessRevision).toBeUndefined();
  });
});

describe("cleanliness revision promptVars", () => {
  it("promptVars supplies cleanliness_revision variable", () => {
    const flow = {
      steps: [
        { id: "implement", prompt: "implementer", alias: "implementer" },
        { id: "review", prompt: "reviewer", alias: "reviewer", review: true },
      ],
    } as any;
    const runtime = {
      store: {
        goalDir: "/goal",
        pathOf: () => "/path/class.yaml",
        tasks: { path: (slug: string) => `/tasks/${slug}.md` },
        records: { checksLog: () => "/logs/checks" },
      },
      configs: {
        repo: { setup: [], gates: [] },
        process: {
          taskTypes: {
            development: {
              flow: "implement-review",
              kind: "development",
              schema: "task",
            },
          },
        },
      },
    } as unknown as KernelRuntime;

    const taskFile = task("a");
    const t1 = implement(1, 1);

    // State with cleanlinessRevision = true
    const varsRevision = promptVars(
      runtime,
      taskFile,
      "/worktree",
      [t1],
      1,
      flow,
      { cleanlinessRevision: true } as any,
      "implement",
    );
    expect(varsRevision.cleanliness_revision).toBe("true");

    // Normal state
    const varsNormal = promptVars(
      runtime,
      taskFile,
      "/worktree",
      [t1],
      1,
      flow,
      { cleanlinessRevision: false } as any,
      "implement",
    );
    expect(varsNormal.cleanliness_revision).toBe("false");
  });
});

describe("cleanliness revision one follow-up per hit kind", () => {
  for (const output of [
    "Large file: data.bin (2000000 bytes)",
    "Disallowed artifact: cache.tmp",
    "New extension: notes.xyz (.xyz)",
  ]) {
    it(`${output}: one revision turn, then the normal fix route`, () => {
      const t1 = implement(1, 1, { tree: "tree-1", commit: "c1", base: "c0" });
      const c2 = cleanlinessRedCheck(2, output);

      const first = derive(sharedTasks, [t1, c2], sharedFlows);
      expect(first.tasks.a!.phase).toBe("implement");
      expect(first.tasks.a!.cleanlinessRevision).toBe(true);
      expect(first.tasks.a!.gateFix).toBeUndefined();

      const t3 = implement(3, 1, {
        tree: "tree-2",
        commit: "c2",
        base: "c0",
        outcome: {
          status: "done",
          summary: "",
          concerns: [],
          forward: [],
          replies: [],
        },
      });
      const c4 = cleanlinessRedCheck(4, output);

      const second = derive(sharedTasks, [t1, c2, t3, c4], sharedFlows);
      expect(second.tasks.a!.cleanlinessRevision).toBeUndefined();
      expect(second.tasks.a!.gateFix).toBe(true);
      expect(second.tasks.a!.phase).toBe("implement");
    });
  }
});
