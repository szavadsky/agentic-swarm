import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import type { ProjectConfig, PipelineConfig } from "../artifacts.js";
import { createAjv, formatAjvErrors } from "./ajv.js";
import { mergeLayers } from "./merge.js";
import { validateStructural, type ValidationResult } from "./validate.js";

const ajv = createAjv();

function getPluginRootDir(): string {
  // src/core/config -> plugins/software-factory
  return path.resolve(import.meta.dir ?? __dirname, "../../..");
}

export function loadProjectConfig(
  filePathOrContent: string,
  options: { pluginRoot?: string } = {}
): ProjectConfig {
  let raw: unknown;

  if (fs.existsSync(filePathOrContent)) {
    const text = fs.readFileSync(filePathOrContent, "utf8");
    raw = yaml.parse(text);
  } else if (typeof filePathOrContent === "string" && (filePathOrContent.includes(":") || filePathOrContent.includes("\n"))) {
    raw = yaml.parse(filePathOrContent);
  } else {
    throw new Error(`Project config file not found: "${filePathOrContent}"`);
  }

  const pluginRoot = options.pluginRoot ?? getPluginRootDir();
  const schemaPath = path.resolve(pluginRoot, "config/schemas/project.schema.json");

  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Project schema not found at "${schemaPath}"`);
  }

  const schemaJson = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const validate = ajv.getSchema(schemaJson.$id) ?? ajv.compile(schemaJson);
  if (!validate(raw)) {
    const errorMsg = formatAjvErrors(validate.errors);
    throw new Error(`Invalid project configuration:\n${errorMsg}`);
  }

  return raw as ProjectConfig;
}

export interface LoadPipelineOptions {
  pluginRoot?: string;
  repoRoot?: string;
  defaultYamlPath?: string;
  projectYamlPath?: string;
  taskYamlPath?: string;
  overrides?: Record<string, unknown>;
  skipStructuralValidation?: boolean;
}

export function loadPipelineConfig(options: LoadPipelineOptions = {}): {
  config: PipelineConfig;
  structural: ValidationResult;
} {
  const pluginRoot = options.pluginRoot ?? getPluginRootDir();
  const repoRoot = options.repoRoot;

  // 1. Load default pipeline layer
  const defaultPath =
    options.defaultYamlPath ??
    path.resolve(pluginRoot, "config/pipeline.default.yaml");

  if (!fs.existsSync(defaultPath)) {
    throw new Error(`Default pipeline config not found at "${defaultPath}"`);
  }

  const defaultLayer = yaml.parse(fs.readFileSync(defaultPath, "utf8")) as Record<
    string,
    unknown
  >;

  // 2. Load project layer if provided / present
  let projectLayer: Record<string, unknown> | null = null;
  const projectPath =
    options.projectYamlPath ??
    (repoRoot ? path.resolve(repoRoot, ".factory/pipeline.yaml") : null);

  if (projectPath && fs.existsSync(projectPath)) {
    projectLayer = yaml.parse(fs.readFileSync(projectPath, "utf8")) as Record<
      string,
      unknown
    >;
  }

  // 3. Load task layer if provided / present
  let taskLayer: Record<string, unknown> | null = null;
  if (options.taskYamlPath && fs.existsSync(options.taskYamlPath)) {
    taskLayer = yaml.parse(
      fs.readFileSync(options.taskYamlPath, "utf8")
    ) as Record<string, unknown>;
  }

  // 4. Merge layers: defaults -> project -> task -> overrides
  const merged = mergeLayers<PipelineConfig>(
    defaultLayer,
    projectLayer,
    taskLayer,
    options.overrides
  );

  // 5. Resolve criteria paths
  // Default criteria paths resolve relative to plugin dir; project overrides relative to repo root
  if (merged.criteria) {
    const resolvedCriteria: Record<string, string> = {};
    for (const [key, criteriaPath] of Object.entries(merged.criteria)) {
      if (typeof criteriaPath === "string") {
        if (projectLayer?.criteria && (projectLayer.criteria as Record<string, string>)[key] && repoRoot) {
          resolvedCriteria[key] = path.resolve(repoRoot, criteriaPath);
        } else {
          resolvedCriteria[key] = path.resolve(pluginRoot, criteriaPath);
        }
      }
    }
    merged.criteria = resolvedCriteria;
  }

  // 6. Validate against pipeline schema
  const schemaPath = path.resolve(pluginRoot, "config/schemas/pipeline.schema.json");
  if (fs.existsSync(schemaPath)) {
    const schemaJson = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
    const validate = ajv.getSchema(schemaJson.$id) ?? ajv.compile(schemaJson);
    if (!validate(merged)) {
      const errorMsg = formatAjvErrors(validate.errors);
      throw new Error(`Invalid pipeline configuration:\n${errorMsg}`);
    }
  }

  // 7. Structural validation
  let structural: ValidationResult = { errors: [], warnings: [] };
  if (!options.skipStructuralValidation) {
    structural = validateStructural(merged, {
      pluginRoot,
      repoRoot,
    });
    if (structural.errors.length > 0) {
      throw new Error(
        `Pipeline structural validation failed:\n${structural.errors.join("\n")}`
      );
    }
  }

  return { config: merged, structural };
}
