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
    const paths = resolveGoalPaths(configs, root, "demo");
    expect(paths.goalDir).toBe(path.join(root, ".factory/artifacts/demo"));
    expect(paths.goalCheckout.startsWith(root)).toBe(false);
    expect(paths.integrationBranch).toBe("factory/demo");
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("defines just-implement as one implement step with no reviewer", () => {
    const root = tmpRepo();
    const configs = loadConfigs(root);
    expect(configs.process.flows["just-implement"]!.steps).toEqual([
      { id: "implement", role: "implementer", review: false },
    ]);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("merges the package process default with a repo override", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".factory/process.yaml"),
      "flows:\n  implement-review:\n    steps:\n      - id: implement\n        role: implementer\n      - id: review\n        role: reviewer\n        review: true\n        changeRequests: 4\nreminders: 0\nroles:\n  architect:\n    prompt: architect\n    alias: boss\n",
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
    expect(configs.process.roles.architect!.alias).toBe("boss");
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
        "        role: implementer",
        "      - id: review",
        "        role: reviewer",
        "        review: true",
        "        changeRequests: 0",
        "      - id: security",
        "        role: reviewer",
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

  it("allows checks flow step without a role and retains changeRequests", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".factory/process.yaml"),
      [
        "flows:",
        "  custom:",
        "    steps:",
        "      - id: implement",
        "        role: implementer",
        "      - id: checks",
        "        changeRequests: 1",
        "      - id: review",
        "        role: reviewer",
        "        review: true",
        "",
      ].join("\n"),
    );
    const configs = loadConfigs(root);
    const checks = configs.process.flows.custom!.steps.find(
      (s) => s.id === "checks",
    );
    expect(checks).toEqual({
      id: "checks",
      role: undefined,
      review: false,
      changeRequests: 1,
    });
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
