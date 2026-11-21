/** The worktree and containment public surface; the implementation is split under `worktree/`. */

export type { EnsuredWorktree } from "./worktree/types.js";
export {
  BaseFollowConflictError,
  branchExists,
  integrationHead,
  mergeRef,
  prepareIntegrationCheckout,
  removeMergeScratch,
  resetMergeScratch,
  resetWorktreeToCommit,
  taskBranchName,
  treeSha,
} from "./worktree/checkout.js";
export { ensureTaskWorktree, headSha } from "./worktree/task.js";
export {
  containmentSnapshot,
  containmentViolation,
} from "./worktree/containment-checks.js";
