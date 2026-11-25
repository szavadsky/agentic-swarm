import { describe, expect, it } from "bun:test";
import {
  type ContextPackInput,
  forwardedConcerns,
  renderContextData,
  renderContextPack,
  shallowCodeMap,
} from "../../src/kernel/context-pack.js";
import { PACK_SECTIONS } from "../../src/kernel/context-pack/sections.js";
import { derive } from "../../src/kernel/derive.js";
import { rec, script, task, cause } from "./helpers.js";

const tasks = [task("a"), task("b", { deps: ["a"] })];

function rendersIdenticalBytesIdenticalPart1() {
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
    script(2, {
      step: "park",
      ok: true,
      cause: cause("round limit"),
      slug: "b",
    }),
  ];

  return { records };
}

function rendersIdenticalBytesIdenticalPart2(
  scope: ReturnType<typeof rendersIdenticalBytesIdenticalPart1>,
) {
  const { records } = scope;
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
        id: "c-watchit",
        source: "a review r1",
        calibration: "architect",
        kind: "risk",
        text: "watch it",
      },
    ],
    debts: [],
  };
  const first = renderContextPack(input);

  return { ...scope, input, first };
}

function rendersIdenticalBytesIdenticalPart3(
  scope: ReturnType<typeof rendersIdenticalBytesIdenticalPart2>,
) {
  const { input, first } = scope;
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
}

function registerContextPackPart1(): void {
  it("renders identical bytes for identical derived state", () => {
    const scope1 = rendersIdenticalBytesIdenticalPart1();
    const scope2 = rendersIdenticalBytesIdenticalPart2(scope1);
    rendersIdenticalBytesIdenticalPart3(scope2);
  });
}

function bulkChainTasks() {
  return Array.from({ length: 120 }, (_, i) =>
    task(`bulk-${String(i).padStart(3, "0")}`, {
      deps: i === 0 ? [] : [`bulk-${String(i - 1).padStart(3, "0")}`],
    }),
  );
}

function bulkPointerPathsFragment() {
  return {
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
  };
}

function bulkPointerMailFragment() {
  return {
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
        id: "c-bulk003",
        source: "bulk-003 review r1",
        calibration: "architect",
        kind: "debt",
        text: "retry window drops head names",
        evidence: "src/kernel/baseline.ts:175",
      },
      {
        id: "c-bulk004",
        source: "bulk-004 review r1",
        calibration: "architect",
        kind: "risk",
        text: "flaky gate on macOS",
      },
    ],
    debts: [],
  };
}

function renderBulkPointerPack(many: ReturnType<typeof task>[]): string {
  return renderContextPack({
    ...bulkPointerPathsFragment(),
    tasks: many,
    state: derive(many, []),
    codeMap: shallowCodeMap(
      Array.from({ length: 200 }, (_, i) => `src/mod${i % 12}/file${i}.ts`),
    ),
    ...bulkPointerMailFragment(),
  });
}

function assertBulkPointerPack(
  pack: string,
  many: ReturnType<typeof task>[],
): void {
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
}

function registerContextPackPart2(): void {
  it("names every pointer and never cuts the status table with many tasks", () => {
    const many = bulkChainTasks();
    assertBulkPointerPack(renderBulkPointerPack(many), many);
  });
}

function contextDataPathsFragment() {
  return {
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
  };
}

function contextDataSteersFragment() {
  return {
    steers: [
      {
        id: "s1",
        file: "s1.md",
        relPath: "mailbox/inbox/s1.md",
        text: "keep the API",
        hash: "abc",
        urgent: true,
      },
      {
        id: "s2",
        file: "s2.md",
        relPath: "mailbox/inbox/s2.md",
        text: "hold the area",
        hash: "def",
        urgent: false,
      },
    ],
    holds: [
      { steer: "s1", slugs: [], goal: true },
      { steer: "s2", slugs: ["bulk-050"], goal: false },
    ],
    setup: ["bun install"],
    gates: [{ id: "test", command: "bun test" }],
    forwarded: [],
    debts: [],
  };
}

function bulkContextDataRecords() {
  return [
    script(1, {
      step: "park",
      slug: "bulk-003",
      cause: cause("round limit"),
    }),
  ];
}

