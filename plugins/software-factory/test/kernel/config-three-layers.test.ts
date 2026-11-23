import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  architectureSchema,
  ConfigError,
  loadConfigs,
  resolveGoalPaths,
  toLimits,
} from "../../src/kernel/config.js";

function tmpRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "factory-config-"));
}

function threeConfigLayersPart12() {
  it("parses a step's alternates and refuses them on the checks script step", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".factory/process.yaml"),
      [
        "flows:",
        "  custom:",
        "    steps:",
        "      - id: implement",
        "        prompt: implementer",
        "        alias: implementer",
        "        alternates: [implementer-backup, implementer-last]",
        "",
      ].join("\n"),
    );
    const steps = loadConfigs(root).process.flows.custom!.steps;
    expect(steps[0]!.alternates).toEqual([
      "implementer-backup",
      "implementer-last",
    ]);
    fs.writeFileSync(
      path.join(root, ".factory/process.yaml"),
      [
        "flows:",
        "  custom:",
        "    steps:",
        "      - id: checks",
        "        alternates: [implementer-backup]",
        "",
      ].join("\n"),
    );
    expect(() => loadConfigs(root)).toThrow(/alternates need a step alias/);
    fs.rmSync(root, { recursive: true, force: true });
  });
}

function threeConfigLayersPart13() {
  it("names a prompt and alias for every boundary step", () => {
    const root = tmpRepo();
    const boundary = loadConfigs(root).process.boundary;
    expect(Object.keys(boundary).sort()).toEqual([
      "architect",
      "digest",
      "front",
      "intent",
      "packprep",
      "plancheck",
      "pm",
      "steward",
    ]);
    // The pack preparer runs on its own cheap alias.
    expect(boundary.packprep).toEqual({
      prompt: "pack-preparer",
      alias: "pack-preparer",
      deliverable: "context pack",
    });
    expect(boundary.front).toEqual({
      prompt: "front",
      alias: "pm",
      deliverable: "class, task, and pack",
    });
    expect(boundary.intent).toEqual({
      prompt: "intent",
      alias: "intent",
      deliverable: "intent edit",
    });
    fs.rmSync(root, { recursive: true, force: true });
  });
}

function threeConfigLayersPart14() {
  it("declares the architecture flow: reviewers and the architect return", () => {
    const root = tmpRepo();
    const architecture = loadConfigs(root).process.architecture;
    expect(architecture).toEqual({
      planReview: {
        prompt: "review-architect",
        deliverable: "plan-review findings",
      },
      reviewers: ["plan-reviewer"],
      architectReturn: "on-technical-concerns",
      planReturn: {
        prompt: "architect-review-return",
        deliverable: "plan edit and marks",
      },
    });
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("refuses an architect return without its prompt", () => {
    expect(() =>
      architectureSchema.parse({
        planReview: { prompt: "review-architect" },
        reviewers: ["plan-reviewer"],
        architectReturn: "on-technical-concerns",
      }),
    ).toThrow(/needs a planReturn prompt/);
  });

  it("lets a repo retarget one architecture key without restating the rest", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".factory/process.yaml"),
      "architecture:\n  reviewers: [reviewer, plan-reviewer]\n",
    );
    const architecture = loadConfigs(root).process.architecture;
    expect(architecture.reviewers).toEqual(["reviewer", "plan-reviewer"]);
    expect(architecture.planReview.prompt).toBe("review-architect");
    fs.rmSync(root, { recursive: true, force: true });
  });
}

function threeConfigLayersPart15() {
  it("refuses a step that names no alias", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".factory/process.yaml"),
      "flows:\n  custom:\n    steps:\n      - id: implement\n        prompt: implementer\n",
    );
    expect(() => loadConfigs(root)).toThrow(/prompt and an alias/);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("refuses a step's different-model follow-up that names no alias", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".factory/process.yaml"),
      "flows:\n  custom:\n    steps:\n      - id: implement\n        prompt: implementer\n        alias: implementer\n        followUp: { mode: different-model }\n",
    );
    expect(() => loadConfigs(root)).toThrow(
      /different-model follow-up needs an alias/,
    );
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("refuses a flow-level follow-up: the mode belongs to each step", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".factory/process.yaml"),
      "flows:\n  custom:\n    followUp: { mode: de-novo }\n    steps:\n      - id: implement\n        prompt: implementer\n        alias: implementer\n",
    );
    expect(() => loadConfigs(root)).toThrow(ConfigError);
    fs.rmSync(root, { recursive: true, force: true });
  });
}

