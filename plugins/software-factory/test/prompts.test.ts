import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  loadPromptLibrary,
  preflightPrompts,
  loadCriteriaBundle,
  formatDispositionsSection,
  ENGINE_STEP_FRAGMENTS,
} from "../src/core/prompts.js";
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

  it("step fragments no longer duplicate agent-level shared includes", () => {
    const lib = loadPromptLibrary({ builtinDir });
    const rendered = lib.render("steps/develop", {
      assignment: "Build feature X",
      target: "Unit tests",
      citations: "src/index.ts:1-10",
    });

    expect(rendered).toContain("Build feature X");
    // Philosophy lives in the agent definition now, not the step fragment.
    expect(rendered).not.toContain("Software Factory Engineering Philosophy");
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

  it("preflight covers every engine-invoked orchestration fragment", () => {
    const { config: pipeline } = loadPipelineConfig();
    const lib = loadPromptLibrary({ builtinDir });

    // Baseline: all engine fragments present and valid.
    expect(preflightPrompts(lib, pipeline)).toEqual([]);
    expect(ENGINE_STEP_FRAGMENTS).toContain("steps/triage");
    expect(ENGINE_STEP_FRAGMENTS).toContain("steps/infra");
    expect(ENGINE_STEP_FRAGMENTS).toContain("steps/integrate");

    // Break one engine fragment via override: unknown placeholder must fail preflight.
    const broken = loadPromptLibrary({
      builtinDir,
      overrides: {
        "steps/integrate": "Broken integrate: {{item}} {{diff}} {{noSuchVar}}",
      },
    });
    const errors = preflightPrompts(broken, pipeline);
    expect(
      errors.some((e) => e.includes('Unknown placeholder "noSuchVar"'))
    ).toBe(true);
  });

  it("preflight render check fails when a fragment needs vars outside KNOWN_VARS", () => {
    const { config: pipeline } = loadPipelineConfig();
    // Override renders only if supplied vars cover all placeholders; the render
    // check supplies exactly KNOWN_VARS entries, so an extra placeholder fails.
    const lib = loadPromptLibrary({
      builtinDir,
      overrides: {
        "steps/qa":
          "QA: {{assignment}} {{checks}} {{testDiff}} {{diff}} {{dispositionsCriteria}} {{stowaway}}",
      },
    });
    const errors = preflightPrompts(lib, pipeline);
    expect(errors.some((e) => e.includes('Unknown placeholder "stowaway"'))).toBe(true);
    expect(errors.some((e) => e.includes("Render check failed"))).toBe(true);
  });

  it("loadCriteriaBundle reads declared criteria files and skips missing ones", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "criteria-"));
    try {
      const triagePath = path.join(tempDir, "triage.md");
      fs.writeFileSync(triagePath, "# Triage criteria\n");
      const bundle = loadCriteriaBundle(
        {
          triage: triagePath,
          dispositions: path.join(tempDir, "missing.md"),
          "story-kinds": "",
        },
      );
      expect(bundle.triage).toContain("Triage criteria");
      expect(bundle.dispositions).toBeUndefined();
      expect(bundle.storyKinds).toBeUndefined();
      expect(loadCriteriaBundle(undefined)).toEqual({});
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("formatDispositionsSection lists allowed set and filters human-stop", () => {
    const criteria = [
      "| `fix` | defect | loop |",
      "| `human-stop` | critical | halt |",
    ].join("\n");
    const without = formatDispositionsSection(criteria, ["fix", "optional"]);
    expect(without).toContain("Allowed dispositions for this review: fix, optional.");
    expect(without).toContain("`fix`");
    expect(without).not.toContain("human-stop");

    const withStop = formatDispositionsSection(criteria, ["fix", "human-stop"]);
    expect(withStop).toContain("human-stop");
  });

  it("close-up step fragments bind to closeup schemas, not the review shape", () => {
    const lib = loadPromptLibrary({ builtinDir });
    const wave = lib.render("steps/wave-close-up", {
      task: "t",
      waveReport: "w",
      infra: "i",
    });
    expect(wave).toContain("wave-closeup.schema.json");
    expect(wave).not.toContain("suggestions");

    const plan = lib.render("steps/plan-close-up", {
      intent: "i",
      plan: "p",
      context: "c",
    });
    expect(plan).toContain("plan-closeup.schema.json");
    expect(plan).not.toContain("suggestions");
  });

  it("review-type step fragments consume dispositionsCriteria", () => {
    const lib = loadPromptLibrary({ builtinDir });
    for (const frag of ["steps/review", "steps/qa", "steps/plan-review"]) {
      expect(lib.placeholders(frag)).toContain("dispositionsCriteria");
    }
    expect(lib.placeholders("steps/pm-edits")).toContain("storyKindsCriteria");
    expect(lib.placeholders("steps/pm-single-item")).toContain("storyKindsCriteria");
  });
});
