import { spawnSync } from "node:child_process";
import path from "node:path";
import { duplicateHelperProblems } from "./duplicate-helpers.js";
import { pluginManifestProblems } from "./plugin-manifest.js";
import { promptProblems } from "./prompt-lint.js";

/**
 * The lint gate. A red record keeps only the tail of the gate output
 * (`GATE_OUTPUT_CAP`), and the report's diagnostic cap can drop the errors
 * entirely, as the lint-ratchet merge-checks log did. The error-only pass
 * repeats them at the end, uncapped, so a capped tail holds them. It runs even
 * when the report is red: that red run is exactly when they must survive.
 */
const ROOT = path.resolve(process.argv[2] ?? path.join(import.meta.dir, ".."));
const BIN = path.join(ROOT, "node_modules", ".bin");
const problems = [
  ...promptProblems(ROOT),
  ...duplicateHelperProblems(ROOT),
  ...pluginManifestProblems(ROOT),
];
for (const problem of problems) console.error(problem);

function run(command: string, args: readonly string[]): number {
  const result = spawnSync(command, [...args], {
    cwd: ROOT,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

const report = run(path.join(BIN, "biome"), ["lint", "."]);
const errors = run(path.join(BIN, "biome"), [
  "lint",
  ".",
  "--diagnostic-level=error",
  "--max-diagnostics=none",
]);
if (report !== 0 || errors !== 0) process.exit(report || errors);

const knip = run(path.join(BIN, "knip"), []);
if (knip !== 0 || problems.length > 0) process.exit(1);
