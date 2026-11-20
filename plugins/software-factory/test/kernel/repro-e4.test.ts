// biome-ignore-all lint/complexity: split-rest
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { dispatch } from "../../src/cli/dispatch.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { createDrainController } from "../../src/kernel/signals.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { whenTurn } from "./s2-helpers.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { testPriceSource } from "../helpers/price-source.js";

const PLAN =
  "# Plan\n\n## alpha\nCreate alpha.txt.\n\n## beta\nCreate beta.txt.\n\n## gamma\nCreate gamma.txt.\n\n## delta\nCreate delta.txt.\n";
const SLUGS = ["alpha", "beta", "gamma", "delta"];

function outcome(value: Record<string, unknown>) {
  return { status: "done", summary: "ok", concerns: [], forward: [], ...value };
}

function setupRepo(): { repo: TmpRepo; goalDir: string; taskDir: string } {
  const repo = createTmpRepo();
  repo.writeFile(
    ".factory/repo.yaml",
    "baseBranch: main\nartifactRoot: .factory/artifacts\nsetup: []\ngates: []\n",
  );
  const base = path.basename(repo.dir);
  repo.writeFile(
    ".factory/run.yaml",
    [
      "aliases:",
      "  architect: { harness: fake, model: fake-architect }",
      "  pm: { harness: fake, model: fake-pm }",
      "  digest: { harness: fake, model: fake-digest }",
      "  implementer: { harness: fake, model: fake-impl }",
      "  implementer-b: { harness: fake, model: fake-impl-b }",
      "  researcher: { harness: fake, model: fake-research }",
      "  reviewer: { harness: fake, model: fake-review }",
      "  qa: { harness: fake, model: fake-qa }",
      "  steward: { harness: fake, model: fake-steward }",
      "  plan-checker: { harness: fake, model: fake-check }",
      "  intent: { harness: fake, model: fake-intent }",
      "  plan-reviewer: { harness: fake, model: fake-plan-review }",
      "  pack-preparer: { harness: fake, model: fake-pack-prep }",
      "limits: { iterations: 1, concurrency: { overall: 1 } }",
      `worktreeRoot: ../${base}-wt`,
      `sessions: { dir: ../${base}-sessions, keepRuns: 2 }`,
      "",
    ].join("\n"),
  );
  repo.commit("factory config");
  const goalDir = path.join(repo.dir, ".factory/artifacts/demo");
  fs.mkdirSync(path.join(goalDir, "tasks"), { recursive: true });
  fs.writeFileSync(
    path.join(goalDir, "intent.md"),
    "# Goal\n\nCreate four files.\n",
    "utf8",
  );
  fs.writeFileSync(path.join(goalDir, "class.yaml"), "class: bigger\n", "utf8");
  return { repo, goalDir, taskDir: path.join(goalDir, "tasks") };
}

function writeTasks(taskDir: string): void {
  for (const slug of SLUGS) {
    fs.writeFileSync(
      path.join(taskDir, `${slug}.md`),
      `---\nslug: ${slug}\ntitle: ${slug}\nscope: [${slug}.txt]\n---\nCreate ${slug}.txt.\n`,
      "utf8",
    );
  }
}

describe("repro E4: first signal does not stop dispatch admission", () => {
  it("drains after a first signal raised inside an in-flight implement turn", async () => {
    const s = setupRepo();
    const controller = createDrainController();
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      // Bind every harness turn by step: the plan flow gained plan-review and
      // PM turns, and a positional script queue would let one of them consume
      // the handler that raises the signal before dispatch ever runs.
      const harness = new FakeHarness({ id: "fake" });
      harness.script(
        (req, ctx) => {
          fs.writeFileSync(path.join(s.goalDir, "plan.md"), PLAN, "utf8");
          ctx.writeOutcome(
            outcome({ summary: "planned", decision: "continue" }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "architect" }) },
      );
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({
              summary: "plan reviewed",
              planReview: { technical: [], planNotes: [] },
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "planreview" }) },
      );
      harness.script(
        (req, ctx) => {
          writeTasks(s.taskDir);
          ctx.writeOutcome(outcome({ summary: "filed" }));
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "pm" }) },
      );

      // The default flow's QA acceptance needs a neutral handler; the test
      // scripts the implementer and reviewer it asserts on.
      harness.script(
        (_req, ctx) => {
          ctx.writeOutcome(
            outcome({ summary: "qa accepted", qa: { verdict: "accept" } }),
          );
          return fakeTurnResult(_req);
        },
        { when: whenTurn({ step: "qa" }), fallback: true },
      );

      const implemented: string[] = [];
      harness.script(
        (req, ctx) => {
          const slug = path.basename(req.cwd!);
          implemented.push(slug);
          if (!controller.draining) controller.handleSignal("SIGINT");
          fs.writeFileSync(
            path.join(req.cwd!, `${slug}.txt`),
            `${slug}\n`,
            "utf8",
          );
          ctx.writeOutcome(outcome({ summary: `${slug} implemented` }));
          return fakeTurnResult(req);
        },
        {
          when: whenTurn({ step: "implement" }),
          fallback: true,
        },
      );
      harness.script(
        (req, ctx) => {
          const slug = path.basename(req.cwd!);
          ctx.writeOutcome(
            outcome({ summary: `${slug} approved`, verdict: "approve" }),
          );
          return fakeTurnResult(req);
        },
        {
          when: whenTurn({ step: "review" }),
          fallback: true,
        },
      );

      await dispatch(["run", "--repo", s.repo.dir, "--goal", "demo"], {
        harnesses: { fake: harness },
        signals: controller,
        priceSource: testPriceSource(s.repo.dir),
      });

      expect(controller.draining).toBe(true);
      expect(implemented).toHaveLength(1);
      const inFlight = implemented[0]!;

      // The signaled turn finished and recorded: it was not cancelled, its
      // review ran, and its merge landed. No other task has a record.
      const store = createFolderStore(s.goalDir, undefined, {});
      const records = await store.listRecords();
      const ended = (step: string) =>
        records.find(
          (r) => r.slug === inFlight && r.step === step && r.endedAt,
        );
      expect(ended("implement")).toBeDefined();
      expect(ended("implement")?.stop?.kind).not.toBe("cancelled");
      expect(ended("review")).toBeDefined();
      expect(
        records.some(
          (r) => r.slug === inFlight && r.step === "merge" && r.ok === true,
        ),
      ).toBe(true);
      for (const slug of SLUGS.filter((slug) => slug !== inFlight)) {
        expect(records.filter((r) => r.slug === slug)).toEqual([]);
      }
    } finally {
      console.warn = originalWarn;
      s.repo.cleanup();
    }
  }, 120_000);
});
