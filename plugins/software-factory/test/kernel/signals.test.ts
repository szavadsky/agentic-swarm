// biome-ignore-all lint/complexity/noExcessiveLinesPerFunction: split-rest-functions
import { describe, expect, it } from "bun:test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { expectDispatch } from "./e2e-helpers.js";
import type { FakeTurnContext } from "../../src/harness/fake/index.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import type { TurnRequest } from "../../src/harness/types.js";
import { createDrainController } from "../../src/kernel/signals.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { workCalls } from "./fake-defaults.js";

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
    let recordedGrace: number | undefined;
    const controller = createDrainController(async (graceMs) => {
      recordedGrace = graceMs;
    });
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
      expect(recordedGrace).toBe(500);

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

      await expectDispatch(
        130,
        ["run", "--repo", s.repo.dir, "--goal", "demo"],
        {
          harnesses: { fake: harness },
          signals: controller,
        },
      );
      expect(workCalls(harness)).toHaveLength(2);

      const store = createFolderStore(s.goalDir, undefined, {});
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
    const controller = createDrainController(() => Promise.resolve());
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

      await expectDispatch(
        143,
        ["run", "--repo", s.repo.dir, "--goal", "demo"],
        {
          harnesses: { fake: harness },
          signals: controller,
        },
      );

      const store = createFolderStore(s.goalDir, undefined, {});
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

  it("a real second SIGINT in a launch still kills every registered group", async () => {
    const shutdownPath = path.resolve(__dirname, "../../src/core/shutdown.ts");
    const signalsPath = path.resolve(__dirname, "../../src/kernel/signals.ts");

    const childCode = `
import { spawn } from "node:child_process";
import { registerChildGroup } from ${JSON.stringify(shutdownPath)};
import { createDrainController } from ${JSON.stringify(signalsPath)};

const target1 = spawn("sleep", ["30"], { detached: true });
const target2 = spawn("sleep", ["30"], { detached: true });
if (!target1.pid || !target2.pid) process.exit(1);
registerChildGroup(target1.pid);
registerChildGroup(target2.pid);

// Default createDrainController uses terminateAllChildGroups
const controller = createDrainController();
controller.handleSignal("SIGINT");
controller.handleSignal("SIGINT");

// Wait for grace period and SIGKILL to land
await new Promise((r) => setTimeout(r, 800));

let alive1 = true;
try {
  process.kill(target1.pid, 0);
} catch {
  alive1 = false;
}

let alive2 = true;
try {
  process.kill(target2.pid, 0);
} catch {
  alive2 = false;
}

if (alive1 || alive2) {
  try { if (target1.pid) process.kill(target1.pid, "SIGKILL"); } catch {}
  try { if (target2.pid) process.kill(target2.pid, "SIGKILL"); } catch {}
  process.exit(2);
}
process.exit(0);
`;

    const res = await new Promise<{ exitCode: number }>((resolve, reject) => {
      const cp = spawn("bun", ["-e", childCode], {
        stdio: "inherit",
      });
      cp.on("error", reject);
      cp.on("exit", (code) => resolve({ exitCode: code ?? 1 }));
    });

    expect(res.exitCode).toBe(0);
  });
});
