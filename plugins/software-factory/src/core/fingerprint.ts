import { createHash } from "node:crypto";

/**
 * Normalizes text for loop detection:
 * - Trims outer whitespace
 * - Standardizes line endings to '\n'
 * - Collapses consecutive whitespace to a single space
 * - Lowercases by default for robust semantic comparison
 */
function normalizeText(
  text: string,
  options: { lowercase?: boolean } = {},
): string {
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
export function fingerprintText(
  text: string,
  options?: { lowercase?: boolean },
): string {
  const norm = normalizeText(text, options);
  return createHash("sha1").update(norm, "utf8").digest("hex");
}
