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
import { pinGateSchema } from "./preflight/pin.js";
import { qaOutcomeSchema } from "./qa.js";
import { taskFrontmatterSchema } from "./tasks.js";
import { outcomeSchema } from "./types.js";

/** A JSON Schema node, as `z.toJSONSchema` emits it. */
type JsonNode = Record<string, unknown>;

function isNode(value: unknown): value is JsonNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The schema an editor validates an authored file against. Input mode: a
 * defaulted field stays optional, and extras the parser still accepts are not
 * forbidden, so the editor never rejects a file the gate passes.
 */
function inputSchema(schema: z.ZodType): JsonNode {
  return z.toJSONSchema(schema, { io: "input" }) as JsonNode;
}

/** The same node, also accepting `null`: the value a run layer deletes with. */
function deletable(node: JsonNode): JsonNode {
  return { anyOf: [node, { type: "null" }] };
}

/**
 * One run layer: every declared property optional, and nullable because the
 * loader's `deepMerge` removes a key whose overlay value is `null`. Records
 * merge entry by entry, so their values are layers too; arrays replace
 * wholesale, so the items inside one stay complete.
 */
function authoredLayer(node: JsonNode): JsonNode {
  const layer: JsonNode = { ...node };
  if (isNode(layer.properties)) {
    layer.properties = Object.fromEntries(
      Object.entries(layer.properties).map(([key, value]) => [
        key,
        deletable(authoredLayer(value as JsonNode)),
      ]),
    );
    delete layer.required;
  }
  if (
    isNode(layer.additionalProperties) &&
    Object.keys(layer.additionalProperties).length > 0
  ) {
    layer.additionalProperties = deletable(
      authoredLayer(layer.additionalProperties),
    );
  }
  return layer;
}

/**
 * The run schema an author writes, not the one the loader validates: a file
 * names a base with `extends` and states only its changes, so every key is
 * optional and a `null` removes an inherited one. The loader resolves that
 * chain and validates the merged config against `runConfigSchema`.
 */
function runLayerSchema(): JsonNode {
  const layer = authoredLayer(inputSchema(runConfigSchema));
  layer.properties = {
    /** Base run config this file overlays; resolved before validation. */
    extends: { type: "string", pattern: "\\S" },
    ...(layer.properties as JsonNode),
  };
  return layer;
}

/**
 * Every file shape the kernel validates, by the artifact name the file
 * carries. The same set the schema-validation gate enforces, except `run`:
 * the gate validates a config's merged layer while an authored file is one
 * link of an `extends` chain.
 * `gate` is the pin's own record, outside any repo, so it is validated only
 * when a launch reads it.
 */
const kernelSchemas = {
  task: () => inputSchema(taskFrontmatterSchema),
  outcome: () => inputSchema(outcomeSchema),
  qa: () => inputSchema(qaOutcomeSchema),
  hold: () => inputSchema(holdFileSchema),
  class: () => inputSchema(classSchema),
  gate: () => inputSchema(pinGateSchema), // the pin build's gate record; promote writes it, run reads it
  repo: () => inputSchema(repoConfigSchema),
  run: runLayerSchema,
  process: () => inputSchema(processOverrideSchema),
} satisfies Record<string, () => JsonNode>;

/**
 * Writes one `<name>.schema.json` per kernel schema under `outDir` (created
 * when missing) and returns the written paths in registry order.
 */
export function writeKernelSchemas(outDir: string): string[] {
  const dir = path.resolve(outDir);
  fs.mkdirSync(dir, { recursive: true });
  return Object.entries(kernelSchemas).map(([name, exported]) => {
    const file = path.join(dir, `${name}.schema.json`);
    const json = `${JSON.stringify(exported(), null, 2)}\n`;
    fs.writeFileSync(file, json, "utf8");
    return file;
  });
}
