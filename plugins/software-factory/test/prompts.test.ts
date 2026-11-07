import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadPromptLibrary, preflightPrompts } from "../src/core/prompts.js";
import { loadPipelineConfig } from "../src/core/config/loader.js";
import type { PipelineConfig } from "../src/core/artifacts.js";

describe("prompts: PromptLibrary & preflightPrompts", () => {
  const builtinDir = path.resolve("agents");

  it("loads agent definition with frontmatter tools, description, and body", () => {
    const lib = loadPromptLibrary({ builtinDir });
    const def = lib.agentDefinition("developer");

    expect(def.tools).toContain("read");
    expect(def.tools).toContain("edit");
    expect(def.tools).toContain("write");
    expect(def.description).toContain("Autonomous software developer");
    expect(def.body).toContain("# Developer Agent");
    // Verify that include was resolved inside developer body
    expect(def.body).toContain("Software Factory Engineering Philosophy");
  });

  it("resolves shared includes {{> _shared/name}} in step fragments", () => {
    const lib = loadPromptLibrary({ builtinDir });
    const rendered = lib.render("steps/develop", {
      assignment: "Build feature X",
      target: "Unit tests",
      citations: "src/index.ts:1-10",
    });

    expect(rendered).toContain("Build feature X");
    expect(rendered).toContain("Software Factory Engineering Philosophy");
  });

  it("throws with descriptive error listing missing variables when render fails", () => {
    const lib = loadPromptLibrary({ builtinDir });

    expect(() => {
      lib.render("steps/develop", {
        assignment: "Only assignment provided",
      });
    }).toThrow(/Missing required prompt variables for "steps\/develop": target, citations/);
  });

  it("overrides directory shadows builtin directory", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "prompt-overrides-"));
    try {
      const customDeveloper = path.join(tempDir, "developer.md");
      fs.writeFileSync(
        customDeveloper,
        `---
name: developer
description: Custom overridden developer
tools:
  - read
---
# Overridden Developer Body
`
      );

      const lib = loadPromptLibrary({
        builtinDir,
        overrideDirs: [tempDir],
      });

      const def = lib.agentDefinition("developer");
      expect(def.description).toBe("Custom overridden developer");
      expect(def.tools).toEqual(["read"]);
      expect(def.body).toContain("# Overridden Developer Body");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("in-memory overrides shadow both override directories and builtin", () => {
    const lib = loadPromptLibrary({
      builtinDir,
      overrides: {
        "steps/develop": "Custom Develop Step: {{assignment}} and {{customVar}}",
      },
    });

    const placeholders = lib.placeholders("steps/develop");
    expect(placeholders).toEqual(["assignment", "customVar"]);

    const rendered = lib.render("steps/develop", {
      assignment: "Task 1",
      customVar: "Value 2",
    });
    expect(rendered).toBe("Custom Develop Step: Task 1 and Value 2");
  });

  it("preflight passes with zero errors on real pipeline.default.yaml", () => {
    const { config: pipeline } = loadPipelineConfig();
    const lib = loadPromptLibrary({ builtinDir });

    const errors = preflightPrompts(lib, pipeline);
    expect(errors).toEqual([]);
  });

  it("preflight flags unknown agent definitions", () => {
    const { config: basePipeline } = loadPipelineConfig();
    const pipelineWithBadAgent: PipelineConfig = {
      ...basePipeline,
      agents: {
        ...basePipeline.agents,
        "phantom-agent": { role: "workhorse" },
      },
    };

    const lib = loadPromptLibrary({ builtinDir });
    const errors = preflightPrompts(lib, pipelineWithBadAgent);

    expect(errors.some((e) => e.includes('Agent definition "phantom-agent" not found'))).toBe(true);
  });

  it("preflight flags unknown step fragments", () => {
    const { config: basePipeline } = loadPipelineConfig();
    const pipelineWithBadStep: PipelineConfig = {
      ...basePipeline,
      flows: {
        ...basePipeline.flows,
        simple: {
          steps: [
            {
              id: "non-existent-step",
              agent: "developer",
              stepFragment: "ghost-fragment",
            },
          ],
        },
      },
    };

    const lib = loadPromptLibrary({ builtinDir });
    const errors = preflightPrompts(lib, pipelineWithBadStep);

    expect(
      errors.some((e) =>
        e.includes('Step fragment "ghost-fragment" for step "non-existent-step" not found')
      )
    ).toBe(true);
  });

  it("preflight flags unknown placeholders that the engine does not supply", () => {
    const { config: basePipeline } = loadPipelineConfig();
    const lib = loadPromptLibrary({
      builtinDir,
      overrides: {
        "steps/simple-implement": "Step with unsupplied placeholder: {{hallucinatedVar}} {{intent}} {{citations}}",
      },
    });

    const errors = preflightPrompts(lib, basePipeline);
    expect(
      errors.some((e) =>
        e.includes('Unknown placeholder "hallucinatedVar" in fragment "simple-implement"')
      )
    ).toBe(true);
  });
});
