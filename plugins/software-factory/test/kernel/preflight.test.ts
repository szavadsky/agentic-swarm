import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createRealHarnesses } from "../../src/cli/harnesses.js";
import { FakeHarness } from "../../src/harness/fake/index.js";
import type { Harness } from "../../src/harness/types.js";
import { loadConfigs, resolveGoalPaths } from "../../src/kernel/config.js";
import {
  PreflightError,
  type PreflightInput,
  preflight,
} from "../../src/kernel/preflight.js";
import { runGoal } from "../../src/kernel/launch.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";

const RUN_HEAD_NO_HIGHEST_WITH_HIGHEST = `aliases:
  architect: { harness: fake, model: arch, effort: highest }
  pm: { harness: fake, model: pm }
  digest: { harness: fake, model: digest }
  implementer: { harness: fake, model: impl }
  implementer-b: { harness: fake, model: impl-b }
  researcher: { harness: fake, model: research }
  reviewer: { harness: fake, model: rev }
  qa: { harness: fake, model: qa }
  steward: { harness: fake, model: steward }
  plan-checker: { harness: fake, model: check }
  intent: { harness: fake, model: intent }
  plan-reviewer: { harness: fake, model: plan-review }
  pack-preparer: { harness: fake, model: pack-prep }
limits: { concurrency: { overall: 2 }, iterations: 1 }
`;

const RUN_HEAD_NO_HIGHEST = `aliases:
  architect: { harness: fake, model: arch, effort: max }
  pm: { harness: fake, model: pm }
  digest: { harness: fake, model: digest }
  implementer: { harness: fake, model: impl }
  implementer-b: { harness: fake, model: impl-b }
  researcher: { harness: fake, model: research }
  reviewer: { harness: fake, model: rev }
  qa: { harness: fake, model: qa }
  steward: { harness: fake, model: steward }
  plan-checker: { harness: fake, model: check }
  intent: { harness: fake, model: intent }
  plan-reviewer: { harness: fake, model: plan-review }
  pack-preparer: { harness: fake, model: pack-prep }
limits: { concurrency: { overall: 2 }, iterations: 1 }
`;

interface Fixture {
  repo: TmpRepo;
  configs: ReturnType<typeof loadConfigs>;
  paths: ReturnType<typeof resolveGoalPaths>;
  input: PreflightInput;
}

async function fixture(
  runYaml = RUN_HEAD_NO_HIGHEST,
  repoYaml?: string,
  processYaml?: string,
): Promise<Fixture> {
  const repo = createTmpRepo();
  const base = path.basename(repo.dir);
  const run = runYaml
    .replaceAll("WORKTREE_ROOT", `../${base}-wt`)
    .replaceAll("SESSIONS_DIR", `../${base}-sessions`);
  repo.writeFile(
    ".factory/repo.yaml",
    repoYaml ??
      "baseBranch: main\nartifactRoot: .factory/artifacts\nsetup: []\ngates: []\n",
  );
  repo.writeFile(".factory/run.yaml", run);
  if (processYaml !== undefined)
    repo.writeFile(".factory/process.yaml", processYaml);
  repo.commit("factory config");
  const configs = loadConfigs(repo.dir);
  const paths = resolveGoalPaths(configs, repo.dir, "demo");
  fs.mkdirSync(paths.goalDir, { recursive: true });
  fs.writeFileSync(path.join(paths.goalDir, "intent.md"), "# Goal\n", "utf8");
  const store = createFolderStore(
    paths.goalDir,
    undefined,
    configs.process.taskTypes ?? {},
  );
  await store.ensureLayout();
  const harness = new FakeHarness({
    id: "fake",
    probe: { effort: ["low", "high", "max"] },
  });
  const harnesses = new Map<string, Harness>([["fake", harness]]);
  return { repo, configs, paths, input: { configs, paths, store, harnesses } };
}

async function refusal(input: PreflightInput): Promise<PreflightError> {
  try {
    await preflight(input);
  } catch (err) {
    expect(err).toBeInstanceOf(PreflightError);
    return err as PreflightError;
  }
  throw new Error("pre-flight unexpectedly passed");
}

