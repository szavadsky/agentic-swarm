import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createRealHarnesses,
  resolveHarnessBinaries,
} from "../../src/cli/harnesses.js";
import { FakeHarness } from "../../src/harness/fake/index.js";
import type { Harness, ModelProbe, ModelRef } from "../../src/harness/types.js";
import { recordedBaseGates } from "../../src/kernel/baseline.js";
import {
  ConfigError,
  loadConfigs,
  resolveGoalPaths,
} from "../../src/kernel/config.js";
import {
  fallbackAliasFindings,
  type ModelCatalog,
  PreflightError,
  type PreflightInput,
  preflight,
} from "../../src/kernel/preflight.js";
import { runGoal } from "../../src/kernel/launch.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { testPriceSource } from "../helpers/price-source.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { task } from "./helpers.js";

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

/** Architect and implementer on different harnesses; omp is the scouts consumer. */
const SPLIT_HARNESSES = RUN_HEAD_NO_HIGHEST.replace(
  "architect: { harness: fake, model: arch, effort: max }",
  "architect: { harness: claude-code, model: arch }",
).replace(
  "implementer: { harness: fake, model: impl }",
  "implementer: { harness: omp, model: impl }",
);

function splitHarnesses(f: Fixture): Map<string, Harness> {
  const harnesses = new Map(f.input.harnesses);
  harnesses.set("claude-code", new FakeHarness({ id: "claude-code" }));
  harnesses.set(
    "omp",
    new FakeHarness({
      id: "omp",
      caps: { effort: ["low", "medium", "high", "max"] },
    }),
  );
  return harnesses;
}

function withScouts(runYaml: string, scouts: string): string {
  return runYaml.replace("limits:", `${scouts}\nlimits:`);
}

/** A fake harness whose live session probe is its only model source. */
class ProbeHarness extends FakeHarness {
  constructor(
    id: string,
    private readonly models: readonly string[],
  ) {
    super({ id });
  }

  async probe(model: ModelRef): Promise<ModelProbe> {
    return {
      listed: this.models.includes(model.id),
      available: [...this.models],
      effort: [],
    };
  }
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
    caps: { effort: ["low", "high", "max"] },
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

describe("pre-flight", () => {
  registerPreFlightPart1();
  registerPreFlightPart2();
  registerPreFlightPart3();
  registerPreFlightPart4();
  registerPreFlightPart5();
  registerPreFlightPart6();
  registerPreFlightPart7();
  registerPreFlightPart8();
  registerPreFlightPart9();
  registerPreFlightPart10();
  registerPreFlightPart11();
  registerPreFlightPart12();
  registerPreFlightPart13();
  registerPreFlightPart14();
  registerPreFlightPart15();
  registerPreFlightPart16();
  registerPreFlightPart17();
  registerPreFlightPart18();
  registerPreFlightPart19();
  registerPreFlightPart20();
  registerPreFlightPart21();
  registerPreFlightPart22();
  registerPreFlightPart23();
  registerPreFlightPart24();
  registerPreFlightPart25();
  registerPreFlightPart26();
  registerPreFlightPart27();
  registerPreFlightPart28();
  registerPreFlightPart29();
  registerPreFlightPart30();
  registerPreFlightPart31();
  registerPreFlightPart32();
  registerPreFlightPart33();
  registerPreFlightPart34();
  registerPreFlightPart35();
  registerPreFlightPart36();
  registerPreFlightPart37();
  registerPreFlightPart38();
  registerPreFlightPart39();
  registerPreFlightPart40();
  registerPreFlightPart41();
  registerPreFlightPart42();
  registerPreFlightPart43();
  registerPreFlightPart44();
  registerPreFlightPart45();
  registerPreFlightPart46();
  registerPreFlightPart47();
  registerPreFlightPart48();
  registerPreFlightPart49();
  registerPreFlightPart50();
});

describe("configuration report", () => {
  it("collects every violation across layers into one report with file and key", () => {
    const repo = createTmpRepo();
    try {
      repo.writeFile(".factory/repo.yaml", "baseBranch: main\ngates: nope\n");
      repo.writeFile(
        ".factory/run.yaml",
        "aliases:\n  architect: { harness: 7, model: x }\nlimits: { iterations: 0 }\n",
      );
      repo.commit("broken config");
      try {
        loadConfigs(repo.dir);
        throw new Error("loadConfigs unexpectedly passed");
      } catch (err) {
        expect(err).toBeInstanceOf(ConfigError);
        const error = err as ConfigError;
        const keys = error.findings.map(
          (f) => `${path.basename(f.file)}:${f.key}`,
        );
        expect(keys).toContain("repo.yaml:gates");
        expect(keys).toContain("run.yaml:aliases.architect.harness");
        expect(keys).toContain("run.yaml:limits.iterations");
        expect(error.report).toContain("3 violation(s)");
      }
    } finally {
      repo.cleanup();
    }
  });
});

describe("pre-flight artifact LSP", () => {
  const scope1 = preFlightArtifactLSPPart1();
  preFlightArtifactLSPPart2(scope1);
});

function preFlightArtifactLSPPart1() {
  const binaries = {
    omp: process.execPath,
    fake: process.execPath,
    "claude-code": process.execPath,
  };

  /** A PATH with git only: the base check still runs, the YAML server does not. */
  function toolPath(dir: string): void {
    const git = Bun.which("git");
    if (!git) throw new Error("git is not on PATH");
    fs.symlinkSync(git, path.join(dir, "git"));
  }

  function withPath<T>(dir: string, fn: () => Promise<T>): Promise<T> {
    const saved = process.env.PATH;
    process.env.PATH = dir;
    return fn().finally(() => {
      process.env.PATH = saved;
    });
  }

  it("refuses omp with lsp enabled when the YAML server is not on PATH", async () => {
    const f = await fixture(
      SPLIT_HARNESSES.replace("limits:", "lsp: true\nlimits:"),
    );
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "no-yamlls-"));
    toolPath(empty);
    try {
      const err = await withPath(empty, () =>
        refusal({ ...f.input, harnesses: splitHarnesses(f), binaries }),
      );
      expect(err.findings).toContainEqual({
        file: path.join(f.repo.dir, ".factory/run.yaml"),
        key: "lsp",
        message:
          'lsp is enabled but "yaml-language-server" is not on PATH: omp does not ship the YAML language server',
      });
    } finally {
      f.repo.cleanup();
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });

