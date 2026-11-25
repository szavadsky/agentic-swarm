import path from "node:path";
import { writeTextAtomic } from "../core/records/io.js";
import { packageRoot } from "./config.js";
import { writeKernelSchemas } from "./schemas.js";
import type { ArtifactLspFiles } from "./artifact-lsp-types.js";

/**
 * The executable omp's built-in `yamlls` server names. omp resolves it through
 * the project's bin directories, then PATH; it does not ship the server.
 */
export const YAML_LSP_BINARY = "yaml-language-server";

/**
 * The YAML server on PATH, if any. Resolved against the current PATH so a
 * launch sees the environment it will hand to omp, not Bun's startup snapshot.
 */
export function yamlLspBinary(): string | undefined {
  const pathEnv = process.env.PATH;
  if (!pathEnv) return undefined;
  return Bun.which(YAML_LSP_BINARY, { PATH: pathEnv }) ?? undefined;
}

/** Canonical config inside the artifact folder, readable by any cwd-rooted harness or editor. */
export function artifactLspConfigPath(goalDir: string): string {
  return path.join(goalDir, ".omp", "lsp.json");
}

/** The frontmatter server omp starts for task files; Markdown is not a YAML document. */
export function frontmatterServerScript(): string {
  return path.join(packageRoot, "src", "harness", "lsp", "frontmatter.ts");
}

/**
 * One omp LSP config for the artifact folder: the kernel schemas cover the
 * YAML artifacts, and the frontmatter server covers task files, whose
 * Markdown body yamlls would validate as a second YAML document.
 */
export function artifactLspConfig(goalDir: string): Record<string, unknown> {
  const dir = path.resolve(goalDir);
  const schemas = path.join(dir, "schemas");
  const yamlServer = yamlLspBinary() ?? YAML_LSP_BINARY;
  return {
    servers: {
      // omp's built-in yamlls would also run, with the schema store on and no
      // artifact schemas; our entry owns YAML validation for the goal.
      yamlls: { disabled: true },
      "factory-artifacts": {
        command: yamlServer,
        args: ["--stdio"],
        fileTypes: [".yaml", ".yml"],
        // The config is installed into whichever cwd runs the turn; "." is that cwd.
        rootMarkers: ["."],
        settings: {
          yaml: {
            validate: true,
            schemaStore: { enable: false },
            schemas: {
              [path.join(schemas, "outcome.schema.json")]: [
                path.join(dir, "records/**/outcome.yaml"),
              ],
              [path.join(schemas, "hold.schema.json")]: [
                path.join(dir, "mailbox/holds/*.yaml"),
              ],
              [path.join(schemas, "class.schema.json")]: [
                path.join(dir, "class.yaml"),
              ],
              [path.join(schemas, "infra.schema.json")]: [
                path.join(dir, "infra.yaml"),
              ],
            },
          },
        },
      },
      "factory-task-frontmatter": {
        command: process.execPath,
        // Scopes the server to this goal's task directory: an unrelated
        // `tasks/` elsewhere in the repository is not a task artifact.
        args: [frontmatterServerScript(), path.join(dir, "tasks")],
        fileTypes: [".md"],
        rootMarkers: ["."],
      },
    },
  };
}

/** Writes the schemas and the canonical config into the goal's artifact folder. */
export async function writeArtifactLsp(
  goalDir: string,
): Promise<ArtifactLspFiles> {
  const dir = path.resolve(goalDir);
  const schemas = writeKernelSchemas(path.join(dir, "schemas"));
  const config = artifactLspConfigPath(dir);
  const content = `${JSON.stringify(artifactLspConfig(dir), null, 2)}\n`;
  await writeTextAtomic(config, content);
  return { config, schemas };
}
