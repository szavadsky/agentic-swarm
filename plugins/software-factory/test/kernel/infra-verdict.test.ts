import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import { validateFile } from "../../src/cli/commands/validate.js";
import {
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import type { SessionRef, TurnRequest } from "../../src/harness/types.js";
import { contextPackRelPath } from "../../src/kernel/context-pack.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { runFront } from "../../src/kernel/front.js";
import { infraPath, readInfra } from "../../src/kernel/infra.js";
import type { KernelRuntime, State } from "../../src/kernel/types.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

const INFRA_INGESTION = {
  ingestion: [
    { id: "branch" },
    { id: "front" },
    { id: "infra", prompt: "infra", alias: "pm" },
  ],
};

function makeTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function fakeSession(
  id: string,
  dir: string | undefined,
  req: TurnRequest,
): SessionRef {
  return {
    harness: "fake",
    id,
    dir,
    cwd: req.cwd,
    model: req.model,
    lastRequestStartedAt: new Date().toISOString(),
    retentionTier: "short",
    compacted: false,
  };
}

async function emptyState(runtime: KernelRuntime): Promise<State> {
  return derive([], [], runtime.configs.process.flows);
}

function writeInfraYaml(
  goalDir: string,
  incident: Record<string, unknown>,
  gates: unknown[] = [],
): void {
  fs.writeFileSync(
    infraPath(goalDir),
    yaml.stringify({ gates, incident }),
    "utf8",
  );
}

function scriptBiggerFront(harness: FakeHarness, goalDir: string): void {
  // An annotated intent keeps these turns on infra, not slug triage.
  fs.writeFileSync(
    path.join(goalDir, "intent.md"),
    "# Goal\n\n[[Demo]] Test goal.\n",
    "utf8",
  );
  harness.script(
    (req, ctx) => {
      const pack = path.join(goalDir, contextPackRelPath(1));
      fs.mkdirSync(path.dirname(pack), { recursive: true });
      fs.writeFileSync(pack, "# Front pack\n\nindex\n", "utf8");
      fs.writeFileSync(
        path.join(goalDir, "class.yaml"),
        "class: bigger\n",
        "utf8",
      );
      ctx.writeOutcome(outcome({ summary: "classified bigger" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "front" }) },
  );
}

function scriptSimpleImplement(harness: FakeHarness, fileName = "a.txt"): void {
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(path.join(req.cwd!, fileName), "v1\n", "utf8");
      ctx.writeOutcome(outcome({ summary: "implemented" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "implement" }) },
  );
}

async function setupIngestedInfra(opts: {
  gates: { id: string; command: string; timeoutSec?: number }[];
  sessionId: string;
  sessionDir?: string;
  caps?: { resume: boolean };
  removeSessionDirAfter?: boolean;
}) {
  const { repo, goalDir, goal } = setupFlowRepo({
    process: INFRA_INGESTION,
    classYaml: null,
    gates: opts.gates,
  });
  const harness = new FakeHarness({
    id: "fake",
    ...(opts.caps ? { caps: opts.caps } : {}),
  });
  scriptBiggerFront(harness, goalDir);
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(
        infraPath(goalDir),
        yaml.stringify({
          gates: [
            {
              name: opts.gates[0]!.id,
              command: opts.gates[0]!.command,
              speed: "fast",
              status: "green",
            },
          ],
        }),
        "utf8",
      );
      ctx.writeOutcome(outcome({ summary: "discovered gates" }));
      return fakeTurnResult(req, {
        session: fakeSession(opts.sessionId, opts.sessionDir, req),
      });
    },
    { when: whenTurn({ step: "infra" }) },
  );
  harness.script(
    (req, ctx) => {
      writeInfraYaml(goalDir, {
        verdict: "infra",
        handling: "stop",
        fix: {
          layer: "repo",
          path: ".factory/repo.yaml",
          summary: "gate timed out twice",
        },
      });
      ctx.writeOutcome(outcome({ summary: "incident is infra" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "infra" }) },
  );
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  expect(
    (
      await runFront(runtime, {
        iteration: 1,
        state: await emptyState(runtime),
      })
    ).action,
  ).toBe("boundary");
  if (opts.removeSessionDirAfter && opts.sessionDir)
    fs.rmSync(opts.sessionDir, { recursive: true, force: true });
  return { repo, goalDir, harness, runtime };
}

