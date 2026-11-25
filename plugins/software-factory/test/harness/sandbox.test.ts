import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import { type SandboxCommand, runInSandbox } from "../../src/core/sandbox.js";
import { runProcess } from "../../src/core/proc.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { OmpRpc } from "../../src/harness/omp/rpc.js";
import { AcpxHarness } from "../../src/harness/acpx/harness.js";
import { loadConfigs, resolveGoalPaths } from "../../src/kernel/config.js";
import { contextPackRelPath } from "../../src/kernel/context-pack.js";
import { runGoal } from "../../src/kernel/launch.js";
import { PreflightError } from "../../src/kernel/preflight.js";
import {
  cleanup,
  expectLaunch,
  makeGoal,
  outcome,
  stateOf,
  type E2EGoal,
} from "../kernel/e2e-helpers.js";
import { createAcpxStub } from "./acpx-stub.js";

const BWRAP = Bun.which("bwrap");

/** A bwrap profile read-only at `/` with exactly these paths writable. */
function bwrapProfile(writable: readonly string[]): SandboxCommand {
  if (!BWRAP) throw new Error("bwrap is not installed");
  return {
    binary: BWRAP,
    args: [
      "--ro-bind",
      "/",
      "/",
      "--dev",
      "/dev",
      "--proc",
      "/proc",
      "--unshare-all",
      "--share-net",
      "--die-with-parent",
      ...writable.flatMap((dir) => ["--bind", dir, dir]),
    ],
  };
}

/** A wrapper that records every invocation and then hands over to bwrap. */
function recordingWrapper(dir: string, log: string): string {
  if (!BWRAP) throw new Error("bwrap is not installed");
  const file = path.join(dir, "factory-sandbox");
  fs.writeFileSync(
    file,
    `#!/bin/sh\nprintf 'wrapped\\n' >> ${JSON.stringify(log)}\nexec ${JSON.stringify(BWRAP)} "$@"\n`,
    { mode: 0o755 },
  );
  return file;
}

/** Writes `inside` under the bound dir and `outside` under an unbound one. */
function writeAcrossBinds(allowed: string, outside: string): string {
  return [
    `printf inside > ${JSON.stringify(path.join(allowed, "inside.txt"))}`,
    `printf outside > ${JSON.stringify(path.join(outside, "outside.txt"))}`,
  ].join("; ");
}

