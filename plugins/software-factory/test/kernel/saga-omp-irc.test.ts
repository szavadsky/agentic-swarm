// biome-ignore-all lint/complexity: saga steer scenario
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import type { Caps, LiveAgents } from "../../src/harness/types.js";
import {
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
  type FakeTurnHandler,
} from "../../src/harness/fake/index.js";
import { subarchitectDelivery } from "../../src/kernel/hierarchy.js";
import { createFolderStore } from "../../src/kernel/store.js";
import {
  cleanup,
  expectLaunch,
  makeGoal,
  outcome,
  stateOf,
} from "./e2e-helpers.js";

const PROCESS = "hierarchy:\n  depth: 2\n";

const GOAL_PLAN = `# Milestone 1

## Architect register

- epic \`alpha\` | architect \`subarchitect\` | plan \`epics/alpha.md\` | scope \`alpha.txt\` | opened i1 | active
- epic \`beta\` | architect \`subarchitect\` | plan \`epics/beta.md\` | scope \`beta.txt\` | opened i1 | active
`;

const ALPHA_PLAN = `# Epic alpha

## Milestone 1

- \`alpha.build\` — create alpha.txt.
  - done: alpha.txt exists.
`;

const BETA_PLAN = `# Epic beta

## Milestone 1

- \`beta.build\` — create beta.txt.
  - done: beta.txt exists.
`;

function epicTask(slug: string, epic: string, file: string): string {
  return [
    "---",
    `slug: ${slug}`,
    `title: Create ${file}`,
    "kind: development",
    "flow: implement-review",
    "deps: []",
    `scope: [${file}]`,
    `epic: ${epic}`,
    "source: plan",
    "---",
    "",
    `Create ${file}.`,
    "",
    `Done when: ${file} exists.`,
    "",
  ].join("\n");
}

function implementer(file: string): FakeTurnHandler {
  return (req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, file), `${file}\n`, "utf8");
    ctx.writeOutcome(outcome({ summary: `${file} created` }));
    return fakeTurnResult(req);
  };
}

function approver(summary: string): FakeTurnHandler {
  return (req, ctx) => {
    ctx.writeOutcome(outcome({ summary, verdict: "approve" }));
    return fakeTurnResult(req);
  };
}

function recordOf(req: Parameters<FakeTurnHandler>[0]): string {
  return fakeTurnIdentity(req).record;
}

