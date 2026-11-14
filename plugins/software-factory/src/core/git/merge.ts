import fs from "node:fs";
import path from "node:path";
import { git } from "./exec.js";
import { porcelainStatus } from "./status.js";

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
