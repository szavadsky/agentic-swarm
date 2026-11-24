import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import {
  installLspConfig,
  turnLspConfigPath,
} from "../../src/harness/omp/lsp.js";
import {
  artifactLspConfig,
  artifactLspConfigPath,
  writeArtifactLsp,
} from "../../src/kernel/artifact-lsp.js";
import { runGoal } from "../../src/kernel/launch.js";
import { kernelSchemaFiles } from "../helpers/kernel-schema-files.js";
import { testPriceSource } from "../helpers/price-source.js";
import { cleanup, makeGoal } from "./e2e-helpers.js";
import { withKernelRoleFallbacks } from "./fake-defaults.js";

let root: string;
let goalDir: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "artifact-lsp-"));
  goalDir = path.join(root, ".factory", "artifacts", "demo");
  fs.mkdirSync(path.join(goalDir, "tasks"), { recursive: true });
  fs.writeFileSync(path.join(goalDir, "class.yaml"), "class: bigger\n");
  fs.writeFileSync(
    path.join(goalDir, "tasks", "demo.md"),
    "---\nslug: demo\n---\n",
  );
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

interface ServerConfig {
  disabled?: boolean;
  command?: string;
  args?: string[];
  fileTypes?: string[];
  rootMarkers?: string[];
  settings?: {
    yaml?: {
      validate?: boolean;
      schemaStore?: { enable?: boolean };
      schemas?: Record<string, string[]>;
    };
  };
}

function servers(dir: string): Record<string, ServerConfig> {
  const config = JSON.parse(
    fs.readFileSync(artifactLspConfigPath(dir), "utf8"),
  ) as { servers: Record<string, ServerConfig> };
  return config.servers;
}

describe("artifact LSP", () => {
  artifactLSPPart1();
  artifactLSPPart2();
});

describe("launch provisioning", () => {
  it("writes the schemas and config into the goal before the first turn", async () => {
    const goal = makeGoal({
      runYaml: [
        "aliases:",
        "  architect: { harness: fake, model: fake-architect }",
        "  pm: { harness: fake, model: fake-pm }",
        "  digest: { harness: fake, model: fake-digest }",
        "  implementer: { harness: fake, model: fake-impl }",
        "  implementer-b: { harness: fake, model: fake-impl-b }",
        "  researcher: { harness: fake, model: fake-research }",
        "  reviewer: { harness: fake, model: fake-review }",
        "  qa: { harness: fake, model: fake-qa }",
        "  steward: { harness: fake, model: fake-steward }",
        "  plan-checker: { harness: fake, model: fake-check }",
        "  intent: { harness: fake, model: fake-intent }",
        "  plan-reviewer: { harness: fake, model: fake-plan-review }",
        "  pack-preparer: { harness: fake, model: fake-pack-prep }",
        "lsp: true",
        "limits: { iterations: 1, concurrency: { overall: 1 } }",
        "",
      ].join("\n"),
    });
    try {
      const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
      harness.script(
        (req) =>
          fakeTurnResult(req, { stop: { kind: "infra", cause: "auth" } }),
        { fallback: true },
      );
      const result = await runGoal({
        repo: goal.repo.dir,
        goal: "demo",
        iterations: 1,
        harnesses: { fake: harness },
        priceSource: testPriceSource(goal.repo.dir),
      });
      expect(result.stop).toBe("infra");

      const config = artifactLspConfigPath(goal.goalDir);
      expect(fs.existsSync(config)).toBe(true);
      expect(fs.readdirSync(path.join(goal.goalDir, "schemas"))).toHaveLength(
        kernelSchemaFiles().length,
      );
      const parsed = JSON.parse(fs.readFileSync(config, "utf8")) as {
        servers: Record<string, { fileTypes?: string[] }>;
      };
      expect(parsed.servers["factory-artifacts"]?.fileTypes).toEqual([
        ".yaml",
        ".yml",
      ]);
      expect(parsed.servers["factory-task-frontmatter"]?.fileTypes).toEqual([
        ".md",
      ]);
    } finally {
      cleanup(goal);
    }
  }, 60_000);
});

