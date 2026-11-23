import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRealHarnesses } from "../../src/cli/harnesses.js";
import { AcpxHarness } from "../../src/harness/acpx/harness.js";
import { FakeHarness } from "../../src/harness/fake/index.js";
import type { Harness } from "../../src/harness/types.js";
import {
  loadConfigs,
  loadProcessConfig,
  loadRunConfig,
  resolveGoalPaths,
} from "../../src/kernel/config.js";
import { resolveTurn } from "../../src/kernel/flow-context.js";
import { matchPrice, type PriceTable } from "../../src/kernel/pricing.js";
import { requiredAliases } from "../../src/kernel/preflight/checks.js";
import {
  PreflightError,
  type PreflightInput,
  preflight,
} from "../../src/kernel/preflight.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { createAcpxStub, type AcpxStub } from "../harness/acpx-stub.js";

const FIXTURE_DIR = path.resolve(import.meta.dir, "../fixtures/run-configs");
const PACKAGE_ROOT = path.resolve(import.meta.dir, "../..");
const REPO_YAML =
  "baseBranch: main\nartifactRoot: .factory/artifacts\nsetup: []\ngates: []\n";

/** The roles the package process config names, so a fixture must carry them. */
const REQUIRED_ROLES = [
  ...requiredAliases(loadProcessConfig(PACKAGE_ROOT)).keys(),
].sort();

/** Live values the acpx stub reports: the factory must accept them as given. */
const STUB_MODELS = [
  { id: "fake-route/primary", effort: ["low", "xhigh"] },
  { id: "fake-route/secondary", effort: ["low", "medium"] },
];
const NATIVE_EFFORTS = ["low", "medium", "high", "max", "xhigh"];

const PRICE = { input: 1, cachedInput: 0.1, output: 2, reasoning: 2 };
/** Fake catalog: every fixture model id resolves by itself or via priceIds. */
const FAKE_PRICES: PriceTable = {
  "fake/arch": PRICE,
  "fake/arch-alt": PRICE,
  "fake/cheap": PRICE,
  "fake/check": PRICE,
  "fake/impl": PRICE,
  "fake/impl-alt": PRICE,
  "fake/impl-rot": PRICE,
  "fake/model-a": PRICE,
  "fake/model-b": PRICE,
  "fake/review": PRICE,
  "fake/review-alt": PRICE,
};

interface Fixture {
  repo: TmpRepo;
  configs: ReturnType<typeof loadConfigs>;
  runtime: KernelRuntime;
  harnesses: Map<string, Harness>;
  input: PreflightInput;
  stub: AcpxStub;
}

function fixtureFiles(): string[] {
  return fs
    .readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith(".yaml"))
    .sort();
}

/** Points each acpx entry at the stub and builds the fixture's harness registry. */
function fakeHarnesses(
  configs: Fixture["configs"],
  stub: AcpxStub,
  sessionDir: string,
): Map<string, Harness> {
  for (const entry of Object.values(configs.run.harnesses ?? {})) {
    if (entry.acpx) entry.binary = stub.binary;
  }
  const harnesses = new Map<string, Harness>(
    Object.entries(
      createRealHarnesses({
        retention: configs.run.sessions.retention,
        sessionDir,
        harnesses: configs.run.harnesses,
      }),
    ),
  );
  harnesses.set(
    "fake-native",
    new FakeHarness({ id: "fake-native", probe: { effort: NATIVE_EFFORTS } }),
  );
  return harnesses;
}

/**
 * Loads one fixture over a temp repo and wires the fake profile: a native fake
 * for `fake-native`, and the real acpx harness factory for the config-only
 * `fake-acpx` binding, pointed at the stub. No harness id is hardcoded in the
 * factory, so the fixture's ids are the only registry.
 */
