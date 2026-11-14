import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness } from "../../src/harness/fake/index.js";
import { preexistingRed, recordedBaseGates } from "../../src/kernel/baseline.js";
import { newGateFailures, runGates } from "../../src/kernel/gates.js";
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

function commitIn(repo: ReturnType<typeof setupFlowRepo>["repo"], cwd: string, message: string): string {
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

describe("baseline on the head after the base follow", () => {
  it("inherits the red of the merged head the follow leaves, not the pre-follow head", async () => {
    const { repo, goal } = setupFlowRepo({ gates: [{ id: "package", command: GATE }] });
    try {
      const runtime = await makeRuntime(repo, goal, { fake: new FakeHarness({ id: "fake" }) });
      const checkout = runtime.paths.goalCheckout;

      // A task merge moves integration ahead of base, so the follow will merge.
      fs.writeFileSync(path.join(checkout, "feature.txt"), "feature\n", "utf8");
      const integrationHead = commitIn(repo, checkout, "factory: merge feature");

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
        expect(pre.base?.checks.map((c) => c.output).join("\n")).toContain("reason X");
      });
      expect(warnings.join("\n")).toContain("merged");

      // Recovery follows base into the integration branch; tasks branch there.
      await prepareIntegrationCheckout(runtime);
      const followed = repo.git(["rev-parse", "HEAD"], { cwd: checkout }).stdout.trim();
      expect(followed).not.toBe(integrationHead);

      const checks = await runGates(runtime, checkout);
      expect(checks.every((c) => !c.ok)).toBe(true);
      const inherited = preexistingRed(recordedBaseGates(await runtime.store.listRecords()));
      expect(newGateFailures(checks, inherited)).toEqual([]);

      // A new failure hides behind the same red gate and is still the task's.
      fs.writeFileSync(path.join(checkout, "task-broken.txt"), "Y\n", "utf8");
      const withTaskRed = await runGates(runtime, checkout);
      expect(newGateFailures(withTaskRed, inherited).map((c) => c.name)).toEqual(["package"]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("re-gates the merge preview when base moves under a fixed integration head", async () => {
    const { repo, goal } = setupFlowRepo({ gates: [{ id: "package", command: GATE }] });
    try {
      const runtime = await makeRuntime(repo, goal, { fake: new FakeHarness({ id: "fake" }) });
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

  it("treats a base follow that would conflict as infra, never base-red", async () => {
    const { repo, goal } = setupFlowRepo({ gates: [{ id: "package", command: GATE }] });
    try {
      const runtime = await makeRuntime(repo, goal, { fake: new FakeHarness({ id: "fake" }) });
      const checkout = runtime.paths.goalCheckout;

      fs.writeFileSync(path.join(checkout, "shared.txt"), "integration\n", "utf8");
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
      expect(recordedBaseGates(await runtime.store.listRecords())).toBeUndefined();
      expect((await runtime.store.listRecords()).filter((r) => r.step === "baseline")).toHaveLength(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
