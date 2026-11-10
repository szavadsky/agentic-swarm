export { git, GitError } from "./exec.js";
export type { GitOptions, GitResult } from "./exec.js";

export {
  changedFiles,
  untrackedFiles,
  numstat,
  changedLines,
  matchGlobs,
  diffText,
} from "./diff.js";
export type {
  ChangedFile,
  NumstatEntry,
  ChangedLinesResult,
} from "./diff.js";
export { countUntrackedLines } from "./untracked-lines.js";

export {
  validateSlug,
  assertValidSlug,
  parseBranch,
  taskBranch,
  childBranch,
  worktreePath,
  SLUG_REGEX,
  RESERVED_SLUGS,
} from "./naming.js";
export type { ParsedBranch } from "./naming.js";

export { Repo } from "./repo.js";
export type { RepoOptions } from "./repo.js";

export {
  ensureTaskWorktree,
  ensureChildWorktree,
  removeWorktree,
  resetScratch,
} from "./worktrees.js";

export { commitAll, headOf, isAncestor, areFilesCommitted } from "./commit.js";

export { captureHead, enforceHead } from "./guard.js";
export type { EnforceHeadResult } from "./guard.js";

export {
  mergeParentInto,
  hasConflictMarkers,
  scanConflictMarkers,
  unmergedFiles,
  concludeMerge,
  mergeChildIntoParent,
  treeOf,
} from "./merge.js";

export { repairWorktree } from "./repair.js";

export { porcelainStatus } from "./status.js";
export type { StatusEntry } from "./status.js";
export { isCleanlinessIgnored, findDirtyEntries } from "./cleanliness.js";
export type { CleanlinessOptions } from "./cleanliness.js";