function testResumableTimeout() {
  it("routes a gate timing out twice to one resumable ingestion infra turn with incident verdict", async () => {
    const sessDir = makeTmpDir("factory-infra-sess-");
    const { repo, goalDir, harness, runtime } = await setupIngestedInfra({
      gates: [{ id: "hang", command: "sleep 10", timeoutSec: 0.2 }],
      sessionId: "ingest-infra-sess",
      sessionDir: sessDir,
    });
    try {
      scriptSimpleImplement(harness);
      await writeTask(
        runtime,
        task("a", { flow: "just-implement", scope: ["a.txt"] }),
      );
      expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
        "infra",
      );
      const infraCalls = harness.calls.filter(
        (c) => fakeTurnIdentity(c).step === "infra",
      );
      expect(infraCalls).toHaveLength(2);
      expect(infraCalls[1]!.session?.id).toBe("ingest-infra-sess");
      expect(infraCalls[1]!.prompt).toContain("hang");
      expect(infraCalls[1]!.prompt).toContain("timed out twice");
      expect(infraCalls[1]!.prompt).toContain("status: green");
      expect(readInfra(goalDir)?.incident).toEqual({
        verdict: "infra",
        handling: "stop",
        fix: {
          layer: "repo",
          path: ".factory/repo.yaml",
          summary: "gate timed out twice",
        },
      });
      expect((await validateFile(infraPath(goalDir))).findings).toEqual([]);
      expect(
        (await runtime.store.listRecords()).filter((r) => r.step === "park"),
      ).toHaveLength(0);
    } finally {
      cleanupFlowRepo(repo);
      fs.rmSync(sessDir, { recursive: true, force: true });
    }
  }, 60_000);
}

function testFreshWhenUnrecorded() {
  it("starts a fresh infra turn on the infra step prompt and alias when no ingestion session was recorded", async () => {
    const { repo, goalDir, goal } = setupFlowRepo({
      gates: [{ id: "hang", command: "sleep 10", timeoutSec: 0.2 }],
      process: {
        ingestion: [
          { id: "branch" },
          { id: "front" },
          { id: "infra", prompt: "infra-custom", alias: "architect" },
        ],
      },
    });
    try {
      fs.mkdirSync(path.join(repo.dir, ".factory", "prompts"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(repo.dir, ".factory", "prompts", "infra-custom.md"),
        "Custom infra for {{incident_evidence}}\nCurrent:\n{{current_infra}}\nPath: {{infra_path}}\n",
        "utf8",
      );
      repo.commit("custom infra prompt");
      const harness = new FakeHarness({ id: "fake" });
      scriptSimpleImplement(harness);
      harness.script(
        (req, ctx) => {
          writeInfraYaml(goalDir, { verdict: "infra", handling: "escalate" });
          ctx.writeOutcome(outcome({ summary: "fresh infra turn done" }));
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "infra" }) },
      );
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("a", { flow: "just-implement", scope: ["a.txt"] }),
      );
      expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
        "infra",
      );
      const infraCalls = harness.calls.filter(
        (c) => fakeTurnIdentity(c).step === "infra",
      );
      expect(infraCalls).toHaveLength(1);
      expect(infraCalls[0]!.session).toBeUndefined();
      expect(infraCalls[0]!.model.id).toBe("fake-architect");
      expect(infraCalls[0]!.prompt).toContain("Custom infra for source:");
      expect(infraCalls[0]!.prompt).toContain("timed out twice");
      expect(readInfra(goalDir)?.incident).toEqual({
        verdict: "infra",
        handling: "escalate",
      });
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function testFreshOnUnportableOrMissingSession() {
  it("starts fresh when the harness cannot resume or the recorded session dir is gone", async () => {
    const sessDir = makeTmpDir("factory-infra-sess-");
    const noResume = await setupIngestedInfra({
      gates: [{ id: "hang", command: "sleep 10", timeoutSec: 0.2 }],
      sessionId: "ingest-no-resume",
      sessionDir: sessDir,
      caps: { resume: false },
    });
    try {
      scriptSimpleImplement(noResume.harness);
      await writeTask(
        noResume.runtime,
        task("a", { flow: "just-implement", scope: ["a.txt"] }),
      );
      expect(
        (await runDispatch(noResume.runtime, { iteration: 1 })).reason,
      ).toBe("infra");
      const calls = noResume.harness.calls.filter(
        (c) => fakeTurnIdentity(c).step === "infra",
      );
      expect(calls).toHaveLength(2);
      expect(calls[1]!.session).toBeUndefined();
    } finally {
      cleanupFlowRepo(noResume.repo);
      fs.rmSync(sessDir, { recursive: true, force: true });
    }
    const gone = await setupIngestedInfra({
      gates: [{ id: "hang", command: "sleep 10", timeoutSec: 0.2 }],
      sessionId: "ingest-gone-sess",
      sessionDir: makeTmpDir("factory-infra-gone-"),
      removeSessionDirAfter: true,
    });
    try {
      scriptSimpleImplement(gone.harness);
      await writeTask(
        gone.runtime,
        task("a", { flow: "just-implement", scope: ["a.txt"] }),
      );
      expect((await runDispatch(gone.runtime, { iteration: 1 })).reason).toBe(
        "infra",
      );
      const calls = gone.harness.calls.filter(
        (c) => fakeTurnIdentity(c).step === "infra",
      );
      expect(calls).toHaveLength(2);
      expect(calls[1]!.session).toBeUndefined();
    } finally {
      cleanupFlowRepo(gone.repo);
    }
  }, 60_000);
}

function scriptLostResumeInfra(
  harness: FakeHarness,
  goalDir: string,
  sessDir: string,
): () => number {
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(infraPath(goalDir), "gates: []\n", "utf8");
      ctx.writeOutcome(outcome({ summary: "discovered gates" }));
      return fakeTurnResult(req, {
        session: fakeSession("ingest-stale-sess", sessDir, req),
      });
    },
    { when: whenTurn({ step: "infra" }) },
  );
  let attempts = 0;
  harness.script(
    (req, ctx) => {
      attempts += 1;
      if (req.session) {
        return fakeTurnResult(req, {
          stop: { kind: "infra", cause: "crash", details: "session gone" },
        });
      }
      writeInfraYaml(goalDir, { verdict: "infra", handling: "retry" });
      ctx.writeOutcome(outcome({ summary: "recovered fresh" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "infra" }), fallback: true },
  );
  return () => attempts;
}

