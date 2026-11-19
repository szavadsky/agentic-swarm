// biome-ignore-all lint/complexity: split-rest
import { git } from "../core/git/exec.js";
import type { CheckResult } from "../core/checks/types.js";
import type { KernelRuntime } from "./types.js";
import fs from "node:fs";
import path from "node:path";

export async function runCleanlinessCheck(
  runtime: KernelRuntime,
  cwd: string,
  base: string,
): Promise<CheckResult> {
  const config = runtime.configs.repo.cleanliness;
  if (!config) {
    return {
      name: "cleanliness",
      ok: true,
      summary: "pass",
      output: "No thresholds configured",
      fingerprint: "none",
    };
  }

  const outputLines: string[] = [];
  let ok = true;

  // 1. Get changed files
  const diffResult = await git(cwd, ["diff", "--name-only", base]);
  const files = diffResult.stdout.split("\n").filter(Boolean);

  // 1. Large files
  if (config.maxFileSizeBytes) {
    for (const file of files) {
      const fullPath = path.join(cwd, file);
      if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        if (stats.size > config.maxFileSizeBytes) {
          outputLines.push(`Large file: ${file} (${stats.size} bytes)`);
          ok = false;
        }
      }
    }
  }

  // 2. Extensions
  if (config.allowedExtensions) {
    for (const file of files) {
      const ext = path.extname(file).slice(1);
      if (ext && !config.allowedExtensions.includes(ext)) {
        outputLines.push(`Disallowed extension: ${file}`);
        ok = false;
      }
    }
  }

  return {
    name: "cleanliness",
    ok,
    summary: ok ? "pass" : "failed",
    output: outputLines.join("\n") || "Clean",
    fingerprint: "cleanliness",
  };
}
