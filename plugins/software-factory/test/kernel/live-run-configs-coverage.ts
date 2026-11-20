import { expect, it } from "bun:test";
import path from "node:path";
import { loadRunConfig } from "../../src/kernel/config.js";
import { matchPrice, type PriceTable } from "../../src/kernel/pricing.js";
import { shippedRunConfigsDir } from "../helpers/run-configs.js";

const BOOTSTRAP_RUN = shippedRunConfigsDir();

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

function collectModelIds(run: ReturnType<typeof loadRunConfig>): Set<string> {
  const ids = new Set<string>();
  for (const alias of Object.values(run.aliases)) {
    ids.add(alias.model);
    for (const entry of alias.rotate!) ids.add(entry.model);
    for (const fallback of alias.fallbacks!) {
      if ("model" in fallback) ids.add(fallback.model);
    }
  }
  if (run.scouts) ids.add(run.scouts.model);
  return ids;
}

/** No dangling mappings: every priceIds target is a catalog id. */
function expectNoDanglingPriceIds(
  run: ReturnType<typeof loadRunConfig>,
  name: string,
): void {
  for (const [from, to] of Object.entries(run.priceIds!)) {
    expect(
      OPENROUTER_IDS[to],
      `${name}.yaml: priceIds ${from} -> ${to} names no catalog id`,
    ).toBeDefined();
  }
}

/**
 * The extends split must not change what a shipped run config resolves to:
 * each file keeps the layer it had before base plus overlay composition.
 * The fixtures were frozen from the pre-split files.
 */

export function registerShippedRouteTests(name: string): void {
  it(`routes opencode through the acpx raw route: ${name}.yaml`, () => {
    const runPath = path.join(BOOTSTRAP_RUN, `${name}.yaml`);
    const run = loadRunConfig(runPath);
    // The built-in acpx opencode route runs 1.19.5; the raw `opencode acp`
    // route runs the installed CLI (acpx-probe §0).
    expect(run.harnesses!.opencode?.acpx).toMatchObject({
      agent: "opencode acp",
      raw: true,
      effort: { configId: "effort" },
    });
  });

  it(`carries the required plan role aliases: ${name}.yaml`, () => {
    const runPath = path.join(BOOTSTRAP_RUN, `${name}.yaml`);
    const run = loadRunConfig(runPath);
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

  it(`carries the spike flow's researcher alias: ${name}.yaml`, () => {
    const runPath = path.join(BOOTSTRAP_RUN, `${name}.yaml`);
    const run = loadRunConfig(runPath);
    // The spike flow's implement step alternates researcher with the task
    // implementer and reviewer aliases; pre-flight refuses the launch when
    // any of the three is missing.
    expect(run.aliases.researcher).toBeDefined();
    expect(run.aliases.implementer).toBeDefined();
    expect(run.aliases.reviewer).toBeDefined();
  });
}

export function registerShippedPolicyTests(name: string): void {
  it(`carries the development implementer's retry alternate: ${name}.yaml`, () => {
    const runPath = path.join(BOOTSTRAP_RUN, `${name}.yaml`);
    const run = loadRunConfig(runPath);
    // Both development flows name implementer-b; a retry must run a model
    // other than the implementer primary that failed.
    const alternate = run.aliases["implementer-b"];
    expect(alternate).toBeDefined();
    expect(alternate!.model).not.toBe(run.aliases.implementer!.model);
  });

  it(`carries the unattended omp policy when an alias uses omp: ${name}.yaml`, () => {
    const runPath = path.join(BOOTSTRAP_RUN, `${name}.yaml`);
    const run = loadRunConfig(runPath);
    const usesOmp = Object.values(run.aliases).some(
      (alias) => alias.harness === "omp",
    );
    if (!usesOmp) return;
    // The compiled-in overlay is gone: the entry must carry the unattended
    // policy, or an omp turn reverts to prompting and learning on its own.
    expect(run.harnesses!.omp?.options).toMatchObject({
      memory: { backend: "off" },
      autolearn: { enabled: false },
      skills: { enabled: false },
      tools: { approvalMode: "yolo" },
      retry: { enabled: false, modelFallback: false },
    });
  });

  it(`resolves every model id: ${name}.yaml`, () => {
    const runPath = path.join(BOOTSTRAP_RUN, `${name}.yaml`);
    const run = loadRunConfig(runPath);
    expect(run.priceIds).toBeDefined();
    const ids = collectModelIds(run);
    expect(ids.size).toBeGreaterThan(0);
    for (const id of [...ids].sort()) {
      expect(
        matchPrice(OPENROUTER_IDS, id, run.priceIds!),
        `${name}.yaml: ${id} matches no OpenRouter id`,
      ).toBeDefined();
    }
    expectNoDanglingPriceIds(run, name);
  });
}

/** The shipped config passes pre-flight with every harness faked. */
