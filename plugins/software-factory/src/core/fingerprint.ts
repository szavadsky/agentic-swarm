import { createHash } from "node:crypto";

/**
 * Normalizes text for loop detection:
 * - Trims outer whitespace
 * - Standardizes line endings to '\n'
 * - Collapses consecutive whitespace to a single space
 * - Lowercases by default for robust semantic comparison
 */
export function normalizeText(text: string, options: { lowercase?: boolean } = {}): string {
  if (!text) return "";
  let norm = text.replace(/\r\n/g, "\n");
  norm = norm.replace(/\s+/g, " ").trim();
  if (options.lowercase ?? true) {
    norm = norm.toLowerCase();
  }
  return norm;
}

/**
 * Computes sha1 hex fingerprint of normalized text.
 */
export function fingerprintText(text: string, options?: { lowercase?: boolean }): string {
  const norm = normalizeText(text, options);
  return createHash("sha1").update(norm, "utf8").digest("hex");
}

/**
 * Computes sha1 hex fingerprint of an arbitrary structured object
 * by sorting object keys recursively before JSON stringification.
 */
export function fingerprintObject(obj: unknown): string {
  const canonical = canonicalJsonStringify(obj);
  return createHash("sha1").update(canonical, "utf8").digest("hex");
}

function canonicalJsonStringify(val: unknown): string {
  if (val === null || typeof val !== "object") {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return "[" + val.map(canonicalJsonStringify).join(",") + "]";
  }
  const obj = val as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const entries = sortedKeys.map(
    (k) => `${JSON.stringify(k)}:${canonicalJsonStringify(obj[k])}`
  );
  return "{" + entries.join(",") + "}";
}
