import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness } from "../../src/harness/fake/index.js";
import type { Harness, ModelProbe, ModelRef } from "../../src/harness/types.js";
import { loadConfigs, resolveGoalPaths } from "../../src/kernel/config.js";
import {
  PreflightError,
  type PreflightInput,
  preflight,
} from "../../src/kernel/preflight.js";
import { runGoal } from "../../src/kernel/launch.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";

interface Fixture {
  repo: TmpRepo;
  configs: ReturnType<typeof loadConfigs>;
  paths: ReturnType<typeof resolveGoalPaths>;
  input: PreflightInput;
}

/**
 * Invented model names for the probing fake below. Nothing here is a real
 * provider id or level; the fake answers from its own table.
 */
const NO_EFFORT = "vellum/no-effort";
const WITH_EFFORT = "vellum/with-effort";
const FALLBACK_MODEL = "vellum/fallback";

interface FakeModel {
  /** Levels the fake's probe reports; null = the model has no effort option. */
  effort: readonly string[] | null;
}

/** A fake harness that answers the probe interface from a fixed table. */
class ProbingFakeHarness extends FakeHarness {
  readonly probed: ModelRef[] = [];

  constructor(
    id: string,
    private readonly models: Readonly<Record<string, FakeModel>>,
  ) {
    super({ id });
    this.probe = async (model: ModelRef): Promise<ModelProbe> => {
      this.probed.push(model);
      const found = this.models[model.id];
      if (!found) throw new Error(`unknown model ${model.id}`);
      return {
        listed: true,
        available: Object.keys(this.models),
        effort: found.effort,
      };
    };
  }
}

/** Every alias on the probing fake; architect and implementer are the caller's. */
function runConfig(architect: string, implementer: string): string {
  return `aliases:
${architect}
  pm: { harness: fake, model: ${NO_EFFORT} }
  digest: { harness: fake, model: ${NO_EFFORT} }
${implementer}
  implementer-b: { harness: fake, model: ${NO_EFFORT} }
  researcher: { harness: fake, model: ${NO_EFFORT} }
  reviewer: { harness: fake, model: ${NO_EFFORT} }
  qa: { harness: fake, model: ${NO_EFFORT} }
  steward: { harness: fake, model: ${NO_EFFORT} }
  plan-checker: { harness: fake, model: ${NO_EFFORT} }
  intent: { harness: fake, model: ${NO_EFFORT} }
  plan-reviewer: { harness: fake, model: ${NO_EFFORT} }
  pack-preparer: { harness: fake, model: ${NO_EFFORT} }
worktreeRoot: WORKTREE_ROOT
sessions: { dir: SESSIONS_DIR, retention: short }
limits: { concurrency: { overall: 2 }, iterations: 1 }
`;
}

