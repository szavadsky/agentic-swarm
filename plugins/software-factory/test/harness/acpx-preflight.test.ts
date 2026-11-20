// biome-ignore-all lint/complexity: split-rest
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createRealHarnesses,
  resolveHarnessBinaries,
} from "../../src/cli/harnesses.js";
import { AcpxHarness } from "../../src/harness/acpx/harness.js";
import { FakeHarness } from "../../src/harness/fake/index.js";
import type { Harness } from "../../src/harness/types.js";
import { loadConfigs, resolveGoalPaths } from "../../src/kernel/config.js";
import {
  PreflightError,
  type PreflightInput,
  preflight,
} from "../../src/kernel/preflight.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { createTmpRepo } from "../helpers/tmp-repo.js";
import {
  createAcpxStub,
  type AcpxStub,
  type AcpxStubModel,
} from "./acpx-stub.js";

const LIVE_MODELS: AcpxStubModel[] = [
  { id: "model-a", effort: ["none", "high", "default"] },
  { id: "model-b", effort: ["low", "medium"] },
];

interface RunSpec {
  pmModel?: string;
  pmEffort?: string;
  reviewerEffort?: string;
}

function runConfig(spec: RunSpec = {}): string {
  const pmModel = spec.pmModel ?? "model-a";
  return `aliases:
  architect: { harness: omp, model: arch, effort: high }
  pm: { harness: opencode, model: ${pmModel}${spec.pmEffort ? `, effort: ${spec.pmEffort}` : ""} }
  digest: { harness: opencode, model: model-a }
  implementer: { harness: opencode, model: model-a }
  implementer-b: { harness: opencode, model: model-a }
  researcher: { harness: opencode, model: model-a }
  reviewer: { harness: opencode, model: model-a${spec.reviewerEffort ? `, effort: ${spec.reviewerEffort}` : ""} }
  qa: { harness: opencode, model: model-a }
  steward: { harness: opencode, model: model-a }
  plan-checker: { harness: opencode, model: model-a }
  intent: { harness: opencode, model: model-a }
  plan-reviewer: { harness: opencode, model: model-a }
  pack-preparer: { harness: opencode, model: model-a }
harnesses:
  opencode:
    acpx:
      agent: opencode
      effort:
        configId: effort
        modelBases: { model-a: [none, high, default] }
limits: { concurrency: { overall: 2 }, iterations: 1 }
`;
}

