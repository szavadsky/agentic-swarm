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
import { FakeHarness } from "../../src/harness/fake/index.js";
import type { Harness } from "../../src/harness/types.js";
import {
  loadConfigs,
  loadRunConfig,
  resolveGoalPaths,
} from "../../src/kernel/config.js";
import { PreflightError, preflight } from "../../src/kernel/preflight.js";
import { resolveTurn } from "../../src/kernel/flow-context.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { shippedRunConfigsDir } from "../helpers/run-configs.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import {
  registerShippedPolicyTests,
  registerShippedRouteTests,
} from "./live-run-configs-coverage.js";

const LIVE = process.env.FACTORY_LIVE === "1";
const BOOTSTRAP_RUN = shippedRunConfigsDir();
const CONFIGS = ["shakedown", "self"] as const;
/** The shipped config's limits, roots and alias shape. */
function expectLiveRunConfig(
  name: string,
  configs: ReturnType<typeof loadConfigs>,
): void {
  expect(configs.run.limits).toMatchObject({
    concurrency: { overall: 3 },
    iterations: 1,
  });
  expect(configs.run.sessions).toEqual({
    dir: "~/.local/share/factory/sessions",
    keepRuns: 5,
    retention: "short",
  });
  expect(configs.run.worktreeRoot).toBe("~/.local/share/factory/worktrees");
  if (name === "shakedown") {
    expect(configs.run.aliases.architect).toMatchObject({
      harness: "opencode",
      model: "opencode/minimax-m3.1-flash-free",
      effort: "high",
    });
    expect(configs.run.scouts).toBeUndefined();
    return;
  }
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

/** Runs the real-binary probe against isolated session and worktree roots. */
async function livePreflightProbe(
  configs: ReturnType<typeof loadConfigs>,
  repo: TmpRepo,
): Promise<Awaited<ReturnType<typeof preflight>>> {
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
  return await preflight({
    configs,
    paths,
    store,
    harnesses,
    binaries,
    catalog: createRealModelCatalog(binaries),
  });
}

/** The live pre-flight test body, bound to one shipped config. */
async function livePreflightTest(name: string): Promise<void> {
  const repo = createTmpRepo();
  try {
    repo.writeFile(
      ".factory/repo.yaml",
      "baseBranch: main\nartifactRoot: .factory/artifacts\nsetup: []\ngates: []\n",
    );
    repo.commit("factory config");
    const configs = loadConfigs(repo.dir, {
      runConfigPath: path.join(BOOTSTRAP_RUN, `${name}.yaml`),
    });
    expectLiveRunConfig(name, configs);
    const result = await livePreflightProbe(configs, repo);
    expect(result.aliases.architect).toBe("high");
    if (configs.run.scouts) expect(result.aliases.scouts).toBeUndefined();
    expect(result.base?.ok).toBe(true);
  } finally {
    repo.cleanup();
  }
}

describe.skipIf(!LIVE)("bootstrap run configs against the real CLIs", () => {
  for (const name of CONFIGS) {
    it(
      `passes live pre-flight: ${name}.yaml`,
      () => livePreflightTest(name),
      120_000,
    );
  }
});

const RUN_CONFIGS = fs
  .readdirSync(BOOTSTRAP_RUN)
  .filter((name) => name.endsWith(".yaml"))
  .map((name) => name.slice(0, -".yaml".length))
  .sort();

async function shippedPreflightFixture(name: string, runDir = BOOTSTRAP_RUN) {
  const runPath = path.join(runDir, `${name}.yaml`);
  const repo = createTmpRepo();
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
  for (const id of ["agy", "claude-code", "codex", "omp", "opencode", "pi"])
    harnesses.set(
      id,
      new FakeHarness({
        id,
        caps: { effort: ["low", "medium", "high", "max"] },
      }),
    );
  return {
    preflightInput: { configs, paths, store, harnesses },
    configs,
    repo,
  };
}

async function expectShippedPreflight(
  name: string,
  runDir = BOOTSTRAP_RUN,
): Promise<void> {
  const { preflightInput, configs, repo } = await shippedPreflightFixture(
    name,
    runDir,
  );
  try {
    const result = await preflight(preflightInput);
    // The alias was not merely present: pre-flight checked it and resolved
    // the effort it names (none on shakedown's free alternate).
    expect(result.aliases).toHaveProperty("implementer-b");
    expect(result.aliases["implementer-b"]).toBe(
      configs.run.aliases["implementer-b"]!.effort,
    );
  } finally {
    repo.cleanup();
  }
}

function registerShippedPreflightTest(name: string): void {
  it(`passes pre-flight: ${name}.yaml`, () => expectShippedPreflight(name));
}

describe("shipped run-config coverage", () => {
  for (const name of RUN_CONFIGS) {
    registerShippedRouteTests(name);
    registerShippedPolicyTests(name);
    registerShippedPreflightTest(name);
  }
});

/** Every model id a run config can route to. */
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

describe("self-free run config", () => {
  it("resolves the reviewer chain with a claude-code sonnet fallback", async () => {
    const runPath = path.join(BOOTSTRAP_RUN, "self-free.yaml");
    const repo = createTmpRepo();
    try {
      repo.writeFile(
        ".factory/repo.yaml",
        "baseBranch: main\nartifactRoot: .factory/artifacts\nsetup: []\ngates: []\n",
      );
      repo.commit("factory config");
      const configs = loadConfigs(repo.dir, { runConfigPath: runPath });
      const paths = resolveGoalPaths(configs, repo.dir, "self-free");
      const harnesses = new Map<string, Harness>();
      for (const id of ["agy", "claude-code", "codex", "omp", "opencode", "pi"])
        harnesses.set(
          id,
          new FakeHarness({
            id,
            caps: { effort: ["low", "medium", "high", "max"] },
          }),
        );
      const runtime = {
        paths,
        configs,
        harnesses,
        prompts: { reviewer: { template: "", schema: {} } },
        exhaustedPools: new Map(),
      } as unknown as KernelRuntime;

      const target = resolveTurn(runtime, "reviewer", "reviewer");
      expect(target.tiers).toHaveLength(3);
      expect(target.tiers[0]).toMatchObject({
        harness: harnesses.get("opencode"),
        model: { id: "opencode-go/muse-spark-1.3-contributor", effort: "high" },
        effort: "high",
        subscription: "opencode-go",
      });
      expect(target.tiers[1]).toMatchObject({
        harness: harnesses.get("opencode"),
        model: { id: "opencode-go/deepseek-v4.1-flash" },
        effort: "high",
        subscription: "opencode-go",
      });
      expect(target.tiers[2]).toMatchObject({
        harness: harnesses.get("claude-code"),
        model: { id: "sonnet", effort: "high" },
        effort: "high",
        subscription: "claude",
      });
    } finally {
      repo.cleanup();
    }
  });
});

/**
 * The coverage above only stops a broken shipped config if a launch would be
 * refused: an overlay that drops an alias the flows name must fail pre-flight,
 * not run until the step first names it.
 */
/** Runs pre-flight on an overlay that dropped implementer-b; returns the refusal. */
async function missingAliasProbe(
  configs: ReturnType<typeof loadConfigs>,
  repo: TmpRepo,
): Promise<unknown> {
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
  } catch (err) {
    return err;
  }
  throw new Error("pre-flight accepted a config missing implementer-b");
}

