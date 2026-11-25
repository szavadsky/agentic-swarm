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
import type { ArchitectureFlow } from "../../src/kernel/types.js";
import {
  MANIFEST,
  pluginManifestProblems,
} from "../../scripts/plugin-manifest.js";
import { testPriceSource } from "../helpers/price-source.js";
import { treeFile } from "../helpers/run-configs.js";
import { createTmpRepo } from "../helpers/tmp-repo.js";
import type { AssessmentVisibility } from "./self-improve-launch.js";
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

/** The flow a launch reason selects, or a failure naming the missing reason. */
function flowFor(
  flows: readonly ArchitectureFlow[],
  reason: ArchitectureFlow["when"][number],
): ArchitectureFlow {
  const flow = flows.find((entry) => entry.when.includes(reason));
  if (!flow) throw new Error(`no architecture flow for reason ${reason}`);
  return flow;
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
    // The skill names the two files it ships, so a reader can wire them in.
    for (const file of ["config/process.yaml", "prompts/assess-run.md"]) {
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
    for (const file of ["config/process.yaml", "prompts/assess-run.md"]) {
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
      const flows = process.architecture.flows ?? [];
      expect(stepIds(flowFor(flows, "initial"))).toEqual([
        "architect",
        "planreview",
        "pm",
      ]);
      for (const reason of [
        "concerns",
        "iteration-done",
        "steer",
        "relaunch",
      ] as const) {
        expect(stepIds(flowFor(flows, reason))).toEqual([
          "assess",
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

function assessmentTest(): void {
  it(
    "runs the previous-run assessment before the architect on a relaunch",
    async () => runsTwoLaunches(),
    90_000,
  );
}

/** A first launch ends at the iteration limit; the relaunch assesses it. */
async function runsTwoLaunches(): Promise<void> {
  const repo = createTmpRepo();
  const goalDir = path.join(repo.dir, ".factory/artifacts/demo");
  const taskDir = path.join(goalDir, "tasks");
  const seen: AssessmentVisibility = { assessmentInPack: new Map() };
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
    const first = await captured(() => dispatch(args, deps()));
    expect(first.code, first.out).toBe(3);
    const second = await captured(() => dispatch(args, deps()));
    expect(second.code, second.out).toBe(3);
    assertAssessmentTurn(goalDir, seen);
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
  assessmentTest();
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

function assertAssessmentTurn(
  goalDir: string,
  seen: AssessmentVisibility,
): void {
  const started = readStarted(goalDir);
  const assessments = started.filter((record) => record.step === "assess");
  expect(assessments.map((record) => record.iteration)).toEqual([2]);
  const architecture = started.find(
    (record) => record.step === "architect" && record.iteration === 2,
  );
  expect(architecture).toBeDefined();
  expect(assessments[0]!.seq).toBeLessThan(architecture!.seq);
  expect(seen.assessmentInPack.get(1)).toBe(false);
  expect(seen.assessmentInPack.get(2)).toBe(true);
  const assessment = path.join(goalDir, "iterations/2/assessment.md");
  expect(fs.readFileSync(assessment, "utf8")).toContain(
    "Previous-run assessment",
  );
  expect(fs.readFileSync(packFile(goalDir, 2), "utf8")).toContain(
    `- assessment: ${assessment}`,
  );
  const outcomeFile = path.join(
    goalDir,
    "records",
    assessments[0]!.dir,
    "outcome.yaml",
  );
  const recorded = yaml.parse(fs.readFileSync(outcomeFile, "utf8"));
  expect(recorded.summary).toContain("assessed the previous run");
}
