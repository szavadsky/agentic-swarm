import fs from "node:fs";
import path from "node:path";

let activeFactoryTmpDir: string | undefined;

export function getFactoryTmpDir(): string | undefined {
  return activeFactoryTmpDir ?? process.env.TMPDIR;
}

export interface RuntimeTmpHandle {
  tmpDir: string;
  restore: () => void;
}

/**
 * Initializes {worktreeRoot}/.factory-runtime/tmp/ at run start:
 * - Creates the directory on disk.
 * - Purges entries inside that directory older than runStartTime.
 * - Sets activeFactoryTmpDir and environment variables (TMPDIR, TMP, TEMP)
 *   so every child process (omp turns, gates, checks, git) inherits them.
 * - Returns a handle with restore() to revert environment when run ends.
 */
export function initFactoryRuntimeTmp(
  worktreeRoot: string,
  runStartTime: number = Date.now()
): RuntimeTmpHandle {
  const tmpDir = path.join(path.resolve(worktreeRoot), ".factory-runtime", "tmp");
  fs.mkdirSync(tmpDir, { recursive: true });

  // Purge entries older than the current run at start (only inside tmpDir)
  try {
    const entries = fs.readdirSync(tmpDir);
    for (const entry of entries) {
      const entryPath = path.join(tmpDir, entry);
      try {
        const stat = fs.statSync(entryPath);
        if (stat.mtimeMs < runStartTime) {
          fs.rmSync(entryPath, { recursive: true, force: true });
        }
      } catch {
        // ignore errors reading or deleting individual entries
      }
    }
  } catch {
    // ignore
  }

  const prevTmpDir = process.env.TMPDIR;
  const prevTmp = process.env.TMP;
  const prevTemp = process.env.TEMP;
  const prevActive = activeFactoryTmpDir;

  activeFactoryTmpDir = tmpDir;
  process.env.TMPDIR = tmpDir;
  process.env.TMP = tmpDir;
  process.env.TEMP = tmpDir;

  return {
    tmpDir,
    restore() {
      activeFactoryTmpDir = prevActive;
      if (prevTmpDir !== undefined) process.env.TMPDIR = prevTmpDir;
      else delete process.env.TMPDIR;
      if (prevTmp !== undefined) process.env.TMP = prevTmp;
      else delete process.env.TMP;
      if (prevTemp !== undefined) process.env.TEMP = prevTemp;
      else delete process.env.TEMP;
    },
  };
}
