import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import type { CheckResult } from "../../src/core/checks/types.js";
import { FakeHarness } from "../../src/harness/fake/index.js";
import {
  checkBase,
  preexistingRed,
  recordedBaseGates,
} from "../../src/kernel/baseline.js";
import {
  capGateOutput,
  GATE_OUTPUT_CAP,
  gateSignatures,
  isStaleGateCheck,
  newGateFailures,
  runGates,
} from "../../src/kernel/gates.js";
import { preflight } from "../../src/kernel/preflight.js";
import { prepareIntegrationCheckout } from "../../src/kernel/worktree.js";
import { cleanupFlowRepo, makeRuntime, setupFlowRepo } from "./s2-helpers.js";

// One coarse gate, like the self repo's former single `package` gate: it names
// every reason it is red for, so two reds under it are distinguishable.
const GATE =
  "red=0; " +
  'if [ -e base-broken.txt ]; then echo "reason X: base-broken.txt"; red=1; fi; ' +
  'if [ -e task-broken.txt ]; then echo "reason Y: task-broken.txt"; red=1; fi; ' +
  "exit $red";

function commitIn(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  cwd: string,
  message: string,
): string {
  repo.git(["add", "-A"], { cwd });
  repo.git(["commit", "-m", message], { cwd });
  return repo.git(["rev-parse", "HEAD"], { cwd }).stdout.trim();
}

async function quietWarnings(run: () => Promise<void>): Promise<string[]> {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (msg: string) => warnings.push(msg);
  try {
    await run();
  } finally {
    console.warn = original;
  }
  return warnings;
}

/** A new failure hides behind the same red gate and is still the task's. */
async function expectNewTaskRed(
  runtime: Awaited<ReturnType<typeof makeRuntime>>,
  checkout: string,
  inherited: ReadonlySet<string>,
): Promise<void> {
  fs.writeFileSync(path.join(checkout, "task-broken.txt"), "Y\n", "utf8");
  const withTaskRed = await runGates(runtime, checkout);
  expect(newGateFailures(withTaskRed, inherited).map((c) => c.name)).toEqual([
    "package",
  ]);
}

