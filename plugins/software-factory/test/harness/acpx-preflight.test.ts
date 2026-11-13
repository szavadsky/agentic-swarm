import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createFolderStore } from "../../src/kernel/store.js";
import { loadConfigs, resolveGoalPaths } from "../../src/kernel/config.js";
import { preflight, type ModelCatalog } from "../../src/kernel/preflight.js";
import { FakeHarness } from "../../src/harness/fake/index.js";
import { AcpxHarness } from "../../src/harness/acpx/harness.js";
import type { Harness } from "../../src/harness/types.js";
import { createRealModelCatalog } from "../../src/cli/harnesses.js";
import { createTmpRepo } from "../helpers/tmp-repo.js";
import { createAcpxStub } from "./acpx-stub.js";

const RUN_CONFIG = path.resolve(import.meta.dir, "../../../../bootstrap/run/self-acpx.yaml");
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
        "baseBranch: main\nartifactRoot: .factory/artifacts\nsetup: []\ngates: []\n"
      );
      repo.commit("factory config");
      const configs = loadConfigs(repo.dir, { runConfigPath: RUN_CONFIG });
      const base = path.basename(repo.dir);
      configs.run.sessions.dir = path.join(path.dirname(repo.dir), `${base}-sessions`);
      configs.run.worktreeRoot = path.join(path.dirname(repo.dir), `${base}-worktrees`);

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
      fs.writeFileSync(path.join(paths.goalDir, "intent.md"), "# Goal\n", "utf8");
      const store = createFolderStore(paths.goalDir);
      await store.ensureLayout();

      const sessionDir = path.join(paths.sessionsDir, "probe");
      const harnesses = new Map<string, Harness>([
        ["opencode", new FakeHarness({ id: "opencode", caps: { effort: EFFORTS } })],
        ["omp", new FakeHarness({ id: "omp", caps: { effort: EFFORTS } })],
        ["pi", new AcpxHarness({ agent: "pi", sessionDir, binary: stub.binary })],
        ["codex", new AcpxHarness({ agent: "codex", sessionDir, binary: stub.binary })],
      ]);
      const acpxCatalog = createRealModelCatalog({ pi: stub.binary, codex: stub.binary });
      const catalog: ModelCatalog = (harness, model) =>
        harness === "pi" || harness === "codex"
          ? acpxCatalog(harness, model)
          : Promise.resolve(true);

      const result = await preflight({
        configs,
        paths,
        store,
        harnesses,
        binaries: { opencode: stub.binary, omp: stub.binary, pi: stub.binary, codex: stub.binary },
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
});
