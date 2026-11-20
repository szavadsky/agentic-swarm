// biome-ignore-all lint/complexity: split-rest
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import {
  createRealHarnesses,
  createRealModelCatalog,
  resolveHarnessBinaries,
} from "../../src/cli/harnesses.js";
import {
  loadConfigs,
  loadRunConfig,
  resolveGoalPaths,
} from "../../src/kernel/config.js";
import { FakeHarness } from "../../src/harness/fake/index.js";
import type { Harness } from "../../src/harness/types.js";
import { PreflightError, preflight } from "../../src/kernel/preflight.js";
import { matchPrice, type PriceTable } from "../../src/kernel/pricing.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { shippedRunConfigsDir } from "../helpers/run-configs.js";
import { createTmpRepo } from "../helpers/tmp-repo.js";

const LIVE = process.env.FACTORY_LIVE === "1";
const BOOTSTRAP_RUN = shippedRunConfigsDir();
const CONFIGS = ["shakedown", "self"] as const;
describe.skipIf(!LIVE)("bootstrap run configs against the real CLIs", () => {
  for (const name of CONFIGS) {
    it(`passes live pre-flight: ${name}.yaml`, async () => {
      const repo = createTmpRepo();
      try {
        repo.writeFile(
          ".factory/repo.yaml",
          "baseBranch: main\nartifactRoot: .factory/artifacts\nsetup: []\ngates: []\n",
        );
        repo.commit("factory config");
        const runPath = path.join(BOOTSTRAP_RUN, `${name}.yaml`);
        const configs = loadConfigs(repo.dir, { runConfigPath: runPath });

        expect(configs.run.limits).toMatchObject({
          concurrency: { overall: 3 },
          iterations: 1,
        });
        expect(configs.run.sessions).toEqual({
          dir: "~/.local/share/factory/sessions",
          keepRuns: 5,
          retention: "short",
        });
        expect(configs.run.worktreeRoot).toBe(
          "~/.local/share/factory/worktrees",
        );
        if (name === "shakedown") {
          expect(configs.run.aliases.architect).toMatchObject({
            harness: "opencode",
            model: "opencode/minimax-m3.1-flash-free",
            effort: "high",
          });
          expect(configs.run.scouts).toBeUndefined();
        } else {
          expect(configs.run.aliases.architect).toMatchObject({
            harness: "omp",
            model: "anthropic/claude-opus-5-5",
            effort: "high",
          });
          expect(configs.run.aliases.escalation).toMatchObject({
            harness: "omp",
            model: "anthropic/claude-sonnet-5-5",
          });
          expect(configs.run.scouts).toEqual({
            model: "opencode-go/deepseek-v4.1-flash",
          });
        }

        // Keep the probe off the operator's real session/worktree roots.
        const base = path.basename(repo.dir);
        configs.run.sessions.dir = path.join(
          path.dirname(repo.dir),
          `${base}-live-sessions`,
        );
        configs.run.worktreeRoot = path.join(
          path.dirname(repo.dir),
          `${base}-live-wt`,
        );

        const paths = resolveGoalPaths(configs, repo.dir, "live");
        fs.mkdirSync(paths.goalDir, { recursive: true });
        fs.writeFileSync(
          path.join(paths.goalDir, "intent.md"),
          "# Goal\n\nLive pre-flight probe.\n",
          "utf8",
        );
        const store = createFolderStore(paths.goalDir, undefined, {});
        await store.ensureLayout();

        const binaries = resolveHarnessBinaries(configs.run.harnesses);
        expect(binaries.opencode).toBeTruthy();
        expect(binaries.omp).toBeTruthy();
        const harnesses = new Map(
          Object.entries(
            createRealHarnesses({
              sessionDir: path.join(paths.sessionsDir, "probe"),
              harnesses: configs.run.harnesses,
              scouts: configs.run.scouts
                ? { id: configs.run.scouts.model }
                : undefined,
            }),
          ),
        );
        const result = await preflight({
          configs,
          paths,
          store,
          harnesses,
          binaries,
          catalog: createRealModelCatalog(binaries),
        });

        expect(result.aliases.architect).toBe("high");
        if (configs.run.scouts) expect(result.aliases.scouts).toBeUndefined();
        expect(result.base?.ok).toBe(true);
      } finally {
        repo.cleanup();
      }
    }, 120_000);
  }
});