function threeConfigLayersPart16() {
  it("reads a step's follow-up mode, alias and keepSession", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    const process = path.join(root, ".factory/process.yaml");
    fs.writeFileSync(
      process,
      "flows:\n  custom:\n    steps:\n      - id: implement\n        prompt: implementer\n        alias: implementer\n        followUp: { mode: different-model, alias: implementer-b, keepSession: true }\n",
    );
    expect(loadConfigs(root).process.flows.custom!.steps[0]!.followUp).toEqual({
      mode: "different-model",
      alias: "implementer-b",
      keepSession: true,
    });
    fs.writeFileSync(
      process,
      "flows:\n  custom:\n    steps:\n      - id: implement\n        prompt: implementer\n        alias: implementer\n        followUp: { keepSession: true }\n",
    );
    expect(() => loadConfigs(root)).toThrow(
      /keepSession needs a different-model/,
    );
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("refuses a boundary step the kernel does not run", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".factory/process.yaml"),
      "boundary:\n  reviewer: { prompt: reviewer, alias: reviewer }\n",
    );
    let error: ConfigError | undefined;
    try {
      loadConfigs(root);
    } catch (err) {
      error = err as ConfigError;
    }
    expect(error).toBeInstanceOf(ConfigError);
    expect(error!.report).toContain("reviewer");
    fs.rmSync(root, { recursive: true, force: true });
  });
}

function threeConfigLayersPart17() {
  it("fails loud on a repo process file that still carries itemTurns", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    const override = path.join(root, ".factory/process.yaml");
    fs.writeFileSync(override, "itemTurns: 8\n");
    let error: ConfigError | undefined;
    try {
      loadConfigs(root);
    } catch (err) {
      error = err as ConfigError;
    }
    expect(error).toBeInstanceOf(ConfigError);
    expect(error!.findings).toContainEqual({
      file: override,
      key: "(root)",
      message: expect.stringContaining("itemTurns"),
    });
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("resolves alias-level timeouts with long defaults", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".factory/run.yaml"),
      [
        "aliases:",
        "  architect: { harness: fake, model: big }",
        "  implementer: { harness: fake, model: small, timeouts: { idleMs: 5000, wallMs: 9000 } }",
        "",
      ].join("\n"),
    );
    const configs = loadConfigs(root);
    expect(configs.run.aliases.architect!.timeouts).toEqual({
      idleMs: 20 * 60_000,
      wallMs: 60 * 60_000,
    });
    expect(configs.run.aliases.implementer!.timeouts).toEqual({
      idleMs: 5000,
      wallMs: 9000,
    });
    fs.rmSync(root, { recursive: true, force: true });
  });
}

function threeConfigLayersPart18() {
  it("maps the optional iteration USD brake into the typed limits", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    const runYaml = path.join(root, ".factory/run.yaml");
    fs.writeFileSync(runYaml, "limits: { iterations: 1, iterationUsd: 2.5 }\n");
    expect(toLimits(loadConfigs(root)).iterationUsd).toBe(2.5);
    fs.writeFileSync(runYaml, "limits: { iterations: 1 }\n");
    expect(toLimits(loadConfigs(root)).iterationUsd).toBeUndefined();
    fs.writeFileSync(runYaml, "limits: { iterations: 1, iterationUsd: 0 }\n");
    expect(() => loadConfigs(root)).toThrow(/iterationUsd/);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("bounds per-slug amends with limits.parkAmends, default 1", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    const runYaml = path.join(root, ".factory/run.yaml");
    fs.writeFileSync(runYaml, "limits: { iterations: 1 }\n");
    expect(toLimits(loadConfigs(root)).parkAmends).toBe(1);
    fs.writeFileSync(runYaml, "limits: { iterations: 1, parkAmends: 2 }\n");
    expect(toLimits(loadConfigs(root)).parkAmends).toBe(2);
    fs.writeFileSync(runYaml, "limits: { iterations: 1, parkAmends: -1 }\n");
    expect(() => loadConfigs(root)).toThrow(/parkAmends/);
    fs.rmSync(root, { recursive: true, force: true });
  });
}