async function refusesWritesOutsideBinds(): Promise<void> {
  const allowed = fs.mkdtempSync(path.join(os.tmpdir(), "sandbox-allowed-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "sandbox-outside-"));
  try {
    const result = await runInSandbox(bwrapProfile([allowed]), () =>
      runProcess({ cmd: writeAcrossBinds(allowed, outside), cwd: allowed }),
    );

    expect(fs.readFileSync(path.join(allowed, "inside.txt"), "utf8")).toBe(
      "inside",
    );
    expect(result.code).not.toBe(0);
    expect(fs.existsSync(path.join(outside, "outside.txt"))).toBe(false);
  } finally {
    fs.rmSync(allowed, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
}

async function runsWithoutWrapper(): Promise<void> {
  const allowed = fs.mkdtempSync(path.join(os.tmpdir(), "sandbox-allowed-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "sandbox-outside-"));
  try {
    const result = await runProcess({
      cmd: writeAcrossBinds(allowed, outside),
      cwd: allowed,
    });

    expect(result.code).toBe(0);
    expect(fs.existsSync(path.join(outside, "outside.txt"))).toBe(true);
  } finally {
    fs.rmSync(allowed, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
}

/** A ready-speaking omp stand-in that dumps its environment. */
function fakeOmp(dir: string, envFile: string): string {
  const binary = path.join(dir, "fake-omp.js");
  fs.writeFileSync(
    binary,
    `#!/usr/bin/env bun
import fs from "node:fs";
fs.writeFileSync(${JSON.stringify(envFile)}, JSON.stringify(process.env));
process.stdout.write(JSON.stringify({ type: "ready", protocolVersion: 1 }) + "\\n");
process.stdin.resume();
process.stdin.on("end", () => process.exit(0));
`,
    { mode: 0o755 },
  );
  return binary;
}

async function harnessSpawnsShareWrapper(): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sandbox-harness-"));
  const ompEnv = path.join(dir, "omp-env.json");
  const stub = createAcpxStub({ envFile: path.join(dir, "acpx-env.json") });
  const base = bwrapProfile([dir, path.dirname(stub.binary)]);
  const sandbox = {
    ...base,
    args: [...base.args, "--setenv", "FACTORY_SANDBOX_MARKER", "wrapped"],
  };
  try {
    await runInSandbox(sandbox, async () => {
      const rpc = await OmpRpc.launch(
        { binary: fakeOmp(dir, ompEnv), args: [], cwd: dir },
        5_000,
      );
      await rpc.close();
    });
    expect(
      JSON.parse(fs.readFileSync(ompEnv, "utf8")).FACTORY_SANDBOX_MARKER,
    ).toBe("wrapped");
    await expectAcpxWrapped(sandbox, stub.binary, dir);
  } finally {
    stub.cleanup();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** One acpx prompt under the wrapper, proved by a wrapper-set environment value. */
async function expectAcpxWrapped(
  sandbox: SandboxCommand,
  binary: string,
  dir: string,
): Promise<void> {
  const harness = new AcpxHarness({
    retention: "short",
    id: "fake-agent",
    binary,
    sessionDir: path.dirname(binary),
    acpx: { agent: "fake-agent" },
  });
  const turned = await runInSandbox(sandbox, () =>
    harness.turn({
      model: { id: "fake-host/lamp-mini-free" },
      cwd: path.dirname(binary),
      prompt: "Say [[text:PONG]]",
      timeouts: { idleMs: 10_000, wallMs: 30_000 },
    }),
  );
  expect(turned.stop).toEqual({ kind: "done" });
  expect(
    JSON.parse(fs.readFileSync(path.join(dir, "acpx-env.json"), "utf8"))
      .FACTORY_SANDBOX_MARKER,
  ).toBe("wrapped");
}

const CUSTOM_TYPE_PROCESS = [
  "flows:",
  "  feature:",
  "    steps:",
  "      - id: implement",
  "        prompt: implementer",
  "        alias: implementer",
  "taskTypes:",
  "  feature:",
  "    flow: feature",
  "    kind: development",
  "    schema: outcome",
  "    useWhen: a feature-sized change that ships after one implement turn",
  "",
].join("\n");

const CUSTOM_TASK = [
  "---",
  "slug: feat",
  "title: Create feat.txt",
  "type: feature",
  "deps: []",
  "source: front",
  "---",
  "",
  "Create feat.txt.",
  "",
  "Done when: feat.txt exists.",
  "",
].join("\n");

function writeCustomRun(goal: E2EGoal, sandbox: SandboxCommand): void {
  const file = path.join(goal.repo.dir, ".factory/run.yaml");
  const config = yaml.parse(fs.readFileSync(file, "utf8")) as Record<
    string,
    unknown
  >;
  goal.repo.writeFile(
    ".factory/run.yaml",
    yaml.stringify({ ...config, sandbox }),
  );
  goal.repo.commit("run config");
}

function scriptCustomRun(goal: E2EGoal, harness: FakeHarness): void {
  harness.script((req, ctx) => {
    const pack = path.join(goal.goalDir, contextPackRelPath(1));
    fs.mkdirSync(path.dirname(pack), { recursive: true });
    fs.writeFileSync(pack, "# Front pack\n\n- one file\n", "utf8");
    fs.writeFileSync(
      path.join(goal.goalDir, "class.yaml"),
      "class: task\nslug: feat\n",
      "utf8",
    );
    fs.mkdirSync(path.join(goal.goalDir, "tasks"), { recursive: true });
    fs.writeFileSync(
      path.join(goal.goalDir, "tasks/feat.md"),
      CUSTOM_TASK,
      "utf8",
    );
    ctx.writeOutcome(outcome({ summary: "classified task" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    if (!req.cwd) throw new Error("implement turn has no cwd");
    fs.writeFileSync(path.join(req.cwd, "feat.txt"), "feat\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "feat implemented" }));
    return fakeTurnResult(req);
  });
}

/** The run-phase gate that fails when the run body is not inside the wrapper. */
const RUN_MARKER_GATE = 'test "$FACTORY_SANDBOX_MARKER" = wrapped';

/** A one-task goal whose repo gate and git commands both run inside the run. */
async function customGoal(
  opts: { runMarkerGate?: boolean } = {},
): Promise<E2EGoal> {
  const goal = makeGoal({ classYaml: null, processYaml: CUSTOM_TYPE_PROCESS });
  const repoFile = path.join(goal.repo.dir, ".factory/repo.yaml");
  const repoConfig = yaml.parse(fs.readFileSync(repoFile, "utf8")) as Record<
    string,
    unknown
  >;
  goal.repo.writeFile(
    ".factory/repo.yaml",
    yaml.stringify({
      ...repoConfig,
      requireGates: true,
      gates: [
        { id: "feat-file", command: "test -f feat.txt" },
        ...(opts.runMarkerGate
          ? [{ id: "run-marker", command: RUN_MARKER_GATE }]
          : []),
      ],
    }),
  );
  goal.repo.commit("sandbox gate");
  const configs = loadConfigs(goal.repo.dir);
  const paths = resolveGoalPaths(configs, goal.repo.dir, "demo");
  fs.mkdirSync(paths.worktreeRoot, { recursive: true });
  fs.mkdirSync(paths.sessionsDir, { recursive: true });
  return goal;
}

async function runCustomGoal(goal: E2EGoal): Promise<void> {
  const harness = new FakeHarness({ id: "fake" });
  scriptCustomRun(goal, harness);
  await expectLaunch(0, goal.repo, harness, 3);
  const state = await stateOf(goal.goalDir);
  expect(state.goal).toBe("done");
  expect(state.tasks.feat?.status).toBe("merged");
}

async function sandboxedRunCompletes(): Promise<void> {
  const wrapperDir = fs.mkdtempSync(path.join(os.tmpdir(), "sandbox-wrapper-"));
  const log = path.join(wrapperDir, "invocations.log");
  let goal: E2EGoal | undefined;
  try {
    goal = await customGoal({ runMarkerGate: true });
    const paths = resolveGoalPaths(
      loadConfigs(goal.repo.dir),
      goal.repo.dir,
      "demo",
    );
    const profile = bwrapProfile([
      os.tmpdir(),
      goal.repo.dir,
      paths.worktreeRoot,
      paths.sessionsDir,
    ]);
    writeCustomRun(goal, {
      binary: recordingWrapper(wrapperDir, log),
      args: [...profile.args, "--setenv", "FACTORY_SANDBOX_MARKER", "wrapped"],
    });
    await runCustomGoal(goal);
    expect(fs.readFileSync(log, "utf8")).toContain("wrapped");
  } finally {
    if (goal) cleanup(goal);
    fs.rmSync(wrapperDir, { recursive: true, force: true });
  }
}

async function missingSandboxBinaryStopsPreflight(): Promise<void> {
  const goal = makeGoal();
  try {
    const file = path.join(goal.repo.dir, ".factory/run.yaml");
    const config = yaml.parse(fs.readFileSync(file, "utf8")) as Record<
      string,
      unknown
    >;
    goal.repo.writeFile(
      ".factory/run.yaml",
      yaml.stringify({
        ...config,
        sandbox: { binary: "/nonexistent/factory-sandbox" },
      }),
    );
    goal.repo.commit("missing sandbox binary");
    const failed = await runGoal({
      repo: goal.repo.dir,
      goal: "demo",
      iterations: 1,
      harnesses: { fake: new FakeHarness({ id: "fake" }) },
      baseGates: false,
    }).catch((err) => err);
    expect(failed).toBeInstanceOf(PreflightError);
    expect((failed as PreflightError).findings).toContainEqual({
      file,
      key: "sandbox.binary",
      message:
        'sandbox binary "/nonexistent/factory-sandbox" is not executable or not on PATH',
    });
  } finally {
    cleanup(goal);
  }
}

describe("process-level sandbox", () => {
  it.skipIf(!BWRAP)(
    "refuses writes outside its binds",
    refusesWritesOutsideBinds,
  );

  it("leaves the same child unchanged without a wrapper", runsWithoutWrapper);

  it.skipIf(!BWRAP)(
    "wraps the omp RPC and acpx prompt spawns",
    harnessSpawnsShareWrapper,
  );
});

describe("sandboxed fake-harness run", () => {
  it.skipIf(!BWRAP)(
    "completes through the configured wrapper and gates",
    sandboxedRunCompletes,
    90_000,
  );

  it("runs the same goal without a wrapper", async () => {
    const goal = await customGoal();
    try {
      await runCustomGoal(goal);
    } finally {
      cleanup(goal);
    }
  }, 90_000);
});

describe("sandbox pre-flight", () => {
  it(
    "refuses a configured wrapper whose binary is missing",
    missingSandboxBinaryStopsPreflight,
  );
});
