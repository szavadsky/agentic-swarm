import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { resolveHarnessBinaries } from "../../src/cli/harnesses.js";
import { FakeHarness } from "../../src/harness/fake/index.js";
import type { Harness } from "../../src/harness/types.js";
import {
  loadConfigs,
  repositoryId,
  resolveGoalPaths,
} from "../../src/kernel/config.js";
import { PreflightError, preflight } from "../../src/kernel/preflight.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { createTmpRepo } from "../helpers/tmp-repo.js";
import {
  runValidate,
  validRunConfig,
  withTmp,
  writeFile,
} from "../helpers/validate.js";

/** A repo whose run and process layers break every non-model pre-flight class. */
const BROKEN_RUN = `worktreeRoot: .worktrees
sessions: { dir: .sessions, retention: short }
harnesses:
  agent-a:
    binary: /nonexistent/acpx
    acpx: { agent: agent-a, raw: true, compact: true }
    compaction: { enabled: true }
    options: { args: 7 }
aliases:
  implementer: { harness: agent-a, model: impl, subscription: ghost-pool, escalateTo: ghost, fallbacks: [{ model: near, subscription: other-ghost }, { alias: implementer }] }
  reviewer: { harness: fake, model: rev, rotate: [{ harness: phantom-rotate, model: rot }], fallbacks: [{ harness: phantom-tier, model: tier }] }
limits:
  concurrency: { overall: 2, perSubscription: { pool: 1 } }
scouts: { model: scout-model }
portability:
  - { from: ghost, to: agent-a }
  - { from: agent-a, to: phantom }
`;

const BROKEN_PROCESS = `taskTypes:
  broken: { flow: ghost-flow, kind: development, schema: ghost-schema, useWhen: fixture work }
flows:
  just-implement:
    steps:
      - id: build
        prompt: implementer
        alias: implementer
        followUp: { mode: different-model, alias: reviewer }
`;

function writeBrokenFixture(root: string): void {
  writeFile(
    root,
    ".factory/repo.yaml",
    "baseBranch: main\nartifactRoot: .factory/artifacts\nsetup: []\ngates: []\n",
  );
  writeFile(root, ".factory/run.yaml", BROKEN_RUN);
  writeFile(root, ".factory/process.yaml", BROKEN_PROCESS);
}

/** The actual pre-flight report on a fixture that is a git repo on `main`. */
async function preflightFindings(root: string): Promise<string[]> {
  const configs = loadConfigs(root);
  const paths = resolveGoalPaths(configs, root, "demo");
  fs.mkdirSync(paths.goalDir, { recursive: true });
  const store = createFolderStore(
    paths.goalDir,
    undefined,
    configs.process.taskTypes ?? {},
  );
  await store.ensureLayout();
  const harnesses = new Map<string, Harness>([
    ["omp", new FakeHarness({ id: "omp" })],
    ["agent-a", new FakeHarness({ id: "agent-a" })],
  ]);
  try {
    await preflight({
      configs,
      paths,
      store,
      harnesses,
      binaries: resolveHarnessBinaries(configs.run.harnesses),
      baseGates: false,
    });
  } catch (err) {
    if (!(err instanceof PreflightError)) throw err;
    return err.findings.map(
      (finding) => `${finding.file}: ${finding.key}: ${finding.message}`,
    );
  }
  throw new Error("pre-flight unexpectedly passed");
}

