export { git, GitError } from "./exec.js";
export type { GitOptions, GitResult } from "./exec.js";

export {
  changedFiles,
  numstat,
  changedLines,
  fileAt,
  matchGlobs,
  diffText,
} from "./diff.js";
export type {
  ChangedFile,
  NumstatEntry,
  ChangedLinesResult,
} from "./diff.js";

export {
  validateSlug,
  assertValidSlug,
  parseBranch,
  branchDepth,
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

export { commitAll, headOf, isAncestor } from "./commit.js";

export { captureHead, enforceHead } from "./guard.js";

export {
  mergeParentInto,
  hasConflictMarkers,
  concludeMerge,
  mergeChildIntoParent,
  treeOf,
} from "./merge.js";

export { repairWorktree } from "./repair.js";
