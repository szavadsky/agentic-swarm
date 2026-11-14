import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo } from "../helpers/tmp-repo.js";
import { loadConfigs, resolveGoalPaths } from "../../src/kernel/config.js";
import { preflight } from "../../src/kernel/preflight.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { createRealHarnesses, createRealModelCatalog, resolveHarnessBinaries } from "../../src/cli/harnesses.js";

const LIVE = process.env.FACTORY_LIVE === "1";
const BOOTSTRAP_RUN = path.resolve(import.meta.dir, "../../../../bootstrap/run");
const CONFIGS = ["shakedown", "self"] as const;

describe.skipIf(!LIVE)("bootstrap run configs against the real CLIs", () => {
  for (const name of CONFIGS) {
    it(`passes live pre-flight: ${name}.yaml`, async () => {
      const repo = createTmpRepo();
      try {
        repo.writeFile(".factory/repo.yaml", "baseBranch: main\nartifactRoot: .factory/artifacts\nsetup: []\ngates: []\n");
        repo.commit("factory config");
        const runPath = path.join(BOOTSTRAP_RUN, `${name}.yaml`);
        // Live tests need a full checkout; a package-only export has no bootstrap/.
        if (!fs.existsSync(runPath)) return;
        expect(fs.existsSync(runPath)).toBe(true);
        const configs = loadConfigs(repo.dir, { runConfigPath: runPath });

        expect(configs.run.limits).toMatchObject({ concurrency: 3, iterations: 1 });
        expect(configs.run.sessions).toEqual({ dir: "~/.local/share/factory/sessions", keepRuns: 5 });
        expect(configs.run.worktreeRoot).toBe("~/.local/share/factory/worktrees");
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
          expect(configs.run.scouts).toEqual({ model: "opencode-go/deepseek-v4.1-flash" });
        }

        // Keep the probe off the operator's real session/worktree roots.
        const base = path.basename(repo.dir);
        configs.run.sessions.dir = path.join(path.dirname(repo.dir), `${base}-live-sessions`);
        configs.run.worktreeRoot = path.join(path.dirname(repo.dir), `${base}-live-wt`);

        const paths = resolveGoalPaths(configs, repo.dir, "live");
        fs.mkdirSync(paths.goalDir, { recursive: true });
        fs.writeFileSync(path.join(paths.goalDir, "intent.md"), "# Goal\n\nLive pre-flight probe.\n", "utf8");
        const store = createFolderStore(paths.goalDir);
        await store.ensureLayout();

        const binaries = resolveHarnessBinaries();
        expect(binaries.opencode).toBeTruthy();
        expect(binaries.omp).toBeTruthy();
        const harnesses = new Map(
          Object.entries(
            createRealHarnesses({
              sessionDir: path.join(paths.sessionsDir, "probe"),
              scouts: configs.run.scouts ? { id: configs.run.scouts.model } : undefined,
            })
          )
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
