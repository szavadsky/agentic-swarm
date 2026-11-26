/**
 * The members Linux and macOS share: both use POSIX `kill(2)` semantics and
 * forward-slash repo paths, so only the process table differs.
 */

import path from "node:path";
import type { Os, OsPrimitives } from "./types.js";

/** The errno code a thrown host primitive carries, when any. */
function errorCode(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException | null | undefined)?.code;
}

/**
 * Liveness and group kill. `ESRCH` alone proves absence: `EPERM` means the
 * process exists under another user.
 */
export function signalApi(
  primitives: OsPrimitives,
): Pick<Os, "isProcessAlive" | "isGroupAlive" | "killGroup"> {
  return {
    isProcessAlive: (pid) => {
      if (pid <= 0) return false;
      try {
        primitives.signal(pid, 0);
        return true;
      } catch (err) {
        return errorCode(err) === "EPERM";
      }
    },
    isGroupAlive: (pgid) => {
      if (pgid <= 0) return false;
      try {
        primitives.signal(-pgid, 0);
        return true;
      } catch (err) {
        return errorCode(err) !== "ESRCH";
      }
    },
    killGroup: (pgid, signal) => {
      if (pgid <= 0) return;
      try {
        primitives.signal(-pgid, signal);
        return;
      } catch (err) {
        if (errorCode(err) === "ESRCH") return;
      }
      try {
        primitives.signal(pgid, signal);
      } catch {
        // The leader is gone too, which is the outcome the caller wants.
      }
    },
  };
}

/** Repo paths use `/` on every supported system; native paths use `path.sep`. */
export function pathApi(): Pick<
  Os,
  "repoPath" | "repoPathParts" | "joinRepoPath"
> {
  const repoPath = (native: string): string => native.split(path.sep).join("/");
  return {
    repoPath,
    repoPathParts: (rel) => repoPath(rel).split("/"),
    joinRepoPath: (...parts) => parts.filter((part) => part !== "").join("/"),
  };
}