function registerPreFlightPart1(): void {
  it("refuses an effort outside the probe's list", async () => {
    const f = await fixture(RUN_HEAD_NO_HIGHEST_WITH_HIGHEST);
    try {
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          key: "aliases.architect.effort",
          message:
            'effort "highest" is not supported; model accepts: low, high, max',
        }),
      );
    } finally {
      f.repo.cleanup();
    }
  });

  it("keeps the authored effort untouched after a pass", async () => {
    const f = await fixture(RUN_HEAD_NO_HIGHEST);
    try {
      await preflight(f.input);
      expect(f.configs.run.aliases.architect!.effort).toBe("max");
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart2(): void {
  it("refuses malformed acpx option shapes, naming the key", async () => {
    const runYaml = `${RUN_HEAD_NO_HIGHEST}harnesses:
  opencode:
    acpx: { agent: opencode }
    options:
      args: "--approve-all"
      env: { TOKEN: 1 }
      approveAll: true
`;
    const f = await fixture(runYaml);
    try {
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual({
        file: path.join(f.repo.dir, ".factory", "run.yaml"),
        key: "harnesses.opencode.options.args",
        message: 'Invalid "args" option: expected string array, got string',
      });
      expect(err.findings).toContainEqual({
        file: path.join(f.repo.dir, ".factory", "run.yaml"),
        key: "harnesses.opencode.options.env",
        message:
          'Invalid "env" option: expected string-to-string object, got object with non-string values',
      });
      expect(
        err.findings.some(
          (finding) => finding.key === "harnesses.opencode.options.approveAll",
        ),
      ).toBe(false);
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart3(): void {
  it("runGoal reports malformed acpx options before constructing adapters", async () => {
    const runYaml = `${RUN_HEAD_NO_HIGHEST}worktreeRoot: WORKTREE_ROOT
sessions: { dir: SESSIONS_DIR }
harnesses:
  opencode:
    acpx: { agent: opencode }
    options: { args: "--approve-all" }
`;
    const f = await fixture(runYaml);
    try {
      const failed = await runGoal({
        repo: f.repo.dir,
        goal: "demo",
        iterations: 1,
        harnessFactory: createRealHarnesses,
        baseGates: false,
      }).catch((err) => err);
      expect(failed).toBeInstanceOf(PreflightError);
      expect((failed as PreflightError).findings).toContainEqual({
        file: path.join(f.repo.dir, ".factory", "run.yaml"),
        key: "harnesses.opencode.options.args",
        message: 'Invalid "args" option: expected string array, got string',
      });
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart4(): void {
  it("accepts string acpx args and env and leaves other option keys opaque", async () => {
    const runYaml = `${RUN_HEAD_NO_HIGHEST}harnesses:
  opencode:
    acpx: { agent: opencode }
    options:
      args: ["--approve-all"]
      env: { TOKEN: "value" }
      approveAll: true
`;
    const f = await fixture(runYaml);
    try {
      await expect(preflight(f.input)).resolves.toBeDefined();
    } finally {
      f.repo.cleanup();
    }
  });

  it("reports a task type naming an unconfigured flow", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST,
      undefined,
      "taskTypes:\n  odd: { flow: no-such-flow, kind: development, schema: outcome }\n",
    );
    try {
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          file: path.join(f.repo.dir, ".factory/process.yaml"),
          key: "taskTypes.odd.flow",
          message: 'flow "no-such-flow" is not configured',
        }),
      );
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart5(): void {
  it("treats a former sentinel as an ordinary level the probe must list", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace("effort: max", "effort: harness-default"),
    );
    try {
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          key: "aliases.architect.effort",
          message:
            'effort "harness-default" is not supported; model accepts: low, high, max',
        }),
      );
    } finally {
      f.repo.cleanup();
    }
  });

  it("reports a task type naming a prototype-key flow", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST,
      undefined,
      "taskTypes:\n  odd: { flow: toString, kind: development, schema: outcome }\n",
    );
    try {
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          file: path.join(f.repo.dir, ".factory/process.yaml"),
          key: "taskTypes.odd.flow",
          message: 'flow "toString" is not configured',
        }),
      );
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart6(): void {
  it("reports a task type naming an unknown output schema", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST,
      undefined,
      "taskTypes:\n  odd: { flow: implement-review, kind: development, schema: nope }\n",
    );
    try {
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          file: path.join(f.repo.dir, ".factory/process.yaml"),
          key: "taskTypes.odd.schema",
          message: 'schema "nope" is not a kernel outcome schema (outcome, qa)',
        }),
      );
    } finally {
      f.repo.cleanup();
    }
  });

  it("reports a task type naming a prototype-key output schema", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST,
      undefined,
      "taskTypes:\n  odd: { flow: implement-review, kind: development, schema: constructor }\n",
    );
    try {
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          file: path.join(f.repo.dir, ".factory/process.yaml"),
          key: "taskTypes.odd.schema",
          message:
            'schema "constructor" is not a kernel outcome schema (outcome, qa)',
        }),
      );
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart7(): void {
  it("accepts a task type whose flow and schema exist", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST,
      undefined,
      "taskTypes:\n  docs: { flow: just-implement, kind: development, schema: outcome }\n",
    );
    try {
      await preflight(f.input);
    } finally {
      f.repo.cleanup();
    }
  });

  it("reports a renamed boundary alias missing from the run config", async () => {
    const f = await fixture();
    try {
      f.configs.process.boundary.architect = {
        prompt: "architect",
        alias: "boss",
      };
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          file: path.join(f.repo.dir, ".factory/run.yaml"),
          key: "aliases.boss",
        }),
      );
      expect(err.report).toContain("aliases.boss");
      expect(err.report).toContain('boundary step "architect"');
      expect(err.report).toContain(".factory/run.yaml");
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart8(): void {
  it("refuses an alternate alias the flow step names", async () => {
    const f = await fixture();
    try {
      f.configs.process.flows["implement-review"]!.steps[0]!.alternates = [
        "implementer-backup",
      ];
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual({
        file: path.join(f.repo.dir, ".factory/run.yaml"),
        key: "aliases.implementer-backup",
        message:
          'required by flow "implement-review" step "implement" alternates but missing',
      });
    } finally {
      f.repo.cleanup();
    }
  });

  it("refuses a different-model follow-up alias the step names", async () => {
    const f = await fixture();
    try {
      f.configs.process.flows["implement-review"]!.steps[0]!.followUp = {
        mode: "different-model",
        alias: "implementer-backup",
        keepSession: true,
      };
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual({
        file: path.join(f.repo.dir, ".factory/run.yaml"),
        key: "aliases.implementer-backup",
        message:
          'required by flow "implement-review" step "implement" follow-up but missing',
      });
    } finally {
      f.repo.cleanup();
    }
  });
}

describe("pre-flight", () => {
  registerPreFlightPart1();

  registerPreFlightPart2();

  registerPreFlightPart3();

  registerPreFlightPart4();

  registerPreFlightPart5();

  registerPreFlightPart6();

  registerPreFlightPart7();

  registerPreFlightPart8();
});
