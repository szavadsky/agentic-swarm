import fs from "node:fs";
import path from "node:path";
import { git, GitError } from "./exec.js";
import { porcelainStatus } from "./status.js";
import type { Repo } from "./repo.js";

/**
 * Returns tree SHA of the given revision in the worktree.
 */
export async function treeOf(wt: string, rev: string = "HEAD"): Promise<string> {
  const res = await git(wt, ["rev-parse", `${rev}^{tree}`]);
  return res.stdout.trim();
}

const UNMERGED_CODES = new Set(["UU", "AA", "UD", "DU", "UA", "AU", "DD"]);

/**
 * Returns paths currently unmerged (conflict index codes), via -z status.
 */
export async function unmergedFiles(wt: string): Promise<string[]> {
  const entries = await porcelainStatus(wt);
  const out: string[] = [];
  for (const entry of entries) {
    if (UNMERGED_CODES.has(entry.code)) {
      out.push(entry.path);
    }
  }
  return out.sort();
}

function hasMarkerPair(content: string): boolean {
  let lo = false;
  let hi = false;
  for (const line of content.split("\n")) {
    if (line.startsWith("<<<<<<< ")) lo = true;
    else if (line.startsWith(">>>>>>> ")) hi = true;
    if (lo && hi) return true;
  }
  return false;
}

/**
 * Identifies files that are either unmerged or still contain git conflict markers.
 * Only the unmerged/merge-touched set is scanned, and a file counts as
 * marker-bearing only when it contains BOTH `<<<<<<<` and `>>>>>>>` lines,
 * so legitimate `=======` separator lines never flag a file.
 */
export async function hasConflictMarkers(wt: string): Promise<string[]> {
  const conflictedFiles = new Set<string>();

  for (const f of await unmergedFiles(wt)) {
    conflictedFiles.add(f);
  }
  // Merge-touched set: paths differing between HEAD and MERGE_HEAD.
  const mhRes = await git(wt, ["rev-parse", "-q", "--verify", "MERGE_HEAD"], {
    allowFail: true,
  });
  if (mhRes.code === 0) {
    const diffRes = await git(wt, ["diff", "--name-only", "HEAD", "MERGE_HEAD"], {
      allowFail: true,
    });
    if (diffRes.code === 0) {
      for (const f of diffRes.stdout.split("\n").map((s) => s.trim()).filter(Boolean)) {
        conflictedFiles.add(f);
      }
    }
  }

  const entries = await porcelainStatus(wt);
  const stillUnmerged = new Set(
    entries.filter((e) => UNMERGED_CODES.has(e.code)).map((e) => e.path)
  );

  // Scan only that candidate set for real marker pairs in the worktree files.
  const flagged: string[] = [];
  for (const f of conflictedFiles) {
    if (stillUnmerged.has(f)) {
      flagged.push(f);
      continue;
    }
    try {
      const content = await fs.promises.readFile(path.join(wt, f), "utf8");
      if (hasMarkerPair(content)) {
        flagged.push(f);
      }
    } catch {
      // Unreadable/missing file that is not unmerged: not a conflict.
    }
  }

  return flagged.sort();
}

/**
 * Merges parent branch into child worktree.
 * Leaves conflict state on disk for an integrate step if conflicts occur.
 */
export async function mergeParentInto(
  repo: Repo,
  childWt: string,
  parentBranch: string
): Promise<{ ok: true; sha: string } | { ok: false; conflicts: string[] }> {
  return repo.writeLock.runExclusive(async () => {
    const env = repo.identityEnv();

    const res = await git(childWt, ["merge", "--no-edit", parentBranch], {
      allowFail: true,
      env,
    });

    if (res.code === 0) {
      const shaRes = await git(childWt, ["rev-parse", "HEAD"], { env });
      return { ok: true, sha: shaRes.stdout.trim() };
    }

    const mhRes = await git(
      childWt,
      ["rev-parse", "-q", "--verify", "MERGE_HEAD"],
      { allowFail: true, env }
    );
    const conflicts = await hasConflictMarkers(childWt);

    if (mhRes.code === 0 || conflicts.length > 0) {
      return { ok: false, conflicts };
    }

    throw new GitError(`git merge ${parentBranch}`, res.code, res.stderr, res.stdout);
  });
}

/**
 * Concludes a resolved merge in the child worktree after integration.
 * The integrate agent may not run git writes, so the engine stages the
 * resolution itself: checks the worktree files of the unmerged set for
 * markers, `git add -A`, asserts MERGE_HEAD exists with nothing unmerged,
 * then commits. Throws if markers or unmerged files remain.
 */
export async function concludeMerge(
  repo: Repo,
  childWt: string,
  message: string
): Promise<string> {
  return repo.writeLock.runExclusive(async () => {
    const env = repo.identityEnv();

    // 1. Worktree files of the unmerged set must be marker-free.
    const unmerged = await unmergedFiles(childWt);
    const marked: string[] = [];
    for (const f of unmerged) {
      try {
        const content = await fs.promises.readFile(path.join(childWt, f), "utf8");
        if (hasMarkerPair(content)) {
          marked.push(f);
        }
      } catch {
        // Missing/unreadable while still unmerged: treat as unresolved.
        marked.push(f);
      }
    }
    if (marked.length > 0) {
      throw new Error(
        `Cannot conclude merge: conflict markers or unmerged files remain in ${marked.join(", ")}`
      );
    }

    // 2. Stage the resolution (agent is not allowed git writes).
    await git(childWt, ["add", "-A"], { env });

    // 3. Assert merge state is clean: MERGE_HEAD exists, nothing unmerged.
    const mhRes = await git(childWt, ["rev-parse", "-q", "--verify", "MERGE_HEAD"], {
      allowFail: true,
      env,
    });
    if (mhRes.code !== 0) {
      throw new Error("Cannot conclude merge: no merge in progress (MERGE_HEAD missing)");
    }
    const leftover = await unmergedFiles(childWt);
    if (leftover.length > 0) {
      throw new Error(
        `Cannot conclude merge: conflict markers or unmerged files remain in ${leftover.join(", ")}`
      );
    }

    await git(childWt, ["commit", "-m", message], { env });
    const headRes = await git(childWt, ["rev-parse", "HEAD"], { env });
    return headRes.stdout.trim();
  });
}

/**
 * Merges child branch into parent worktree (--no-ff).
 * Throws GitError on conflict (must not happen after parent merged into child).
 */
export async function mergeChildIntoParent(
  repo: Repo,
  parentWt: string,
  childBranch: string,
  message: string
): Promise<string> {
  return repo.writeLock.runExclusive(async () => {
    const env = repo.identityEnv();

    await git(parentWt, ["merge", "--no-ff", "-m", message, childBranch], { env });
    const headRes = await git(parentWt, ["rev-parse", "HEAD"], { env });
    return headRes.stdout.trim();
  });
}
