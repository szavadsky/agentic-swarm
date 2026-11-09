import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import { createAjv } from "../src/core/config/ajv.js";
import { loadPipelineConfig } from "../src/core/config/loader.js";
import {
  loadCriteriaBundle,
  loadPromptLibrary,
  preflightPrompts,
} from "../src/core/prompts.js";
import { KNOWN_VARS, PROMPT_VAR_DESCRIPTIONS } from "../src/core/prompt-vars.js";
import { DEFAULT_RAISE_ALLOWLIST } from "../src/core/concerns.js";
import { createTmpRepo, type TmpRepo } from "./helpers/tmp-repo.js";
import { FakeHarness } from "../src/harness/fake/fake-harness.js";
import { runAgentStep } from "../src/core/flows/step-runner.js";
import { Repo } from "../src/core/git/repo.js";
import type { PipelineConfig, ProjectConfig } from "../src/core/artifacts.js";

/**
 * Human-involvement modes + concern thresholds (docs/factory.v2.md §18,
 * docs/adr/adr-humaninvolvement-config.md).
 *
 * Contract under test:
 * - `humanInvolvement` is a top-level pipeline key (autonomous|principal|
 *   detailed), defaulting to `autonomous`; `concerns` carries the raise
 *   allowlist plus digest/blocking severity thresholds.
 * - The default config ships commented presets for all three modes with a
 *   blocking table (which ADRs/concerns reach the human per mode).
 * - A terse `agents/criteria/human-involvement.md` fragment is registered under
 *   `criteria.human-involvement`; the active mode selects its `## <mode>`
 *   section plus the shared blocking table.
 * - `concernsYaml` is registered in KNOWN_VARS for every producer and triager
 *   fragment (develop-family, poc/test-assumptions/research, review/qa,
 *   plan-review, close-ups, architects); `humanInvolvementCriteria` is added
 *   only for triagers, which receive both vars when the engine renders a step.
 */

const pluginRoot = path.resolve(import.meta.dir, "..");
const defaultPipelinePath = path.join(pluginRoot, "config/pipeline.default.yaml");
const agentsDir = path.join(pluginRoot, "agents");

const MODES = ["autonomous", "principal", "detailed"] as const;

/**
 * Fragment matrix: every engine step that produces or triages concerns receives
 * hydrated open concerns. Only triagers (reviewers/architects/close-ups/qa) also
 * receive the human-involvement criteria; producers raise concerns but never
 * triage them.
 */
const CONCERN_FRAGMENTS = [
  "develop",
  "test-first",
  "simple-implement",
  "fix-round",
  "poc",
  "test-assumptions",
  "research",
  "review",
  "qa",
  "plan-review",
  "wave-close-up",
  "plan-close-up",
  "architect-plan",
  "architect-revise",
  "architect-resume",
  "architect-wave-report",
  "architect-closeup",
  "architect-consult-item",
  "architect-consult-nonitem",
];

const HUMAN_INVOLVEMENT_FRAGMENTS = new Set([
  "review",
  "qa",
  "plan-review",
  "wave-close-up",
  "plan-close-up",
  "architect-plan",
  "architect-revise",
  "architect-resume",
  "architect-wave-report",
  "architect-closeup",
  "architect-consult-item",
  "architect-consult-nonitem",
]);

const FRAGMENT_MATRIX: Record<string, string[]> = Object.fromEntries(
  CONCERN_FRAGMENTS.map((fragment) => [
    fragment,
    HUMAN_INVOLVEMENT_FRAGMENTS.has(fragment)
      ? ["humanInvolvementCriteria", "concernsYaml"]
      : ["concernsYaml"],
  ])
);