async function fixture(
  text: string,
  stub: AcpxStub,
): Promise<{
  repo: ReturnType<typeof createTmpRepo>;
  input: PreflightInput;
  configs: ReturnType<typeof loadConfigs>;
}> {
  const repo = createTmpRepo();
  repo.writeFile(
    ".factory/repo.yaml",
    "baseBranch: main\nartifactRoot: .factory/artifacts\nsetup: []\ngates: []\n",
  );
  repo.commit("factory config");
  const runConfigPath = path.join(repo.dir, ".factory", "run-acpx.yaml");
  fs.writeFileSync(runConfigPath, text, "utf8");
  const configs = loadConfigs(repo.dir, { runConfigPath });
  const base = path.basename(repo.dir);
  configs.run.sessions.dir = path.join(
    path.dirname(repo.dir),
    `${base}-sessions`,
  );
  configs.run.worktreeRoot = path.join(
    path.dirname(repo.dir),
    `${base}-worktrees`,
  );
  const paths = resolveGoalPaths(configs, repo.dir, "self-acpx");
  fs.mkdirSync(paths.goalDir, { recursive: true });
  fs.writeFileSync(path.join(paths.goalDir, "intent.md"), "# Goal\n", "utf8");
  const store = createFolderStore(paths.goalDir, undefined, {});
  await store.ensureLayout();
  const harnesses = new Map<string, Harness>([
    ["omp", new FakeHarness({ id: "omp", caps: { effort: ["low", "high"] } })],
    [
      "opencode",
      new AcpxHarness({
        id: "opencode",
        binary: stub.binary,
        sessionDir: path.dirname(stub.binary),
        acpx: configs.run.harnesses!.opencode!.acpx!,
      }),
    ],
  ]);
  return {
    repo,
    configs,
    input: {
      configs,
      paths,
      store,
      harnesses,
      binaries: { omp: process.execPath, opencode: stub.binary },
      baseGates: false,
    },
  };
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

function sessionCalls(stub: AcpxStub, verb: "new" | "show" | "close") {
  return stub
    .invocations()
    .filter((args) => args.includes("sessions") && args.includes(verb));
}

describe("acpx live pre-flight", () => {
  it("rejects max against the model's live values", async () => {
    const stub = createAcpxStub({
      models: LIVE_MODELS,
      effortConfigId: "effort",
    });
    const failed = await fixture(runConfig({ pmEffort: "max" }), stub);
    try {
      const err = await refusal(failed.input);
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          key: "aliases.pm.effort",
          file: expect.stringContaining(".factory/run-acpx.yaml"),
        }),
      );
      expect(err.report).toContain(
        'effort "max" is not supported; model accepts: none, high, default',
      );
      expect(stub.sessionNames()).toEqual([]);
    } finally {
      failed.repo.cleanup();
    }
  });

  it("refuses highest effort", async () => {
    const stub = createAcpxStub({
      models: LIVE_MODELS,
      effortConfigId: "effort",
    });
    const failed = await fixture(
      runConfig({ pmEffort: "high", reviewerEffort: "highest" }),
      stub,
    );
    try {
      const err = await refusal(failed.input);
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          key: "aliases.reviewer.effort",
          file: expect.stringContaining(".factory/run-acpx.yaml"),
        }),
      );
      expect(err.report).toContain('effort "highest" is forbidden');
    } finally {
      failed.repo.cleanup();
    }
  });

  it("rejects an unlisted model and names the live model list", async () => {
    const stub = createAcpxStub({
      models: LIVE_MODELS,
      effortConfigId: "effort",
    });
    const f = await fixture(runConfig({ pmModel: "ghost-model" }), stub);
    try {
      const err = await refusal(f.input);
      expect(err.findings).toContainEqual(
        expect.objectContaining({
          key: "aliases.pm.model",
          message:
            'model "ghost-model" is not listed by harness "opencode"; available models: model-a, model-b',
        }),
      );
      expect(err.report).toContain("available models: model-a, model-b");
      expect(stub.sessionNames()).toEqual([]);
    } finally {
      f.repo.cleanup();
    }
  });

  it("refuses highest in fallbacks", async () => {
    const stub = createAcpxStub({
      models: LIVE_MODELS,
      effortConfigId: "effort",
    });
    const text = `aliases:
  pm: { harness: opencode, model: model-a, fallbacks: [{ model: model-b, effort: highest }] }
  digest: { harness: opencode, model: model-a }
  implementer: { harness: opencode, model: model-a }
  implementer-b: { harness: opencode, model: model-b }
  researcher: { harness: opencode, model: model-a }
  reviewer: { harness: opencode, model: model-a }
  qa: { harness: opencode, model: model-a }
  steward: { harness: opencode, model: model-a }
  plan-checker: { harness: opencode, model: model-a }
  intent: { harness: opencode, model: model-a }
  plan-reviewer: { harness: opencode, model: model-a }
  pack-preparer: { harness: opencode, model: model-a }
harnesses:
  opencode:
    acpx:
      agent: opencode
      effort: { configId: effort }
limits: { concurrency: { overall: 2 }, iterations: 1 }
`;
    const f = await fixture(text, stub);
    try {
      const err = await refusal(f.input);
      expect(err.report).toContain('effort "highest" is forbidden');
    } finally {
      f.repo.cleanup();
    }
  });

  it("splits a declared model suffix, probes the wire id, and validates its live level", async () => {
    const stub = createAcpxStub({
      models: LIVE_MODELS,
      effortConfigId: "effort",
    });
    const f = await fixture(runConfig({ pmModel: "model-a-high" }), stub);
    try {
      const result = await preflight(f.input);
      expect(result.aliases.pm).toBe("high");
      const create = sessionCalls(stub, "new")[0]!;
      expect(create[create.indexOf("--model") + 1]).toBe("model-a");
    } finally {
      f.repo.cleanup();
    }
  });
});

describe("acpx harness registry", () => {
  it("binds harness ids from run config with no code", () => {
    const harnesses = createRealHarnesses({
      sessionDir: "/tmp/sessions",
      harnesses: {
        nova: {
          acpx: {
            agent: "nova",
            effort: { configId: "nova_level" },
          },
        },
        opencode: {
          acpx: { agent: "opencode acp", raw: true },
        },
      },
    });
    expect(harnesses.nova).toBeInstanceOf(AcpxHarness);
    expect(harnesses.nova!.id).toBe("nova");
    expect(harnesses.opencode).toBeInstanceOf(AcpxHarness);
    expect(harnesses.opencode!.id).toBe("opencode");
    expect(harnesses.omp).toBeDefined();
  });

  it("registers no native opencode adapter", () => {
    const harnesses = createRealHarnesses({ sessionDir: "/tmp/sessions" });
    expect(harnesses.opencode).toBeUndefined();
    expect(harnesses.omp).toBeDefined();
  });

  it("resolves a raw harness binary from its configured command", () => {
    const binaries = resolveHarnessBinaries({
      nova: { acpx: { agent: "/opt/nova-test/bin/nova acp", raw: true } },
      plain: { acpx: { agent: "plain" } },
    });
    expect(binaries.nova).toBe("/opt/nova-test/bin/nova");
    // A positional agent is served by the acpx dispatcher, whatever it is here.
    expect(typeof binaries.plain).toBe("string");
    expect(binaries.plain!.length).toBeGreaterThan(0);
  });
});
