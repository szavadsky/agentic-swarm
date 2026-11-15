import { describe, expect, it } from "bun:test";
import {
  forwardedConcerns,
  renderContextPack,
  shallowCodeMap,
} from "../../src/kernel/context-pack.js";
import { derive } from "../../src/kernel/derive.js";
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
});
