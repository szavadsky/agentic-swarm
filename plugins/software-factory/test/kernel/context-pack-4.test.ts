import { describe, expect, it } from "bun:test";
import {
  readyAging,
  renderContextPack,
} from "../../src/kernel/context-pack.js";
import { derive } from "../../src/kernel/derive.js";
import { rec, script, task } from "./helpers.js";

const tasks = [task("a"), task("b", { deps: ["a"] })];

function registerContextPackPart8(): void {
  it("renders each spike finding under its slug, indenting a multi-line report", () => {
    const spikes = [task("probe", { kind: "spike", flow: "spike" })];
    const pack = renderContextPack({
      goal: "demo",
      iteration: 2,
      intentPath: "/goal/intent.md",
      planPath: "/goal/plan.md",
      checkout: "/wt/demo",
      integrationBranch: "factory/demo",
      headHash: "abcdef1234567890",
      recordsDir: "/goal/records",
      tasksDir: "/goal/tasks",
      tasks: spikes,
      state: derive(spikes, []),
      spikeFindings: [{ slug: "probe", finding: "# Finding\nCursor wins." }],
      steers: [],
      setup: [],
      gates: [],
      forwarded: [],
      debts: [],
    });
    expect(pack).toContain(
      "## Spike findings\n- probe:\n  # Finding\n  Cursor wins.\n",
    );
  });
}

function registerContextPackPart9(): void {
  it("names a self-hold as the cause of a ready task with no turn", () => {
    const spikes = [
      task("no-outcome-forensics-spike", { kind: "spike", flow: "spike" }),
    ];
    const aged = readyAging({
      tasks: spikes,
      state: derive(spikes, []),
      records: [],
      segment: 1,
      pendingSteers: ["no-outcome-forensics"],
      holds: [
        {
          steer: "no-outcome-forensics",
          slugs: ["no-outcome-forensics-spike"],
        },
      ],
    });
    expect(aged).toEqual([
      {
        slug: "no-outcome-forensics-spike",
        causes: ["held by steer no-outcome-forensics"],
      },
    ]);
  });
}

function registerContextPackPart10(): void {
  it("drops a hold whose steer was processed and a task that started a turn", () => {
    const tasks = [task("alpha"), task("beta")];
    const records = [rec(1, { iteration: 1, slug: "beta", step: "implement" })];
    const state = derive(tasks, records);
    const held = [
      { steer: "s1", slugs: ["alpha"] },
      { steer: "s2", slugs: ["beta"] },
    ];
    // Both holds match; s1 is still pending, s2's steer was processed. Beta
    // also started an implement turn, so only alpha's live hold remains.
    expect(
      readyAging({
        tasks,
        state,
        records,
        segment: 1,
        pendingSteers: ["s1"],
        holds: held,
      }),
    ).toEqual([{ slug: "alpha", causes: ["held by steer s1"] }]);
  });
}

function registerContextPackPart11(): void {
  it("names a dep that landed in the segment and a declared-area clash", () => {
    const tasks = [
      task("landed", { scope: ["kernel pack"] }),
      task("waiter", { deps: ["landed"], scope: ["kernel pack"] }),
      task("twin", { scope: ["kernel pack"] }),
      // Still pending on waiter: the aging list is ready work only.
      task("queued", { deps: ["waiter"] }),
    ];
    const records = [
      script(1, { iteration: 1, slug: "landed", step: "merge", ok: true }),
      rec(2, { iteration: 1, slug: "twin", step: "implement" }),
    ];
    expect(
      readyAging({
        tasks,
        state: derive(tasks, records),
        records,
        segment: 1,
        pendingSteers: [],
        holds: [],
      }),
    ).toEqual([
      {
        slug: "waiter",
        causes: [
          "dep landed merged in iteration 1",
          'area "kernel pack" clashes with twin',
        ],
      },
    ]);
  });
}

function registerContextPackPart12(): void {
  it("names a next step whose alias has no live tier", () => {
    const tasks = [task("alpha")];
    expect(
      readyAging({
        tasks,
        state: derive(tasks, []),
        records: [],
        segment: 1,
        pendingSteers: [],
        holds: [],
        unavailableAliases: new Map([
          ["alpha", 'alias "implementer" has no live tier: pools exhausted'],
        ]),
      }),
    ).toEqual([
      {
        slug: "alpha",
        causes: ['alias "implementer" has no live tier: pools exhausted'],
      },
    ]);
  });
}

function registerContextPackPart13(): void {
  it("renders the aging section only when a segment exists, with its causes", () => {
    const tasks = [task("alpha")];
    const base = {
      goal: "demo",
      iteration: 2,
      intentPath: "/goal/intent.md",
      planPath: "/goal/plan.md",
      checkout: "/wt/demo",
      integrationBranch: "factory/demo",
      headHash: "abcdef1234567890",
      recordsDir: "/goal/records",
      tasksDir: "/goal/tasks",
      tasks,
      state: derive(tasks, []),
      steers: [],
      setup: [],
      gates: [],
      forwarded: [],
      debts: [],
    };
    expect(renderContextPack(base)).not.toContain(
      "## Ready, no turn in the last segment",
    );
    expect(renderContextPack({ ...base, agedReady: [] })).toContain(
      "## Ready, no turn in the last segment\n- none",
    );
    expect(
      renderContextPack({
        ...base,
        agedReady: [
          { slug: "beta", causes: ["held by steer s1"] },
          { slug: "alpha", causes: [] },
        ],
      }),
    ).toContain(
      "## Ready, no turn in the last segment\n- alpha: no blocking cause recorded\n- beta: held by steer s1\n",
    );
  });
}

describe("context pack", () => {
  registerContextPackPart8();

  registerContextPackPart9();

  registerContextPackPart10();

  registerContextPackPart11();

  registerContextPackPart12();

  registerContextPackPart13();
});
