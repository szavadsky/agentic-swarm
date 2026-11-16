import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  createRealHarnesses,
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
  steward: { harness: pi, model: opencode-go/beam-free, effort: high }
  escalation: { harness: omp, model: anthropic/claude-sonnet-5-5 }
harnesses:
  pi:
    acpx:
      agent: pi
      effort: { configId: thought_level, levels: [off, minimal, low, medium, high, xhigh] }
      usage: { cache: false }
  codex:
    acpx:
      agent: codex
      effort: { configId: reasoning_effort, levels: [low, medium, high, xhigh, max] }
      usage: { cache: true }
  agy:
    acpx:
      agent: agy acp
      raw: true
      args: [--approve-all]
      effort:
        configId: thought_level
        levels: [low, medium, high]
        modelBases: { gemini-3.8-flash: [low, medium, high] }
      usage: { cache: true }
scouts: { model: opencode-go/deepseek-v4.1-flash }
priceIds:
  opencode/beam-free: reflection/beam-1.0-501b-a23b
  opencode-go/beam-free: reflection/beam-1.0-501b-a23b
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
      expect(configs.run.priceIds?.["opencode-go/beam-free"]).toBe(
        "reflection/beam-1.0-501b-a23b",
      );

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
        [
          "pi",
          new AcpxHarness({
            id: "pi",
            binary: stub.binary,
            acpx: configs.run.harnesses!.pi!.acpx,
          }),
        ],
        [
          "codex",
          new AcpxHarness({
            id: "codex",
            binary: stub.binary,
            acpx: configs.run.harnesses!.codex!.acpx,
          }),
        ],
      ]);
      const acpxCatalog = createRealModelCatalog(
        {
          pi: stub.binary,
          codex: stub.binary,
        },
        configs.run.harnesses,
      );
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
        [
          "pi",
          new AcpxHarness({
            id: "pi",
            binary: stub.binary,
            acpx: configs.run.harnesses!.pi!.acpx,
          }),
        ],
        [
          "agy",
          new AcpxHarness({
            id: "agy",
            binary: stub.binary,
            acpx: configs.run.harnesses!.agy!.acpx,
          }),
        ],
      ]);
      const acpxCatalog = createRealModelCatalog(
        {
          pi: stub.binary,
          agy: stub.binary,
        },
        configs.run.harnesses,
      );
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

  it("adds a new acpx agent from the run config with no code", async () => {
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
      const runConfigPath = path.join(repo.dir, ".factory", "run-nova.yaml");
      // The nova binding lives in the run config text, not in code.
      fs.writeFileSync(
        runConfigPath,
        RUN_CONFIG_TEXT.replace(
          "  reviewer: { harness: codex, model: deepseek-v4.1-flash, effort: high }",
          "  reviewer: { harness: nova, model: nova-model, effort: high }",
        ).replace(
          "  agy:\n",
          "  nova:\n    acpx:\n      agent: nova\n      effort: { configId: nova_level, levels: [low, high] }\n      usage: { cache: false }\n  agy:\n",
        ),
        "utf8",
      );
      const novaConfigs = loadConfigs(repo.dir, { runConfigPath });
      const base = path.basename(repo.dir);
      novaConfigs.run.sessions.dir = path.join(
        path.dirname(repo.dir),
        `${base}-sessions`,
      );
      novaConfigs.run.worktreeRoot = path.join(
        path.dirname(repo.dir),
        `${base}-worktrees`,
      );

      expect(novaConfigs.run.harnesses!.nova).toMatchObject({
        acpx: { agent: "nova" },
      });

      const paths = resolveGoalPaths(novaConfigs, repo.dir, "self-nova");
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
        [
          "pi",
          new AcpxHarness({
            id: "pi",
            binary: stub.binary,
            acpx: novaConfigs.run.harnesses!.pi!.acpx,
          }),
        ],
        [
          "nova",
          new AcpxHarness({
            id: "nova",
            binary: stub.binary,
            acpx: novaConfigs.run.harnesses!.nova!.acpx,
          }),
        ],
      ]);
      const acpxCatalog = createRealModelCatalog(
        { pi: stub.binary, nova: stub.binary },
        novaConfigs.run.harnesses,
      );
      const catalog: ModelCatalog = (harness, model) =>
        harness === "pi" || harness === "nova"
          ? acpxCatalog(harness, model)
          : Promise.resolve(true);

      const result = await preflight({
        configs: novaConfigs,
        paths,
        store,
        harnesses,
        binaries: {
          opencode: stub.binary,
          omp: stub.binary,
          pi: stub.binary,
          nova: stub.binary,
        },
        catalog,
        baseGates: false,
      });

      expect(result.aliases.reviewer).toBe("high");
      expect(warnings.join("\n")).toContain('skipping model check for "nova"');

      // And it turns: the effort level from config reaches the session set.
      const nova = harnesses.get("nova")!;
      const turn = await nova.turn({
        model: { id: "nova-model" },
        effort: "high",
        cwd: path.dirname(stub.binary),
        prompt: "Say [[text:PONG]]",
        timeouts: { idleMs: 10_000, wallMs: 30_000 },
        opaque: novaConfigs.run.harnesses!.nova!.acpx,
      });
      expect(turn.stop).toEqual({ kind: "done" });
      expect(turn.text).toBe("PONG");
      const set = stub.invocations().find((args) => args.includes("set"))!;
      expect(set.slice(set.indexOf("set"))).toEqual([
        "set",
        "nova_level",
        "high",
      ]);
    } finally {
      console.warn = originalWarn;
      stub.cleanup();
      repo.cleanup();
    }
  });
});

describe("acpx harness registry", () => {
  it("binds harness ids from run config with no code", () => {
    const harnesses = createRealHarnesses({
      sessionDir: "/tmp/sessions",
      harnesses: {
        nova: {
          acpx: {
            agent: "nova",
            effort: { configId: "nova_level", levels: ["low", "high"] },
          },
        },
      },
    });
    expect(harnesses.nova).toBeInstanceOf(AcpxHarness);
    expect(harnesses.nova!.id).toBe("nova");
    expect(harnesses.opencode).toBeDefined();
    expect(harnesses.omp).toBeDefined();
  });

  it("resolves a raw harness binary from its configured command", () => {
    const binaries = resolveHarnessBinaries({
      nova: { acpx: { agent: "/opt/nova-test/bin/nova acp", raw: true } },
      plain: { acpx: { agent: "plain" } },
    });
    expect(binaries.nova).toBe("/opt/nova-test/bin/nova");
    // A positional agent is served by the acpx dispatcher, whatever it is here.
    expect(typeof binaries.plain).toBe("string");
    expect(binaries.plain!.length).toBeGreaterThan(0);
  });
});
