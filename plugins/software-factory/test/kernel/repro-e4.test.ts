import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { dispatch } from "../../src/cli/dispatch.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { createDrainController } from "../../src/kernel/signals.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";

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
      "  implementer: { harness: fake, model: fake-impl }",
      "  reviewer: { harness: fake, model: fake-review }",
      "limits: { iterations: 1, concurrency: 1 }",
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
  it("admits queued tasks after a first signal raised inside an in-flight turn", async () => {
    const s = setupRepo();
    const controller = createDrainController();
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(s.goalDir, "plan.md"), PLAN, "utf8");
        ctx.writeOutcome(outcome({ summary: "planned", decision: "continue" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        writeTasks(s.taskDir);
        ctx.writeOutcome(outcome({ summary: "filed" }));
        return fakeTurnResult(req);
      });

      let signalTurn: number | undefined;
      const implementStart: Array<{ slug: string; turn: number }> = [];
      for (let i = 0; i < 40; i += 1) {
        harness.script((req, ctx) => {
          const slug = path.basename(req.cwd!);
          if (req.prompt.startsWith("You review")) {
            ctx.writeOutcome(
              outcome({ summary: `${slug} approved`, verdict: "approve" }),
            );
          } else {
            implementStart.push({ slug, turn: harness.calls.length });
            if (signalTurn === undefined) {
              signalTurn = harness.calls.length;
              controller.handleSignal("SIGINT");
            }
            fs.writeFileSync(
              path.join(req.cwd!, `${slug}.txt`),
              `${slug}\n`,
              "utf8",
            );
            ctx.writeOutcome(outcome({ summary: `${slug} implemented` }));
          }
          return fakeTurnResult(req);
        });
      }

      await dispatch(["run", "--repo", s.repo.dir, "--goal", "demo"], {
        harnesses: { fake: harness },
        signals: controller,
      });

      const afterSignal = implementStart.filter((e) => e.turn > signalTurn!);
      const furtherTasks = [...new Set(afterSignal.map((e) => e.slug))];

      expect(controller.draining).toBe(true);
      expect(furtherTasks).toEqual([]);
    } finally {
      console.warn = originalWarn;
      s.repo.cleanup();
    }
  }, 120_000);
});