function threeConfigLayersPart19() {
  it("maps the optional turn/iteration minute knobs into the limits", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    const runYaml = path.join(root, ".factory/run.yaml");
    fs.writeFileSync(
      runYaml,
      "limits: { iterations: 1, turnMinutes: 5, iterationMinutes: 7 }\n",
    );
    const limits = toLimits(loadConfigs(root));
    expect(limits.turnMinutes).toBe(5);
    expect(limits.iterationWallMs).toBe(7 * 60_000);
    // The minutes knob wins over wallMinutes when both are set.
    fs.writeFileSync(
      runYaml,
      "limits: { iterations: 1, wallMinutes: 3, iterationMinutes: 7 }\n",
    );
    expect(toLimits(loadConfigs(root)).iterationWallMs).toBe(7 * 60_000);
    fs.writeFileSync(runYaml, "limits: { iterations: 1, turnMinutes: 0 }\n");
    expect(() => loadConfigs(root)).toThrow(/turnMinutes/);
    fs.rmSync(root, { recursive: true, force: true });
  });
}

function threeConfigLayersPart20() {
  it("defaults concurrency to overall-only and maps pool and model caps", () => {
    const root = tmpRepo();
    expect(toLimits(loadConfigs(root)).concurrency).toEqual({
      overall: 2,
      perSubscription: {},
      perModel: {},
    });
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    const runYaml = path.join(root, ".factory/run.yaml");
    fs.writeFileSync(
      runYaml,
      "limits: { iterations: 1, concurrency: { overall: 3, perSubscription: { go: 2 }, perModel: { a/b: 1 } } }\n",
    );
    expect(toLimits(loadConfigs(root)).concurrency).toEqual({
      overall: 3,
      perSubscription: { go: 2 },
      perModel: { "a/b": 1 },
    });
    fs.writeFileSync(
      runYaml,
      "limits: { iterations: 1, concurrency: { overall: 0 } }\n",
    );
    expect(() => loadConfigs(root)).toThrow(/overall/);
    fs.rmSync(root, { recursive: true, force: true });
  });
}

function threeConfigLayersPart21() {
  it("parses alias subscriptions and cross-harness fallback tiers", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".factory/run.yaml"),
      [
        "aliases:",
        "  implementer: { harness: omp, model: m, subscription: go,",
        "    fallbacks: [{ harness: agent-c, model: g, effort: high, subscription: ag }] }",
        "limits: { iterations: 1 }",
        "",
      ].join("\n"),
    );
    const alias = loadConfigs(root).run.aliases.implementer!;
    expect(alias.subscription).toBe("go");
    expect(alias.fallbacks).toEqual([
      { harness: "agent-c", model: "g", effort: "high", subscription: "ag" },
    ]);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("parses a fallback that names another alias and refuses a mixed tier", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    const runYaml = path.join(root, ".factory/run.yaml");
    const config = (fallbacks: string): string =>
      [
        "aliases:",
        "  backup: { harness: omp, model: m, subscription: go }",
        `  implementer: { harness: omp, model: p, fallbacks: [${fallbacks}] }`,
        "limits: { iterations: 1 }",
        "",
      ].join("\n");
    fs.writeFileSync(runYaml, config("{ alias: backup }"));
    expect(loadConfigs(root).run.aliases.implementer!.fallbacks).toEqual([
      { alias: "backup" },
    ]);
    fs.writeFileSync(runYaml, config("{ alias: backup, model: m }"));
    expect(() => loadConfigs(root)).toThrow(/fallbacks\.0/);
    fs.rmSync(root, { recursive: true, force: true });
  });
}

function threeConfigLayersPart22() {
  it("rejects an unsafe goal name", () => {
    const root = tmpRepo();
    const configs = loadConfigs(root);
    expect(() => resolveGoalPaths(configs, root, "BadName")).toThrow(
      /kebab-case/,
    );
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("allows gate format", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".factory/repo.yaml"),
      [
        "gates:",
        "  - id: test-junit",
        "    command: echo test",
        "    format: { junit: junit.xml }",
        "  - id: test-pattern",
        "    command: echo test",
        "    format: { pattern: pytest }",
        "",
      ].join("\n"),
    );
    const configs = loadConfigs(root);
    const format0 = configs.repo.gates[0]?.format;
    const format1 = configs.repo.gates[1]?.format;
    expect(format0).toBeDefined();
    expect(format0).toEqual({ junit: "junit.xml" });
    expect(format1).toBeDefined();
    expect(format1).toEqual({ pattern: "pytest" });
    fs.rmSync(root, { recursive: true, force: true });
  });
}

describe("three config layers", () => {
  threeConfigLayersPart12();

  threeConfigLayersPart13();

  threeConfigLayersPart14();

  threeConfigLayersPart15();

  threeConfigLayersPart16();

  threeConfigLayersPart17();

  threeConfigLayersPart18();

  threeConfigLayersPart19();

  threeConfigLayersPart20();

  threeConfigLayersPart21();

  threeConfigLayersPart22();
});
