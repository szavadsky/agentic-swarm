import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfigs, resolveGoalPaths, toLimits } from "../../src/kernel/config.js";

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
    expect(configs.process.flows["implement-review"]!.reviewRounds).toBe(2);
    const paths = resolveGoalPaths(configs, root, "demo");
    expect(paths.goalDir).toBe(path.join(root, ".factory/artifacts/demo"));
    expect(paths.goalCheckout.startsWith(root)).toBe(false);
    expect(paths.integrationBranch).toBe("factory/demo");
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("merges the package process default with a repo override", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".factory/process.yaml"),
      "flows:\n  implement-review:\n    reviewRounds: 4\nitemTurns: 12\nroles:\n  architect:\n    prompt: architect\n    alias: boss\n"
    );
    fs.writeFileSync(
      path.join(root, ".factory/run.yaml"),
      "aliases:\n  boss: { harness: fake, model: big }\nlimits: { iterations: 2 }\n"
    );
    const configs = loadConfigs(root);
    expect(configs.process.flows["implement-review"]!.reviewRounds).toBe(4);
    expect(configs.process.flows.spike!.reviewRounds).toBe(1);
    expect(configs.process.itemTurns).toBe(12);
    expect(configs.process.roles.architect!.alias).toBe("boss");
    expect(configs.run.aliases.boss!.model).toBe("big");
    expect(toLimits(configs).flows["implement-review"]!.reviewRounds).toBe(4);
    expect(toLimits(configs).iterations).toBe(2);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("rejects an unsafe goal name", () => {
    const root = tmpRepo();
    const configs = loadConfigs(root);
    expect(() => resolveGoalPaths(configs, root, "../escape")).toThrow(/kebab-case/);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
