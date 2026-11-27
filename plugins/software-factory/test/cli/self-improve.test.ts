import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { flowPromptFindings } from "../../src/cli/commands/validate-prompt-findings.js";
import { schemaFindings } from "../../src/cli/commands/validate-files.js";
import { type CliDeps, dispatch } from "../../src/cli/dispatch.js";
import {
  loadProcessConfig,
  processOverrideSchema,
} from "../../src/kernel/config.js";
import { requiredAliases } from "../../src/kernel/preflight/checks.js";
import { architectureFlowForReason } from "../../src/kernel/architect-flow.js";
import type { ArchitectureFlow } from "../../src/kernel/types.js";
import {
  MANIFEST,
  pluginManifestProblems,
} from "../../scripts/plugin-manifest.js";
import { testPriceSource } from "../helpers/price-source.js";
import { treeFile } from "../helpers/run-configs.js";
import { createTmpRepo } from "../helpers/tmp-repo.js";
import type { LaunchVisibility } from "./self-improve-launch.js";
import {
  launchHarness,
  packFile,
  writeLaunchRepo,
} from "./self-improve-launch.js";

/**
 * The plugin is a tree file, not a package file: the gate exports the package
 * alone and names the tree in FACTORY_TREE_ROOT, which is where the plugin sits.
 */
function pluginDir(): string {
  const dir = treeFile("plugins/self-improve");
  if (dir === undefined) throw new Error("tree carries no self-improve plugin");
  return dir;
}

const PLUGIN_DIR = pluginDir();
const SKILL_DIR = path.join(PLUGIN_DIR, "skills/run-self-improve");
const SKILL_FILE = path.join(SKILL_DIR, "SKILL.md");
const MANIFEST_FILE = path.join(PLUGIN_DIR, MANIFEST);

/** A fence's non-empty body lines, as the install test executes them. */
function fence(text: string, tag: string): string[] {
  const block = new RegExp("```" + tag + "\\n([\\s\\S]*?)\\n```").exec(text);
  if (!block) throw new Error(`skill has no ${tag} fence`);
  return block[1]!
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function stripFences(text: string): string {
  return text.replace(/```[^\n]*\n[\s\S]*?```/g, "");
}

function skillText(): string {
  return fs.readFileSync(SKILL_FILE, "utf8");
}

/**
 * Runs the skill's own install fence against a repo: the plugin's process
 * overlay and prompt land where the kernel loads them, so the test installs
 * exactly what the runbook tells an operator to copy.
 */
function installPlugin(repoDir: string): void {
  for (const line of fence(skillText(), "bash self-improve-install")) {
    const result = spawnSync("bash", ["-c", line], {
      cwd: PLUGIN_DIR,
      env: { ...process.env, PLUGIN: PLUGIN_DIR, REPO: repoDir },
      encoding: "utf8",
    });
    expect(`${line}: ${result.stderr}`).toBe(`${line}: `);
    expect(result.status).toBe(0);
  }
}

function stepIds(flow: ArchitectureFlow): string[] {
  return flow.steps.map((step) => step.id);
}

interface Started {
  dir: string;
  step: string;
  seq: number;
  iteration: number;
}

/** Every settled step's own start record, as the record store holds it. */
function readStarted(goalDir: string): Started[] {
  const recordsDir = path.join(goalDir, "records");
  return fs
    .readdirSync(recordsDir)
    .sort()
    .flatMap((name) => {
      const file = path.join(recordsDir, name, "started.yaml");
      if (!fs.existsSync(file)) return [];
      const data = yaml.parse(fs.readFileSync(file, "utf8")) as {
        step?: unknown;
        seq?: unknown;
        iteration?: unknown;
      };
      if (typeof data.step !== "string" || typeof data.seq !== "number") {
        throw new Error(`${file}: no step or sequence`);
      }
      return [
        {
          dir: name,
          step: data.step,
          seq: data.seq,
          iteration: typeof data.iteration === "number" ? data.iteration : 0,
        },
      ];
    });
}

function installTest(): void {
  it("installs as a plugin manifest that leaves the flow to its skill", () => {
    expect(pluginManifestProblems(PLUGIN_DIR)).toEqual([]);
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8"));
    expect(manifest.name).toBe("self-improve");
    expect(manifest.skills).toBe("./skills/");
    expect(fs.existsSync(SKILL_FILE)).toBe(true);
    for (const field of ["commands", "hooks", "mcpServers"]) {
      expect(manifest).not.toHaveProperty(field);
    }
  });
}

const OPERATOR_SURFACES: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: "role", pattern: /role/i },
  { label: "install", pattern: /install/i },
  { label: "stages", pattern: /stages/i },
  { label: "iteration", pattern: /iteration/i },
  { label: "triage", pattern: /triage/i },
  { label: "steers", pattern: /steers/i },
  { label: "recovery", pattern: /recovery/i },
  { label: "launches", pattern: /launches/i },
  { label: "pitfalls", pattern: /pitfalls/i },
];