async function fixture(
  config: string,
  models: Readonly<Record<string, FakeModel>> = {
    [NO_EFFORT]: { effort: null },
    [WITH_EFFORT]: { effort: ["dim", "deep"] },
    [FALLBACK_MODEL]: { effort: ["deep"] },
  },
): Promise<Fixture> {
  const repo = createTmpRepo();
  const base = path.basename(repo.dir);
  const run = config
    .replaceAll("WORKTREE_ROOT", `../${base}-wt`)
    .replaceAll("SESSIONS_DIR", `../${base}-sessions`);
  repo.writeFile(
    ".factory/repo.yaml",
    "baseBranch: main\nartifactRoot: .factory/artifacts\nsetup: []\ngates: []\nrequireGates: false\n",
  );
  repo.writeFile(".factory/run.yaml", run);
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
  const harness = new ProbingFakeHarness("fake", models);
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

const NO_EFFORT_MODEL = `{ harness: fake, model: ${NO_EFFORT} }`;
const NO_EFFORT_ALIAS = (name: string) => `  ${name}: ${NO_EFFORT_MODEL}`;

function effortPart1(): void {
  it("passes a no-effort model when the alias names no effort", async () => {
    const f = await fixture(
      runConfig(NO_EFFORT_ALIAS("architect"), NO_EFFORT_ALIAS("implementer")),
    );
    try {
      await expect(preflight(f.input)).resolves.toBeDefined();
    } finally {
      f.repo.cleanup();
    }
  });

  it("fails a no-effort model when the alias names an effort", async () => {
    const f = await fixture(
      runConfig(
        `  architect: { harness: fake, model: ${NO_EFFORT}, effort: deep }`,
        NO_EFFORT_ALIAS("implementer"),
      ),
    );
    try {
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual(
        expect.objectContaining({ key: "aliases.architect.effort" }),
      );
      expect(err.report).toContain('effort "deep"');
      expect(err.report).toContain("offers no effort");
    } finally {
      f.repo.cleanup();
    }
  });
}

function effortPart2(): void {
  it("passes a listed level on a model with an effort list", async () => {
    const f = await fixture(
      runConfig(
        `  architect: { harness: fake, model: ${WITH_EFFORT}, effort: deep }`,
        NO_EFFORT_ALIAS("implementer"),
      ),
    );
    try {
      await expect(preflight(f.input)).resolves.toBeDefined();
    } finally {
      f.repo.cleanup();
    }
  });

  it("rejects a level outside the probed effort list", async () => {
    const f = await fixture(
      runConfig(
        `  architect: { harness: fake, model: ${WITH_EFFORT}, effort: shallow }`,
        NO_EFFORT_ALIAS("implementer"),
      ),
    );
    try {
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual(
        expect.objectContaining({ key: "aliases.architect.effort" }),
      );
      expect(err.report).toContain('effort "shallow"');
      expect(err.report).toContain("dim, deep");
    } finally {
      f.repo.cleanup();
    }
  });

  it("passes a model with an effort list when the alias names none", async () => {
    const f = await fixture(
      runConfig(
        `  architect: { harness: fake, model: ${WITH_EFFORT} }`,
        NO_EFFORT_ALIAS("implementer"),
      ),
    );
    try {
      await expect(preflight(f.input)).resolves.toBeDefined();
    } finally {
      f.repo.cleanup();
    }
  });
}

function effortPart3(): void {
  it("probes a fallback with its own effort", async () => {
    const f = await fixture(
      runConfig(
        `  architect: { harness: fake, model: ${WITH_EFFORT}, effort: dim }`,
        `  implementer: { harness: fake, model: ${WITH_EFFORT}, effort: deep, fallbacks: [{ model: ${FALLBACK_MODEL}, effort: deep }] }`,
      ),
    );
    try {
      await expect(preflight(f.input)).resolves.toBeDefined();
      const harness = f.input.harnesses.get("fake") as ProbingFakeHarness;
      expect(harness.probed).toContainEqual({ id: FALLBACK_MODEL });
    } finally {
      f.repo.cleanup();
    }
  });

  it("rejects a fallback effort outside the fallback model's own list", async () => {
    const f = await fixture(
      runConfig(
        NO_EFFORT_ALIAS("architect"),
        `  implementer: { harness: fake, model: ${WITH_EFFORT}, effort: deep, fallbacks: [{ model: ${FALLBACK_MODEL}, effort: dim }] }`,
      ),
    );
    try {
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          key: "aliases.implementer.fallbacks.0.effort",
        }),
      );
    } finally {
      f.repo.cleanup();
    }
  });
}

function effortPart4(): void {
  it("refuses the launch before any turn when a pair is unsupported", async () => {
    const f = await fixture(
      runConfig(
        `  architect: { harness: fake, model: ${NO_EFFORT}, effort: deep }`,
        NO_EFFORT_ALIAS("implementer"),
      ),
    );
    try {
      const harness = new ProbingFakeHarness("fake", {
        [NO_EFFORT]: { effort: null },
      });
      const failed = await runGoal({
        repo: f.repo.dir,
        goal: "demo",
        iterations: 1,
        harnesses: { fake: harness },
        baseGates: false,
      }).catch((err) => err);
      expect(failed).toBeInstanceOf(PreflightError);
      expect((failed as PreflightError).findings).toContainEqual(
        expect.objectContaining({ key: "aliases.architect.effort" }),
      );
      expect(harness.calls).toEqual([]);
    } finally {
      f.repo.cleanup();
    }
  });

  it("probes every leg: primary, rotation entries and fallbacks", async () => {
    const f = await fixture(
      runConfig(
        `  architect: { harness: fake, model: ${WITH_EFFORT}, effort: dim, fallbacks: [{ model: ${FALLBACK_MODEL}, effort: deep }] }`,
        `  implementer:
    harness: fake
    model: ${NO_EFFORT}
    rotate:
      - { harness: fake, model: ${WITH_EFFORT}, effort: deep }`,
      ),
    );
    try {
      await preflight(f.input);
      const harness = f.input.harnesses.get("fake") as ProbingFakeHarness;
      const ids = harness.probed.map((m) => m.id);
      expect(ids).toContain(WITH_EFFORT);
      expect(ids).toContain(FALLBACK_MODEL);
    } finally {
      f.repo.cleanup();
    }
  });
}

function effortPart5(): void {
  it("probes a shared no-effort model only once per launch", async () => {
    const f = await fixture(
      runConfig(
        `  architect: { harness: fake, model: ${NO_EFFORT} }`,
        `  implementer:
    harness: fake
    model: ${NO_EFFORT}`,
      ),
    );
    try {
      await preflight(f.input);
      const harness = f.input.harnesses.get("fake") as ProbingFakeHarness;
      expect(harness.probed).toEqual([{ id: NO_EFFORT }]);
    } finally {
      f.repo.cleanup();
    }
  });
}

describe("opaque effort pre-flight (fake-name tests)", () => {
  effortPart1();
  effortPart2();
  effortPart3();
  effortPart4();
  effortPart5();
});