function renderBulkContextData(
  many: ReturnType<typeof task>[],
  records: ReturnType<typeof rec>[],
  codeMap: ReturnType<typeof shallowCodeMap>,
): string {
  return renderContextData({
    ...contextDataPathsFragment(),
    tasks: many,
    state: derive(many, records),
    codeMap,
    ...contextDataSteersFragment(),
  });
}

function registerContextPackPart3(): void {
  it("writes every derived fact as data, with no code-map cap", () => {
    const many = bulkChainTasks();
    const codeMap = shallowCodeMap(
      Array.from({ length: 60 }, (_, i) => `mod${i}/file${i}.ts`),
    );
    expect(codeMap).toHaveLength(60);
    const records = bulkContextDataRecords();
    const data = JSON.parse(renderBulkContextData(many, records, codeMap));
    expect(data.tasks).toHaveLength(120);
    expect(data.tasks.at(-1)).toMatchObject({
      slug: "bulk-119",
      status: "pending",
    });
    expect(data.parked).toEqual([
      { slug: "bulk-003", cause: cause("round limit") },
    ]);
    expect(data.codeMap).toEqual(codeMap);
    expect(data.codeMap.join("\n")).not.toContain("more groups");
    expect(data.paths.plan).toBe("/goal/plan.md");
    expect(data.paths.runConfig).toBe("/repo/bootstrap/run/self-quota.yaml");
    expect(data.steers).toEqual([
      { id: "s1", path: "mailbox/inbox/s1.md", urgent: true, holds: "goal" },
      {
        id: "s2",
        path: "mailbox/inbox/s2.md",
        urgent: false,
        holds: ["bulk-050"],
      },
    ]);
    expect(data.infra).toEqual({
      setup: ["bun install"],
      gates: [{ id: "test", command: "bun test" }],
    });
  });
}

function registerContextPackPart4(): void {
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
}

function registerContextPackPart5(): void {
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
}

function registerContextPackPart6(): void {
  it("renders files without a slash and splits a large package by subdirectory", () => {
    const map = shallowCodeMap([
      "package.json",
      "src/main.ts",
      ...Array.from({ length: 24 }, (_, i) => `plugins/big/src/f${i}.ts`),
      "plugins/big/test/one.test.ts",
      "plugins/big/package.json",
      "plugins/small/src/a.ts",
      "plugins/small/src/b.ts",
    ]);
    expect(map).toEqual([
      "(root) — 1 file",
      "plugins/big/package.json",
      "plugins/big/src/ — 24 files",
      "plugins/big/test/ — 1 file",
      "plugins/small/ — 2 files",
      "src/main.ts",
    ]);
  });
}

function briefPackInput(): ContextPackInput {
  return {
    goal: "briefs",
    iteration: 2,
    intentPath: "/goal/intent.md",
    planPath: "/goal/plan.md",
    checkout: "/wt/briefs",
    integrationBranch: "factory/briefs",
    headHash: "abcdef1234567890",
    recordsDir: "/goal/records",
    tasksDir: "/goal/tasks",
    dataPath: "/goal/iterations/2/context-data.json",
    tasks,
    state: derive(tasks, []),
    steers: [],
    setup: [],
    gates: [],
    forwarded: [],
    debts: [],
    planCheck: {
      iteration: 1,
      verdict: "architect",
      evidence: [{ item: "a", status: "missing", evidence: "no task file" }],
    },
  };
}

function registerPackBriefs(): void {
  it("points every briefable section at a key the status data carries", () => {
    const data = JSON.parse(renderContextData(briefPackInput())) as Record<
      string,
      unknown
    >;
    for (const section of PACK_SECTIONS) {
      expect(Object.hasOwn(data, section)).toBe(true);
    }
  });

  it("keeps a brief on one line so it cannot break the index", () => {
    const pack = renderContextPack({
      ...briefPackInput(),
      briefs: [
        { section: "planCheck", summary: "first line\n## Fake heading" },
      ],
    });
    expect(pack.split("\n")).not.toContain("## Fake heading");
    expect(pack).toContain("- first line ## Fake heading");
  });
}

describe("context pack", () => {
  registerContextPackPart1();

  registerContextPackPart2();

  registerContextPackPart3();

  registerContextPackPart4();

  registerContextPackPart5();

  registerContextPackPart6();

  registerPackBriefs();
});