/** Every one of the campaign's operator surfaces has a section of its own. */
function surfaceTest(): void {
  it("carries every operator surface of the campaign in the skill", () => {
    const skill = skillText();
    const sections = skill
      .split("\n")
      .filter((line) => line.startsWith("## "))
      .map((line) => line.slice(3).trim());
    expect(sections.length).toBeGreaterThan(0);
    for (const surface of OPERATOR_SURFACES) {
      expect(
        sections.some((section) => surface.pattern.test(section)),
        `${surface.label} has no section`,
      ).toBe(true);
    }
    // The skill names the files it ships, so a reader can wire them in.
    for (const file of [
      "config/process.yaml",
      "prompts/assess-run.md",
      "prompts/status-review.md",
    ]) {
      expect(skill).toContain(file);
      expect(fs.existsSync(path.join(PLUGIN_DIR, file))).toBe(true);
    }
    expect(skill).toContain("assess-run");
  });
}

/** Model and subscription names, read from the gate's own list. */
function machinePattern(): RegExp {
  const file = path.resolve(import.meta.dir, "../../config/real-names.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
    models: string[];
    providers: string[];
    subscriptions: string[];
  };
  const names = [...raw.models, ...raw.providers, ...raw.subscriptions];
  return new RegExp(
    names.map((name) => `(?<![A-Za-z0-9])${name}(?![A-Za-z0-9])`).join("|"),
    "i",
  );
}

/** Absolute roots and named models are the operator's, never the plugin's. */
function machineSpecificsTest(): void {
  it("keeps machine specifics inside the skill's example fences", () => {
    const skill = skillText();
    const prose = stripFences(skill);
    for (const marker of ["/home/", "~/.local", "worktreeRoot:"]) {
      expect(prose).not.toContain(marker);
    }
    expect(prose).not.toMatch(machinePattern());
    expect(fence(skill, "bash self-improve-example").join("\n")).toContain(
      "$HOME",
    );
    expect(fence(skill, "yaml self-improve-run-example").join("\n")).toMatch(
      /assess:/,
    );
    for (const file of [
      "config/process.yaml",
      "prompts/assess-run.md",
      "prompts/status-review.md",
    ]) {
      const text = fs.readFileSync(path.join(PLUGIN_DIR, file), "utf8");
      expect(text).not.toMatch(machinePattern());
    }
  });
}

/** The overlay is valid, every step's prompt resolves, and the reasons differ. */
function overlayTest(): void {
  it("ships a process overlay whose flows validate and resolve", () => {
    const repo = createTmpRepo();
    try {
      installPlugin(repo.dir);
      const processFile = path.join(repo.dir, ".factory/process.yaml");
      const text = fs.readFileSync(processFile, "utf8");
      expect(schemaFindings(text, processFile, processOverrideSchema)).toEqual(
        [],
      );
      const process = loadProcessConfig(repo.dir);
      expect(flowPromptFindings(process, processFile, repo.dir)).toEqual([]);
      expect(requiredAliases(process).has("assess")).toBe(true);
      expect(stepIds(architectureFlowForReason(process, "initial", 1))).toEqual(
        ["architect", "planreview", "pm"],
      );
      for (const reason of [
        "concerns",
        "iteration-done",
        "steer",
        "relaunch",
      ] as const) {
        expect(stepIds(architectureFlowForReason(process, reason, 2))).toEqual([
          "assess",
          "architect",
          "planreview",
          "pm",
        ]);
        expect(stepIds(architectureFlowForReason(process, reason, 3))).toEqual([
          "assess",
          "statusreview",
          "architect",
          "planreview",
          "pm",
        ]);
      }
    } finally {
      repo.cleanup();
    }
  });
}

function flowRotationTest(): void {
  it(
    "rotates the flows by iteration parity and adjudicates the odd review",
    async () => runsRotatingFlows(),
    150_000,
  );
}

/**
 * Three bounded launches: the initial consult, then one iteration of each
 * parity flow, so the scenario shows the even flow without the adversarial
 * review and the odd flow with it.
 */
async function runsRotatingFlows(): Promise<void> {
  const repo = createTmpRepo();
  const goalDir = path.join(repo.dir, ".factory/artifacts/demo");
  const taskDir = path.join(goalDir, "tasks");
  const seen: LaunchVisibility = {
    assessmentInPack: new Map(),
    statusReviewInPack: new Map(),
  };
  try {
    writeLaunchRepo(repo);
    installPlugin(repo.dir);
    const init = await captured(() =>
      dispatch([
        "init",
        "--repo",
        repo.dir,
        "--goal",
        "demo",
        "--intent",
        path.join(repo.dir, "INTENT.md"),
      ]),
    );
    expect(init.code, init.out).toBe(0);
    const args = [
      "run",
      "--repo",
      repo.dir,
      "--goal",
      "demo",
      "--run-config",
      path.join(repo.dir, ".factory/run.yaml"),
      "--iterations",
      "1",
    ];
    const deps = (): CliDeps => ({
      harnesses: { fake: launchHarness(goalDir, taskDir, seen) },
      priceSource: testPriceSource(repo.dir),
    });
    for (const launch of [1, 2, 3]) {
      const result = await captured(() => dispatch(args, deps()));
      expect(result.code, `launch ${launch}: ${result.out}`).toBe(3);
    }
    assertAssessmentTurn(goalDir, seen);
    assertFlowRotation(goalDir, seen);
  } finally {
    repo.cleanup();
  }
}