const CRITERIA_FIXTURE = `# Human involvement criteria

## Blocking table (ADRs and concerns)

| Mode | Blocking (needs human decision) | Remarkable (digest only) |
| --- | --- | --- |
| autonomous | high-severity blockers still blocked after unblocked work | everything else |
| principal | stack/layer, external interfaces, config shapes | internal choices |
| detailed | external-interface changes and major internal interfaces | minor internals |

## autonomous

AUTONOMOUS-ADR-RULE: block only explicit high-severity blockers that remain after unblocked work is done.

## principal

PRINCIPAL-ADR-RULE: block stack/layer, external-interface, config-shape, and major-class-role decisions.

## detailed

DETAILED-ADR-RULE: additionally block external-interface changes and major internal-interface changes.
`;

function writePipelineLayers(
  dir: string,
  project: Record<string, unknown>,
  task: Record<string, unknown>
): { repoRoot: string; taskYamlPath: string } {
  const factoryDir = path.join(dir, ".factory");
  fs.mkdirSync(factoryDir, { recursive: true });
  fs.writeFileSync(
    path.join(factoryDir, "pipeline.yaml"),
    yaml.stringify(project),
    "utf8"
  );
  const taskYamlPath = path.join(factoryDir, "task-pipeline.yaml");
  fs.writeFileSync(taskYamlPath, yaml.stringify(task), "utf8");
  return { repoRoot: dir, taskYamlPath };
}