function registerBaseFollowRed(): void {
  it("inherits the red of the merged head the follow leaves, not the pre-follow head", async () => {
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "package", command: GATE }],
    });
    try {
      const runtime = await makeRuntime(repo, goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      const checkout = runtime.paths.goalCheckout;

      // A task merge moves integration ahead of base, so the follow will merge.
      fs.writeFileSync(path.join(checkout, "feature.txt"), "feature\n", "utf8");
      const integrationHead = commitIn(
        repo,
        checkout,
        "factory: merge feature",
      );

      // Base advances with a commit that is red for reason X.
      repo.writeFile("base-broken.txt", "X\n");
      repo.commit("base broken for reason X");

      const warnings = await quietWarnings(async () => {
        const pre = await preflight({
          configs: runtime.configs,
          paths: runtime.paths,
          store: runtime.store,
          harnesses: runtime.harnesses,
        });
        expect(pre.base?.commit).toBe(integrationHead);
        expect(pre.base?.ok).toBe(false);
        expect(pre.base?.checks.map((c) => c.output).join("\n")).toContain(
          "reason X",
        );
      });
      expect(warnings.join("\n")).toContain("merged");

      // Recovery follows base into the integration branch; tasks branch there.
      await prepareIntegrationCheckout(runtime);
      const followed = repo
        .git(["rev-parse", "HEAD"], { cwd: checkout })
        .stdout.trim();
      expect(followed).not.toBe(integrationHead);

      const checks = await runGates(runtime, checkout);
      expect(checks.every((c) => !c.ok)).toBe(true);
      const inherited = preexistingRed(
        recordedBaseGates(await runtime.store.listRecords()),
      );
      expect(newGateFailures(checks, inherited)).toEqual([]);

      await expectNewTaskRed(runtime, checkout, inherited);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerMergePreviewRecheck(): void {
  it("re-gates the merge preview when base moves under a fixed integration head", async () => {
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "package", command: GATE }],
    });
    try {
      const runtime = await makeRuntime(repo, goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      const checkout = runtime.paths.goalCheckout;

      fs.writeFileSync(path.join(checkout, "feature.txt"), "feature\n", "utf8");
      commitIn(repo, checkout, "factory: merge feature");

      repo.writeFile("base-broken.txt", "X\n");
      repo.commit("base broken for reason X");

      await quietWarnings(async () => {
        const red = await preflight({
          configs: runtime.configs,
          paths: runtime.paths,
          store: runtime.store,
          harnesses: runtime.harnesses,
        });
        expect(red.base?.ok).toBe(false);

        // Base fixes its own red: a baseline keyed by the integration commit
        // alone would keep suppressing reason X for a task that never saw it.
        fs.rmSync(path.join(repo.dir, "base-broken.txt"));
        repo.commit("base fixed");

        const green = await preflight({
          configs: runtime.configs,
          paths: runtime.paths,
          store: runtime.store,
          harnesses: runtime.harnesses,
        });
        expect(green.base?.fresh).toBe(true);
        expect(green.base?.ok).toBe(true);
      });
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerConflictInfra(): void {
  it("treats a base follow that would conflict as infra, never base-red", async () => {
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "package", command: GATE }],
    });
    try {
      const runtime = await makeRuntime(repo, goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      const checkout = runtime.paths.goalCheckout;

      fs.writeFileSync(
        path.join(checkout, "shared.txt"),
        "integration\n",
        "utf8",
      );
      commitIn(repo, checkout, "factory: merge feature");
      repo.writeFile("shared.txt", "base\n");
      repo.commit("base touches the same file");

      const warnings = await quietWarnings(async () => {
        const pre = await preflight({
          configs: runtime.configs,
          paths: runtime.paths,
          store: runtime.store,
          harnesses: runtime.harnesses,
        });
        expect(pre.base?.infra).toBe(true);
        expect(pre.base?.ok).toBe(false);
      });
      expect(warnings.join("\n")).toContain("would not merge");
      expect(
        recordedBaseGates(await runtime.store.listRecords()),
      ).toBeUndefined();
      expect(
        (await runtime.store.listRecords()).filter(
          (r) => r.step === "baseline",
        ),
      ).toHaveLength(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("baseline on the head after the base follow", () => {
  registerBaseFollowRed();
  registerMergePreviewRecheck();
  registerConflictInfra();
});

function registerInheritedRedCap(): void {
  it("matches two red runs differing only in root length past the cap", () => {
    // The baseline scratch root is ~30 chars longer than a task worktree root;
    // capping the raw text would push the cut later for the baseline and drop
    // head names the task keeps. Roots are normalised before cutting, so the
    // same failures share one window.
    const baselineRoot = "/tmp/wk/repo/.factory-runtime/preflight-probe-abcdef";
    const taskRoot = "/tmp/wk/repo/demo";
    const COUNT = 150;
    const rawFor = (root: string): string => {
      const lines: string[] = [];
      for (let i = 0; i < COUNT; i++) {
        lines.push(`cannot read ${root}/src/dir/file${i}.txt`);
        lines.push(`(fail) suite > case ${i} [0.10ms]`);
      }
      return lines.join("\n");
    };
    const rawBaseline = rawFor(baselineRoot);
    const rawTask = rawFor(taskRoot);
    expect(rawBaseline.length).toBeGreaterThan(GATE_OUTPUT_CAP);
    expect(rawTask.length).toBeGreaterThan(GATE_OUTPUT_CAP);
    const cappedBaseline = capGateOutput(rawBaseline, [baselineRoot]);
    const cappedTask = capGateOutput(rawTask, [taskRoot]);
    expect(cappedBaseline.truncated).toBe(true);
    expect(cappedTask.truncated).toBe(true);
    const baseCheck: CheckResult = {
      name: "tests",
      ok: false,
      summary: "exit 1",
      output: cappedBaseline.output,
      fingerprint: "base",
      details: { roots: [baselineRoot], truncated: cappedBaseline.truncated },
    };
    const taskCheck: CheckResult = {
      name: "tests",
      ok: false,
      summary: "exit 1",
      output: cappedTask.output,
      fingerprint: "task",
      details: { roots: [taskRoot], truncated: cappedTask.truncated },
    };
    const baseSignatures = [...gateSignatures(baseCheck)];
    expect(baseSignatures.length).toBeGreaterThan(0);
    expect([...gateSignatures(taskCheck)]).toEqual(baseSignatures);
    const inherited = preexistingRed({
      commit: "base",
      ok: false,
      checks: [baseCheck],
    });
    expect(newGateFailures([taskCheck], inherited)).toEqual([]);
  });
}

function registerInheritedRedNoDetails(): void {
  it("never inherits red from a baseline record without details", () => {
    const stale: CheckResult = {
      name: "package",
      ok: false,
      summary: "exit 1",
      output: "cannot read /old/root/src/a/notes.txt",
      fingerprint: "stale",
    };
    expect(isStaleGateCheck(stale)).toBe(true);
    // A collapsed basename identity would suppress any task failure sharing
    // the basename; a stale check contributes nothing instead.
    expect(
      preexistingRed({ commit: "c", ok: false, checks: [stale] }).size,
    ).toBe(0);
    const task: CheckResult = {
      name: "package",
      ok: false,
      summary: "exit 1",
      output: "cannot read /tmp/factory-gates.abc123/notes.txt",
      fingerprint: "task",
      details: { roots: ["/task/root"], truncated: false },
    };
    expect([...gateSignatures(task)]).toEqual([
      "line: cannot read <root>/notes.txt",
    ]);
    expect(
      newGateFailures(
        [task],
        preexistingRed({ commit: "c", ok: false, checks: [stale] }),
      ).map((c) => c.name),
    ).toEqual(["package"]);
  });
}

function registerInheritedRedStale(): void {
  it("re-runs a stale baseline record instead of reusing it", async () => {
    const { repo, goal } = setupFlowRepo({
      gates: [
        {
          id: "package",
          command: 'echo "cannot read $(pwd)/src/x.txt"; exit 1',
        },
      ],
    });
    try {
      const runtime = await makeRuntime(repo, goal, {});
      const commit = repo.git(["rev-parse", "HEAD"]).stdout.trim();
      await runtime.store.appendRecord(
        {
          iteration: 0,
          step: "baseline",
          round: 1,
          actor: "script",
          base: commit,
        },
        {
          ok: false,
          checks: [
            {
              name: "package",
              ok: false,
              summary: "exit 1",
              output: "cannot read /old/root/src/x.txt",
              fingerprint: "old",
            },
          ],
        },
      );
      const original = console.warn;
      console.warn = () => {};
      let result: Awaited<ReturnType<typeof checkBase>>;
      try {
        result = await checkBase(
          runtime.configs,
          runtime.store,
          repo.dir,
          "main",
          commit,
        );
      } finally {
        console.warn = original;
      }
      expect(result.fresh).toBe(true);
      expect(result.ok).toBe(false);
      const recorded = recordedBaseGates(await runtime.store.listRecords())!;
      expect(isStaleGateCheck(recorded.checks[0]!)).toBe(false);
      expect([...gateSignatures(recorded.checks[0]!)]).toEqual([
        "line: cannot read <root>/src/x.txt",
      ]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("inherited-red baseline debt", () => {
  registerInheritedRedCap();
  registerInheritedRedNoDetails();
  registerInheritedRedStale();
});
