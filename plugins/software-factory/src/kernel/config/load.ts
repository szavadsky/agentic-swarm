/** Loading, layering and merging config files. */

import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { z } from "zod";
import { formatFindings } from "../findings.js";
import type { Finding } from "../findings.js";
import type { ConfigFiles } from "../types.js";
import { packageRoot } from "./repo-schema.js";
import type { LoadConfigOptions } from "./types.js";

export class ConfigError extends Error {
  readonly findings: Finding[];
  readonly report: string;

  constructor(findings: Finding[]) {
    const report = formatFindings(
      `configuration is invalid (${findings.length} violation(s)):`,
      findings,
    );
    super(report);
    this.name = "ConfigError";
    this.findings = findings;
    this.report = report;
  }
}

export function configFilePaths(
  repoRoot: string,
  opts: LoadConfigOptions = {},
): ConfigFiles {
  const root = path.resolve(repoRoot);
  return {
    repo: path.join(root, ".factory", "repo.yaml"),
    processDefault: path.join(packageRoot, "config", "process.yaml"),
    processOverride: path.join(root, ".factory", "process.yaml"),
    run: path.resolve(
      opts.runConfigPath ??
        globalThis.process.env.FACTORY_RUN_CONFIG ??
        path.join(root, ".factory", "run.yaml"),
    ),
  };
}

/**
 * The process layer a finding blames: the repo override when it exists, the
 * package default otherwise.
 */
export function processFilePath(files: ConfigFiles): string {
  return fs.existsSync(files.processOverride)
    ? files.processOverride
    : files.processDefault;
}

interface Layer {
  data?: unknown;
  findings: Finding[];
}

export function readLayer(file: string): Layer {
  if (!fs.existsSync(file)) return { findings: [] };
  try {
    return {
      data: yaml.parse(fs.readFileSync(file, "utf8")) ?? undefined,
      findings: [],
    };
  } catch (err) {
    return {
      findings: [
        {
          file,
          key: "(yaml)",
          message: (err as Error).message.split("\n")[0] ?? "parse error",
        },
      ],
    };
  }
}

export function parseLayer<T>(
  schema: z.ZodType<T>,
  data: unknown,
  fileFor: string | ((issue: z.core.$ZodIssue) => string),
  findings: Finding[],
): T | undefined {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;
  for (const issue of result.error.issues) {
    findings.push({
      file: typeof fileFor === "string" ? fileFor : fileFor(issue),
      key: issue.path.length > 0 ? issue.path.join(".") : "(root)",
      message: issue.message,
    });
  }
  return undefined;
}

interface MergeOptions {
  /** A `null` in the overlay removes the inherited key instead of replacing it. */
  nullDeletes?: boolean;
}

/** Arrays replace; plain objects merge key by key; null deletes when asked. */
export function deepMerge(
  base: unknown,
  override: unknown,
  opts: MergeOptions = {},
): unknown {
  if (override === undefined) return base;
  if (Array.isArray(base) || Array.isArray(override)) return override;
  if (
    base &&
    override &&
    typeof base === "object" &&
    typeof override === "object"
  ) {
    const out: Record<string, unknown> = {
      ...(base as Record<string, unknown>),
    };
    for (const [key, value] of Object.entries(
      override as Record<string, unknown>,
    )) {
      if (value === null && opts.nullDeletes) {
        delete out[key];
        continue;
      }
      out[key] = deepMerge(out[key], value, opts);
    }
    return out;
  }
  return override;
}
