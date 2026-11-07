import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

export interface TmpRepo {
  dir: string;
  worktrees: string[];
  writeFile(relPath: string, content: string): void;
  readFile(relPath: string): string;
  commit(message: string, paths?: string[]): string;
  createBranch(branchName: string, startPoint?: string): void;
  createWorktree(branchName: string, wtPath?: string): string;
  git(args: string[], opts?: { allowFail?: boolean; env?: Record<string, string>; cwd?: string }): {
    stdout: string;
    stderr: string;
    code: number;
  };
  cleanup(): void;
}

const DEFAULT_ENV: Record<string, string> = {
  GIT_AUTHOR_NAME: "Factory Test",
  GIT_AUTHOR_EMAIL: "test@factory.local",
  GIT_COMMITTER_NAME: "Factory Test",
  GIT_COMMITTER_EMAIL: "test@factory.local",
  GIT_TERMINAL_PROMPT: "0",
  GIT_CONFIG_NOSYSTEM: "1",
  LC_ALL: "C",
};

export function createTmpRepo(options?: { initialCommitMessage?: string }): TmpRepo {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-test-repo-"));
  const worktrees: string[] = [];

  function runGit(
    args: string[],
    opts: { cwd?: string; allowFail?: boolean; env?: Record<string, string> } = {}
  ): { stdout: string; stderr: string; code: number } {
    const cwd = opts.cwd ?? dir;
    const env = { ...process.env, ...DEFAULT_ENV, ...(opts.env ?? {}) };

    try {
      const stdout = execFileSync("git", args, {
        cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        encoding: "utf8",
      });
      return { stdout: stdout.trimEnd(), stderr: "", code: 0 };
    } catch (err: any) {
      if (!opts.allowFail) {
        throw new Error(
          `git ${args.join(" ")} failed in ${cwd}: ${err.stderr || err.message}`
        );
      }
      return {
        stdout: (err.stdout ?? "").toString().trimEnd(),
        stderr: (err.stderr ?? "").toString().trimEnd(),
        code: err.status ?? 1,
      };
    }
  }

  // Initialize repo on branch main
  runGit(["init", "-b", "main"]);
  runGit(["config", "user.name", "Factory Test"]);
  runGit(["config", "user.email", "test@factory.local"]);

  // Create initial commit
  fs.writeFileSync(path.join(dir, "README.md"), "# Test Repository\n", "utf8");
  runGit(["add", "README.md"]);
  runGit(["commit", "-m", options?.initialCommitMessage ?? "Initial commit"]);

  const repo: TmpRepo = {
    dir,
    worktrees,

    writeFile(relPath: string, content: string): void {
      const fullPath = path.resolve(dir, relPath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content, "utf8");
    },

    readFile(relPath: string): string {
      return fs.readFileSync(path.resolve(dir, relPath), "utf8");
    },

    commit(message: string, paths?: string[]): string {
      if (paths && paths.length > 0) {
        runGit(["add", "--", ...paths]);
      } else {
        runGit(["add", "-A"]);
      }
      runGit(["commit", "-m", message]);
      const { stdout } = runGit(["rev-parse", "HEAD"]);
      return stdout.trim();
    },

    createBranch(branchName: string, startPoint?: string): void {
      const args = ["branch", branchName];
      if (startPoint) args.push(startPoint);
      runGit(args);
    },

    createWorktree(branchName: string, wtPath?: string): string {
      const targetPath =
        wtPath ?? fs.mkdtempSync(path.join(os.tmpdir(), "factory-test-wt-"));
      // Ensure branch exists or create it with -B
      runGit(["worktree", "add", "-B", branchName, targetPath, "HEAD"]);
      worktrees.push(targetPath);
      return targetPath;
    },

    git(args: string[], opts?: { allowFail?: boolean; env?: Record<string, string>; cwd?: string }) {
      return runGit(args, opts);
    },

    cleanup(): void {
      for (const wt of worktrees) {
        try {
          runGit(["worktree", "remove", "--force", wt], { allowFail: true });
        } catch {}
        try {
          fs.rmSync(wt, { recursive: true, force: true });
        } catch {}
      }
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {}
    },
  };

  return repo;
}
