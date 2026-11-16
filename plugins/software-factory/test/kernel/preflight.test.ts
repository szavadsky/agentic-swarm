import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FakeHarness } from "../../src/harness/fake/index.js";
import type { Harness } from "../../src/harness/types.js";
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
import { createFolderStore } from "../../src/kernel/store.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { task } from "./helpers.js";

const RUN_HEAD = `aliases:
  architect: { harness: fake, model: arch, effort: highest }
  pm: { harness: fake, model: pm }
  implementer: { harness: fake, model: impl }
  reviewer: { harness: fake, model: rev }
  steward: { harness: fake, model: steward }
limits: { concurrency: { overall: 2 }, iterations: 1 }
`;

interface Fixture {
  repo: TmpRepo;
  configs: ReturnType<typeof loadConfigs>;
  paths: ReturnType<typeof resolveGoalPaths>;
  input: PreflightInput;
}

/** Architect and implementer on different harnesses; omp is the scouts consumer. */
const SPLIT_HARNESSES = RUN_HEAD.replace(
  "architect: { harness: fake, model: arch, effort: highest }",
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
      caps: { effort: ["low", "medium", "high"] },
    }),
  );
  return harnesses;
}

function withScouts(runYaml: string, scouts: string): string {
  return runYaml.replace("limits:", `${scouts}\nlimits:`);
}