async function fixtureRuntime(
  runName: string,
  runDir = FIXTURE_DIR,
): Promise<Fixture> {
  const repo = createTmpRepo();
  repo.writeFile(".factory/repo.yaml", REPO_YAML);
  repo.commit("factory config");
  const configs = loadConfigs(repo.dir, {
    runConfigPath: path.join(runDir, runName),
  });
  const base = path.basename(repo.dir);
  configs.run.sessions.dir = path.join(
    path.dirname(repo.dir),
    `${base}-sessions`,
  );
  configs.run.worktreeRoot = path.join(path.dirname(repo.dir), `${base}-wt`);
  const paths = resolveGoalPaths(configs, repo.dir, "fixture");
  fs.mkdirSync(paths.goalDir, { recursive: true });
  fs.writeFileSync(path.join(paths.goalDir, "intent.md"), "# Goal\n", "utf8");
  const store = createFolderStore(paths.goalDir, undefined, {});
  await store.ensureLayout();
  const stub = createAcpxStub({
    models: STUB_MODELS,
    effortConfigId: "fake_effort",
  });
  const harnesses = fakeHarnesses(configs, stub, paths.sessionsDir);
  const runtime = {
    paths,
    configs,
    harnesses,
    prompts: {},
    exhaustedPools: new Map(),
  } as unknown as KernelRuntime;
  return {
    repo,
    configs,
    runtime,
    harnesses,
    stub,
    input: {
      configs,
      paths,
      store,
      harnesses,
      binaries: { "fake-native": process.execPath, "fake-acpx": stub.binary },
      baseGates: false,
    },
  };
}

function cleanup(f: Fixture): void {
  f.repo.cleanup();
  f.stub.cleanup();
}

function collectModelIds(run: ReturnType<typeof loadRunConfig>): Set<string> {
  const ids = new Set<string>();
  for (const alias of Object.values(run.aliases)) {
    ids.add(alias.model);
    for (const entry of alias.rotate ?? []) ids.add(entry.model);
    for (const fallback of alias.fallbacks ?? []) {
      if ("model" in fallback) ids.add(fallback.model);
    }
  }
  if (run.scouts) ids.add(run.scouts.model);
  return ids;
}

/** Every harness a fixture alias, rotation or fallback can run. */
function fixtureHarnessIds(run: ReturnType<typeof loadRunConfig>): Set<string> {
  const ids = new Set<string>();
  for (const alias of Object.values(run.aliases)) {
    ids.add(alias.harness);
    for (const entry of alias.rotate ?? []) ids.add(entry.harness);
    for (const fallback of alias.fallbacks ?? []) {
      if ("model" in fallback) ids.add(fallback.harness ?? alias.harness);
    }
  }
  return ids;
}

function expectFixtureCoverage(file: string): void {
  const run = loadRunConfig(path.join(FIXTURE_DIR, file));
  for (const role of REQUIRED_ROLES) {
    expect(
      run.aliases[role],
      `${file}: missing required alias ${role}`,
    ).toBeDefined();
  }
  expect(
    run.aliases["implementer-b"]!.model,
    `${file}: implementer-b must differ from implementer`,
  ).not.toBe(run.aliases.implementer!.model);
  const declared = new Set(Object.keys(run.harnesses ?? {}));
  for (const id of fixtureHarnessIds(run)) {
    expect(declared.has(id), `${file}: harness "${id}" is not declared`).toBe(
      true,
    );
  }
}

function expectFixturePrices(file: string): void {
  const run = loadRunConfig(path.join(FIXTURE_DIR, file));
  const ids = [...collectModelIds(run)].sort();
  expect(ids.length).toBeGreaterThan(0);
  for (const id of ids) {
    expect(
      matchPrice(FAKE_PRICES, id, run.priceIds),
      `${file}: ${id} matches no fake catalog id`,
    ).toBeDefined();
  }
  for (const [from, to] of Object.entries(run.priceIds ?? {})) {
    expect(FAKE_PRICES[to], `${file}: priceIds ${from} -> ${to}`).toBeDefined();
  }
  // fake-route/primary is not in the fake catalog; only priceIds maps it.
  expect(matchPrice(FAKE_PRICES, "fake-route/primary")).toBeUndefined();
  expect(
    matchPrice(FAKE_PRICES, "fake-route/primary", run.priceIds),
  ).toBeDefined();
}

