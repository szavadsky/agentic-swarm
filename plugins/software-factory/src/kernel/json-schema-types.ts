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
