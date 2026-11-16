import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadPromptLibrary, loadPrompts } from "../src/kernel/prompts.js";
import type { ProcessConfig } from "../src/kernel/types.js";

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
      "# Develop\nTask: {{task}}\n{% include '_shared/containment' %}\n",
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

  it("lets the process config replace the calibration partial", () => {
    const process = {
      flows: {},
      roles: {},
      itemTurns: 8,
      calibration: "CUSTOM CALIBRATION",
    } as ProcessConfig;
    const lib = loadPrompts(process, dir);
    expect(lib.render("calibration", {})).toBe("CUSTOM CALIBRATION");
    // Built-ins still render when the process config sets no calibration.
    const builtin = loadPrompts(
      { flows: {}, roles: {}, itemTurns: 8 } as ProcessConfig,
      dir,
    );
    expect(builtin.render("calibration", {})).toContain(
      "A concern is a recorded debt",
    );
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
});
