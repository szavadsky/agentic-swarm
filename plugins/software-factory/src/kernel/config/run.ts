/** Process and run config loading and merging. */

import fs from "node:fs";
import path from "node:path";
import type { Finding } from "../findings.js";
import type {
  ConfigBundle,
  ConfigFiles,
  ProcessConfig,
  RepoConfig,
  RunConfig,
} from "../types.js";
import {
  ConfigError,
  configFilePaths,
  deepMerge,
  parseLayer,
  readLayer,
} from "./load.js";
import type { LoadConfigOptions } from "./types.js";
import { processConfigSchema, runConfigSchema } from "./run-schema.js";
import { expandHome } from "./paths.js";
import { repoConfigSchema } from "./repo-schema.js";

/**
 * The file an issue came from. A path issue names its first segment; an
 * unrecognized root key (`path` empty, the key in `keys`) falls back to the
 * unknown keys, so a retired key in the repo override is blamed there rather
 * than on the package default it no longer belongs to.
 */
function processFileFor(
  data: unknown,
  issue: { path: PropertyKey[]; keys?: PropertyKey[] },
  files: ConfigFiles,
): string {
  const named = issue.path.length > 0 ? [issue.path[0]] : (issue.keys ?? []);
  if (
    data &&
    typeof data === "object" &&
    named.some((key) => typeof key === "string" && key in data)
  ) {
    return files.processOverride;
  }
  return files.processDefault;
}

/**
 * The process layer alone: package default deep-merged with the repo override.
 * Exported for callers that read process vocabulary without validating a
 * repo/run config they do not own.
 */
export function loadProcessConfig(repoRoot: string): ProcessConfig {
  const files = configFilePaths(repoRoot);
  const findings: Finding[] = [];
  const process = processLayer(files, findings);
  if (findings.length > 0) throw new ConfigError(findings);
  return process as ProcessConfig;
}

function processLayer(
  files: ConfigFiles,
  findings: Finding[],
): ProcessConfig | undefined {
  const baseLayer = readLayer(files.processDefault);
  const overrideLayer = readLayer(files.processOverride);
  findings.push(...baseLayer.findings, ...overrideLayer.findings);
  const processData = parseLayer(
    processConfigSchema,
    deepMerge(baseLayer.data ?? {}, overrideLayer.data),
    (issue) => processFileFor(overrideLayer.data, issue, files),
    findings,
  );
  if (!processData) return undefined;
  return processData as ProcessConfig;
}

/**
 * The run layer is one file or an `extends` chain: the file itself, its base,
 * the base's base. `null` in a child removes an inherited key, so a variant
 * states its differences instead of restating a whole alias, harness entry or
 * price row.
 */
interface RunSource {
  file: string;
  /** The file's own data, `extends` removed. */
  data: unknown;
}

/**
 * The run-layer files that make one config, outermost first. A missing file
 * contributes nothing (schema defaults stand in); an unreadable file, a
 * missing base or a cycle returns undefined with a finding naming the file.
 */
function resolveRunSources(
  file: string,
  findings: Finding[],
  chain: string[] = [],
): RunSource[] | undefined {
  const visited = [...chain, file];
  const layer = readLayer(file);
  findings.push(...layer.findings);
  if (layer.data === undefined) return [];
  if (
    layer.data === null ||
    typeof layer.data !== "object" ||
    Array.isArray(layer.data)
  ) {
    findings.push({
      file,
      key: "(root)",
      message: "expected a run config mapping",
    });
    return undefined;
  }
  const { extends: parent, ...own } = layer.data as Record<string, unknown>;
  const sources: RunSource[] = [{ file, data: own }];
  if (parent === undefined) return sources;
  if (typeof parent !== "string" || parent.trim() === "") {
    findings.push({
      file,
      key: "extends",
      message: "expected a non-empty run-config path",
    });
    return undefined;
  }
  const parentFile = path.resolve(path.dirname(file), expandHome(parent));
  if (visited.includes(parentFile)) {
    findings.push({
      file,
      key: "extends",
      message: `extends cycle: ${[...visited, parentFile].join(" -> ")}`,
    });
    return undefined;
  }
  if (!fs.existsSync(parentFile)) {
    findings.push({
      file,
      key: "extends",
      message: `base run config not found: ${parentFile}`,
    });
    return undefined;
  }
  const base = resolveRunSources(parentFile, findings, visited);
  if (!base) return undefined;
  return [...sources, ...base];
}

