import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { dispatch } from "../../src/cli/dispatch.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { createFolderStore } from "../../src/kernel/store.js";

const PACKAGE_ROOT = path.resolve(import.meta.dir, "../..");

const PLAN = `# Milestone 1 — alpha

## alpha
Create alpha.txt.
Done when: alpha.txt exists.
`;

const ALPHA = `---
slug: alpha
title: Create alpha
kind: task
flow: implement-review
deps: []
scope: [alpha.txt]
source: Milestone 1 / alpha
---

Create alpha.txt.

Done when: alpha.txt exists.
`;

function outcome(value: Record<string, unknown>) {
  return { status: "done", summary: "ok", concerns: [], forward: [], ...value };
}

function runYaml(repo: TmpRepo): string {
  const base = path.basename(repo.dir);
  return [
    "aliases:",
    "  architect: { harness: fake, model: fake-architect }",
    "  pm: { harness: fake, model: fake-pm }",
    "  implementer: { harness: fake, model: fake-impl }",
    "  reviewer: { harness: fake, model: fake-review }",
    "limits: { iterations: 1, concurrency: 1 }",
    `worktreeRoot: ../${base}-wt`,
    `sessions: { dir: ../${base}-sessions, keepRuns: 2 }`,
    "",
  ].join("\n");
}

function inboxIds(goalDir: string): string[] {
  const dir = path.join(goalDir, "mailbox", "inbox");
  return fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((n) => !n.startsWith(".")).map((n) => path.basename(n, ".md"))
    : [];
}

async function capturedLog(fn: () => Promise<number>): Promise<{ code: number; out: string }> {
  const original = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => lines.push(args.map(String).join(" "));
  try {
    return { code: await fn(), out: lines.join("\n") };
  } finally {
    console.log = original;
  }
}

function alphaRun(goalDir: string, taskDir: string): FakeHarness {
  const harness = new FakeHarness({ id: "fake" });
  harness.script((req, ctx) => {
    const ids = inboxIds(goalDir);
    fs.writeFileSync(path.join(goalDir, "plan.md"), PLAN, "utf8");
    ctx.writeOutcome(
      outcome({
        summary: "planned alpha",
        decision: "continue",
        forward: ids.map((id) => `steer ${id}: acknowledged, keep alpha first`),
      })
    );
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(taskDir, "alpha.md"), ALPHA, "utf8");
    ctx.writeOutcome(outcome({ summary: "filed alpha" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "alpha added" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "alpha is correct", verdict: "approve" }));
    return fakeTurnResult(req);
  });
  return harness;
}

function doneHarness(): FakeHarness {
  const harness = new FakeHarness({ id: "fake" });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "goal met", decision: "done" }));
    return fakeTurnResult(req);
  });
  return harness;
}

