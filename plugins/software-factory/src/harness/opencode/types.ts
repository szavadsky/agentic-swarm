import type { RetryPolicy } from "../fallback.js";
import type { OpencodeApi } from "./api.js";

export interface OpencodeHarnessOptions {
  binary?: string;
  /** Caller-given session store; exported transcripts live here, never in a worktree. */
  sessionDir: string;
  retry?: Partial<RetryPolicy>;
}

/** Process/filesystem plumbing shared by `turn` and `compact`. */
export interface OpencodeRuntime {
  binary: string;
  sessionDir: string;
  api: OpencodeApi;
}