async function writesEveryKernelSchemaOneConfigPart1() {
  const written = await writeArtifactLsp(goalDir);

  expect(fs.readdirSync(path.join(goalDir, "schemas")).sort()).toEqual(
    kernelSchemaFiles(),
  );
  expect(written.schemas).toHaveLength(kernelSchemaFiles().length);
  expect(written.config).toBe(artifactLspConfigPath(goalDir));
  expect(fs.existsSync(written.config)).toBe(true);

  const config = servers(goalDir);
  // The built-in yamlls entry would double-validate with the schema store.
  expect(config.yamlls).toEqual({ disabled: true });
  const yaml = config["factory-artifacts"]!;
  expect(yaml.fileTypes).toEqual([".yaml", ".yml"]);
  expect(yaml.args).toEqual(["--stdio"]);
  expect(yaml.rootMarkers).toEqual(["."]);
  expect(yaml.settings?.yaml?.validate).toBe(true);
  // No schema-store network fetches at agent time.
  expect(yaml.settings?.yaml?.schemaStore?.enable).toBe(false);

  const schemas = yaml.settings?.yaml?.schemas ?? {};
  const entries = Object.entries(schemas);
  expect(entries).toHaveLength(4);
  for (const [schema, globs] of entries) {
    expect(path.isAbsolute(schema)).toBe(true);
    expect(fs.existsSync(schema)).toBe(true);
    expect(globs).toHaveLength(1);
    expect(path.isAbsolute(globs[0]!)).toBe(true);
    expect(globs[0]!.startsWith(goalDir)).toBe(true);
  }
  const byName = Object.fromEntries(
    entries.map(([schema, globs]) => [path.basename(schema), globs[0]]),
  );
  expect(byName["outcome.schema.json"]).toBe(
    path.join(goalDir, "records/**/outcome.yaml"),
  );

  return { config, yaml, byName };
}

async function writesEveryKernelSchemaOneConfigPart2(
  scope: Awaited<ReturnType<typeof writesEveryKernelSchemaOneConfigPart1>>,
) {
  const { byName, yaml, config } = scope;
  expect(byName["hold.schema.json"]).toBe(
    path.join(goalDir, "mailbox/holds/*.yaml"),
  );
  expect(byName["class.schema.json"]).toBe(path.join(goalDir, "class.yaml"));
  expect(byName["infra.schema.json"]).toBe(path.join(goalDir, "infra.yaml"));

  // Markdown is the frontmatter server's job: yamlls would parse the body
  // as a second YAML document and false-report every task file.
  expect(yaml.fileTypes).not.toContain(".md");

  const task = config["factory-task-frontmatter"]!;
  expect(task.fileTypes).toEqual([".md"]);
  expect(task.command).toBe(process.execPath);
  expect(task.args?.[0]).toEndWith(
    path.join("src", "harness", "lsp", "frontmatter.ts"),
  );
  expect(fs.existsSync(task.args?.[0] ?? "")).toBe(true);
}

function artifactLSPPart1() {
  it("writes every kernel schema and one config into the artifact folder", async () => {
    const scope1 = await writesEveryKernelSchemaOneConfigPart1();
    await writesEveryKernelSchemaOneConfigPart2(scope1);
  });

  it("writes identical content when the launch repeats", async () => {
    await writeArtifactLsp(goalDir);
    const first = fs.readFileSync(artifactLspConfigPath(goalDir), "utf8");
    await writeArtifactLsp(goalDir);
    expect(fs.readFileSync(artifactLspConfigPath(goalDir), "utf8")).toBe(first);
    expect(artifactLspConfig(goalDir)).toEqual(artifactLspConfig(goalDir));
  });

  it("installs the canonical config into the turn cwd, byte-identical", async () => {
    const { config } = await writeArtifactLsp(goalDir);
    const cwd = path.join(root, "task-worktree");
    fs.mkdirSync(cwd, { recursive: true });

    const target = await installLspConfig(cwd, config);
    expect(target).toBe(turnLspConfigPath(cwd));
    expect(fs.readFileSync(target, "utf8")).toBe(
      fs.readFileSync(config, "utf8"),
    );
    // A user's own omp config keeps its precedence and is never touched.
    const userConfig = path.join(cwd, ".omp", "lsp.json");
    expect(target).not.toBe(userConfig);

    // A second install leaves the file alone (no churn on every turn).
    const before = fs.statSync(target).mtimeMs;
    await installLspConfig(cwd, config);
    expect(fs.statSync(target).mtimeMs).toBe(before);
  });
}

function artifactLSPPart2() {
  it("refuses to overwrite a tracked .omp/.lsp.json", async () => {
    const { config } = await writeArtifactLsp(goalDir);
    const cwd = path.join(root, "tracked-worktree");
    fs.mkdirSync(path.join(cwd, ".omp"), { recursive: true });
    fs.writeFileSync(path.join(cwd, ".omp", ".lsp.json"), "user config\n");
    const init = Bun.spawnSync(["git", "init", "-q", cwd]);
    expect(init.exitCode).toBe(0);
    const add = Bun.spawnSync(["git", "-C", cwd, "add", ".omp/.lsp.json"]);
    expect(add.exitCode).toBe(0);

    await expect(installLspConfig(cwd, config)).rejects.toThrow(/is tracked/);
    expect(fs.readFileSync(path.join(cwd, ".omp", ".lsp.json"), "utf8")).toBe(
      "user config\n",
    );
  });

  it("fails loudly when the canonical config is missing", async () => {
    const cwd = path.join(root, "task-worktree");
    fs.mkdirSync(cwd, { recursive: true });
    await expect(
      installLspConfig(cwd, path.join(root, "absent.json")),
    ).rejects.toThrow(/ENOENT/);
    expect(fs.existsSync(turnLspConfigPath(cwd))).toBe(false);
  });
}
