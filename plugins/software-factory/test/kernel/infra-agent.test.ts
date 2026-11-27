import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateFile } from "../../src/cli/commands/validate.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { contextPackRelPath } from "../../src/kernel/context-pack.js";
import { derive } from "../../src/kernel/derive.js";
import { runFront } from "../../src/kernel/front.js";
import { isInfraCheck, runGates } from "../../src/kernel/gates.js";
import {
  gateCommandsText,
  INFRA_FILE,
  type InfraReport,
  infraPath,
  infraSchema,
  packGates,
  readInfra,
  resolveGates,
} from "../../src/kernel/infra.js";
import type { KernelRuntime, State } from "../../src/kernel/types.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome as outcomeOf,
  setupFlowRepo,
  whenTurn,
} from "./s2-helpers.js";

const INFRA_STEP = {
  ingestion: [
    { id: "branch" },
    { id: "front" },
    { id: "infra", prompt: "infra", alias: "pm" },
  ],
};

/** A report where the configured gate's observed status is red and flaky. */
const CONFIGURED_REPORT = `gates:
  - name: unit
    command: test -f another-file.txt
    speed: fast
    status: red
    flaky: true
    notes: failed on a timeout, then passed on the same tree
  - name: lint
    command: test -f lint.txt
    speed: fast
    status: green
`;

const DISCOVERED = `gates:
  - name: unit
    command: test -f README.md
    speed: fast
    status: green
  - name: lint
    command: test -f missing.txt
    speed: fast
    status: red
    flaky: true
    notes: failed on a timeout,
      then passed on the same tree
`;

/** A report that claims green for a command that does not exist. */
const FAKE_SUCCESS = `gates:
  - name: unit
    command: definitely-not-a-command-in-the-path
    speed: fast
    status: green
`;

/** A bigger front that writes the pack and the class the boundary reads. */
function biggerFront(goalDir: string) {
  return (
    req: Parameters<FakeHarness["turn"]>[0],
    ctx: { writeOutcome(v: unknown): void },
  ) => {
    const pack = path.join(goalDir, contextPackRelPath(1));
    fs.mkdirSync(path.dirname(pack), { recursive: true });
    fs.writeFileSync(pack, "# Front pack\n\nthe goal index\n", "utf8");
    fs.writeFileSync(
      path.join(goalDir, "class.yaml"),
      "class: bigger\n",
      "utf8",
    );
    ctx.writeOutcome(outcomeOf({ summary: "classified bigger" }));
    return Promise.resolve(fakeTurnResult(req));
  };
}

/** An infra turn whose whole output is the YAML it writes. */
function infraTurn(goalDir: string, text: string | null) {
  return (
    req: Parameters<FakeHarness["turn"]>[0],
    ctx: { writeOutcome(v: unknown): void },
  ) => {
    expect(req.prompt).toContain("You are the infra agent");
    if (text !== null) fs.writeFileSync(infraPath(goalDir), text, "utf8");
    ctx.writeOutcome(outcomeOf({ summary: "gates reported" }));
    return Promise.resolve(fakeTurnResult(req));
  };
}

async function emptyState(runtime: KernelRuntime): Promise<State> {
  return derive([], [], runtime.configs.process.flows);
}

async function runBiggerFront(opts: {
  gates?: { id: string; command: string }[];
  infra: string | null;
}) {
  const { repo, goalDir, goal } = setupFlowRepo({
    process: INFRA_STEP,
    classYaml: null,
    gates: opts.gates ?? [],
  });
  // An annotated intent keeps these turns on infra, not slug triage.
  fs.writeFileSync(
    path.join(goalDir, "intent.md"),
    "# Goal\n\n[[Demo]] Test goal.\n",
    "utf8",
  );
  const harness = new FakeHarness({ id: "fake" });
  harness.script(biggerFront(goalDir), { when: whenTurn({ step: "front" }) });
  harness.script(infraTurn(goalDir, opts.infra), {
    when: whenTurn({ step: "infra" }),
  });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const result = await runFront(runtime, {
    iteration: 1,
    state: await emptyState(runtime),
  });
  return { repo, goalDir, runtime, result };
}

function packText(goalDir: string): string {
  return fs.readFileSync(path.join(goalDir, contextPackRelPath(1)), "utf8");
}

