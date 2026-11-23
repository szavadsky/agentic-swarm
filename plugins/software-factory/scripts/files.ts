/** Filesystem walking shared by the lint checks. */

import fs from "node:fs";
import path from "node:path";

/** Every matching file under `dir`, recursively and in stable order. */
export function walkFiles(
  dir: string,
  match: (file: string) => boolean,
): string[] {
  if (!fs.existsSync(dir)) return [];
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".git") {
        found.push(...walkFiles(full, match));
      }
    } else if (match(full)) {
      found.push(full);
    }
  }
  return found.sort();
}
