import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness } from "../../src/harness/fake/index.js";
import type { Harness } from "../../src/harness/types.js";
import { loadConfigs, resolveGoalPaths } from "../../src/kernel/config.js";
import {
  type ModelCatalog,
  PreflightError,
  type PreflightInput,
  preflight,
} from "../../src/kernel/preflight.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";

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

describe("pre-flight", () => {
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
});
