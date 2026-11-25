/**
 * The schema-validation gate: walk the schema-enforced files and run the one
 * check list `factory validate` also reads (`cli/commands/validate-files.ts`),
 * so the gate and an agent's `validate` command agree on what is invalid.
 */

import fs from "node:fs";
import path from "node:path";
import type { z } from "zod";
import {
  fileFindings,
  runConfigFindings,
  schemaFindings,
  taskDirFindings,
} from "./cli/commands/validate-files.js";
import type { ValidateKind } from "./cli/commands/types.js";
import {
  loadProcessConfig,
  processConfigSchema,
  processOverrideSchema,
  repoConfigSchema,
} from "./kernel/config.js";
import type { ProcessConfig } from "./kernel/types.js";

let failed = false;
let checked = 0;
const missing: string[] = [];

/** Task types and flows; the tree's merged process layer, empty when unreadable. */
let taskConfig: Pick<ProcessConfig, "taskTypes" | "flows"> = {
  taskTypes: {},
  flows: {},
};

function report(line: string): void {
  console.error(line);
  failed = true;
}

/** Reports one file's findings and counts it valid only when it has none. */
function reportFindings(findings: string[]): void {
  for (const finding of findings) report(finding);
  if (findings.length === 0) checked += 1;
}

function validateYamlFile(file: string, schema: z.ZodType<unknown>): void {
  reportFindings(schemaFindings(fs.readFileSync(file, "utf8"), file, schema));
}

/** One file through the shared check list. */
async function checkKind(
  file: string,
  kind: Parameters<typeof fileFindings>[0]["kind"],
): Promise<void> {
  reportFindings(
    await fileFindings({
      file,
      text: fs.readFileSync(file, "utf8"),
      kind,
      process: () => taskConfig,
      flows: false,
    }),
  );
}

function walk(dir: string, predicate: (file: string) => boolean): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, predicate));
    else if (entry.isFile() && predicate(full)) out.push(full);
  }
  return out;
}

// Package-local schema-enforced files.
const packageRoot = process.cwd();
const processFile = path.join(packageRoot, "config", "process.yaml");
if (fs.existsSync(processFile)) {
  validateYamlFile(processFile, processConfigSchema);
} else {
  missing.push(processFile);
}

// Repository-level schema-enforced files. gates.sh exports the package alone,
// so both roots arrive in the environment: FACTORY_REPO_ROOT carries the
// artifact checkout (tasks, class, outcomes) while FACTORY_TREE_ROOT carries
// the git toplevel of the tree under test (repo/run config, process
// override). A branch that changes a schema and migrates the
// tree-owned files stays green; the base checkout's unmigrated copies are
// not the tree's. A direct run from the package resolves both roots from
// the package location.
const artifactRoot =
  process.env.FACTORY_REPO_ROOT ?? path.resolve(packageRoot, "..", "..");
const treeRoot = process.env.FACTORY_TREE_ROOT ?? artifactRoot;
const treeFactoryDir = path.join(treeRoot, ".factory");
const artifactFactoryDir = path.join(artifactRoot, ".factory");
const treeFiles = {
  repo: path.join(treeFactoryDir, "repo.yaml"),
  run: path.join(treeFactoryDir, "run.yaml"),
  processOverride: path.join(treeFactoryDir, "process.yaml"),
};

if (fs.existsSync(treeFactoryDir)) {
  if (fs.existsSync(treeFiles.repo))
    validateYamlFile(treeFiles.repo, repoConfigSchema);
  else missing.push(treeFiles.repo);

  if (fs.existsSync(treeFiles.run)) {
    reportFindings(runConfigFindings(treeFiles.run));
  } else missing.push(treeFiles.run);

  if (fs.existsSync(treeFiles.processOverride))
    validateYamlFile(treeFiles.processOverride, processOverrideSchema);
} else {
  missing.push(`${treeFactoryDir} (tree-level: repo/run config)`);
}

if (fs.existsSync(artifactFactoryDir)) {
  // The artifact checkout's merged process layer supplies the task types its
  // files name. Its repo/run files belong to another checkout, so only the
  // process layer is read; a broken process file is reported here too.
  try {
    const processConfig = loadProcessConfig(artifactRoot);
    taskConfig = {
      taskTypes: processConfig.taskTypes ?? {},
      flows: processConfig.flows,
    };
  } catch (err) {
    report(
      `${artifactFactoryDir}: task types unavailable: ${(err as Error).message}`,
    );
  }

  // Task files, grouped by their containing directory.
  const taskFiles = walk(artifactFactoryDir, (file) =>
    /\/tasks\/[^/]+\.md$/.test(file),
  );
  const taskDirs = [
    ...new Set(taskFiles.map((file) => path.dirname(file))),
  ].sort();
  for (const dir of taskDirs) {
    const result = await taskDirFindings(dir, taskConfig.taskTypes);
    for (const finding of result.findings) report(finding);
    checked += result.checked;
  }

  // Holds are one YAML per steer or open concern; dotfiles are the writer's
  // temp siblings, not holds `readHolds` would read.
  const artifactChecks: {
    pattern: RegExp;
    kind: ValidateKind;
    skipDot?: true;
  }[] = [
    { pattern: /\/mailbox\/holds\/[^/]+\.ya?ml$/, kind: "hold", skipDot: true },
    { pattern: /\/class\.yaml$/, kind: "class" },
    { pattern: /\/infra\.yaml$/, kind: "infra" },
    { pattern: /\/outcome\.yaml$/, kind: "outcome" },
  ];
  for (const { pattern, kind, skipDot } of artifactChecks) {
    for (const file of walk(
      artifactFactoryDir,
      (f) => pattern.test(f) && !(skipDot && path.basename(f).startsWith(".")),
    )) {
      await checkKind(file, kind);
    }
  }
} else {
  missing.push(
    `${artifactFactoryDir} (artifact-level: tasks, class, infra, outcomes)`,
  );
}

// The kernel's explicit run-config path, when the operator set one.
const envRunConfig = process.env.FACTORY_RUN_CONFIG;
if (envRunConfig) {
  const file = path.resolve(treeRoot, envRunConfig);
  if (fs.existsSync(file)) {
    reportFindings(runConfigFindings(file));
  } else {
    missing.push(`${file} (FACTORY_RUN_CONFIG)`);
  }
}

const scope =
  treeRoot === artifactRoot
    ? artifactRoot
    : `tree ${treeRoot}, artifacts ${artifactRoot}`;
console.log(
  `schema-check: ${checked} schema-enforced file(s) valid under ${scope}`,
);
for (const entry of missing) console.log(`schema-check: not present: ${entry}`);

if (failed) process.exit(1);
