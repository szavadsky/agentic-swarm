/** The small JSON-schema surface the prompt renderers walk. */

export interface JsonNode {
  type?: string;
  enum?: unknown[];
  anyOf?: JsonNode[];
  description?: string;
  properties?: Record<string, JsonNode>;
  required?: string[];
  items?: JsonNode;
  $ref?: string;
}

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
