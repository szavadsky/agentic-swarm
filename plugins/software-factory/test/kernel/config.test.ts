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

function threeConfigLayersPart1() {
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
        useWhen:
          "change meant to land in the repo and merge after QA and review",
      },
      spike: {
        flow: "spike",
        kind: "spike",
        schema: "outcome",
        useWhen:
          "question only evidence answers — finished with findings and never merged",
      },
      trivial: {
        flow: "just-implement",
        kind: "development",
        schema: "outcome",
        useWhen:
          "small fully understood change with one implement turn and no acceptance step",
      },
    });
    const paths = resolveGoalPaths(configs, root, "demo");
    expect(paths.goalDir).toBe(path.join(root, ".factory/artifacts/demo"));
    expect(paths.goalCheckout.startsWith(root)).toBe(false);
    expect(paths.integrationBranch).toBe("factory/demo");
    fs.rmSync(root, { recursive: true, force: true });
  });
}

function threeConfigLayersPart2() {
  it("keeps declared portability edges and refuses an unknown edge key", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    const run = path.join(root, ".factory/run.yaml");
    expect(loadConfigs(root).run.portability).toEqual([]);
    fs.writeFileSync(run, "portability: [{ from: agent-c, to: omp }]\n");
    expect(loadConfigs(root).run.portability).toEqual([
      { from: "agent-c", to: "omp" },
    ]);
    fs.writeFileSync(
      run,
      "portability: [{ from: agent-c, to: omp, how: quota }]\n",
    );
    expect(() => loadConfigs(root)).toThrow(ConfigError);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("reads the quota window and its cap", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    const run = path.join(root, ".factory/run.yaml");
    expect(loadConfigs(root).run.quota).toEqual({ resetMinutes: 300 });
    fs.writeFileSync(
      run,
      "quota: { resetMinutes: 45, maxResetMinutes: 600 }\n",
    );
    expect(loadConfigs(root).run.quota).toEqual({
      resetMinutes: 45,
      maxResetMinutes: 600,
    });
    fs.writeFileSync(run, "quota: { resetMinutes: 45, capMinutes: 600 }\n");
    expect(() => loadConfigs(root)).toThrow(ConfigError);
    fs.rmSync(root, { recursive: true, force: true });
  });
}

function threeConfigLayersPart3() {
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

  it("refuses a task type without a use-when", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".factory/process.yaml"),
      "taskTypes:\n  vague: { flow: implement-review, kind: development, schema: outcome }\n",
    );
    expect(() => loadConfigs(root)).toThrow(/taskTypes\.vague\.useWhen/);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("defines just-implement as one implement step with no acceptance step", () => {
    const root = tmpRepo();
    const configs = loadConfigs(root);
    expect(configs.process.flows["just-implement"]!.steps).toEqual([
      {
        id: "implement",
        prompt: "implementer",
        alias: "implementer",
        alternates: ["implementer-b"],
        unfinishedPrompt: "unfinished-turn",
        review: false,
        qa: false,
      },
      {
        id: "resolve",
        prompt: "steward",
        alias: "steward",
        review: false,
        qa: false,
      },
    ]);
    fs.rmSync(root, { recursive: true, force: true });
  });
}

function threeConfigLayersPart4() {
  it("puts the QA acceptance step between implement and review", () => {
    const root = tmpRepo();
    const configs = loadConfigs(root);
    const steps = configs.process.flows["implement-review"]!.steps;
    expect(steps.map((step) => step.id)).toEqual([
      "implement",
      "qa",
      "review",
      "resolve",
    ]);
    expect(steps[1]).toMatchObject({
      prompt: "qa",
      alias: "qa",
      qa: true,
      changeRequests: 2,
      deliverable: "verdict",
    });
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("refuses a step that is both a review and a QA acceptance", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".factory/process.yaml"),
      [
        "flows:",
        "  ambiguous:",
        "    steps:",
        "      - id: implement",
        "        prompt: implementer",
        "        alias: implementer",
        "      - id: accept",
        "        prompt: reviewer",
        "        alias: reviewer",
        "        review: true",
        "        qa: true",
        "",
      ].join("\n"),
    );
    expect(() => loadConfigs(root)).toThrow(/either a review or a QA/);
    fs.rmSync(root, { recursive: true, force: true });
  });
}

function threeConfigLayersPart5() {
  it("refuses an adjudicate step that is also a review or QA step", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".factory/process.yaml"),
      [
        "flows:",
        "  ambiguous:",
        "    steps:",
        "      - id: implement",
        "        prompt: implementer",
        "        alias: implementer",
        "      - id: review",
        "        prompt: reviewer",
        "        alias: reviewer",
        "        review: true",
        "      - id: adjudicate",
        "        prompt: adjudicator",
        "        alias: reviewer",
        "        adjudicate: all",
        "        review: true",
        "",
      ].join("\n"),
    );
    expect(() => loadConfigs(root)).toThrow(
      /an adjudicate step is neither a review nor a QA/,
    );
    fs.rmSync(root, { recursive: true, force: true });
  });
}

function threeConfigLayersPart6() {
  it("refuses an adjudicate step that does not directly follow a review", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".factory/process.yaml"),
      [
        "flows:",
        "  misplaced:",
        "    steps:",
        "      - id: implement",
        "        prompt: implementer",
        "        alias: implementer",
        "      - id: adjudicate",
        "        prompt: adjudicator",
        "        alias: reviewer",
        "        adjudicate: last",
        "",
      ].join("\n"),
    );
    expect(() => loadConfigs(root)).toThrow(
      /an adjudicate step must directly follow a review step/,
    );
    fs.rmSync(root, { recursive: true, force: true });
  });
}

function threeConfigLayersPart7() {
  it("refuses changeRequests on an adjudicate step", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".factory/process.yaml"),
      [
        "flows:",
        "  bounded:",
        "    steps:",
        "      - id: implement",
        "        prompt: implementer",
        "        alias: implementer",
        "      - id: review",
        "        prompt: reviewer",
        "        alias: reviewer",
        "        review: true",
        "      - id: adjudicate",
        "        prompt: adjudicator",
        "        alias: reviewer",
        "        adjudicate: all",
        "        changeRequests: 1",
        "",
      ].join("\n"),
    );
    expect(() => loadConfigs(root)).toThrow(
      /an adjudicate step takes no changeRequests/,
    );
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
}

function threeConfigLayersPart8() {
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
      unfinishedPrompt: "unfinished-turn",
      review: false,
      qa: false,
    });
    fs.rmSync(root, { recursive: true, force: true });
  });
}

function threeConfigLayersPart9() {
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
}

function threeConfigLayersPart10() {
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
}

function threeConfigLayersPart11() {
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
    expect(checks).toEqual({
      id: "checks",
      review: false,
      qa: false,
      changeRequests: 1,
    });
    fs.rmSync(root, { recursive: true, force: true });
  });
}

describe("three config layers", () => {
  threeConfigLayersPart1();

  threeConfigLayersPart2();

  threeConfigLayersPart3();

  threeConfigLayersPart4();

  threeConfigLayersPart5();

  threeConfigLayersPart6();

  threeConfigLayersPart7();

  threeConfigLayersPart8();

  threeConfigLayersPart9();

  threeConfigLayersPart10();

  threeConfigLayersPart11();
});
