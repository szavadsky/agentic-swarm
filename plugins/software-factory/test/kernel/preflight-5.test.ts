import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness } from "../../src/harness/fake/index.js";
import type { Harness } from "../../src/harness/types.js";
import { recordedBaseGates } from "../../src/kernel/baseline.js";
import { loadConfigs, resolveGoalPaths } from "../../src/kernel/config.js";
import {
  fallbackAliasFindings,
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
    probe: { effort: ["low", "high", "max"] },
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

function registerPreFlightPart36(): void {
  it("refuses a fallback that names no alias", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace(
        "implementer: { harness: fake, model: impl }",
        "implementer: { harness: fake, model: impl, fallbacks: [{ alias: ghost }] }",
      ),
    );
    try {
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          file: path.join(f.repo.dir, ".factory/run.yaml"),
          key: "aliases.implementer.fallbacks.0.alias",
          message: 'fallback alias "ghost" names no run-config alias',
        }),
      );
    } finally {
      f.repo.cleanup();
    }
  });

  it("refuses a fallback that names its own alias", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace(
        "implementer: { harness: fake, model: impl }",
        "implementer: { harness: fake, model: impl, fallbacks: [{ alias: implementer }] }",
      ),
    );
    try {
      const err = await refusal(f.input);
      const finding = err.findings.find(
        (item) => item.key === "aliases.implementer.fallbacks.0.alias",
      );
      expect(finding?.message).toContain("cycle");
      expect(finding?.message).toContain("implementer -> implementer");
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart37(): void {
  it("refuses a mutual fallback alias cycle", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace(
        "implementer: { harness: fake, model: impl }",
        "implementer: { harness: fake, model: impl, fallbacks: [{ alias: reviewer }] }",
      ).replace(
        "reviewer: { harness: fake, model: rev }",
        "reviewer: { harness: fake, model: rev, fallbacks: [{ alias: implementer }] }",
      ),
    );
    try {
      const err = await refusal(f.input);
      const findings = err.findings.filter((item) =>
        item.key.endsWith(".fallbacks.0.alias"),
      );
      expect(findings.map((item) => item.key).sort()).toEqual([
        "aliases.implementer.fallbacks.0.alias",
        "aliases.reviewer.fallbacks.0.alias",
      ]);
      expect(findings.map((item) => item.message)).toContain(
        "fallback alias chain forms a cycle: implementer -> reviewer -> implementer",
      );
      expect(err.report).toContain("cycle");
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart38(): void {
  it("reports a shared missing fallback target once per edge", () => {
    const findings = fallbackAliasFindings(
      {
        implementer: {
          harness: "fake",
          model: "impl",
          fallbacks: [{ alias: "reviewer" }],
        },
        reviewer: {
          harness: "fake",
          model: "rev",
          fallbacks: [{ alias: "ghost" }],
        },
        qa: {
          harness: "fake",
          model: "qa",
          fallbacks: [{ alias: "ghost" }],
        },
      },
      "run.yaml",
    );
    expect(findings).toEqual([
      {
        file: "run.yaml",
        key: "aliases.reviewer.fallbacks.0.alias",
        message: 'fallback alias "ghost" names no run-config alias',
      },
      {
        file: "run.yaml",
        key: "aliases.qa.fallbacks.0.alias",
        message: 'fallback alias "ghost" names no run-config alias',
      },
    ]);
  });
}

function registerPreFlightPart39(): void {
  it("accepts a fallback that reuses another alias's ladder", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace(
        "implementer: { harness: fake, model: impl }",
        "implementer: { harness: fake, model: impl, fallbacks: [{ alias: reviewer }] }",
      ).replace(
        "reviewer: { harness: fake, model: rev }",
        "reviewer: { harness: fake, model: rev, effort: max }",
      ),
    );
    try {
      await preflight(f.input);
      expect(f.configs.run.aliases.reviewer!.effort).toBe("max");
    } finally {
      f.repo.cleanup();
    }
  });

  it("refuses session and worktree roots inside the repository", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST +
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
}

function registerPreFlightPart40(): void {
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
}

function registerPreFlightPart41(): void {
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
}

function registerPreFlightPart42(): void {
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
}

function registerPreFlightPart43(): void {
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
}

function registerPreFlightPart44(): void {
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
}

describe("pre-flight", () => {
  registerPreFlightPart36();

  registerPreFlightPart37();

  registerPreFlightPart38();

  registerPreFlightPart39();

  registerPreFlightPart40();

  registerPreFlightPart41();

  registerPreFlightPart42();

  registerPreFlightPart43();

  registerPreFlightPart44();
});
