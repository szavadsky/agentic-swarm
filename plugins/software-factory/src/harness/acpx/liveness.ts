/** Liveness of the prompt child process group an acpx session left behind. */

import {
  isChildGroupAlive,
  unregisterChildGroup,
} from "../../core/shutdown.js";
import type { SessionRef } from "../types.js";

/** Whether the prompt child recorded for `session` still has a live group. */
export function promptGroupIsLive(
  activePids: Map<string, number> | undefined,
  session?: SessionRef,
): boolean {
  if (!session) return false;
  const pid = activePids?.get(session.id);
  if (pid === undefined) return false;
  if (isChildGroupAlive(pid)) return true;
  activePids?.delete(session.id);
  unregisterChildGroup(pid);
  return false;
}

/**
 * Polls that group until it exits or `timeoutMs` (when positive) ends. The
 * caller owns the bound and rechecks liveness, so an early return is safe.
 */
export async function waitForPromptGroupExit(
  activePids: Map<string, number> | undefined,
  session?: SessionRef,
  timeoutMs = 0,
): Promise<void> {
  const started = Date.now();
  while (promptGroupIsLive(activePids, session)) {
    if (timeoutMs > 0 && Date.now() - started >= timeoutMs) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