async function fixture(
  runYaml = RUN_HEAD,
  repoYaml?: string,
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
  repo.commit("factory config");
  const configs = loadConfigs(repo.dir);
  const paths = resolveGoalPaths(configs, repo.dir, "demo");
  fs.mkdirSync(paths.goalDir, { recursive: true });
  fs.writeFileSync(path.join(paths.goalDir, "intent.md"), "# Goal\n", "utf8");
  const store = createFolderStore(paths.goalDir);
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

  it("reports an alias missing for a required role with file and key", async () => {
    const f = await fixture();
    try {
      f.configs.process.roles.architect = {
        prompt: "architect",
        alias: "boss",
      };
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          file: path.join(f.repo.dir, ".factory/run.yaml"),
          key: "aliases.boss",
        }),
      );
      expect(err.report).toContain("aliases.boss");
      expect(err.report).toContain(".factory/run.yaml");
    } finally {
      f.repo.cleanup();
    }
  });

  it("refuses an effort level the model does not accept", async () => {
    const f = await fixture(
      RUN_HEAD.replace("effort: highest", "effort: ultra"),
    );
    try {
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          key: "aliases.architect.effort",
          file: expect.stringContaining(".factory/run.yaml"),
        }),
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
        "model: arch, fallbacks: [{ model: gone/model }]",
      ),
    );
    try {
      const catalog: ModelCatalog = async (_harness, model) =>
        model !== "ghost" && model !== "gone/model";
      const err = await refusal({ ...f.input, catalog });
      const keys = err.findings.map((x) => x.key);
      expect(keys).toContain("aliases.pm.model");
      expect(keys).toContain("aliases.architect.fallbacks.0.model");
    } finally {
      f.repo.cleanup();
    }
  });

  it("validates a cross-harness fallback against its own harness", async () => {
    const f = await fixture(
      RUN_HEAD.replace(
        "implementer: { harness: fake, model: impl }",
        "implementer: { harness: fake, model: impl, fallbacks: [{ harness: other, model: far }] }",
      ),
    );
    try {
      const harnesses = new Map(f.input.harnesses);
      harnesses.set("other", new FakeHarness({ id: "other" }));
      const catalog: ModelCatalog = async (harness, model) =>
        !(harness === "other" && model === "far");
      const err = await refusal({ ...f.input, harnesses, catalog });
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          key: "aliases.implementer.fallbacks.0.model",
          message: 'fallback "far" is not listed by harness "other"',
        }),
      );
    } finally {
      f.repo.cleanup();
    }
  });

  it("checks scouts against omp, not the architect's harness", async () => {
    const f = await fixture(
      withScouts(SPLIT_HARNESSES, "scouts: { model: ernie, effort: highest }"),
    );
    try {
      const seen: string[] = [];
      const catalog: ModelCatalog = async (harness, model) => {
        seen.push(`${harness}/${model}`);
        return true;
      };
      const result = await preflight({
        ...f.input,
        harnesses: splitHarnesses(f),
        catalog,
      });
      expect(result.aliases.scouts).toBe("high");
      expect(f.configs.run.scouts!.effort).toBe("high");
      expect(seen).toContain("omp/ernie");
      expect(seen).not.toContain("claude-code/ernie");
    } finally {
      f.repo.cleanup();
    }
  });

  it("refuses a scouts model omp does not list, naming omp", async () => {
    const f = await fixture(
      withScouts(SPLIT_HARNESSES, "scouts: { model: ernie }"),
    );
    try {
      const catalog: ModelCatalog = async (harness, model) =>
        harness !== "omp" || model === "impl";
      const err = await refusal({
        ...f.input,
        harnesses: splitHarnesses(f),
        catalog,
      });
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          key: "scouts.model",
          message: 'model "ernie" is not listed by harness "omp"',
        }),
      );
      expect(err.report).toContain('harness "omp"');
    } finally {
      f.repo.cleanup();
    }
  });

  it("refuses a scouts block when no alias or fallback runs on omp", async () => {
    const f = await fixture(withScouts(RUN_HEAD, "scouts: { model: ernie }"));
    try {
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          file: path.join(f.repo.dir, ".factory/run.yaml"),
          key: "scouts",
          message: expect.stringContaining("no harness consumes it"),
        }),
      );
      expect(err.report).toContain('harness "omp"');
    } finally {
      f.repo.cleanup();
    }
  });

  it("accepts scouts when only a fallback tier runs on omp", async () => {
    const f = await fixture(
      withScouts(
        SPLIT_HARNESSES.replace(
          "implementer: { harness: omp, model: impl }",
          "implementer: { harness: fake, model: impl, fallbacks: [{ harness: omp, model: impl-omp }] }",
        ),
        "scouts: { model: ernie }",
      ),
    );
    try {
      const seen: string[] = [];
      const catalog: ModelCatalog = async (harness, model) => {
        seen.push(`${harness}/${model}`);
        return true;
      };
      await preflight({ ...f.input, harnesses: splitHarnesses(f), catalog });
      expect(seen).toContain("omp/ernie");
    } finally {
      f.repo.cleanup();
    }
  });

  it("refuses a fallback on an unregistered harness", async () => {
    const f = await fixture(
      RUN_HEAD.replace(
        "implementer: { harness: fake, model: impl }",
        "implementer: { harness: fake, model: impl, fallbacks: [{ harness: ghost, model: far }] }",
      ),
    );
    try {
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          key: "aliases.implementer.fallbacks.0.harness",
        }),
      );
      expect(err.report).toContain('harness "ghost" is not registered');
    } finally {
      f.repo.cleanup();
    }
  });

  it("resolves each fallback effort against its own harness caps", async () => {
    const f = await fixture(
      RUN_HEAD.replace(
        "implementer: { harness: fake, model: impl }",
        "implementer: { harness: fake, model: impl, effort: highest, fallbacks: [{ harness: other, model: far, effort: highest }, { model: near }] }",
      ),
    );
    try {
      const harnesses = new Map(f.input.harnesses);
      harnesses.set(
        "other",
        new FakeHarness({ id: "other", caps: { effort: ["low", "high"] } }),
      );
      const result = await preflight({ ...f.input, harnesses });
      expect(result.aliases.implementer).toBe("max");
      const fallbacks = f.configs.run.aliases.implementer!.fallbacks!;
      expect(fallbacks[0]!.effort).toBe("high");
      expect(fallbacks[1]!.effort).toBe("max");
    } finally {
      f.repo.cleanup();
    }
  });

  it("refuses a subscription that names no capped pool", async () => {
    const f = await fixture(
      RUN_HEAD.replace(
        "implementer: { harness: fake, model: impl }",
        "implementer: { harness: fake, model: impl, subscription: typo, fallbacks: [{ model: near, subscription: other-typo }] }",
      ).replace(
        "limits: { concurrency: { overall: 2 }, iterations: 1 }",
        "limits: { concurrency: { overall: 2, perSubscription: { pool: 1 } }, iterations: 1 }",
      ),
    );
    try {
      const err = await refusal(f.input);
      const keys = err.findings.map((x) => x.key);
      expect(keys).toContain("aliases.implementer.subscription");
      expect(keys).toContain("aliases.implementer.fallbacks.0.subscription");
    } finally {
      f.repo.cleanup();
    }
  });

  it("refuses an absent harness binary", async () => {
    const f = await fixture();
    try {
      const err = await refusal({ ...f.input, binaries: { fake: undefined } });
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          key: "harness.fake",
          message: 'binary "fake" is not executable or not on PATH',
        }),
      );
    } finally {
      f.repo.cleanup();
    }
  });

  it("names acpx and the bunx route when an acpx alias has no binary", async () => {
    const f = await fixture(
      RUN_HEAD.replace(
        "implementer: { harness: fake, model: impl }",
        "implementer: { harness: pi, model: impl }",
      ),
    );
    try {
      const harnesses = new Map(f.input.harnesses);
      harnesses.set("pi", new FakeHarness({ id: "pi" }));
      // resolveAcpxCommand falls back to a bunx executable when acpx is absent;
      // a missing bunx is the host state where that on-demand route cannot run.
      const err = await refusal({
        ...f.input,
        harnesses,
        binaries: { fake: process.execPath, pi: "/nonexistent/bin/bunx" },
      });
      const finding = err.findings.find((x) => x.key === "harness.pi");
      expect(finding?.message).toContain("acpx");
      expect(finding?.message).toContain("bunx acpx");
      expect(err.report).toContain("bunx acpx");
    } finally {
      f.repo.cleanup();
    }
  });

  it("refuses a task tier that names no alias, ignoring `default`", async () => {
    const f = await fixture();
    try {
      await f.input.store.writeTask(task("escalated", { tier: "escalation" }));
      await f.input.store.writeTask(task("plain", { tier: "default" }));
      const err = await refusal(f.input);
      const tierFindings = err.findings.filter(
        (finding) => finding.key === "tier",
      );
      expect(tierFindings).toHaveLength(1);
      expect(tierFindings[0]).toEqual(
        expect.objectContaining({
          file: path.join(f.input.store.tasksDir, "escalated.md"),
          message: 'tier "escalation" names no run-config alias',
        }),
      );
      expect(err.report).toContain(
        'tier "escalation" names no run-config alias',
      );
    } finally {
      f.repo.cleanup();
    }
  });

  it("accepts a tier that names a configured alias", async () => {
    const f = await fixture(
      RUN_HEAD.replace(
        "limits:",
        "  escalation: { harness: fake, model: esc }\nlimits:",
      ),
    );
    try {
      await f.input.store.writeTask(task("escalated", { tier: "escalation" }));
      const result = await preflight(f.input);
      expect(result.aliases.architect).toBe("max");
    } finally {
      f.repo.cleanup();
    }
  });

  it("refuses an escalateTo that names no alias", async () => {
    const f = await fixture(
      RUN_HEAD.replace(
        "pm: { harness: fake, model: pm }",
        "pm: { harness: fake, model: pm, escalateTo: ghost }",
      ),
    );
    try {
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          file: path.join(f.repo.dir, ".factory/run.yaml"),
          key: "aliases.pm.escalateTo",
          message: 'escalateTo "ghost" names no run-config alias',
        }),
      );
      expect(err.report).toContain("aliases.pm.escalateTo");
    } finally {
      f.repo.cleanup();
    }
  });

  it("refuses an escalateTo of the reserved tier name `default`", async () => {
    const f = await fixture(
      RUN_HEAD.replace(
        "pm: { harness: fake, model: pm }",
        "pm: { harness: fake, model: pm, escalateTo: default }\n  default: { harness: fake, model: dflt }",
      ),
    );
    try {
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          key: "aliases.pm.escalateTo",
          message:
            'escalateTo "default" is reserved for "no tier override"; it would re-run the PM\'s own alias',
        }),
      );
    } finally {
      f.repo.cleanup();
    }
  });

  it("refuses an escalateTo chain that forms a cycle", async () => {
    const f = await fixture(
      RUN_HEAD.replace(
        "pm: { harness: fake, model: pm }",
        "pm: { harness: fake, model: pm, escalateTo: esc }\n  esc: { harness: fake, model: esc, escalateTo: pm }",
      ),
    );
    try {
      const err = await refusal(f.input);
      const finding = err.findings.find(
        (item) => item.key === "aliases.pm.escalateTo",
      );
      expect(finding?.message).toContain("cycle");
      expect(finding?.message).toContain("pm -> esc -> pm");
    } finally {
      f.repo.cleanup();
    }
  });

  it("refuses session and worktree roots inside the repository", async () => {
    const f = await fixture(
      RUN_HEAD +
        "sessions: { dir: .factory/sessions, keepRuns: 2 }\nworktreeRoot: .factory/worktrees\n",
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
    const f = await fixture(
      undefined,
      "baseBranch: ghost\nartifactRoot: .factory/artifacts\n",
    );
    try {
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          key: "baseBranch",
          file: path.join(f.repo.dir, ".factory/repo.yaml"),
        }),
      );
    } finally {
      f.repo.cleanup();
    }
  });

  it("records and warns about a red base once, without aborting", async () => {
    const f = await fixture(
      undefined,
      "baseBranch: main\nartifactRoot: .factory/artifacts\ngates:\n  - { id: never, command: test -f never.txt }\n",
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
      const baselines = (await f.input.store.listRecords()).filter(
        (r) => r.step === "baseline",
      );
      expect(baselines).toHaveLength(1);
      expect(baselines[0]!.ok).toBe(false);
      expect(warnings.join("\n")).toContain("is red; recorded once");
      expect(warnings.join("\n")).toContain("never");
    } finally {
      console.warn = original;
      f.repo.cleanup();
    }
  });

  it("baselines the integration head tasks start from, not the base branch", async () => {
    const f = await fixture(
      undefined,
      "baseBranch: main\nartifactRoot: .factory/artifacts\ngates:\n  - { id: integration-red, command: test ! -f integration-red.txt }\n",
    );
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (msg: string) => warnings.push(msg);
    try {
      // Tasks branch from the integration head; main is green, that head is red.
      f.repo.git(["checkout", "-b", f.paths.integrationBranch]);
      f.repo.writeFile("integration-red.txt", "red\n");
      const integrationSha = f.repo.commit("integration red");
      f.repo.git(["checkout", "main"]);
      f.repo.writeFile("main-only.txt", "main\n");
      const mainSha = f.repo.commit("main moves on");
      expect(integrationSha).not.toBe(mainSha);

      const result = await preflight(f.input);
      expect(result.base?.commit).toBe(integrationSha);
      expect(result.base?.ok).toBe(false);
      const baselines = (await f.input.store.listRecords()).filter(
        (r) => r.step === "baseline",
      );
      expect(baselines).toHaveLength(1);
      expect(baselines[0]!.base).toBe(integrationSha);
      expect(warnings.join("\n")).toContain(f.paths.integrationBranch);
    } finally {
      console.warn = original;
      f.repo.cleanup();
    }
  });

  it("baselines the base tip when the integration branch only lags it", async () => {
    const f = await fixture(
      undefined,
      "baseBranch: main\nartifactRoot: .factory/artifacts\ngates:\n  - { id: stale, command: test ! -f broken.txt }\n",
    );
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (msg: string) => warnings.push(msg);
    try {
      // The integration head is an old red base commit; main has fixed it, so
      // recovery fast-forwards the integration branch onto the base tip.
      f.repo.writeFile("broken.txt", "red\n");
      const redSha = f.repo.commit("base is red here");
      f.repo.git(["branch", f.paths.integrationBranch, redSha]);
      fs.rmSync(path.join(f.repo.dir, "broken.txt"));
      const greenSha = f.repo.commit("base fixed");

      const result = await preflight(f.input);
      expect(result.base?.commit).toBe(greenSha);
      expect(result.base?.ok).toBe(true);
      const baselines = (await f.input.store.listRecords()).filter(
        (r) => r.step === "baseline",
      );
      expect(baselines).toHaveLength(1);
      expect(baselines[0]!.base).toBe(greenSha);
      expect(warnings).toEqual([]);
    } finally {
      console.warn = original;
      f.repo.cleanup();
    }
  });

  it("does not record a gate that could not run as base-red", async () => {
    const f = await fixture(
      undefined,
      "baseBranch: main\nartifactRoot: .factory/artifacts\ngates:\n  - { id: missing, command: no-such-factory-gate-command }\n",
    );
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (msg: string) => warnings.push(msg);
    try {
      // A red record from an older head must not be inherited into this one.
      const older = f.repo.git(["rev-parse", "HEAD"]).stdout;
      await f.input.store.appendRecord(
        {
          iteration: 0,
          step: "baseline",
          round: 1,
          actor: "script",
          base: older,
        },
        {
          ok: false,
          checks: [
            {
              name: "missing",
              ok: false,
              summary: "exit 1",
              output: "old red",
              fingerprint: "old",
            },
          ],
        },
      );
      f.repo.writeFile("newer.txt", "newer\n");
      f.repo.commit("head moves past the old baseline");

      const first = await preflight(f.input);
      expect(first.base?.infra).toBe(true);
      expect(
        recordedBaseGates(await f.input.store.listRecords()),
      ).toBeUndefined();

      // Nothing was cached as red: the next launch runs the gate again.
      const second = await preflight(f.input);
      expect(second.base?.infra).toBe(true);
      const records = await f.input.store.listRecords();
      expect(records.filter((r) => r.step === "baseline")).toHaveLength(1);
      expect(records.filter((r) => r.step === "baseline-infra")).toHaveLength(
        2,
      );
      expect(warnings.join("\n")).toContain("could not be checked");
      expect(warnings.join("\n")).toContain("not recorded as red");
    } finally {
      console.warn = original;
      f.repo.cleanup();
    }
  });

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
