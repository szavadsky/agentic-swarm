import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  createRealModelCatalog,
  resolveHarnessBinaries,
} from "../../src/cli/harnesses.js";
import { AcpxHarness } from "../../src/harness/acpx/harness.js";
import { FakeHarness } from "../../src/harness/fake/index.js";
import type { Harness } from "../../src/harness/types.js";
import { loadConfigs, resolveGoalPaths } from "../../src/kernel/config.js";
import { type ModelCatalog, preflight } from "../../src/kernel/preflight.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { createTmpRepo } from "../helpers/tmp-repo.js";
import { createAcpxStub } from "./acpx-stub.js";

// Mirrors bootstrap/run/self-acpx.yaml (implementer on pi, reviewer on codex).
// Inlined: the package suite must not reach outside the package.
const RUN_CONFIG_TEXT = `aliases:
  architect: { harness: omp, model: anthropic/claude-opus-5-5, effort: high, fallbacks: [opencode-go/deepseek-v4.1-flash] }
  pm: { harness: opencode, model: opencode/beam-free, fallbacks: [opencode-go/deepseek-v4.1-flash] }
  digest: { harness: opencode, model: opencode/beam-free, fallbacks: [opencode-go/deepseek-v4.1-flash] }
  implementer: { harness: pi, model: opencode-go/beam-free, effort: high }
  reviewer: { harness: codex, model: deepseek-v4.1-flash, effort: high }
  escalation: { harness: omp, model: anthropic/claude-sonnet-5-5 }
scouts: { model: opencode-go/deepseek-v4.1-flash }
prices:
  anthropic/claude-opus-5-5: { input: 4, cachedInput: 0.2, output: 20, reasoning: 20 }
  anthropic/claude-sonnet-5-5: { input: 2, cachedInput: 0.1, output: 10, reasoning: 10 }
  opencode/beam-free: { input: 0, cachedInput: 0, output: 0, reasoning: 0 }
  opencode-go/beam-free: { input: 0, cachedInput: 0, output: 0, reasoning: 0 }
  opencode-go/deepseek-v4.1-flash: { input: 0.15, cachedInput: 0.003, output: 0.6, reasoning: 0.6 }
  deepseek-v4.1-flash: { input: 0.15, cachedInput: 0.003, output: 0.6, reasoning: 0.6 }
limits: { concurrency: 3, iterations: 1 }
sessions: { dir: "", keepRuns: 5 }
worktreeRoot: "/tmp/worktrees"
`;
const EFFORTS = ["low", "medium", "high", "xhigh", "max"];