  return { binaries, toolPath, withPath };
}

function preFlightArtifactLSPPart2(
  scope: ReturnType<typeof preFlightArtifactLSPPart1>,
) {
  const { toolPath, withPath, binaries } = scope;
  it("passes when the YAML server is on PATH", async () => {
    const f = await fixture(
      SPLIT_HARNESSES.replace("limits:", "lsp: true\nlimits:"),
    );
    const bin = fs.mkdtempSync(path.join(os.tmpdir(), "has-yamlls-"));
    toolPath(bin);
    fs.writeFileSync(path.join(bin, "yaml-language-server"), "#!/bin/sh\n", {
      mode: 0o755,
    });
    try {
      await withPath(bin, () =>
        preflight({ ...f.input, harnesses: splitHarnesses(f), binaries }),
      );
    } finally {
      f.repo.cleanup();
      fs.rmSync(bin, { recursive: true, force: true });
    }
  });

  it("does not check the YAML server for harnesses without an LSP surface", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace("limits:", "lsp: true\nlimits:"),
    );
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "no-yamlls-fake-"));
    toolPath(empty);
    try {
      const result = await withPath(empty, () =>
        preflight({ ...f.input, binaries }),
      );
      expect(result.aliases.architect).toBe("max");
    } finally {
      f.repo.cleanup();
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
}

