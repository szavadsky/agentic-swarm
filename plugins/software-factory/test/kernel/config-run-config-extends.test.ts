import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ConfigError,
  loadConfigs,
  loadRunConfig,
  resolveGoalPaths,
} from "../../src/kernel/config.js";

function tmpRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "factory-config-"));
}

function mergesBaseChainLetsOverlayChangePart1(
  write: (root: string, rel: string, content: string) => void,
) {
  const root = tmpRepo();
  write(
    root,
    ".factory/root.yaml",
    [
      "aliases:",
      "  architect: { harness: fake, model: root-model, effort: high, fallbacks: [{ model: fallback-model }] }",
      "  reviewer: { harness: fake, model: review-model }",
      "harnesses:",
      "  fake: { binary: fake }",
      "priceIds: { base/model: catalog/model }",
      "limits: { iterations: 4, concurrency: { overall: 5 } }",
      "sessions: { dir: ~/sessions, keepRuns: 7, retention: long }",
      "worktreeRoot: ../wt",
      "",
    ].join("\n"),
  );
  write(root, ".factory/base.yaml", "extends: root.yaml\n");
  write(
    root,
    ".factory/run.yaml",
    [
      "extends: base.yaml",
      "aliases:",
      "  architect: { model: overlay-model, effort: null }",
      "  implementer: { harness: fake, model: impl-model }",
      "",
    ].join("\n"),
  );

  const configs = loadConfigs(root);
  expect(configs.run.aliases.architect).toMatchObject({
    harness: "fake",
    model: "overlay-model",
    fallbacks: [{ model: "fallback-model" }],
  });
  expect(configs.run.aliases.architect!.effort).toBeUndefined();
  expect(configs.run.aliases.reviewer!.model).toBe("review-model");
  expect(configs.run.aliases.implementer!.model).toBe("impl-model");
  expect(configs.run.harnesses!.fake!.binary).toBe("fake");
  expect(configs.run.priceIds).toEqual({ "base/model": "catalog/model" });

  return { root, configs };
}

function mergesBaseChainLetsOverlayChangePart2(
  scope: ReturnType<typeof mergesBaseChainLetsOverlayChangePart1>,
) {
  const { configs, root } = scope;
  expect(configs.run.limits).toMatchObject({
    iterations: 4,
    concurrency: { overall: 5 },
  });
  expect(configs.run.sessions).toEqual({
    dir: "~/sessions",
    keepRuns: 7,
    retention: "long",
  });
  expect(configs.run.worktreeRoot).toBe("../wt");
  expect(resolveGoalPaths(configs, root, "demo").worktreeRoot).toContain(
    path.basename(root),
  );
  expect(configs.run).not.toHaveProperty("extends");
  // The same resolution serves the operator surface, not only a launch.
  expect(loadRunConfig(path.join(root, ".factory/run.yaml"))).toEqual(
    configs.run,
  );
  fs.rmSync(root, { recursive: true, force: true });
}

function runConfigExtendsPart1() {
  function write(root: string, rel: string, content: string): void {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }

  it("merges a base chain and lets the overlay change one alias field", () => {
    const scope1 = mergesBaseChainLetsOverlayChangePart1(write);
    mergesBaseChainLetsOverlayChangePart2(scope1);
  });

  return { write };
}

function runConfigExtendsPart2(
  scope: ReturnType<typeof runConfigExtendsPart1>,
) {
  const { write } = scope;
  it("removes inherited aliases, harnesses, price rows and scouts with null", () => {
    const root = tmpRepo();
    write(
      root,
      ".factory/base.yaml",
      [
        "aliases:",
        "  architect: { harness: fake, model: model }",
        "  obsolete: { harness: fake, model: old }",
        "harnesses:",
        "  fake: { binary: fake }",
        "  omp: { options: { approvalMode: yolo } }",
        "priceIds: { base/model: catalog/model }",
        "scouts: { model: cheap }",
        "",
      ].join("\n"),
    );
    write(
      root,
      ".factory/run.yaml",
      [
        "extends: base.yaml",
        "aliases: { obsolete: null }",
        "harnesses: { omp: null }",
        "priceIds: { base/model: null }",
        "scouts: null",
        "",
      ].join("\n"),
    );

    const run = loadConfigs(root).run;
    expect(Object.keys(run.aliases)).toEqual(["architect"]);
    expect(Object.keys(run.harnesses!)).toEqual(["fake"]);
    expect(run.priceIds).toEqual({});
    expect(run.scouts).toBeUndefined();
    fs.rmSync(root, { recursive: true, force: true });
  });
}