describe("self-improve plugin", () => {
  installTest();
  surfaceTest();
  machineSpecificsTest();
});

describe("self-improve flows", () => {
  overlayTest();
  flowRotationTest();
});

interface Captured {
  code: number;
  out: string;
}

/** Capture both streams: dispatch reports argument errors on stderr. */
async function captured(fn: () => Promise<number>): Promise<Captured> {
  const log = console.log;
  const error = console.error;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => lines.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) =>
    lines.push(args.map(String).join(" "));
  try {
    return { code: await fn(), out: lines.join("\n") };
  } finally {
    console.log = log;
    console.error = error;
  }
}

/** The configured flow steps one iteration settled, in record order. */
function flowSteps(started: Started[], iteration: number): string[] {
  const flow = new Set([
    "assess",
    "statusreview",
    "architect",
    "planreview",
    "pm",
  ]);
  return started
    .filter((record) => record.iteration === iteration && flow.has(record.step))
    .sort((a, b) => a.seq - b.seq)
    .map((record) => record.step);
}

function architectOf(started: Started[], iteration: number): Started {
  const architect = started.find(
    (record) => record.step === "architect" && record.iteration === iteration,
  );
  if (architect === undefined) {
    throw new Error(`iteration ${iteration} has no architect record`);
  }
  return architect;
}

function recordedOutcome(goalDir: string, record: Started): unknown {
  return yaml.parse(
    fs.readFileSync(
      path.join(goalDir, "records", record.dir, "outcome.yaml"),
      "utf8",
    ),
  );
}

/** Every post-initial consult assesses; the first has no previous run. */
function assertAssessmentTurn(goalDir: string, seen: LaunchVisibility): void {
  const started = readStarted(goalDir);
  const assessments = started.filter((record) => record.step === "assess");
  expect(assessments.map((record) => record.iteration)).toEqual([2, 3]);
  expect(assessments[0]!.seq).toBeLessThan(architectOf(started, 2).seq);
  expect(assessments[1]!.seq).toBeLessThan(architectOf(started, 3).seq);
  expect(seen.assessmentInPack.get(1)).toBe(false);
  expect(seen.assessmentInPack.get(2)).toBe(true);
  expect(seen.assessmentInPack.get(3)).toBe(true);
  for (const iteration of [2, 3]) {
    const assessment = path.join(
      goalDir,
      `iterations/${iteration}/assessment.md`,
    );
    expect(fs.readFileSync(assessment, "utf8")).toContain(
      "Previous-run assessment",
    );
    expect(fs.readFileSync(packFile(goalDir, iteration), "utf8")).toContain(
      `- assessment: ${assessment}`,
    );
  }
  const recorded = recordedOutcome(goalDir, assessments[0]!) as {
    summary?: string;
  };
  expect(recorded.summary).toContain("assessed the previous run");
}

/**
 * The initial flow runs alone; the even iteration keeps the architect's status
 * ownership; the odd iteration reviews it first and the architect answers every
 * number the review delivered.
 */
function assertFlowRotation(goalDir: string, seen: LaunchVisibility): void {
  const started = readStarted(goalDir);
  const initial = flowSteps(started, 1);
  expect(initial).toContain("architect");
  expect(initial).not.toContain("assess");
  expect(initial).not.toContain("statusreview");

  const even = flowSteps(started, 2);
  expect(even).toContain("assess");
  expect(even).not.toContain("statusreview");

  const odd = flowSteps(started, 3);
  expect(odd).toContain("assess");
  expect(odd).toContain("statusreview");
  expect(odd.indexOf("statusreview")).toBeGreaterThan(odd.indexOf("assess"));
  expect(odd.indexOf("statusreview")).toBeLessThan(odd.indexOf("architect"));

  expect(seen.statusReviewInPack.get(2)).toBe(false);
  expect(seen.statusReviewInPack.get(3)).toBe(true);
  const review = path.join(goalDir, "iterations/3/status-review.md");
  const reviewText = fs.readFileSync(review, "utf8");
  const findings = reviewText
    .split("\n")
    .filter((line) => /^\d+\.\s/.test(line));
  expect(findings.length).toBeGreaterThan(0);
  expect(fs.readFileSync(packFile(goalDir, 3), "utf8")).toContain(
    `- status review: ${review}`,
  );

  const answers = (
    recordedOutcome(goalDir, architectOf(started, 3)) as {
      statusReviewAnswers?: { finding: number; adjudication: string }[];
    }
  ).statusReviewAnswers;
  expect(answers?.map((answer) => answer.finding)).toEqual(
    findings.map((_line, index) => index + 1),
  );
  expect(answers?.map((answer) => answer.adjudication)).toEqual(
    findings.map((_line, index) => (index % 2 === 0 ? "upheld" : "dismissed")),
  );
  expect(
    (
      recordedOutcome(goalDir, architectOf(started, 2)) as Record<
        string,
        unknown
      >
    ).statusReviewAnswers,
  ).toBeUndefined();
}