function registerPreFlightPart1(): void {
  it("refuses effort: highest", async () => {
    const f = await fixture(RUN_HEAD_NO_HIGHEST_WITH_HIGHEST);
    try {
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          key: "aliases.architect.effort",
        }),
      );
    } finally {
      f.repo.cleanup();
    }
  });

  it("resolves effort: max to max", async () => {
    const f = await fixture(RUN_HEAD_NO_HIGHEST);
    try {
      const result = await preflight(f.input);
      expect(result.aliases.architect).toBe("max");
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
  it("passes harness-default as no effort override", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace("effort: max", "effort: harness-default"),
    );
    try {
      const result = await preflight(f.input);
      expect(result.aliases.architect).toBeUndefined();
      expect(f.configs.run.aliases.architect!.effort).toBeUndefined();
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

function registerPreFlightPart9(): void {
  it("refuses a follow-up on a trivial-flow step, naming the step", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST,
      undefined,
      "flows:\n  just-implement:\n    steps:\n      - id: implement\n        prompt: implementer\n        alias: implementer\n        followUp: { mode: de-novo }\n      - id: resolve\n        prompt: steward\n        alias: steward\n",
    );
    try {
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual({
        file: path.join(f.repo.dir, ".factory", "process.yaml"),
        key: "flows.just-implement.steps.implement.followUp",
        message:
          'step "implement" of flow "just-implement" declares a follow-up, but a trivial task implements in the front\'s session and never follows up',
      });
    } finally {
      f.repo.cleanup();
    }
  });

  it("accepts a follow-up on a flow that runs its own steps", async () => {
    const f = await fixture();
    try {
      f.configs.process.flows["implement-review"]!.steps[0]!.followUp = {
        mode: "different-model",
        alias: "implementer-b",
      };
      await expect(preflight(f.input)).resolves.toBeDefined();
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart10(): void {
  for (const [step, alias] of [
    ["packprep", "pack-preparer"],
    ["plancheck", "plan-checker"],
  ] as const) {
    it(`refuses the missing ${alias} alias its boundary step names`, async () => {
      const f = await fixture();
      try {
        delete f.configs.run.aliases[alias];
        const err = await refusal(f.input);
        expect(err.findings).toContainEqual({
          file: path.join(f.repo.dir, ".factory/run.yaml"),
          key: `aliases.${alias}`,
          message: `required by boundary step "${step}" but missing`,
        });
        expect(err.report).toContain(`aliases.${alias}`);
        expect(err.report).toContain(`boundary step "${step}"`);
      } finally {
        f.repo.cleanup();
      }
    });
  }

  it("refuses the missing plan reviewer alias the architecture flow names", async () => {
    const f = await fixture();
    try {
      delete f.configs.run.aliases["plan-reviewer"];
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual({
        file: path.join(f.repo.dir, ".factory/run.yaml"),
        key: "aliases.plan-reviewer",
        message: "required by architecture reviewer but missing",
      });
      expect(err.report).toContain("architecture reviewer");
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart11(): void {
  it("requires only the aliases process config names, not role names", async () => {
    const f = await fixture();
    try {
      // The PM and front boundaries name `escalation`; the role names `pm` and
      // `front` are not required, so removing them changes nothing.
      f.configs.process.boundary.pm = { prompt: "pm", alias: "escalation" };
      f.configs.process.boundary.front = {
        prompt: "front",
        alias: "escalation",
      };
      f.configs.run.aliases.escalation = { harness: "fake", model: "esc" };
      delete f.configs.run.aliases.pm;
      const result = await preflight(f.input);
      expect(result.aliases.architect).toBe("max");
      expect(f.configs.run.aliases.front).toBeUndefined();
    } finally {
      f.repo.cleanup();
    }
  });

  it("refuses an effort level the model does not accept", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace("effort: max", "effort: ultra"),
    );
    try {
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          key: "aliases.architect.effort",
          file: expect.stringContaining(".factory/run.yaml"),
        }),
      );
      expect(err.report).toContain('effort "ultra" is not supported');
      expect(err.report).toContain("low, high, max");
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart12(): void {
  it("refuses a model the harness does not list and a missing fallback", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace("model: pm", "model: ghost").replace(
        "model: arch",
        "model: arch, fallbacks: [{ model: gone/model }]",
      ),
    );
    try {
      const catalog: ModelCatalog = async (_harness, model) =>
        model !== "ghost" && model !== "gone/model";
      const err = await refusal({ ...f.input, catalog });
      const keys = err.findings.map((x) => x.key);
      expect(keys).toContain("aliases.pm.model");
      expect(keys).toContain("aliases.architect.fallbacks.0.model");
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart13(): void {
  it("validates a cross-harness fallback against its own harness", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace(
        "implementer: { harness: fake, model: impl }",
        "implementer: { harness: fake, model: impl, fallbacks: [{ harness: other, model: far }] }",
      ),
    );
    try {
      const harnesses = new Map(f.input.harnesses);
      harnesses.set("other", new FakeHarness({ id: "other" }));
      const catalog: ModelCatalog = async (harness, model) =>
        !(harness === "other" && model === "far");
      const err = await refusal({ ...f.input, harnesses, catalog });
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          key: "aliases.implementer.fallbacks.0.model",
          message: 'fallback "far" is not listed by harness "other"',
        }),
      );
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart14(): void {
  it("passes an @-prefixed omp alias the catalog does not list", async () => {
    const f = await fixture(
      SPLIT_HARNESSES.replace("model: impl }", 'model: "@free" }'),
    );
    try {
      const seen: string[] = [];
      const catalog: ModelCatalog = async (harness, model) => {
        seen.push(`${harness}/${model}`);
        return model !== "@free";
      };
      const result = await preflight({
        ...f.input,
        harnesses: splitHarnesses(f),
        catalog,
      });
      expect(result.aliases.implementer).toBeUndefined();
      expect(seen).not.toContain("omp/@free");
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart15(): void {
  it("passes auto on an @-prefixed omp alias", async () => {
    const f = await fixture(
      SPLIT_HARNESSES.replace(
        "model: impl }",
        'model: "@free", effort: auto }',
      ),
    );
    try {
      const catalog: ModelCatalog = async (_harness, model) =>
        model !== "@free";
      const result = await preflight({
        ...f.input,
        harnesses: splitHarnesses(f),
        catalog,
      });
      expect(result.aliases.implementer).toBe("auto");
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart16(): void {
  it("refuses effort: highest on an @-prefixed omp alias, naming the alias and omp's levels", async () => {
    const f = await fixture(
      SPLIT_HARNESSES.replace(
        "model: impl }",
        'model: "@free", effort: highest }',
      ),
    );
    try {
      const err = await refusal({ ...f.input, harnesses: splitHarnesses(f) });
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          file: f.configs.files?.run,
          key: "aliases.implementer.effort",
          message:
            'effort "highest" is not an omp thinking level; alias "@free" accepts: off, minimal, low, medium, high, xhigh, max, auto',
        }),
      );
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart17(): void {
  it("refuses an effort omp does not parse on an @-prefixed omp alias", async () => {
    const f = await fixture(
      SPLIT_HARNESSES.replace(
        "model: impl }",
        'model: "@free", effort: ultra }',
      ),
    );
    try {
      const err = await refusal({ ...f.input, harnesses: splitHarnesses(f) });
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          key: "aliases.implementer.effort",
          message:
            'effort "ultra" is not an omp thinking level; alias "@free" accepts: off, minimal, low, medium, high, xhigh, max, auto',
        }),
      );
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart18(): void {
  it("validates a literal level on a plain omp model through the catalog", async () => {
    const f = await fixture(
      SPLIT_HARNESSES.replace("model: impl }", "model: impl, effort: max }"),
    );
    try {
      const seen: string[] = [];
      const catalog: ModelCatalog = async (harness, model) => {
        seen.push(`${harness}/${model}`);
        return true;
      };
      const result = await preflight({
        ...f.input,
        harnesses: splitHarnesses(f),
        catalog,
      });
      expect(seen).toContain("omp/impl");
      expect(result.aliases.implementer).toBe("max");
      expect(f.configs.run.aliases.implementer?.effort).toBe("max");
    } finally {
      f.repo.cleanup();
    }
  });

  it("accepts auto on a plain omp model whose caps do not list it", async () => {
    const f = await fixture(
      SPLIT_HARNESSES.replace("model: impl }", "model: impl, effort: auto }"),
    );
    try {
      const catalog: ModelCatalog = async () => true;
      const result = await preflight({
        ...f.input,
        harnesses: splitHarnesses(f),
        catalog,
      });
      expect(result.aliases.implementer).toBe("auto");
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart19(): void {
  it("still refuses an unlisted plain omp model id", async () => {
    const f = await fixture(SPLIT_HARNESSES);
    try {
      const catalog: ModelCatalog = async (harness, model) =>
        !(harness === "omp" && model === "impl");
      const err = await refusal({
        ...f.input,
        harnesses: splitHarnesses(f),
        catalog,
      });
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          key: "aliases.implementer.model",
          message: 'model "impl" is not listed by harness "omp"',
        }),
      );
    } finally {
      f.repo.cleanup();
    }
  });

  it("still refuses an @-prefixed model on a non-omp harness", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace("model: pm", 'model: "@free"'),
    );
    try {
      const catalog: ModelCatalog = async (_harness, model) =>
        model !== "@free";
      const err = await refusal({ ...f.input, catalog });
      expect(err.findings.map((x) => x.key)).toContain("aliases.pm.model");
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart20(): void {
  it("checks scouts against omp, not the architect's harness", async () => {
    const f = await fixture(
      withScouts(SPLIT_HARNESSES, "scouts: { model: ernie, effort: max }"),
    );
    try {
      const seen: string[] = [];
      const catalog: ModelCatalog = async (harness, model) => {
        seen.push(`${harness}/${model}`);
        return true;
      };
      const result = await preflight({
        ...f.input,
        harnesses: splitHarnesses(f),
        catalog,
      });
      expect(result.aliases.scouts).toBe("max");
      expect(f.configs.run.scouts!.effort).toBe("max");
      expect(seen).toContain("omp/ernie");
      expect(seen).not.toContain("claude-code/ernie");
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart21(): void {
  it("refuses a scouts model omp does not list, naming omp", async () => {
    const f = await fixture(
      withScouts(SPLIT_HARNESSES, "scouts: { model: ernie }"),
    );
    try {
      const catalog: ModelCatalog = async (harness, model) =>
        harness !== "omp" || model === "impl";
      const err = await refusal({
        ...f.input,
        harnesses: splitHarnesses(f),
        catalog,
      });
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          key: "scouts.model",
          message: 'model "ernie" is not listed by harness "omp"',
        }),
      );
      expect(err.report).toContain('harness "omp"');
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart22(): void {
  it("refuses a scouts block when no alias or fallback runs on omp", async () => {
    const f = await fixture(
      withScouts(RUN_HEAD_NO_HIGHEST, "scouts: { model: ernie }"),
    );
    try {
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          file: path.join(f.repo.dir, ".factory/run.yaml"),
          key: "scouts",
          message: expect.stringContaining("no harness consumes it"),
        }),
      );
      expect(err.report).toContain('harness "omp"');
    } finally {
      f.repo.cleanup();
    }
  });

  it("accepts scouts when only a fallback tier runs on omp", async () => {
    const f = await fixture(
      withScouts(
        SPLIT_HARNESSES.replace(
          "implementer: { harness: omp, model: impl }",
          "implementer: { harness: fake, model: impl, fallbacks: [{ harness: omp, model: impl-omp }] }",
        ),
        "scouts: { model: ernie }",
      ),
    );
    try {
      const seen: string[] = [];
      const catalog: ModelCatalog = async (harness, model) => {
        seen.push(`${harness}/${model}`);
        return true;
      };
      await preflight({ ...f.input, harnesses: splitHarnesses(f), catalog });
      expect(seen).toContain("omp/ernie");
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart23(): void {
  it("refuses a fallback on an unregistered harness", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace(
        "implementer: { harness: fake, model: impl }",
        "implementer: { harness: fake, model: impl, fallbacks: [{ harness: ghost, model: far }] }",
      ),
    );
    try {
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          key: "aliases.implementer.fallbacks.0.harness",
        }),
      );
      expect(err.report).toContain('harness "ghost" is not registered');
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart24(): void {
  it("refuses a portability edge naming an unregistered harness", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace(
        "limits:",
        "portability:\n  - { from: ghost, to: fake }\n  - { from: fake, to: phantom }\nlimits:",
      ),
    );
    try {
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          key: "portability.0.from",
          message: 'harness "ghost" is not registered (registered: fake)',
        }),
      );
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          key: "portability.1.to",
          message: 'harness "phantom" is not registered (registered: fake)',
        }),
      );
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart25(): void {
  it("resolves each fallback effort against its own harness caps", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace(
        "implementer: { harness: fake, model: impl }",
        "implementer: { harness: fake, model: impl, effort: max, fallbacks: [{ harness: other, model: far, effort: high }, { model: near }] }",
      ),
    );
    try {
      const harnesses = new Map(f.input.harnesses);
      harnesses.set(
        "other",
        new FakeHarness({ id: "other", caps: { effort: ["low", "high"] } }),
      );
      const result = await preflight({ ...f.input, harnesses });
      expect(result.aliases.implementer).toBe("max");
      const fallbacks = f.configs.run.aliases.implementer!.fallbacks!;
      expect(fallbacks[0]).toMatchObject({ effort: "high" });
      expect(fallbacks[1]).toMatchObject({ effort: "max" });
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart26(): void {
  it("validates every rotation entry's harness, model and effort", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace(
        "implementer: { harness: fake, model: impl }",
        `implementer:
    harness: fake
    model: impl
    rotate:
      - { harness: other, model: far }
      - { harness: fake, model: ghost }
      - { harness: fake, model: impl, effort: ultra }
      - { harness: ghost, model: far }`,
      ),
    );
    try {
      const harnesses = new Map(f.input.harnesses);
      harnesses.set("other", new FakeHarness({ id: "other" }));
      const catalog: ModelCatalog = async (_harness, model) =>
        model !== "ghost";
      const err = await refusal({ ...f.input, harnesses, catalog });
      const keys = err.findings.map((finding) => finding.key);
      expect(keys).toContain("aliases.implementer.rotate.1.model");
      expect(keys).toContain("aliases.implementer.rotate.2.effort");
      expect(keys).toContain("aliases.implementer.rotate.3.harness");
      expect(keys).not.toContain("aliases.implementer.rotate.0.model");
      expect(err.report).toContain(
        'rotation "ghost" is not listed by harness "fake"',
      );
      expect(err.report).toContain('effort "ultra" is not supported');
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart27(): void {
  it("resolves a rotated entry's effort against its own harness and checks a rotating fallback everywhere it can land", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace(
        "implementer: { harness: fake, model: impl }",
        `implementer:
    harness: fake
    model: impl
    effort: max
    rotate:
      - { harness: other, model: far, effort: high }
      - { harness: fake, model: near, effort: max }
    fallbacks:
      - { model: near }`,
      ),
    );
    try {
      const harnesses = new Map(f.input.harnesses);
      harnesses.set(
        "other",
        new FakeHarness({ id: "other", caps: { effort: ["low", "high"] } }),
      );
      const catalog: ModelCatalog = async (harness, model) =>
        !(harness === "other" && model === "near");
      const err = await refusal({ ...f.input, harnesses, catalog });
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          key: "aliases.implementer.fallbacks.0.model",
          message: 'fallback "near" is not listed by harness "other"',
        }),
      );
      const entries = f.configs.run.aliases.implementer!.rotate!;
      expect(entries[0]!.effort).toBe("high");
      expect(entries[1]!.effort).toBe("max");
      const rotating = f.configs.run.aliases.implementer!.fallbacks![0]!;
      expect("model" in rotating ? rotating.effort : undefined).toBeUndefined();
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart28(): void {
  it("refuses a subscription that names no capped pool", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace(
        "implementer: { harness: fake, model: impl }",
        "implementer: { harness: fake, model: impl, subscription: typo, fallbacks: [{ model: near, subscription: other-typo }] }",
      ).replace(
        "limits: { concurrency: { overall: 2 }, iterations: 1 }",
        "limits: { concurrency: { overall: 2, perSubscription: { pool: 1 } }, iterations: 1 }",
      ),
    );
    try {
      const err = await refusal(f.input);
      const keys = err.findings.map((x) => x.key);
      expect(keys).toContain("aliases.implementer.subscription");
      expect(keys).toContain("aliases.implementer.fallbacks.0.subscription");
    } finally {
      f.repo.cleanup();
    }
  });

  it("refuses an absent harness binary and names its config key", async () => {
    const f = await fixture();
    try {
      const err = await refusal({ ...f.input, binaries: { fake: undefined } });
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          key: "harnesses.fake.binary",
          message: 'binary "fake" is not executable or not on PATH',
        }),
      );
      expect(err.report).toContain("harnesses.fake.binary");
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart29(): void {
  it("refuses a configured omp binary that is missing, naming the path", async () => {
    const configured = path.join(os.tmpdir(), `missing-omp-${process.pid}`);
    expect(fs.existsSync(configured)).toBe(false);
    const f = await fixture(
      SPLIT_HARNESSES.replace(
        "limits:",
        `harnesses:\n  omp:\n    binary: ${configured}\nlimits:`,
      ),
    );
    try {
      const err = await refusal({
        ...f.input,
        harnesses: splitHarnesses(f),
        binaries: {
          ...resolveHarnessBinaries(f.configs.run.harnesses),
          "claude-code": process.execPath,
        },
      });
      const finding = err.findings.find(
        (x) => x.key === "harnesses.omp.binary",
      );
      expect(finding?.message).toContain(configured);
      expect(err.report).toContain("harnesses.omp.binary");
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart30(): void {
  it("names acpx and the bunx route when an acpx alias has no binary", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace(
        "implementer: { harness: fake, model: impl }",
        "implementer: { harness: pi, model: impl }",
      ),
    );
    try {
      const harnesses = new Map(f.input.harnesses);
      harnesses.set("pi", new FakeHarness({ id: "pi" }));
      // resolveAcpxCommand falls back to a bunx executable when acpx is absent;
      // a missing bunx is the host state where that on-demand route cannot run.
      const err = await refusal({
        ...f.input,
        harnesses,
        binaries: { fake: process.execPath, pi: "/nonexistent/bin/bunx" },
      });
      const finding = err.findings.find((x) => x.key === "harnesses.pi.binary");
      expect(finding?.message).toContain("acpx");
      expect(finding?.message).toContain("bunx acpx");
      expect(err.report).toContain("bunx acpx");
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart31(): void {
  it("checks a raw agent's configured acpx dispatcher and its agent head", async () => {
    const configured = path.join(os.tmpdir(), `missing-acpx-${process.pid}`);
    expect(fs.existsSync(configured)).toBe(false);
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace(
        "implementer: { harness: fake, model: impl }",
        "implementer: { harness: opencode, model: impl }",
      ).replace(
        "limits:",
        `harnesses:\n  opencode:\n    binary: ${configured}\n    acpx: { agent: opencode acp, raw: true }\nlimits:`,
      ),
    );
    try {
      const harnesses = new Map(f.input.harnesses);
      harnesses.set("opencode", new FakeHarness({ id: "opencode" }));
      const err = await refusal({
        ...f.input,
        harnesses,
        binaries: { fake: process.execPath, opencode: process.execPath },
      });
      const finding = err.findings.find(
        (x) => x.key === "harnesses.opencode.binary",
      );
      expect(finding?.message).toContain(configured);
      expect(err.findings.some((x) => x.key.endsWith(".acpx.agent"))).toBe(
        false,
      );
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart32(): void {
  it("names a raw agent's missing executable and its agent key", async () => {
    const missing = path.join(os.tmpdir(), `missing-agent-${process.pid}`);
    expect(fs.existsSync(missing)).toBe(false);
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace(
        "implementer: { harness: fake, model: impl }",
        "implementer: { harness: opencode, model: impl }",
      ).replace(
        "limits:",
        `harnesses:\n  opencode:\n    binary: ${process.execPath}\n    acpx: { agent: opencode acp, raw: true }\nlimits:`,
      ),
    );
    try {
      const harnesses = new Map(f.input.harnesses);
      harnesses.set("opencode", new FakeHarness({ id: "opencode" }));
      const err = await refusal({
        ...f.input,
        harnesses,
        binaries: { fake: process.execPath, opencode: missing },
      });
      const finding = err.findings.find(
        (x) => x.key === "harnesses.opencode.acpx.agent",
      );
      expect(finding?.message).toContain(missing);
      expect(
        err.findings.some((x) => x.key === "harnesses.opencode.binary"),
      ).toBe(false);
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart33(): void {
  it("refuses a task tier that names no alias, ignoring `default`", async () => {
    const f = await fixture();
    try {
      await f.input.store.writeTask(task("escalated", { tier: "escalation" }));
      await f.input.store.writeTask(task("plain", { tier: "default" }));
      const err = await refusal(f.input);
      const tierFindings = err.findings.filter(
        (finding) => finding.key === "tier",
      );
      expect(tierFindings).toHaveLength(1);
      expect(tierFindings[0]).toEqual(
        expect.objectContaining({
          file: path.join(f.input.store.tasksDir, "escalated.md"),
          message: 'tier "escalation" names no run-config alias',
        }),
      );
      expect(err.report).toContain(
        'tier "escalation" names no run-config alias',
      );
    } finally {
      f.repo.cleanup();
    }
  });

  it("accepts a tier that names a configured alias", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace(
        "limits:",
        "  escalation: { harness: fake, model: esc }\nlimits:",
      ),
    );
    try {
      await f.input.store.writeTask(task("escalated", { tier: "escalation" }));
      const result = await preflight(f.input);
      expect(result.aliases.architect).toBe("max");
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart34(): void {
  it("refuses an escalateTo that names no alias", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace(
        "pm: { harness: fake, model: pm }",
        "pm: { harness: fake, model: pm, escalateTo: ghost }",
      ),
    );
    try {
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          file: path.join(f.repo.dir, ".factory/run.yaml"),
          key: "aliases.pm.escalateTo",
          message: 'escalateTo "ghost" names no run-config alias',
        }),
      );
      expect(err.report).toContain("aliases.pm.escalateTo");
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart35(): void {
  it("refuses an escalateTo of the reserved tier name `default`", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace(
        "pm: { harness: fake, model: pm }",
        "pm: { harness: fake, model: pm, escalateTo: default }\n  default: { harness: fake, model: dflt }",
      ),
    );
    try {
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          key: "aliases.pm.escalateTo",
          message:
            'escalateTo "default" is reserved for "no tier override"; it would re-run the PM\'s own alias',
        }),
      );
    } finally {
      f.repo.cleanup();
    }
  });

  it("refuses an escalateTo chain that forms a cycle", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace(
        "pm: { harness: fake, model: pm }",
        "pm: { harness: fake, model: pm, escalateTo: esc }\n  esc: { harness: fake, model: esc, escalateTo: pm }",
      ),
    );
    try {
      const err = await refusal(f.input);
      const finding = err.findings.find(
        (item) => item.key === "aliases.pm.escalateTo",
      );
      expect(finding?.message).toContain("cycle");
      expect(finding?.message).toContain("pm -> esc -> pm");
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart36(): void {
  it("refuses a fallback that names no alias", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace(
        "implementer: { harness: fake, model: impl }",
        "implementer: { harness: fake, model: impl, fallbacks: [{ alias: ghost }] }",
      ),
    );
    try {
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          file: path.join(f.repo.dir, ".factory/run.yaml"),
          key: "aliases.implementer.fallbacks.0.alias",
          message: 'fallback alias "ghost" names no run-config alias',
        }),
      );
    } finally {
      f.repo.cleanup();
    }
  });

  it("refuses a fallback that names its own alias", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace(
        "implementer: { harness: fake, model: impl }",
        "implementer: { harness: fake, model: impl, fallbacks: [{ alias: implementer }] }",
      ),
    );
    try {
      const err = await refusal(f.input);
      const finding = err.findings.find(
        (item) => item.key === "aliases.implementer.fallbacks.0.alias",
      );
      expect(finding?.message).toContain("cycle");
      expect(finding?.message).toContain("implementer -> implementer");
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart37(): void {
  it("refuses a mutual fallback alias cycle", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace(
        "implementer: { harness: fake, model: impl }",
        "implementer: { harness: fake, model: impl, fallbacks: [{ alias: reviewer }] }",
      ).replace(
        "reviewer: { harness: fake, model: rev }",
        "reviewer: { harness: fake, model: rev, fallbacks: [{ alias: implementer }] }",
      ),
    );
    try {
      const err = await refusal(f.input);
      const findings = err.findings.filter((item) =>
        item.key.endsWith(".fallbacks.0.alias"),
      );
      expect(findings.map((item) => item.key).sort()).toEqual([
        "aliases.implementer.fallbacks.0.alias",
        "aliases.reviewer.fallbacks.0.alias",
      ]);
      expect(findings.map((item) => item.message)).toContain(
        "fallback alias chain forms a cycle: implementer -> reviewer -> implementer",
      );
      expect(err.report).toContain("cycle");
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart38(): void {
  it("reports a shared missing fallback target once per edge", () => {
    const findings = fallbackAliasFindings(
      {
        implementer: {
          harness: "fake",
          model: "impl",
          fallbacks: [{ alias: "reviewer" }],
        },
        reviewer: {
          harness: "fake",
          model: "rev",
          fallbacks: [{ alias: "ghost" }],
        },
        qa: {
          harness: "fake",
          model: "qa",
          fallbacks: [{ alias: "ghost" }],
        },
      },
      "run.yaml",
    );
    expect(findings).toEqual([
      {
        file: "run.yaml",
        key: "aliases.reviewer.fallbacks.0.alias",
        message: 'fallback alias "ghost" names no run-config alias',
      },
      {
        file: "run.yaml",
        key: "aliases.qa.fallbacks.0.alias",
        message: 'fallback alias "ghost" names no run-config alias',
      },
    ]);
  });
}

function registerPreFlightPart39(): void {
  it("accepts a fallback that reuses another alias's ladder", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace(
        "implementer: { harness: fake, model: impl }",
        "implementer: { harness: fake, model: impl, fallbacks: [{ alias: reviewer }] }",
      ).replace(
        "reviewer: { harness: fake, model: rev }",
        "reviewer: { harness: fake, model: rev, effort: max }",
      ),
    );
    try {
      const result = await preflight(f.input);
      expect(result.aliases.reviewer).toBe("max");
    } finally {
      f.repo.cleanup();
    }
  });

  it("refuses session and worktree roots inside the repository", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST +
        "sessions: { dir: .factory/sessions, keepRuns: 2 }\nworktreeRoot: .factory/worktrees\n",
    );
    try {
      const err = await refusal(f.input);
      const keys = err.findings.map((x) => x.key);
      expect(keys).toContain("sessions.dir");
      expect(keys).toContain("worktreeRoot");
      expect(err.report).toContain("must be outside the repository");
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart40(): void {
  it("refuses a base branch that does not exist", async () => {
    const f = await fixture(
      undefined,
      "baseBranch: ghost\nartifactRoot: .factory/artifacts\n",
    );
    try {
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          key: "baseBranch",
          file: path.join(f.repo.dir, ".factory/repo.yaml"),
        }),
      );
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart41(): void {
  it("records and warns about a red base once, without aborting", async () => {
    const f = await fixture(
      undefined,
      "baseBranch: main\nartifactRoot: .factory/artifacts\ngates:\n  - { id: never, command: test -f never.txt }\n",
    );
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (msg: string) => warnings.push(msg);
    try {
      const first = await preflight(f.input);
      expect(first.base?.fresh).toBe(true);
      expect(first.base?.ok).toBe(false);
      const second = await preflight(f.input);
      expect(second.base?.fresh).toBe(false);
      const baselines = (await f.input.store.listRecords()).filter(
        (r) => r.step === "baseline",
      );
      expect(baselines).toHaveLength(1);
      expect(baselines[0]!.ok).toBe(false);
      expect(warnings.join("\n")).toContain("is red; recorded once");
      expect(warnings.join("\n")).toContain("never");
    } finally {
      console.warn = original;
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart42(): void {
  it("baselines the integration head tasks start from, not the base branch", async () => {
    const f = await fixture(
      undefined,
      "baseBranch: main\nartifactRoot: .factory/artifacts\ngates:\n  - { id: integration-red, command: test ! -f integration-red.txt }\n",
    );
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (msg: string) => warnings.push(msg);
    try {
      // Tasks branch from the integration head; main is green, that head is red.
      f.repo.git(["checkout", "-b", f.paths.integrationBranch]);
      f.repo.writeFile("integration-red.txt", "red\n");
      const integrationSha = f.repo.commit("integration red");
      f.repo.git(["checkout", "main"]);
      f.repo.writeFile("main-only.txt", "main\n");
      const mainSha = f.repo.commit("main moves on");
      expect(integrationSha).not.toBe(mainSha);

      const result = await preflight(f.input);
      expect(result.base?.commit).toBe(integrationSha);
      expect(result.base?.ok).toBe(false);
      const baselines = (await f.input.store.listRecords()).filter(
        (r) => r.step === "baseline",
      );
      expect(baselines).toHaveLength(1);
      expect(baselines[0]!.base).toBe(integrationSha);
      expect(warnings.join("\n")).toContain(f.paths.integrationBranch);
    } finally {
      console.warn = original;
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart43(): void {
  it("baselines the base tip when the integration branch only lags it", async () => {
    const f = await fixture(
      undefined,
      "baseBranch: main\nartifactRoot: .factory/artifacts\ngates:\n  - { id: stale, command: test ! -f broken.txt }\n",
    );
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (msg: string) => warnings.push(msg);
    try {
      // The integration head is an old red base commit; main has fixed it, so
      // recovery fast-forwards the integration branch onto the base tip.
      f.repo.writeFile("broken.txt", "red\n");
      const redSha = f.repo.commit("base is red here");
      f.repo.git(["branch", f.paths.integrationBranch, redSha]);
      fs.rmSync(path.join(f.repo.dir, "broken.txt"));
      const greenSha = f.repo.commit("base fixed");

      const result = await preflight(f.input);
      expect(result.base?.commit).toBe(greenSha);
      expect(result.base?.ok).toBe(true);
      const baselines = (await f.input.store.listRecords()).filter(
        (r) => r.step === "baseline",
      );
      expect(baselines).toHaveLength(1);
      expect(baselines[0]!.base).toBe(greenSha);
      expect(warnings).toEqual([]);
    } finally {
      console.warn = original;
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart44(): void {
  it("does not record a gate that could not run as base-red", async () => {
    const f = await fixture(
      undefined,
      "baseBranch: main\nartifactRoot: .factory/artifacts\ngates:\n  - { id: missing, command: no-such-factory-gate-command }\n",
    );
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (msg: string) => warnings.push(msg);
    try {
      // A red record from an older head must not be inherited into this one.
      const older = f.repo.git(["rev-parse", "HEAD"]).stdout;
      await f.input.store.appendRecord(
        {
          iteration: 0,
          step: "baseline",
          round: 1,
          actor: "script",
          base: older,
        },
        {
          ok: false,
          checks: [
            {
              name: "missing",
              ok: false,
              summary: "exit 1",
              output: "old red",
              fingerprint: "old",
            },
          ],
        },
      );
      f.repo.writeFile("newer.txt", "newer\n");
      f.repo.commit("head moves past the old baseline");

      const first = await preflight(f.input);
      expect(first.base?.infra).toBe(true);
      expect(
        recordedBaseGates(await f.input.store.listRecords()),
      ).toBeUndefined();

      // Nothing was cached as red: the next launch runs the gate again.
      const second = await preflight(f.input);
      expect(second.base?.infra).toBe(true);
      const records = await f.input.store.listRecords();
      expect(records.filter((r) => r.step === "baseline")).toHaveLength(1);
      expect(records.filter((r) => r.step === "baseline-infra")).toHaveLength(
        2,
      );
      expect(warnings.join("\n")).toContain("could not be checked");
      expect(warnings.join("\n")).toContain("not recorded as red");
    } finally {
      console.warn = original;
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart45(): void {
  it("does not record a failed baseline setup as base-red", async () => {
    const f = await fixture(
      undefined,
      "baseBranch: main\nartifactRoot: .factory/artifacts\nsetup:\n  - exit 7\ngates: []\n",
    );
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (msg: string) => warnings.push(msg);
    try {
      const result = await preflight(f.input);
      expect(result.base?.infra).toBe(true);
      expect(
        recordedBaseGates(await f.input.store.listRecords()),
      ).toBeUndefined();
      expect(warnings.join("\n")).toContain("setup");
    } finally {
      console.warn = original;
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart46(): void {
  it("keeps the base-gate scratch out of the swept tmp prefix", async () => {
    // A private TMPDIR stands in for os.tmpdir(): the gate sweeps exactly the
    // prefix this package's own test helper sweeps, and must not reach the
    // worktree it is running in.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "preflight-gate-tmp-"));
    const probePrefix = path.join(tmp, "preflight-probe-");
    const cwdFile = path.join(tmp, "scratch-cwd.txt");
    const repoYaml = [
      "baseBranch: main",
      "artifactRoot: .factory/artifacts",
      "gates:",
      "  - id: sweep",
      "    command: |",
      `      rm -rf "${probePrefix}"*`,
      `      pwd > "${cwdFile}"`,
      "      test -f README.md",
      "",
    ].join("\n");
    const f = await fixture(undefined, repoYaml);
    const previousTmp = process.env.TMPDIR;
    process.env.TMPDIR = tmp;
    try {
      const result = await preflight(f.input);
      expect(result.base?.fresh).toBe(true);
      expect(result.base?.checks.map((c) => c.ok)).toEqual([true]);

      const scratch = fs.readFileSync(cwdFile, "utf8").trim();
      expect(
        scratch.startsWith(path.resolve(f.paths.worktreeRoot) + path.sep),
      ).toBe(true);
      expect(scratch.startsWith(path.resolve(f.repo.dir) + path.sep)).toBe(
        false,
      );
      expect(fs.existsSync(scratch)).toBe(false);
    } finally {
      if (previousTmp === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = previousTmp;
      f.repo.cleanup();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
}

function registerPreFlightPart47(): void {
  it("refuses an unlisted model on every leg shape: primary, explicit fallback, inherited fallback and alternate", async () => {
    const run = RUN_HEAD_NO_HIGHEST.replace(
      "architect: { harness: fake, model: arch, effort: max }",
      "architect: { harness: fake, model: arch-ghost, effort: max, fallbacks: [{ harness: other, model: other-ghost }] }",
    )
      .replace(
        "implementer: { harness: fake, model: impl }",
        "implementer: { harness: fake, model: impl, fallbacks: [{ model: impl-ghost }] }",
      )
      .replace(
        "limits:",
        "  implementer-alt: { harness: fake, model: alt-ghost }\nlimits:",
      );
    const f = await fixture(run);
    try {
      // No boundary or step alias names this one: only `alternates` does.
      f.configs.process.flows["implement-review"]!.steps[0]!.alternates = [
        "implementer-alt",
      ];
      const harnesses = new Map(f.input.harnesses);
      harnesses.set("other", new FakeHarness({ id: "other" }));
      const unlisted = new Set([
        "arch-ghost",
        "other-ghost",
        "impl-ghost",
        "alt-ghost",
      ]);
      const err = await refusal({
        ...f.input,
        harnesses,
        catalog: async (_harness, model) => !unlisted.has(model),
        baseGates: false,
      });
      const file = path.join(f.repo.dir, ".factory/run.yaml");
      expect(err.findings).toContainEqual({
        file,
        key: "aliases.architect.model",
        message: 'model "arch-ghost" is not listed by harness "fake"',
      });
      expect(err.findings).toContainEqual({
        file,
        key: "aliases.architect.fallbacks.0.model",
        message: 'fallback "other-ghost" is not listed by harness "other"',
      });
      expect(err.findings).toContainEqual({
        file,
        key: "aliases.implementer.fallbacks.0.model",
        message: 'fallback "impl-ghost" is not listed by harness "fake"',
      });
      expect(err.findings).toContainEqual({
        file,
        key: "aliases.implementer-alt.model",
        message: 'model "alt-ghost" is not listed by harness "fake"',
      });
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart48(): void {
  it("refuses a fallback from the live probe of the fallback's own harness", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace(
        "implementer: { harness: fake, model: impl }",
        "implementer: { harness: fake, model: impl, fallbacks: [{ harness: probing, model: far }] }",
      ),
    );
    try {
      const harnesses = new Map(f.input.harnesses);
      harnesses.set("probing", new ProbeHarness("probing", ["near"]));
      const catalog: ModelCatalog = async (harness) => {
        if (harness === "probing") throw new Error("catalog must not decide");
        return true;
      };
      const err = await refusal({
        ...f.input,
        harnesses,
        catalog,
        baseGates: false,
      });
      expect(err.findings).toContainEqual({
        file: path.join(f.repo.dir, ".factory/run.yaml"),
        key: "aliases.implementer.fallbacks.0.model",
        message:
          'fallback "far" is not listed by harness "probing"; available models: near',
      });
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart49(): void {
  it("refuses the launch before dispatch when an alternate leg's model is unlisted", async () => {
    const run = `${RUN_HEAD_NO_HIGHEST.replace(
      "implementer-b: { harness: fake, model: impl-b }",
      "implementer-b: { harness: fake, model: alt-ghost }",
    )}worktreeRoot: WORKTREE_ROOT
sessions: { dir: SESSIONS_DIR }
`;
    const f = await fixture(run);
    try {
      // The same config passes when every model is listed: the refusal is the
      // leg's model, not some other finding.
      await expect(
        preflight({ ...f.input, catalog: async () => true, baseGates: false }),
      ).resolves.toBeDefined();
      const harness = new FakeHarness({ id: "fake" });
      const failed = await runGoal({
        repo: f.repo.dir,
        goal: "demo",
        iterations: 1,
        harnesses: { fake: harness },
        modelCatalog: async (_harness, model) => model !== "alt-ghost",
        baseGates: false,
        priceSource: testPriceSource(f.repo.dir),
      }).catch((err) => err);
      expect(failed).toBeInstanceOf(PreflightError);
      expect((failed as PreflightError).findings).toContainEqual(
        expect.objectContaining({
          key: "aliases.implementer-b.model",
          message: 'model "alt-ghost" is not listed by harness "fake"',
        }),
      );
      expect(harness.calls).toEqual([]);
      expect(await f.input.store.listRecords()).toEqual([]);
    } finally {
      f.repo.cleanup();
    }
  });
}

/** A run config whose implementer owns pool "pool" and carries one fallback tier. */
function poolRun(tier: string): string {
  return RUN_HEAD_NO_HIGHEST.replace(
    "implementer: { harness: fake, model: impl }",
    `implementer: { harness: fake, model: impl, subscription: pool, fallbacks: [${tier}] }`,
  ).replace(
    "limits: { concurrency: { overall: 2 }, iterations: 1 }",
    "limits: { concurrency: { overall: 2, perSubscription: { pool: 1, go: 1 } }, iterations: 1 }",
  );
}

function registerPreFlightPart50(): void {
  registerFallbackPoolRefusal();
  registerFallbackPoolEdges();
}

function registerFallbackPoolRefusal(): void {
  it("refuses a fallback that changes harness or model and names no pool", async () => {
    const f = await fixture(
      poolRun("{ harness: fake, model: near, effort: high }"),
    );
    try {
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          key: "aliases.implementer.fallbacks.0.subscription",
          message: expect.stringContaining("sharesPool: true"),
        }),
      );
    } finally {
      f.repo.cleanup();
    }
  });

  it("accepts a changed fallback that names its own subscription or shares the pool", async () => {
    for (const tier of [
      "{ model: near, subscription: go }",
      "{ model: near, sharesPool: true }",
    ]) {
      const f = await fixture(poolRun(tier));
      try {
        await expect(preflight(f.input)).resolves.toBeDefined();
      } finally {
        f.repo.cleanup();
      }
    }
  });
}

function registerFallbackPoolEdges(): void {
  it("keeps an unchanged fallback on the alias subscription", async () => {
    const f = await fixture(poolRun("{ model: impl, effort: high }"));
    try {
      await expect(preflight(f.input)).resolves.toBeDefined();
    } finally {
      f.repo.cleanup();
    }
  });

  it("does not demand a pool where no alias subscription exists to inherit", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace(
        "implementer: { harness: fake, model: impl }",
        "implementer: { harness: fake, model: impl, fallbacks: [{ model: near, effort: high }] }",
      ),
    );
    try {
      await expect(preflight(f.input)).resolves.toBeDefined();
    } finally {
      f.repo.cleanup();
    }
  });

  it("refuses sharesPool when the alias names no subscription", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace(
        "implementer: { harness: fake, model: impl }",
        "implementer: { harness: fake, model: impl, fallbacks: [{ model: near, sharesPool: true }] }",
      ),
    );
    try {
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          key: "aliases.implementer.fallbacks.0.sharesPool",
          message: expect.stringContaining(
            "needs the alias to name a subscription",
          ),
        }),
      );
    } finally {
      f.repo.cleanup();
    }
  });
}