describe("infra.yaml schema", () => {
  it("accepts the interface's gate record and refuses an unknown status", () => {
    const valid: InfraReport = {
      gates: [
        {
          name: "unit",
          command: "bun test",
          speed: "fast",
          status: "green",
        },
        {
          name: "e2e",
          command: "bun test e2e",
          speed: "slow",
          status: "red",
          flaky: true,
          notes: "one timeout",
        },
      ],
    };
    expect(infraSchema.parse(valid)).toEqual(valid);
    expect(
      infraSchema.safeParse({
        gates: [
          { name: "unit", command: "bun test", speed: "medium", status: "red" },
        ],
      }).success,
    ).toBe(false);
    expect(
      infraSchema.safeParse({
        gates: [
          { name: "unit", command: "true", speed: "fast", status: "failed" },
        ],
      }).success,
    ).toBe(false);
  });

  it("refuses two gates with one name", () => {
    const result = infraSchema.safeParse({
      gates: [
        { name: "unit", command: "true", speed: "fast", status: "green" },
        { name: "unit", command: "false", speed: "slow", status: "red" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("validates the turn's output as an infra file", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "infra-validate-"));
    try {
      const file = path.join(dir, INFRA_FILE);
      fs.writeFileSync(file, DISCOVERED, "utf8");
      expect((await validateFile(file)).findings).toEqual([]);
      fs.writeFileSync(
        file,
        'gates:\n  - { name: unit, command: "true", speed: fast, status: blue }\n',
        "utf8",
      );
      const findings = (await validateFile(file)).findings;
      expect(findings).toHaveLength(1);
      expect(findings[0]).toContain("status");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("infra.yaml incident schema", () => {
  it("validates incident verdicts: infra requires handling, red forbids handling, gates stays required", () => {
    const infraValid: InfraReport = {
      gates: [],
      incident: {
        verdict: "infra",
        handling: "stop-task-types",
        taskTypes: ["computer-use"],
        fix: {
          layer: "repo",
          path: ".factory/repo.yaml",
          summary: "increase timeout",
        },
      },
    };
    expect(infraSchema.parse(infraValid)).toEqual(infraValid);

    const redValid: InfraReport = {
      gates: [],
      incident: {
        verdict: "red",
        fix: {
          layer: "run",
          path: "src/app.ts",
          summary: "task introduced infinite loop",
        },
      },
    };
    expect(infraSchema.parse(redValid)).toEqual(redValid);

    expect(
      infraSchema.safeParse({ gates: [], incident: { verdict: "infra" } })
        .success,
    ).toBe(false);
    expect(
      infraSchema.safeParse({
        gates: [],
        incident: { verdict: "red", handling: "stop" },
      }).success,
    ).toBe(false);
    expect(
      infraSchema.safeParse({
        incident: { verdict: "infra", handling: "retry" },
      }).success,
    ).toBe(false);
  });
});

describe("infra discovery drives the kernel", () => {
  it("runs the discovered gates when the repo config declares none", async () => {
    const { repo, goalDir, runtime, result } = await runBiggerFront({
      infra: DISCOVERED,
    });
    try {
      expect(result.action, result.cause ?? "").toBe("boundary");
      expect(runtime.configs.repo.gates).toEqual([]);
      expect(resolveGates(goalDir, []).map((gate) => gate.id)).toEqual([
        "unit",
        "lint",
      ]);

      const checks = await runGates(runtime, runtime.paths.goalCheckout);
      expect(checks.map((check) => [check.name, check.ok])).toEqual([
        ["unit", true],
        ["lint", false],
      ]);
    } finally {
      cleanupFlowRepo(repo);
    }
  });

  it("puts the red and flaky status in the pack the architect reads", async () => {
    const { repo, goalDir, result } = await runBiggerFront({
      infra: DISCOVERED,
    });
    try {
      expect(result.packPath).toBe(contextPackRelPath(1));
      const pack = packText(goalDir);
      expect(pack).toContain("## Infra");
      expect(pack).toContain("- gate unit: test -f README.md — green, fast");
      expect(pack).toContain(
        "- gate lint: test -f missing.txt — red, fast, flaky",
      );
      expect(pack).toContain(
        "notes: failed on a timeout, then passed on the same tree",
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  });
});

describe("infra fake success", () => {
  it("fails a discovered command that does not exist despite its green claim", async () => {
    const { repo, goalDir, runtime, result } = await runBiggerFront({
      infra: FAKE_SUCCESS,
    });
    try {
      expect(result.action, result.cause ?? "").toBe("boundary");
      expect(resolveGates(goalDir, []).map((gate) => gate.command)).toEqual([
        "definitely-not-a-command-in-the-path",
      ]);

      const checks = await runGates(runtime, runtime.paths.goalCheckout);
      expect(checks.map((check) => [check.name, check.ok])).toEqual([
        ["unit", false],
      ]);
      const unstartable = checks[0]!;
      expect(unstartable.summary).toBe("exit 127");
      expect(isInfraCheck(unstartable)).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  });
});

describe("infra precedence", () => {
  it("never overrides a configured gate with a discovered one", async () => {
    const { repo, goalDir, runtime, result } = await runBiggerFront({
      gates: [{ id: "unit", command: "test -f README.md" }],
      infra: CONFIGURED_REPORT,
    });
    try {
      expect(result.action, result.cause ?? "").toBe("boundary");
      const gates = resolveGates(goalDir, runtime.configs.repo.gates);
      expect(gates.map((gate) => [gate.id, gate.command])).toEqual([
        ["unit", "test -f README.md"],
      ]);

      const checks = await runGates(runtime, runtime.paths.goalCheckout);
      expect(checks.map((check) => [check.name, check.ok])).toEqual([
        ["unit", true],
      ]);
      // A red, flaky observation is reported beside the configured command; it
      // does not replace the command or turn the passing run red.
      expect(packGates(goalDir, runtime.configs.repo.gates)).toEqual([
        {
          id: "unit",
          command: "test -f README.md",
          speed: "fast",
          status: "red",
          flaky: true,
          notes: "failed on a timeout, then passed on the same tree",
        },
      ]);
      expect(gateCommandsText(goalDir, runtime.configs.repo.gates)).toBe(
        "- unit: test -f README.md — red, fast, flaky",
      );
      const pack = packText(goalDir);
      expect(pack).toContain("- gate unit: test -f README.md — red");
      expect(pack).not.toContain("gate lint");
    } finally {
      cleanupFlowRepo(repo);
    }
  });
});

describe("infra delivery", () => {
  it("fails the step when the turn writes no infra file", async () => {
    const { repo, goalDir, result } = await runBiggerFront({ infra: null });
    try {
      expect(result.action).toBe("infra");
      expect(result.step).toBe("infra");
      expect(result.cause).toContain(`wrote no ${INFRA_FILE}`);
      expect(result.cause).toContain(infraPath(goalDir));
    } finally {
      cleanupFlowRepo(repo);
    }
  });

  it("fails the step when the turn's file does not parse", async () => {
    const { repo, result } = await runBiggerFront({
      infra: "gates:\n  - { name: unit, speed: fast, status: green }\n",
    });
    try {
      expect(result.action).toBe("infra");
      expect(result.step).toBe("infra");
      expect(result.cause).toContain("wrote an invalid infra.yaml");
      expect(result.cause).toContain("command");
    } finally {
      cleanupFlowRepo(repo);
    }
  });

  it("stops as infra when an existing infra file does not parse", async () => {
    const { repo, goalDir, goal } = setupFlowRepo({
      process: { ingestion: [{ id: "branch" }, { id: "front" }] },
      classYaml: null,
    });
    try {
      fs.writeFileSync(infraPath(goalDir), "gates: 7\n");
      const harness = new FakeHarness({ id: "fake" });
      harness.script(biggerFront(goalDir), {
        when: whenTurn({ step: "front" }),
      });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const result = await runFront(runtime, {
        iteration: 1,
        state: await emptyState(runtime),
      });
      expect(result.action).toBe("infra");
      expect(result.cause).toContain(infraPath(goalDir));
      expect(result.cause).toContain("gates");
    } finally {
      cleanupFlowRepo(repo);
    }
  });

  it("reads no report when the turn wrote none", async () => {
    const { repo, goalDir } = await runBiggerFront({ infra: null });
    try {
      expect(readInfra(goalDir)).toBeUndefined();
      expect(resolveGates(goalDir, [])).toEqual([]);
    } finally {
      cleanupFlowRepo(repo);
    }
  });
});