describe("human-involvement pipeline configuration", () => {
  it("defaults to autonomous mode with concern raise/digest/blocking policy", () => {
    const { config } = loadPipelineConfig({ skipStructuralValidation: true });

    expect(config.humanInvolvement).toBe("autonomous");
    expect(config.concerns).toBeDefined();
    expect([...(config.concerns?.raiseAllowlist ?? [])].sort()).toEqual(
      [...DEFAULT_RAISE_ALLOWLIST].sort()
    );
    expect(config.concerns?.minDigestSeverity).toBe("medium");
    expect(config.concerns?.minBlockingSeverity).toBe("high");
  });

  it("layers humanInvolvement and concern thresholds through project and task configs", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "factory-mode-layers-"));
    try {
      const { repoRoot, taskYamlPath } = writePipelineLayers(
        tmp,
        {
          humanInvolvement: "principal",
          concerns: {
            raiseAllowlist: ["developer", "reviewer"],
            minDigestSeverity: "low",
          },
        },
        {
          humanInvolvement: "detailed",
          concerns: { minBlockingSeverity: "medium" },
        }
      );

      const { config } = loadPipelineConfig({
        repoRoot,
        taskYamlPath,
        skipStructuralValidation: true,
      });

      // Task layer wins over project layer; project layer wins over defaults.
      expect(config.humanInvolvement).toBe("detailed");
      expect(config.concerns?.raiseAllowlist).toEqual(["developer", "reviewer"]);
      expect(config.concerns?.minDigestSeverity).toBe("low");
      expect(config.concerns?.minBlockingSeverity).toBe("medium");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("applies overrides last and supports null deletion of concern keys", () => {
    const { config } = loadPipelineConfig({
      skipStructuralValidation: true,
      overrides: {
        humanInvolvement: "principal",
        concerns: {
          raiseAllowlist: ["architect"],
          minDigestSeverity: null,
        },
      },
    });

    expect(config.humanInvolvement).toBe("principal");
    expect(config.concerns?.raiseAllowlist).toEqual(["architect"]);
    expect(config.concerns && "minDigestSeverity" in config.concerns).toBe(false);
    expect(config.concerns?.minBlockingSeverity).toBe("high");
  });

  it("schema accepts all modes and thresholds, rejects unknown values, and stays closed at root", () => {
    const schema = JSON.parse(
      fs.readFileSync(path.join(pluginRoot, "config/schemas/pipeline.schema.json"), "utf8")
    );
    const validate = createAjv().compile(schema);
    const raw = yaml.parse(fs.readFileSync(defaultPipelinePath, "utf8"));

    for (const mode of MODES) {
      expect({ mode, ok: validate({ ...raw, humanInvolvement: mode }) }).toEqual({
        mode,
        ok: true,
      });
    }

    expect(
      validate({
        ...raw,
        concerns: {
          raiseAllowlist: ["developer", "reviewer"],
          minDigestSeverity: "medium",
          minBlockingSeverity: "high",
        },
      })
    ).toBe(true);

    expect(validate({ ...raw, humanInvolvement: "sometimes" })).toBe(false);
    expect(
      validate({ ...raw, concerns: { minBlockingSeverity: "critical" } })
    ).toBe(false);
    expect(validate({ ...raw, concerns: { raiseAllowlist: "developer" } })).toBe(false);
    expect(validate({ ...raw, unknownRootKey: true })).toBe(false);
  });

  it("ships commented autonomous/principal/detailed presets with a blocking table", () => {
    const text = fs.readFileSync(defaultPipelinePath, "utf8");
    const raw = yaml.parse(text);
    expect(raw.humanInvolvement).toBe("autonomous");

    // Strip YAML comment markers so preset bodies can be inspected as text.
    const commented = text
      .split("\n")
      .filter((line) => /^\s*#/.test(line))
      .map((line) => line.replace(/^\s*#\s?/, ""))
      .join("\n");

    for (const mode of MODES) {
      expect(commented).toMatch(new RegExp(`humanInvolvement:\\s*${mode}\\b`));
    }
    expect(commented).toMatch(/\|\s*Mode\s*\|/i);
    expect(commented).toMatch(/\|\s*Blocking\b/i);
    for (const mode of MODES) {
      expect(commented).toMatch(new RegExp(`\\|\\s*${mode}\\s*\\|`, "i"));
    }
    expect(commented).toMatch(/\bADR\b/);
  });

  it("registers a terse human-involvement criteria fragment and loads it", () => {
    const { config } = loadPipelineConfig({ skipStructuralValidation: true });
    const fragmentPath = config.criteria?.["human-involvement"];

    expect(typeof fragmentPath).toBe("string");
    expect(path.isAbsolute(fragmentPath!)).toBe(true);
    expect(fs.existsSync(fragmentPath!)).toBe(true);

    const text = fs.readFileSync(fragmentPath!, "utf8");
    for (const mode of MODES) {
      expect(text).toMatch(new RegExp(`^##\\s*${mode}\\b`, "m"));
      expect(text).toMatch(new RegExp(`\\|\\s*${mode}\\s*\\|`, "i"));
    }
    expect(text).toMatch(/\|\s*Mode\s*\|/i);
    expect(text).toMatch(/\|\s*Blocking\b/i);
    expect(text).toMatch(/\bADR\b/);
    expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(4096);

    const bundle = loadCriteriaBundle(config.criteria) as Record<string, string | undefined>;
    expect(typeof bundle.humanInvolvement).toBe("string");
    expect(bundle.humanInvolvement).toContain("Blocking table");
    expect(bundle.humanInvolvement).toContain("autonomous");
  });

  it("registers concernsYaml for producers and humanInvolvementCriteria for triagers", () => {
    for (const [fragment, vars] of Object.entries(FRAGMENT_MATRIX)) {
      for (const key of [fragment, `steps/${fragment}`]) {
        expect({ key, vars: KNOWN_VARS[key] }).toEqual({
          key,
          vars: expect.arrayContaining(vars),
        });
      }
    }

    // Producers raise concerns but never triage them: no involvement criteria.
    for (const fragment of CONCERN_FRAGMENTS.filter(
      (fragment) => !HUMAN_INVOLVEMENT_FRAGMENTS.has(fragment)
    )) {
      for (const key of [fragment, `steps/${fragment}`]) {
        expect(KNOWN_VARS[key]).toContain("concernsYaml");
        expect(KNOWN_VARS[key]).not.toContain("humanInvolvementCriteria");
      }
    }

    // Triage and infra stay outside the concern funnel entirely.
    for (const key of ["triage", "steps/triage", "infra", "steps/infra"]) {
      expect(KNOWN_VARS[key]).not.toContain("humanInvolvementCriteria");
      expect(KNOWN_VARS[key]).not.toContain("concernsYaml");
    }

    expect(PROMPT_VAR_DESCRIPTIONS.humanInvolvementCriteria).toBeTruthy();
    expect(PROMPT_VAR_DESCRIPTIONS.concernsYaml).toBeTruthy();
  });

  it("preflight accepts the new vars on matrix fragments and rejects them elsewhere", () => {
    const { config: pipeline } = loadPipelineConfig();
    const lib = loadPromptLibrary({ builtinDir: agentsDir });

    // The real pipeline stays green after the fragment/matrix wiring.
    expect(preflightPrompts(lib, pipeline)).toEqual([]);

    const matrixLib = loadPromptLibrary({
      builtinDir: agentsDir,
      overrides: {
        review:
          "Review {{assignment}} {{checks}} {{diff}} {{dispositionsCriteria}}\n" +
          "{{humanInvolvementCriteria}}\n{{concernsYaml}}",
      },
    });
    expect(preflightPrompts(matrixLib, pipeline)).toEqual([]);

    const producerLib = loadPromptLibrary({
      builtinDir: agentsDir,
      overrides: {
        "steps/develop": "Develop {{assignment}} {{target}} {{citations}} {{concernsYaml}}",
      },
    });
    expect(preflightPrompts(producerLib, pipeline)).toEqual([]);

    const nonMatrixLib = loadPromptLibrary({
      builtinDir: agentsDir,
      overrides: {
        "steps/triage": "Triage {{task}} {{intent}} {{triageCriteria}} {{concernsYaml}}",
      },
    });
    const errors = preflightPrompts(nonMatrixLib, pipeline);
    expect(errors.some((e) => e.includes('Unknown placeholder "concernsYaml"'))).toBe(true);
  });
});

describe("human-involvement mode switching at prompt time", () => {
  let tmpRepo: TmpRepo;
  let repoObj: Repo;
  let project: ProjectConfig;
  let worktreeRoot: string;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
    worktreeRoot = path.join(tmpRepo.dir + "-wt");
    fs.mkdirSync(worktreeRoot, { recursive: true });
    repoObj = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
    project = { orchestrationFolder: ".factory", worktreeRoot };
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  async function renderArchitectPlan(opts: {
    mode: (typeof MODES)[number];
    criteriaPath?: string;
    promptVars?: Record<string, string>;
  }): Promise<{ ok: boolean; prompt?: string; error?: string }> {
    const task = `mode-${opts.mode}`;
    const taskDir = path.join(tmpRepo.dir, ".factory", task);
    const recordsDir = path.join(taskDir, "runs");
    fs.mkdirSync(recordsDir, { recursive: true });

    const prompts = loadPromptLibrary({
      builtinDir: agentsDir,
      overrides: {
        "steps/architect-plan":
          "ARCHITECT CRITERIA:\n{{humanInvolvementCriteria}}\nCONCERNS:\n{{concernsYaml}}\n",
      },
    });
    const pipeline: PipelineConfig = {
      models: {
        roles: {
          workhorse: { model: "model-workhorse" },
          architect: { model: "model-architect" },
          simpler: { model: "model-simpler" },
        },
      },
      agents: { architect: { role: "architect" } },
      flows: { simple: { steps: [] }, story: {}, spike: {} },
      limits: {},
      humanInvolvement: opts.mode,
      ...(opts.criteriaPath
        ? { criteria: { "human-involvement": opts.criteriaPath } }
        : {}),
    };

    const harness = new FakeHarness();
    harness.scriptOutcome(`${task}/runs/architect-plan#a1`, {
      ok: true,
      data: { iteration: 1, milestones: [], itemOutlines: [] },
    });

    const res = await runAgentStep({
      task,
      stepId: "architect-plan",
      stepFragment: "steps/architect-plan",
      agent: "architect",
      cwd: tmpRepo.dir,
      taskWt: tmpRepo.dir,
      taskDir,
      recordsDir,
      repo: repoObj,
      harness,
      pipeline,
      project,
      prompts,
      promptVars: opts.promptVars ?? {},
    });

    const runCall = harness.calls.find((call) => call.type === "run");
    return {
      ok: res.ok,
      prompt: runCall && runCall.type === "run" ? runCall.run.prompt : undefined,
      error: res.meta?.error,
    };
  }

  it("selects the active mode section plus the shared ADR blocking table", async () => {
    const criteriaPath = path.join(tmpRepo.dir, "human-involvement.md");
    fs.writeFileSync(criteriaPath, CRITERIA_FIXTURE, "utf8");

    const autonomous = await renderArchitectPlan({ mode: "autonomous", criteriaPath });
    const detailed = await renderArchitectPlan({ mode: "detailed", criteriaPath });

    expect({ ok: autonomous.ok, error: autonomous.error }).toEqual({
      ok: true,
      error: undefined,
    });
    expect({ ok: detailed.ok, error: detailed.error }).toEqual({
      ok: true,
      error: undefined,
    });

    expect(autonomous.prompt).toContain("Blocking table (ADRs and concerns)");
    expect(autonomous.prompt).toContain("AUTONOMOUS-ADR-RULE");
    expect(autonomous.prompt).not.toContain("DETAILED-ADR-RULE");

    expect(detailed.prompt).toContain("Blocking table (ADRs and concerns)");
    expect(detailed.prompt).toContain("DETAILED-ADR-RULE");
    expect(detailed.prompt).not.toContain("AUTONOMOUS-ADR-RULE");
  });

  it("renders empty involvement criteria when no fragment is configured", async () => {
    const run = await renderArchitectPlan({ mode: "autonomous" });

    expect({ ok: run.ok, error: run.error }).toEqual({ ok: true, error: undefined });
    expect(run.prompt).toBeDefined();
    expect(run.prompt).not.toContain("ADR-RULE");
  });

  it("lets callers provide hydrated concernsYaml without dropping the criteria", async () => {
    const criteriaPath = path.join(tmpRepo.dir, "human-involvement.md");
    fs.writeFileSync(criteriaPath, CRITERIA_FIXTURE, "utf8");

    const run = await renderArchitectPlan({
      mode: "principal",
      criteriaPath,
      promptVars: { concernsYaml: "CALLER-CONCERNS: c-1 blocker" },
    });

    expect({ ok: run.ok, error: run.error }).toEqual({ ok: true, error: undefined });
    expect(run.prompt).toContain("CALLER-CONCERNS: c-1 blocker");
    expect(run.prompt).toContain("PRINCIPAL-ADR-RULE");
  });
});

describe("human-involvement criteria reach triager prompts", () => {
  it("renders sentinel criteria in every triage fragment of the matrix", () => {
    const lib = loadPromptLibrary({ builtinDir: agentsDir });
    const sentinel = "SENTINEL-HUMAN-INVOLVEMENT-CRITERIA";
    const fragments = [...HUMAN_INVOLVEMENT_FRAGMENTS].map(
      (fragment) => `steps/${fragment}`
    );
    for (const fragment of fragments) {
      const vars: Record<string, string> = {};
      for (const v of KNOWN_VARS[fragment] ?? []) vars[v] = `sample-${v}`;
      vars.humanInvolvementCriteria = sentinel;
      expect({ fragment, placeholders: lib.placeholders(fragment) }).toEqual({
        fragment,
        placeholders: expect.arrayContaining(["humanInvolvementCriteria"]),
      });
      expect({ fragment, rendered: lib.render(fragment, vars) }).toEqual({
        fragment,
        rendered: expect.stringContaining(sentinel),
      });
    }
  });
});
