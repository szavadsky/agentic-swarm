import fs from "node:fs";
import path from "node:path";
import type { ValidateFunction } from "ajv";
import { createAjv } from "../config/ajv.js";

export class CompiledSchemaCache {
  private ajv = createAjv();
  private cache = new Map<string, ValidateFunction>();
  private schemasDir: string;

  constructor(schemasDir?: string) {
    if (schemasDir) {
      this.schemasDir = schemasDir;
    } else {
      const pluginRoot = path.resolve(import.meta.dir ?? __dirname, "../../..");
      this.schemasDir = path.resolve(pluginRoot, "config/schemas");
    }
  }

  /**
   * Returns a compiled Ajv validator for a schema name or schema file path.
   */
  public getValidator(schemaNameOrPath: string): ValidateFunction {
    const cached = this.cache.get(schemaNameOrPath);
    if (cached) return cached;

    let schemaObject: Record<string, unknown>;

    // Check if it is a direct file path
    if (fs.existsSync(schemaNameOrPath)) {
      const content = fs.readFileSync(schemaNameOrPath, "utf8");
      schemaObject = JSON.parse(content);
    } else {
      // Look up in schemas directory
      const fileName = schemaNameOrPath.endsWith(".schema.json")
        ? schemaNameOrPath
        : `${schemaNameOrPath}.schema.json`;
      const fullPath = path.resolve(this.schemasDir, fileName);

      if (!fs.existsSync(fullPath)) {
        throw new Error(
          `Schema "${schemaNameOrPath}" not found (checked "${fullPath}")`
        );
      }

      const content = fs.readFileSync(fullPath, "utf8");
      schemaObject = JSON.parse(content);
    }

    const id = schemaObject.$id as string | undefined;
    const compiled = (id ? this.ajv.getSchema(id) : undefined) ?? this.ajv.compile(schemaObject);
    this.cache.set(schemaNameOrPath, compiled);
    return compiled;
  }

  /**
   * Compiles and caches an in-memory JSON schema object.
   */
  public compile(key: string, schemaObject: Record<string, unknown>): ValidateFunction {
    const id = schemaObject.$id as string | undefined;
    const compiled = (id ? this.ajv.getSchema(id) : undefined) ?? this.ajv.compile(schemaObject);
    return compiled;
  }
}

// Default singleton instance
export const defaultSchemaCache = new CompiledSchemaCache();