/** Root base first, overlay last; later files win and `null` removes a key. */
function mergeRunSources(sources: RunSource[]): unknown {
  let merged: Record<string, unknown> = {};
  for (const source of [...sources].reverse()) {
    merged = deepMerge(merged, source.data, {
      nullDeletes: true,
    }) as Record<string, unknown>;
  }
  return merged;
}

/**
 * The file an issue belongs to: the outermost file that declares the issue's
 * first path segment, else the root base. A typo in an overlay is blamed on
 * the overlay, not on the base it did not touch.
 */
function runFileFor(
  sources: RunSource[],
  issue: { path: PropertyKey[]; keys?: PropertyKey[] },
  fallback: string,
): string {
  const named = issue.path.length > 0 ? [issue.path[0]] : (issue.keys ?? []);
  for (const source of sources) {
    // Every source passed resolveRunSources' mapping check.
    const data = source.data as Record<string, unknown>;
    if (named.some((key) => typeof key === "string" && key in data)) {
      return source.file;
    }
  }
  return sources[sources.length - 1]?.file ?? fallback;
}

/** One run layer: its `extends` chain resolved, then validated as a whole. */
function runLayer(file: string, findings: Finding[]): RunConfig | undefined {
  const sources = resolveRunSources(file, findings);
  if (!sources) return undefined;
  return parseLayer(
    runConfigSchema,
    mergeRunSources(sources),
    (issue) => runFileFor(sources, issue, file),
    findings,
  );
}

/**
 * Resolves and validates one run config, base chain included. The operator
 * entry point: `--validate` and the schema gate read a file the same way the
 * launch does.
 */
export function loadRunConfig(file: string): RunConfig {
  const resolved = path.resolve(file);
  const findings: Finding[] = [];
  if (!fs.existsSync(resolved)) {
    findings.push({ file: resolved, key: "(file)", message: "no such file" });
    throw new ConfigError(findings);
  }
  const run = runLayer(resolved, findings);
  if (!run || findings.length > 0) throw new ConfigError(findings);
  return run;
}

/**
 * Loads the three layers into one report. Missing files take schema defaults;
 * a missing run config leaves aliases empty so pre-flight names the aliases
 * the process config requires instead of inventing a harness.
 */
export function loadConfigs(
  repoRoot: string,
  opts: LoadConfigOptions = {},
): ConfigBundle {
  const files = configFilePaths(repoRoot, opts);
  const findings: Finding[] = [];
  const repoLayer = readLayer(files.repo);
  findings.push(...repoLayer.findings);

  const repo = parseLayer(
    repoConfigSchema,
    repoLayer.data,
    files.repo,
    findings,
  );
  if (
    repo?.codingRules !== undefined &&
    !fs.existsSync(path.join(path.resolve(repoRoot), repo.codingRules))
  ) {
    findings.push({
      file: files.repo,
      key: "codingRules",
      message: `coding rules file not found: ${repo.codingRules}`,
    });
  }
  const processData = processLayer(files, findings);
  const run = runLayer(files.run, findings);
  if (processData && run?.preset && processData.presets) {
    if (
      Object.keys(processData.presets).length > 0 &&
      !(run.preset in processData.presets)
    ) {
      findings.push({
        file: files.run,
        key: "preset",
        message: `preset "${run.preset}" is not defined in process config`,
      });
    }
  }
  if (findings.length > 0) throw new ConfigError(findings);

  if (opts.iterations !== undefined) run!.limits.iterations = opts.iterations;
  return {
    repo: repo as RepoConfig,
    process: processData as ProcessConfig,
    run: run as RunConfig,
    files,
  };
}
