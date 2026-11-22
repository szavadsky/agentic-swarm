import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import type { TurnRequest } from "../../src/harness/types.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { isInfraCheck, runGates } from "../../src/kernel/gates.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  scriptStallLeave,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

function runtimeWith(
  root: string,
  gates: KernelRuntime["configs"]["repo"]["gates"],
): KernelRuntime {
  return {
    paths: { repoRoot: root },
    configs: { repo: { gates } },
  } as unknown as KernelRuntime;
}

function testScriptExitsNonZero() {
  it("script exits non-zero: fail with the tail", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gate-nonzero-"));
    try {
      const gate = {
        id: "script-lint",
        command: "echo 'lint error: missing semicolon in file.txt'; exit 2",
        serial: [],
      };
      const [run] = await runGates(runtimeWith(root, [gate]), root);
      expect(run!.name).toBe("script-lint");
      expect(run!.ok).toBe(false);
      expect(run!.summary).toBe("exit 2");
      expect(run!.output).toBe("lint error: missing semicolon in file.txt");
      expect(isInfraCheck(run!)).toBe(false);
      expect(run!.details).toMatchObject({
        roots: [root],
        truncated: false,
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function testScriptKilledByTimeout() {
  it("script killed by timeout: infra, not a fail verdict", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gate-timeout-"));
    try {
      const gate = {
        id: "script-slow",
        command: "sleep 5",
        timeoutSec: 0.2,
        serial: [],
      };
      const [run] = await runGates(runtimeWith(root, [gate]), root);
      expect(run!.name).toBe("script-slow");
      expect(run!.ok).toBe(false);
      expect(run!.summary).toBe("timed out after 0.2s");
      expect(isInfraCheck(run!)).toBe(true);
      expect(run!.details).toMatchObject({
        kind: "infra",
        cause: "timed out after 0.2s",
        roots: [root],
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function testScriptWithNoOutput() {
  it("script with no output: pass with an empty tail", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gate-noop-pass-"));
    try {
      const gate = { id: "script-silent-pass", command: "true", serial: [] };
      const [run] = await runGates(runtimeWith(root, [gate]), root);
      expect(run!.name).toBe("script-silent-pass");
      expect(run!.ok).toBe(true);
      expect(run!.summary).toBe("pass");
      expect(run!.output).toBe("");
      expect(isInfraCheck(run!)).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("script with no output: fail with an empty tail", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gate-noop-fail-"));
    try {
      const gate = { id: "script-silent-fail", command: "false", serial: [] };
      const [run] = await runGates(runtimeWith(root, [gate]), root);
      expect(run!.name).toBe("script-silent-fail");
      expect(run!.ok).toBe(false);
      expect(run!.summary).toBe("exit 1");
      expect(run!.output).toBe("");
      expect(isInfraCheck(run!)).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function testPatternGatesUnchanged() {
  it("existing pattern gates remain unchanged", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gate-pattern-"));
    try {
      const gate = {
        id: "cargo-gate",
        command:
          "echo 'test tests::alpha ... ok\ntest tests::beta ... FAILED'; exit 101",
        serial: [],
        format: { pattern: "cargo" as const },
      };
      const [run] = await runGates(runtimeWith(root, [gate]), root);
      expect(run!.ok).toBe(false);
      expect(run!.summary).toBe("exit 101");
      expect(run!.details).toMatchObject({ pattern: "cargo" });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function bindGreenTurns(
  harness: FakeHarness,
  seen: { qa: boolean; review: boolean },
) {
  harness.script((req: TurnRequest, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "artifact.txt"), "built\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "artifact generated" }));
    return fakeTurnResult(req);
  });
  harness.script(
    (req: TurnRequest, ctx) => {
      expect(req.prompt).toContain("- checks: `pass`");
      expect(req.prompt).toMatch(/- checks tree: `[0-9a-f]+`/);
      expect(req.prompt).toMatch(/- checks log: `\S+`/);
      seen.qa = true;
      ctx.writeOutcome(
        outcome({ summary: "qa accepted", qa: { verdict: "accept" } }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "qa" }) },
  );
  harness.script((req: TurnRequest, ctx) => {
    expect(req.prompt).toContain("- checks: `pass`");
    expect(req.prompt).toMatch(/- checks tree: `[0-9a-f]+`/);
    expect(req.prompt).toMatch(/- checks log: `\S+`/);
    seen.review = true;
    ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });
}

function testScriptGateGreenThroughMerge() {
  it("runs a task with a non-test script gate green through QA, review and merge", async () => {
    const cmd =
      "sh -c 'echo \"[gate] verifying artifact.txt\" && test -f artifact.txt'";
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "verify-artifact", command: cmd }],
    });
    const harness = new FakeHarness({ id: "fake" });
    const seen = { qa: false, review: false };
    bindGreenTurns(harness, seen);
    const runtime = await makeRuntime(repo, goal, { fake: harness });
    try {
      await writeTask(
        runtime,
        task("artifact-task", { scope: ["artifact.txt"] }),
      );
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      expect(seen.qa).toBe(true);
      expect(seen.review).toBe(true);

      const records = await runtime.store.listRecords();
      const checks = records.filter(
        (r) => r.slug === "artifact-task" && r.step === "checks",
      );
      expect(checks).toHaveLength(1);
      expect(checks[0]!.checks![0]?.output).toBe(
        "[gate] verifying artifact.txt",
      );

      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks["artifact-task"]!.status).toBe("merged");
    } finally {
      cleanupFlowRepo(repo);
    }
  });
}

function bindFixTurns(harness: FakeHarness, seen: { fix: boolean }) {
  harness.script((req: TurnRequest, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "temp.txt"), "temp\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "attempt 1" }));
    return fakeTurnResult(req);
  });
  harness.script((req: TurnRequest, ctx) => {
    expect(req.prompt).toContain("### check-script: exit 1");
    expect(req.prompt).toContain("error: fixed.txt is missing");
    seen.fix = true;
    fs.writeFileSync(path.join(req.cwd!, "fixed.txt"), "fixed\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "fixed missing file" }));
    return fakeTurnResult(req);
  });
  harness.script(
    (req: TurnRequest, ctx) => {
      ctx.writeOutcome(
        outcome({ summary: "accepted", qa: { verdict: "accept" } }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "qa" }) },
  );
  harness.script((req: TurnRequest, ctx) => {
    ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });
}

function testScriptGateFailureTail() {
  it("non-test script gate failure passes tail to fix turn", async () => {
    const cmd =
      "sh -c 'if [ ! -f fixed.txt ]; then echo \"error: fixed.txt is missing\"; exit 1; fi'";
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "check-script", command: cmd }],
    });
    const harness = new FakeHarness({ id: "fake" });
    const seen = { fix: false };
    bindFixTurns(harness, seen);

    const runtime = await makeRuntime(repo, goal, { fake: harness });
    try {
      await writeTask(runtime, task("fix-task", { scope: ["fixed.txt"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      expect(seen.fix).toBe(true);

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks["fix-task"]!.status).toBe("merged");
    } finally {
      cleanupFlowRepo(repo);
    }
  });
}

function testScriptGateTimeoutInfra() {
  it("non-test script gate timeout parks as infra, not a fail verdict", async () => {
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "hang-gate", command: "sleep 10", timeoutSec: 0.2 }],
    });
    const harness = new FakeHarness({ id: "fake" });
    harness.script((req: TurnRequest, ctx) => {
      fs.writeFileSync(path.join(req.cwd!, "hang.txt"), "hang\n", "utf8");
      ctx.writeOutcome(outcome({ summary: "v1" }));
      return fakeTurnResult(req);
    });
    scriptStallLeave(harness, ["hang-task"]);

    const runtime = await makeRuntime(repo, goal, { fake: harness });
    try {
      await writeTask(runtime, task("hang-task", { scope: ["hang.txt"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks["hang-task"]!.status).toBe("parked");
      expect(state.tasks["hang-task"]!.cause?.kind).toBe("infra");
    } finally {
      cleanupFlowRepo(repo);
    }
  });
}

describe("plain shell-script gate evidence", () => {
  testScriptExitsNonZero();
  testScriptKilledByTimeout();
  testScriptWithNoOutput();
  testPatternGatesUnchanged();
});

describe("non-test script gate flow: QA, review and merge", () => {
  testScriptGateGreenThroughMerge();
  testScriptGateFailureTail();
  testScriptGateTimeoutInfra();
});
