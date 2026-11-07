import { runProcess } from "../proc.js";

export class GitError extends Error {
  constructor(
    public readonly command: string,
    public readonly code: number | null,
    public readonly stderr: string,
    public readonly stdout: string = ""
  ) {
    super(`git ${command} failed with exit code ${code}:\n${stderr}`);
    this.name = "GitError";
  }
}

export interface GitOptions {
  allowFail?: boolean;
  input?: string;
  env?: Record<string, string>;
}

export interface GitResult {
  stdout: string;
  stderr: string;
  code: number;
}

const DEFAULT_FACTORY_IDENTITY: Record<string, string> = {
  GIT_AUTHOR_NAME: "Software Factory",
  GIT_AUTHOR_EMAIL: "factory@local",
  GIT_COMMITTER_NAME: "Software Factory",
  GIT_COMMITTER_EMAIL: "factory@local",
};

const HARDENED_GIT_ENV: Record<string, string> = {
  GIT_TERMINAL_PROMPT: "0",
  GIT_EDITOR: "true",
  GIT_PAGER: "cat",
  PAGER: "cat",
  LC_ALL: "C",
};

/**
 * Checks whether the repo in `cwd` already has user.name and user.email configured.
 */
async function hasRepoIdentity(cwd: string): Promise<boolean> {
  const nameRes = await runProcess({
    cmd: ["git", "config", "--local", "user.name"],
    cwd,
    env: HARDENED_GIT_ENV,
  });
  if (nameRes.code !== 0 || !nameRes.stdout.trim()) {
    return false;
  }

  const emailRes = await runProcess({
    cmd: ["git", "config", "--local", "user.email"],
    cwd,
    env: HARDENED_GIT_ENV,
  });
  return emailRes.code === 0 && Boolean(emailRes.stdout.trim());
}

/**
 * Executes a hardened git command.
 * - Always prepends: -c gc.auto=0 -c core.quotepath=off -c advice.detachedHead=false
 * - Hardened environment: GIT_TERMINAL_PROMPT=0, GIT_EDITOR=true, no pager, LC_ALL=C
 * - Uses factory identity via GIT_AUTHOR / GIT_COMMITTER env if repo has no user.name/email
 * - Trims trailing newline only from stdout
 * - Throws GitError on failure unless allowFail: true
 */
export async function git(
  cwd: string,
  args: string[],
  opts?: GitOptions
): Promise<GitResult> {
  const baseArgs = [
    "-c",
    "gc.auto=0",
    "-c",
    "core.quotepath=off",
    "-c",
    "advice.detachedHead=false",
    ...args,
  ];

  let identityEnv: Record<string, string> = {};
  if (!(await hasRepoIdentity(cwd))) {
    identityEnv = DEFAULT_FACTORY_IDENTITY;
  }

  const mergedEnv: Record<string, string> = {
    ...HARDENED_GIT_ENV,
    ...identityEnv,
    ...(opts?.env ?? {}),
  };

  const res = await runProcess({
    cmd: ["git", ...baseArgs],
    cwd,
    env: mergedEnv,
    stdin: opts?.input,
  });

  const stdout = res.stdout.replace(/\r?\n$/, "");
  const stderr = res.stderr;
  const code = res.code ?? 0;

  if (code !== 0 && !opts?.allowFail) {
    throw new GitError(args.join(" "), code, stderr, stdout);
  }

  return { stdout, stderr, code };
}
