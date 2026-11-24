import { z } from "zod";
import { expectationField, type OutcomeExpectation } from "./outcome.js";
import { qaOutcomeSchema } from "./qa.js";
import { taskFrontmatterSchema } from "./tasks.js";
import {
  type Outcome,
  outcomeSchema,
  type TaskTypeDefinition,
} from "./types.js";

/**
 * Prompt variables rendered from kernel schemas and config, supplied as
 * renderer defaults so turn code never passes them. Schemas render through
 * `z.toJSONSchema` — the same zod schemas the validators use, so a field the
 * skeleton drops is a renderer bug the tests catch, never prompt drift.
 */

interface JsonNode {
  type?: string;
  enum?: unknown[];
  anyOf?: JsonNode[];
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

/** A local `$ref` resolved against the schema's definitions. */
function resolveNode(node: JsonNode, defs: Record<string, JsonNode>): JsonNode {
  if (!node.$ref?.startsWith("#/$defs/")) return node;
  const target = defs[node.$ref.slice("#/$defs/".length)];
  if (!target) throw new Error(`unresolvable schema ref ${node.$ref}`);
  return resolveNode(target, defs);
}

function inlineUnion(node: JsonNode, defs: Record<string, JsonNode>): string {
  return (node.anyOf ?? [])
    .map((branch) => inlineSchema(branch, defs))
    .join(" | ");
}

function inlineArray(node: JsonNode, defs: Record<string, JsonNode>): string {
  const item = resolveNode(node.items!, defs);
  if (item.type === "object" && item.properties) {
    return `[${inlineSchema(item, defs)}]`;
  }
  if (item.enum) return `[${item.enum.map(String).join(" | ")}]`;
  return item.description ? `[${oneLine(item.description)}]` : "[]";
}

function inlineObject(node: JsonNode, defs: Record<string, JsonNode>): string {
  const required = new Set(node.required ?? []);
  const parts = Object.entries(node.properties ?? {}).map(([key, value]) => {
    const sub = resolveNode(value, defs);
    const name = required.has(key) ? key : `${key}?`;
    return sub.type === "array" && sub.items
      ? `${name}: ${inlineSchema(sub, defs)}`
      : name;
  });
  return `{${parts.join(", ")}}`;
}

/** One schema node rendered inline: enum, union, array, object or scalar. */
function inlineSchema(raw: JsonNode, defs: Record<string, JsonNode>): string {
  const node = resolveNode(raw, defs);
  if (node.enum) return node.enum.map(String).join(" | ");
  if (node.anyOf) return inlineUnion(node, defs);
  if (node.type === "array" && node.items) return inlineArray(node, defs);
  if (node.type === "object" && node.properties) {
    return inlineObject(node, defs);
  }
  return node.description
    ? oneLine(node.description)
    : scalarFallback(node.type);
}

function unionEnumNotes(
  node: JsonNode,
  path: string,
  defs: Record<string, JsonNode>,
): string[] {
  const parts: string[] = [];
  const nested: string[] = [];
  for (const branch of node.anyOf ?? []) {
    const sub = resolveNode(branch, defs);
    if (sub.enum) parts.push(sub.enum.map(String).join(" | "));
    else if (sub.type === "object" && sub.properties) {
      parts.push(`{${Object.keys(sub.properties).join(", ")}}`);
    } else nested.push(...enumNotes(sub, path, defs));
  }
  if (parts.length > 0) {
    nested.unshift(path ? `${path}: ${parts.join(" | ")}` : parts.join(" | "));
  }
  return nested;
}

function objectEnumNotes(
  node: JsonNode,
  path: string,
  defs: Record<string, JsonNode>,
): string[] {
  const notes: string[] = [];
  for (const [key, value] of Object.entries(node.properties ?? {})) {
    const sub = resolveNode(value, defs);
    const at = path ? `${path}.${key}` : key;
    if (sub.enum) notes.push(`${at}: ${sub.enum.map(String).join(" | ")}`);
    else notes.push(...enumNotes(sub, at, defs));
  }
  return notes;
}

/** Nested enum values, collected as `path: a | b` notes for the line comment. */
function enumNotes(
  raw: JsonNode,
  path: string,
  defs: Record<string, JsonNode>,
): string[] {
  const node = resolveNode(raw, defs);
  if (node.anyOf) return unionEnumNotes(node, path, defs);
  if (node.type === "array" && node.items) {
    return enumNotes(node.items, path, defs);
  }
  if (node.type === "object" && node.properties) {
    return objectEnumNotes(node, path, defs);
  }
  return [];
}

/** One top-level field's skeleton line, with its optional/enum comments. */
function skeletonLine(
  key: string,
  value: JsonNode,
  required: ReadonlySet<string>,
  defs: Record<string, JsonNode>,
): string {
  const node = resolveNode(value, defs);
  const comments: string[] = [];
  if (!required.has(key)) comments.push("optional");
  let rendered: string;
  if (node.enum) {
    rendered = node.enum.map(String).join(" | ");
    if (node.description) comments.push(oneLine(node.description));
  } else if (node.type === "array" || node.type === "object") {
    rendered = inlineSchema(node, defs);
    if (node.description) comments.push(oneLine(node.description));
  } else {
    rendered = node.description
      ? oneLine(node.description)
      : scalarFallback(node.type);
  }
  comments.push(...enumNotes(node, "", defs));
  return comments.length > 0
    ? `${key}: ${rendered}  # ${comments.join("; ")}`
    : `${key}: ${rendered}`;
}

/**
 * Fields whose value is the agent's own prose. The skeleton shows them as a
 * YAML block scalar, and a field that holds one renders block-style so the
 * nested leaf fits: an unquoted colon in prose breaks the YAML.
 */
const FREE_TEXT_FIELDS: ReadonlySet<string> = new Set(["summary", "reply"]);

function isFreeText(key: string, node: JsonNode): boolean {
  return FREE_TEXT_FIELDS.has(key) && node.type === "string";
}

/** Whether a field's nested leaves include a free-text one. */
function holdsFreeText(raw: JsonNode, defs: Record<string, JsonNode>): boolean {
  const node = resolveNode(raw, defs);
  if (node.type === "array" && node.items) {
    return holdsFreeText(node.items, defs);
  }
  if (node.type === "object" && node.properties) {
    return Object.entries(node.properties).some(
      ([key, value]) =>
        isFreeText(key, resolveNode(value, defs)) || holdsFreeText(value, defs),
    );
  }
  return false;
}

/** A free-text leaf: `key: |` and its description or placeholder, under `lead`. */
function blockScalarLines(key: string, node: JsonNode, lead: string): string[] {
  const body = node.description
    ? oneLine(node.description)
    : scalarFallback(node.type);
  return [`${lead}${key}: |`, `${lead}  ${body}`];
}

/** One nested property inside a block-rendered field, already indented. */
function blockEntryLines(
  key: string,
  raw: JsonNode,
  required: ReadonlySet<string>,
  lead: string,
  defs: Record<string, JsonNode>,
): string[] {
  const node = resolveNode(raw, defs);
  if (isFreeText(key, node)) return blockScalarLines(key, node, lead);
  if (holdsFreeText(node, defs)) {
    throw new Error(`skeleton cannot nest free text under ${key}`);
  }
  return [`${lead}${skeletonLine(key, node, required, defs)}`];
}

/**
 * A field whose nested leaves hold free text: its commented key line, then one
 * indented line per nested key, a sequence item under `- `.
 */
function blockFieldLines(
  key: string,
  node: JsonNode,
  required: ReadonlySet<string>,
  defs: Record<string, JsonNode>,
): string[] {
  const comments: string[] = [];
  if (!required.has(key)) comments.push("optional");
  if (node.description) comments.push(oneLine(node.description));
  comments.push(...enumNotes(node, "", defs));
  const item =
    node.type === "array" && node.items ? resolveNode(node.items, defs) : node;
  const bullet = node.type === "array" ? "- " : "";
  const itemRequired = new Set(item.required ?? []);
  const nested = Object.entries(item.properties ?? {}).flatMap(
    ([child, value], index) => {
      const lead =
        index === 0 ? `  ${bullet}` : `  ${" ".repeat(bullet.length)}`;
      return blockEntryLines(child, value, itemRequired, lead, defs);
    },
  );
  const marker = comments.length > 0 ? `  # ${comments.join("; ")}` : "";
  return [`${key}:${marker}`, ...nested];
}

/**
 * One renderer from a kernel object schema to the YAML skeleton prompts show:
 * one `key: value` line per field in declaration order, enums joined with
 * `|`, nested objects inlined as `{keys}` / `[{keys}]`, and a `#` comment
 * with the optional marker, the field description, and nested enum values.
 * Free text renders as a block scalar, and the field holding it renders its
 * nested keys block-style. A `keep` list narrows the rendering to those
 * top-level fields, in schema order.
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
  const required = new Set(root.required ?? []);
  return Object.entries(root.properties)
    .filter(([key]) => keep === undefined || keep.includes(key))
    .map(([key, value]) => {
      const node = resolveNode(value, defs);
      if (isFreeText(key, node)) {
        return blockScalarLines(key, node, "").join("\n");
      }
      if (holdsFreeText(node, defs)) {
        return blockFieldLines(key, node, required, defs).join("\n");
      }
      return skeletonLine(key, value, required, defs);
    })
    .join("\n");
}

/**
 * Parse-only outcome fields: old records still carry them, so the parser keeps
 * them, but no prompt asks an agent to write one.
 */
const LEGACY_OUTCOME_FIELDS: readonly string[] = ["forward"];

/** Every field the skeleton may ask for: the schema's own fields minus the legacy ones. */
function writtenFields(schema: z.ZodType<Outcome>): string[] {
  const json = z.toJSONSchema(schema) as {
    properties?: Record<string, unknown>;
  };
  return Object.keys(json.properties ?? {}).filter(
    (key) => !LEGACY_OUTCOME_FIELDS.includes(key),
  );
}

/** The `outcome_schema` prompt variable: the fenced outcome skeleton block. */
export function outcomeSchemaVar(
  keep?: readonly string[],
  schema: z.ZodType<Outcome> = outcomeSchema,
): string {
  return `\`\`\`yaml\n${renderSkeleton(schema, keep ?? writtenFields(schema))}\n\`\`\``;
}

/** The fields a QA turn writes: the kernel shape plus its own report. */
export const QA_OUTCOME_FIELDS = [
  "status",
  "summary",
  "concerns",
  "qa",
] as const;

/**
 * The `outcome_schema` variable for a QA turn. The QA turn's repair ask uses
 * the same schema through `outcomeRepairSchemaVar`; the task type's schema
 * stays the shape every other step delivers.
 */
export function qaOutcomeSchemaVar(): string {
  return outcomeSchemaVar(QA_OUTCOME_FIELDS, qaOutcomeSchema);
}

/** The unconditional outcome fields every turn delivers. */
const BASE_OUTCOME_FIELDS = [
  "status",
  "summary",
  "concerns",
  "steerAnswers",
  "debtClosed",
];

/**
 * Reporting fields a prompt's turns deliver beyond the base shape and the one
 * field its expectation gates: the PM routes steers, stalls and plan-check
 * follow-ups, the checker reports a plan check, a standalone review answers
 * the upscope ask.
 */
const PROMPT_OUTCOME_FIELDS: Record<string, string[]> = {
  architect: ["planReviewMarks", "intentStatus"],
  "architect-review-return": ["planReviewMarks"],
  implementer: ["replies"],
  pm: ["steerRoutes", "stallRoutes", "planCheckRoutes"],
  "plan-checker": ["planCheck"],
  "review-architect": ["planReview"],
  reviewer: ["upscope"],
};

/**
 * The repair ask's outcome skeleton: only the fields this turn delivers, so a
 * bare done is never asked for a verdict or decision it cannot give. A review
 * repair keeps the verdict, an architect repair the decision.
 */
export function outcomeRepairSchemaVar(
  prompt: string,
  expectation: OutcomeExpectation,
  schema: z.ZodType<Outcome> = outcomeSchema,
): string {
  const delivered = expectationField(expectation);
  return outcomeSchemaVar(
    [
      ...BASE_OUTCOME_FIELDS,
      ...(PROMPT_OUTCOME_FIELDS[prompt] ?? []),
      ...(delivered ? [delivered] : []),
    ],
    schema,
  );
}

/**
 * What a prompt author writes: a type is required and owns flow/kind, so the
 * legacy fields stay out of the skeleton even though the parser still reads
 * them from old files.
 */
const authoredTaskFrontmatterSchema = taskFrontmatterSchema
  .omit({ kind: true, flow: true })
  .extend({
    type: z
      .string()
      .min(1)
      .describe(
        "one of the configured task types; it supplies flow, kind and schema",
      ),
  });

/** The `task_frontmatter` prompt variable: the fenced frontmatter skeleton. */
export function taskFrontmatterVar(): string {
  return `\`\`\`yaml\n${renderSkeleton(authoredTaskFrontmatterSchema)}\n\`\`\``;
}

/**
 * The `task_types` prompt variable: configured type names in config order with
 * the flow, kind and output schema each supplies.
 */
export function taskTypesVar(
  taskTypes: Record<string, TaskTypeDefinition> | undefined,
): string {
  const entries = Object.entries(taskTypes ?? {});
  if (entries.length === 0) return "none";
  return entries
    .map(
      ([name, definition]) =>
        `${name} (flow: ${definition.flow}, kind: ${definition.kind}, schema: ${definition.schema})`,
    )
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
