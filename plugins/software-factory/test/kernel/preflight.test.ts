import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { ConfigError, loadConfigs, resolveGoalPaths } from "../../src/kernel/config.js";
import {
  preflight,
  PreflightError,
  type ModelCatalog,
  type PreflightInput,
} from "../../src/kernel/preflight.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { FakeHarness } from "../../src/harness/fake/index.js";
import type { Harness } from "../../src/harness/types.js";

const RUN_HEAD = `aliases:
  architect: { harness: fake, model: arch, effort: highest }
  pm: { harness: fake, model: pm }
  implementer: { harness: fake, model: impl }
  reviewer: { harness: fake, model: rev }
limits: { concurrency: 2, iterations: 1 }
`;

interface Fixture {
  repo: TmpRepo;
  configs: ReturnType<typeof loadConfigs>;
  paths: ReturnType<typeof resolveGoalPaths>;
  input: PreflightInput;
}

async function fixture(runYaml = RUN_HEAD, repoYaml?: string): Promise<Fixture> {
  const repo = createTmpRepo();
  const base = path.basename(repo.dir);
  const run = runYaml
    .replaceAll("WORKTREE_ROOT", `../${base}-wt`)
    .replaceAll("SESSIONS_DIR", `../${base}-sessions`);
  repo.writeFile(
    ".factory/repo.yaml",
    repoYaml ?? "baseBranch: main\nartifactRoot: .factory/artifacts\nsetup: []\ngates: []\n"
  );
  repo.writeFile(".factory/run.yaml", run);
  repo.commit("factory config");
  const configs = loadConfigs(repo.dir);
  const paths = resolveGoalPaths(configs, repo.dir, "demo");
  fs.mkdirSync(paths.goalDir, { recursive: true });
  fs.writeFileSync(path.join(paths.goalDir, "intent.md"), "# Goal\n", "utf8");
  const store = createFolderStore(paths.goalDir);
  await store.ensureLayout();
  const harness = new FakeHarness({ id: "fake", caps: { effort: ["low", "high", "max"] } });
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
  it("resolves effort: highest to the last level the model accepts", async () => {
    const f = await fixture();
    try {
      const result = await preflight(f.input);
      expect(result.aliases.architect).toBe("max");
      expect(f.configs.run.aliases.architect!.effort).toBe("max");
    } finally {
      f.repo.cleanup();
    }
  });

  it("reads object-valued capability variants from the opencode adapter", async () => {
    const f = await fixture();
    try {
      const harness = new FakeHarness({
        id: "fake",
        caps: { effort: [{ id: "low" }, { id: "max" }] as unknown as string[] },
      });
      const result = await preflight({ ...f.input, harnesses: new Map([["fake", harness]]) });
      expect(result.aliases.architect).toBe("max");
      expect(f.configs.run.aliases.architect!.effort).toBe("max");
    } finally {
      f.repo.cleanup();
    }
  });

  it("reports an alias missing for a required role with file and key", async () => {
    const f = await fixture();
    try {
      f.configs.process.roles.architect = { prompt: "architect", alias: "boss" };
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          file: path.join(f.repo.dir, ".factory/run.yaml"),
          key: "aliases.boss",
        })
      );
      expect(err.report).toContain("aliases.boss");
      expect(err.report).toContain(".factory/run.yaml");
    } finally {
      f.repo.cleanup();
    }
  });

  it("refuses an effort level the model does not accept", async () => {
    const f = await fixture(RUN_HEAD.replace("effort: highest", "effort: ultra"));
    try {
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual(
        expect.objectContaining({ key: "aliases.architect.effort", file: expect.stringContaining(".factory/run.yaml") })
      );
      expect(err.report).toContain('effort "ultra" is not supported');
      expect(err.report).toContain("low, high, max");
    } finally {
      f.repo.cleanup();
    }
  });

  it("refuses a model the harness does not list and a missing fallback", async () => {
    const f = await fixture(
      RUN_HEAD.replace("model: pm", "model: ghost").replace(
        "model: arch",
        "model: arch, fallbacks: [gone/model]"
      )
    );
    try {
      const catalog: ModelCatalog = async (_harness, model) => model !== "ghost" && model !== "gone/model";
      const err = await refusal({ ...f.input, catalog });
      const keys = err.findings.map((x) => x.key);
      expect(keys).toContain("aliases.pm.model");
      expect(keys).toContain("aliases.architect.fallbacks.0");
    } finally {
      f.repo.cleanup();
    }
  });

  it("refuses an absent harness binary", async () => {
    const f = await fixture();
    try {
      const err = await refusal({ ...f.input, binaries: { fake: undefined } });
      expect(err.findings).toContainEqual(expect.objectContaining({ key: "harness.fake" }));
    } finally {
      f.repo.cleanup();
    }
  });

  it("refuses session and worktree roots inside the repository", async () => {
    const f = await fixture(
      RUN_HEAD +
        "sessions: { dir: .factory/sessions, keepRuns: 2 }\nworktreeRoot: .factory/worktrees\n"
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

  it("refuses a base branch that does not exist", async () => {
    const f = await fixture(undefined, "baseBranch: ghost\nartifactRoot: .factory/artifacts\n");
    try {
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual(
        expect.objectContaining({ key: "baseBranch", file: path.join(f.repo.dir, ".factory/repo.yaml") })
      );
    } finally {
      f.repo.cleanup();
    }
  });

  it("records and warns about a red base once, without aborting", async () => {
    const f = await fixture(
      undefined,
      "baseBranch: main\nartifactRoot: .factory/artifacts\ngates:\n  - { id: never, command: test -f never.txt }\n"
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
      const baselines = (await f.input.store.listRecords()).filter((r) => r.step === "baseline");
      expect(baselines).toHaveLength(1);
      expect(baselines[0]!.ok).toBe(false);
      expect(warnings.join("\n")).toContain("is red; recorded once");
      expect(warnings.join("\n")).toContain("never");
    } finally {
      console.warn = original;
      f.repo.cleanup();
    }
  });

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
      expect(scratch.startsWith(path.resolve(f.paths.worktreeRoot) + path.sep)).toBe(true);
      expect(scratch.startsWith(path.resolve(f.repo.dir) + path.sep)).toBe(false);
      expect(fs.existsSync(scratch)).toBe(false);
    } finally {
      if (previousTmp === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = previousTmp;
      f.repo.cleanup();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("configuration report", () => {
  it("collects every violation across layers into one report with file and key", () => {
    const repo = createTmpRepo();
    try {
      repo.writeFile(".factory/repo.yaml", "baseBranch: main\ngates: nope\n");
      repo.writeFile(".factory/run.yaml", "aliases:\n  architect: { harness: 7, model: x }\nlimits: { iterations: 0 }\n");
      repo.commit("broken config");
      try {
        loadConfigs(repo.dir);
        throw new Error("loadConfigs unexpectedly passed");
      } catch (err) {
        expect(err).toBeInstanceOf(ConfigError);
        const error = err as ConfigError;
        const keys = error.findings.map((f) => `${path.basename(f.file)}:${f.key}`);
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