/**
 * Every model id in every shipped run config resolves against the OpenRouter
 * catalog shape: by normalized id, or by an explicit priceIds entry that
 * names a catalog id. The fixture mirrors the live catalog ids (verified
 * 2026-11-15); the suite itself never reaches the network.
 */
const OPENROUTER_IDS: PriceTable = {
  "anthropic/claude-opus-5-5": {
    input: 4,
    cachedInput: 0.2,
    output: 20,
    reasoning: 20,
  },
  "anthropic/claude-sonnet-5-5": {
    input: 2,
    cachedInput: 0.1,
    output: 10,
    reasoning: 10,
  },
  "baidu/ernie-5.5-flash-preview:free": {
    input: 0,
    cachedInput: 0,
    output: 0,
    reasoning: 0,
  },
  "deepseek/deepseek-v4.1-flash": {
    input: 0.0507,
    cachedInput: 0.001,
    output: 0.2028,
    reasoning: 0.2028,
  },
  "google/gemini-3.8-flash": {
    input: 0.825,
    cachedInput: 0.0825,
    output: 4.125,
    reasoning: 4.125,
  },
  "meta/muse-spark-1.3-contributor": {
    input: 0.1,
    cachedInput: 0.002,
    output: 0.2,
    reasoning: 0.2,
  },
  "minimax/minimax-m3.1-flash": {
    input: 0.075,
    cachedInput: 0.0075,
    output: 0.3,
    reasoning: 0.3,
  },
  "reflection/beam-1.0-501b-a23b": {
    input: 0.3,
    cachedInput: 0.04,
    output: 1,
    reasoning: 1,
  },
};

const RUN_CONFIGS = fs
  .readdirSync(BOOTSTRAP_RUN)
  .filter((name) => name.endsWith(".yaml"))
  .map((name) => name.slice(0, -".yaml".length))
  .sort();

