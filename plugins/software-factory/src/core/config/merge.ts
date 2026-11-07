/**
 * Deeply merges pipeline configuration layers with the following semantics:
 * - Plain objects (maps) are merged recursively.
 * - Arrays are replaced wholesale (never concatenated).
 * - Explicit `null` on an object property deletes that key from the merged result.
 * - Undefined values in later layers are ignored.
 */
export function mergeLayers<T = Record<string, unknown>>(
  ...layers: Array<Record<string, unknown> | null | undefined>
): T {
  let result: Record<string, unknown> = {};

  for (const layer of layers) {
    if (!layer || typeof layer !== "object") continue;
    result = mergeTwoObjects(result, layer);
  }

  return result as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(value instanceof RegExp)
  );
}

function mergeTwoObjects(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const output: Record<string, unknown> = { ...target };

  for (const [key, value] of Object.entries(source)) {
    if (value === null) {
      // Explicit null deletes the key
      delete output[key];
    } else if (value === undefined) {
      // Undefined leaves the existing value intact
      continue;
    } else if (Array.isArray(value)) {
      // Arrays replace wholesale
      output[key] = [...value];
    } else if (isPlainObject(value)) {
      // Plain objects merge recursively
      const existing = output[key];
      if (isPlainObject(existing)) {
        output[key] = mergeTwoObjects(existing, value);
      } else {
        // Source is object, target is not: clean copy without nulls
        output[key] = mergeTwoObjects({}, value);
      }
    } else {
      // Primitives overwrite
      output[key] = value;
    }
  }

  return output;
}
