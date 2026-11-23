import { git } from "../core/git/exec.js";
import type { CheckResult } from "../core/checks/types.js";
import type { KernelRuntime } from "./types.js";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";

export const DEFAULT_MAX_FILE_SIZE_BYTES = 1048576; // 1 MB

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

const REPO_CONFIG = path.join(".factory", "repo.yaml");

function normalizeFile(file: string): string {
  return file.replace(/^\.\//, "");
}

/**
 * The repo config's allowed-file list, read from this worktree so a revision
 * turn's `.factory/repo.yaml` edit takes effect even though the kernel loaded
 * its config before that edit. An invalid list fails the check rather than
 * silently exempting nothing.
 */
function readAllowedFiles(cwd: string): {
  allowedFiles: Set<string>;
  errors: string[];
} {
  const allowedFiles = new Set<string>();
  const configPath = path.join(cwd, REPO_CONFIG);
  if (!fs.existsSync(configPath)) return { allowedFiles, errors: [] };
  let data: unknown;
  try {
    data = yaml.parse(fs.readFileSync(configPath, "utf8"));
  } catch (err) {
    return {
      allowedFiles,
      errors: [
        `Cleanliness override: ${REPO_CONFIG} is not valid YAML (${(err as Error).message.split("\n")[0]})`,
      ],
    };
  }
  const cleanliness =
    data && typeof data === "object"
      ? (data as { cleanliness?: unknown }).cleanliness
      : undefined;
  const list =
    cleanliness && typeof cleanliness === "object"
      ? (cleanliness as { allowedFiles?: unknown }).allowedFiles
      : undefined;
  if (list === undefined) return { allowedFiles, errors: [] };
  if (
    !Array.isArray(list) ||
    list.some((entry) => typeof entry !== "string" || entry.trim() === "")
  ) {
    return {
      allowedFiles,
      errors: [
        `Cleanliness override: ${REPO_CONFIG} cleanliness.allowedFiles must be a list of paths`,
      ],
    };
  }
  for (const entry of list) allowedFiles.add(normalizeFile(entry.trim()));
  return { allowedFiles, errors: [] };
}

export async function runCleanlinessCheck(
  runtime: KernelRuntime,
  cwd: string,
  base: string,
): Promise<CheckResult> {
  const config = runtime.configs.repo.cleanliness;
  const maxBytes = config?.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;

  const override = readAllowedFiles(cwd);
  for (const file of config?.allowedFiles ?? [])
    override.allowedFiles.add(normalizeFile(file));

  const diffResult = await git(cwd, ["diff", "--name-only", base]);
  const files = diffResult.stdout
    .split("\n")
    .filter(Boolean)
    .filter((file) => !override.allowedFiles.has(normalizeFile(file)));

  const { lines: artifactLines, flagged: artifactFlagged } =
    disallowedArtifacts(files, cwd);
  const extLines = config?.allowedExtensions
    ? disallowedExtensions(files, cwd, config.allowedExtensions)
    : await newExtensions(files, cwd, base, artifactFlagged);

  const outputLines = [
    ...override.errors,
    ...oversizedFiles(files, cwd, maxBytes),
    ...artifactLines,
    ...extLines,
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