describe("shipped run-config coverage", () => {
  for (const name of RUN_CONFIGS) {
    it(`routes opencode through the acpx raw route: ${name}.yaml`, () => {
      const runPath = path.join(BOOTSTRAP_RUN, `${name}.yaml`);
      const run = loadRunConfig(runPath);
      // The built-in acpx opencode route runs 1.19.5; the raw `opencode acp`
      // route runs the installed CLI (acpx-probe §0).
      expect(run.harnesses!.opencode?.acpx).toMatchObject({
        agent: "opencode acp",
        raw: true,
        effort: { configId: "effort" },
      });
    });

    it(`carries the required plan role aliases: ${name}.yaml`, () => {
      const runPath = path.join(BOOTSTRAP_RUN, `${name}.yaml`);
      const run = loadRunConfig(runPath);
      expect(run.aliases["plan-checker"]).toBeDefined();
      expect(run.aliases["plan-reviewer"]).toBeDefined();
      if (name === "self-quota") {
        const reviewer = run.aliases["plan-reviewer"]!;
        expect(run.aliases["plan-checker"]).toMatchObject({
          harness: reviewer.harness,
          model: reviewer.model,
          effort: reviewer.effort,
        });
      }
    });

    it(`carries the spike flow's researcher alias: ${name}.yaml`, () => {
      const runPath = path.join(BOOTSTRAP_RUN, `${name}.yaml`);
      const run = loadRunConfig(runPath);
      // The spike flow's implement step alternates researcher with the task
      // implementer and reviewer aliases; pre-flight refuses the launch when
      // any of the three is missing.
      expect(run.aliases.researcher).toBeDefined();
      expect(run.aliases.implementer).toBeDefined();
      expect(run.aliases.reviewer).toBeDefined();
    });

    it(`carries the development implementer's retry alternate: ${name}.yaml`, () => {
      const runPath = path.join(BOOTSTRAP_RUN, `${name}.yaml`);
      const run = loadRunConfig(runPath);
      // Both development flows name implementer-b; a retry must run a model
      // other than the implementer primary that failed.
      const alternate = run.aliases["implementer-b"];
      expect(alternate).toBeDefined();
      expect(alternate!.model).not.toBe(run.aliases.implementer!.model);
    });

    it(`carries the unattended omp policy when an alias uses omp: ${name}.yaml`, () => {
      const runPath = path.join(BOOTSTRAP_RUN, `${name}.yaml`);
      const run = loadRunConfig(runPath);
      const usesOmp = Object.values(run.aliases).some(
        (alias) => alias.harness === "omp",
      );
      if (!usesOmp) return;
      // The compiled-in overlay is gone: the entry must carry the unattended
      // policy, or an omp turn reverts to prompting and learning on its own.
      expect(run.harnesses!.omp?.options).toMatchObject({
        memory: { backend: "off" },
        autolearn: { enabled: false },
        skills: { enabled: false },
        tools: { approvalMode: "yolo" },
        retry: { enabled: false, modelFallback: false },
      });
    });

    it(`passes pre-flight: ${name}.yaml`, async () => {
      const runPath = path.join(BOOTSTRAP_RUN, `${name}.yaml`);
      const repo = createTmpRepo();
      try {
        repo.writeFile(
          ".factory/repo.yaml",
          "baseBranch: main\nartifactRoot: .factory/artifacts\nsetup: []\ngates: []\n",
        );
        repo.commit("factory config");
        const configs = loadConfigs(repo.dir, { runConfigPath: runPath });
        // Keep the probe off the operator's real session/worktree roots.
        const base = path.basename(repo.dir);
        configs.run.sessions.dir = path.join(
          path.dirname(repo.dir),
          `${base}-preflight-sessions`,
        );
        configs.run.worktreeRoot = path.join(
          path.dirname(repo.dir),
          `${base}-preflight-wt`,
        );
        const paths = resolveGoalPaths(configs, repo.dir, "shipped");
        fs.mkdirSync(paths.goalDir, { recursive: true });
        fs.writeFileSync(
          path.join(paths.goalDir, "intent.md"),
          "# Goal\n\nShipped pre-flight probe.\n",
          "utf8",
        );
        const store = createFolderStore(paths.goalDir, undefined, {});
        await store.ensureLayout();
        // No catalog or binaries: the alias set, effort levels and roots are
        // what the shipped config owns, and every harness is registered here.
        const harnesses = new Map<string, Harness>();
        for (const id of [
          "agy",
          "claude-code",
          "codex",
          "omp",
          "opencode",
          "pi",
        ])
          harnesses.set(
            id,
            new FakeHarness({
              id,
              caps: { effort: ["low", "medium", "high", "max"] },
            }),
          );
        const result = await preflight({ configs, paths, store, harnesses });
        // The alias was not merely present: pre-flight checked it and resolved
        // the effort it names (none on shakedown's free alternate).
        expect(result.aliases).toHaveProperty("implementer-b");
        expect(result.aliases["implementer-b"]).toBe(
          configs.run.aliases["implementer-b"]!.effort,
        );
      } finally {
        repo.cleanup();
      }
    });

    it(`resolves every model id: ${name}.yaml`, () => {
      const runPath = path.join(BOOTSTRAP_RUN, `${name}.yaml`);
      const run = loadRunConfig(runPath);
      expect(run.priceIds).toBeDefined();
      const ids = new Set<string>();
      for (const alias of Object.values(run.aliases)) {
        ids.add(alias.model);
        for (const entry of alias.rotate!) ids.add(entry.model);
        for (const fb of alias.fallbacks!) {
          if ("model" in fb) ids.add(fb.model);
        }
      }
      if (run.scouts) ids.add(run.scouts.model);
      expect(ids.size).toBeGreaterThan(0);
      for (const id of [...ids].sort()) {
        expect(
          matchPrice(OPENROUTER_IDS, id, run.priceIds!),
          `${name}.yaml: ${id} matches no OpenRouter id`,
        ).toBeDefined();
      }
      // No dangling mappings: every priceIds target is a catalog id.
      for (const [from, to] of Object.entries(run.priceIds!)) {
        expect(
          OPENROUTER_IDS[to],
          `${name}.yaml: priceIds ${from} -> ${to} names no catalog id`,
        ).toBeDefined();
      }
    });
  }
});

/**
 * The extends split must not change what a shipped run config resolves to:
 * each file keeps the layer it had before base plus overlay composition.
 * The fixtures were frozen from the pre-split files.
 */
const FROZEN_RUN_CONFIGS = [
  "benchmark",
  "self",
  "self-acpx",
  "self-quota",
  "self-rotate",
  "shakedown",
  "shakedown-plan",
] as const;
const FROZEN_DIR = path.resolve(import.meta.dir, "../fixtures/run-configs");

