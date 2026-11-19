import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import type { z } from "zod";
import {
  ConfigError,
  loadProcessConfig,
  loadRunConfig,
  processConfigSchema,
  processOverrideSchema,
  repoConfigSchema,
} from "./kernel/config.js";
import { classSchema } from "./kernel/flow-context.js";
import { holdFileSchema } from "./kernel/mailbox.js";
import { parseOutcome } from "./kernel/outcome.js";
import { parseTaskFile, validateTaskGraph } from "./kernel/tasks.js";
import type { TaskTypeDefinition } from "./kernel/types.js";

let failed = false;
let checked = 0;
const missing: string[] = [];

function report(file: string, message: string): void {
  console.error(`${file}: ${message}`);
  failed = true;
}

function noteChecked(): void {
  checked += 1;
}

function validateYamlFile(file: string, schema: z.ZodType<unknown>): void {
  let raw: unknown;
  try {
    raw = yaml.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    report(file, `invalid YAML: ${(err as Error).message}`);
    return;
  }
  const result = schema.safeParse(raw ?? {});
  if (!result.success) {
    for (const issue of result.error.issues) {
      report(file, `${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    return;
  }
  noteChecked();
}

/**
 * A run config is validated through its `extends` chain, exactly as a launch
 * reads it: the merged layer, with findings naming the file that owns the key.
 */
function validateRunConfigFile(file: string): void {
  try {
    loadRunConfig(file);
  } catch (err) {
    if (err instanceof ConfigError) {
      for (const finding of err.findings) {
        report(finding.file, `${finding.key}: ${finding.message}`);
      }
    } else {
      report(file, (err as Error).message);
    }
    return;
  }
  noteChecked();
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
// override, bootstrap/run). A branch that changes a schema and migrates the
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

  if (fs.existsSync(treeFiles.run)) validateRunConfigFile(treeFiles.run);
  else missing.push(treeFiles.run);

  if (fs.existsSync(treeFiles.processOverride))
    validateYamlFile(treeFiles.processOverride, processOverrideSchema);
} else {
  missing.push(`${treeFactoryDir} (tree-level: repo/run config)`);
}

if (fs.existsSync(artifactFactoryDir)) {
  // The artifact checkout's merged process layer supplies the task types its
  // files name. Its repo/run files belong to another checkout, so only the
  // process layer is read; a broken process file is reported here too.
  let taskTypes: Record<string, TaskTypeDefinition> = {};
  try {
    taskTypes = loadProcessConfig(artifactRoot).taskTypes ?? {};
  } catch (err) {
    report(
      artifactFactoryDir,
      `task types unavailable: ${(err as Error).message}`,
    );
  }

  // Task files, grouped by their containing directory.
  const taskFiles = walk(artifactFactoryDir, (file) =>
    /\/tasks\/[^/]+\.md$/.test(file),
  );
  const byDir = new Map<string, string[]>();
  for (const file of taskFiles) {
    const dir = path.dirname(file);
    const list = byDir.get(dir) ?? [];
    list.push(file);
    byDir.set(dir, list);
  }
  for (const [dir, files] of byDir) {
    const tasks = [];
    for (const file of files.sort()) {
      try {
        tasks.push(
          parseTaskFile(
            fs.readFileSync(file, "utf8"),
            path.basename(file, ".md"),
            taskTypes,
          ),
        );
      } catch (err) {
        report(file, (err as Error).message);
        continue;
      }
      noteChecked();
    }
    if (tasks.length > 0) {
      const findings = validateTaskGraph(tasks);
      for (const finding of findings) report(dir, finding);
    }
  }

  // Pending-steer holds: one YAML per steer, written by the PM's steer turn.
  // Dotfiles are the writer's temp siblings, not holds `readHolds` would read.
  for (const file of walk(
    artifactFactoryDir,
    (f) =>
      /\/mailbox\/holds\/[^/]+\.ya?ml$/.test(f) &&
      !path.basename(f).startsWith("."),
  )) {
    validateYamlFile(file, holdFileSchema);
  }

  // Class files.
  for (const file of walk(
    artifactFactoryDir,
    (f) => path.basename(f) === "class.yaml",
  )) {
    validateYamlFile(file, classSchema);
  }

  // Outcome files.
  for (const file of walk(
    artifactFactoryDir,
    (f) => path.basename(f) === "outcome.yaml",
  )) {
    try {
      parseOutcome(fs.readFileSync(file, "utf8"));
    } catch (err) {
      report(file, (err as Error).message);
      continue;
    }
    noteChecked();
  }
} else {
  missing.push(
    `${artifactFactoryDir} (artifact-level: tasks, class, outcomes)`,
  );
}

// Run-config library shipped by the tree under test, one run layer per file.
const runConfigDir = path.join(treeRoot, "bootstrap", "run");
const runConfigs = walk(
  runConfigDir,
  (f) => f.endsWith(".yaml") || f.endsWith(".yml"),
);
if (runConfigs.length > 0) {
  for (const file of runConfigs.sort()) validateRunConfigFile(file);
}

// The kernel's explicit run-config path, when the operator set one.
const envRunConfig = process.env.FACTORY_RUN_CONFIG;
if (envRunConfig) {
  const file = path.resolve(treeRoot, envRunConfig);
  if (runConfigs.includes(file)) {
    // Already validated by the bootstrap/run walk.
  } else if (fs.existsSync(file)) {
    validateRunConfigFile(file);
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