/** Every finding the broken fixture must report, in the command's format. */
function brokenConfigFindings(root: string): string[] {
  const run = path.join(root, ".factory/run.yaml");
  const process = path.join(root, ".factory/process.yaml");
  return [
    `${run}: aliases.architect: required by boundary step "architect" but missing`,
    `${run}: aliases.digest: required by boundary step "digest" but missing`,
    `${run}: aliases.pm: required by boundary step "front" but missing`,
    `${run}: aliases.intent: required by boundary step "intent" but missing`,
    `${run}: aliases.pack-preparer: required by boundary step "packprep" but missing`,
    `${run}: aliases.plan-checker: required by boundary step "plancheck" but missing`,
    `${run}: aliases.steward: required by boundary step "steward" but missing`,
    `${run}: aliases.plan-reviewer: required by architecture reviewer but missing`,
    `${run}: aliases.implementer-b: required by flow "implement-review" step "implement" alternates but missing`,
    `${run}: aliases.qa: required by flow "implement-review" step "qa" but missing`,
    `${run}: aliases.researcher: required by flow "spike" step "implement" but missing`,
    `${run}: aliases.reviewer.harness: harness "fake" is not registered (registered: omp, agent-a)`,
    `${run}: aliases.reviewer.rotate.0.harness: harness "phantom-rotate" is not registered (registered: omp, agent-a)`,
    `${run}: aliases.reviewer.fallbacks.0.harness: harness "phantom-tier" is not registered (registered: omp, agent-a)`,
    `${run}: aliases.implementer.escalateTo: escalateTo "ghost" names no run-config alias`,
    `${run}: aliases.implementer.fallbacks.1.alias: fallback alias chain forms a cycle: implementer -> implementer`,
    `${run}: aliases.implementer.subscription: subscription "ghost-pool" names no limits.concurrency.perSubscription pool`,
    `${run}: aliases.implementer.fallbacks.0.subscription: subscription "other-ghost" names no limits.concurrency.perSubscription pool`,
    `${run}: scouts: scouts configures a subagent model, but no harness consumes it: no alias or fallback runs on harness "omp"`,
    `${run}: portability.0.from: harness "ghost" is not registered (registered: omp, agent-a)`,
    `${run}: portability.1.to: harness "phantom" is not registered (registered: omp, agent-a)`,
    `${run}: harnesses.agent-a.options.args: Invalid "args" option: expected string array, got number`,
    `${run}: harnesses.agent-a.binary: binary "/nonexistent/acpx" is not executable or not on PATH`,
    `${run}: harnesses.agent-a.acpx.agent: binary "agent-a" is not executable or not on PATH`,
    `${run}: worktreeRoot: worktreeRoot "${path.join(root, ".worktrees", repositoryId(root))}" must be outside the repository (${root})`,
    `${run}: sessions.dir: sessions.dir "${path.join(root, ".sessions")}" must be outside the repository (${root})`,
    `${process}: taskTypes.broken.flow: flow "ghost-flow" is not configured`,
    `${process}: taskTypes.broken.schema: schema "ghost-schema" is not a kernel outcome schema (outcome, qa)`,
    `${process}: flows.just-implement.steps.build.followUp: step "build" of flow "just-implement" declares a follow-up, but a trivial task implements in the front's session and never follows up`,
  ];
}

describe("factory validate: non-model pre-flight checks", () => {
  it(
    "reports every non-model finding of a broken config",
    withTmp(async (root) => {
      writeBrokenFixture(root);
      const result = await runValidate(path.join(root, ".factory/repo.yaml"));
      expect(result.code).toBe(1);
      expect(result.out).toBe("");
      expect(result.err.split("\n").sort()).toEqual(
        brokenConfigFindings(root).sort(),
      );
    }),
  );

  it("matches the launch pre-flight on the same broken config", async () => {
    const repo = createTmpRepo();
    try {
      writeBrokenFixture(repo.dir);
      const result = await runValidate(
        path.join(repo.dir, ".factory/repo.yaml"),
      );
      expect(result.code).toBe(1);
      expect((await preflightFindings(repo.dir)).sort()).toEqual(
        result.err.split("\n").sort(),
      );
    } finally {
      repo.cleanup();
    }
  });

  it(
    "probes no model or effort, so an unknown one is not its finding",
    withTmp(async (root) => {
      writeFile(root, ".factory/repo.yaml", "baseBranch: main\n");
      writeFile(
        root,
        ".factory/run.yaml",
        validRunConfig().replace(
          "architect: { harness: omp, model: architect-model }",
          "architect: { harness: omp, model: no-such-model, effort: no-such-effort }",
        ),
      );
      const result = await runValidate(path.join(root, ".factory/repo.yaml"));
      expect(result.code).toBe(0);
      expect(result.err).toBe("");
      expect(result.out).toContain(": valid");
    }),
  );
});

describe("factory validate: sandbox pre-flight", () => {
  it(
    "reports a configured sandbox whose binary is missing",
    withTmp(async (root) => {
      writeFile(root, ".factory/repo.yaml", "baseBranch: main\n");
      const runFile = writeFile(
        root,
        ".factory/run.yaml",
        `${validRunConfig()}sandbox: { binary: /nonexistent/factory-sandbox }\n`,
      );
      const result = await runValidate(path.join(root, ".factory/repo.yaml"));
      expect(result.code).toBe(1);
      expect(result.out).toBe("");
      expect(result.err.split("\n")).toEqual([
        `${runFile}: sandbox.binary: sandbox binary "/nonexistent/factory-sandbox" is not executable or not on PATH`,
      ]);
    }),
  );
});
