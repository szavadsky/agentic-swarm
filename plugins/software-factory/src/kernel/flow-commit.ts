/**
 * The step's mechanical commit, its park cause, and the clean-tree test the
 * base advance reads before it merges.
 */
import { commitAll } from "../core/git/commit.js";
import { git } from "../core/git/exec.js";
import { makeCause } from "./cause.js";
import { commitEdits, scriptMeta } from "./record.js";
import type { Cause, KernelRuntime, RecordEnd } from "./types.js";
import { headSha, treeSha } from "./worktree.js";

/**
 * Mechanical commit, recorded with its tree for no-progress history. The
 * record opens before the commit so its timestamps stamp the run itself, and
 * carries the diff stats as the turn's work.
 */
export async function commitStep(
  runtime: KernelRuntime,
  meta: { iteration: number; slug: string; round: number },
  cwd: string,
  message: string,
): Promise<RecordEnd> {
  const turn = await runtime.store.startRecord(
    scriptMeta(meta.iteration, "commit", meta),
  );
  const started = Date.parse(turn.meta.startedAt);
  const sha = await commitAll(runtime.repo, cwd, message);
  const commit = await headSha(cwd);
  const tree = await treeSha(cwd);
  const edits = await commitEdits(cwd, sha);
  const wallMs = Number.isFinite(started)
    ? Math.max(0, Date.now() - started)
    : 0;
  await turn.finish({ ok: true, commit, tree, edits, wallMs });
  return { commit, tree, edits };
}

export function parkCause(
  status: "blocked" | "failed" | "upscope",
  summary: string | undefined,
): Cause {
  return makeCause(status, summary ?? "no summary");
}

/** A tree with no tracked edits and no merge in flight; untracked files count as dirty. */
export async function worktreeClean(cwd: string): Promise<boolean> {
  const status = await git(cwd, ["status", "--porcelain"], { allowFail: true });
  return status.code === 0 && status.stdout.trim() === "";
}