describe("CLI end to end — init, steer, run, status", () => {
  it("initializes, steers, runs, reports and closes a goal with the fake harness", async () => {
    const repo = createTmpRepo();
    const base = path.basename(repo.dir);
    const intentSource = path.join(path.dirname(repo.dir), `${base}-intent.md`);
    const steerSource = path.join(path.dirname(repo.dir), `${base}-steer.md`);
    fs.writeFileSync(intentSource, "# Goal\n\nCreate alpha.txt.\n", "utf8");
    fs.writeFileSync(steerSource, "Please land alpha before anything else.\n", "utf8");
    try {
      expect(await dispatch(["init", "--repo", repo.dir, "--goal", "demo", "--intent", intentSource])).toBe(0);
      const repoConfig = yaml.parse(repo.readFile(".factory/repo.yaml"));
      expect(repoConfig.baseBranch).toBe("main");
      const goalDir = path.join(repo.dir, ".factory/artifacts/demo");
      expect(fs.readFileSync(path.join(goalDir, "intent.md"), "utf8")).toContain("Create alpha.txt");
      expect(fs.existsSync(path.join(goalDir, "tasks"))).toBe(true);
      expect(fs.existsSync(path.join(goalDir, "records"))).toBe(true);
      // This goal is a bigger one: the class file stands in for the front
      // consult, so the launch still reaches the architect boundary.
      fs.writeFileSync(path.join(goalDir, "class.yaml"), "class: bigger\n", "utf8");

      expect(await dispatch(["init", "--repo", repo.dir, "--goal", "demo", "--intent", intentSource])).toBe(0);
      const otherIntent = path.join(path.dirname(repo.dir), `${base}-other.md`);
      fs.writeFileSync(otherIntent, "# Other goal\n", "utf8");
      const originalError = console.error;
      const errors: string[] = [];
      console.error = (...args: unknown[]) => errors.push(args.map(String).join(" "));
      try {
        expect(await dispatch(["init", "--repo", repo.dir, "--goal", "demo", "--intent", otherIntent])).toBe(1);
      } finally {
        console.error = originalError;
      }
      expect(errors.join("\n")).toContain("intent already exists");
      expect(fs.readFileSync(path.join(goalDir, "intent.md"), "utf8")).toContain("Create alpha.txt");

      repo.writeFile(".factory/run.yaml", runYaml(repo));
      expect(await dispatch(["steer", "--repo", repo.dir, "--goal", "demo", steerSource])).toBe(0);
      expect(inboxIds(goalDir)).toHaveLength(1);
      const steerId = inboxIds(goalDir)[0]!;

      const taskDir = path.join(goalDir, "tasks");
      const run = await capturedLog(async () =>
        dispatch(["run", "--repo", repo.dir, "--goal", "demo"], { harnesses: { fake: alphaRun(goalDir, taskDir) } })
      );
      expect(run.code).toBe(3);
      expect(run.out).toContain("stop=iteration-limit");
      expect(fs.readdirSync(path.join(goalDir, "mailbox/processed"))).toContain(`${steerId}.md`);
      const answer = fs.readFileSync(path.join(goalDir, "mailbox/outbox", `steer-${steerId}.md`), "utf8");
      expect(answer).toContain("acknowledged");

      const metrics = yaml.parse(fs.readFileSync(path.join(goalDir, "metrics.yaml"), "utf8"));
      expect(metrics.iterations[0].humanInterventions).toBe(1);
      expect(metrics.iterations[0].merged).toEqual(["alpha"]);

      const status = await capturedLog(async () =>
        dispatch(["status", "--repo", repo.dir, "--goal", "demo"])
      );
      expect(status.code).toBe(0);
      expect(status.out).toContain("goal demo: active (iteration 1)");
      expect(status.out).toContain("alpha: merged");
      expect(status.out).toContain("iterations/1/summary.md");

      const close = await capturedLog(async () =>
        dispatch(["run", "--repo", repo.dir, "--goal", "demo"], { harnesses: { fake: doneHarness() } })
      );
      expect(close.code).toBe(0);
      const finalStatus = await capturedLog(async () =>
        dispatch(["status", "--repo", repo.dir, "--goal", "demo"])
      );
      expect(finalStatus.out).toContain("goal demo: done (iteration 2)");
      expect(finalStatus.out).toContain("iterations/2/summary.md");

      const store = createFolderStore(goalDir);
      expect((await store.listRecords()).filter((r) => r.step === "merge" && r.ok === true)).toHaveLength(1);
    } finally {
      repo.cleanup();
    }
  }, 60_000);

  it("steer reads the body from stdin", async () => {
    const repo = createTmpRepo();
    try {
      expect(await dispatch(["init", "--repo", repo.dir, "--goal", "demo"])).toBe(0);
      repo.writeFile(".factory/run.yaml", runYaml(repo));
      const goalDir = path.join(repo.dir, ".factory/artifacts/demo");
      const proc = Bun.spawn(
        ["bun", path.join(PACKAGE_ROOT, "bin/factory.ts"), "steer", "--repo", repo.dir, "--goal", "demo", "-"],
        { cwd: PACKAGE_ROOT, stdin: "pipe", stdout: "pipe", stderr: "pipe" }
      );
      proc.stdin.write("Use Rust for the parser.\n");
      proc.stdin.end();
      expect(await proc.exited).toBe(0);
      const files = fs.readdirSync(path.join(goalDir, "mailbox/inbox")).filter((n) => !n.startsWith("."));
      expect(files).toHaveLength(1);
      expect(fs.readFileSync(path.join(goalDir, "mailbox/inbox", files[0]!), "utf8")).toBe("Use Rust for the parser.\n");
    } finally {
      repo.cleanup();
    }
  }, 30_000);
});
