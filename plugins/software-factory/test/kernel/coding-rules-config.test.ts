import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ConfigError,
  loadConfigs,
  repoConfigSchema,
} from "../../src/kernel/config.js";
import { loadPrompts } from "../../src/kernel/prompts.js";
import type { ProcessConfig, RunConfig } from "../../src/kernel/types.js";
import { TEST_ARCHITECTURE, TEST_BOUNDARY } from "./helpers.js";

const DEFAULT_RULE = "Repository conventions win";
const CUSTOM_RULES = "CUSTOM REPO RULES ONE\nCUSTOM REPO RULES TWO\n";

function processConfig(): ProcessConfig {
  return {
    taskTypes: {},
    flows: {},
    boundary: TEST_BOUNDARY,
    architecture: TEST_ARCHITECTURE,
    reminders: 1,
  };
}

const IMPLEMENTER_VARS = {
  task_path: "/goal/tasks/alpha.md",
  front_pack: "",
  worktree: "/worktrees/demo",
  resume_note: "",
  report_path: "",
  setup_command: "none",
  gate_commands: "none",
  findings: "",
  outcome_path: "/tmp/outcome.yaml",
};

const REVIEWER_VARS = {
  task_path: "/goal/tasks/alpha.md",
  worktree: "/worktrees/demo",
  base_hash: "abc1234",
  head_hash: "def5678",
  round: "1",
  max_rounds: "3",
  last_call: "false",
  prior_findings: "",
  upscope_ask: "",
  outcome_path: "/tmp/outcome.yaml",
};

function tempRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "coding-rules-config-"));
}

function writeRepoYaml(repoRoot: string, codingRules: string): void {
  fs.mkdirSync(path.join(repoRoot, ".factory"), { recursive: true });
  fs.writeFileSync(
    path.join(repoRoot, ".factory", "repo.yaml"),
    `baseBranch: main\ncodingRules: ${codingRules}\n`,
  );
}

describe("coding rules config", () => {
  codingRulesSchemaTests();
  codingRulesRenderTests();
  codingRulesMissingTests();
});

function codingRulesSchemaTests(): void {
  it("accepts a repo-relative rule file and rejects escaping paths", () => {
    expect(
      repoConfigSchema.parse({ codingRules: ".factory/prompts/rules.md" })
        .codingRules,
    ).toBe(".factory/prompts/rules.md");
    expect(() =>
      repoConfigSchema.parse({ codingRules: "/etc/rules.md" }),
    ).toThrow();
    expect(() =>
      repoConfigSchema.parse({ codingRules: "../rules.md" }),
    ).toThrow();
  });
}

function codingRulesRenderTests(): void {
  it("renders the factory default in both prompts without an override", () => {
    const lib = loadPrompts(processConfig(), os.tmpdir(), {
      run: {} as RunConfig,
    });
    const implementer = lib.render("implementer", IMPLEMENTER_VARS);
    const reviewer = lib.render("reviewer", REVIEWER_VARS);
    expect(implementer).toContain(DEFAULT_RULE);
    expect(reviewer).toContain(DEFAULT_RULE);
  });

  it("replaces the factory default with the repo rule file in both prompts", () => {
    const repoRoot = tempRepo();
    try {
      fs.mkdirSync(path.join(repoRoot, "rules"), { recursive: true });
      fs.writeFileSync(path.join(repoRoot, "rules", "custom.md"), CUSTOM_RULES);
      const lib = loadPrompts(processConfig(), repoRoot, {
        run: {} as RunConfig,
        repo: {
          baseBranch: "main",
          artifactRoot: ".factory/artifacts",
          setup: [],
          gates: [],
          codingRules: "rules/custom.md",
        },
      });
      const implementer = lib.render("implementer", IMPLEMENTER_VARS);
      const reviewer = lib.render("reviewer", REVIEWER_VARS);
      for (const rendered of [implementer, reviewer]) {
        expect(rendered).toContain("CUSTOM REPO RULES ONE");
        expect(rendered).toContain("CUSTOM REPO RULES TWO");
        expect(rendered).not.toContain(DEFAULT_RULE);
      }
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });
}

function codingRulesMissingTests(): void {
  it("throws when the named rule file does not exist", () => {
    const repoRoot = tempRepo();
    try {
      expect(() =>
        loadPrompts(processConfig(), repoRoot, {
          run: {} as RunConfig,
          repo: {
            baseBranch: "main",
            artifactRoot: ".factory/artifacts",
            setup: [],
            gates: [],
            codingRules: "missing.md",
          },
        }),
      ).toThrow("coding rules file not found");
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("is a config error when loadConfigs names a missing rule file", () => {
    const repoRoot = tempRepo();
    try {
      writeRepoYaml(repoRoot, "missing-rules.md");
      let caught: unknown;
      try {
        loadConfigs(repoRoot);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(ConfigError);
      expect((caught as ConfigError).report).toContain("codingRules");
      expect((caught as ConfigError).report).toContain("missing-rules.md");
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("loads a named rule file through loadConfigs and renders it", () => {
    const repoRoot = tempRepo();
    try {
      fs.writeFileSync(path.join(repoRoot, "custom.md"), CUSTOM_RULES);
      writeRepoYaml(repoRoot, "custom.md");
      const configs = loadConfigs(repoRoot);
      expect(configs.repo.codingRules).toBe("custom.md");
      const lib = loadPrompts(processConfig(), repoRoot, {
        run: {} as RunConfig,
        repo: configs.repo,
      });
      expect(lib.render("implementer", IMPLEMENTER_VARS)).toContain(
        "CUSTOM REPO RULES ONE",
      );
      expect(lib.render("reviewer", REVIEWER_VARS)).toContain(
        "CUSTOM REPO RULES ONE",
      );
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });
}