function testLostResumeRetry() {
  it("retries fresh if resuming the recorded infra session stops as lost-resume", async () => {
    const sessDir = makeTmpDir("factory-infra-stale-");
    const { repo, goalDir, goal } = setupFlowRepo({
      process: INFRA_INGESTION,
      classYaml: null,
      gates: [{ id: "broken", command: "exit 126" }],
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptBiggerFront(harness, goalDir);
      const attempts = scriptLostResumeInfra(harness, goalDir, sessDir);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await runFront(runtime, {
        iteration: 1,
        state: await emptyState(runtime),
      });
      scriptSimpleImplement(harness);
      await writeTask(
        runtime,
        task("a", { flow: "just-implement", scope: ["a.txt"] }),
      );
      expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
        "infra",
      );
      expect(attempts()).toBe(2);
      const calls = harness.calls.filter(
        (c) => fakeTurnIdentity(c).step === "infra",
      );
      expect(calls[1]!.session?.id).toBe("ingest-stale-sess");
      expect(calls[2]!.session).toBeUndefined();
      expect(readInfra(goalDir)?.incident).toEqual({
        verdict: "infra",
        handling: "retry",
      });
    } finally {
      cleanupFlowRepo(repo);
      fs.rmSync(sessDir, { recursive: true, force: true });
    }
  }, 60_000);
}

function testSingleTimeoutFlake() {
  it("runs zero infra turns when a timed-out gate passes on its single retry", async () => {
    const probeDir = makeTmpDir("factory-to-once-");
    const cmd = `if [ ! -f "${path.join(probeDir, "once")}" ]; then touch "${path.join(probeDir, "once")}"; sleep 2; fi; exit 0`;
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "hang-once", command: cmd, timeoutSec: 0.2 }],
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptSimpleImplement(harness);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("a", { flow: "just-implement", scope: ["a.txt"] }),
      );
      await runDispatch(runtime, { iteration: 1 });
      expect(
        harness.calls.filter((c) => fakeTurnIdentity(c).step === "infra"),
      ).toHaveLength(0);
      const records = await runtime.store.listRecords();
      expect(records.some((r) => r.step === "gate-flake")).toBe(true);
      expect(
        derive(
          await runtime.store.listTasks(),
          records,
          runtime.configs.process.flows,
        ).tasks.a!.status,
      ).toBe("merged");
    } finally {
      cleanupFlowRepo(repo);
      fs.rmSync(probeDir, { recursive: true, force: true });
    }
  }, 60_000);
}

describe("infra verdict session & timeout routing", () => {
  testResumableTimeout();
  testFreshWhenUnrecorded();
  testFreshOnUnportableOrMissingSession();
  testLostResumeRetry();
  testSingleTimeoutFlake();
});
