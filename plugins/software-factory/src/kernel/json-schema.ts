import type { JsonNode } from "./json-schema-types.js";

export type { JsonNode } from "./json-schema-types.js";

/** A local `$ref` resolved against the schema's definitions. */
export function resolveNode(
  node: JsonNode,
  defs: Record<string, JsonNode>,
): JsonNode {
  if (!node.$ref?.startsWith("#/$defs/")) return node;
  const target = defs[node.$ref.slice("#/$defs/".length)];
  if (!target) throw new Error(`unresolvable schema ref ${node.$ref}`);
  return resolveNode(target, defs);
}
