import { describe, expect, it } from "bun:test";
import path from "node:path";
import { FakeHarness } from "../../src/harness/fake/index.js";
import type { Harness } from "../../src/harness/types.js";
import { loadConfigs, resolveGoalPaths } from "../../src/kernel/config.js";
import { resolveTurn } from "../../src/kernel/flow-context.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import { shippedRunConfigsDir } from "../helpers/run-configs.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";

const BOOTSTRAP_RUN = shippedRunConfigsDir();

function createSelfFreeRuntime(repo: TmpRepo): {
  runtime: KernelRuntime;
  harnesses: Map<string, Harness>;
} {
  const runPath = path.join(BOOTSTRAP_RUN, "self-free.yaml");
  repo.writeFile(
    ".factory/repo.yaml",
    "baseBranch: main\nartifactRoot: .factory/artifacts\nsetup: []\ngates: []\n",
  );
  repo.commit("factory config");
  const configs = loadConfigs(repo.dir, { runConfigPath: runPath });
  const paths = resolveGoalPaths(configs, repo.dir, "self-free");
  const harnesses = new Map<string, Harness>();
  for (const id of ["agy", "claude-code", "codex", "omp", "opencode", "pi"])
    harnesses.set(
      id,
      new FakeHarness({
        id,
        caps: { effort: ["low", "medium", "high", "max"] },
      }),
    );
  const runtime = {
    paths,
    configs,
    harnesses,
    prompts: {},
    exhaustedPools: new Map(),
  } as unknown as KernelRuntime;
  return { runtime, harnesses };
}

function expectSelfFreeTierChain(
  runtime: KernelRuntime,
  harnesses: Map<string, Harness>,
  alias: string,
  primaryModel: string,
  fallbackModel: string,
): void {
  const target = resolveTurn(runtime, alias, alias);
  expect(target.tiers).toHaveLength(3);
  expect(target.tiers[0]).toMatchObject({
    harness: harnesses.get("opencode"),
    model: { id: primaryModel, effort: "high" },
    effort: "high",
    subscription: "opencode-go",
  });
  expect(target.tiers[1]).toMatchObject({
    harness: harnesses.get("opencode"),
    model: { id: fallbackModel },
    effort: "high",
    subscription: "opencode-go",
  });
  expect(target.tiers[2]).toMatchObject({
    harness: harnesses.get("claude-code"),
    model: { id: "opus", effort: "high" },
    effort: "high",
    subscription: "claude",
  });
}

describe("self-free run config plan review fallbacks", () => {
  it("resolves the plan-reviewer and plan-checker chains with a claude-code opus fallback", () => {
    const repo = createTmpRepo();
    try {
      const { runtime, harnesses } = createSelfFreeRuntime(repo);
      expectSelfFreeTierChain(
        runtime,
        harnesses,
        "plan-reviewer",
        "opencode-go/deepseek-v4.1-flash",
        "opencode-go/muse-spark-1.3-contributor",
      );
      expectSelfFreeTierChain(
        runtime,
        harnesses,
        "plan-checker",
        "opencode-go/hy4-flash-free",
        "opencode-go/deepseek-v4.1-flash",
      );
    } finally {
      repo.cleanup();
    }
  });

  it("resolves the pack-preparer and digest chains with a claude-code opus fallback", () => {
    const repo = createTmpRepo();
    try {
      const { runtime, harnesses } = createSelfFreeRuntime(repo);
      expectSelfFreeTierChain(
        runtime,
        harnesses,
        "pack-preparer",
        "opencode-go/deepseek-v4.1-flash",
        "opencode-go/hy4-flash-free",
      );
      expectSelfFreeTierChain(
        runtime,
        harnesses,
        "digest",
        "opencode-go/hy4-flash-free",
        "opencode-go/deepseek-v4.1-flash",
      );
    } finally {
      repo.cleanup();
    }
  });
});
