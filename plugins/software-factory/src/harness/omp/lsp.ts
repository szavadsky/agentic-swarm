import fs from "node:fs";
import path from "node:path";
import { git } from "../../core/git/exec.js";
import { writeTextAtomic } from "../../core/records/io.js";

/**
 * Where a turn's cwd receives the artifact LSP config. Hidden and
 * lower-precedence than a user's `.omp/lsp.json`, so an operator config keeps
 * winning and both merge; omp reads LSP config from the session cwd only.
 */
export function turnLspConfigPath(cwd: string): string {
  return path.join(cwd, ".omp", ".lsp.json");
}

/**
 * Locally ignores the installed config. It is harness plumbing, not repository
 * content: keeping it ignored leaves `git status` clean for containment and
 * lets the merge queue's `clean -fd` preserve it. One line in the clone's
 * `.git/info/exclude` (worktrees share it), written once.
 */
async function ignoreInstalledConfig(cwd: string): Promise<void> {
  const resolved = await git(cwd, ["rev-parse", "--git-path", "info/exclude"], {
    allowFail: true,
  });
  if (resolved.code !== 0) return;
  const file = path.resolve(cwd, resolved.stdout.trim());
  const entry = ".omp/.lsp.json";
  let content = "";
  try {
    content = await fs.promises.readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  if (content.split(/\r?\n/).includes(entry)) return;
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.appendFile(
    file,
    `${content && !content.endsWith("\n") ? "\n" : ""}${entry}\n`,
    "utf8",
  );
}

/**
 * Installs the canonical config into a turn's cwd. The copy is byte-identical
 * and points at absolute schema paths, so a task worktree and the goal checkout
 * share one config. A missing source is an error: a turn must not run
 * half-configured.
 */
export async function installLspConfig(
  cwd: string,
  configPath: string,
): Promise<string> {
  const target = turnLspConfigPath(cwd);
  const tracked = await git(
    cwd,
    ["ls-files", "--error-unmatch", "--", ".omp/.lsp.json"],
    { allowFail: true },
  );
  if (tracked.code === 0) {
    throw new Error(
      `${path.join(cwd, ".omp/.lsp.json")} is tracked: the artifact LSP config would overwrite repository content; untrack it or move it aside`,
    );
  }
  const content = await fs.promises.readFile(configPath, "utf8");
  await ignoreInstalledConfig(cwd);
  try {
    if ((await fs.promises.readFile(target, "utf8")) === content) return target;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  await writeTextAtomic(target, content);
  return target;
}
