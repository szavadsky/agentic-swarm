import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ConfigError,
  loadConfigs,
  resolveGoalPaths,
  toLimits,
} from "../../src/kernel/config.js";

function tmpRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "factory-config-"));
}

describe("three config layers", () => {
  it("defaults without files and resolves paths outside the repo", () => {
    const root = tmpRepo();
    const configs = loadConfigs(root, { iterations: 3 });
    expect(configs.repo.baseBranch).toBe("main");
    expect(configs.repo.artifactRoot).toBe(".factory/artifacts");
    expect(configs.run.limits.iterations).toBe(3);
    expect(
      configs.process.flows["implement-review"]!.steps[1]!.changeRequests,
    ).toBe(2);
    expect(configs.process.reminders).toBe(1);
    expect(configs.process.taskTypes).toEqual({
      development: {
        flow: "implement-review",
        kind: "development",
        schema: "outcome",
      },
      spike: { flow: "spike", kind: "spike", schema: "outcome" },
      trivial: {
        flow: "just-implement",
        kind: "development",
        schema: "outcome",
      },
    });
    const paths = resolveGoalPaths(configs, root, "demo");
    expect(paths.goalDir).toBe(path.join(root, ".factory/artifacts/demo"));
    expect(paths.goalCheckout.startsWith(root)).toBe(false);
    expect(paths.integrationBranch).toBe("factory/demo");
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("refuses a task type kind outside spike and development", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".factory/process.yaml"),
      "taskTypes:\n  odd: { flow: implement-review, kind: task, schema: outcome }\n",
    );
    expect(() => loadConfigs(root)).toThrow(/taskTypes/);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("defines just-implement as one implement step with no reviewer", () => {
    const root = tmpRepo();
    const configs = loadConfigs(root);
    expect(configs.process.flows["just-implement"]!.steps).toEqual([
      {
        id: "implement",
        prompt: "implementer",
        alias: "implementer",
        alternates: ["implementer-b"],
        review: false,
      },
    ]);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("switches the development implementer on retry", () => {
    const root = tmpRepo();
    const configs = loadConfigs(root);
    // Both development flows name the same second alias: a failed implement
    // turn moves to another model instead of repeating the one that failed.
    for (const flow of ["implement-review", "just-implement"] as const)
      expect(configs.process.flows[flow]!.steps[0]).toMatchObject({
        id: "implement",
        alias: "implementer",
        alternates: ["implementer-b"],
      });
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("runs a spike's implement turn on researcher with task-model alternates", () => {
    const root = tmpRepo();
    const configs = loadConfigs(root);
    // The interface `park-history-spike` and `saga-omp-spike-v2` rely on: a
    // spike does not run its implement turn on the task implementer alias, and
    // a failed attempt moves to another task model.
    expect(configs.process.flows.spike!.steps[0]).toEqual({
      id: "implement",
      prompt: "implementer",
      alias: "researcher",
      alternates: ["implementer", "reviewer"],
      review: false,
    });
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("merges the package process default with a repo override", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".factory/process.yaml"),
      "flows:\n  implement-review:\n    steps:\n      - id: implement\n        prompt: implementer\n        alias: implementer\n      - id: review\n        prompt: reviewer\n        alias: reviewer\n        review: true\n        changeRequests: 4\nreminders: 0\nboundary:\n  architect: { prompt: architect, alias: boss }\n",
    );
    fs.writeFileSync(
      path.join(root, ".factory/run.yaml"),
      "aliases:\n  boss: { harness: fake, model: big }\nlimits: { iterations: 2 }\n",
    );
    const configs = loadConfigs(root);
    expect(
      configs.process.flows["implement-review"]!.steps[1]!.changeRequests,
    ).toBe(4);
    expect(configs.process.flows.spike!.steps[1]!.changeRequests).toBe(0);
    expect(configs.process.reminders).toBe(0);
    expect(configs.process.boundary.architect.alias).toBe("boss");
    // A boundary override retargets one step; the package default fills the rest.
    expect(configs.process.boundary.pm).toEqual({
      prompt: "pm",
      alias: "pm",
      deliverable: "task files",
    });
    expect(configs.run.aliases.boss!.model).toBe("big");
    expect(
      toLimits(configs).flows["implement-review"]!.steps[1]!.changeRequests,
    ).toBe(4);
    expect(toLimits(configs).iterations).toBe(2);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("keeps a change-request bound per review step", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".factory/process.yaml"),
      [
        "flows:",
        "  two-reviews:",
        "    steps:",
        "      - id: implement",
        "        prompt: implementer",
        "        alias: implementer",
        "      - id: review",
        "        prompt: reviewer",
        "        alias: reviewer",
        "        review: true",
        "        changeRequests: 0",
        "      - id: security",
        "        prompt: reviewer",
        "        alias: reviewer",
        "        review: true",
        "        changeRequests: 3",
        "",
      ].join("\n"),
    );
    const configs = loadConfigs(root);
    const steps = configs.process.flows["two-reviews"]!.steps;
    expect(steps.map((step) => step.changeRequests)).toEqual([undefined, 0, 3]);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("allows a checks step without a prompt or alias and retains changeRequests", () => {
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
        "      - id: checks",
        "        changeRequests: 1",
        "      - id: review",
        "        prompt: reviewer",
        "        alias: reviewer",
        "        review: true",
        "",
      ].join("\n"),
    );
    const configs = loadConfigs(root);
    const checks = configs.process.flows.custom!.steps.find(
      (s) => s.id === "checks",
    );
    expect(checks).toEqual({ id: "checks", review: false, changeRequests: 1 });
    fs.rmSync(root, { recursive: true, force: true });
  });

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

  it("names a prompt and alias for every boundary step, plan review included", () => {
    const root = tmpRepo();
    const boundary = loadConfigs(root).process.boundary;
    expect(Object.keys(boundary).sort()).toEqual([
      "architect",
      "digest",
      "front",
      "plancheck",
      "planreview",
      "pm",
      "steward",
    ]);
    // Plan review shares the reviewer prompt on its own alias: no second role.
    expect(boundary.planreview).toEqual({
      prompt: "reviewer",
      alias: "plan-reviewer",
      deliverable: "numbered plan-review findings",
    });
    expect(boundary.front).toEqual({
      prompt: "front",
      alias: "pm",
      deliverable: "class, task, and pack",
    });
    fs.rmSync(root, { recursive: true, force: true });
  });

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

  it("refuses a different-model follow-up that names no alias", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".factory/process.yaml"),
      "flows:\n  custom:\n    followUp: { mode: different-model }\n    steps:\n      - id: implement\n        prompt: implementer\n        alias: implementer\n",
    );
    expect(() => loadConfigs(root)).toThrow(/different-model needs an alias/);
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

  it("parses alias subscriptions and cross-harness fallback tiers", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".factory/run.yaml"),
      [
        "aliases:",
        "  implementer: { harness: omp, model: m, subscription: go,",
        "    fallbacks: [{ harness: agy, model: g, effort: high, subscription: ag }] }",
        "limits: { iterations: 1 }",
        "",
      ].join("\n"),
    );
    const alias = loadConfigs(root).run.aliases.implementer!;
    expect(alias.subscription).toBe("go");
    expect(alias.fallbacks).toEqual([
      { harness: "agy", model: "g", effort: "high", subscription: "ag" },
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

  it("defaults sessions.retention to short with no run file", () => {
    const root = tmpRepo();
    const configs = loadConfigs(root);
    expect(configs.run.sessions.retention).toBe("short");
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("parses an explicit sessions.retention of long", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".factory/run.yaml"),
      "sessions: { retention: long }\n",
    );
    const configs = loadConfigs(root);
    expect(configs.run.sessions.retention).toBe("long");
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("reports an invalid sessions.retention as a finding", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".factory/run.yaml"),
      "sessions: { retention: forever }\n",
    );
    let error: unknown;
    try {
      loadConfigs(root);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(ConfigError);
    expect(
      (error as ConfigError).findings.some(
        (finding) => finding.key === "sessions.retention",
      ),
    ).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("requires an acpx usage command to be an adapter slash command", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    const runYaml = path.join(root, ".factory/run.yaml");
    const run = (command: string) =>
      [
        "harnesses:",
        "  pi:",
        "    acpx:",
        "      agent: pi",
        `      usage: { command: "${command}" }`,
        "",
      ].join("\n");

    fs.writeFileSync(runYaml, run("session"));
    let error: unknown;
    try {
      loadConfigs(root);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).findings).toContainEqual(
      expect.objectContaining({
        key: "harnesses.pi.acpx.usage.command",
        message: expect.stringMatching(/leading \//),
      }),
    );

    fs.writeFileSync(runYaml, run("/session"));
    expect(loadConfigs(root).run.harnesses!.pi!.acpx!.usage!.command).toBe(
      "/session",
    );
    fs.rmSync(root, { recursive: true, force: true });
  });
});
