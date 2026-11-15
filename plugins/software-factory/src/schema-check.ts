import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { z } from "zod";
import {
  processConfigSchema,
  repoConfigSchema,
  runConfigSchema,
} from "./kernel/config.js";
import { parseTaskFile, validateTaskGraph } from "./kernel/tasks.js";
import { parseOutcome } from "./kernel/outcome.js";
import { classSchema } from "./kernel/flow-context.js";

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
// so the invoking repo's root arrives in FACTORY_REPO_ROOT; a direct run from
// the package resolves it from the package location.
const repoRoot =
  process.env.FACTORY_REPO_ROOT ?? path.resolve(packageRoot, "..", "..");
const factoryDir = path.join(repoRoot, ".factory");
const repoFiles = {
  repo: path.join(factoryDir, "repo.yaml"),
  run: path.join(factoryDir, "run.yaml"),
  processOverride: path.join(factoryDir, "process.yaml"),
};

if (fs.existsSync(factoryDir)) {
  if (fs.existsSync(repoFiles.repo))
    validateYamlFile(repoFiles.repo, repoConfigSchema);
  else missing.push(repoFiles.repo);

  if (fs.existsSync(repoFiles.run))
    validateYamlFile(repoFiles.run, runConfigSchema);
  else missing.push(repoFiles.run);

  if (fs.existsSync(repoFiles.processOverride))
    validateYamlFile(repoFiles.processOverride, processConfigSchema);

  // Task files, grouped by their containing directory.
  const taskFiles = walk(factoryDir, (file) =>
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

  // Class files.
  for (const file of walk(
    factoryDir,
    (f) => path.basename(f) === "class.yaml",
  )) {
    validateYamlFile(file, classSchema);
  }

  // Outcome files.
  for (const file of walk(
    factoryDir,
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
    `${factoryDir} (repo-level: repo/run config, tasks, class, outcomes)`,
  );
}

// Run-config library shipped by the repo, one run layer per file.
const runConfigDir = path.join(repoRoot, "bootstrap", "run");
const runConfigs = walk(
  runConfigDir,
  (f) => f.endsWith(".yaml") || f.endsWith(".yml"),
);
if (runConfigs.length > 0) {
  for (const file of runConfigs.sort()) validateYamlFile(file, runConfigSchema);
}

// The kernel's explicit run-config path, when the operator set one.
const envRunConfig = process.env.FACTORY_RUN_CONFIG;
if (envRunConfig) {
  const file = path.resolve(repoRoot, envRunConfig);
  if (runConfigs.includes(file)) {
    // Already validated by the bootstrap/run walk.
  } else if (fs.existsSync(file)) {
    validateYamlFile(file, runConfigSchema);
  } else {
    missing.push(`${file} (FACTORY_RUN_CONFIG)`);
  }
}

console.log(
  `schema-check: ${checked} schema-enforced file(s) valid under ${repoRoot}`,
);
for (const entry of missing) console.log(`schema-check: not present: ${entry}`);

if (failed) process.exit(1);
