import fs from "node:fs";
import path from "node:path";
import { untrackedFiles, matchGlobs } from "./diff.js";

const MAX_UNTRAKED_BYTES = 1024 * 1024;

/**
 * Counts full line counts of untracked files matching globs (each file's
 * entire content counts as added). Binary/unreadable/oversize files count 0.
 */
export async function countUntrackedLines(
  wt: string,
  globs: string[]
): Promise<{ added: number; files: string[] }> {
  const untracked = await untrackedFiles(wt);
  let added = 0;
  const files: string[] = [];
  for (const f of untracked) {
    if (!matchGlobs(f.path, globs)) continue;
    files.push(f.path);
    try {
      const abs = path.join(wt, f.path);
      const st = await fs.promises.stat(abs);
      if (!st.isFile() || st.size > MAX_UNTRAKED_BYTES) continue;
      const buf = await fs.promises.readFile(abs);
      if (buf.includes(0)) continue; // binary
      const text = buf.toString("utf8");
      added += text.length === 0 ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
    } catch {
      // Unreadable (deleted between ls-files and read, permissions): count 0.
    }
  }
  return { added, files };
}
