import { git } from "../core/git/exec.js";
import type { CheckResult } from "../core/checks/types.js";
import type { KernelRuntime, TaskFile } from "./types.js";
import fs from "node:fs";
import path from "node:path";

export const DEFAULT_MAX_FILE_SIZE_BYTES = 1048576; // 1 MB
export const DEFAULT_MAX_OUT_OF_SCOPE_FILES = 3;

const STANDARD_SOURCE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "json",
  "md",
  "markdown",
  "txt",
  "yaml",
  "yml",
  "toml",
  "sh",
  "bash",
  "html",
  "css",
  "scss",
  "svg",
  "xml",
  "sql",
  "py",
  "rs",
  "go",
  "java",
  "c",
  "cpp",
  "h",
  "hpp",
  "rb",
  "php",
]);

const DISALLOWED_ARTIFACT_EXTENSIONS = new Set([
  // Weights & model checkpoints
  "bin",
  "pt",
  "pth",
  "safetensors",
  "onnx",
  "ckpt",
  "h5",
  "pkl",
  "weights",
  // Temporary & backups
  "tmp",
  "temp",
  "bak",
  "swp",
  // Huge outputs & archives
  "log",
  "dump",
  "tar",
  "gz",
  "zip",
  "7z",
  "rar",
  "iso",
]);

const DISALLOWED_BASENAMES = new Set([".DS_Store", "Thumbs.db"]);

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

function disallowedArtifacts(
  files: string[],
  cwd: string,
): { lines: string[]; flagged: Set<string> } {
  const lines: string[] = [];
  const flagged = new Set<string>();
  for (const file of files) {
    const fullPath = path.join(cwd, file);
    if (!fs.existsSync(fullPath)) continue;
    const base = path.basename(file);
    const ext = path.extname(file).slice(1).toLowerCase();
    if (
      DISALLOWED_BASENAMES.has(base) ||
      base.endsWith("~") ||
      (ext && DISALLOWED_ARTIFACT_EXTENSIONS.has(ext))
    ) {
      lines.push(`Disallowed artifact: ${file}`);
      flagged.add(file);
    }
  }
  return { lines, flagged };
}

function disallowedExtensions(
  files: string[],
  cwd: string,
  allowed: string[],
): string[] {
  const lines: string[] = [];
  for (const file of files) {
    const fullPath = path.join(cwd, file);
    if (!fs.existsSync(fullPath)) continue;
    const ext = path.extname(file).slice(1);
    if (ext && !allowed.includes(ext)) {
      lines.push(`Disallowed extension: ${file}`);
    }
  }
  return lines;
}

async function newExtensions(
  files: string[],
  cwd: string,
  base: string,
  excludeFiles: Set<string>,
): Promise<string[]> {
  const lines: string[] = [];
  let baseExtensions: Set<string>;
  try {
    const baseFilesResult = await git(cwd, [
      "ls-tree",
      "-r",
      "--name-only",
      base,
    ]);
    const baseFiles = baseFilesResult.stdout.split("\n").filter(Boolean);
    baseExtensions = new Set(
      baseFiles.map((f) => path.extname(f).slice(1)).filter(Boolean),
    );
  } catch {
    baseExtensions = new Set();
  }
  for (const file of files) {
    if (excludeFiles.has(file)) continue;
    const fullPath = path.join(cwd, file);
    if (!fs.existsSync(fullPath)) continue;
    const ext = path.extname(file).slice(1).toLowerCase();
    if (
      ext &&
      !baseExtensions.has(ext) &&
      !STANDARD_SOURCE_EXTENSIONS.has(ext)
    ) {
      lines.push(`New extension: ${file} (.${ext})`);
    }
  }
  return lines;
}

function scopePrefixes(files: string[], scope: string[]): string[] {
  const prefixes = new Set<string>();
  for (const entry of scope) {
    for (const file of files) {
      const norm = file.replace(/^\.?\//, "");
      if (norm === entry || norm.startsWith(`${entry}/`)) {
        prefixes.add("");
      }
      const marker = `/${entry}`;
      const idx = norm.indexOf(marker);
      if (idx > 0) prefixes.add(norm.slice(0, idx));
    }
  }
  return [...prefixes];
}

function outOfScopeFiles(
  files: string[],
  cwd: string,
  scope: string[] | undefined,
  maxOutOfScope: number,
): string[] {
  if (!scope || scope.length === 0) return [];
  const normalizedScope = scope.map((s) =>
    s.replace(/^\.?\//, "").replace(/\/$/, ""),
  );
  const outOfScope: string[] = [];
  const prefixes = scopePrefixes(files, normalizedScope);
  const prefixedScope = prefixes.flatMap((prefix) =>
    normalizedScope.map((s) => (prefix ? `${prefix}/${s}` : s)),
  );
  for (const file of files) {
    const fullPath = path.join(cwd, file);
    if (!fs.existsSync(fullPath)) continue;
    const norm = file.replace(/^\.?\//, "");
    const inScope = prefixedScope.some(
      (s) => norm === s || norm.startsWith(`${s}/`),
    );
    if (!inScope) {
      outOfScope.push(file);
    }
  }
  if (outOfScope.length > maxOutOfScope) {
    return [
      `Too many files outside task scope (${outOfScope.length} files: ${outOfScope.join(", ")})`,
    ];
  }
  return [];
}

export async function runCleanlinessCheck(
  runtime: KernelRuntime,
  cwd: string,
  base: string,
  task?: TaskFile,
): Promise<CheckResult> {
  const config = runtime.configs.repo.cleanliness;
  const maxBytes = config?.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;
  const maxOutOfScope =
    config?.maxOutOfScopeFiles ?? DEFAULT_MAX_OUT_OF_SCOPE_FILES;

  const diffResult = await git(cwd, ["diff", "--name-only", base]);
  const files = diffResult.stdout.split("\n").filter(Boolean);

  const { lines: artifactLines, flagged: artifactFlagged } =
    disallowedArtifacts(files, cwd);
  const extLines = config?.allowedExtensions
    ? disallowedExtensions(files, cwd, config.allowedExtensions)
    : await newExtensions(files, cwd, base, artifactFlagged);

  const outputLines = [
    ...oversizedFiles(files, cwd, maxBytes),
    ...artifactLines,
    ...extLines,
    ...outOfScopeFiles(files, cwd, task?.scope, maxOutOfScope),
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
