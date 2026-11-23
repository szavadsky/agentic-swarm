import { git } from "./exec.js";

/**
 * One entry of `git status --porcelain -z --untracked-files=all`.
 */
interface StatusEntry {
  /** Two-letter porcelain code, e.g. " M", "??", "UU", "R ". */
  code: string;
  /** Repo-relative path (rename target for R/C entries). */
  path: string;
  /** Rename source for R/C entries. */
  from?: string;
}

/**
 * Runs `git status --porcelain -z --untracked-files=all` and parses the
 * NUL-separated output. Unlike the default mode this lists every untracked
 * file individually (never a collapsed folder entry), and -z avoids all
 * quoting/whitespace pitfalls. Rename entries arrive as
 * `R  new\0old\0` pairs.
 */
export async function porcelainStatus(
  wt: string,
  opts?: { env?: Record<string, string>; pathspec?: string },
): Promise<StatusEntry[]> {
  const args = ["status", "--porcelain", "-z", "--untracked-files=all"];
  if (opts?.pathspec) args.push("--", opts.pathspec);
  const res = await git(wt, args, {
    allowFail: true,
    env: opts?.env,
  });
  if (res.code !== 0 || !res.stdout) return [];

  const tokens = res.stdout.split("\0");
  const entries: StatusEntry[] = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token === undefined || token === "") {
      i++;
      continue;
    }
    // Each entry starts with a 2-char status code, a space, then the path.
    const code = token.slice(0, 2);
    const entryPath = token.slice(3);
    if (code[0] === "R" || code[0] === "C") {
      // Rename/copy: next token is the source path.
      const from = tokens[i + 1] ?? "";
      entries.push({ code, path: entryPath, from });
      i += 2;
    } else {
      entries.push({ code, path: entryPath });
      i++;
    }
  }
  return entries;
}

/**
 * One entry of `git worktree list --porcelain`.
 */
export interface WorktreeEntry {
  path: string;
  /** Full ref as git prints it, e.g. `refs/heads/main`. */
  branch?: string;
  detached?: boolean;
}

/**
 * Returns the value after `key ` on the first matching line of a
 * `git worktree list --porcelain` block, or `undefined` when absent.
 */
function field(block: string, key: string): string | undefined {
  const prefix = `${key} `;
  for (const line of block.split("\n")) {
    if (line.startsWith(prefix)) return line.slice(prefix.length);
  }
}

/**
 * Parses `git worktree list --porcelain` stdout into registered worktree entries.
 */
export function parseWorktreeEntries(stdout: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  for (const block of stdout.split("\n\n")) {
    const path = field(block, "worktree");
    if (path === undefined) continue;
    const entry: WorktreeEntry = { path };
    const branch = field(block, "branch");
    if (branch !== undefined) entry.branch = branch;
    if (block.split("\n").includes("detached")) entry.detached = true;
    entries.push(entry);
  }
  return entries;
}

/**
 * Parses `git worktree list --porcelain` stdout into registered worktree paths.
 */
export function parseWorktreeList(stdout: string): string[] {
  return parseWorktreeEntries(stdout).map((entry) => entry.path);
}