/** The outcome path a steered consult names. */
function steeredOutcome(prompt: string): string {
  const match = /- outcome path: `([^`]+)`/.exec(prompt);
  if (!match?.[1]) throw new Error("steered consult names no outcome path");
  return match[1];
}

describe("subarchitect delivery strategy", () => {
  it("selects steer only where the harness advertises it", async () => {
    const model = { id: "fake-model" };
    const steer = new FakeHarness({ caps: { subagents: "steer" } });
    const spawn = new FakeHarness({ caps: { subagents: "spawn" } });
    const none = new FakeHarness({ caps: { subagents: "none" } });
    expect(await subarchitectDelivery({ harness: steer, model })).toBe("steer");
    expect(await subarchitectDelivery({ harness: spawn, model })).toBe(
      "report",
    );
    expect(await subarchitectDelivery({ harness: none, model })).toBe("report");
  });

  it("keeps the written report when the capability probe fails", async () => {
    class BrokenCaps extends FakeHarness {
      override async caps(): Promise<Caps> {
        throw new Error("probe failed");
      }
    }
    expect(
      await subarchitectDelivery({
        harness: new BrokenCaps(),
        model: { id: "fake-model" },
      }),
    ).toBe("report");
  });

  it("steers an epic's consult into the architect's live session", async () => {
    const goal = makeGoal({ processYaml: PROCESS });
    try {
      const planPath = goal.planPath;
      const alphaPlan = path.join(goal.goalDir, "epics/alpha.md");
      const betaPlan = path.join(goal.goalDir, "epics/beta.md");
      const childFile = path.join(goal.goalDir, "sessions", "epic-beta.jsonl");
      let childLive = false;
      let polls = 0;
      let childSteer: ((id: string, message: string) => void) | undefined;
      const steers: Array<{ id: string; message: string }> = [];
      const live: LiveAgents = {
        // The first poll answers before the child is admitted, so the monitor
        // exercises the retry the probe saw ("Subagent not running").
        list: async () => {
          polls += 1;
          return childLive && polls > 1
            ? [
                {
                  id: "epic-beta",
                  agent: "subarchitect",
                  status: "running",
                  sessionFile: childFile,
                },
              ]
            : [];
        },
        steer: async (id, message) => {
          if (!childLive) throw new Error(`Subagent not running: ${id}`);
          steers.push({ id, message });
          childSteer?.(id, message);
        },
      };
      const harness = new FakeHarness({
        id: "fake",
        caps: { subagents: "steer" },
        live: () => live,
      });

      // Iteration 1: the register, both epic plans, both tasks, merges.
      harness.script(
        (req, ctx) => {
          expect(req.prompt).toContain("## Architect register");
          fs.writeFileSync(planPath, GOAL_PLAN, "utf8");
          ctx.writeOutcome(
            outcome({ summary: "split into two epics", decision: "continue" }),
          );
          return fakeTurnResult(req);
        },
        { when: (req) => recordOf(req).includes("-i1-architect-") },
      );
      harness.script(
        (req, ctx) => {
          expect(req.onLive).toBeUndefined();
          expect(req.prompt).not.toContain("## Subarchitects in this session");
          fs.mkdirSync(path.dirname(alphaPlan), { recursive: true });
          fs.writeFileSync(alphaPlan, ALPHA_PLAN, "utf8");
          ctx.writeOutcome(
            outcome({ summary: "epic alpha planned", decision: "done" }),
          );
          return fakeTurnResult(req);
        },
        { when: (req) => req.prompt.includes("- epic: `alpha`") },
      );
      harness.script(
        (req, ctx) => {
          fs.mkdirSync(path.dirname(betaPlan), { recursive: true });
          fs.writeFileSync(betaPlan, BETA_PLAN, "utf8");
          ctx.writeOutcome(
            outcome({ summary: "epic beta planned", decision: "continue" }),
          );
          return fakeTurnResult(req);
        },
        { when: (req) => req.prompt.includes("- epic: `beta`") },
      );
      harness.script(
        (req, ctx) => {
          fs.mkdirSync(goal.tasksDir, { recursive: true });
          fs.writeFileSync(
            path.join(goal.tasksDir, "alpha.build.md"),
            epicTask("alpha.build", "alpha", "alpha.txt"),
            "utf8",
          );
          fs.writeFileSync(
            path.join(goal.tasksDir, "beta.build.md"),
            epicTask("beta.build", "beta", "beta.txt"),
            "utf8",
          );
          ctx.writeOutcome(outcome({ summary: "filed both tasks" }));
          return fakeTurnResult(req);
        },
        { when: (req) => recordOf(req).includes("-i1-pm-") },
      );
      for (const [slug, file] of [
        ["alpha.build", "alpha.txt"],
        ["beta.build", "beta.txt"],
      ] as const) {
        harness.script(implementer(file), {
          when: (req) =>
            fakeTurnIdentity(req).slug === slug &&
            fakeTurnIdentity(req).step === "implement",
        });
        harness.script(approver(`${slug} is correct`), {
          when: (req) =>
            fakeTurnIdentity(req).slug === slug &&
            fakeTurnIdentity(req).step === "review",
        });
      }

      // Iteration 2: alpha is done and left out; beta is steered as a live
      // child. The architect also writes alpha's plan, a foreign write.
      harness.script(
        (req, ctx) => {
          expect(req.prompt).toContain("## Subarchitects in this session");
          expect(req.prompt).toContain("- epic `beta`");
          expect(req.prompt).toContain("write agent://");
          expect(req.onLive).toBeDefined();
          if (Array.isArray((req.opaque as any)?.agents)) {
            expect((req.opaque as any).agents[0].name).toBe("subarchitect");
          } else {
            throw new Error("architect turn carried no agent definitions");
          }
          fs.appendFileSync(planPath, "\n## Milestone 2\n- hold.\n", "utf8");
          fs.appendFileSync(alphaPlan, "\nforeign main write\n", "utf8");
          childLive = true;
          ctx.writeOutcome(
            outcome({ summary: "direction holds", decision: "continue" }),
          );
          return fakeTurnResult(req);
        },
        { when: (req) => recordOf(req).includes("-i2-architect-") },
      );
      // The script's steer is the consult; the child answers it by editing its
      // plan and writing its outcome.
      childSteer = (_id, message) => {
        const outcomePath = steeredOutcome(message);
        fs.appendFileSync(
          betaPlan,
          "\n## Milestone 2\n- child review.\n",
          "utf8",
        );
        fs.mkdirSync(path.dirname(outcomePath), { recursive: true });
        fs.writeFileSync(
          outcomePath,
          JSON.stringify({
            status: "done",
            summary: "epic beta reviewed live",
            concerns: [],
            forward: [],
            decision: "continue",
          }),
          "utf8",
        );
      };
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(outcome({ summary: "no new tasks" }));
          return fakeTurnResult(req);
        },
        { when: (req) => recordOf(req).includes("-i2-pm-") },
      );

      // The child is live from the start of iteration 2's architect turn; the
      // monitor's first registry poll steers it without waiting for a spawn.
      childLive = true;
      await expectLaunch(3, goal.repo, harness, 2);

      // The child's consult ran over IRC, not as a written-report turn.
      expect(steers.map((steer) => steer.id)).toEqual(["epic-beta"]);
      expect(
        harness.calls.some((call) =>
          recordOf(call).includes("-i2-subarchitect-"),
        ),
      ).toBe(false);
      expect(
        harness.calls.some(
          (call) =>
            recordOf(call).includes("-i2-planreview-") &&
            call.prompt.includes("epics/beta.md"),
        ),
      ).toBe(true);
      expect(harness.compactions.map((ref) => ref.id)).toContain(childFile);
      expect(fs.readFileSync(alphaPlan, "utf8")).not.toContain(
        "foreign main write",
      );
      expect(fs.readFileSync(betaPlan, "utf8")).toContain("child review");

      const store = createFolderStore(goal.goalDir, undefined, {});
      const records = await store.listRecords();
      const betaConsult = records.find(
        (record) =>
          record.iteration === 2 &&
          record.step === "subarchitect" &&
          record.architect === "beta",
      );
      expect(betaConsult?.outcome?.summary).toBe("epic beta reviewed live");
      expect(betaConsult?.session?.id).toBe(childFile);
      expect(betaConsult?.session?.compacted).toBe(true);
      expect(
        records.some(
          (record) =>
            record.iteration === 2 &&
            record.step === "subarchitect" &&
            record.architect === "alpha",
        ),
      ).toBe(false);
      expect(
        fs.readFileSync(
          path.join(goal.goalDir, "iterations/2/epics/beta/summary.md"),
          "utf8",
        ),
      ).toContain("epic beta reviewed live");
      const state = await stateOf(goal.goalDir);
      expect(state.tasks["alpha.build"]?.status).toBe("merged");
      expect(state.tasks["beta.build"]?.status).toBe("merged");
    } finally {
      cleanup(goal);
    }
  }, 30_000);
});