describe("self-acpx run config", () => {
  it("routes implementer through pi and reviewer through codex and passes pre-flight", async () => {
    const repo = createTmpRepo();
    const stub = createAcpxStub();
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (message: string) => warnings.push(message);
    try {
      repo.writeFile(
        ".factory/repo.yaml",
        "baseBranch: main\nartifactRoot: .factory/artifacts\nsetup: []\ngates: []\n",
      );
      repo.commit("factory config");
      const runConfigPath = path.join(repo.dir, ".factory", "run-acpx.yaml");
      fs.writeFileSync(runConfigPath, RUN_CONFIG_TEXT, "utf8");
      const configs = loadConfigs(repo.dir, { runConfigPath });
      const base = path.basename(repo.dir);
      configs.run.sessions.dir = path.join(
        path.dirname(repo.dir),
        `${base}-sessions`,
      );
      configs.run.worktreeRoot = path.join(
        path.dirname(repo.dir),
        `${base}-worktrees`,
      );

      expect(configs.run.aliases.implementer).toMatchObject({
        harness: "pi",
        model: "opencode-go/beam-free",
        effort: "high",
      });
      expect(configs.run.aliases.reviewer).toMatchObject({
        harness: "codex",
        model: "deepseek-v4.1-flash",
        effort: "high",
      });
      expect(configs.run.prices?.["deepseek-v4.1-flash"]).toBeDefined();

      const paths = resolveGoalPaths(configs, repo.dir, "self-acpx");
      fs.mkdirSync(paths.goalDir, { recursive: true });
      fs.writeFileSync(
        path.join(paths.goalDir, "intent.md"),
        "# Goal\n",
        "utf8",
      );
      const store = createFolderStore(paths.goalDir);
      await store.ensureLayout();

      const harnesses = new Map<string, Harness>([
        [
          "opencode",
          new FakeHarness({ id: "opencode", caps: { effort: EFFORTS } }),
        ],
        ["omp", new FakeHarness({ id: "omp", caps: { effort: EFFORTS } })],
        ["pi", new AcpxHarness({ agent: "pi", binary: stub.binary })],
        ["codex", new AcpxHarness({ agent: "codex", binary: stub.binary })],
      ]);
      const acpxCatalog = createRealModelCatalog({
        pi: stub.binary,
        codex: stub.binary,
      });
      const catalog: ModelCatalog = (harness, model) =>
        harness === "pi" || harness === "codex"
          ? acpxCatalog(harness, model)
          : Promise.resolve(true);

      const result = await preflight({
        configs,
        paths,
        store,
        harnesses,
        binaries: {
          opencode: stub.binary,
          omp: stub.binary,
          pi: stub.binary,
          codex: stub.binary,
        },
        catalog,
        baseGates: false,
      });

      expect(result.aliases.implementer).toBe("high");
      expect(result.aliases.reviewer).toBe("high");
      expect(warnings.join("\n")).toContain('skipping model check for "pi"');
      expect(warnings.join("\n")).toContain('skipping model check for "codex"');
    } finally {
      console.warn = originalWarn;
      stub.cleanup();
      repo.cleanup();
    }
  });

  it("accepts an agy reviewer whose effort lives in the model id and skips its model list", async () => {
    const repo = createTmpRepo();
    const stub = createAcpxStub();
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (message: string) => warnings.push(message);
    try {
      repo.writeFile(
        ".factory/repo.yaml",
        "baseBranch: main\nartifactRoot: .factory/artifacts\nsetup: []\ngates: []\n",
      );
      repo.commit("factory config");
      const runConfigPath = path.join(repo.dir, ".factory", "run-agy.yaml");
      fs.writeFileSync(
        runConfigPath,
        RUN_CONFIG_TEXT.replace(
          "  reviewer: { harness: codex, model: deepseek-v4.1-flash, effort: high }",
          "  reviewer: { harness: agy, model: gemini-3.8-flash-high }",
        ),
        "utf8",
      );
      const configs = loadConfigs(repo.dir, { runConfigPath });
      const base = path.basename(repo.dir);
      configs.run.sessions.dir = path.join(
        path.dirname(repo.dir),
        `${base}-sessions`,
      );
      configs.run.worktreeRoot = path.join(
        path.dirname(repo.dir),
        `${base}-worktrees`,
      );

      const paths = resolveGoalPaths(configs, repo.dir, "self-agy");
      fs.mkdirSync(paths.goalDir, { recursive: true });
      fs.writeFileSync(
        path.join(paths.goalDir, "intent.md"),
        "# Goal\n",
        "utf8",
      );
      const store = createFolderStore(paths.goalDir);
      await store.ensureLayout();

      const harnesses = new Map<string, Harness>([
        [
          "opencode",
          new FakeHarness({ id: "opencode", caps: { effort: EFFORTS } }),
        ],
        ["omp", new FakeHarness({ id: "omp", caps: { effort: EFFORTS } })],
        ["pi", new AcpxHarness({ agent: "pi", binary: stub.binary })],
        ["agy", new AcpxHarness({ agent: "agy", binary: stub.binary })],
      ]);
      const acpxCatalog = createRealModelCatalog({
        pi: stub.binary,
        agy: stub.binary,
      });
      const catalog: ModelCatalog = (harness, model) =>
        harness === "pi" || harness === "agy"
          ? acpxCatalog(harness, model)
          : Promise.resolve(true);

      const result = await preflight({
        configs,
        paths,
        store,
        harnesses,
        binaries: {
          opencode: stub.binary,
          omp: stub.binary,
          pi: stub.binary,
          agy: stub.binary,
        },
        catalog,
        baseGates: false,
      });

      // The suffix is the effort: no separate alias key, nothing to resolve.
      expect(result.aliases.reviewer).toBeUndefined();
      expect(warnings.join("\n")).toContain('skipping model check for "agy"');
    } finally {
      console.warn = originalWarn;
      stub.cleanup();
      repo.cleanup();
    }
  });
});

describe("agy harness registry", () => {
  it("resolves the agy harness binary from AGY_PATH", () => {
    const previous = process.env.AGY_PATH;
    process.env.AGY_PATH = "/opt/agy-test";
    try {
      expect(resolveHarnessBinaries().agy).toBe("/opt/agy-test");
    } finally {
      if (previous === undefined) delete process.env.AGY_PATH;
      else process.env.AGY_PATH = previous;
    }
  });
});
