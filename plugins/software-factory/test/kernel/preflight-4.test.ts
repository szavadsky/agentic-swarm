import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveHarnessBinaries } from "../../src/cli/harnesses.js";
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
import { task } from "./helpers.js";

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
  "architect: { harness: agent-x, model: arch }",
).replace(
  "implementer: { harness: fake, model: impl }",
  "implementer: { harness: omp, model: impl }",
);

function splitHarnesses(f: Fixture): Map<string, Harness> {
  const harnesses = new Map(f.input.harnesses);
  harnesses.set("agent-x", new FakeHarness({ id: "agent-x" }));
  harnesses.set(
    "omp",
    new FakeHarness({
      id: "omp",
      probe: { effort: ["low", "medium", "high", "max"] },
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

function registerPreFlightPart28(): void {
  it("refuses a subscription that names no capped pool", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace(
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

  it("refuses an absent harness binary and names its config key", async () => {
    const f = await fixture();
    try {
      const err = await refusal({ ...f.input, binaries: { fake: undefined } });
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          key: "harnesses.fake.binary",
          message: 'binary "fake" is not executable or not on PATH',
        }),
      );
      expect(err.report).toContain("harnesses.fake.binary");
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart29(): void {
  it("refuses a configured omp binary that is missing, naming the path", async () => {
    const configured = path.join(os.tmpdir(), `missing-omp-${process.pid}`);
    expect(fs.existsSync(configured)).toBe(false);
    const f = await fixture(
      SPLIT_HARNESSES.replace(
        "limits:",
        `harnesses:\n  omp:\n    binary: ${configured}\n    compaction: { enabled: true }\nlimits:`,
      ),
    );
    try {
      const err = await refusal({
        ...f.input,
        harnesses: splitHarnesses(f),
        binaries: {
          ...resolveHarnessBinaries(f.configs.run.harnesses),
          "agent-x": process.execPath,
        },
      });
      const finding = err.findings.find(
        (x) => x.key === "harnesses.omp.binary",
      );
      expect(finding?.message).toContain(configured);
      expect(err.report).toContain("harnesses.omp.binary");
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart30(): void {
  it("names acpx and the bunx route when an acpx alias has no binary", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace(
        "implementer: { harness: fake, model: impl }",
        "implementer: { harness: agent-a, model: impl }",
      ),
    );
    try {
      const harnesses = new Map(f.input.harnesses);
      harnesses.set("agent-a", new FakeHarness({ id: "agent-a" }));
      // resolveAcpxCommand falls back to a bunx executable when acpx is absent;
      // a missing bunx is the host state where that on-demand route cannot run.
      const err = await refusal({
        ...f.input,
        harnesses,
        binaries: {
          fake: process.execPath,
          "agent-a": "/nonexistent/bin/bunx",
        },
      });
      const finding = err.findings.find(
        (x) => x.key === "harnesses.agent-a.binary",
      );
      expect(finding?.message).toContain("acpx");
      expect(finding?.message).toContain("bunx acpx");
      expect(err.report).toContain("bunx acpx");
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart31(): void {
  it("checks a raw agent's configured acpx dispatcher and its agent head", async () => {
    const configured = path.join(os.tmpdir(), `missing-acpx-${process.pid}`);
    expect(fs.existsSync(configured)).toBe(false);
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace(
        "implementer: { harness: fake, model: impl }",
        "implementer: { harness: agent-c, model: impl }",
      ).replace(
        "limits:",
        `harnesses:\n  agent-c:\n    binary: ${configured}\n    acpx: { agent: "agent-c acp", raw: true }\n    compaction: { enabled: false, reason: test harness has no compact command }\nlimits:`,
      ),
    );
    try {
      const harnesses = new Map(f.input.harnesses);
      harnesses.set("agent-c", new FakeHarness({ id: "agent-c" }));
      const err = await refusal({
        ...f.input,
        harnesses,
        binaries: { fake: process.execPath, "agent-c": process.execPath },
      });
      const finding = err.findings.find(
        (x) => x.key === "harnesses.agent-c.binary",
      );
      expect(finding?.message).toContain(configured);
      expect(err.findings.some((x) => x.key.endsWith(".acpx.agent"))).toBe(
        false,
      );
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart32(): void {
  it("names a raw agent's missing executable and its agent key", async () => {
    const missing = path.join(os.tmpdir(), `missing-agent-${process.pid}`);
    expect(fs.existsSync(missing)).toBe(false);
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace(
        "implementer: { harness: fake, model: impl }",
        "implementer: { harness: agent-c, model: impl }",
      ).replace(
        "limits:",
        `harnesses:\n  agent-c:\n    binary: ${process.execPath}\n    acpx: { agent: "agent-c acp", raw: true }\n    compaction: { enabled: false, reason: test harness has no compact command }\nlimits:`,
      ),
    );
    try {
      const harnesses = new Map(f.input.harnesses);
      harnesses.set("agent-c", new FakeHarness({ id: "agent-c" }));
      const err = await refusal({
        ...f.input,
        harnesses,
        binaries: { fake: process.execPath, "agent-c": missing },
      });
      const finding = err.findings.find(
        (x) => x.key === "harnesses.agent-c.acpx.agent",
      );
      expect(finding?.message).toContain(missing);
      expect(
        err.findings.some((x) => x.key === "harnesses.agent-c.binary"),
      ).toBe(false);
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart33(): void {
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
      RUN_HEAD_NO_HIGHEST.replace(
        "limits:",
        "  escalation: { harness: fake, model: esc }\nlimits:",
      ),
    );
    try {
      await f.input.store.writeTask(task("escalated", { tier: "escalation" }));
      await preflight(f.input);
      expect(f.configs.run.aliases.architect!.effort).toBe("max");
    } finally {
      f.repo.cleanup();
    }
  });
}

function registerPreFlightPart34(): void {
  it("refuses an escalateTo that names no alias", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace(
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
}

function registerPreFlightPart35(): void {
  it("refuses an escalateTo of the reserved tier name `default`", async () => {
    const f = await fixture(
      RUN_HEAD_NO_HIGHEST.replace(
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
      RUN_HEAD_NO_HIGHEST.replace(
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
}

describe("pre-flight", () => {
  registerPreFlightPart28();

  registerPreFlightPart29();

  registerPreFlightPart30();

  registerPreFlightPart31();

  registerPreFlightPart32();

  registerPreFlightPart33();

  registerPreFlightPart34();

  registerPreFlightPart35();
});