describe("shipped run-config composition", () => {
  for (const name of FROZEN_RUN_CONFIGS) {
    it(`resolves ${name}.yaml to its frozen layer`, () => {
      const runPath = path.join(BOOTSTRAP_RUN, `${name}.yaml`);
      const frozenPath = path.join(FROZEN_DIR, `${name}.yaml`);
      expect(loadRunConfig(runPath)).toEqual(
        yaml.parse(fs.readFileSync(frozenPath, "utf8")),
      );
    });
  }

  it("keeps self.yaml an empty overlay on the shared base", () => {
    const basePath = path.join(BOOTSTRAP_RUN, "base.yaml");
    const selfPath = path.join(BOOTSTRAP_RUN, "self.yaml");
    expect(loadRunConfig(selfPath)).toEqual(loadRunConfig(basePath));
  });
});

describe("self-rotate run config", () => {
  it("is self.yaml with only the implementer rotating across the probe harnesses", () => {
    const selfPath = path.join(BOOTSTRAP_RUN, "self.yaml");
    const rotatePath = path.join(BOOTSTRAP_RUN, "self-rotate.yaml");
    const self = loadRunConfig(selfPath);
    const rotating = loadRunConfig(rotatePath);
    const { implementer: selfImplementer, ...selfAliases } = self.aliases;
    const { implementer: rotatingImplementer, ...rotatingAliases } =
      rotating.aliases;
    expect(rotatingAliases).toEqual(selfAliases);
    expect(rotatingImplementer).toMatchObject({
      harness: selfImplementer!.harness,
      model: selfImplementer!.model,
    });
    expect(rotatingImplementer!.rotate!.map((entry) => entry.harness)).toEqual([
      "opencode",
      "pi",
      "codex",
    ]);
    // The owner adopts rotation by pointing a run at self-rotate; self.yaml
    // itself stays unrotated.
    expect(selfImplementer!.rotate).toEqual([]);
  });
});

/**
 * The coverage above only stops a broken shipped config if a launch would be
 * refused: an overlay that drops an alias the flows name must fail pre-flight,
 * not run until the step first names it.
 */
describe("shipped run config with a missing alias", () => {
  it("is refused by pre-flight", async () => {
    const configsDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "factory-run-configs-"),
    );
    const repo = createTmpRepo();
    try {
      fs.cpSync(BOOTSTRAP_RUN, configsDir, { recursive: true });
      // `null` deletes an inherited alias, as a variant that narrowed the
      // alias set would.
      fs.writeFileSync(
        path.join(configsDir, "self.yaml"),
        "extends: base.yaml\naliases:\n  implementer-b: null\n",
        "utf8",
      );
      repo.writeFile(
        ".factory/repo.yaml",
        "baseBranch: main\nartifactRoot: .factory/artifacts\nsetup: []\ngates: []\n",
      );
      repo.commit("factory config");
      const configs = loadConfigs(repo.dir, {
        runConfigPath: path.join(configsDir, "self.yaml"),
      });
      expect(configs.run.aliases["implementer-b"]).toBeUndefined();
      // The overlay loaded: the base's own aliases survived, so the refusal
      // below is about the dropped alias, not a missing file's empty defaults.
      expect(configs.run.aliases.implementer).toBeDefined();
      // Keep the probe off the operator's real session/worktree roots.
      const base = path.basename(repo.dir);
      configs.run.sessions.dir = path.join(
        path.dirname(repo.dir),
        `${base}-missing-sessions`,
      );
      configs.run.worktreeRoot = path.join(
        path.dirname(repo.dir),
        `${base}-missing-wt`,
      );
      const paths = resolveGoalPaths(configs, repo.dir, "missing");
      fs.mkdirSync(paths.goalDir, { recursive: true });
      fs.writeFileSync(
        path.join(paths.goalDir, "intent.md"),
        "# Goal\n\nMissing-alias probe.\n",
        "utf8",
      );
      const store = createFolderStore(paths.goalDir, undefined, {});
      await store.ensureLayout();
      const harnesses = new Map<string, Harness>();
      for (const id of ["agy", "claude-code", "codex", "omp", "opencode", "pi"])
        harnesses.set(
          id,
          new FakeHarness({
            id,
            caps: { effort: ["low", "medium", "high", "max"] },
          }),
        );
      try {
        await preflight({ configs, paths, store, harnesses });
        throw new Error("pre-flight accepted a config missing implementer-b");
      } catch (err) {
        expect(err).toBeInstanceOf(PreflightError);
        expect((err as PreflightError).report).toContain(
          "aliases.implementer-b: required by",
        );
      }
    } finally {
      repo.cleanup();
      fs.rmSync(configsDir, { recursive: true, force: true });
    }
  });
});
