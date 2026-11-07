/**
 * Formats a JSON schema into a compact, human- and LLM-friendly ## Output section
 * stating field names, types, enums, required/optional status, descriptions, and nested structures.
 */
export function formatOutputSchemaSection(schema: Record<string, unknown>): string {
  if (!schema || typeof schema !== "object" || Object.keys(schema).length === 0) {
    return "## Output\n\nYield a valid JSON object.";
  }

  const root = schema;

  function resolveRef(s: any): any {
    if (!s || typeof s !== "object") return s;
    if (typeof s.$ref === "string") {
      const refPath: string = s.$ref;
      if (refPath.startsWith("#/definitions/")) {
        const defKey = refPath.replace("#/definitions/", "");
        const def = (root.definitions as any)?.[defKey];
        if (def) return resolveRef({ ...def, ...s, $ref: undefined });
      } else if (refPath.startsWith("#/$defs/")) {
        const defKey = refPath.replace("#/$defs/", "");
        const def = (root.$defs as any)?.[defKey];
        if (def) return resolveRef({ ...def, ...s, $ref: undefined });
      }
    }
    return s;
  }

  const lines: string[] = ["## Output", "", "Yield a structured JSON object matching this schema:"];

  function getTypeString(s: any): string {
    if (!s) return "any";
    if (s.type === "array") {
      if (s.items) {
        const itemResolved = resolveRef(s.items);
        if (itemResolved.type) {
          return `array of ${itemResolved.type}`;
        }
        return "array of object";
      }
      return "array";
    }
    if (s.type) return String(s.type);
    if (s.enum) return "string";
    if (s.oneOf || s.anyOf) return "object";
    return "any";
  }

  function formatProperty(
    name: string,
    propSchemaRaw: any,
    isRequired: boolean,
    indent: string
  ) {
    const propSchema = resolveRef(propSchemaRaw);
    const typeStr = getTypeString(propSchema);
    const reqStr = isRequired ? "required" : "optional";

    const modifiers: string[] = [typeStr, reqStr];

    if (Array.isArray(propSchema.enum)) {
      modifiers.push(`enum: ${JSON.stringify(propSchema.enum)}`);
    }
    if (typeof propSchema.minimum === "number") {
      modifiers.push(`min: ${propSchema.minimum}`);
    }
    if (typeof propSchema.minItems === "number") {
      modifiers.push(`minItems: ${propSchema.minItems}`);
    }

    let line = `${indent}- ${name} (${modifiers.join(", ")})`;
    if (propSchema.description) {
      line += `: ${propSchema.description}`;
    }
    lines.push(line);

    // If oneOf / anyOf
    if (Array.isArray(propSchema.oneOf) || Array.isArray(propSchema.anyOf)) {
      const variants = propSchema.oneOf ?? propSchema.anyOf;
      for (let i = 0; i < variants.length; i++) {
        const v = resolveRef(variants[i]);
        lines.push(`${indent}  - Option ${i + 1}:`);
        formatProperties(v, `${indent}    `);
      }
      return;
    }

    // If object with properties
    if (propSchema.type === "object" && propSchema.properties) {
      formatProperties(propSchema, `${indent}  `);
    }

    // If array of objects
    if (propSchema.type === "array" && propSchema.items) {
      const itemSchema = resolveRef(propSchema.items);
      if (itemSchema.type === "object" && itemSchema.properties) {
        formatProperties(itemSchema, `${indent}  `);
      } else if (Array.isArray(itemSchema.oneOf) || Array.isArray(itemSchema.anyOf)) {
        const variants = itemSchema.oneOf ?? itemSchema.anyOf;
        for (let i = 0; i < variants.length; i++) {
          const v = resolveRef(variants[i]);
          lines.push(`${indent}  - Option ${i + 1}:`);
          formatProperties(v, `${indent}    `);
        }
      }
    }
  }

  function formatProperties(s: any, indent: string) {
    const properties = s.properties;
    if (!properties || typeof properties !== "object") return;
    const requiredList = Array.isArray(s.required) ? s.required : [];

    for (const [key, val] of Object.entries(properties)) {
      const isReq = requiredList.includes(key);
      formatProperty(key, val, isReq, indent);
    }
  }

  formatProperties(root, "");

  return lines.join("\n");
}
