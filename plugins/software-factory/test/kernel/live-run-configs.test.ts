import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import {
  createRealHarnesses,
  createRealModelCatalog,
  resolveHarnessBinaries,
} from "../../src/cli/harnesses.js";
import {
  loadConfigs,
  resolveGoalPaths,
  runConfigSchema,
} from "../../src/kernel/config.js";
import { preflight } from "../../src/kernel/preflight.js";
import { matchPrice, type PriceTable } from "../../src/kernel/pricing.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { createTmpRepo } from "../helpers/tmp-repo.js";

const LIVE = process.env.FACTORY_LIVE === "1";
const BOOTSTRAP_RUN = path.resolve(
  import.meta.dir,
  "../../../../bootstrap/run",
);
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
        // Live tests need a full checkout; a package-only export has no bootstrap/.
        if (!fs.existsSync(runPath)) return;
        expect(fs.existsSync(runPath)).toBe(true);
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
        const store = createFolderStore(paths.goalDir);
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

const RUN_CONFIGS = fs.existsSync(BOOTSTRAP_RUN)
  ? fs
      .readdirSync(BOOTSTRAP_RUN)
      .filter((name) => name.endsWith(".yaml"))
      .map((name) => name.slice(0, -".yaml".length))
      .sort()
  : [];

describe("shipped run-config coverage", () => {
  for (const name of RUN_CONFIGS) {
    it(`routes opencode through the acpx raw route: ${name}.yaml`, () => {
      const runPath = path.join(BOOTSTRAP_RUN, `${name}.yaml`);
      if (!fs.existsSync(runPath)) return;
      const run = runConfigSchema.parse(
        yaml.parse(fs.readFileSync(runPath, "utf8")),
      );
      // The built-in acpx opencode route runs 1.19.5; the raw `opencode acp`
      // route runs the installed CLI (acpx-probe §0).
      expect(run.harnesses.opencode?.acpx).toMatchObject({
        agent: "opencode acp",
        raw: true,
        effort: { configId: "effort" },
      });
    });

    it(`carries the required plan role aliases: ${name}.yaml`, () => {
      const runPath = path.join(BOOTSTRAP_RUN, `${name}.yaml`);
      if (!fs.existsSync(runPath)) return;
      const run = runConfigSchema.parse(
        yaml.parse(fs.readFileSync(runPath, "utf8")),
      );
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

    it(`resolves every model id: ${name}.yaml`, () => {
      const runPath = path.join(BOOTSTRAP_RUN, `${name}.yaml`);
      // A package-only export has no bootstrap/ sibling.
      if (!fs.existsSync(runPath)) return;
      const run = runConfigSchema.parse(
        yaml.parse(fs.readFileSync(runPath, "utf8")),
      );
      expect(run.priceIds).toBeDefined();
      const ids = new Set<string>();
      for (const alias of Object.values(run.aliases)) {
        ids.add(alias.model);
        for (const entry of alias.rotate) ids.add(entry.model);
        for (const fb of alias.fallbacks) {
          if ("model" in fb) ids.add(fb.model);
        }
      }
      if (run.scouts) ids.add(run.scouts.model);
      expect(ids.size).toBeGreaterThan(0);
      for (const id of [...ids].sort()) {
        expect(
          matchPrice(OPENROUTER_IDS, id, run.priceIds),
          `${name}.yaml: ${id} matches no OpenRouter id`,
        ).toBeDefined();
      }
      // No dangling mappings: every priceIds target is a catalog id.
      for (const [from, to] of Object.entries(run.priceIds)) {
        expect(
          OPENROUTER_IDS[to],
          `${name}.yaml: priceIds ${from} -> ${to} names no catalog id`,
        ).toBeDefined();
      }
    });
  }
});

describe("self-rotate run config", () => {
  it("is self.yaml with only the implementer rotating across the probe harnesses", () => {
    const selfPath = path.join(BOOTSTRAP_RUN, "self.yaml");
    const rotatePath = path.join(BOOTSTRAP_RUN, "self-rotate.yaml");
    if (!fs.existsSync(selfPath) || !fs.existsSync(rotatePath)) return;
    const self = runConfigSchema.parse(
      yaml.parse(fs.readFileSync(selfPath, "utf8")),
    );
    const rotating = runConfigSchema.parse(
      yaml.parse(fs.readFileSync(rotatePath, "utf8")),
    );
    const { implementer: selfImplementer, ...selfAliases } = self.aliases;
    const { implementer: rotatingImplementer, ...rotatingAliases } =
      rotating.aliases;
    expect(rotatingAliases).toEqual(selfAliases);
    expect(rotatingImplementer).toMatchObject({
      harness: selfImplementer!.harness,
      model: selfImplementer!.model,
    });
    expect(rotatingImplementer!.rotate.map((entry) => entry.harness)).toEqual([
      "opencode",
      "pi",
      "codex",
    ]);
    // The owner adopts rotation by pointing a run at self-rotate; self.yaml
    // itself stays unrotated.
    expect(selfImplementer!.rotate).toEqual([]);
  });
});
