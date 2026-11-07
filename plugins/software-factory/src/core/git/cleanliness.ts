import type { StatusEntry } from "./status.js";

export interface CleanlinessOptions {
  orchestrationFolder: string;
  currentIntentPath?: string;
}

function escapeRegex(str: string): string {
  let out = "";
  for (let i = 0; i < str.length; i++) {
    const ch = str[i]!;
    if ("\\^$.*+?()[]{}|".includes(ch)) {
      out += "\\" + ch;
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * Checks whether a single git porcelain status entry should be ignored
 * during first-run repository cleanliness checks (§7).
 *
 * Rules:
 * 1. If currentIntentPath is provided, exact match against current intent is ignored.
 * 2. Untracked files (code === "??") matching the exact pattern
 *    `{orchestrationFolder}/<task>/INTENT.md` are ignored.
 */
export function isCleanlinessIgnored(
  entry: StatusEntry,
  opts: CleanlinessOptions
): boolean {
  const normPath = entry.path.replace(/\\/g, "/").replace(/^\.\//, "");

  // 1. Current task's intent file is always allowed
  if (opts.currentIntentPath) {
    const normCurrent = opts.currentIntentPath.replace(/\\/g, "/").replace(/^\.\//, "");
    if (normPath === normCurrent) {
      return true;
    }
  }

  // 2. Untracked {orchestrationFolder}/*/INTENT.md files are ignored
  const isUntracked = entry.code.trim() === "??";
  if (isUntracked) {
    const normFolder = opts.orchestrationFolder
      .replace(/\\/g, "/")
      .replace(/^\/+|\/+$/g, "");
    const escaped = escapeRegex(normFolder);
    const regex = new RegExp("^" + escaped + "/[^/]+/INTENT\\.md$");
    if (regex.test(normPath)) {
      return true;
    }
  }

  return false;
}

/**
 * Returns any porcelain status entries that violate first-run cleanliness.
 */
export function findDirtyEntries(
  entries: StatusEntry[],
  opts: CleanlinessOptions
): StatusEntry[] {
  return entries.filter((entry) => !isCleanlinessIgnored(entry, opts));
}