function runConfigExtendsPart3(
  scope: ReturnType<typeof runConfigExtendsPart1>,
) {
  const { write } = scope;
  it("keeps the child's own keys when the base file is empty", () => {
    const root = tmpRepo();
    write(root, ".factory/base.yaml", "# intentionally empty\n");
    write(
      root,
      ".factory/run.yaml",
      [
        "extends: base.yaml",
        "worktreeRoot: .factory/worktrees",
        "aliases:",
        "  implementer: { harness: fake, model: model }",
        "",
      ].join("\n"),
    );

    const run = loadConfigs(root).run;
    expect(Object.keys(run.aliases)).toEqual(["implementer"]);
    expect(run.worktreeRoot).toBe(".factory/worktrees");

    const direct = loadRunConfig(path.join(root, ".factory/run.yaml"));
    expect(direct.aliases.implementer!.model).toBe("model");
    expect(direct.worktreeRoot).toBe(".factory/worktrees");
    fs.rmSync(root, { recursive: true, force: true });
  });
}

function runConfigExtendsPart4(
  scope: ReturnType<typeof runConfigExtendsPart1>,
) {
  const { write } = scope;
  it("refuses an extends cycle and names the files", () => {
    const root = tmpRepo();
    write(root, ".factory/a.yaml", "extends: b.yaml\n");
    write(root, ".factory/b.yaml", "extends: a.yaml\n");
    write(root, ".factory/run.yaml", "extends: a.yaml\n");

    let error: unknown;
    try {
      loadConfigs(root);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(ConfigError);
    const findings = (error as ConfigError).findings;
    expect(findings).toContainEqual(
      expect.objectContaining({
        file: path.join(root, ".factory/b.yaml"),
        key: "extends",
        message: expect.stringMatching(
          /extends cycle: .*a\.yaml -> .*b\.yaml -> .*a\.yaml/,
        ),
      }),
    );
    fs.rmSync(root, { recursive: true, force: true });
  });
}

function runConfigExtendsPart5(
  scope: ReturnType<typeof runConfigExtendsPart1>,
) {
  const { write } = scope;
  it("refuses a base that is missing or not a mapping", () => {
    const root = tmpRepo();
    write(root, ".factory/run.yaml", "extends: absent.yaml\n");
    let error: unknown;
    try {
      loadConfigs(root);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).findings).toContainEqual(
      expect.objectContaining({
        file: path.join(root, ".factory/run.yaml"),
        key: "extends",
        message: expect.stringMatching(/base run config not found/),
      }),
    );

    write(root, ".factory/scalar.yaml", "- not a mapping\n");
    write(root, ".factory/run.yaml", "extends: scalar.yaml\n");
    expect(() => loadConfigs(root)).toThrow(/expected a run config mapping/);
    fs.rmSync(root, { recursive: true, force: true });
  });
}

function runConfigExtendsPart6(
  scope: ReturnType<typeof runConfigExtendsPart1>,
) {
  const { write } = scope;
  it("refuses worktreeRoot in the repo layer", () => {
    const root = tmpRepo();
    write(
      root,
      ".factory/repo.yaml",
      "baseBranch: main\nworktreeRoot: ../wt\n",
    );

    let error: unknown;
    try {
      loadConfigs(root);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).findings).toContainEqual(
      expect.objectContaining({
        file: path.join(root, ".factory/repo.yaml"),
        message: expect.stringContaining("worktreeRoot"),
      }),
    );
    fs.rmSync(root, { recursive: true, force: true });
  });
}

describe("run-config extends", () => {
  const scope1 = runConfigExtendsPart1();
  runConfigExtendsPart2(scope1);
  runConfigExtendsPart3(scope1);
  runConfigExtendsPart4(scope1);
  runConfigExtendsPart5(scope1);
  runConfigExtendsPart6(scope1);
});
