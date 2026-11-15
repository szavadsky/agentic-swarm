import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { dispatch } from "../../src/cli/dispatch.js";
import type { FakeTurnContext } from "../../src/harness/fake/index.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import type { TurnRequest } from "../../src/harness/types.js";
import { createDrainController } from "../../src/kernel/signals.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";

const PLAN = "# Plan\n\n## alpha\nCreate alpha.txt.\n";

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
    "# Goal\n\nCreate alpha.\n",
    "utf8",
  );
  fs.writeFileSync(path.join(goalDir, "class.yaml"), "class: bigger\n", "utf8");
  return { repo, goalDir, taskDir: path.join(goalDir, "tasks") };
}

function architect(
  harness: FakeHarness,
  goalDir: string,
  effect: (req: TurnRequest, ctx: FakeTurnContext) => void,
): FakeHarness {
  return harness.script((req, ctx) => {
    fs.writeFileSync(path.join(goalDir, "plan.md"), PLAN, "utf8");
    effect(req, ctx);
    return fakeTurnResult(req);
  });
}

function captureWarn(): { lines: string[]; restore(): void } {
  const original = console.warn;
  const lines: string[] = [];
  console.warn = (...args: unknown[]) => lines.push(args.map(String).join(" "));
  return { lines, restore: () => (console.warn = original) };
}

describe("signal policy", () => {
  it("drains on the first signal and aborts on the second, without OS signals", () => {
    const warning = captureWarn();
    const controller = createDrainController();
    try {
      const before = process.listenerCount("SIGINT");
      const uninstall = controller.install();
      expect(process.listenerCount("SIGINT")).toBe(before + 1);
      expect(controller.draining).toBe(false);

      controller.handleSignal("SIGINT");
      expect(controller.draining).toBe(true);
      expect(controller.aborted).toBe(false);
      expect(controller.shouldStop()).toBe(true);
      expect(controller.interruptedBy).toBe("SIGINT");

      controller.handleSignal("SIGTERM");
      expect(controller.aborted).toBe(true);
      expect(controller.interruptedBy).toBe("SIGINT");

      uninstall();
      expect(process.listenerCount("SIGINT")).toBe(before);
      expect(warning.lines.join("\n")).toContain("draining");
      expect(warning.lines.join("\n")).toContain("aborting in-flight");
    } finally {
      warning.restore();
    }
  });

  it("stops dispatching after a drain request and writes the summary", async () => {
    const s = setupRepo();
    const controller = createDrainController();
    const warning = captureWarn();
    try {
      const harness = new FakeHarness({ id: "fake" });
      architect(harness, s.goalDir, (_req, ctx) => {
        controller.handleSignal("SIGINT");
        ctx.writeOutcome(outcome({ summary: "planned", decision: "continue" }));
      });
      harness.script((req, ctx) => {
        fs.writeFileSync(
          path.join(s.taskDir, "alpha.md"),
          "---\nslug: alpha\ntitle: A\nscope: [alpha.txt]\n---\nBody.\n",
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: "filed" }));
        return fakeTurnResult(req);
      });

      const code = await dispatch(
        ["run", "--repo", s.repo.dir, "--goal", "demo"],
        {
          harnesses: { fake: harness },
          signals: controller,
        },
      );
      expect(code).toBe(130);
      expect(harness.calls).toHaveLength(2);

      const store = createFolderStore(s.goalDir);
      const metrics = yaml.parse((await store.readFile("metrics.yaml"))!) as {
        iterations: Array<{ status: string }>;
      };
      expect(metrics.iterations[0]!.status).toBe("stopped-with-debt");
      expect(await store.readFile("iterations/1/summary.md")).toContain(
        "status: stopped-with-debt",
      );
    } finally {
      warning.restore();
      s.repo.cleanup();
    }
  }, 60_000);

  it("records the partial usage a cancelled turn returns", async () => {
    const s = setupRepo();
    const controller = createDrainController();
    const warning = captureWarn();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req) => {
        fs.writeFileSync(path.join(s.goalDir, "plan.md"), PLAN, "utf8");
        controller.handleSignal("SIGTERM");
        controller.handleSignal("SIGTERM");
        return fakeTurnResult(req, {
          stop: { kind: "cancelled" },
          usage: { in: 7, out: 3, costUsd: 0.01 },
        });
      });

      const code = await dispatch(
        ["run", "--repo", s.repo.dir, "--goal", "demo"],
        {
          harnesses: { fake: harness },
          signals: controller,
        },
      );
      expect(code).toBe(143);

      const store = createFolderStore(s.goalDir);
      const records = await store.listRecords();
      const interrupted = records.find((r) => r.step === "architect");
      expect(interrupted?.stop?.kind).toBe("cancelled");
      expect(interrupted?.usage).toMatchObject({
        in: 7,
        out: 3,
        costUsd: 0.01,
      });

      const metrics = yaml.parse((await store.readFile("metrics.yaml"))!) as {
        iterations: Array<{ tokens: number; usage: { costUsd: number } }>;
      };
      expect(metrics.iterations[0]!.tokens).toBe(10);
      expect(metrics.iterations[0]!.usage.costUsd).toBeCloseTo(0.01, 10);
    } finally {
      warning.restore();
      s.repo.cleanup();
    }
  }, 60_000);
});
