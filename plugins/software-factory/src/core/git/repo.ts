import path from "node:path";
import { AsyncMutex, KeyedMutex } from "../mutex.js";

export interface RepoOptions {
  mainRoot: string;
  worktreeRoot: string;
  identity?: {
    name: string;
    email: string;
  };
}

/**
 * One Repo instance per main repository.
 * All git writes MUST go through writeLock (held per command/commit only).
 * Merge sequence across parent task branches uses mergeLocks keyed by parent branch.
 */
export class Repo {
  readonly mainRoot: string;
  readonly worktreeRoot: string;
  readonly identity?: { name: string; email: string };
  readonly writeLock: AsyncMutex;
  readonly mergeLocks: KeyedMutex;

  constructor(opts: RepoOptions) {
    this.mainRoot = path.resolve(opts.mainRoot);
    this.worktreeRoot = path.resolve(opts.worktreeRoot);
    this.identity = opts.identity;
    this.writeLock = new AsyncMutex();
    this.mergeLocks = new KeyedMutex();
  }
}
