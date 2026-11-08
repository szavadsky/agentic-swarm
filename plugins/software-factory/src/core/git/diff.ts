import { git } from "./exec.js";

export interface ChangedFile {
  path: string;
  status: string; // "A" | "M" | "D" | "R" | ...
  from?: string;
  /** Rename/copy similarity score (0-100) parsed from R100/R087/Cxx; undefined otherwise. */
  similarity?: number;
}

export interface NumstatEntry {
  path: string;
  added: number;
  deleted: number;
  from?: string;
}

export interface ChangedLinesResult {
  added: number;
  deleted: number;
  total: number;
  files: string[];
}

/**
 * Matches a repo-relative path against an array of glob patterns using Bun.Glob.
 */
export function matchGlobs(filePath: string, globs: string[]): boolean {
  if (!globs || globs.length === 0) return false;
  const normalized = filePath.replace(/\\/g, "/");

  for (const pattern of globs) {
    let globPattern = pattern.replace(/\\/g, "/");
    // If pattern ends with '/', treat as directory glob 'pattern/**'
    if (globPattern.endsWith("/")) {
      globPattern = `${globPattern}**`;
    }
    const matcher = new Bun.Glob(globPattern);
    if (matcher.match(normalized)) {
      return true;
    }
  }

  return false;
}

/**
 * Returns untracked files (excluding ignored) as ChangedFile entries with status "?".
 * Uses `git ls-files --others --exclude-standard -z` for NUL-safe parsing.
 */
export async function untrackedFiles(wt: string): Promise<ChangedFile[]> {
  const res = await git(wt, ["ls-files", "--others", "--exclude-standard", "-z"], {
    allowFail: true,
  });
  if (res.code !== 0 || !res.stdout) return [];
  return res.stdout
    .split("\0")
    .filter((p) => p.length > 0)
    .map((p) => ({ path: p, status: "?" }));
}

/**
 * Returns changed files between base and head with detected renames.
 */
export async function changedFiles(
  wt: string,
  base: string,
  head?: string
): Promise<ChangedFile[]> {
  const args = ["diff", "--name-status", "-M", base];
  if (head) args.push(head);

  const res = await git(wt, args);
  if (!res.stdout.trim()) return [];

  const lines = res.stdout.split("\n");
  const result: ChangedFile[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const rawStatus = parts[0] ?? "";
    const statusCode = rawStatus.charAt(0);

    if (statusCode === "R" || statusCode === "C") {
      // Rename or Copy: rawStatus is e.g. R100, parts[1] is old path, parts[2] is new path
      const from = parts[1];
      const targetPath = parts[2] ?? from ?? "";
      const parsed = parseInt(rawStatus.slice(1), 10);
      result.push({
        path: targetPath,
        status: statusCode,
        from,
        ...(Number.isFinite(parsed) ? { similarity: parsed } : {}),
      });
    } else {
      const targetPath = parts[1] ?? "";
      result.push({
        path: targetPath,
        status: statusCode,
      });
    }
  }

  return result;
}

/**
 * Parses git diff --numstat -M with rename awareness and binary safety.
 */
export async function numstat(
  wt: string,
  base: string,
  head?: string
): Promise<NumstatEntry[]> {
  const args = ["diff", "-z", "--numstat", "-M", base];
  if (head) args.push(head);

  const res = await git(wt, args);
  if (!res.stdout) return [];

  const raw = res.stdout;
  const entries: NumstatEntry[] = [];

  // With -z, entries are separated by null bytes
  // Standard entry: added\tdeleted\tpath\0
  // Rename entry: added\tdeleted\t\0from\0to\0
  const tokens = raw.split("\0");
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i];
    if (token === undefined || token === "") {
      i++;
      continue;
    }

    const tabParts = token.split("\t");
    if (tabParts.length < 3) {
      i++;
      continue;
    }

    const addedRaw = tabParts[0]!;
    const deletedRaw = tabParts[1]!;
    const rest = tabParts.slice(2).join("\t");

    const added = addedRaw === "-" ? 0 : parseInt(addedRaw, 10) || 0;
    const deleted = deletedRaw === "-" ? 0 : parseInt(deletedRaw, 10) || 0;

    if (rest === "") {
      // Rename entry: next two tokens are from and to
      const from = tokens[i + 1] ?? "";
      const to = tokens[i + 2] ?? "";
      entries.push({
        path: to,
        added,
        deleted,
        from,
      });
      i += 3;
    } else {
      entries.push({
        path: rest,
        added,
        deleted,
      });
      i++;
    }
  }

  return entries;
}

/**
 * Computes changed lines across files matching specified globs.
 */
export async function changedLines(
  wt: string,
  base: string,
  head: string | undefined,
  globs: string[]
): Promise<ChangedLinesResult> {
  const stats = await numstat(wt, base, head);
  let added = 0;
  let deleted = 0;
  const files: string[] = [];

  for (const entry of stats) {
    if (matchGlobs(entry.path, globs)) {
      added += entry.added;
      deleted += entry.deleted;
      files.push(entry.path);
    }
  }

  return {
    added,
    deleted,
    total: added + deleted,
    files,
  };
}

/**
 * Returns raw diff text.
 */
export async function diffText(
  wt: string,
  base: string,
  head?: string,
  paths?: string[]
): Promise<string> {
  const args = ["diff", base];
  if (head) args.push(head);
  if (paths && paths.length > 0) {
    args.push("--", ...paths);
  }

  const res = await git(wt, args);
  return res.stdout;
}
