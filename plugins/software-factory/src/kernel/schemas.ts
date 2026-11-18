import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  processOverrideSchema,
  repoConfigSchema,
  runConfigSchema,
} from "./config.js";
import { classSchema } from "./flow-context.js";
import { holdFileSchema } from "./mailbox.js";
import { taskFrontmatterSchema } from "./tasks.js";
import { outcomeSchema } from "./types.js";

/**
 * Every file shape the kernel validates, by the artifact name the file
 * carries. The same set the schema-validation gate enforces, so an editor's
 * copy and the gate cannot drift.
 */
const kernelSchemas = {
  task: taskFrontmatterSchema,
  outcome: outcomeSchema,
  hold: holdFileSchema,
  class: classSchema,
  repo: repoConfigSchema,
  run: runConfigSchema,
  process: processOverrideSchema,
} satisfies Record<string, z.ZodType>;

/**
 * Writes one `<name>.schema.json` per kernel schema under `outDir` (created
 * when missing) and returns the written paths in registry order.
 */
export function writeKernelSchemas(outDir: string): string[] {
  const dir = path.resolve(outDir);
  fs.mkdirSync(dir, { recursive: true });
  return Object.entries(kernelSchemas).map(([name, schema]) => {
    const file = path.join(dir, `${name}.schema.json`);
    // Input mode: the schema an editor validates an authored file against.
    // Output mode would make defaulted fields required and forbid extras the
    // parser still accepts, so the editor would reject files the gate passes.
    const json = `${JSON.stringify(z.toJSONSchema(schema, { io: "input" }), null, 2)}\n`;
    fs.writeFileSync(file, json, "utf8");
    return file;
  });
}
