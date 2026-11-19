import { describe, expect, it } from "bun:test";
import {
  forwardedConcerns,
  readyAging,
  renderContextPack,
  shallowCodeMap,
} from "../../src/kernel/context-pack.js";
import { derive, openDebts } from "../../src/kernel/derive.js";
import { rec, script, task } from "./helpers.js";

const tasks = [task("a"), task("b", { deps: ["a"] })];

describe("context pack", () => {
  it("renders identical bytes for identical derived state", () => {
    const records = [
      rec(1, {
        step: "review",
        outcome: {
          status: "done",
          summary: "r",
          concerns: [],
          forward: ["watch it"],
          verdict: "approve",
        },
      }),
      script(2, { step: "park", ok: true, cause: "round limit", slug: "b" }),
    ];
    const input = {
      goal: "demo",
      iteration: 2,
      intentPath: "/goal/intent.md",
      planPath: "/goal/plan.md",
      checkout: "/wt/demo",
      integrationBranch: "factory/demo",
      headHash: "abcdef1234567890",
      recordsDir: "/goal/records",
      tasksDir: "/goal/tasks",
      previousSummary: "/goal/iterations/1/summary.md",
      digestPath: "/goal/iterations/2/digest.md",
      codeMap: ["src/kernel/ — 8 files", "test/kernel/ — 6 files"],
      tasks,
      state: derive(tasks, records),
      steers: [],
      setup: [],
      gates: [{ id: "test", command: "bun test" }],
      baseGates: {
        commit: "feedfacecafebeef",
        ok: false,
        checks: [
          {
            name: "lint",
            ok: false,
            summary: "exit 1",
            output: "2 errors",
            fingerprint: "f",
          },
        ],
      },
      forwarded: [
        {
          source: "a review r1",
          calibration: "architect",
          kind: "risk",
          text: "watch it",
        },
      ],
      debts: [],
    };
    const first = renderContextPack(input);
    const second = renderContextPack(input);
    expect(first).toBe(second);
    expect(first).toContain("| b | parked |");
    expect(first).toContain("round limit");
    expect(first).toContain("abcdef1234");
    expect(first).toContain("bun test");
    expect(first).toContain("iterations/2/digest.md");
    expect(first).toContain("src/kernel/ — 8 files");
    expect(first).toContain("base feedfaceca was red before any task");
    expect(first).toContain("lint: exit 1");
  });

  it("names every pointer and never cuts the status table with many tasks", () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      task(`bulk-${String(i).padStart(3, "0")}`, {
        deps: i === 0 ? [] : [`bulk-${String(i - 1).padStart(3, "0")}`],
      }),
    );
    const pack = renderContextPack({
      goal: "demo",
      iteration: 4,
      intentPath: "/goal/intent.md",
      planPath: "/goal/plan.md",
      checkout: "/wt/demo",
      integrationBranch: "factory/demo",
      headHash: "abcdef1234567890",
      recordsDir: "/goal/records",
      tasksDir: "/goal/tasks",
      previousSummary: "/goal/iterations/3/summary.md",
      digestPath: "/goal/iterations/4/digest.md",
      runConfigPath: "/repo/bootstrap/run/self-quota.yaml",
      openRecords: [
        "/goal/records/00007-i4-bulk-003-implement-r1",
        "/goal/records/00008-i4-bulk-004-implement-r1",
      ],
      tasks: many,
      state: derive(many, []),
      codeMap: shallowCodeMap(
        Array.from({ length: 200 }, (_, i) => `src/mod${i % 12}/file${i}.ts`),
      ),
      steers: [
        {
          id: "steer-i20-wiring-gap",
          file: "steer-i20-wiring-gap.md",
          relPath: "mailbox/inbox/steer-i20-wiring-gap.md",
          text: "name the run config",
          hash: "abc123",
          urgent: false,
        },
      ],
      setup: ["bun install"],
      gates: [{ id: "test", command: "bun test" }],
      forwarded: [
        {
          source: "bulk-003 review r1",
          calibration: "architect",
          kind: "debt",
          text: "retry window drops head names",
          evidence: "src/kernel/baseline.ts:175",
        },
        {
          source: "bulk-004 review r1",
          calibration: "architect",
          kind: "risk",
          text: "flaky gate on macOS",
        },
      ],
      debts: [],
    });
    // Past the old 8000-byte cap: the retired tail cut would have eaten the table.
    expect(Buffer.byteLength(pack, "utf8")).toBeGreaterThan(8000);
    expect(pack).toContain("- plan (architect edits this): /goal/plan.md");
    expect(pack).toContain("- intent: /goal/intent.md");
    expect(pack).toContain("iterations/4/digest.md");
    expect(pack).toContain("## Debt register");
    expect(pack).toContain("retry window drops head names");
    expect(pack).toContain("## Open records");
    expect(pack).toContain("00007-i4-bulk-003-implement-r1");
    expect(pack).toContain("/wt/demo (branch factory/demo");
    expect(pack).toContain("run config: /repo/bootstrap/run/self-quota.yaml");
    expect(pack).toContain("steer-i20-wiring-gap");
    for (const t of many) expect(pack).toContain(`| ${t.slug} |`);
    expect(pack).toContain("| bulk-119 |");
    expect(pack).toContain("src/mod0/ — 17 files");
  });

  it("deduplicates forwarded concerns by fingerprint and drops fyi", () => {
    const concern = (
      calibration: "fyi" | "architect" | "owner",
      text: string,
    ) => ({
      kind: "risk" as const,
      calibration,
      text,
      evidence: "src/x.ts:1",
    });
    const records = [
      rec(1, {
        step: "review",
        outcome: {
          status: "done",
          summary: "r1",
          concerns: [
            concern("architect", "The migration can lose writes"),
            concern("fyi", "naming nit"),
          ],
          forward: ["Do the small thing first"],
        },
      }),
      rec(2, {
        slug: "b",
        step: "review",
        outcome: {
          status: "done",
          summary: "r2",
          concerns: [
            concern("architect", "The migration can lose writes"),
            concern("owner", "The migration can lose writes"),
          ],
          forward: [],
        },
      }),
    ];
    const forwarded = forwardedConcerns(records);
    const risk = forwarded.find((c) => c.kind === "risk");
    expect(risk?.calibration).toBe("owner");
    expect(risk?.occurrences).toBe(3);
    expect(forwarded.some((c) => c.text === "naming nit")).toBe(false);
    expect(forwarded.find((c) => c.kind === "forward")?.text).toBe(
      "Do the small thing first",
    );
  });

  it("forwards every concern, past the old twenty-line cap", () => {
    const records = Array.from({ length: 25 }, (_, i) =>
      rec(i + 1, {
        step: "review",
        outcome: {
          status: "done",
          summary: `r${i + 1}`,
          concerns: [
            {
              kind: "risk" as const,
              calibration: "architect" as const,
              text: `distinct risk ${i + 1}`,
            },
          ],
          forward: [],
          verdict: "approve",
        },
      }),
    );
    const forwarded = forwardedConcerns(records);
    expect(forwarded).toHaveLength(25);
    expect(forwarded[0]!.text).toBe("distinct risk 1");
  });

  it("lists every open debt with its id and drops the closed one", () => {
    const debtRecord = (seq: number, text: string, id: string) =>
      rec(seq, {
        step: "review",
        outcome: {
          status: "done",
          summary: `r${seq}`,
          concerns: [
            {
              kind: "debt" as const,
              calibration:
                seq % 2 === 0 ? ("fyi" as const) : ("architect" as const),
              text,
              id,
            },
          ],
          forward: [],
          verdict: "approve",
        },
      });
    // 25 debts, past the old `slice(-20)` cap, plus one retired by id.
    const records = [
      ...Array.from({ length: 25 }, (_, i) =>
        debtRecord(
          i + 1,
          `debt number ${i + 1} needs a follow-up`,
          `00${String(i + 1).padStart(3, "0")}#1`,
        ),
      ),
      debtRecord(26, "retired shim", "00026#1"),
      rec(27, {
        slug: undefined,
        step: "architect",
        outcome: {
          status: "done",
          summary: "closed the shim",
          concerns: [],
          forward: [],
          debtClosed: [{ id: "00026#1", reason: "shim removed" }],
          decision: "continue",
        },
      }),
    ];
    const debts = openDebts(records);
    expect(debts).toHaveLength(25);
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
      tasks,
      state: derive(tasks, records),
      steers: [],
      setup: [],
      gates: [],
      forwarded: forwardedConcerns(records),
      debts,
    });
    const register = pack.slice(pack.indexOf("## Debt register"));
    expect(register).toContain("own one by citing its id in a plan bullet");
    expect(register).toContain("`debtClosed: [{id, reason}]`");
    for (const debt of debts) {
      expect(register).toContain(
        `${debt.id} [${debt.calibration}] ${debt.text}`,
      );
    }
    expect(register).not.toContain("retired shim");
    expect(register).not.toContain("00026#1");
  });

  it("keeps every task and review debt listed until a plan bullet owns it or a forward closes it", () => {
    const taskDebt = {
      id: "00010-i1-a-implement-r1#1",
      text: "env allowlist v2 is dead config and needs a removal task",
    };
    const reviewDebt = {
      id: "00011-i1-a-review-r1#1",
      text: "quota reset text parsing duplicates the provider table",
    };
    const records = [
      rec(1, {
        step: "implement",
        outcome: {
          status: "done",
          summary: "shipped with a shim",
          concerns: [
            {
              kind: "debt" as const,
              calibration: "architect" as const,
              text: taskDebt.text,
              id: taskDebt.id,
            },
          ],
          forward: [],
        },
      }),
      rec(2, {
        step: "review",
        outcome: {
          status: "done",
          summary: "approved with debt",
          concerns: [
            {
              kind: "debt" as const,
              calibration: "architect" as const,
              text: reviewDebt.text,
              id: reviewDebt.id,
            },
          ],
          forward: [],
          verdict: "approve",
        },
      }),
    ];
    const registerFor = (debts: ReturnType<typeof openDebts>): string => {
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
        tasks,
        state: derive(tasks, records),
        steers: [],
        setup: [],
        gates: [],
        forwarded: forwardedConcerns(records),
        debts,
      });
      return pack.slice(pack.indexOf("## Debt register"));
    };

    const open = openDebts(records);
    expect(open.map((debt) => debt.id)).toEqual([taskDebt.id, reviewDebt.id]);
    const listed = registerFor(open);
    expect(listed).toContain(`${taskDebt.id} [architect] ${taskDebt.text}`);
    expect(listed).toContain(`${reviewDebt.id} [architect] ${reviewDebt.text}`);

    const ownById = `- env-allowlist-v2 — Remove the dead allowlist (${taskDebt.id})`;
    const owned = openDebts(records, ownById);
    expect(owned.map((debt) => debt.id)).toEqual([reviewDebt.id]);
    const ownedRegister = registerFor(owned);
    expect(ownedRegister).not.toContain(taskDebt.id);
    expect(ownedRegister).toContain(reviewDebt.id);

    const ownByText = `- env-allowlist-v2 — ${taskDebt.text}`;
    expect(openDebts(records, ownByText).map((debt) => debt.id)).toEqual([
      reviewDebt.id,
    ]);

    const closedRecords = [
      ...records,
      rec(3, {
        slug: undefined,
        step: "architect",
        outcome: {
          status: "done",
          summary: "closed the table duplicate",
          concerns: [],
          forward: [`debt closed: ${reviewDebt.text}`],
          decision: "continue",
        },
      }),
    ];
    const closed = openDebts(closedRecords, ownById);
    expect(closed).toEqual([]);
    expect(registerFor(closed)).toContain("- none open");

    // Ownership is the current plan's, not a recorded claim: dropping the
    // bullet returns the debt to the register, while the forwarded close stays.
    expect(
      openDebts(closedRecords, "- later — nothing filed yet").map(
        (debt) => debt.id,
      ),
    ).toEqual([taskDebt.id]);
  });

  it("groups a repository listing into a shallow path index", () => {
    expect(
      shallowCodeMap([
        "src/kernel/boundary.ts",
        "src/kernel/pm.ts",
        "src/harness/types.ts",
        "package.json",
        ".gitignore",
        "node_modules/x/index.js",
      ]),
    ).toEqual([
      "(root) — 2 files",
      "src/harness/ — 1 file",
      "src/kernel/ — 2 files",
    ]);
  });

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
});
