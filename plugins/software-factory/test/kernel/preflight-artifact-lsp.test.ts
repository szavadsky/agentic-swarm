import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FakeHarness } from "../../src/harness/fake/index.js";
import type { Harness } from "../../src/harness/types.js";
import { loadConfigs, resolveGoalPaths } from "../../src/kernel/config.js";
import {
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

describe("pre-flight artifact LSP", () => {
  const scope1 = preFlightArtifactLSPPart1();
  preFlightArtifactLSPPart2(scope1);
});
