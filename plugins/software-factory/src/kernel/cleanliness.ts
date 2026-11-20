import { git } from "../core/git/exec.js";
import type { CheckResult } from "../core/checks/types.js";
import type { KernelRuntime } from "./types.js";
import fs from "node:fs";
import path from "node:path";

function oversizedFiles(
  files: string[],
  cwd: string,
  maxBytes: number,
): string[] {
  const lines: string[] = [];
  for (const file of files) {
    const fullPath = path.join(cwd, file);
    if (!fs.existsSync(fullPath)) continue;
    const size = fs.statSync(fullPath).size;
    if (size > maxBytes) lines.push(`Large file: ${file} (${size} bytes)`);
  }
  return lines;
}

function disallowedFiles(files: string[], allowed: string[]): string[] {
  const lines: string[] = [];
  for (const file of files) {
    const ext = path.extname(file).slice(1);
    if (ext && !allowed.includes(ext))
      lines.push(`Disallowed extension: ${file}`);
  }
  return lines;
}

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
  const diffResult = await git(cwd, ["diff", "--name-only", base]);
  const files = diffResult.stdout.split("\n").filter(Boolean);
  const outputLines = [
    ...(config.maxFileSizeBytes
      ? oversizedFiles(files, cwd, config.maxFileSizeBytes)
      : []),
    ...(config.allowedExtensions
      ? disallowedFiles(files, config.allowedExtensions)
      : []),
  ];
  const ok = outputLines.length === 0;
  return {
    name: "cleanliness",
    ok,
    summary: ok ? "pass" : "failed",
    output: outputLines.join("\n") || "Clean",
    fingerprint: "cleanliness",
  };
}
