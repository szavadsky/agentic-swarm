import { z } from "zod";
import { type OutcomeExpectation, expectationField } from "./outcome.js";
import { DEFAULT_FLOW, taskFrontmatterSchema } from "./tasks.js";
import { outcomeSchema } from "./types.js";

/**
 * Prompt variables rendered from kernel schemas and config, supplied as
 * renderer defaults so turn code never passes them. Schemas render through
 * `z.toJSONSchema` — the same zod schemas the validators use, so a field the
 * skeleton drops is a renderer bug the tests catch, never prompt drift.
 */

interface JsonNode {
  type?: string;
  enum?: unknown[];
  description?: string;
  properties?: Record<string, JsonNode>;
  required?: string[];
  items?: JsonNode;
  $ref?: string;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function scalarFallback(type: string | undefined): string {
  if (type === "integer" || type === "number") return "0";
  if (type === "boolean") return "true | false";
  return "...";
}

/**
 * One renderer from a kernel object schema to the YAML skeleton prompts show:
 * one `key: value` line per field in declaration order, enums joined with
 * `|`, nested objects inlined as `{keys}` / `[{keys}]`, and a `#` comment
 * with the optional marker, the field description, and nested enum values. A
 * `keep` list narrows the rendering to those top-level fields, in schema order.
 */
export function renderSkeleton(
  schema: z.ZodType,
  keep?: readonly string[],
): string {
  const root = z.toJSONSchema(schema) as unknown as JsonNode & {
    $defs?: Record<string, JsonNode>;
  };
  if (root.type !== "object" || !root.properties) {
    throw new Error("schema skeleton needs a top-level object schema");
  }
  const defs = root.$defs ?? {};
  const resolve = (node: JsonNode): JsonNode => {
    if (node.$ref?.startsWith("#/$defs/")) {
      const target = defs[node.$ref.slice("#/$defs/".length)];
      if (!target) throw new Error(`unresolvable schema ref ${node.$ref}`);
      return resolve(target);
    }
    return node;
  };
  const inline = (raw: JsonNode): string => {
    const node = resolve(raw);
    if (node.enum) return node.enum.map(String).join(" | ");
    if (node.type === "array" && node.items) {
      const item = resolve(node.items);
      if (item.type === "object" && item.properties) return `[${inline(item)}]`;
      if (item.enum) return `[${item.enum.map(String).join(" | ")}]`;
      return item.description ? `[${oneLine(item.description)}]` : "[]";
    }
    if (node.type === "object" && node.properties) {
      const required = new Set(node.required ?? []);
      const parts = Object.entries(node.properties).map(([key, value]) => {
        const sub = resolve(value);
        const name = required.has(key) ? key : `${key}?`;
        return sub.type === "array" && sub.items
          ? `${name}: ${inline(sub)}`
          : name;
      });
      return `{${parts.join(", ")}}`;
    }
    return node.description
      ? oneLine(node.description)
      : scalarFallback(node.type);
  };
  // Nested enum values, collected as `path: a | b` notes for the line comment.
  const enumNotes = (raw: JsonNode, path: string): string[] => {
    const node = resolve(raw);
    if (node.type === "array" && node.items) return enumNotes(node.items, path);
    if (node.type === "object" && node.properties) {
      const notes: string[] = [];
      for (const [key, value] of Object.entries(node.properties)) {
        const sub = resolve(value);
        const at = path ? `${path}.${key}` : key;
        if (sub.enum) notes.push(`${at}: ${sub.enum.map(String).join(" | ")}`);
        else notes.push(...enumNotes(sub, at));
      }
      return notes;
    }
    return [];
  };
  const required = new Set(root.required ?? []);
  return Object.entries(root.properties)
    .filter(([key]) => keep === undefined || keep.includes(key))
    .map(([key, value]) => {
      const node = resolve(value);
      const comments: string[] = [];
      if (!required.has(key)) comments.push("optional");
      let rendered: string;
      if (node.enum) {
        rendered = node.enum.map(String).join(" | ");
        if (node.description) comments.push(oneLine(node.description));
      } else if (node.type === "array" || node.type === "object") {
        rendered = inline(node);
        if (node.description) comments.push(oneLine(node.description));
      } else {
        rendered = node.description
          ? oneLine(node.description)
          : scalarFallback(node.type);
      }
      comments.push(...enumNotes(node, ""));
      return comments.length > 0
        ? `${key}: ${rendered}  # ${comments.join("; ")}`
        : `${key}: ${rendered}`;
    })
    .join("\n");
}

/** The `outcome_schema` prompt variable: the fenced outcome skeleton block. */
export function outcomeSchemaVar(keep?: readonly string[]): string {
  return `\`\`\`yaml\n${renderSkeleton(outcomeSchema, keep)}\n\`\`\``;
}

/** The unconditional outcome fields every turn delivers. */
const BASE_OUTCOME_FIELDS = ["status", "summary", "concerns", "forward"];

/**
 * Reporting fields a role's turns deliver beyond the base shape and the one
 * field its expectation gates: the PM routes steers, stalls and plan-check
 * follow-ups, the checker reports a plan check, a standalone review answers
 * the upscope ask.
 */
const ROLE_OUTCOME_FIELDS: Record<string, string[]> = {
  pm: ["steerRoutes", "stallRoutes", "planCheckRoutes"],
  "plan-checker": ["planCheck"],
  reviewer: ["upscope"],
};

/**
 * The repair ask's outcome skeleton: only the fields this turn delivers, so a
 * bare done is never asked for a verdict or decision it cannot give. A review
 * repair keeps the verdict, an architect repair the decision.
 */
export function outcomeRepairSchemaVar(
  role: string,
  expectation: OutcomeExpectation,
): string {
  const delivered = expectationField(expectation);
  return outcomeSchemaVar([
    ...BASE_OUTCOME_FIELDS,
    ...(ROLE_OUTCOME_FIELDS[role] ?? []),
    ...(delivered ? [delivered] : []),
  ]);
}

/** The `task_frontmatter` prompt variable: the fenced frontmatter skeleton. */
export function taskFrontmatterVar(): string {
  return `\`\`\`yaml\n${renderSkeleton(taskFrontmatterSchema)}\n\`\`\``;
}

/**
 * The `flows` prompt variable: configured flow names in config order, the
 * kernel default marked. No configured flows renders `none`, as for gates.
 */
export function flowNamesVar(flows: Record<string, unknown>): string {
  const names = Object.keys(flows);
  if (names.length === 0) return "none";
  return names
    .map((name) => (name === DEFAULT_FLOW ? `${name} (default)` : name))
    .join(", ");
}

/**
 * The `tiers` prompt variable: run-config alias names in config order. `default`
 * is kernel vocabulary for "no tier override", named literally by the prompts.
 */
export function tierNamesVar(
  aliases: Record<string, unknown> | undefined,
): string {
  const names = Object.keys(aliases ?? {});
  return names.length > 0 ? names.join(", ") : "none";
}
