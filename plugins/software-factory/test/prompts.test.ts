import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadPromptLibrary } from "../src/core/prompts.js";

describe("prompts: PromptLibrary", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "prompts-test-"));
    fs.mkdirSync(path.join(dir, "_shared"), { recursive: true });
    fs.mkdirSync(path.join(dir, "steps"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "_shared", "containment.md"),
      "Workspace Containment: stay inside the worktree.",
    );
    fs.writeFileSync(
      path.join(dir, "steps", "develop.md"),
      "# Develop\nTask: {{task}}\n{{> _shared/containment}}\n",
    );
    fs.writeFileSync(
      path.join(dir, "developer.md"),
      "---\ndescription: implements tasks\ntools: [read, edit]\n---\nImplement {{task}}.\n",
    );
    fs.writeFileSync(
      path.join(dir, "yield-only.md"),
      "---\ntools: []\n---\nPM only.\n",
    );
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("renders includes and leaves no unresolved variables", () => {
    const lib = loadPromptLibrary({ builtinDir: dir });
    expect(lib.render("steps/develop", { task: "add auth" })).toContain(
      "Task: add auth",
    );
    expect(lib.render("steps/develop", { task: "add auth" })).toContain(
      "Workspace Containment",
    );
  });

  it("throws for a missing variable and reports placeholders", () => {
    const lib = loadPromptLibrary({ builtinDir: dir });
    expect(lib.placeholders("steps/develop")).toEqual(["task"]);
    expect(() => lib.render("steps/develop", {})).toThrow(
      "Missing required prompt variables",
    );
    expect(() => lib.render("steps/missing", {})).toThrow("not found");
  });

  it("resolves agent frontmatter and explicit empty tools", () => {
    const lib = loadPromptLibrary({ builtinDir: dir });
    expect(lib.agentDefinition("developer")).toEqual({
      body: expect.stringContaining("Implement {{task}}."),
      tools: ["read", "edit"],
      description: "implements tasks",
    });
    expect(lib.agentDefinition("yield-only").tools).toEqual([]);
  });

  it("lets an override directory shadow the built-in fragment", () => {
    const overrideDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompts-override-"),
    );
    try {
      fs.mkdirSync(path.join(overrideDir, "steps"), { recursive: true });
      fs.writeFileSync(
        path.join(overrideDir, "steps", "develop.md"),
        "override {{task}}",
      );
      const lib = loadPromptLibrary({
        builtinDir: dir,
        overrideDirs: [overrideDir],
      });
      expect(lib.render("steps/develop", { task: "x" })).toBe("override x");
    } finally {
      fs.rmSync(overrideDir, { recursive: true, force: true });
    }
  });

  it("appends a formatted output-schema section only when a schema is given", () => {
    const lib = loadPromptLibrary({ builtinDir: dir });
    expect(lib.renderStepPrompt("steps/develop", { task: "x" })).toContain(
      "Task: x",
    );
    const withSchema = lib.renderStepPrompt(
      "steps/develop",
      { task: "x" },
      {
        type: "object",
        properties: { status: { const: "done" } },
      },
    );
    expect(withSchema).toContain("## Output");
    expect(withSchema).toContain("status");
  });
});