/** An overlay dropping implementer-b must be refused by pre-flight. */
async function missingAliasRefused(): Promise<void> {
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
    const err = await missingAliasProbe(configs, repo);
    expect(err).toBeInstanceOf(PreflightError);
    expect((err as PreflightError).report).toContain(
      "aliases.implementer-b: required by",
    );
  } finally {
    repo.cleanup();
    fs.rmSync(configsDir, { recursive: true, force: true });
  }
}

describe("shipped run config with a missing alias", () => {
  it("is refused by pre-flight", missingAliasRefused);
});

async function shippedRunConfigMissingYamlServer(): Promise<void> {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "factory-missing-yaml-server-"),
  );
  const configsDir = path.join(tmpDir, "configs");
  fs.cpSync(BOOTSTRAP_RUN, configsDir, { recursive: true });
  const gitDir = path.join(tmpDir, "bin");
  fs.mkdirSync(gitDir);
  const gitBin = Bun.which("git");
  if (gitBin) fs.symlinkSync(gitBin, path.join(gitDir, "git"));
  const { preflightInput, repo } = await shippedPreflightFixture(
    "self",
    configsDir,
  );
  const binaries = Object.fromEntries(
    [...preflightInput.harnesses.keys()].map((id) => [id, process.execPath]),
  );
  const originalPath = process.env.PATH;
  const inheritedGitDirs = (originalPath ?? "")
    .split(path.delimiter)
    .filter((dir) => {
      try {
        fs.accessSync(path.join(dir, "git"), fs.constants.X_OK);
        return true;
      } catch {
        return false;
      }
    });
  const clampedPath = [gitDir, ...inheritedGitDirs].join(path.delimiter);
  process.env.PATH = clampedPath;
  expect(
    clampedPath.split(path.delimiter).some((dir) => {
      try {
        fs.accessSync(
          path.join(dir, "yaml-language-server"),
          fs.constants.X_OK,
        );
        return true;
      } catch {
        return false;
      }
    }),
  ).toBe(false);
  try {
    let err: unknown;
    try {
      await preflight({ ...preflightInput, binaries });
    } catch (caught) {
      err = caught;
    }
    expect(err).toBeInstanceOf(PreflightError);
    const report = (err as PreflightError).report;
    expect(report).toContain("lsp");
    expect(report).toContain("yaml-language-server");
  } finally {
    process.env.PATH = originalPath;
    repo.cleanup();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

describe("shipped run config with a missing yaml language server", () => {
  it("is refused by pre-flight", shippedRunConfigMissingYamlServer);
});
