import { git } from "./exec.js";

/**
 * One entry of `git status --porcelain -z --untracked-files=all`.
 */
export interface StatusEntry {
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
  opts?: { env?: Record<string, string> }
): Promise<StatusEntry[]> {
  const res = await git(wt, ["status", "--porcelain", "-z", "--untracked-files=all"], {
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
 * Returns true when `statusRes` contains any change (non-empty stdout).
 */
export function isStatusDirty(stdout: string): boolean {
  return stdout.length > 0;
}

/**
 * Parses `git worktree list --porcelain` stdout into registered worktree paths.
 */
export function parseWorktreeList(stdout: string): string[] {
  const paths: string[] = [];
  for (const line of stdout.split("\n")) {
    if (line.startsWith("worktree ")) {
      paths.push(line.slice("worktree ".length).trim());
    }
  }
  return paths;
}