async function expectFixturePreflight(file: string): Promise<void> {
  const f = await fixtureRuntime(file);
  try {
    const result = await preflight(f.input);
    expect(f.configs.run.harnesses?.["fake-acpx"]?.acpx).toMatchObject({
      agent: "fake-acpx acp",
      raw: true,
      effort: { configId: "fake_effort" },
    });
    // xhigh is the stub's live level, not a factory-side list.
    expect(f.configs.run.aliases.pm?.effort).toBe("xhigh");
    expect(f.configs.run.aliases.architect?.effort).toBe("high");
    expect(f.configs.run.aliases["implementer-b"]?.effort).toBe("low");
    expect(f.harnesses.get("fake-acpx")).toBeInstanceOf(AcpxHarness);
  } finally {
    cleanup(f);
  }
}

function overlayDropping(alias: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-run-fixture-"));
  fs.copyFileSync(
    path.join(FIXTURE_DIR, "base.yaml"),
    path.join(dir, "base.yaml"),
  );
  fs.writeFileSync(
    path.join(dir, "overlay.yaml"),
    `extends: base.yaml\naliases:\n  ${alias}: null\n`,
  );
  return dir;
}

async function expectMissingAliasRefused(): Promise<void> {
  const dir = overlayDropping("implementer-b");
  const f = await fixtureRuntime("overlay.yaml", dir);
  try {
    expect(f.configs.run.aliases["implementer-b"]).toBeUndefined();
    // The overlay loaded: a surviving alias proves the refusal is the drop.
    expect(f.configs.run.aliases.implementer).toBeDefined();
    const err = await refusal(f.input);
    const finding = err.findings.find(
      (entry) => entry.key === "aliases.implementer-b",
    );
    expect(finding?.message).toContain("required by");
    expect(err.report).toContain("aliases.implementer-b");
  } finally {
    cleanup(f);
    fs.rmSync(dir, { recursive: true, force: true });
  }
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

function tierChain(
  f: Fixture,
  alias: string,
  iteration?: number,
): (string | undefined)[][] {
  return resolveTurn(f.runtime, alias, alias, undefined, iteration).tiers.map(
    (tier) => [tier.harness.id, tier.model.id, tier.effort],
  );
}

describe("fake run-config fixtures", () => {
  for (const file of fixtureFiles()) {
    it(`covers every required role and declares its harnesses: ${file}`, () => {
      expectFixtureCoverage(file);
    });
    it(`prices every model id against the fake catalog: ${file}`, () => {
      expectFixturePrices(file);
    });
    it(`passes pre-flight through the fake acpx profile: ${file}`, () =>
      expectFixturePreflight(file));
  }

  it(
    "refuses a variant that drops a required alias",
    expectMissingAliasRefused,
  );
});

describe("fake run-config fallback planning", () => {
  it("resolves the overlay's fallback chain and both rotation entries", async () => {
    const f = await fixtureRuntime("variant.yaml");
    try {
      expect(tierChain(f, "reviewer")).toEqual([
        ["fake-acpx", "fake-route/primary", "xhigh"],
        ["fake-acpx", "fake-route/secondary", "low"],
        ["fake-native", "fake/review-alt", "medium"],
      ]);
      expect(tierChain(f, "implementer", 1)).toEqual([
        ["fake-native", "fake/impl-rot", "high"],
      ]);
      expect(tierChain(f, "implementer", 2)).toEqual([
        ["fake-acpx", "fake-route/secondary", "low"],
      ]);
      // Without an iteration the alias's own primary is the tier.
      expect(tierChain(f, "implementer")).toEqual([
        ["fake-native", "fake/impl", undefined],
      ]);
    } finally {
      cleanup(f);
    }
  });
});
