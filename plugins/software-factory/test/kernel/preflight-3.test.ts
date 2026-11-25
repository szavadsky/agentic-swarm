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
  "architect: { harness: agent-x, model: arch }",
).replace(
  "implementer: { harness: fake, model: impl }",
  "implementer: { harness: omp, model: impl }",
);

function splitHarnesses(f: Fixture): Map<string, Harness> {
  const harnesses = new Map(f.input.harnesses);
  harnesses.set("agent-x", new FakeHarness({ id: "agent-x" }));
  harnesses.set(
    "omp",
    new FakeHarness({
      id: "omp",
      probe: { effort: ["low", "medium", "high", "max"] },
    }),
  );
  return harnesses;
}

function withScouts(runYaml: string, scouts: string): string {
  return runYaml.replace("limits:", `${scouts}\nlimits:`);
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

function registerPreFlightPart19(): void {
  it("still refuses an unlisted plain omp model id", async () => {
    const f = await fixture(SPLIT_HARNESSES);
    try {
      // Probe-less omp, so the injected catalog decides the model list.
      const harnesses = splitHarnesses(f);
      harnesses.set("omp", new FakeHarness({ id: "omp" }));
      const catalog: ModelCatalog = async (harness, model) =>
        !(harness === "omp" && model === "impl");
      const err = await refusal({
        ...f.input,
        harnesses,
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
      // Probe-less fake, so the injected catalog decides the model list.
      const harnesses = new Map<string, Harness>([
        ["fake", new FakeHarness({ id: "fake" })],
      ]);
      const catalog: ModelCatalog = async (_harness, model) =>
        model !== "@free";
      const err = await refusal({ ...f.input, harnesses, catalog });
      expect(err.findings.map((x) => x.key)).toContain("aliases.pm.model");
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart20(): void {
  it("checks scouts against omp, not the architect's harness", async () => {
    const f = await fixture(
      withScouts(
        SPLIT_HARNESSES,
        "scouts: { model: scout-model, effort: max }",
      ),
    );
    try {
      const probed: string[] = [];
      const harnesses = splitHarnesses(f);
      const inner = harnesses.get("omp")!;
      const omp = new FakeHarness({ id: "omp" });
      omp.probe = async (model) => {
        probed.push(model.id);
        return inner.probe!(model);
      };
      harnesses.set("omp", omp);
      const catalog: ModelCatalog = async () => true;
      await preflight({
        ...f.input,
        harnesses,
        catalog,
      });
      expect(f.configs.run.scouts!.effort).toBe("max");
      expect(probed).toContain("scout-model");
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart21(): void {
  it("refuses a scouts model omp does not list, naming omp", async () => {
    const f = await fixture(
      withScouts(SPLIT_HARNESSES, "scouts: { model: scout-model }"),
    );
    try {
      // The probe reports scout-model as unlisted (only impl is listed).
      const harnesses = splitHarnesses(f);
      const omp = new FakeHarness({ id: "omp" });
      omp.probe = async (model) =>
        model.id === "scout-model"
          ? { listed: false, available: ["impl"], effort: null }
          : {
              listed: true,
              available: ["impl"],
              effort: ["low", "medium", "high", "max"],
            };
      harnesses.set("omp", omp);
      const err = await refusal({ ...f.input, harnesses });
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          key: "scouts.model",
          message:
            'model "scout-model" is not listed by harness "omp"; available models: impl',
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
      withScouts(RUN_HEAD_NO_HIGHEST, "scouts: { model: scout-model }"),
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
        "scouts: { model: scout-model }",
      ),
    );
    try {
      const probed: string[] = [];
      const harnesses = splitHarnesses(f);
      const inner = harnesses.get("omp")!;
      const omp = new FakeHarness({ id: "omp" });
      omp.probe = async (model) => {
        probed.push(model.id);
        return inner.probe!(model);
      };
      harnesses.set("omp", omp);
      await preflight({ ...f.input, harnesses });
      expect(probed).toContain("scout-model");
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
  it("validates each fallback effort against its own harness probe", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace(
        "implementer: { harness: fake, model: impl }",
        "implementer: { harness: fake, model: impl, effort: max, fallbacks: [{ harness: other, model: far, effort: high }, { model: near, effort: high }] }",
      ),
    );
    try {
      const harnesses = new Map(f.input.harnesses);
      harnesses.set(
        "other",
        new FakeHarness({ id: "other", probe: { effort: ["low", "high"] } }),
      );
      await preflight({ ...f.input, harnesses });
      const fallbacks = f.configs.run.aliases.implementer!.fallbacks!;
      expect(fallbacks[0]).toMatchObject({ effort: "high" });
      // The fallback without a fixed effort stays effort-less (harness default):
      // fallback effort is never inherited from the alias.
      expect("model" in fallbacks[1]! ? fallbacks[1]!.effort : undefined).toBe(
        "high",
      );
    } finally {
      f.repo.cleanup();
    }
  });
}

describe("pre-flight", () => {
  registerPreFlightPart19();

  registerPreFlightPart20();

  registerPreFlightPart21();

  registerPreFlightPart22();

  registerPreFlightPart23();

  registerPreFlightPart24();

  registerPreFlightPart25();
});
