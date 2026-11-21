import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FakeHarness } from "../../src/harness/fake/index.js";
import type { Harness, ModelProbe, ModelRef } from "../../src/harness/types.js";
import { recordedBaseGates } from "../../src/kernel/baseline.js";
import {
  ConfigError,
  loadConfigs,
  resolveGoalPaths,
} from "../../src/kernel/config.js";
import {
  type ModelCatalog,
  PreflightError,
  type PreflightInput,
  preflight,
} from "../../src/kernel/preflight.js";
import { runGoal } from "../../src/kernel/launch.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { testPriceSource } from "../helpers/price-source.js";
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

describe("pre-flight", () => {
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
