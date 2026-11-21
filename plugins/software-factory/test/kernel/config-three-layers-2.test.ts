import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ConfigError, loadConfigs } from "../../src/kernel/config.js";

function tmpRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "factory-config-"));
}

function threeConfigLayersPart23() {
  it("rejects a junit report path outside the worktree", () => {
    for (const junit of ["/tmp/junit.xml", "../junit.xml", "~/junit.xml"]) {
      const root = tmpRepo();
      fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
      fs.writeFileSync(
        path.join(root, ".factory/repo.yaml"),
        [
          "gates:",
          "  - id: unit",
          "    command: echo unit",
          `    format: { junit: "${junit}" }`,
          "",
        ].join("\n"),
      );
      expect(() => loadConfigs(root)).toThrow(
        /junit path must be worktree-relative/,
      );
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps the pre-serial gates shape valid and defaults serial to empty", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".factory/repo.yaml"),
      ["gates:", "  - id: unit", "    command: echo unit", ""].join("\n"),
    );
    const configs = loadConfigs(root);
    expect(configs.repo.gates).toEqual([
      { id: "unit", command: "echo unit", serial: [] },
    ]);
    fs.rmSync(root, { recursive: true, force: true });
  });
}

function threeConfigLayersPart24() {
  it("parses declared serial mutexes and per-worktree env dirs", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".factory/repo.yaml"),
      [
        "gates:",
        "  - id: integration",
        "    command: echo integration",
        "    serial: [database, port]",
        "    env: { TMPDIR: .cache/gate, CACHE_DIR: .cache/components }",
        "",
      ].join("\n"),
    );
    const configs = loadConfigs(root);
    expect(configs.repo.gates).toEqual([
      {
        id: "integration",
        command: "echo integration",
        serial: ["database", "port"],
        env: { TMPDIR: ".cache/gate", CACHE_DIR: ".cache/components" },
      },
    ]);
    fs.rmSync(root, { recursive: true, force: true });
  });
}

function threeConfigLayersPart25() {
  it("rejects an env dir outside the worktree and a name that is not a variable", () => {
    const cases = [
      ["{ TMPDIR: /tmp/shared }", /worktree-relative/],
      ["{ TMPDIR: ../shared }", /worktree-relative/],
      ["{ TMPDIR: ~/shared }", /worktree-relative/],
      ["{ 1BAD: .cache }", /gates\.0\.env/],
    ] as const;
    for (const [env, message] of cases) {
      const root = tmpRepo();
      fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
      fs.writeFileSync(
        path.join(root, ".factory/repo.yaml"),
        [
          "gates:",
          "  - id: unit",
          "    command: echo unit",
          `    env: ${env}`,
          "",
        ].join("\n"),
      );
      expect(() => loadConfigs(root)).toThrow(message);
      fs.rmSync(root, { recursive: true, force: true });
    }
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
}

function threeConfigLayersPart26() {
  it("parses the harness env allowlist and defaults it empty", () => {
    const root = tmpRepo();
    expect(loadConfigs(root).run.envAllowlist).toEqual([]);
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".factory/run.yaml"),
      ["envAllowlist:", "  - ANTHROPIC_API_KEY", ""].join("\n"),
    );
    expect(loadConfigs(root).run.envAllowlist).toEqual(["ANTHROPIC_API_KEY"]);
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
}

function threeConfigLayersPart27() {
  it("accepts a native harness entry that carries only opaque options", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".factory/run.yaml"),
      [
        "harnesses:",
        "  omp:",
        "    options:",
        "      memory: { backend: off }",
        "",
      ].join("\n"),
    );
    expect(loadConfigs(root).run.harnesses!.omp!.options).toEqual({
      memory: { backend: "off" },
    });
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("refuses a harness entry with no binding, binary or options", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".factory/run.yaml"),
      ["harnesses:", "  omp: {}", ""].join("\n"),
    );
    let error: unknown;
    try {
      loadConfigs(root);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).report).toContain(
      "needs an acpx binding, a binary override or options",
    );
    fs.rmSync(root, { recursive: true, force: true });
  });
}

function threeConfigLayersPart28() {
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
}

function threeConfigLayersPart29() {
  it("parses a sharesPool fallback and refuses one that also names a subscription", () => {
    const root = tmpRepo();
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    const runYaml = path.join(root, ".factory/run.yaml");
    const run = (tier: string) =>
      [
        "aliases:",
        "  implementer: { harness: omp, model: p, subscription: go,",
        `    fallbacks: [${tier}] }`,
        "limits: { iterations: 1 }",
        "",
      ].join("\n");

    fs.writeFileSync(runYaml, run("{ model: m, sharesPool: true }"));
    expect(loadConfigs(root).run.aliases.implementer!.fallbacks).toEqual([
      { model: "m", sharesPool: true },
    ]);

    fs.writeFileSync(
      runYaml,
      run("{ model: m, subscription: go, sharesPool: true }"),
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
        key: "aliases.implementer.fallbacks.0",
        message: expect.stringMatching(/both subscription and sharesPool/),
      }),
    );
    fs.rmSync(root, { recursive: true, force: true });
  });
}

describe("three config layers", () => {
  threeConfigLayersPart23();

  threeConfigLayersPart24();

  threeConfigLayersPart25();

  threeConfigLayersPart26();

  threeConfigLayersPart27();

  threeConfigLayersPart28();

  threeConfigLayersPart29();
});
